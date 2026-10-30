/* Copyright (C) 2026 half144 and PS5 React contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Additional attribution term: see LICENSE-ATTRIBUTION.
 * getaddrinfo and its family on the PS4's resolver (libSceNet), adapted from the PS5's networking example
 * (ProsperoRadio curl guide, netdb.c, Copyright (C) 2026 BlackBearReloaded, GPL-3.0-or-later) to the PS4's C library:
 * musl's own getaddrinfo reads /etc/resolv.conf, which the console doesn't have, and its getnameinfo takes
 * socklen_t lengths where FreeBSD's take size_t. IPv4 only, one address per name: all curl needs. */
#include <arpa/inet.h>
#include <errno.h>
#include <netdb.h>
#include <netinet/in.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>

int sceNetPoolCreate(const char* name, int size, int flags);
int sceNetPoolDestroy(int pool);
int sceNetResolverCreate(const char* name, int pool, int flags);
int sceNetResolverStartNtoa(int resolver, const char* hostname, struct in_addr* address, int timeout_us, int retries,
                            int flags);
int sceNetResolverDestroy(int resolver);

static int lookup(const char* name, struct in_addr* address) {
  if (inet_pton(AF_INET, name, address) == 1) return 0; /* already a dotted address */
  /* A small pool and resolver per lookup: simple and thread safe (curl resolves on its own threads). */
  const int pool = sceNetPoolCreate("app_dns", 16 * 1024, 0);
  if (pool < 0) return EAI_MEMORY;
  int result = EAI_FAIL;
  const int resolver = sceNetResolverCreate("app_dns", pool, 0);
  if (resolver >= 0) {
    /* 5 s per try, 2 retries. */
    result = sceNetResolverStartNtoa(resolver, name, address, 5000000, 2, 0) < 0 ? EAI_NONAME : 0;
    sceNetResolverDestroy(resolver);
  }
  sceNetPoolDestroy(pool);
  return result;
}

int getaddrinfo(const char* node, const char* service, const struct addrinfo* hints, struct addrinfo** result) {
  *result = NULL;
  const int family = hints != NULL ? hints->ai_family : AF_UNSPEC;
  if (family != AF_UNSPEC && family != AF_INET) return EAI_FAMILY;
  unsigned long port = 0;
  if (service != NULL) {
    char* end = NULL;
    errno = 0;
    port = strtoul(service, &end, 10);
    if (service[0] < '0' || service[0] > '9' || *end != '\0' || errno != 0 || port > 65535) return EAI_SERVICE;
  }
  struct in_addr address;
  address.s_addr = htonl(INADDR_LOOPBACK);
  if (node != NULL) {
    if (hints != NULL && (hints->ai_flags & AI_NUMERICHOST) != 0) {
      if (inet_pton(AF_INET, node, &address) != 1) return EAI_NONAME;
    } else {
      const int failed = lookup(node, &address);
      if (failed != 0) return failed;
    }
  } else if (hints != NULL && (hints->ai_flags & AI_PASSIVE) != 0) {
    address.s_addr = htonl(INADDR_ANY);
  }
  /* One allocation: the entry followed by its address, so freeaddrinfo is a single free per entry. */
  struct addrinfo* entry = calloc(1, sizeof(struct addrinfo) + sizeof(struct sockaddr_in));
  if (entry == NULL) return EAI_MEMORY;
  struct sockaddr_in* in = (struct sockaddr_in*)(entry + 1);
  in->sin_len = sizeof(*in); /* the PS4's sockaddr has BSD's length field */
  in->sin_family = AF_INET;
  in->sin_port = htons((uint16_t)port);
  in->sin_addr = address;
  entry->ai_family = AF_INET;
  entry->ai_socktype = hints != NULL && hints->ai_socktype != 0 ? hints->ai_socktype : SOCK_STREAM;
  entry->ai_protocol = hints != NULL ? hints->ai_protocol : 0;
  entry->ai_addrlen = sizeof(*in);
  entry->ai_addr = (struct sockaddr*)in;
  *result = entry;
  return 0;
}

void freeaddrinfo(struct addrinfo* entry) {
  while (entry != NULL) {
    struct addrinfo* next = entry->ai_next;
    free(entry);
    entry = next;
  }
}

const char* gai_strerror(int code) {
  switch (code) {
  case 0: return "no error";
  case EAI_NONAME: return "the name was not found";
  case EAI_FAMILY: return "address family not supported";
  case EAI_MEMORY: return "out of memory";
  default: return "the name lookup failed";
  }
}

/* Numeric only: enough for curl's logging of the connected address. */
int getnameinfo(const struct sockaddr* restrict address, socklen_t length, char* restrict host, socklen_t host_size,
                char* restrict service, socklen_t service_size, int flags) {
  (void)flags;
  if (address == NULL || address->sa_family != AF_INET || length < sizeof(struct sockaddr_in)) return EAI_FAMILY;
  const struct sockaddr_in* in = (const struct sockaddr_in*)address;
  if (host != NULL && host_size != 0 && inet_ntop(AF_INET, &in->sin_addr, host, host_size) == NULL) return EAI_FAIL;
  if (service != NULL && service_size != 0) snprintf(service, service_size, "%u", (unsigned)ntohs(in->sin_port));
  return 0;
}
