// What ShadowMount+ has mounted and how its games' sources are doing, kept fresh while a screen watches
// (the library, Make Room). It asks in the background only (shadowmount.js createShadowClient): never
// while a download holds the runtime's one network task, never twice at once, and not for a minute after
// ShadowMount stopped answering, so the last answer stays until a new one comes.
//
// Health, per title, from the answers and the drives:
//   "sourceLost"     ShadowMount has an image mounted whose file it can no longer reach (a drive pulled)
//   "sourceMissing"  ShadowMount's game record points at a file or folder that is not on the drive
//   "checking"       ShadowMount has the image but has not finished checking it
//   null             nothing wrong
// `mounted` is true while ShadowMount keeps a title's image mounted: with Jobee'sLair open that is a game
// it still holds, and such a game is never moved or deleted.

import { useEffect, useState } from 'react';
import { launchedAt, within2 } from './shadowmount.js';

  var EVERY_MS = 2e4;
  function createMountMonitor({ client, fs, parse = () => null, onLaunch = () => {
  }, every = EVERY_MS, now = Date.now, log = console.log }) {
    let state = { at: 0, reachable: null, images: [], games: [], titles: {} };
    const listeners = /* @__PURE__ */ new Set();
    let timer = null;
    let inflight = null;
    const exists = (path) => {
      try {
        return Boolean(path && fs.stat(path));
      } catch {
        return false;
      }
    };
    function healthOf(game, images) {
      const own = game.path ? images.filter((image) => image.path === game.path || image.path?.startsWith(`${game.path}/`)) : [];
      const mounted = own.some((image) => image.mounted) || game.mounted === true && game.source_type !== "pkg";
      let problem = null;
      if (own.some((image) => image.mounted && (image.source_available === false || !exists(image.path)))) problem = "sourceLost";
      else if (game.source_type !== "pkg" && game.managed !== false && game.path && !exists(game.path)) problem = "sourceMissing";
      else if (own.some((image) => image.complete === false)) problem = "checking";
      return { path: game.path ?? null, mounted, problem, lastLaunch: launchedAt(game, parse), sourceType: game.source_type ?? null };
    }
    async function refresh() {
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const { images = [] } = await client.background("images", {});
          const { games = [] } = await client.background("games", { include_size: false });
          const titles = {};
          for (const game of games) if (game?.title_id) titles[game.title_id] = healthOf(game, images);
          for (const [title, health] of Object.entries(titles)) {
            if (health.lastLaunch) onLaunch(title, health.lastLaunch);
            if (health.problem && state.titles[title]?.problem !== health.problem) log(`[mounts] ${title}: ${health.problem} (${health.path})`);
          }
          state = { at: now(), reachable: true, images, games, titles };
        } catch (error) {
          if (error.skipped) return state;
          if (error.unreachable) state = { ...state, at: now(), reachable: false };
          else log(`[mounts] not read: ${error.message}`);
        } finally {
          inflight = null;
        }
        for (const listener of [...listeners]) listener(state);
        return state;
      })();
      return inflight;
    }
    return {
      refresh,
      snapshot: () => state,
      // The images ShadowMount has mounted now among `paths` (a game's files), from the last answer.
      mountedAmong: (paths, root) => state.images.filter((image) => image.mounted && within2(image.path, paths, root)),
      subscribe(listener) {
        listeners.add(listener);
        if (!timer) timer = setInterval(() => void refresh(), every);
        void refresh();
        return () => {
          listeners.delete(listener);
          if (!listeners.size && timer) {
            clearInterval(timer);
            timer = null;
          }
        };
      }
    };
  }
  var instance = null;
  function mountMonitor(make) {
    if (!instance && make) instance = make();
    return instance;
  }
  /** ShadowMount's mounts and each title's health, polled while the calling screen is up. */
  function useMounts() {
    const monitor = mountMonitor();
    const [state, setState] = (0, useState)(() => monitor?.snapshot() ?? { at: 0, reachable: null, images: [], games: [], titles: {} });
    (0, useEffect)(() => monitor ? monitor.subscribe(setState) : void 0, [monitor]);
    return state;
  }

export { createMountMonitor, mountMonitor, useMounts };
