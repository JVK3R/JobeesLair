// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// native/shared/disk_probes.cpp: queueing returns at once even while a probe hangs (a drive waking up),
// answers come through poll in order, failures carry the system error, the queue is bounded, and stop()
// returns without waiting for a stuck probe.
//   clang++ -std=c++20 -pthread -I native/shared -I <quickjs> tools/tests/disk_probes_test.cpp native/shared/disk_probes.cpp
#include "disk_probes.hpp"
#include "host_api.hpp"
#include <sys/statvfs.h>
#include <atomic>
#include <cassert>
#include <cerrno>
#include <chrono>
#include <cstdio>
#include <map>
#include <string>
#include <thread>

using namespace std::chrono_literals;
using Clock = std::chrono::steady_clock;
namespace {
std::atomic<bool> release{false};
}

// The platform call the worker makes: "/slow" waits like a drive spinning up, "/stuck" until released.
bool host::disk_usage(const char* real_path, double& total, double& free) {
  const std::string path = real_path;
  if (path == "/slow") std::this_thread::sleep_for(300ms);
  if (path == "/stuck") while (!release) std::this_thread::sleep_for(5ms);
  struct statvfs info{};
  if (statvfs(path == "/slow" || path == "/stuck" ? "/" : real_path, &info) != 0) return false;
  total = static_cast<double>(info.f_blocks) * info.f_frsize;
  free = static_cast<double>(info.f_bavail) * info.f_frsize;
  return true;
}

int host::list_mounts(MountEntry* mounts, int max) {
  std::this_thread::sleep_for(200ms); // listing asks many paths, any of which may be a drive waking up
  if (max < 2) return -1;
  std::snprintf(mounts[0].device, sizeof mounts[0].device, "/dev/data");
  std::snprintf(mounts[0].path, sizeof mounts[0].path, "/data");
  std::snprintf(mounts[0].type, sizeof mounts[0].type, "ufs");
  std::snprintf(mounts[1].device, sizeof mounts[1].device, "/dev/usb0");
  std::snprintf(mounts[1].path, sizeof mounts[1].path, "/mnt/usb0");
  std::snprintf(mounts[1].type, sizeof mounts[1].type, "exfatfs");
  return 2;
}

std::map<std::uint32_t, disk_probes::Snapshot> wait_for(std::size_t count, std::chrono::milliseconds limit) {
  std::map<std::uint32_t, disk_probes::Snapshot> done;
  const auto until = Clock::now() + limit;
  while (done.size() < count && Clock::now() < until) {
    for (const auto& snapshot : disk_probes::poll())
      if (snapshot.state == "completed" || snapshot.state == "failed") done[snapshot.id] = snapshot;
    std::this_thread::sleep_for(5ms);
  }
  return done;
}

int main() {
  std::string error;
  // Queueing a slow probe returns at once; the answer comes later, through poll.
  const auto asked = Clock::now();
  const auto slow = disk_probes::start("/slow", error);
  const auto root = disk_probes::start("/", error);
  const auto missing = disk_probes::start("/no/such/drive", error);
  assert(slow && root && missing);
  assert(Clock::now() - asked < 50ms);
  auto done = wait_for(3, 5s);
  assert(done.size() == 3);
  assert(done[slow].state == "completed" && done[slow].total > 0 && done[slow].free <= done[slow].total);
  assert(done[root].state == "completed" && done[root].total == done[slow].total);
  assert(done[missing].state == "failed" && !done[missing].error.empty());
  assert(disk_probes::poll().empty()); // terminal ones are reported once

  // Listing the mounts queues at once and answers through poll, with the drives.
  const auto listing_at = Clock::now();
  const auto listing = disk_probes::start_mounts(error);
  assert(listing && Clock::now() - listing_at < 50ms);
  done = wait_for(1, 5s);
  assert(done.size() == 1 && done[listing].state == "completed" && done[listing].mounts.size() == 2);
  assert(done[listing].mounts[1].path == "/mnt/usb0" && done[listing].mounts[1].type == "exfatfs");

  // A stuck probe holds only the worker: more queue at once, up to the bound, and wait their turn.
  const auto stuck = disk_probes::start("/stuck", error);
  assert(stuck);
  std::size_t queued = 1;
  while (disk_probes::start("/", error)) ++queued;
  assert(queued == disk_probes::kMaxQueued && error.find("too many") != std::string::npos);
  std::this_thread::sleep_for(50ms);
  assert(wait_for(1, 100ms).empty());

  // stop() returns at once though a probe is stuck; what was queued fails; later probes are refused.
  const auto stopped = Clock::now();
  disk_probes::stop();
  assert(Clock::now() - stopped < 50ms);
  done = wait_for(queued - 1, 1s);
  assert(done.size() == queued - 1);
  for (const auto& [id, snapshot] : done) assert(snapshot.state == "failed" && id != stuck);
  assert(!disk_probes::start("/", error) && error.find("closing") != std::string::npos);
  release = true;
  std::this_thread::sleep_for(50ms);
  std::printf("disk_probes: all checks passed (slow probe queued in under 50 ms; stop with a stuck probe in under 50 ms)\n");
  return 0;
}
