// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "copies.hpp"
#include "host_api.hpp"
#include "removals.hpp"
#include "thread_name.hpp"
#include "worker_thread.hpp"
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>
#include <algorithm>
#include <atomic>
#include <cerrno>
#include <climits>
#include <condition_variable>
#include <cstring>
#include <memory>
#include <mutex>
#include <new>
#include <optional>

namespace copies {
namespace {
constexpr std::size_t kBuffer = 4u << 20;
// The unit a copy is hashed in, and where a file cut part-way continues from.
constexpr std::uint64_t kChunk = 32ull << 20;

struct Job { Snapshot snapshot; std::string from, to; Options options; bool cancel = false; };
std::mutex guard;
std::condition_variable wake;
std::vector<Job> jobs;
std::uint32_t next_id = 1;
WorkerThread worker;
bool started = false;
std::atomic<bool> stopping{false};

bool terminal(const std::string& state) { return state == "completed" || state == "failed" || state == "cancelled"; }

Job* find(std::uint32_t id) {
  const auto job = std::find_if(jobs.begin(), jobs.end(), [id](const Job& item) { return item.snapshot.id == id; });
  return job == jobs.end() ? nullptr : &*job;
}

// The download receipt native/shared/network.cpp writes beside a finished file; it must stay the same
// layout as CompletionReceipt there.
struct Receipt {
  char magic[8];
  char identity[65], sha256[65];
  std::uint64_t total, device, inode;
};

#ifdef __APPLE__
const timespec& modified(const struct stat& st) { return st.st_mtimespec; }
#else
const timespec& modified(const struct stat& st) { return st.st_mtim; }
#endif

enum class Kind { File, Directory, Link };
struct Entry { std::string path; Kind kind; std::uint64_t size; mode_t mode; timespec modified; };

// Fails the copy with a message and errno-style reason; the worker reports `error` as given.
struct Failure { std::string message; bool cancelled = false; };

class Copy {
public:
  Copy(std::uint32_t id, std::string from, std::string to, Options options)
    : id_(id), from_(std::move(from)), to_(std::move(to)), staging_(to_ + ".partial"), options_(options) {}

  // Empty when completed.
  std::optional<Failure> run() {
    struct stat source;
    if (lstat(from_.c_str(), &source) != 0) return system("read the source");
    if (to_ == from_ || to_.rfind(from_ + "/", 0) == 0) return Failure{"the destination is inside the source"};
    struct stat existing;
    if (lstat(to_.c_str(), &existing) == 0) return Failure{"the destination already exists"};
    if (auto failure = walk("", source, 0)) return failure;
    if (options_.receipt && S_ISREG(source.st_mode))
      if (auto failure = check_receipt(source)) return failure;
    update([&](Snapshot& snapshot) { snapshot.total = static_cast<double>(total_); snapshot.files = files_; snapshot.receipt = receipt_; });
    if (auto failure = prepare_staging(source)) return failure;
    set_state("copying");
    // The console build has no exceptions: the buffers come from a new that answers null when out of memory.
    buffer_.reset(new (std::nothrow) unsigned char[kBuffer]);
    if (options_.verify) other_.reset(new (std::nothrow) unsigned char[kBuffer]);
    if (!buffer_ || (options_.verify && !other_)) return Failure{"not enough memory for the copy buffers"};
    hashes_.resize(entries_.size());
    for (std::size_t index = 0; index < entries_.size(); ++index)
      if (auto failure = place(index)) return failure;
    set_state("verifying");
    for (std::size_t index = 0; index < entries_.size(); ++index)
      if (entries_[index].kind == Kind::File)
        if (auto failure = verify(index)) return failure;
    if (lstat(to_.c_str(), &existing) == 0) return Failure{"the destination appeared while copying"};
    if (rename(staging_.c_str(), to_.c_str()) != 0) return system("finish the copy");
    sync_parent(to_);
    return std::nullopt;
  }

private:
  static Failure system(const std::string& what) {
    const int error = errno;
    return Failure{what + ": " + std::strerror(error), error == ECANCELED};
  }

  template <typename Change> void update(Change change) {
    std::lock_guard lock(guard);
    if (Job* job = find(id_)) change(job->snapshot);
  }
  void set_state(const char* state) { update([state](Snapshot& snapshot) { snapshot.state = state; }); }
  void progress() {
    update([this](Snapshot& snapshot) {
      snapshot.written = static_cast<double>(written_);
      snapshot.verified = static_cast<double>(verified_);
    });
  }
  bool cancelled() {
    if (stopping) return true;
    std::lock_guard lock(guard);
    const Job* job = find(id_);
    return !job || job->cancel;
  }
  std::optional<Failure> stop_if_cancelled() {
    if (!cancelled()) return std::nullopt;
    errno = ECANCELED;
    return system("copy");
  }

  std::string source_of(const Entry& entry) const { return entry.path.empty() ? from_ : from_ + "/" + entry.path; }
  std::string target_of(const Entry& entry) const { return entry.path.empty() ? staging_ : staging_ + "/" + entry.path; }
  static std::string shown(const Entry& entry, const std::string& fallback) { return entry.path.empty() ? fallback : entry.path; }

  // Lists the source, parents before children, sizes summed.
  std::optional<Failure> walk(const std::string& relative, const struct stat& st, unsigned depth) {
    if (auto failure = stop_if_cancelled()) return failure;
    if (S_ISLNK(st.st_mode)) {
      entries_.push_back({relative, Kind::Link, 0, st.st_mode, modified(st)});
      return std::nullopt;
    }
    if (S_ISREG(st.st_mode)) {
      entries_.push_back({relative, Kind::File, static_cast<std::uint64_t>(st.st_size), st.st_mode, modified(st)});
      total_ += static_cast<std::uint64_t>(st.st_size);
      ++files_;
      return std::nullopt;
    }
    if (!S_ISDIR(st.st_mode)) return Failure{(relative.empty() ? std::string("the source") : relative) + " is not a file or folder"};
    if (depth == 64) { errno = ELOOP; return system("read " + relative); }
    entries_.push_back({relative, Kind::Directory, 0, st.st_mode, modified(st)});
    const std::string path = relative.empty() ? from_ : from_ + "/" + relative;
    std::vector<std::string> names;
    const auto collect = [](const char* name, void* user) { static_cast<std::vector<std::string>*>(user)->emplace_back(name); };
    if (!host::read_dir(path.c_str(), collect, &names)) return system("list " + (relative.empty() ? std::string("the source") : relative));
    std::sort(names.begin(), names.end());
    for (const auto& name : names) {
      const std::string child = relative.empty() ? name : relative + "/" + name;
      struct stat item;
      if (lstat((from_ + "/" + child).c_str(), &item) != 0) return system("read " + child);
      if (auto failure = walk(child, item, depth + 1)) return failure;
    }
    return std::nullopt;
  }

  std::optional<Failure> check_receipt(const struct stat& source) {
    const int fd = open((from_ + ".complete").c_str(), O_RDONLY | O_NOFOLLOW);
    if (fd < 0) {
      receipt_ = "none";
      return std::nullopt;
    }
    Receipt receipt{};
    const ssize_t count = read(fd, &receipt, sizeof receipt);
    close(fd);
    const bool matches = count == static_cast<ssize_t>(sizeof receipt) && !std::memcmp(receipt.magic, "PS5DONE1", 8) &&
      receipt.total == static_cast<std::uint64_t>(source.st_size) && receipt.device == static_cast<std::uint64_t>(source.st_dev) &&
      receipt.inode == static_cast<std::uint64_t>(source.st_ino);
    if (!matches) return Failure{"the source does not match its download receipt"};
    receipt_ = "matched";
    return std::nullopt;
  }

  // What a previous copy left stays when resuming and its kind fits; otherwise it goes first.
  std::optional<Failure> prepare_staging(const struct stat& source) {
    struct stat st;
    if (lstat(staging_.c_str(), &st) != 0) return std::nullopt;
    const bool fits = options_.resume && (S_ISDIR(source.st_mode) ? S_ISDIR(st.st_mode) : S_ISREG(source.st_mode) && S_ISREG(st.st_mode));
    if (fits) return std::nullopt;
    if (!removals::remove_tree(staging_, true)) return system("remove the earlier partial copy");
    return std::nullopt;
  }

  std::optional<Failure> place(std::size_t index) {
    if (auto failure = stop_if_cancelled()) return failure;
    const Entry& entry = entries_[index];
    const std::string target = target_of(entry);
    if (entry.kind == Kind::Directory) {
      struct stat st;
      if (mkdir(target.c_str(), 0777) == 0) (void)chmod(target.c_str(), 0777);
      else if (errno != EEXIST || lstat(target.c_str(), &st) != 0 || !S_ISDIR(st.st_mode)) return system("create " + shown(entry, "the copy"));
      return std::nullopt;
    }
    if (entry.kind == Kind::Link) {
      char link[PATH_MAX];
      const ssize_t length = readlink(source_of(entry).c_str(), link, sizeof link - 1);
      if (length < 0) return system("read link " + shown(entry, "the source"));
      link[length] = '\0';
      (void)unlink(target.c_str());
      if (symlink(link, target.c_str()) != 0) return system("create link " + shown(entry, "the copy"));
      return std::nullopt;
    }
    return copy_file(index);
  }

  static std::uint64_t mix(std::uint64_t hash, const unsigned char* bytes, std::size_t count) {
    std::size_t at = 0;
    for (; at + 8 <= count; at += 8) {
      std::uint64_t word;
      std::memcpy(&word, bytes + at, 8);
      hash = (hash ^ word) * 0x100000001b3ull;
      hash ^= hash >> 29;
    }
    for (; at < count; ++at) hash = (hash ^ bytes[at]) * 0x100000001b3ull;
    return hash;
  }
  static constexpr std::uint64_t kSeed = 0xcbf29ce484222325ull;

  static bool write_all(int fd, const unsigned char* bytes, std::size_t count, std::uint64_t offset) {
    while (count) {
      const ssize_t done = pwrite(fd, bytes, count, static_cast<off_t>(offset));
      if (done < 0 && errno == EINTR) continue;
      if (done <= 0) {
        if (done == 0) errno = EIO;
        return false;
      }
      bytes += done;
      count -= static_cast<std::size_t>(done);
      offset += static_cast<std::uint64_t>(done);
    }
    return true;
  }
  // Reads exactly `count` bytes, or fails: a file that shrank under the copy reads short.
  static bool read_all(int fd, unsigned char* bytes, std::size_t count, std::uint64_t offset) {
    while (count) {
      const ssize_t done = pread(fd, bytes, count, static_cast<off_t>(offset));
      if (done < 0 && errno == EINTR) continue;
      if (done <= 0) {
        if (done == 0) errno = EIO;
        return false;
      }
      bytes += done;
      count -= static_cast<std::size_t>(done);
      offset += static_cast<std::uint64_t>(done);
    }
    return true;
  }

  std::optional<Failure> copy_file(std::size_t index) {
    const Entry& entry = entries_[index];
    const int in = open(source_of(entry).c_str(), O_RDONLY);
    if (in < 0) return system("read " + shown(entry, "the source"));
    const int out = open(target_of(entry).c_str(), O_WRONLY | O_CREAT, 0666);
    if (out < 0) {
      const auto failure = system("write " + shown(entry, "the copy"));
      close(in);
      return failure;
    }
    std::optional<Failure> failure;
    struct stat kept;
    std::uint64_t from = 0;
    if (fstat(out, &kept) == 0) {
      const auto have = static_cast<std::uint64_t>(kept.st_size);
      // Whole already, or cut part-way: kept from its last whole chunk (the tail may be torn).
      from = have == entry.size ? have : have > entry.size ? 0 : have / kChunk * kChunk;
      if (from != have && ftruncate(out, static_cast<off_t>(from)) != 0) failure = system("write " + shown(entry, "the copy"));
    }
    written_ += from;
    progress();
    auto& hashes = hashes_[index];
    hashes.assign(static_cast<std::size_t>((entry.size + kChunk - 1) / kChunk), 0);
    known_.resize(entries_.size());
    known_[index].assign(hashes.size(), false);
    std::uint64_t chunk_hash = kSeed;
    for (std::uint64_t at = from; !failure && at < entry.size;) {
      if ((failure = stop_if_cancelled())) break;
      const std::size_t want = static_cast<std::size_t>(std::min<std::uint64_t>({kBuffer, entry.size - at, kChunk - at % kChunk}));
      if (!read_all(in, buffer_.get(), want, at)) { failure = system("read " + shown(entry, "the source")); break; }
      if (!write_all(out, buffer_.get(), want, at)) { failure = system("write " + shown(entry, "the copy")); break; }
      chunk_hash = mix(chunk_hash, buffer_.get(), want);
      at += want;
      if (at % kChunk == 0 || at == entry.size) {
        const auto chunk = static_cast<std::size_t>((at - 1) / kChunk);
        hashes[chunk] = chunk_hash;
        known_[index][chunk] = true;
        chunk_hash = kSeed;
      }
      written_ += want;
      progress();
    }
    if (!failure && fsync(out) != 0) failure = system("write " + shown(entry, "the copy"));
    if (!failure) {
      (void)fchmod(out, entry.mode & 07777);
      // futimes, not futimens: the console's libkernel has only the former.
      const timeval when{entry.modified.tv_sec, static_cast<decltype(timeval::tv_usec)>(entry.modified.tv_nsec / 1000)};
      const timeval times[2] = {when, when};
      (void)futimes(out, times);
    }
    if (close(out) != 0 && !failure) failure = system("write " + shown(entry, "the copy"));
    close(in);
    return failure;
  }

  // Reads the copy back: each chunk hashed while copying is checked against that hash; a chunk an earlier
  // run wrote is compared with the source, read again. A chunk that differs is cut off the copy, so a
  // resume copies it again.
  std::optional<Failure> verify(std::size_t index) {
    const Entry& entry = entries_[index];
    struct stat now;
    if (stat(source_of(entry).c_str(), &now) != 0) return system("read " + shown(entry, "the source"));
    if (static_cast<std::uint64_t>(now.st_size) != entry.size) return Failure{shown(entry, "the source") + " changed while it was copied"};
    const int copy = open(target_of(entry).c_str(), O_RDWR);
    if (copy < 0) return system("read " + shown(entry, "the copy"));
    std::optional<Failure> failure;
    struct stat st;
    if (fstat(copy, &st) != 0) failure = system("read " + shown(entry, "the copy"));
    else if (static_cast<std::uint64_t>(st.st_size) != entry.size) failure = Failure{shown(entry, "the copy") + " is not the size of its source"};
    if (failure || !options_.verify) {
      if (!failure) verified_ += entry.size;
      progress();
      close(copy);
      return failure;
    }
    int source = -1;
    for (std::uint64_t chunk_start = 0; !failure && chunk_start < entry.size; chunk_start += kChunk) {
      const auto chunk = static_cast<std::size_t>(chunk_start / kChunk);
      const bool hashed = index < known_.size() && chunk < known_[index].size() && known_[index][chunk];
      if (!hashed && source < 0 && (source = open(source_of(entry).c_str(), O_RDONLY)) < 0) { failure = system("read " + shown(entry, "the source")); break; }
      const std::uint64_t end = std::min(entry.size, chunk_start + kChunk);
      std::uint64_t hash = kSeed;
      bool same = true;
      for (std::uint64_t at = chunk_start; at < end;) {
        if ((failure = stop_if_cancelled())) break;
        const auto want = static_cast<std::size_t>(std::min<std::uint64_t>(kBuffer, end - at));
        if (!read_all(copy, buffer_.get(), want, at)) { failure = system("read " + shown(entry, "the copy")); break; }
        if (hashed) hash = mix(hash, buffer_.get(), want);
        else {
          if (!read_all(source, other_.get(), want, at)) { failure = system("read " + shown(entry, "the source")); break; }
          same = same && !std::memcmp(buffer_.get(), other_.get(), want);
        }
        at += want;
        verified_ += want;
        progress();
      }
      if (failure) break;
      if (hashed) same = hash == hashes_[index][chunk];
      if (!same) {
        (void)ftruncate(copy, static_cast<off_t>(chunk_start));
        failure = Failure{shown(entry, "the copy") + " differs from its source at byte " + std::to_string(chunk_start)};
      }
    }
    if (source >= 0) close(source);
    close(copy);
    return failure;
  }

  static void sync_parent(const std::string& path) {
    const auto slash = path.rfind('/');
    if (slash == std::string::npos || slash == 0) return;
    const int fd = open(path.substr(0, slash).c_str(), O_RDONLY | O_DIRECTORY);
    if (fd < 0) return;
    (void)fsync(fd); // some filesystems do not sync directories; the rename is in place either way
    close(fd);
  }

  std::uint32_t id_;
  std::string from_, to_, staging_;
  Options options_;
  std::vector<Entry> entries_;
  std::vector<std::vector<std::uint64_t>> hashes_;
  std::vector<std::vector<bool>> known_;
  std::unique_ptr<unsigned char[]> buffer_, other_;
  std::uint64_t total_ = 0, written_ = 0, verified_ = 0;
  std::uint32_t files_ = 0;
  std::string receipt_;
};

void run() {
  name_thread("fs-copy");
  std::unique_lock lock(guard);
  for (;;) {
    const auto queued = [] { return std::find_if(jobs.begin(), jobs.end(), [](const Job& job) { return job.snapshot.state == "queued"; }); };
    wake.wait(lock, [&] { return stopping || queued() != jobs.end(); });
    if (stopping) return;
    const auto job = queued();
    const auto id = job->snapshot.id;
    if (job->cancel) {
      job->snapshot.state = "cancelled";
      job->snapshot.error = std::strerror(ECANCELED);
      continue;
    }
    job->snapshot.state = "copying";
    Copy copy(id, job->from, job->to, job->options);
    lock.unlock();
    const auto failure = copy.run();
    lock.lock();
    Snapshot& snapshot = find(id)->snapshot;
    if (!failure) snapshot.state = "completed";
    else {
      snapshot.state = failure->cancelled ? "cancelled" : "failed";
      snapshot.error = failure->message;
    }
  }
}
}

std::uint32_t start(std::string from, std::string to, Options options, std::string& error) {
  std::lock_guard lock(guard);
  if (!started && !(started = worker.start(run, 256 * 1024))) {
    error = "Cannot start the copy thread.";
    return 0;
  }
  Job& job = jobs.emplace_back();
  job.snapshot.id = next_id++;
  job.from = std::move(from);
  job.to = std::move(to);
  job.options = options;
  wake.notify_one();
  return job.snapshot.id;
}

void cancel(std::uint32_t id) {
  std::lock_guard lock(guard);
  if (Job* job = find(id)) job->cancel = true;
}

std::vector<Snapshot> poll() {
  std::lock_guard lock(guard);
  std::vector<Snapshot> out;
  for (const auto& job : jobs) out.push_back(job.snapshot);
  std::erase_if(jobs, [](const Job& job) { return terminal(job.snapshot.state); });
  return out;
}

void stop() {
  { std::lock_guard lock(guard); stopping = true; }
  wake.notify_all();
  worker.join();
  std::lock_guard lock(guard);
  for (auto& job : jobs) if (!terminal(job.snapshot.state)) { job.snapshot.state = "cancelled"; job.snapshot.error = std::strerror(ECANCELED); }
  started = false;
  stopping = false;
}
}
