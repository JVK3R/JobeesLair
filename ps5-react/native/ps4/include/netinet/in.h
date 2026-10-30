/* Copyright (C) 2026 half144 and PS5 React contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Additional attribution term: see LICENSE-ATTRIBUTION.
 * OpenOrbis's <netinet/in.h> keeps musl's Linux IP option numbers; the PS4's kernel takes FreeBSD's (IP_TOS is 3
 * there, 1 on Linux). Linux-only options go. */
#pragma once
#include_next <netinet/in.h>

#undef IP_OPTIONS
#undef IP_HDRINCL
#undef IP_TOS
#undef IP_TTL
#undef IP_RECVOPTS
#undef IP_RETOPTS
#undef IP_MULTICAST_IF
#undef IP_MULTICAST_TTL
#undef IP_MULTICAST_LOOP
#undef IP_ADD_MEMBERSHIP
#undef IP_DROP_MEMBERSHIP
#define IP_OPTIONS 1
#define IP_HDRINCL 2
#define IP_TOS 3
#define IP_TTL 4
#define IP_RECVOPTS 5
#define IP_RETOPTS 8
#define IP_MULTICAST_IF 9
#define IP_MULTICAST_TTL 10
#define IP_MULTICAST_LOOP 11
#define IP_ADD_MEMBERSHIP 12
#define IP_DROP_MEMBERSHIP 13
#undef IP_BIND_ADDRESS_NO_PORT
#undef IP_PKTINFO
#undef IP_MTU_DISCOVER
#undef IP_RECVERR
#undef IP_FREEBIND
#undef IP_TRANSPARENT
