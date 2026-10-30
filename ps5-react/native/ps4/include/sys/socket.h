/* Copyright (C) 2026 half144 and PS5 React contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Additional attribution term: see LICENSE-ATTRIBUTION.
 * OpenOrbis's <sys/socket.h> with the values the PS4's kernel (FreeBSD 9) takes where musl's Linux ones remain:
 * MSG_NOSIGNAL is 0x20000 there, and the kernel has no SOCK_NONBLOCK or SOCK_CLOEXEC, so code sets them with
 * fcntl instead of asking socket() for a type it refuses. */
#pragma once
#include_next <sys/socket.h>

#undef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0x20000
#undef SOCK_NONBLOCK
#undef SOCK_CLOEXEC
