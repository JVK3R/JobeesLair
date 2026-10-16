// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#pragma once
#include <cstdint>
#include <string>
#include <vector>
// Copies on a worker thread, one at a time in the order asked: a game of tens of GB moving to another
// drive takes minutes, and the copy must survive being cut off. A copy is written under `<to>.partial`
// and renamed to `to` only once every byte has been read back and matched against its source, so `to`
// never names a partial copy. A copy that stops (cancelled, failed, the app closed) leaves `<to>.partial`
// where it is: started again with `resume`, files already whole are kept and a file cut part-way
// continues from its last whole 32 MiB chunk; everything kept is verified again before the rename.
namespace copies {
struct Options {
  // Reads the copy back and compares it with its source (chunk hashes taken while copying; for bytes a
  // previous run wrote, the source is read again). Off: sizes alone are compared.
  bool verify = true;
  // Keeps what an earlier copy left in `<to>.partial`; off, that is removed first.
  bool resume = true;
  // For a file with a download receipt (`<from>.complete`, native/shared/network.cpp): the copy fails
  // unless the receipt names this very file (its size, device and inode), so only the file a download
  // verified is copied. A file without one is copied all the same; the snapshot says which.
  bool receipt = false;
};
// state: "queued" | "copying" | "verifying" | "completed" | "failed" | "cancelled". `written`: bytes of
// the copy in place, a resumed copy's kept bytes included; `verified`: bytes read back and matched;
// `total`: the source's bytes. `receipt`: "" (not asked), "none" (no receipt) or "matched".
struct Snapshot {
  std::uint32_t id = 0;
  std::string state = "queued", error, receipt;
  double written = 0, verified = 0, total = 0;
  std::uint32_t files = 0;
};
// Queues a copy of `from` (a file, or a directory and everything in it; symbolic links are copied as
// links) to `to` (real paths; `to` must not exist). 0 with `error` when the worker cannot start.
std::uint32_t start(std::string from, std::string to, Options options, std::string& error);
// Stops the copy between two buffers, or before it starts; `<to>.partial` is kept for a resume.
void cancel(std::uint32_t id);
// Every copy's state; terminal ones are reported once.
std::vector<Snapshot> poll();
// Cancels the copy under way and those queued, and joins the worker.
void stop();
}
