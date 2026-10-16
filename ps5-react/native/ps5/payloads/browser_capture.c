// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "browser/browser_platform.h"
#include "browser/browser_match.h"
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static atomic_bool cancelled;
static time_t last_heartbeat;
static int line(char *out, size_t cap) {
  size_t n = 0;
  while (n + 1 < cap) {
    char c;
    if (read(0, &c, 1) != 1) return 0;
    if (c == '\n') { out[n] = 0; return 1; }
    if ((unsigned char)c < 32) return 0;
    out[n++] = c;
  }
  return 0;
}
static time_t now(void) {
  struct timespec t;
  return clock_gettime(CLOCK_MONOTONIC, &t) ? 0 : t.tv_sec;
}
static bool connected(void) {
  struct pollfd fd = {.fd = 0, .events = POLLIN};
  if (poll(&fd, 1, 0) < 0 || fd.revents & (POLLHUP | POLLERR | POLLNVAL | POLLIN)) atomic_store(&cancelled, true);
  const time_t current = now();
  if (current != last_heartbeat) {
    if (write(1, "waiting\n", 8) != 8) atomic_store(&cancelled, true);
    last_heartbeat = current;
  }
  return !atomic_load(&cancelled);
}
static bool active(void *context) { return connected() && probe_target_active(context); }
static void say(const char *kind, const char *value) {
  char buffer[600];
  const int length = snprintf(buffer, sizeof buffer, "%s %s\n", kind, value);
  if (length <= 0 || length >= (int)sizeof buffer) return;
  size_t sent = 0;
  while (sent < (size_t)length) {
    const ssize_t count = write(1, buffer + sent, (size_t)length - sent);
    if (count <= 0) break;
    sent += (size_t)count;
  }
}
static int fail(const char *reason) { say("fail", reason); return 1; }
int main(void) {
  char magic[8], prefix[64], suffix[162], seconds[8];
  signal(SIGPIPE, SIG_IGN);
  if (!line(magic, sizeof magic) || strcmp(magic, "BRC1") || !line(prefix, sizeof prefix) ||
      strcmp(prefix, "https://vikingfile.com/d/") || !line(suffix, sizeof suffix) ||
      suffix[0] != '/' || !line(seconds, sizeof seconds)) return fail("Invalid capture request.");
  const char *filename = suffix + 1;
  if (strchr(filename, '/') || strchr(filename, '\\') || strstr(filename, "..")) return fail("Invalid filename.");
  char *end;
  const long timeout = strtol(seconds, &end, 10);
  if (*end || timeout < 1 || timeout > 180 || !now()) return fail("Invalid deadline.");
  ProbeTarget target = {.cancel = &cancelled, .deadline = now() + timeout};
  int found = 0;
  while (connected() && now() < target.deadline) {
    found = probe_target_find(&target);
    if (found) break;
    usleep(100000);
  }
  if (found != 1) return fail("The browser could not be identified safely. Reopen the page and retry.");
  BrowserMatch match = {.filename = filename};
  ProbeReader reader = {.context = &target, .read = probe_target_read, .active = active,
    .match = browser_match, .match_context = &match, .remaining = 128U * 1024U * 1024U};
  ProbeResult result = PROBE_ABSENT;
  while (active(&target) && reader.remaining) {
    result = probe_target_scan(&target, &reader, prefix);
    if (result == PROBE_FOUND && active(&target)) {
      say("found", match.url);
      memset(&match, 0, sizeof match);
      return 0;
    }
    if (result != PROBE_ABSENT) break;
    usleep(100000);
  }
  memset(&match, 0, sizeof match);
  if (target.identity_changed) return fail("The browser restarted. Reopen the page and retry.");
  if (result == PROBE_INVALID) return fail("Could not read the browser memory map. Retry or enter the final file link.");
  if (!reader.readable) return fail(reader.attempted
    ? "Browser memory reads failed. Check the jailbreak and retry."
    : "No eligible browser memory was available. Reopen the page and retry.");
  char reason[256];
  snprintf(reason, sizeof reason, "No matching link found (read %llu KiB, attempted %llu KiB, failed reads %u). Reopen the page and retry.",
    (unsigned long long)(reader.readable / 1024), (unsigned long long)(reader.attempted / 1024), reader.failures);
  return fail(reason);
}
