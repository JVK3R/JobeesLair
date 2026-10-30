/* Copyright (C) 2026 half144 and PS5 React contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Additional attribution term: see LICENSE-ATTRIBUTION.
 * The PS4 host's last line: a fault (a bad address, an illegal instruction, an abort) writes where it happened to the
 * log before the system ends the app. "anchor" is ps4_crash_install's address at run time: with its address in
 * eboot.elf (llvm-nm), it turns "at" and the frames into places in the ELF. libkernel's sigaction takes FreeBSD's
 * structures, not the toolchain header's, so this file declares its own. */
#include <stddef.h>
#include <stdint.h>
#include <unistd.h>

struct freebsd_sigaction {
  void (*handler)(int, void*, void*);
  int flags;
  uint32_t mask[4];
};
int sigaction(int signal, const struct freebsd_sigaction* action, struct freebsd_sigaction* old);
int sceKernelQueryMemoryProtection(void* address, void** start, void** end, int* protection);
/* The program's code and read-only data, from the toolchain's link.x. */
extern char __text_start[], __eh_frame_start[];

void ps4_crash_install(int fd);

/* FreeBSD's SA_SIGINFO and SA_RESETHAND: a second fault ends the app the usual way. */
enum { kSigInfo = 0x40, kResetHand = 0x4 };
static int log_fd = -1;

static size_t put(char* out, size_t at, const char* text) {
  while (*text && at < 500) out[at++] = *text++;
  return at;
}

static size_t hex(char* out, size_t at, uint64_t value) {
  static const char digits[] = "0123456789abcdef";
  at = put(out, at, "0x");
  for (int shift = 60; shift >= 0 && at < 500; shift -= 4) out[at++] = digits[(value >> shift) & 15];
  return at;
}

static size_t decimal(char* out, size_t at, int value) {
  char digits[12];
  int count = 0;
  unsigned rest = value < 0 ? 0u : (unsigned)value;
  do digits[count++] = (char)('0' + rest % 10); while ((rest /= 10) && count < 11);
  while (count && at < 500) out[at++] = digits[--count];
  return at;
}

/* Whether an address in the program follows a call, as a return address does: e8 rel32, or ff /2 through a
   register (2 bytes, 3 with a prefix) or memory (3 or 6 bytes). A pointer to read-only data rarely does. */
static int after_call(uint64_t value) {
  const uint8_t* code = (const uint8_t*)(uintptr_t)value;
  return code[-5] == 0xE8 || (code[-2] == 0xFF && (code[-1] & 0xF8) == 0xD0) ||
         (code[-3] == 0xFF && (code[-2] & 0x38) == 0x10) || (code[-6] == 0xFF && (code[-5] & 0x38) == 0x10);
}

static void on_fault(int signal, void* info, void* context) {
  char line[512];
  size_t n = put(line, 0, "[PS4-REACT] crash: signal ");
  n = decimal(line, n, signal);
  /* siginfo's si_addr is at 24, as on FreeBSD amd64. The PS4's ucontext keeps 48 bytes more than FreeBSD's before
     the registers, which start at 64 (the kernel's own crash report confirmed it): rip the 21st, rbp the 10th and
     rsp the 24th. */
  const uint64_t* registers = (const uint64_t*)((const char*)context + 64);
  const uint64_t rip = registers[20], rbp = registers[9], rsp = registers[23];
  n = put(line, n, " at ");
  n = hex(line, n, rip);
  n = put(line, n, " address ");
  n = hex(line, n, (uint64_t)(uintptr_t) * (void* const*)((const char*)info + 24));
  n = put(line, n, " anchor ");
  n = hex(line, n, (uint64_t)(uintptr_t)&ps4_crash_install);
  n = put(line, n, " frames");
  /* Return addresses along the frame-pointer chain, while it stays on this thread's stack. */
  uint64_t frame = rbp;
  for (int i = 0; i < 12 && frame >= rsp && frame < rsp + 8u * 1024 * 1024 && !(frame & 7); ++i) {
    const uint64_t* saved = (const uint64_t*)(uintptr_t)frame;
    n = put(line, n, " ");
    n = hex(line, n, saved[1]);
    if (saved[0] <= frame) break;
    frame = saved[0];
  }
  line[n++] = '\n';
  if (log_fd < 0) return;
  (void)write(log_fd, line, n);
  /* The chain breaks in code built without frame pointers (memcpy, libc++), so the words on this thread's stack
     that point into the program's code follow: its callers' return addresses are among them. The scan stays inside
     the stack's own mapping. */
  void* start = NULL;
  void* end = NULL;
  int protection = 0;
  uint64_t limit = rsp + 16 * 1024;
  if (sceKernelQueryMemoryProtection((void*)(uintptr_t)rsp, &start, &end, &protection) != 0) limit = (rsp | 4095) + 1;
  else if ((uint64_t)(uintptr_t)end < limit) limit = (uint64_t)(uintptr_t)end;
  n = put(line, 0, "[PS4-REACT] crash stack");
  for (uint64_t at = rsp & ~(uint64_t)7, found = 0; at + 8 <= limit && found < 48; at += 8) {
    const uint64_t value = *(const uint64_t*)(uintptr_t)at;
    if (value < (uint64_t)(uintptr_t)__text_start + 8 || value >= (uint64_t)(uintptr_t)__eh_frame_start ||
        !after_call(value)) continue;
    if (n > 470) {
      line[n++] = '\n';
      (void)write(log_fd, line, n);
      n = put(line, 0, "[PS4-REACT] crash stack");
    }
    n = put(line, n, " ");
    n = hex(line, n, value);
    ++found;
  }
  line[n++] = '\n';
  (void)write(log_fd, line, n);
  fsync(log_fd);
}

void ps4_crash_install(int fd) {
  log_fd = fd;
  const struct freebsd_sigaction action = {on_fault, kSigInfo | kResetHand, {0, 0, 0, 0}};
  /* FreeBSD's numbers: SIGILL, SIGABRT, SIGFPE, SIGBUS, SIGSEGV, SIGSYS. */
  static const int signals[] = {4, 6, 8, 10, 11, 12};
  for (size_t i = 0; i < sizeof signals / sizeof signals[0]; ++i) sigaction(signals[i], &action, NULL);
}
