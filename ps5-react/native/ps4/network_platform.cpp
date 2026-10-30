// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// The PS4's side of native networking (network.hpp): libSceNet for the resolver (netdb.c's getaddrinfo), and a
// certificate list for curl. An app's sandbox has no /system, so the console's own list is used only when it can be
// read (a jailbroken process); else Mozilla's, shipped in the package (tools/ps4_ports.py).

#include "network.hpp"
#include "image_loader.hpp"
#include "ps4_log.hpp"
#include <cerrno>
#include <cstddef>
#include <openssl/err.h>
#include <openssl/rand.h>
#include <fcntl.h>
#include <string>
#include <unistd.h>

extern "C" {
#include <sys/sysctl.h> // the shim in include/: C declarations without a C++ guard
int sceNetInit(void);
int sceNetTerm(void);
int sceNetPoolCreate(const char* name, int size, int flags);
int sceNetPoolDestroy(int pool);
}

namespace network {
namespace {
int pool = -1;
bool initialized = false;
const char* certificates = nullptr;
constexpr const char* system_certificates = "/system/common/cert/CA_LIST.cer";
constexpr const char* shipped_certificates = "/app0/cacert.pem";

// access() says no to files the app can open on the PS4 (/app0/cacert.pem); OpenSSL reads the list with fopen.
bool readable(const char* path) {
  const int fd = open(path, O_RDONLY);
  if (fd < 0) return false;
  close(fd);
  return true;
}

bool fail(std::string& error, const char* why) {
  error = why;
  ps4_log::write("[PS4-REACT] network: %s", why);
  return false;
}
} // namespace

bool platform_start(std::string& error) {
  certificates = readable(system_certificates) ? system_certificates
               : readable(shipped_certificates) ? shipped_certificates : nullptr;
  if (!certificates) {
    ps4_log::write("[PS4-REACT] network: %s: errno %d", shipped_certificates, errno);
    return fail(error, "native networking has no certificate list to read");
  }
  initialized = sceNetInit() == 0;
  pool = sceNetPoolCreate("ps4-react-http", 1024 * 1024, 0);
  if (pool < 0) {
    if (initialized) sceNetTerm();
    initialized = false;
    return fail(error, "native networking could not create its libSceNet pool");
  }
  ps4_log::write("[PS4-REACT] network: certificates %s", certificates);
  // OpenSSL seeds itself from kern.arandom (random_compat.c); without a seed curl refuses every TLS connection.
  int mib[2] = {CTL_KERN, KERN_ARND};
  unsigned char seed[32];
  std::size_t length = sizeof seed;
  const int answered = sysctl(mib, 2, seed, &length, nullptr, 0);
  const int seeded = RAND_status();
  ps4_log::write("[PS4-REACT] network: kern.arandom %d (%zu bytes, errno %d), OpenSSL seeded %d %s", answered, length,
                 answered ? errno : 0, seeded, seeded ? "" : ERR_error_string(ERR_peek_last_error(), nullptr));
  return true;
}

void platform_stop() {
  if (pool >= 0) sceNetPoolDestroy(pool);
  if (initialized) sceNetTerm();
  pool = -1;
  initialized = false;
}

const char* ca_path() { return certificates; }

void platform_log(const char* line) {
  const images::Memory image = images::memory();
  ps4_log::write("[PS4-REACT] %s img=%zu+%zuMiB", line, image.encoded >> 20, image.decoded >> 20);
}
} // namespace network
