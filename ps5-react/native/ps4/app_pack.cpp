// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// app.pack: "JLPACK1\n", a little-endian u32 entry count, then each entry's u16 name length, name (the path under
// /app0), u64 offset and u32 size, then the files' bytes. app.pack.id holds a short hash of the pack: copies go in a
// folder named by it, so a new package never reads an old copy.

#include "app_pack.hpp"
#include "ps4_log.hpp"
#include "removals.hpp"
#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <dirent.h>
#include <fcntl.h>
#include <mutex>
#include <set>
#include <string>
#include <sys/stat.h>
#include <unistd.h>
#include <unordered_map>
#include <vector>

namespace {
struct Entry {
  std::uint64_t offset = 0;
  std::uint32_t size = 0;
};

std::mutex lock;
int pack = -1;
std::string copies; // <data>/app/<pack id>
std::unordered_map<std::string, Entry> entries;
std::set<std::string> folders; // "data/pages/", ...

bool read_exact(int fd, void* data, std::size_t size, std::uint64_t offset) {
  auto* bytes = static_cast<char*>(data);
  while (size) {
    const ssize_t count = pread(fd, bytes, size, static_cast<off_t>(offset));
    if (count <= 0) return false;
    bytes += count;
    size -= static_cast<std::size_t>(count);
    offset += static_cast<std::uint64_t>(count);
  }
  return true;
}

bool make_parents(const std::string& path) {
  for (std::size_t slash = path.find('/', 1); slash != std::string::npos; slash = path.find('/', slash + 1)) {
    const std::string parent = path.substr(0, slash);
    if (mkdir(parent.c_str(), 0777) != 0 && errno != EEXIST) return false;
  }
  return true;
}

// Writes one entry to its copy, through a temporary file so a cut-off write never looks complete.
bool extract(const std::string& name, const Entry& entry, const std::string& target) {
  std::vector<char> data(entry.size);
  if (!read_exact(pack, data.data(), data.size(), entry.offset) || !make_parents(target)) return false;
  const std::string temporary = target + ".part";
  const int fd = ::open(temporary.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (fd < 0) return false;
  bool ok = true;
  for (std::size_t done = 0; ok && done < data.size();) {
    const ssize_t count = write(fd, data.data() + done, data.size() - done);
    ok = count > 0;
    if (ok) done += static_cast<std::size_t>(count);
  }
  ok = close(fd) == 0 && ok && rename(temporary.c_str(), target.c_str()) == 0;
  if (!ok) {
    ps4_log::write("[PS4-REACT] app pack: %s not copied (errno %d)", name.c_str(), errno);
    unlink(temporary.c_str());
  }
  return ok;
}
} // namespace

namespace app_pack {
bool open(const char* data_root) {
  char id[64] = {};
  if (std::FILE* file = std::fopen("/app0/app.pack.id", "rb")) {
    if (!std::fgets(id, sizeof id, file)) id[0] = '\0';
    std::fclose(file);
  }
  id[std::strcspn(id, "\r\n")] = '\0';
  pack = ::open("/app0/app.pack", O_RDONLY);
  if (pack < 0 || !id[0]) return false;
  char magic[8];
  std::uint32_t count = 0;
  std::uint64_t at = 12;
  if (!read_exact(pack, magic, 8, 0) || std::memcmp(magic, "JLPACK1\n", 8) != 0 || !read_exact(pack, &count, 4, 8)) {
    ps4_log::write("[PS4-REACT] app pack: not a pack");
    return false;
  }
  for (std::uint32_t i = 0; i < count; ++i) {
    std::uint16_t length = 0;
    if (!read_exact(pack, &length, 2, at)) return false;
    std::string name(length, '\0');
    Entry entry;
    if (!read_exact(pack, name.data(), length, at + 2) || !read_exact(pack, &entry.offset, 8, at + 2 + length) ||
        !read_exact(pack, &entry.size, 4, at + 10 + length))
      return false;
    at += 14 + length;
    folders.insert(name.substr(0, name.rfind('/') + 1));
    entries.emplace(std::move(name), entry);
  }
  const std::string root = std::string(data_root) + "/app";
  copies = root + "/" + id;
  mkdir(root.c_str(), 0777);
  // Copies from an earlier package go.
  if (DIR* dir = opendir(root.c_str())) {
    while (const dirent* item = readdir(dir))
      if (item->d_name[0] != '.' && id != std::string(item->d_name)) removals::remove_tree(root + "/" + item->d_name, true);
    closedir(dir);
  }
  ps4_log::write("[PS4-REACT] app pack %s: %u files in %zu folders", id, count, folders.size());
  return true;
}

bool resolve(const char* app_path, char* out, std::size_t size) {
  if (pack < 0 || std::strncmp(app_path, "/app0/", 6) != 0) return false;
  const std::string name = app_path + 6;
  if (!folders.count(name.substr(0, name.rfind('/') + 1))) return false;
  const std::string target = copies + "/" + name;
  const int written = std::snprintf(out, size, "%s", target.c_str());
  if (written <= 0 || std::size_t(written) >= size) return false;
  std::lock_guard<std::mutex> guard(lock);
  struct stat st;
  const auto entry = entries.find(name);
  // A name the pack doesn't hold maps to its copy's path, which doesn't exist: the caller sees ENOENT.
  if (entry != entries.end() && stat(target.c_str(), &st) != 0) extract(name, entry->second, target);
  return true;
}
} // namespace app_pack
