// Hands sandbox-sweeper.elf (app/native/sandbox_sweeper.c) to the payload loader once per launch. Added in
// 0.5.0 Pre Release 4: a closed Jobee'sLair left its sandbox folders behind with /data still mounted in
// them, and ShadowMount+ answered "Device busy" to every unmount and refresh until it was reloaded. The app
// is killed when it closes, so it cannot clean up after itself; the sweeper outlives it. As it starts it
// clears what earlier launches left, then waits for the close and clears this launch's folder within a second
// (see the C file for exactly what it touches). Its log is /data/ps5-react/<TITLE>/logs/sandbox.log.
// 0.5.3: sent as the app starts (index.jsx Boot), under the intro. It went 8 s after the store showed, so a
// launch closed before that (on the intro or the startup notice) left its folder, and opening the app again
// at once locked the image in ShadowMount+ (three such launches on the console, 2026-10-25).

import { Payloads, Platform } from '@ps5-react/core';
import { TITLE_ID } from '../version.js';

  var SWEEPER = "/app0/sandbox-sweeper.elf";
  // At once. Sending blocks while the ELF goes to the loader (it does not wait for an answer); the log line
  // says for how long.
  var DELAY_MS = 0;
  var sent = false;
  function startSandboxSweeper({ send = (path, options) => Payloads.send(path, options), platform = Platform.OS, delayMs = DELAY_MS, log = (line) => console.log(line) } = {}) {
    if (platform !== "ps5" || sent) return () => {};
    sent = true;
    const timer = setTimeout(() => {
      try {
        const since = Date.now();
        const result = send(SWEEPER, { request: `SWP1\n${TITLE_ID}\n`, answer: false });
        log(result.ok ? `sandbox sweeper: waiting for the app to close (sent in ${Date.now() - since} ms)` : `sandbox sweeper not sent: ${result.error}`);
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
