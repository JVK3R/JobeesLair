/* Copyright (C) 2026 half144 and PS5 React contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Additional attribution term: see LICENSE-ATTRIBUTION.
 * OpenOrbis's <poll.h> with FreeBSD's POLLWRNORM (POLLOUT) and POLLWRBAND, which the PS4's kernel takes; musl's
 * are Linux's, where 0x100 is FreeBSD's POLLWRBAND. */
#pragma once
#include_next <poll.h>

#undef POLLWRNORM
#undef POLLWRBAND
#define POLLWRNORM 0x0004
#define POLLWRBAND 0x0100
