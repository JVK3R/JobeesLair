// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "network.hpp"
#include "image_loader.hpp"
#include "app_config.hpp"
#include "filesystem_access.hpp"
#include "platform/ps5/system.hpp"
#include <unistd.h>
#if PS5_REACT_NETWORKING
extern "C" {
int sceNetInit(void);
int sceNetTerm(void);
int sceNetPoolCreate(const char*, int, int);
int sceNetPoolDestroy(int);
}
namespace network {
namespace { int pool = -1; bool initialized = false; }
bool platform_start(std::string& error) {
  if (!console_filesystem_accessible()) {
    error = "native networking requires successful console filesystem elevation"; return false;
  }
  if (access("/system/common/cert/CA_LIST.cer", R_OK) != 0) {
    error = "native networking cannot read the system certificate store"; return false;
  }
  initialized = sceNetInit() == 0;
  pool = sceNetPoolCreate("ps5-react-http", 1024*1024, 0);
  if (pool < 0) {
    if (initialized) sceNetTerm(); initialized = false;
    error = "native networking could not create its libSceNet pool"; return false;
  }
  return true;
}
void platform_stop() {
  if (pool >= 0) sceNetPoolDestroy(pool);
  if (initialized) sceNetTerm();
  pool = -1; initialized = false;
}
const char* ca_path() { return "/system/common/cert/CA_LIST.cer"; }
// The title's heap (platform app_heap.c), so download telemetry shows how close it runs.
extern "C" void hui_heap_stats(std::size_t* live_bytes, std::size_t* peak_bytes, std::size_t* blocks, std::size_t* failures);
extern "C" void hui_heap_capacity(std::size_t* size, std::size_t* flexible_before, std::size_t* flexible_after);
void platform_log(const char* line) {
  std::size_t live = 0, peak = 0, blocks = 0, failures = 0, size = 0;
  hui_heap_stats(&live, &peak, &blocks, &failures);
  hui_heap_capacity(&size, nullptr, nullptr);
  const images::Memory image = images::memory();
  hui::sys::log("[PS5-REACT] %s heap=%zu/%zuMiB peak=%zuMiB failed=%zu img=%zu+%zuMiB", line, live >> 20, size >> 20,
                peak >> 20, failures, image.encoded >> 20, image.decoded >> 20);
}
}
#endif
