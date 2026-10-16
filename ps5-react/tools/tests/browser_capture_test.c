#include "browser_match.h"
#include "browser_scan.h"
#include <assert.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
typedef struct { unsigned char *bytes; size_t length; int hole, cancelled; } Memory;
static bool active(void *context) { return !((Memory *)context)->cancelled; }
static int read_memory(void *context, uint64_t at, void *out, size_t length) {
  Memory *memory = context;
  if (memory->hole && at >= PROBE_CHUNK && at < 2 * PROBE_CHUNK) return -1;
  assert(at + length <= memory->length);
  memcpy(out, memory->bytes + at, length); return 0;
}
static ProbeResult scan(Memory *memory, BrowserMatch *match, uint64_t budget) {
  ProbeReader reader = {.context = memory, .read = read_memory, .active = active,
    .match = browser_match, .match_context = match, .remaining = budget};
  return probe_scan_region(&reader, 0, memory->length, "https://vikingfile.com/d/");
}
int main(void) {
  const char *url = "https://vikingfile.com/d/Ab01234567/Game%20DLC.pkg";
  BrowserMatch match = {.filename = "Game DLC.pkg"};
  assert(browser_capture_url(match.filename, url));
  assert(!browser_capture_url("Other.pkg", url));
  assert(browser_capture_url("", url));
  assert(browser_capture_url("Game DLC.pkg", "https://vik1ngfile.site/d/Ab01234567/Game%20DLC.pkg"));
  assert(!browser_capture_url("Game DLC.pkg", "https://vik1ngfile.site.evil.test/d/Ab01234567/Game%20DLC.pkg"));
  assert(!browser_capture_url("", "https://vikingfile.com/d/Ab01234567/"));
  assert(!browser_capture_url("", "https://vikingfile.com/d/Ab01234567/a%2Fb.rar"));
  assert(!browser_capture_url("", "https://vikingfile.com/d/Ab01234567/a%5Cb.rar"));
  assert(!browser_capture_url("", "https://vikingfile.com/d/Ab01234567/a%0Ab.rar"));
  assert(!browser_capture_url(match.filename, "https://vikingfile.com.evil.test/d/Ab01234567/Game%20DLC.pkg"));
  assert(!browser_capture_url(match.filename, "https://vikingfile.com/d/Ab01234567/Game%20DLC.pkg?x=1"));
  Memory memory = {.length = 3 * PROBE_CHUNK};
  memory.bytes = calloc(1, memory.length); assert(memory.bytes);
  for (size_t step = 1; step <= 2; step++) {
    memset(memory.bytes, 0, memory.length); memset(match.url, 0, sizeof match.url);
    const size_t offset = PROBE_CHUNK - 21;
    for (size_t i = 0; i < strlen(url); i++) memory.bytes[offset + i * step] = (unsigned char)url[i];
    assert(scan(&memory, &match, memory.length) == PROBE_FOUND);
    assert(!strcmp(match.url, url));
    memory.hole = 1;
    assert(scan(&memory, &match, memory.length) == PROBE_ABSENT);
    memory.hole = 0;
    assert(scan(&memory, &match, 10) == PROBE_BUDGET);
    memory.cancelled = 1;
    assert(scan(&memory, &match, memory.length) == PROBE_STOPPED);
    memory.cancelled = 0;
  }
  // A complete terminator is required; no clipped or prefixed URL may be returned.
  assert(!browser_match(&match, (const unsigned char *)url, strlen(url)));
  char prefixed[600]; snprintf(prefixed, sizeof prefixed, "x%s", url);
  assert(!browser_match(&match, (const unsigned char *)prefixed, strlen(prefixed) + 1));
  // The selected public page uses punctuation that the catalog's synthetic name loses.
  match.filename = "G_02225(v02.024)-[DLPSGAME.COM].rar";
  const char *real_name_routes[] = {
    "https://vikingfile.com/d/Ab01234567/G_02225(v02.024)-[DLPSGAME.COM].rar",
    "https://vikingfile.com/d/Ab01234567/G_02225%28v02.024%29-%5BDLPSGAME.COM%5D.rar",
    "https://vik1ngfile.site/d/Ab01234567/G_02225%28v02.024%29-%5BDLPSGAME.COM%5D.rar"
  };
  for (size_t route = 0; route < 3; route++) {
    for (size_t step = 1; step <= 2; step++) {
      memset(memory.bytes, 0, memory.length);
      const char *candidate = real_name_routes[route];
      const size_t offset = PROBE_CHUNK - 21;
      for (size_t i = 0; i < strlen(candidate); i++) memory.bytes[offset + i * step] = (unsigned char)candidate[i];
      assert(scan(&memory, &match, memory.length) == PROBE_FOUND);
      assert(!strcmp(match.url, candidate));
    }
  }
  free(memory.bytes);
  puts("browser matcher/scanner: ASCII, UTF-16, block overlap, holes, cancellation, budget and URL binding passed");
}
