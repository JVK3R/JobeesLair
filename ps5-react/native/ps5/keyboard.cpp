// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// ABI v24 on the PS5 (keyboard.hpp): the system keyboard, libSceImeDialog. The system draws it over the app
// and owns the controller while it is up; the host follows it once a frame (tick) and reads what was typed
// when it finishes. The module is loaded through the system module service before filesystem elevation, as the
// hardware video decoder is (video_decoder.cpp), and its functions are linked from the SDK's stub: in a title,
// dlopen("libSceImeDialog.sprx") did not load it on a PS5 (2026-10-27). A load that fails only leaves
// `available()` false; nothing is called before it succeeds.
// The parameter layout is the one the public PS5 Payload SDK's own example uses (ps5-payload-dev/offact,
// IME_dialog.c), the same as the PS4's; text is UTF-16 (the SDK's wchar_t is 16 bits). Every call's result is
// logged, as hardware evidence for docs/HARDWARE.md.
#include "keyboard.hpp"
#include "async_log.hpp"
#include <cstddef>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>

extern "C" {
int sceUserServiceGetForegroundUser(int* user);
int sceSysmoduleLoadModule(std::uint16_t id);
int sceImeDialogInit(const void* param, const void* extended);
int sceImeDialogGetStatus();
int sceImeDialogGetResult(void* result);
int sceImeDialogTerm();
int sceImeDialogAbort();
}

namespace {
enum : int { kStatusNone = 0, kStatusRunning = 1, kStatusFinished = 2 };
enum : int { kEndOk = 0, kEndCancelled = 1, kEndAborted = 2 };
enum : std::uint32_t { kOptionMultiline = 1, kOptionPassword = 4 };
enum : int { kAlignCenter = 1 };

struct ImeParam {
  std::int32_t user_id;
  std::int32_t type;
  std::uint64_t supported_languages; // 0: every language the player has set up
  std::int32_t enter_label;
  std::int32_t input_method;
  void* filter;
  std::uint32_t option;
  std::uint32_t max_text_length;
  char16_t* input_text_buffer;
  float posx, posy; // 1920x1080 coordinates
  std::int32_t horizontal_alignment, vertical_alignment;
  const char16_t* placeholder;
  const char16_t* title;
  std::int8_t reserved[16];
};
static_assert(sizeof(ImeParam) == 96 && offsetof(ImeParam, input_text_buffer) == 40 && offsetof(ImeParam, title) == 72);

struct ImeResult {
  std::int32_t end_status;
  std::int8_t reserved[12];
};

// libSceImeDialog's id in the system module table (the PS4's, which the PS5 keeps: libSceVideodec2 is 0xCF in both).
constexpr std::uint16_t kImeDialogModule = 0x96;
// The load's result: 0 once loaded, else the system's error. Asked once.
bool tried = false;
int module_state = -1;

void resolve() {
  if (tried) return;
  tried = true;
  module_state = sceSysmoduleLoadModule(kImeDialogModule);
  async_log::write("[PS5-REACT] keyboard: sceSysmoduleLoadModule(libSceImeDialog)=0x%08x, system keyboard %s",
                   static_cast<unsigned>(module_state), module_state == 0 ? "ready" : "unavailable");
}

// Everything the system reads while the keyboard is up lives here until it is terminated.
ImeParam param;
char16_t title[keyboard::kMaxLabel + 1], placeholder[keyboard::kMaxLabel + 1];
char16_t buffer[keyboard::kMaxLength + 1];
bool showing = false;
// When the keyboard last said it was running (or was opened): one that reports neither running nor finished for
// kGoneAfter is gone (the system took it away), and the app gets its controller back.
std::chrono::steady_clock::time_point seen_running;
constexpr auto kGoneAfter = std::chrono::seconds(2);
keyboard::Outcome outcome = keyboard::Outcome::kNone;
std::string typed;

void copy_label(const std::string& from, char16_t* to) {
  const std::u16string text = keyboard::utf16(from, keyboard::kMaxLabel);
  std::memcpy(to, text.data(), text.size() * sizeof(char16_t));
  to[text.size()] = 0;
}

void finish(keyboard::Outcome how, const char* why, int code) {
  const int term = sceImeDialogTerm();
  async_log::write("[PS5-REACT] keyboard: closed (%s 0x%08x), sceImeDialogTerm=0x%08x", why, static_cast<unsigned>(code),
                   static_cast<unsigned>(term));
  showing = false;
  outcome = how;
}
} // namespace

namespace keyboard {
void preload() { resolve(); }

bool available() {
  resolve();
  return module_state == 0;
}

bool open(const Options& options, std::string& error) {
  if (!available()) {
    error = "the system keyboard is not available on this console";
    return false;
  }
  if (showing) {
    error = "a keyboard is already open";
    return false;
  }
  int user = -1;
  if (sceUserServiceGetForegroundUser(&user) != 0 || user < 0) {
    error = "no user is signed in to type";
    return false;
  }
  std::memset(&param, 0, sizeof param);
  copy_label(options.title, title);
  copy_label(options.placeholder, placeholder);
  const std::u16string text = utf16(options.text, options.max_length);
  std::memset(buffer, 0, sizeof buffer);
  std::memcpy(buffer, text.data(), text.size() * sizeof(char16_t));
  param.user_id = user;
  param.type = static_cast<std::int32_t>(options.type);
  param.enter_label = static_cast<std::int32_t>(options.enter);
  param.option = (options.multiline ? kOptionMultiline : 0) | (options.password ? kOptionPassword : 0);
  param.max_text_length = options.max_length;
  param.input_text_buffer = buffer;
  param.posx = 960.0f;
  param.posy = 540.0f;
  param.horizontal_alignment = kAlignCenter;
  param.vertical_alignment = kAlignCenter;
  param.placeholder = placeholder;
  param.title = title;
  const int result = sceImeDialogInit(&param, nullptr);
  async_log::write("[PS5-REACT] keyboard: sceImeDialogInit type=%d enter=%d max=%u -> 0x%08x", param.type, param.enter_label,
                   param.max_text_length, static_cast<unsigned>(result));
  if (result != 0) {
    char code[48];
    std::snprintf(code, sizeof code, "the system refused it (0x%08x)", static_cast<unsigned>(result));
    error = code;
    return false;
  }
  showing = true;
  seen_running = std::chrono::steady_clock::now();
  outcome = Outcome::kNone;
  typed.clear();
  return true;
}

bool is_open() { return showing; }

void tick() {
  if (!showing) return;
  const int status = sceImeDialogGetStatus();
  if (status == kStatusRunning) {
    seen_running = std::chrono::steady_clock::now();
    return;
  }
  if (status != kStatusFinished) {
    // Not running yet, or gone without finishing (or an error): after a moment, nothing typed counts.
    if (std::chrono::steady_clock::now() - seen_running < kGoneAfter) return;
    return finish(Outcome::kAborted, "status", status);
  }
  ImeResult result{};
  const int got = sceImeDialogGetResult(&result);
  if (got != 0) return finish(Outcome::kAborted, "result", got);
  if (result.end_status == kEndOk) {
    std::size_t length = 0;
    while (length < kMaxLength && buffer[length]) ++length;
    typed = utf8(std::u16string(buffer, length));
  }
  finish(result.end_status == kEndOk ? Outcome::kDone : result.end_status == kEndCancelled ? Outcome::kCancelled
                                                                                            : Outcome::kAborted,
         "end", result.end_status);
}

Outcome take(std::string& text) {
  if (showing) return Outcome::kNone;
  const Outcome out = outcome;
  outcome = Outcome::kNone;
  text = out == Outcome::kDone ? std::move(typed) : std::string();
  typed.clear();
  return out;
}

void close() {
  if (!showing) return;
  const int result = sceImeDialogAbort();
  async_log::write("[PS5-REACT] keyboard: sceImeDialogAbort=0x%08x", static_cast<unsigned>(result));
}
} // namespace keyboard
