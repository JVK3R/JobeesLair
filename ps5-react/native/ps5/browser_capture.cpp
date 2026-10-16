// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "browser_capture.hpp"
#include "payload_loader.hpp"
#include "worker_thread.hpp"
#include "async_log.hpp"
#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
extern "C" int sceNetShutdown(int, int);
namespace browser_capture {
namespace {
struct Job {
  std::string prefix, suffix;
  int timeout = 180, socket = -1;
  Snapshot snapshot;
  std::atomic<bool> cancelled{false};
  std::mutex mutex, socket_mutex;
  WorkerThread worker;
};
std::mutex guard;
std::shared_ptr<Job> current;
std::uint32_t next_id = 1;
bool terminal(const std::string& state) { return state == "completed" || state == "failed" || state == "cancelled"; }
void run(std::shared_ptr<Job> job) {
  async_log::write("[browser-capture] submitting payload, task=%u", job->snapshot.id);
  std::string error, url;
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(job->timeout + 10);
  const int socket = payload_loader::send("browser-capture.elf", "BRC1\n" + job->prefix + "\n" + job->suffix + "\n" +
    std::to_string(job->timeout) + "\n", 5'000'000, "BrowserCapture.capture", error);
  if (socket >= 0) {
    { std::lock_guard lock(job->socket_mutex); job->socket = socket; }
    std::string line;
    char buffer[1024];
    bool ended = false;
    while (!ended && !job->cancelled) {
      if (std::chrono::steady_clock::now() >= deadline) { error = "Browser capture timed out."; break; }
      const int count = payload_loader::receive(socket, buffer, sizeof buffer);
      if (count <= 0) { error = "The capture payload stopped answering. Retry or enter the final file link."; break; }
      for (int i = 0; i < count && !ended; i++) {
        if (buffer[i] != '\n') {
          if (line.size() >= 600) { error = "Invalid capture response."; ended = true; }
          else line.push_back(buffer[i]);
          continue;
        }
        if (line.starts_with("found ")) { url = line.substr(6); ended = true; }
        else if (line.starts_with("fail ")) { error = line.substr(5); ended = true; }
        else if (line == "waiting") {
          std::lock_guard lock(job->mutex);
          if (job->snapshot.state != "capturing") async_log::write("[browser-capture] payload answering, task=%u", job->snapshot.id);
          job->snapshot.state = "capturing";
        }
        else { error = "Invalid capture response."; ended = true; }
        line.clear();
      }
    }
    { std::lock_guard lock(job->socket_mutex); job->socket = -1; payload_loader::close(socket); }
  }
  std::lock_guard lock(job->mutex);
  job->snapshot.state = job->cancelled ? "cancelled" : !url.empty() ? "completed" : "failed";
  // A cancel shuts the socket down, which the loop above reads as a payload that stopped answering.
  job->snapshot.error = job->cancelled ? "" : error;
  async_log::write("[browser-capture] task=%u state=%s%s%s", job->snapshot.id, job->snapshot.state.c_str(),
    error.empty() ? "" : " reason=", error.c_str());
  if (!job->cancelled) job->snapshot.url = std::move(url);
}
}
std::uint32_t capture(std::string prefix, std::string suffix, int timeout, std::string& error) {
  std::lock_guard lock(guard);
  if (current) { error = "A browser capture is already running; wait for its completion."; return 0; }
  auto job = std::make_shared<Job>();
  job->prefix = std::move(prefix); job->suffix = std::move(suffix); job->timeout = timeout;
  job->snapshot.id = next_id++; current = job;
  if (!job->worker.start([job] { run(job); }, 1024 * 1024)) { current.reset(); error = "Cannot start the capture thread."; return 0; }
  return job->snapshot.id;
}
void cancel(std::uint32_t id) {
  std::lock_guard lock(guard);
  if (!current || current->snapshot.id != id) return;
  current->cancelled = true;
  std::lock_guard socket_lock(current->socket_mutex);
  if (current->socket >= 0) sceNetShutdown(current->socket, 2);
}
std::vector<Snapshot> poll() {
  std::lock_guard lock(guard);
  if (!current) return {};
  Snapshot snapshot;
  { std::lock_guard lock(current->mutex); snapshot = current->snapshot; }
  if (terminal(snapshot.state)) { current->worker.join(); current.reset(); }
  return {snapshot};
}
void stop() {
  std::shared_ptr<Job> job;
  { std::lock_guard lock(guard); job = current; }
  if (!job) return;
  cancel(job->snapshot.id); job->worker.join();
  std::lock_guard lock(guard); current.reset();
}
}
