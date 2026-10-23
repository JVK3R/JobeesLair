// A game's fakelib, as ShadowMount+ 1.7 sets it per title (0.5.1). A backported image carries its own fakelib
// (system libraries for older firmware); ShadowMount mounts it into the game's sandbox on every launch, and on a
// console new enough for the game it can crash it (CE-107098-5). The Library's Options turn it off or back on:
// /api/v1/games/fakelib saves the title's mode in ShadowMount's config.ini for its next launch, no restart.
// Each request pauses the download in progress for the moment it takes: `queue` is the download queue
// (download-queue.js quietNetwork), handed in by the screen that asks.

import { Http } from '@ps5-react/core';
import { shadowRequest } from './shadowmount.js';

  var PS5_TITLE = /^PPSA\d{5}$/;
  var quiet = (queue, reason, work) => queue?.quietNetwork ? queue.quietNetwork(reason, work) : work();
  // { titleId, mode ("full" | "emulators" | "disabled"), override ("default" | a mode), canToggle }, or null
  // when ShadowMount does not know the game or cannot say (an older ShadowMount, not running).
  function fakelibState(reply, titleId) {
    const game = reply?.game ?? reply;
    if (!game || typeof game !== "object" || typeof game.fakelib_mode !== "string") return null;
    return { titleId, mode: game.fakelib_mode, override: game.fakelib_mode_override || "default", canToggle: game.can_toggle_fakelib !== false };
  }
  async function readFakelib(titleId, queue) {
    if (!PS5_TITLE.test(titleId || "")) return null;
    try {
      return fakelibState(await quiet(queue, `fakelib of ${titleId}`, () => shadowRequest(Http, "games/info", { title_id: titleId })), titleId);
    } catch (error) {
      console.log(`[fakelib] ${titleId}: not read: ${error.message}`);
      return null;
    }
  }
  // "disabled" turns it off; "default" goes back to ShadowMount's default (normally full). Resolves with the new state.
  async function setFakelib(titleId, mode, queue) {
    const reply = await quiet(queue, `fakelib ${mode} for ${titleId}`, () => shadowRequest(Http, "games/fakelib", { title_id: titleId, mode }));
    console.log(`[fakelib] ${titleId}: ${mode} saved (now ${reply?.fakelib_mode ?? "?"}), from its next launch`);
    return fakelibState(reply, titleId) ?? { titleId, mode: mode === "disabled" ? "disabled" : "full", override: mode, canToggle: true };
  }

export { fakelibState, readFakelib, setFakelib };
