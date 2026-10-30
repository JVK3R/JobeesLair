// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// The PS4 host's log: each line goes to the kernel log (GoldHEN serves it on port 3232), to stdout and to the title's
// own /data/ps5-react/<title>/host.log, which FTP reaches when the kernel log's server is off. The launch before keeps
// its log as host.prev.log, so a crash's lines survive the next launch. Every line is flushed at once and starts with
// the seconds since launch.
#pragma once
#include <cstdarg>
#include <cstdio>
#include <ctime>
#include <sys/stat.h>

extern "C" int sceKernelDebugOutText(int channel, const char* text, ...);

#ifndef PS4_REACT_TITLE
#define PS4_REACT_TITLE "PSRE00000"
#endif

namespace ps4_log {
inline std::FILE* file() {
  static std::FILE* log = [] {
    mkdir("/data/ps5-react", 0777);
    mkdir("/data/ps5-react/" PS4_REACT_TITLE, 0777);
    std::rename("/data/ps5-react/" PS4_REACT_TITLE "/host.log", "/data/ps5-react/" PS4_REACT_TITLE "/host.prev.log");
    return std::fopen("/data/ps5-react/" PS4_REACT_TITLE "/host.log", "w");
  }();
  return log;
}

// The file's descriptor, for the crash handler (native/ps4/crash_log.c); -1 without a file.
inline int fd() {
  std::FILE* log = file();
  return log ? fileno(log) : -1;
}

inline double seconds() {
  static const timespec start = [] {
    timespec now{};
    clock_gettime(CLOCK_MONOTONIC, &now);
    return now;
  }();
  timespec now{};
  clock_gettime(CLOCK_MONOTONIC, &now);
  return double(now.tv_sec - start.tv_sec) + (now.tv_nsec - start.tv_nsec) / 1e9;
}

inline void write(const char* format, ...) {
  char line[1024];
  const int stamp = std::snprintf(line, sizeof line, "%8.3f ", seconds());
  const std::size_t from = stamp > 0 ? std::size_t(stamp) : 0;
  va_list args;
  va_start(args, format);
  const int count = std::vsnprintf(line + from, sizeof line - from - 1, format, args);
  va_end(args);
  const std::size_t limit = sizeof line - 2;
  std::size_t length = from + (count < 0 ? 0 : std::size_t(count));
  if (length > limit) length = limit;
  line[length] = '\n';
  line[length + 1] = '\0';
  std::fputs(line + from, stdout);
  sceKernelDebugOutText(0, "%s", line + from);
  if (std::FILE* log = file()) {
    std::fputs(line, log);
    std::fflush(log);
  }
}

// Logs a system call that failed with its code, for the caller's `return fail(...)`.
inline bool fail(const char* call, int code) {
  write("[PS4-REACT] %s failed: 0x%08x", call, static_cast<unsigned>(code));
  return false;
}
} // namespace ps4_log
