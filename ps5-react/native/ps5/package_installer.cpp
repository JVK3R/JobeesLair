// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "packages.hpp"
#include "payload_loader.hpp"
#include "worker_thread.hpp"
#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <thread>

// An app may not call the console's app-install service, and a loader payload may. Each install sends
// pkg-installer.elf (native/ps5/payloads/pkg_installer.c) to the payload loader, which relays its lines.
namespace packages {
namespace {
struct Job {
  std::string path, name;
  Snapshot snapshot;
  std::atomic<bool> cancelled{false};
  std::atomic<int> socket{-1};
  std::mutex mutex;
  WorkerThread worker;
};
std::mutex guard;
std::shared_ptr<Job> active;
std::uint32_t next_id = 1;

bool terminal(const std::string& state) { return state == "completed" || state == "failed" || state == "cancelled"; }

void finish(Job& job, const char* state, const std::string& error = {}) {
  std::lock_guard lock(job.mutex);
  job.snapshot.state = job.cancelled ? "cancelled" : state;
  job.snapshot.error = error;
}

// The payload reports once a second; half a minute of silence means it is gone.
int submit(Job& job, std::string& error) {
  return payload_loader::send("pkg-installer.elf", "PKI1\n" + job.path + "\n" + job.name + "\n", 30'000'000, "Packages.install", error);
}

// Lines: "ready", "started <content ID>", "p <written> <total> <status>", "ok", "fail <hex code> <reason>".
// Anything else is the install library's own output and is skipped.
bool handle(Job& job, const std::string& line) {
  std::lock_guard lock(job.mutex);
  Snapshot& s = job.snapshot;
  if (line.starts_with("started ")) { s.content_id = line.substr(8); s.state = "installing"; }
  else if (line.starts_with("p ")) {
    char status[32] = {};
    unsigned long long written = 0, total = 0;
    if (std::sscanf(line.c_str() + 2, "%llu %llu %31s", &written, &total, status) >= 2) { s.written = written; s.total = total; s.status = status; }
  } else if (line == "ok") { s.state = "completed"; s.written = s.total; s.status = "playable"; return true; }
  else if (line.starts_with("fail ")) {
    s.state = job.cancelled ? "cancelled" : "failed";
    s.error = "Packages.install " + job.path + ": " + (line.size() > 14 ? line.substr(14) : std::string("refused")) +
              " (0x" + line.substr(5, 8) + ")";
    return true;
  }
  return false;
}

void run(std::shared_ptr<Job> job) {
  std::string error;
  const int socket = submit(*job, error);
  if (socket < 0) { finish(*job, "failed", error); return; }
  job->socket = socket;
  std::string line;
  char buffer[1024];
  bool ended = false;
  while (!ended && !job->cancelled) {
    const int count = payload_loader::receive(socket, buffer, sizeof buffer);
    if (count <= 0) break;
    for (int i = 0; i < count && !ended; ++i) {
      if (buffer[i] != '\n') { if (line.size() < 2048) line.push_back(buffer[i]); continue; }
      ended = handle(*job, line);
      line.clear();
    }
  }
  if (job->socket.exchange(-1) >= 0) payload_loader::close(socket);
  if (!ended) finish(*job, "failed", "Packages.install " + job->path + ": the installer stopped answering; check the console's Downloads");
}
}

std::uint32_t install(std::string path, std::string name, std::string& error) {
  std::lock_guard lock(guard);
  if (active) { error = "A package is already installing; poll its completion first."; return 0; }
  auto job = std::make_shared<Job>();
  job->path = std::move(path);
  job->name = std::move(name);
  job->snapshot.id = next_id++;
  active = job;
  if (!job->worker.start([job] { run(job); }, 1024 * 1024)) {
    active.reset();
    error = "Cannot start the installer thread.";
    return 0;
  }
  return job->snapshot.id;
}

void cancel(std::uint32_t id) {
  std::lock_guard lock(guard);
  if (!active || active->snapshot.id != id) return;
  active->cancelled = true;
  // Unblocks the receive; the console keeps installing what it accepted.
  if (const int socket = active->socket.exchange(-1); socket >= 0) payload_loader::close(socket);
}

std::vector<Snapshot> poll() {
  std::lock_guard lock(guard);
  if (!active) return {};
  Snapshot snapshot;
  { std::lock_guard job_lock(active->mutex); snapshot = active->snapshot; }
  if (terminal(snapshot.state)) { active->worker.join(); active.reset(); }
  return {snapshot};
}

void stop() {
  std::shared_ptr<Job> job;
  { std::lock_guard lock(guard); job = active; }
  if (!job) return;
  cancel(job->snapshot.id);
  job->worker.join();
  std::lock_guard lock(guard);
  active.reset();
}
}
