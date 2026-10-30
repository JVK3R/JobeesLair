// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// The PS4's side of the host functions (host_api.hpp). What the PS4 can't do yet says so: relaunching, updates
// and payloads (no payload loader is assumed on the PS4), sound, notifications and links.

#include "app_pack.hpp"
#include "host_api.hpp"
#include "ps4_log.hpp"
#include "ps4_platform.hpp"
#include <algorithm>
#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <dirent.h>
#include <fcntl.h>
#include <unistd.h>
#include <string>
#include <utility>
#include <sys/stat.h>
#include <orbis/Pad.h>
#include <orbis/UserService.h>

// libkernel's fstatfs fills FreeBSD's struct statfs (version 0x20030518, 472 bytes); the toolchain's musl header
// describes Linux's, so the fields the app needs are laid out here.
extern "C" int ps4_fstatfs(int fd, void* buffer) __asm__("_fstatfs");

namespace {
struct FreebsdStatfs {
  std::uint32_t version, type;
  std::uint64_t flags, block_size, io_size, blocks, blocks_free;
  std::int64_t blocks_available;
  unsigned char rest[472 - 56];
};
static_assert(sizeof(FreebsdStatfs) == 472 && offsetof(FreebsdStatfs, block_size) == 16 &&
              offsetof(FreebsdStatfs, blocks) == 32 && offsetof(FreebsdStatfs, blocks_available) == 48);
int pad = -1;

bool refuse(char* error, std::size_t size, const char* why) {
  if (size) std::snprintf(error, size, "%s", why);
  return false;
}
} // namespace

namespace ps4_platform {
void set_pad(int handle) { pad = handle; }

const char* data_root() { return "/data/ps5-react/" PS4_REACT_TITLE; }

bool prepare_storage() {
  bool ok = true;
  for (const char* path : {"/data/ps5-react", data_root()}) ok = (mkdir(path, 0777) == 0 || errno == EEXIST) && ok;
  for (const char* child : {"/tmp", "/cache", "/dev"}) {
    const std::string path = std::string(data_root()) + child;
    ok = (mkdir(path.c_str(), 0777) == 0 || errno == EEXIST) && ok;
  }
  return ok;
}
} // namespace ps4_platform

namespace host {
const char* platform_name() { return "ps4"; }

// The app's sandbox paths, as on the PS5: /download0 (its data), /temp0 and /cache0 live under
// /data/ps5-react/<title>; /app0 is the package, but for the folders packed in app.pack (app_pack.hpp). Other
// paths (/data, /user, /mnt/usb*) are used as they are. Parent steps are refused.
bool resolve_path(const char* path, char* out, std::size_t size) {
  if (path[0] != '/') return false;
  for (const char* part = path; part; part = std::strchr(part + 1, '/'))
    if (part[1] == '.' && part[2] == '.' && (part[3] == '/' || part[3] == '\0')) return false;
  if (app_pack::resolve(path, out, size)) return true;
  const std::string data = ps4_platform::data_root();
  const std::pair<const char*, std::string> roots[] = {{"/download0", data}, {"/temp0", data + "/tmp"}, {"/cache0", data + "/cache"}};
  for (const auto& [logical, physical] : roots) {
    const std::size_t length = std::strlen(logical);
    if (std::strncmp(path, logical, length) == 0 && (path[length] == '\0' || path[length] == '/')) {
      const int written = std::snprintf(out, size, "%s%s", physical.c_str(), path + length);
      return written > 0 && std::size_t(written) < size;
    }
  }
  const int written = std::snprintf(out, size, "%s", path);
  return written > 0 && std::size_t(written) < size;
}

int list_mounts(MountEntry*, int) { return 0; }

bool read_dir(const char* real_path, void (*visit)(const char* name, void* user), void* user) {
  DIR* dir = opendir(real_path);
  if (!dir) return false;
  while (const dirent* entry = readdir(dir)) {
    if (std::strcmp(entry->d_name, ".") == 0 || std::strcmp(entry->d_name, "..") == 0) continue;
    visit(entry->d_name, user);
  }
  closedir(dir);
  return true;
}

// The drive's size and the room an app may still use, as the download queue checks before and during a download.
bool disk_usage(const char* path, double& total, double& free) {
  const int fd = open(path, O_RDONLY);
  if (fd < 0) return false;
  FreebsdStatfs info{};
  const int result = ps4_fstatfs(fd, &info);
  const int error = errno;
  close(fd);
  if (result != 0 || info.version != 0x20030518 || !info.block_size) {
    errno = result != 0 ? error : EIO;
    return false;
  }
  total = double(info.blocks) * double(info.block_size);
  free = double(std::max<std::int64_t>(info.blocks_available, 0)) * double(info.block_size);
  return true;
}

void trace(const char* call) { ps4_log::write("[PS4-REACT] native %s", call); }

bool arrange_relaunch(char* error, std::size_t size) { return refuse(error, size, "Not on the PS4 yet"); }
bool arm_update(const char*, char* error, std::size_t size) { return refuse(error, size, "Not on the PS4 yet"); }
bool send_payload(const char*, int, const std::string&, bool, std::string&, std::string& error) {
  error = "Not on the PS4 yet";
  return false;
}

void device_info(DeviceInfo& info) {
  std::snprintf(info.model, sizeof info.model, "PS4");
  std::snprintf(info.language, sizeof info.language, "en-US");
}

bool foreground_user(User& user) {
  int id = -1;
  if (sceUserServiceGetForegroundUser(&id) != 0) return false;
  user.id = id;
  if (sceUserServiceGetUserName(id, user.name, sizeof user.name) != 0) user.name[0] = '\0';
  return true;
}

int logged_in_users(User* users, int max) {
  OrbisUserServiceLoginUserIdList list{};
  if (sceUserServiceGetLoginUserIdList(&list) != 0) return 0;
  int count = 0;
  for (int id : list.userId) {
    if (id < 0 || count >= max) continue;
    users[count].id = id;
    if (sceUserServiceGetUserName(id, users[count].name, sizeof users[count].name) != 0) users[count].name[0] = '\0';
    ++count;
  }
  return count;
}

bool notify(const char* message, const char* sub_message) {
  ps4_log::write("[PS4-REACT] notify: %s %s", message, sub_message ? sub_message : "");
  return false;
}
bool open_url(const char*) { return false; }

void set_light_bar(std::uint8_t r, std::uint8_t g, std::uint8_t b) {
  OrbisPadColor color{r, g, b, 255};
  if (pad >= 0) scePadSetLightBar(pad, &color);
}
void reset_light_bar() {
  if (pad >= 0) scePadResetLightBar(pad);
}
void vibrate(float, float) {}
void set_trigger_effect(unsigned, int, const std::uint8_t*, std::size_t) {} // the DualShock 4 has no adaptive triggers
void keep_awake(bool) {}

bool start_audio(hui::audio::Mixer&) { return false; } // silent until the PS4's audio output is ported
void stop_audio() {}
bool has_bitstream() { return false; }
bool open_bitstream(iec61937::Codec, BitstreamFill) { return false; }
void close_bitstream() {}
} // namespace host
