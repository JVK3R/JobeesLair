// Each game card's readiness stage, from one subscription to the queue for every card. A card hears only
// when its own game's stage changes, so a download's progress does not redraw the store's grid.

import { useEffect, useState } from 'react';
import { downloadQueue } from './downloads.js';
import { cardReadiness } from './readiness.js';

  var listeners = /* @__PURE__ */ new Map();
  var current = /* @__PURE__ */ new Map();
  var keys = /* @__PURE__ */ new Map();
  var subscribed = false;
  function update(jobs) {
    const byGame = /* @__PURE__ */ new Map();
    for (const job2 of jobs) {
      if (!byGame.has(job2.gameId)) byGame.set(job2.gameId, []);
      byGame.get(job2.gameId).push(job2);
    }
    const tell = (id, ready) => {
      for (const listener of listeners.get(id) ?? []) listener(ready);
    };
    for (const [id, list] of byGame) {
      const ready = cardReadiness(list);
      const key = ready ? `${ready.stage}|${ready.tone}` : "";
      if (keys.get(id) === key) continue;
      keys.set(id, key);
      current.set(id, ready);
      tell(id, ready);
    }
    for (const id of [...keys.keys()]) {
      if (byGame.has(id)) continue;
      keys.delete(id);
      current.delete(id);
      tell(id, null);
    }
  }
  function start() {
    if (subscribed) return;
    subscribed = true;
    try {
      downloadQueue().subscribe(update);
    } catch {
    }
  }
  /** The readiness that speaks for game `gameId`'s card (state/readiness.js), or null when it has no job. */
  function useCardReadiness(gameId) {
    const [ready, setReady] = (0, useState)(() => {
      start();
      return current.get(gameId) ?? null;
    });
    (0, useEffect)(() => {
      start();
      if (!listeners.has(gameId)) listeners.set(gameId, /* @__PURE__ */ new Set());
      const own = listeners.get(gameId);
      own.add(setReady);
      setReady(current.get(gameId) ?? null);
      return () => {
        own.delete(setReady);
      };
    }, [gameId]);
    return ready;
  }

export { useCardReadiness };
