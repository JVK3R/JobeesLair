// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// The PS4's network.hpp on Sony's HTTP client (sce_http.hpp) in place of curl: the same tasks, states, snapshots and
// error messages as the PS5's shared/network.cpp, with simpler means. Worker threads take the queue a task each; a file
// download keeps one connection, writes <destination>.part and resumes it from where it stopped (<destination>.resume
// holds what the server must still match), then is checked against its SHA-256 and moved into place.
#include "network.hpp"
#include "image_loader.hpp"
#include "ps4_log.hpp"
#include "sce_http.hpp"
#include "sha256.hpp"
#include <algorithm>
#include <atomic>
#include <cerrno>
#include <charconv>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <deque>
#include <fcntl.h>
#include <iterator>
#include <memory>
#include <mutex>
#include <pthread.h>
#include <random>
#include <sys/stat.h>
#include <unistd.h>

namespace network {
namespace {
using Clock = std::chrono::steady_clock;
// Two downloads at most, so requests (the catalog, the store's pages) always have a worker of their own.
constexpr unsigned kWorkers = 4, kMaxDownloads = 2, kMaxJobs = 8, kAttempts = 8;

struct Job {
  Job(Request value, std::uint32_t id) : request(std::move(value)) {
    snapshot.id = id;
    snapshot.destination = request.destination;
    snapshot.binary = request.binary;
    snapshot.url = request.url;
  }
  bool file() const { return !request.destination.empty(); }
  Request request;
  std::mutex mutex; // the snapshot and client
  Snapshot snapshot;
  // The client running it, so cancel() can end the request it waits on.
  sce_http::Client* client = nullptr;
  std::atomic<bool> cancelled{false}, finalized{false};
};

std::mutex mutex; // the lists below
std::condition_variable wake;
std::vector<std::shared_ptr<Job>> jobs;
std::deque<std::shared_ptr<Job>> waiting;
std::uint32_t next_id = 1;
unsigned downloads = 0, worker_count = 0;
bool started = false, stopping = false;
std::string start_error;
pthread_t workers[kWorkers];
std::atomic<bool> downloading_file{false};
std::atomic<std::uint64_t> rate_limit{0};

// The shared budget of the rate limit: bytes downloads may still take now.
std::mutex rate_mutex;
double rate_budget = 0;
Clock::time_point rate_refilled = Clock::now();

void pace(std::size_t bytes, const Job& job) {
  const std::uint64_t limit = rate_limit.load();
  if (!limit || job.request.unlimited) return;
  double wait = 0;
  {
    std::lock_guard lock(rate_mutex);
    const auto now = Clock::now();
    const double elapsed = std::chrono::duration<double>(now - rate_refilled).count();
    rate_refilled = now;
    // A quarter of a second's worth can build up, so a pause does not end in a burst.
    rate_budget = std::min(rate_budget + elapsed * limit, limit / 4.0);
    rate_budget -= bytes;
    if (rate_budget < 0) wait = -rate_budget / limit;
  }
  if (wait > 0) usleep(static_cast<useconds_t>(std::min(wait, 2.0) * 1e6));
}

std::string system_error(const char* what) { return std::string(what) + ": " + std::strerror(errno); }

// The host a URL names, for the log: never its path or query, which can carry a provider's token.
std::string host_of(const std::string& url) {
  const std::size_t scheme = url.find("://");
  const std::size_t start = scheme == std::string::npos ? 0 : scheme + 3;
  std::string host = url.substr(start, url.find_first_of("/?#", start) - start);
  if (const std::size_t at = host.rfind('@'); at != std::string::npos) host.erase(0, at + 1);
  return host;
}

void finish(Job& job, const char* state) {
  std::lock_guard lock(job.mutex);
  job.snapshot.state = state;
  job.snapshot.connections = 0;
  job.snapshot.bytes_per_second = 0;
  job.finalized = true;
}

void fail(Job& job, const std::string& reason) {
  if (job.cancelled) return finish(job, "cancelled");
  platform_log(((job.file() ? "download failed: " : "request failed: ") + reason + "; host " + host_of(job.request.url)).c_str());
  {
    std::lock_guard lock(job.mutex);
    job.snapshot.error = reason;
  }
  finish(job, "failed");
}

void set_state(Job& job, const char* state) {
  std::lock_guard lock(job.mutex);
  job.snapshot.state = state;
}

bool congested(int status) { return status == 408 || status == 429 || (status >= 500 && status <= 599); }

unsigned retry_after(const sce_http::Exchange& x) {
  unsigned seconds = 0;
  const std::string& value = x.header("retry-after");
  std::from_chars(value.data(), value.data() + value.size(), seconds);
  return std::min(seconds, 60u);
}

// From half a second, doubling up to 30 s, with jitter; never sooner than the server's Retry-After. False when the
// task was cancelled during the wait.
bool wait_retry(Job& job, unsigned attempt, unsigned after_seconds) {
  static std::minstd_rand random(static_cast<unsigned>(Clock::now().time_since_epoch().count()));
  const unsigned base = std::min(30000u, 500u << std::min(attempt - 1, 6u));
  const unsigned delay = std::max(after_seconds * 1000u, base / 2 + static_cast<unsigned>(random() % (base / 2 + 1)));
  for (unsigned waited = 0; waited < delay; waited += 50) {
    if (job.cancelled) return false;
    usleep(50000);
  }
  return !job.cancelled;
}

// Only bounded transfer metadata crosses into JS, as on the PS5; never cookies or auth headers.
std::vector<std::pair<std::string, std::string>> visible_headers(const sce_http::Exchange& x) {
  static constexpr const char* kShown[] = {"content-type", "content-length", "content-disposition", "content-range",
                                           "location", "hx-redirect", "etag", "last-modified", "retry-after"};
  std::vector<std::pair<std::string, std::string>> out;
  for (const auto& [name, value] : x.response_headers)
    if (std::find_if(std::begin(kShown), std::end(kShown), [&](const char* shown) { return name == shown; }) != std::end(kShown) &&
        std::none_of(out.begin(), out.end(), [&](const auto& item) { return item.first == name; }))
      out.emplace_back(name, value);
  return out;
}

void log_failure(const Job& job, const sce_http::Exchange& x, unsigned attempt) {
  ps4_log::write("[PS4-REACT] %s attempt %u failed: %s; HTTP %d from %s", job.file() ? "download" : "request", attempt,
                 x.error.empty() ? "server busy" : x.error.c_str(), x.status, host_of(x.url).c_str());
}

void run_request(Job& job, sce_http::Client& client) {
  const Request& r = job.request;
  sce_http::Exchange x;
  x.url = r.url;
  x.method = r.method;
  if (!r.body.empty() || r.method == "POST") x.body = &r.body;
  x.headers = r.headers;
  // Redirects are followed only without headers of the app's own, which may carry credentials, as on the PS5.
  x.follow_redirects = r.follow_redirects && r.headers.empty();
  std::string response;
  bool overflow = false;
  for (unsigned attempt = 1;; ++attempt) {
    set_state(job, attempt == 1 ? "connecting" : "downloading");
    response.clear();
    overflow = false;
    const bool ok = client.perform(x, [&](const char* data, std::size_t size) {
      if (size > r.max_bytes - response.size()) {
        overflow = true;
        return false;
      }
      response.append(data, size);
      return true;
    }, &job.cancelled);
    if (job.cancelled) return finish(job, "cancelled");
    if (overflow) return fail(job, "response exceeds maxBytes");
    if (ok && !congested(x.status)) break;
    if (!ok && !x.transient) return fail(job, x.error);
    if (attempt >= kAttempts) return fail(job, ok ? "server answered HTTP " + std::to_string(x.status) : x.error);
    log_failure(job, x, attempt);
    {
      std::lock_guard lock(job.mutex);
      ++job.snapshot.retries;
    }
    if (!wait_retry(job, attempt, retry_after(x))) return finish(job, "cancelled");
  }
  // The run's first answer, in the log: the console reached the internet.
  static std::atomic<bool> answered{false};
  if (!answered.exchange(true)) ps4_log::write("[PS4-REACT] first answer: HTTP %d from %s", x.status, host_of(r.url).c_str());
  std::lock_guard lock(job.mutex);
  job.snapshot.status = x.status;
  job.snapshot.headers = visible_headers(x);
  job.snapshot.received = job.snapshot.total = response.size();
  job.snapshot.total_known = true;
  job.snapshot.body = std::move(response);
  job.snapshot.state = "completed";
  job.snapshot.connections = 0;
  job.finalized = true;
}

// <destination>.resume: what the bytes in <destination>.part were checked against. Its identity leaves the URL out
// (a re-resolved signed link still names the same file), as the PS5's checkpoint does.
struct Resume {
  std::string identity, validator;
  std::uint64_t total = 0;
};

std::string identity_of(const Request& r) { return std::to_string(r.expected_bytes) + ":" + r.sha256; }

bool read_resume(const std::string& path, Resume& out) {
  std::FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return false;
  char text[2048];
  const std::size_t size = std::fread(text, 1, sizeof text - 1, file);
  std::fclose(file);
  text[size] = '\0';
  char* lines[4] = {};
  char* cursor = text;
  for (char*& line : lines) {
    line = cursor;
    char* end = std::strchr(cursor, '\n');
    if (!end) return false;
    *end = '\0';
    cursor = end + 1;
  }
  if (std::strcmp(lines[0], "ps4-resume 1") != 0) return false;
  out.identity = lines[1];
  out.validator = lines[2];
  return std::from_chars(lines[3], lines[3] + std::strlen(lines[3]), out.total).ec == std::errc{};
}

bool write_resume(const std::string& path, const Resume& resume) {
  const std::string temporary = path + ".tmp";
  std::FILE* file = std::fopen(temporary.c_str(), "wb");
  if (!file) return false;
  const bool ok = std::fprintf(file, "ps4-resume 1\n%s\n%s\n%llu\n", resume.identity.c_str(), resume.validator.c_str(),
                               static_cast<unsigned long long>(resume.total)) > 0;
  return std::fclose(file) == 0 && ok && std::rename(temporary.c_str(), path.c_str()) == 0;
}

// "bytes first-last/total"
bool content_range(const std::string& value, std::uint64_t& first, std::uint64_t& total) {
  if (value.rfind("bytes ", 0) != 0) return false;
  const std::size_t dash = value.find('-'), slash = value.find('/');
  if (dash == std::string::npos || slash == std::string::npos || dash > slash) return false;
  return std::from_chars(value.data() + 6, value.data() + dash, first).ec == std::errc{} &&
         std::from_chars(value.data() + slash + 1, value.data() + value.size(), total).ec == std::errc{};
}

std::string file_digest(const std::string& path, const Job& job) {
  const int fd = open(path.c_str(), O_RDONLY);
  if (fd < 0) return {};
  Sha256 hash;
  std::vector<char> chunk(1024 * 1024);
  ssize_t count;
  while ((count = read(fd, chunk.data(), chunk.size())) > 0 && !job.cancelled) hash.update(chunk.data(), static_cast<std::size_t>(count));
  close(fd);
  return count == 0 ? hash.finish() : std::string();
}

void run_download(Job& job, sce_http::Client& client) {
  const Request& r = job.request;
  set_state(job, "connecting");
  if (!r.pieces.empty()) return fail(job, "downloads in pieces (manifests) are not supported on the PS4 yet");
  struct stat existing{};
  if (lstat(r.destination.c_str(), &existing) == 0) {
    // A download that finished before the app last closed: reported again instead of fetched.
    if (r.recover_completed && S_ISREG(existing.st_mode) && existing.st_size > 0 &&
        (!r.expected_bytes || static_cast<std::uint64_t>(existing.st_size) == r.expected_bytes)) {
      std::lock_guard lock(job.mutex);
      job.snapshot.received = job.snapshot.written = job.snapshot.total = static_cast<std::uint64_t>(existing.st_size);
      job.snapshot.total_known = true;
      job.snapshot.state = "completed";
      job.finalized = true;
      return;
    }
    return fail(job, "destination already exists or cannot be inspected; choose a new destination");
  }
  if (errno != ENOENT) return fail(job, "destination already exists or cannot be inspected; choose a new destination");
  const std::string partial = r.destination + ".part", checkpoint = r.destination + ".resume";
  Resume resume;
  std::uint64_t offset = 0;
  struct stat part{};
  if (r.resume && lstat(partial.c_str(), &part) == 0 && S_ISREG(part.st_mode) && read_resume(checkpoint, resume) &&
      resume.identity == identity_of(r) && static_cast<std::uint64_t>(part.st_size) <= resume.total)
    offset = static_cast<std::uint64_t>(part.st_size);
  else
    resume = Resume{identity_of(r), {}, 0};
  const int fd = open(partial.c_str(), O_WRONLY | O_CREAT | O_NOFOLLOW, 0644);
  if (fd < 0) return fail(job, system_error("open partial file (parent must exist)"));
  struct Closer { int fd; ~Closer() { if (fd >= 0) close(fd); } } closer{fd};
  if (!offset && ftruncate(fd, 0) != 0) return fail(job, system_error("truncate partial file"));

  std::vector<std::string> sources{r.url};
  sources.insert(sources.end(), r.mirrors.begin(), r.mirrors.end());
  unsigned source = 0;
  std::uint64_t total = resume.total;
  bool total_known = total > 0;
  // Speed over the last second, for the snapshot.
  auto window_start = Clock::now();
  std::uint64_t window_bytes = 0;
  double speed = 0;
  auto publish = [&](bool force) {
    const auto now = Clock::now();
    const double seconds = std::chrono::duration<double>(now - window_start).count();
    if (!force && seconds < 0.25) return;
    if (seconds >= 1) {
      speed = window_bytes / seconds;
      window_bytes = 0;
      window_start = now;
    }
    std::lock_guard lock(job.mutex);
    job.snapshot.received = job.snapshot.written = offset;
    job.snapshot.total = total;
    job.snapshot.total_known = total_known;
    job.snapshot.bytes_per_second = speed;
    job.snapshot.connections = 1;
  };
  for (unsigned attempt = 1;; ++attempt) {
    sce_http::Exchange x;
    x.url = sources[source];
    x.headers = r.headers;
    x.follow_redirects = r.follow_redirects && r.headers.empty();
    if (offset) {
      x.headers.push_back("Range: bytes=" + std::to_string(offset) + "-");
      if (!resume.validator.empty()) x.headers.push_back("If-Range: " + resume.validator);
    }
    if (lseek(fd, static_cast<off_t>(offset), SEEK_SET) < 0) return fail(job, system_error("seek partial file"));
    std::string refused;  // why the answer can't be the file (fails at once)
    bool write_failed = false;
    const auto head = [&] {
      if (x.status == 401 || x.status == 403) {
        refused = "provider denied the file; link expired or browser verification required (HTTP " + std::to_string(x.status) + ")";
        return false;
      }
      if (x.status < 200 || x.status > 299) return false; // judged after: busy servers retry, the rest fail
      const std::string& encoding = x.header("content-encoding");
      if (!encoding.empty() && encoding != "identity") {
        refused = "server sent the file with Content-Encoding " + encoding;
        return false;
      }
      const std::string& type = x.header("content-type");
      if (r.reject_html && (type.rfind("text/html", 0) == 0 || type.rfind("application/xhtml+xml", 0) == 0)) {
        refused = "provider returned a web page; browser verification required";
        return false;
      }
      std::uint64_t first = 0, whole = 0;
      if (x.status == 206 && content_range(x.header("content-range"), first, whole) && first == offset) {
        total = whole;
        total_known = true;
      } else if (x.status == 200 || x.status == 206) {
        // The server sent the whole file (it ignored the range, or the file changed): start over.
        if (offset && (ftruncate(fd, 0) != 0 || lseek(fd, 0, SEEK_SET) < 0)) {
          refused = system_error("restart partial file");
          return false;
        }
        offset = 0;
        total = x.length_known ? x.content_length : 0;
        total_known = x.length_known;
      } else {
        refused = "server returned no file (HTTP " + std::to_string(x.status) + ")";
        return false;
      }
      if (r.expected_bytes && total_known && total != r.expected_bytes) {
        refused = "expectedBytes does not match the server file size";
        return false;
      }
      // A strong ETag, else Last-Modified, is what a later resume must match.
      const std::string& etag = x.header("etag");
      resume.validator = !etag.empty() && etag.rfind("W/", 0) != 0 ? etag : x.header("last-modified");
      resume.total = total;
      if (!write_resume(checkpoint, resume)) {
        refused = system_error("save checkpoint");
        return false;
      }
      set_state(job, "downloading");
      return true;
    };
    const bool ok = client.perform(x, [&](const char* data, std::size_t size) {
      for (std::size_t done = 0; done < size;) {
        const ssize_t wrote = write(fd, data + done, size - done);
        if (wrote < 0 && errno == EINTR) continue;
        if (wrote <= 0) {
          write_failed = true;
          refused = system_error("write partial file");
          return false;
        }
        done += static_cast<std::size_t>(wrote);
      }
      offset += size;
      window_bytes += size;
      publish(false);
      pace(size, job);
      return !job.cancelled;
    }, &job.cancelled, head);
    publish(true);
    if (job.cancelled) return finish(job, "cancelled");
    if (!refused.empty() && (write_failed || x.status != 0)) return fail(job, refused);
    const bool complete = ok && !x.stopped && x.status >= 200 && x.status <= 299 && (!total_known || offset == total);
    if (complete) break;
    // Failures worth another attempt: the connection (dropped mid-file, timed out, refused) and busy servers.
    const bool retry = ok ? (congested(x.status) || (x.status >= 200 && x.status <= 299)) : x.transient;
    if (!retry) return fail(job, ok ? "server answered HTTP " + std::to_string(x.status) : x.error);
    if (attempt >= kAttempts) return fail(job, ok ? "server answered HTTP " + std::to_string(x.status) : x.error);
    log_failure(job, x, attempt);
    {
      std::lock_guard lock(job.mutex);
      ++job.snapshot.retries;
    }
    // A mirror takes the next attempt; a lost source costs only speed.
    source = (source + 1) % sources.size();
    if (!wait_retry(job, attempt, retry_after(x))) return finish(job, "cancelled");
  }
  if (fsync(fd) != 0) return fail(job, system_error("sync partial file"));
  close(fd);
  closer.fd = -1;
  if (!total_known) {
    total = offset;
    total_known = true;
  }
  if (!r.sha256.empty()) {
    set_state(job, "verifying");
    const std::string digest = file_digest(partial, job);
    if (job.cancelled) return finish(job, "cancelled");
    if (digest.empty()) return fail(job, "SHA-256 verification failed");
    if (digest != r.sha256) {
      unlink(partial.c_str());
      unlink(checkpoint.c_str());
      return fail(job, "SHA-256 mismatch");
    }
  }
  if (std::rename(partial.c_str(), r.destination.c_str()) != 0) return fail(job, system_error("move completed file into place"));
  unlink(checkpoint.c_str());
  std::lock_guard lock(job.mutex);
  job.snapshot.received = job.snapshot.written = job.snapshot.total = total;
  job.snapshot.total_known = true;
  job.snapshot.bytes_per_second = 0;
  job.snapshot.connections = 0;
  job.snapshot.state = "completed";
  job.finalized = true;
}

// The next task a worker may take: any request, or a download while fewer than kMaxDownloads run.
std::deque<std::shared_ptr<Job>>::iterator runnable() {
  return std::find_if(waiting.begin(), waiting.end(), [](const auto& job) { return !job->file() || downloads < kMaxDownloads; });
}

void* worker(void*) {
  sce_http::Client client;
  for (;;) {
    std::shared_ptr<Job> job;
    {
      std::unique_lock lock(mutex);
      wake.wait(lock, [] { return stopping || runnable() != waiting.end(); });
      if (stopping) break;
      const auto next = runnable();
      job = *next;
      waiting.erase(next);
      if (job->file()) {
        ++downloads;
        downloading_file = true;
      }
    }
    {
      std::lock_guard lock(job->mutex);
      job->client = &client;
    }
    if (job->cancelled) finish(*job, "cancelled");
    else if (job->file()) run_download(*job, client);
    else run_request(*job, client);
    {
      std::lock_guard lock(job->mutex);
      job->client = nullptr;
    }
    {
      std::lock_guard lock(mutex);
      if (job->file() && !--downloads) downloading_file = false;
    }
    wake.notify_all();
  }
  return nullptr;
}
} // namespace

bool start() {
  std::lock_guard lock(mutex);
  if (started) return true;
  if (!sce_http::start(start_error)) return false;
  stopping = false;
  for (worker_count = 0; worker_count < kWorkers; ++worker_count) {
    pthread_attr_t attributes;
    pthread_attr_init(&attributes);
    // TLS handshakes run on the worker's own stack.
    pthread_attr_setstacksize(&attributes, 512 * 1024);
    const bool made = pthread_create(&workers[worker_count], &attributes, worker, nullptr) == 0;
    pthread_attr_destroy(&attributes);
    if (!made) break;
  }
  if (!worker_count) {
    start_error = "network worker creation failed";
    return false;
  }
  started = true;
  return true;
}

void stop() {
  {
    std::lock_guard lock(mutex);
    if (!started) return;
    stopping = true;
    for (const auto& job : jobs) {
      job->cancelled = true;
      std::lock_guard job_lock(job->mutex);
      if (job->client) sce_http::abort(job->client->current.load());
    }
  }
  wake.notify_all();
  for (unsigned i = 0; i < worker_count; ++i) pthread_join(workers[i], nullptr);
  std::lock_guard lock(mutex);
  worker_count = 0;
  jobs.clear();
  waiting.clear();
  started = false;
  sce_http::stop();
}

std::uint32_t enqueue(Request request, std::string& error) {
  std::lock_guard lock(mutex);
  if (!started) {
    error = start_error.empty() ? "networking is not initialized" : start_error;
    return 0;
  }
  if (jobs.size() >= kMaxJobs) {
    error = "download/request queue is full (8 tasks); poll completed tasks";
    return 0;
  }
  for (const auto& job : jobs)
    if (!request.destination.empty() && job->request.destination == request.destination) {
      error = "destination already belongs to a queued task";
      return 0;
    }
  auto job = std::make_shared<Job>(std::move(request), next_id++);
  jobs.push_back(job);
  waiting.push_back(job);
  wake.notify_all();
  return job->snapshot.id;
}

void cancel(std::uint32_t id) {
  std::lock_guard lock(mutex);
  for (auto it = jobs.begin(); it != jobs.end(); ++it) {
    Job& job = **it;
    if (job.snapshot.id != id) continue;
    job.cancelled = true;
    const auto queued = std::find(waiting.begin(), waiting.end(), *it);
    if (queued != waiting.end()) {
      waiting.erase(queued);
      finish(job, "cancelled");
      return;
    }
    std::lock_guard job_lock(job.mutex);
    if (job.client) sce_http::abort(job.client->current.load());
    return;
  }
}

std::vector<Snapshot> poll() {
  std::vector<Snapshot> out;
  std::lock_guard lock(mutex);
  for (auto it = jobs.begin(); it != jobs.end();) {
    const auto& job = *it;
    {
      std::lock_guard job_lock(job->mutex);
      out.push_back(job->snapshot);
    }
    if (job->finalized) it = jobs.erase(it);
    else ++it;
  }
  return out;
}

void set_rate_limit(std::uint64_t bytes_per_second) { rate_limit = bytes_per_second; }
bool downloading() { return downloading_file; }
bool running() {
  std::lock_guard lock(mutex);
  return started;
}
const char* version() { return "libSceHttp (PS4)"; }

// curl's transport policy: the PS4 sends nothing through curl.
bool configure_transport(void*, const std::string&, bool) { return false; }
bool platform_start(std::string&) { return true; }
void platform_stop() {}
const char* ca_path() { return nullptr; }

void platform_log(const char* line) {
  const images::Memory image = images::memory();
  ps4_log::write("[PS4-REACT] %s img=%zu+%zuMiB", line, image.encoded >> 20, image.decoded >> 20);
}
} // namespace network
