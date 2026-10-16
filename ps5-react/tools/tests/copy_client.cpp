// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// Runs native/shared/copies.cpp for tools/test_copies.py: `copy <from> <to> [noverify] [noresume]
// [receipt]` copies and polls until it ends; `stop <from> <to>` stops the worker once the copy has
// written something, `cancel <from> <to>` cancels it then. Prints the milliseconds the call that queued
// took, then `<state>\t<error>\t<written>\t<verified>\t<total>\t<files>\t<receipt>`.
#include "copies.hpp"
#include "host_api.hpp"
#include <dirent.h>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>

bool host::read_dir(const char* real_path, void (*visit)(const char*, void*), void* user) {
  DIR* dir = opendir(real_path);
  if (!dir) return false;
  while (const dirent* item = readdir(dir))
    if (std::strcmp(item->d_name, ".") && std::strcmp(item->d_name, "..")) visit(item->d_name, user);
  closedir(dir);
  return true;
}

int main(int argc, char** argv) {
  if (argc < 4) return 2;
  const std::string mode = argv[1];
  copies::Options options;
  for (int i = 4; i < argc; ++i) {
    if (!std::strcmp(argv[i], "noverify")) options.verify = false;
    if (!std::strcmp(argv[i], "noresume")) options.resume = false;
    if (!std::strcmp(argv[i], "receipt")) options.receipt = true;
  }
  const auto started = std::chrono::steady_clock::now();
  std::string error;
  const auto id = copies::start(argv[2], argv[3], options, error);
  if (!id) { std::fprintf(stderr, "%s\n", error.c_str()); return 1; }
  std::printf("%lld\n", static_cast<long long>(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - started).count()));
  bool interrupted = false;
  copies::Snapshot last;
  for (;;) {
    bool ended = false;
    for (const auto& snapshot : copies::poll()) {
      if (snapshot.id != id) continue;
      last = snapshot;
      ended = snapshot.state == "completed" || snapshot.state == "failed" || snapshot.state == "cancelled";
    }
    if (ended) break;
    if (!interrupted && last.written > 0 && mode != "copy") {
      interrupted = true;
      if (mode == "stop") copies::stop();
      else copies::cancel(id);
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  std::printf("%s\t%s\t%.0f\t%.0f\t%.0f\t%u\t%s\n", last.state.c_str(), last.error.c_str(), last.written, last.verified, last.total, last.files, last.receipt.c_str());
  copies::stop();
  return 0;
}
