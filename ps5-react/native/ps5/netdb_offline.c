// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
//
// Name lookups for apps without networking. OpenSSL's socket helpers (bio_addr.o, bio_sock.o) refer to
// getaddrinfo and its family, and the session cookies (RAND_bytes) and archive decryption pull them into
// every title. The console does not give titles those functions: as imports they would fault on first call,
// and tools/check_imports.py refuses the build. An app with "networking": true links netdb.c's versions over
// sceNet instead; every other app links these, which fail the way a lookup without a network should.
#include <netdb.h>
#include <stddef.h>
#include <sys/socket.h>

int getaddrinfo(const char *node, const char *service, const struct addrinfo *hints, struct addrinfo **result) {
  (void)node; (void)service; (void)hints;
  if (result) *result = NULL;
  return EAI_FAIL;
}

void freeaddrinfo(struct addrinfo *entry) { (void)entry; }

const char *gai_strerror(int code) {
  (void)code;
  return "This app has no networking";
}

struct hostent *gethostbyname(const char *name) {
  (void)name;
  return NULL;
}

int getnameinfo(const struct sockaddr *address, socklen_t length, char *host, size_t host_size, char *service,
                size_t service_size, int flags) {
  (void)address; (void)length; (void)host; (void)host_size; (void)service; (void)service_size; (void)flags;
  return EAI_FAIL;
}
