// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#pragma once
#include <chrono>
#include <string>
#include <vector>
namespace archives {
// Reads the archive headers before libarchive does and returns why the archive must be refused, or an
// empty string when its declared decoder windows fit the console's memory budget.
std::string preflight(const std::vector<std::string>& sources);
struct Inspection { std::string kind, refusal; };
// What the leading bytes of the ordered volumes are ("rar", "7z", "zip", "tar", "tar.gz", "tar.bz2",
// "tar.xz", "tar.zst", "pkg", "exfat", "ffpkg", "ffpfs", "ffpfsc" or empty), and for an archive, a
// refusal its headers read so far already justify. Works on a partial download, holes included.
// For a RAR, the walk reads at least the first file header, then stops once a header starts past
// `inspect_budget` (100 ms; tests change it).
Inspection inspect(const std::vector<std::string>& sources);
extern std::chrono::milliseconds inspect_budget;
}
