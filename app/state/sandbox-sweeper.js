// Hands sandbox-sweeper.elf (app/native/sandbox_sweeper.c) to the payload loader once per launch. Added in
// 0.5.0 Pre Release 4: a closed Jobee'sLair left its sandbox folders behind with /data still mounted in
// them, and ShadowMount+ answered "Device busy" to every unmount and refresh until it was reloaded. The app
// is killed when it closes, so it cannot clean up after itself; the sweeper outlives it, waits for the close,
// then releases what was left (see the C file for exactly what it touches). Its log is
// /data/ps5-react/<TITLE>/logs/sandbox.log.

import { Payloads, Platform } from '@ps5-react/core';
import { TITLE_ID } from '../version.js';

  var SWEEPER = "/app0/sandbox-sweeper.elf";
  // A moment after launch: the store comes up first, and sending blocks for up to a few seconds.
  var DELAY_MS = 8e3;
  var sent = false;
  function startSandboxSweeper({ send = (path, options) => Payloads.send(path, options), platform = Platform.OS, delayMs = DELAY_MS, log = (line) => console.log(line) } = {}) {
    if (platform !== "ps5" || sent) return () => {};
    sent = true;
    const timer = setTimeout(() => {
      try {
        const result = send(SWEEPER, { request: `SWP1\n${TITLE_ID}\n`, answer: false });
        log(result.ok ? "sandbox sweeper: waiting for the app to close" : `sandbox sweeper not sent: ${result.error}`);
      } catch (error) {
        log(`sandbox sweeper not sent: ${error?.message}`);
      }
    }, delayMs);
    return () => {
      // Taken down before it was sent (a remount in development): the next start sends it.
      clearTimeout(timer);
      sent = false;
    };
  }

export { startSandboxSweeper };
