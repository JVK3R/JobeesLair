// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#pragma once

// Direct memory for 7z dictionaries too large for the title's heap (big_memory.cpp).
namespace big_memory {
// Tells the archive preflight how much it can give, and logs what the console has.
void install();
} // namespace big_memory
