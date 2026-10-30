// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// The PS4 host (OpenOrbis): display, controller and the frame loop. The engine draws every pixel on the CPU, so
// each changed frame goes straight to a VideoOut buffer with no GPU: the PS4's OpenGL ES library needs shaders
// compiled ahead of time, and the console has no compiler for them.

#include "actions.hpp"
#include "app_pack.hpp"
#include "damage_tracker.hpp"
#include "frame_stats.hpp"
#include "host_api.hpp"
#include "image_loader.hpp"
#include "js_heap.hpp"
#include "network.hpp"
#include "ps4_log.hpp"
#include "ps4_platform.hpp"
#include "render_workers.hpp"
#include "text_shaper.hpp"
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <csignal>
#include <iterator>
#include <string>
#include <utility>
#include <vector>
#include <time.h>
#include <unistd.h>

extern "C" {
#include "er_perf.h"
#include "er_runtime.h"
#include "er_scene.h"
#include "native_renderer.h"
#include "software_backend.h"
void er_register_assets(void);
// The app's bundle (tools/build_ps4.py), NUL-terminated as QuickJS's parser wants.
extern const char ps4_react_bundle[];
extern const unsigned ps4_react_bundle_size;
void ps4_crash_install(int fd);
}
#include <orbis/Pad.h>
#include <orbis/SystemService.h>
#include <orbis/UserService.h>
#include <orbis/VideoOut.h>
#include <orbis/libkernel.h>

namespace {
constexpr int kWidth = 1920, kHeight = 1080;
constexpr std::size_t kFrameBytes = std::size_t(kWidth) * kHeight * 4;
constexpr std::size_t kVideoAlign = 0x200000;
constexpr std::size_t kBufferBytes = (kFrameBytes + kVideoAlign - 1) / kVideoAlign * kVideoAlign;

std::int64_t now_us() {
  timespec ts{};
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return std::int64_t(ts.tv_sec) * 1000000 + ts.tv_nsec / 1000;
}
std::uint32_t perf_clock() { return static_cast<std::uint32_t>(now_us()); }

// Collects the script heap in idle frames and keeps QuickJS's threshold under the heap limit (js_heap.hpp): without
// it a game page ran out of memory instead of collecting.
GcScheduler gc_scheduler(now_us);

// Flexible memory the process may still map: the C library's heap grows into it. The toolchain declares the call with
// a size where libkernel takes a pointer to one.
std::size_t flexible_free() {
  std::size_t bytes = 0;
  sceKernelAvailableFlexibleMemorySize(reinterpret_cast<std::size_t>(&bytes));
  return bytes;
}
double flexible_free_mib() { return flexible_free() / 1048576.0; }

// The images' gauge of memory pressure (image_loader.hpp): of the flexible memory free at launch, how much is taken.
// It trims the image cache at 70% and holds back decodes at 85%. Read at most every quarter second.
std::size_t flexible_at_launch = 0;
images::Heap heap_gauge() {
  static std::atomic<std::int64_t> read_at{0};
  static std::atomic<std::size_t> free_now{0};
  const std::int64_t now = now_us();
  if (now - read_at.load() > 250000) {
    free_now = flexible_free();
    read_at = now;
  }
  images::Heap heap;
  heap.size = flexible_at_launch;
  heap.live = flexible_at_launch > free_now.load() ? flexible_at_launch - free_now.load() : 0;
  return heap;
}

// Set when the script heap reports "out of memory": the frame loop then logs what held the memory, since QuickJS says
// the same for its own limit and for an allocation the system refused.
bool memory_report = false;

void report_memory() {
  JSMemoryUsage usage{};
  JS_ComputeMemoryUsage(JS_GetRuntime(er_runtime_context()), &usage);
  ps4_log::write("[PS4-REACT] memory: script %.1f MiB (QuickJS %.1f of %.1f MiB), refused %zu bytes, flexible free %.1f MiB",
                 js_heap_live() / 1048576.0, usage.malloc_size / 1048576.0, usage.malloc_limit / 1048576.0,
                 js_heap_take_failure(), flexible_free_mib());
}

// Two scan-out buffers in write-combined direct memory, flipped on the vertical sync.
struct Screen {
  int handle = -1;
  OrbisKernelEqueue flips = 0;
  void* memory = nullptr;
  off_t offset = 0;
  void* buffers[2] = {};
  int back = 0;
  std::int64_t flip_id = 0;

  bool open() {
    handle = sceVideoOutOpen(ORBIS_VIDEO_USER_MAIN, ORBIS_VIDEO_OUT_BUS_MAIN, 0, nullptr);
    if (handle < 0) return ps4_log::fail("sceVideoOutOpen", handle);
    if (int rc = sceKernelCreateEqueue(&flips, "jl flips"); rc < 0) return ps4_log::fail("sceKernelCreateEqueue", rc);
    sceVideoOutAddFlipEvent(flips, handle, nullptr);
    const std::size_t size = 2 * kBufferBytes;
    if (int rc = sceKernelAllocateDirectMemory(0, sceKernelGetDirectMemorySize(), size, kVideoAlign, 3, &offset); rc < 0)
      return ps4_log::fail("sceKernelAllocateDirectMemory", rc);
    if (int rc = sceKernelMapDirectMemory(&memory, size, 0x33, 0, offset, kVideoAlign); rc < 0)
      return ps4_log::fail("sceKernelMapDirectMemory", rc);
    for (int i = 0; i < 2; ++i) {
      buffers[i] = static_cast<char*>(memory) + i * kBufferBytes;
      std::memset(buffers[i], 0, kFrameBytes);
    }
    OrbisVideoOutBufferAttribute attribute{};
    // 0x80000000: A8R8G8B8 sRGB, the engine's own pixel layout; tiling 1 is linear.
    sceVideoOutSetBufferAttribute(&attribute, 0x80000000, 1, 0, kWidth, kHeight, kWidth);
    if (int rc = sceVideoOutRegisterBuffers(handle, 0, buffers, 2, &attribute); rc < 0)
      return ps4_log::fail("sceVideoOutRegisterBuffers", rc);
    sceVideoOutSetFlipRate(handle, 0);
    return true;
  }

  // Copies the rows [top, bottom) that changed into the back buffer and flips to it. The back buffer last had the
  // frame before the previous one, so the previous frame's rows go too (the whole 8 MiB took 2.7 ms).
  int last_top = 0, last_bottom = kHeight;
  void present(const std::uint32_t* pixels, int top, int bottom) {
    const int from = std::min(top, last_top), to = std::max(bottom, last_bottom);
    const std::size_t row = std::size_t(kWidth) * 4;
    std::memcpy(static_cast<char*>(buffers[back]) + from * row, reinterpret_cast<const char*>(pixels) + from * row,
                (to - from) * row);
    last_top = top;
    last_bottom = bottom;
    sceVideoOutSubmitFlip(handle, back, ORBIS_VIDEO_OUT_FLIP_VSYNC, ++flip_id);
    back ^= 1;
  }

  // Waits until the flip submitted last is on screen, so the next frame writes the buffer that isn't.
  void wait_flip() {
    while (sceVideoOutIsFlipPending(handle) > 0) {
      OrbisKernelEvent event{};
      int count = 0;
      if (sceKernelWaitEqueue(flips, &event, 1, &count, nullptr) != 0) return;
    }
  }
};

// The DualShock 4: the state the runtime polls, and the presses it hears as actions (directions repeat).
struct Controller {
  int handle = -1;
  std::uint32_t held = 0;
  const char* repeating = nullptr;
  std::int64_t next_repeat = 0;
  bool l2_down = false, r2_down = false;

  bool open(int user) {
    if (int rc = scePadInit(); rc < 0) return ps4_log::fail("scePadInit", rc);
    handle = scePadOpen(user, 0, 0, nullptr);
    if (handle < 0) return ps4_log::fail("scePadOpen", handle);
    ps4_platform::set_pad(handle);
    return true;
  }

  static float stick(std::uint8_t raw) {
    constexpr float deadzone = 0.16f;
    const float value = std::clamp((raw - 128) / 127.0f, -1.0f, 1.0f);
    if (std::abs(value) < deadzone) return 0;
    return std::copysign((std::abs(value) - deadzone) / (1 - deadzone), value);
  }

  // Indexes follow kButtonNames: up, down, left, right, cross, circle, triangle, square, l1, r1, l2, r2, l3,
  // r3, options, touchpad.
  static constexpr std::uint32_t kBits[] = {
    ORBIS_PAD_BUTTON_UP, ORBIS_PAD_BUTTON_DOWN, ORBIS_PAD_BUTTON_LEFT, ORBIS_PAD_BUTTON_RIGHT, ORBIS_PAD_BUTTON_CROSS,
    ORBIS_PAD_BUTTON_CIRCLE, ORBIS_PAD_BUTTON_TRIANGLE, ORBIS_PAD_BUTTON_SQUARE, ORBIS_PAD_BUTTON_L1, ORBIS_PAD_BUTTON_R1,
    ORBIS_PAD_BUTTON_L2, ORBIS_PAD_BUTTON_R2, ORBIS_PAD_BUTTON_L3, ORBIS_PAD_BUTTON_R3, ORBIS_PAD_BUTTON_OPTIONS,
    ORBIS_PAD_BUTTON_TOUCH_PAD,
  };
  static constexpr std::pair<std::uint32_t, HostAction> kActions[] = {
    {ORBIS_PAD_BUTTON_UP, HostAction::up}, {ORBIS_PAD_BUTTON_DOWN, HostAction::down},
    {ORBIS_PAD_BUTTON_LEFT, HostAction::left}, {ORBIS_PAD_BUTTON_RIGHT, HostAction::right},
    {ORBIS_PAD_BUTTON_CROSS, HostAction::confirm}, {ORBIS_PAD_BUTTON_CIRCLE, HostAction::back},
    {ORBIS_PAD_BUTTON_L1, HostAction::l1}, {ORBIS_PAD_BUTTON_R1, HostAction::r1},
    {ORBIS_PAD_BUTTON_TRIANGLE, HostAction::triangle}, {ORBIS_PAD_BUTTON_SQUARE, HostAction::square},
    {ORBIS_PAD_BUTTON_OPTIONS, HostAction::options},
  };

  // Reads the pad; `act` hears each action pressed this frame, and a held direction again every 110 ms
  // after a 350 ms pause.
  template <typename Act> GamepadState read(std::int64_t now, Act act) {
    GamepadState state;
    OrbisPadData data{};
    if (handle < 0 || scePadReadState(handle, &data) != 0 || !data.connected) {
      held = 0;
      repeating = nullptr;
      return state;
    }
    state.connected = true;
    state.left_x = stick(data.leftStick.x);
    state.left_y = stick(data.leftStick.y);
    state.right_x = stick(data.rightStick.x);
    state.right_y = stick(data.rightStick.y);
    state.l2 = data.analogButtons.l2 / 255.0f;
    state.r2 = data.analogButtons.r2 / 255.0f;
    for (std::uint32_t i = 0; i < std::size(kBits); ++i)
      if (data.buttons & kBits[i]) state.buttons |= 1u << i;
    const std::uint32_t pressed = data.buttons & ~held;
    held = data.buttons;
    for (const auto& [bit, action] : kActions) {
      if (!(pressed & bit)) continue;
      act(action_name(action));
      if (repeats(action)) {
        repeating = action_name(action);
        next_repeat = now + 350000;
      }
    }
    // Triggers act once as they cross half way, as on the PS5.
    const auto crossed = [](bool& down, float travel) {
      const bool was = down;
      down = travel > (was ? 0.4f : 0.5f);
      return down && !was;
    };
    if (crossed(l2_down, state.l2)) act(action_name(HostAction::l2));
    if (crossed(r2_down, state.r2)) act(action_name(HostAction::r2));
    if (repeating) {
      bool still = false;
      for (const auto& [bit, action] : kActions)
        if (action_name(action) == repeating) still = data.buttons & bit;
      if (!still) repeating = nullptr;
      else if (now >= next_repeat) {
        next_repeat = now + 110000;
        act(repeating);
      }
    }
    return state;
  }
};

bool call_global(const char* name, const char* argument) {
  JSContext* ctx = er_runtime_context();
  JSValue global = JS_GetGlobalObject(ctx);
  JSValue fn = JS_GetPropertyStr(ctx, global, name);
  JSValue arg = JS_NewString(ctx, argument);
  JSValue result = JS_Call(ctx, fn, global, 1, &arg);
  const bool ok = !JS_IsException(result);
  if (!ok) {
    JSValue error = JS_GetException(ctx);
    const char* message = JS_ToCString(ctx, error);
    ps4_log::write("[PS4-REACT] %s failed: %s", name, message ? message : "JS exception");
    if (message) JS_FreeCString(ctx, message);
    JS_FreeValue(ctx, error);
  }
  JS_FreeValue(ctx, result);
  JS_FreeValue(ctx, arg);
  JS_FreeValue(ctx, fn);
  JS_FreeValue(ctx, global);
  return ok;
}

} // namespace

int main() {
  ps4_log::write("[PS4-REACT] start");
  ps4_crash_install(ps4_log::fd());
  // What the C and C++ libraries print just before they end the app (a failed check, libc++'s reason for
  // terminating) goes to the log as well.
  if (ps4_log::fd() >= 0) dup2(ps4_log::fd(), STDERR_FILENO);
  ps4_log::write("[PS4-REACT] flexible memory free %.1f MiB", flexible_free_mib());
  // A write to a socket the far end closed raises SIGPIPE, which would end the app; nothing here wants it.
  signal(SIGPIPE, SIG_IGN);
  if (!ps4_platform::prepare_storage()) ps4_log::write("[PS4-REACT] data folder not made under %s", ps4_platform::data_root());
  app_pack::open(ps4_platform::data_root());
  sceSystemServiceHideSplashScreen();
  sceUserServiceInitialize(nullptr);
  int user = -1;
  sceUserServiceGetInitialUser(&user);
  ps4_log::write("[PS4-REACT] step: screen");
  Screen screen;
  if (!screen.open()) return 1;
  ps4_log::write("[PS4-REACT] step: controller");
  Controller controller;
  controller.open(user);
  er_perf_set_clock(perf_clock);
  if (!er_software_backend_init(kWidth, kHeight) || !damage_tracker_install(kWidth, kHeight)) {
    ps4_log::write("[PS4-REACT] engine backend failed");
    return 1;
  }
  er_set_layers_enabled(false); // no GPU to draw <Image layer> images: the engine rasterizes them
  // The cores this app may run on: musl's sysconf answers 1 on the PS4. Threads inherit the main thread's set.
  std::uint64_t cores = 0;
  scePthreadGetaffinity(scePthreadSelf(), &cores);
  const int cpus = std::max(1, __builtin_popcountll(cores));
  const int workers = render_workers::start(cpus);
  ps4_log::write("[PS4-REACT] render workers=%d of %d, cpus=%d (cores 0x%llx)", workers, render_workers::max_workers(), cpus,
                 static_cast<unsigned long long>(cores));
  // A failure to start is kept and given to each request, which the app logs.
  ps4_log::write("[PS4-REACT] step: network");
  const bool online = network::start();
  // The PS5's image cache is 64 MiB; the PS4 has far less memory to share.
  flexible_at_launch = flexible_free();
  images::set_cache_bytes(32 * 1024 * 1024);
  images::set_heap_probe(heap_gauge);
  if (online) ps5_react_start_images();
  ps4_log::write("[PS4-REACT] network=%d %s, flexible memory free %.1f MiB", online, network::version(), flexible_free_mib());
  ps5_react_start_sound();
  ErRuntimeConfig cfg = {};
  cfg.screen_width = kWidth;
  cfg.screen_height = kHeight;
  cfg.screen_scale = 2; // as on the PS5, which draws the same 1920x1080 layout
  cfg.memory_limit = kJsMemoryLimit;
  cfg.malloc_functions = js_heap_functions();
  cfg.max_stack_size = 1024 * 1024;
  cfg.log = [](const char* line) {
    ps4_log::write("[PS4-REACT] js: %s", line);
    if (std::strstr(line, "out of memory")) memory_report = true;
  };
  cfg.install_host_globals = ps5_react_install_host_api;
  if (!er_runtime_init(&cfg)) {
    ps4_log::write("[PS4-REACT] runtime failed");
    return 1;
  }
  er_runtime_set_wall_clock(static_cast<std::int64_t>(time(nullptr)) * 1000);
  ps4_log::write("[PS4-REACT] step: assets and fonts");
  er_register_assets();
  text_shaper::install("/app0/fonts", [](const char* line) { ps4_log::write("[PS4-REACT] %s", line); });
  const std::int64_t load_start = now_us();
  ps4_log::write("[PS4-REACT] step: bundle");
  // A test build of the app's code sent over FTP to <data>/dev/app.bundle.js runs in place of the built-in one, so
  // a change to the app's script needs no reinstall (its images and fonts stay the installed package's).
  const std::string dev_bundle = std::string(ps4_platform::data_root()) + "/dev/app.bundle.js";
  std::vector<char> source;
  if (std::FILE* file = std::fopen(dev_bundle.c_str(), "rb")) {
    char chunk[65536];
    for (std::size_t count; (count = std::fread(chunk, 1, sizeof chunk, file)) > 0;) source.insert(source.end(), chunk, chunk + count);
    std::fclose(file);
    ps4_log::write("[PS4-REACT] test bundle %s (%zu bytes)", dev_bundle.c_str(), source.size());
  }
  const bool test = !source.empty();
  const std::size_t length = test ? source.size() : ps4_react_bundle_size;
  source.push_back('\0'); // QuickJS's parser reads one byte past the end
  if (!er_runtime_load_source(test ? source.data() : ps4_react_bundle, length, "app.bundle.js")) {
    ps4_log::write("[PS4-REACT] bundle failed: %s", er_runtime_last_error());
    er_runtime_show_error();
  }
  ps4_log::write("[PS4-REACT] bundle ran in %lldms", static_cast<long long>((now_us() - load_start) / 1000));
  ps5_react_set_refresh_rate(60);

  // The PS5's frame log: every two seconds a summary (input, script and layout, the copy, the wait, and the engine's
  // own js/layout/raster split), and a line for each frame over two vertical syncs.
  FrameStats stats;
  std::int64_t previous = now_us(), ticked = previous, memory_logged = previous;
  double tick_carry_ms = 0;
  int frame_failures = 0;
  std::int64_t failure_logged = -5000000;
  bool first = true;
  for (;;) {
    const std::int64_t start = now_us();
    if (const char* line = stats.start_frame(start)) ps4_log::write("[PS4-REACT] %s", line);
    er_set_raster_deferred(true);
    const GamepadState state = controller.read(start, [](const char* action) {
      gc_scheduler.input(now_us());
      call_global("__ps5ReactDispatch", action);
    });
    ps5_react_set_gamepad(state);
    stats.lap(FrameStats::input, now_us());
    er_perf_phase_begin(ER_PERF_PHASE_JS);
    er_runtime_pump();
    // A failing frame callback fails every frame: it is logged once per five seconds, with the count, since a line
    // a frame to the log file on the hard drive slowed the whole app.
    if (!ps5_react_frame(er_runtime_context(), std::min(50.0, (start - previous) / 1000.0)) && ++frame_failures &&
        start - failure_logged >= 5000000) {
      ps4_log::write("[PS4-REACT] frame callback failed (%d times): %s", frame_failures, er_runtime_last_error());
      failure_logged = start;
      frame_failures = 0;
    }
    previous = start;
    er_perf_phase_end(ER_PERF_PHASE_JS);
    er_set_raster_deferred(false);
    er_commit();
    stats.lap(FrameStats::update, now_us());
    if (ps5_react_exit_requested()) break;
    const std::int64_t drawn = now_us();
    // The rows the engine changed: what it repainted, and where what it moved (a scroll) landed.
    int top = first ? 0 : kHeight, bottom = first ? kHeight : 0;
    for (const ERRect& rect : damage_tracker_rects()) {
      top = std::min(top, rect.y);
      bottom = std::max(bottom, rect.y + rect.h);
    }
    for (const DamageMove& move : damage_tracker_moves()) {
      top = std::min(top, move.src.y + move.dy);
      bottom = std::max(bottom, move.src.y + move.dy + move.src.h);
    }
    top = std::clamp(top, 0, kHeight);
    bottom = std::clamp(bottom, 0, kHeight);
    const bool changed = top < bottom;
    if (changed) screen.present(er_software_framebuffer(), top, bottom);
    const std::size_t repainted = damage_tracker_area();
    damage_tracker_clear();
    first = false;
    const std::int64_t copied = now_us();
    if (changed) stats.note_present(static_cast<std::uint32_t>(copied - drawn), 0, std::uint64_t(bottom - top) * kWidth * 4);
    stats.lap(FrameStats::present, copied);
    // A changed frame waits for its flip (the vertical sync); an unchanged one sleeps out the 60 Hz frame.
    if (changed) screen.wait_flip();
    else if (const std::int64_t left = start + 16667 - now_us(); left > 0) usleep(static_cast<useconds_t>(left));
    stats.lap(FrameStats::swap, now_us());
    if (const char* line = gc_scheduler.frame(JS_GetRuntime(er_runtime_context()), now_us(), repainted,
                                              std::size_t(kWidth) * kHeight))
      ps4_log::write("[PS4-REACT] %s", line);
    if (std::exchange(memory_report, false)) report_memory();
    if (const std::int64_t at = now_us(); at - memory_logged >= 10000000) {
      memory_logged = at;
      const images::Memory image = images::memory();
      ps4_log::write("[PS4-REACT] memory: flexible free %.1f MiB, script %.1f MiB, images %zu+%zu MiB", flexible_free_mib(),
                     js_heap_live() / 1048576.0, image.encoded >> 20, image.decoded >> 20);
    }
    // The engine's clock (timers, engine animations) moves by the time the frame took, in whole milliseconds with
    // the remainder carried, as on the PS5: without it no timer fires and the launch animation never moves.
    const std::int64_t ended = now_us();
    tick_carry_ms += std::min(50.0, (ended - ticked) / 1000.0);
    ticked = ended;
    const auto tick_ms = static_cast<std::uint32_t>(tick_carry_ms);
    tick_carry_ms -= tick_ms;
    embedded_renderer_tick(tick_ms);
    if (const char* line = stats.end_frame(33000)) ps4_log::write("[PS4-REACT] %s", line);
  }
  ps4_log::write("[PS4-REACT] exit");
  ps5_react_stop_images();
  er_runtime_shutdown();
  network::stop();
  text_shaper::shutdown();
  ps5_react_stop_sound();
  render_workers::stop();
  er_software_backend_destroy();
  sceSystemServiceLoadExec("exit", nullptr);
  return 0;
}
