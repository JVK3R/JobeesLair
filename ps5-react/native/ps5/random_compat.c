// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
//
// arc4random_buf for libraries that ask for it: FFmpeg's random seed (libavutil random_seed.o, in apps with
// "video": true) and libarchive's archive_random.o. Titles are not given the console's own (it lives in
// libScePosixForWebKit, and calling it faulted the title; tools/check_imports.py refuses the import), so the
// bytes come from OpenSSL, as LocalServer's session cookies do.
#include <stddef.h>
#include <stdlib.h>

int RAND_bytes(unsigned char *buffer, int size);

void arc4random_buf(void *buffer, size_t size) {
  unsigned char *at = buffer;
  while (size) {
    const int chunk = size > (1u << 20) ? (1 << 20) : (int)size;
    // arc4random_buf cannot fail; without random bytes, nothing that asked for them can go on safely.
    if (RAND_bytes(at, chunk) != 1) abort();
    at += chunk;
    size -= (size_t)chunk;
  }
}
