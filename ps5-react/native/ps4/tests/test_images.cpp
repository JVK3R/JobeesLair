// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// Drives shared/image_loader.cpp's PS4 path (PS5_REACT_SCE_HTTP, with the curl stand-in) against server.py.
#include "image_loader.hpp"
#include "network.hpp"
#include <chrono>
#include <cstdio>
#include <map>
#include <string>
#include <thread>

using namespace std::chrono_literals;
static int failures = 0, passes = 0;
static void check(bool ok, const std::string& what) {
  std::printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str());
  ok ? ++passes : ++failures;
}

int main(int, char** argv) {
  const std::string base = std::string("http://127.0.0.1:") + argv[1];
  network::start();
  check(images::start(argv[2]), "images start");
  std::map<std::uint32_t, std::string> wanted;
  std::string error;
  images::Result result;
  for (int i = 1; i <= 20; ++i) {
    const auto id = images::load(base + "/img/" + std::to_string(i) + ".png", 40, 30, images::Fit::cover, true, result, error);
    wanted[id] = "img" + std::to_string(i);
  }
  const auto missing = images::load(base + "/img/missing.png", 40, 30, images::Fit::cover, true, result, error);
  wanted[missing] = "missing";
  // Released while its slow answer is still coming: the transfer is abandoned.
  const auto slow = images::load(base + "/img/95.png", 40, 30, images::Fit::cover, true, result, error);
  std::this_thread::sleep_for(200ms);
  images::release(slow, true);
  std::vector<std::string> warm;
  for (int i = 30; i < 40; ++i) warm.push_back(base + "/img/" + std::to_string(i) + ".png");
  images::warm(warm);
  std::map<std::uint32_t, images::Result> done;
  const auto deadline = std::chrono::steady_clock::now() + 30s;
  while (done.size() < wanted.size() && std::chrono::steady_clock::now() < deadline) {
    for (auto& r : images::poll([](std::uint32_t) {})) if (wanted.count(r.id) && (r.ready || r.failed)) done[r.id] = r;
    std::this_thread::sleep_for(20ms);
  }
  int ready = 0;
  bool sizes = true;
  for (const auto& [id, r] : done) {
    if (wanted[id] == "missing") continue;
    if (r.ready) ++ready;
    if (r.ready && (r.width > 40 || r.height > 30 || !r.pixels)) sizes = false;
  }
  check(ready == 20 && sizes, "20 pictures fetched and decoded to the box (" + std::to_string(ready) + " ready)");
  check(done.count(missing) && done[missing].failed && done[missing].error.find("HTTP 404") != std::string::npos,
        "a missing picture fails with its HTTP status (" + (done.count(missing) ? done[missing].error : std::string("no answer")) + ")");
  std::this_thread::sleep_for(2s); // the slow answer and the warm fetches finish
  const std::string stats = images::stats();
  std::printf("stats: %s\n", stats.c_str());
  check(stats.find("aborted=1") != std::string::npos, "the released slow picture's transfer was abandoned");
  // Loaded again: from the disk cache the warm fetches and the loads filled.
  const auto again = images::load(base + "/img/33.png", 40, 30, images::Fit::cover, true, result, error);
  images::Result warmed;
  for (int i = 0; i < 100 && !warmed.ready && !warmed.failed; ++i) {
    for (auto& r : images::poll([](std::uint32_t) {})) if (r.id == again) warmed = r;
    std::this_thread::sleep_for(20ms);
  }
  check(warmed.ready && images::stats().find("disk=1") != std::string::npos, "a warmed picture loads from the disk cache");
  images::stop([](std::uint32_t) {});
  network::stop();
  std::printf("%d passed, %d failed\n", passes, failures);
  return failures ? 1 : 0;
}
