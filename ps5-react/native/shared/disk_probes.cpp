// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "disk_probes.hpp"
#include "host_api.hpp"
#include "thread_name.hpp"
#include "worker_thread.hpp"
#include <algorithm>
#include <cerrno>
#include <condition_variable>
#include <cstring>
#include <deque>
#include <mutex>

namespace disk_probes {
namespace {
// Never destroyed, and the worker never joined: stop() does not wait on a probe that may hang in the
// kernel, so what the worker uses must outlive static destruction at exit.
struct State {
  std::mutex guard;
  std::condition_variable wake;
  std::deque<Snapshot> probes;
  std::deque<std::string> paths; // queued probes' paths, by the probes' order among the queued; "" lists mounts
  std::uint32_t next_id = 1;
  bool started = false, stopping = false; // stopping is final: the host is closing
  WorkerThread worker;
};
State& state() {
  static State* const shared = new State();
  return *shared;
}

bool terminal(const std::string& value) { return value == "completed" || value == "failed"; }

void run() {
  name_thread("disk-probe");
  State& s = state();
  std::unique_lock lock(s.guard);
  for (;;) {
    s.wake.wait(lock, [&] { return s.stopping || !s.paths.empty(); });
    if (s.stopping) return;
    const auto probe = std::find_if(s.probes.begin(), s.probes.end(), [](const Snapshot& item) { return item.state == "queued"; });
    if (probe == s.probes.end()) { s.paths.clear(); continue; } // cannot happen: paths follow queued probes
    const std::uint32_t id = probe->id;
    probe->state = "probing";
    const std::string path = std::move(s.paths.front());
    s.paths.pop_front();
    lock.unlock();
    double total = 0, free = 0;
    std::vector<Mount> mounts;
    bool ok = false;
    int error = 0;
    if (path.empty()) {
      host::MountEntry entries[64];
      const int count = host::list_mounts(entries, 64);
      ok = count >= 0;
      error = errno;
      for (int i = 0; i < count; ++i) mounts.push_back({entries[i].device, entries[i].path, entries[i].type});
    } else {
      ok = host::disk_usage(path.c_str(), total, free);
      error = errno;
    }
    lock.lock();
    const auto done = std::find_if(s.probes.begin(), s.probes.end(), [id](const Snapshot& item) { return item.id == id; });
    if (done == s.probes.end()) continue;
    done->state = ok ? "completed" : "failed";
    done->total = ok ? total : 0;
    done->free = ok ? free : 0;
    if (ok) done->mounts = std::move(mounts);
    if (!ok) done->error = std::strerror(error ? error : EIO);
  }
}
}

std::uint32_t start(std::string real_path, std::string& error) {
  State& s = state();
  std::lock_guard lock(s.guard);
  const auto waiting = std::count_if(s.probes.begin(), s.probes.end(), [](const Snapshot& item) { return !terminal(item.state); });
  if (static_cast<std::size_t>(waiting) >= kMaxQueued) {
    error = "too many disk probes waiting";
    return 0;
  }
  if (s.stopping) {
    error = "the host is closing";
    return 0;
  }
  if (!s.started) {
    if (!s.worker.start(run, 128 * 1024)) {
      error = "cannot start the disk probe thread";
      return 0;
    }
    s.started = true;
  }
  Snapshot& probe = s.probes.emplace_back();
  probe.id = s.next_id++;
  if (!s.next_id) s.next_id = 1;
  s.paths.push_back(std::move(real_path));
  s.wake.notify_one();
  return probe.id;
}

std::uint32_t start_mounts(std::string& error) { return start(std::string(), error); }

std::vector<Snapshot> poll() {
  State& s = state();
  std::lock_guard lock(s.guard);
  std::vector<Snapshot> out(s.probes.begin(), s.probes.end());
  std::erase_if(s.probes, [](const Snapshot& item) { return terminal(item.state); });
  return out;
}

void stop() {
  State& s = state();
  {
    std::lock_guard lock(s.guard);
    s.stopping = true;
    s.paths.clear();
    for (auto& probe : s.probes)
      if (probe.state == "queued") {
        probe.state = "failed";
        probe.error = std::strerror(ECANCELED);
      }
  }
  s.wake.notify_all();
}
} // namespace disk_probes
