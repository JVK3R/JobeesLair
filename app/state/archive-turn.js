// The console's extractor runs one archive at a time (ps5-react native/shared/archives.cpp) and turns a second away
// at once: "An archive task is already running; poll its completion first." 0.5.3: Homebrew installs failed that way
// while a game download was being extracted (one player's fifteen in a minute); the one that asks second now waits.
var BUSY = /archive task is already running/;
var TURN_MS = 2e3;
var stoppedError = () => Object.assign(new Error("Stopped while it waited to extract."), { name: "AbortError" });
/**
 * archives.extract(options) once the extractor is free. `turn.waiting()` runs once, when it has to wait;
 * `turn.stopped()` is asked before every try, and true ends the wait with an AbortError. `turn.pause(ms)` waits
 * between tries; without one, `turn.wake()` cuts the wait short while it lasts (a cancel calls it).
 */
async function extractInTurn(archives, options, turn = {}) {
  const pause = turn.pause ?? ((ms) => new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    turn.wake = () => {
      clearTimeout(timer);
      resolve();
    };
  }));
  for (let told = false; ; ) {
    if (turn.stopped?.()) throw stoppedError();
    try {
      return archives.extract(options);
    } catch (error) {
      if (!BUSY.test(String(error?.message ?? error))) throw error;
    }
    if (!told) {
      told = true;
      turn.waiting?.();
    }
    await pause(TURN_MS);
    turn.wake = null;
  }
}
export { extractInTurn };
