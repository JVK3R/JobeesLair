// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// The app's many small resource files, packed into /app0/app.pack by tools/build_ps4.py: a PS4 package gives every
// file at least 64 KiB, so 4,000 game pages took 270 MB as files. The app still reads /app0/data/pages/<id>.json;
// the first read copies that one file out of the pack to the console's drive, and later reads use the copy.
#pragma once
#include <cstddef>

namespace app_pack {
// Reads the pack's index (and drops the copies of an earlier pack); false when the package has no pack.
bool open(const char* data_root);
// The real path of `app_path` (an /app0 path) when it lies in a packed folder: its copy, made now if needed.
// False for any other path, which the caller maps as usual.
bool resolve(const char* app_path, char* out, std::size_t size);
}
