/* Copyright (C) 2026 half144 and PS5 React contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Additional attribution term: see LICENSE-ATTRIBUTION.
 * Random bytes from the console's generator (libSceRandom, at most 64 bytes a call): for getentropy, whose musl
 * version asks the kernel with Linux's system call number, and for the kern.arandom sysctl OpenSSL seeds itself from
 * (include/sys/sysctl.h; linked with --wrap=sysctl). */
#include <errno.h>
#include <stddef.h>
#include <sys/sysctl.h>

int sceRandomGetRandomNumber(void* buffer, size_t size);
int __real_sysctl(const int* name, unsigned int namelen, void* oldp, size_t* oldlenp, const void* newp, size_t newlen);

int getentropy(void* buffer, size_t length) {
  if (length > 256) {
    errno = EIO;
    return -1;
  }
  unsigned char* at = buffer;
  while (length) {
    const size_t chunk = length > 64 ? 64 : length;
    if (sceRandomGetRandomNumber(at, chunk) != 0) {
      errno = EIO;
      return -1;
    }
    at += chunk;
    length -= chunk;
  }
  return 0;
}

// kern.arandom: up to 256 bytes, as FreeBSD gives; every other sysctl goes to the kernel.
int __wrap_sysctl(const int* name, unsigned int namelen, void* oldp, size_t* oldlenp, const void* newp, size_t newlen) {
  if (namelen != 2 || name[0] != CTL_KERN || name[1] != KERN_ARND) return __real_sysctl(name, namelen, oldp, oldlenp, newp, newlen);
  if (!oldp || !oldlenp || newp) {
    errno = EINVAL;
    return -1;
  }
  if (*oldlenp > 256) *oldlenp = 256;
  return getentropy(oldp, *oldlenp);
}
