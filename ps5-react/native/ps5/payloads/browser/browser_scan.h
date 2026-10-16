// Adapted from Orbit Store 1.0.1 by saawant12 (https://github.com/saawant12/orbit-store-ps5).
// SPDX-License-Identifier: GPL-3.0-or-later
// Read-only browser capture; original corresponding source is recorded in README.md.
#ifndef ORBIT_BROWSER_SCAN_H
#define ORBIT_BROWSER_SCAN_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* Bounded read-only scanner. Matchers must return only the selected file. */
#define PROBE_CHUNK 65536U
#define PROBE_MARKER_MAX 256U
#define PROBE_MATCH_MAX 544U /* Percent-encoded filename and route, including NUL. */
typedef struct {
    void *context;
    int (*read)(void *, uint64_t, void *, size_t);
    bool (*active)(void *); /* Checks deadline, cancellation and process identity. */
    bool (*match)(void *, const unsigned char *, size_t);
    void *match_context;
    uint64_t remaining, attempted, readable;
    unsigned failures;
} ProbeReader;
typedef enum {
    PROBE_ABSENT, PROBE_FOUND, PROBE_STOPPED, PROBE_BUDGET, PROBE_INVALID
} ProbeResult;
ProbeResult probe_scan_region(ProbeReader *, uint64_t start, uint64_t end,
                              const char *marker);
#endif
