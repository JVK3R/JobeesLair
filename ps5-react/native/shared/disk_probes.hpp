// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#pragma once
#include <cstdint>
#include <string>
#include <vector>
// Disk space, and the list of mounted drives, on a worker thread. Asking a drive for its space (statfs)
// waits on the drive: an extended HDD spinning up or a USB stick waking from sleep holds the caller for
// seconds, and listing the mounts asks up to 96 paths that way. On the render thread that is a frozen
// screen with controller input stuck behind it. Probes run one at a time, in the order asked; the caller
// polls for answers and never waits.
namespace disk_probes {
struct Mount { std::string device, path, type; };
struct Snapshot {
  std::uint32_t id = 0;
  std::string state = "queued"; // 'queued' | 'probing' | 'completed' | 'failed'
  double total = 0, free = 0;   // bytes, when a space probe completed
  std::vector<Mount> mounts;    // the drives, when a mounts probe completed
  std::string error;            // the system error, when failed
};
// At most this many probes wait at once; more are refused (the caller asks again later).
inline constexpr std::size_t kMaxQueued = 32;
// Queues `real_path`; 0 with `error` when it cannot (worker not started, queue full).
std::uint32_t start(std::string real_path, std::string& error);
// Queues a listing of the mounted drives (host::list_mounts); same bounds and answers as start().
std::uint32_t start_mounts(std::string& error);
// Every probe's state; terminal ones ("completed", "failed") are reported once, then forgotten.
std::vector<Snapshot> poll();
// Lets the worker end after its current probe, without waiting for it: a probe stuck on a drive must
// not hold the host's exit. Queued probes end "failed", and later ones are refused: call it when closing.
void stop();
}
