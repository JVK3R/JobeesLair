// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#pragma once
#include <chrono>
#include <cstdint>
#include <string>
#include <vector>
namespace archives {
// Reads the archive headers before libarchive does and returns why the archive must be refused, or an
// empty string when its declared decoder windows fit the console's memory budget. `unpacked`, when given,
// gets what the files unpack to where the archive's directory says so up front (7z, ZIP), else 0.
std::string preflight(const std::vector<std::string>& sources, std::uint64_t* unpacked = nullptr);
// `title`: the title id a PKG's content id names (its header's "UP0001-CUSA01234_00-..." at 0x40),
// so the app can tell another game's file from the one chosen before it has all downloaded.
struct Inspection { std::string kind, refusal, title{}; };
// What the leading bytes of the ordered volumes are ("rar", "7z", "zip", "tar", "tar.gz", "tar.bz2",
// "tar.xz", "tar.zst", "pkg", "exfat", "ffpkg", "ffpfs", "ffpfsc" or empty), and for an archive, a
// refusal its headers read so far already justify. Works on a partial download, holes included.
// For a RAR, the walk reads at least the first file header, then stops once a header starts past
// `inspect_budget` (100 ms; tests change it).
Inspection inspect(const std::vector<std::string>& sources);
extern std::chrono::milliseconds inspect_budget;
// A stretch of an archive's bytes fetched from its server (an HTTP Range answer) before it downloads.
struct Range { std::uint64_t offset = 0; std::string bytes; };
// A 7z keeps its directory at the end, so `inspect` has nothing to refuse until all of it is here. This
// runs the 7z preflight on ranges instead. `size` is the length the archive's start header gives it; a
// nonzero `need_length` asks for the range at `need_offset` before the check can answer.
struct RangeInspection { std::string kind, refusal; std::uint64_t size = 0, need_offset = 0, need_length = 0; };
RangeInspection inspect_ranges(const std::vector<Range>& ranges);
}
