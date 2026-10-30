/* Copyright (C) 2026 half144 and PS5 React contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Additional attribution term: see LICENSE-ATTRIBUTION.
 * OpenOrbis's musl headers number the clocks as Linux does, but the PS4's libkernel takes FreeBSD's numbers:
 * CLOCK_MONOTONIC (1 on Linux) reached it as CLOCK_VIRTUAL, the process's own CPU time, which hardly moves while
 * the app waits for the display. Every caller (ours, libc++'s steady_clock and its condition variables) goes
 * through these wrappers (ld --wrap, tools/build_ps4.py), which translate.
 * The toolchain's libc++ was also built with Linux's error numbers; see the timed wait below. */
#include <pthread.h>
#include <time.h>

int __real_clock_gettime(clockid_t clock, struct timespec* ts);
int __real_pthread_condattr_setclock(pthread_condattr_t* attr, clockid_t clock);

static clockid_t freebsd_clock(clockid_t clock) {
  switch (clock) {
  case 1: /* MONOTONIC */
  case 4: /* MONOTONIC_RAW */
  case 6: /* MONOTONIC_COARSE */
    return 4;
  case 2: return 15; /* PROCESS_CPUTIME_ID */
  case 3: return 14; /* THREAD_CPUTIME_ID */
  case 5: return 0;  /* REALTIME_COARSE */
  case 7: return 5;  /* BOOTTIME: UPTIME */
  default: return clock;
  }
}

int __wrap_clock_gettime(clockid_t clock, struct timespec* ts) { return __real_clock_gettime(freebsd_clock(clock), ts); }

int __wrap_pthread_condattr_setclock(pthread_condattr_t* attr, clockid_t clock) {
  return __real_pthread_condattr_setclock(attr, freebsd_clock(clock));
}

/* std::condition_variable's timed wait (libc++'s __do_timed_wait, which may not throw) takes any answer but 0 and
 * Linux's ETIMEDOUT (110) for a failure and ends the app, while libkernel reports a timeout as FreeBSD's 60: the
 * first wait_for that ran out stopped Jobee'sLair. This replaces libc++'s weak std::__libcpp_condvar_timedwait,
 * which only that wait calls; QuickJS, built with the toolchain's FreeBSD numbers, calls libkernel directly.
 * tools/build_ps4.py checks that libc++ still expects 110. */
int _ZNSt3__126__libcpp_condvar_timedwaitEP14pthread_cond_tP15pthread_mutex_tP8timespec(
    pthread_cond_t* cond, pthread_mutex_t* mutex, struct timespec* until) {
  const int result = pthread_cond_timedwait(cond, mutex, until);
  return result == 60 ? 110 : result;
}
