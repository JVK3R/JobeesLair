/* Copyright (C) 2026 half144 and PS5 React contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Additional attribution term: see LICENSE-ATTRIBUTION.
 * FreeBSD's <sys/sysctl.h>, as much as OpenSSL's seeding uses. With KERN_ARND OpenSSL seeds itself from the kernel's
 * random bytes, and the PS4 host answers that one request from the console's generator (native/ps4/random_compat.c):
 * without it, OpenSSL on a FreeBSD target tries only /dev/urandom, which an app's sandbox lacks, and refuses every
 * TLS connection. libkernel exports sysctl itself. */
#pragma once
#include <stddef.h>
#include <sys/types.h>

#define CTL_KERN 1
#define KERN_ARND 37

int sysctl(const int* name, unsigned int namelen, void* oldp, size_t* oldlenp, const void* newp, size_t newlen);
