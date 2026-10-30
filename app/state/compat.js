// What players' consoles saw when they started a game (0.5.4): every game's numbers as state/online.js last heard them
// (compat.json, from the online Worker's GET /v1/compat), for the game page's Details and the phone. The numbers are
// consoles, each counted once a game: its latest launch of it, as ShadowMount saw it, started or not. Shown on all
// firmware, and on this console's own (as the app shows firmware: "13.59").

import { compatStore } from './online.js';
import { deviceFacts } from './device.js';
import { consoleFirmware, firmwareText } from './firmware.js';

  var count = (n) => Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  /**
   * `data`: compat.json's {titles}. Returns { started, failed, here } for `titleId` (`here`: the same on `firmware`'s
   * family, or null when no console on it said), or null when no console said anything about it.
   */
  function compatOf(data, titleId, firmware) {
    const game = data?.titles?.[titleId];
    if (!game || typeof game !== "object") return null;
    const started = count(game.s), failed = count(game.f);
    if (!started && !failed) return null;
    const current = consoleFirmware(firmware);
    const family = current ? firmwareText(current) : null;
    const mine = family && Array.isArray(game.fw?.[family]) ? game.fw[family] : null;
    const here = mine && count(mine[0]) + count(mine[1]) > 0 ? { firmware: family, started: count(mine[0]), failed: count(mine[1]) } : null;
    return { started, failed, here };
  }
  /** compatOf for this console, read now (the phone companion). */
  var playersOf = (titleId) => compatOf(compatStore().get(), titleId, deviceFacts().firmware);
  /** The same, drawn again when new numbers come in. */
  function usePlayers(titleId) {
    return compatOf(compatStore().useList(), titleId, deviceFacts().firmware);
  }

export { compatOf, playersOf, usePlayers };
