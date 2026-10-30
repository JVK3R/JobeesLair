/* Copyright (C) 2026 half144 and PS5 React contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Additional attribution term: see LICENSE-ATTRIBUTION.
 * OpenOrbis's <netinet/tcp.h> keeps musl's Linux option numbers; the PS4's kernel takes FreeBSD's. Linux's
 * TCP_KEEPIDLE (4) is FreeBSD's TCP_NOPUSH, which holds small writes back. The Linux-only options go. */
#pragma once
#include_next <netinet/tcp.h>

#undef TCP_KEEPIDLE
#undef TCP_KEEPINTVL
#undef TCP_KEEPCNT
#define TCP_NOPUSH 4
#define TCP_NOOPT 8
#define TCP_KEEPINIT 128
#define TCP_KEEPIDLE 256
#define TCP_KEEPINTVL 512
#define TCP_KEEPCNT 1024
#undef TCP_CORK
#undef TCP_QUICKACK
#undef TCP_USER_TIMEOUT
#undef TCP_FASTOPEN
#undef TCP_FASTOPEN_CONNECT
#undef TCP_FASTOPEN_KEY
#undef TCP_FASTOPEN_NO_COOKIE
