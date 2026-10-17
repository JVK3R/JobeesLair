// The app's link health (the checker itself is state/link-health.js): kept in link-health.json, checked on
// the download queue's terms (lendNetwork in the background, quietNetwork when the gamer asks), and asked
// for when someone looks at a game:
//   - its page: SETTLE_MS after it opens (not for a page passed through on the way elsewhere), then every
//     AGAIN_MS while it stays open; only links whose last verdict has run out are asked again (TTL)
//   - its quick preview on a catalog card, once, after the same settle
//   - "Check link health" in its source list, every link at once
// A download that fails with "gone" reports its link too (download-queue.js reportLink).

import { useEffect, useState } from 'react';
import { createLinkHealth, onLinkReport } from './link-health.js';
import { downloadQueue } from './downloads.js';
import { savedList } from './saved.js';
import { Http } from '@ps5-react/core';

  var SETTLE_MS = 2e3;
  var AGAIN_MS = 15 * 6e4;
  var instance = null;
  function linkHealth() {
    return instance ?? (instance = createLinkHealth({
      http: Http,
      store: savedList("link-health.json", "link health"),
      lend: (onYield) => downloadQueue().lendNetwork?.(onYield) ?? null,
      quiet: (reason, work) => {
        const queue = downloadQueue();
        return queue.quietNetwork ? queue.quietNetwork(reason, work) : work();
      }
    }));
  }
  onLinkReport((url, message) => linkHealth().report(url, message));
  // Asks for `key`'s links to be checked in the background (`releases` read when the time comes), again
  // every AGAIN_MS when `repeat`. Returns the function that stops it.
  function watchLinks(key, releases, { settleMs = SETTLE_MS, repeat = true } = {}) {
    let timer = setTimeout(function tick() {
      try {
        linkHealth().want(key, releases());
      } catch (error) {
        console.log(`[links] ${key}: ${error.message}`);
      }
      timer = repeat ? setTimeout(tick, AGAIN_MS) : null;
    }, settleMs);
    return () => {
      if (timer !== null) clearTimeout(timer);
      linkHealth().drop(key);
    };
  }
  /** Checks a game's links while `game` is shown (its page, or a quick preview with `repeat: false`). */
  function useLinkWatch(key, game, options) {
    (0, useEffect)(() => game ? watchLinks(key, () => game.releases || [], options) : void 0, [key]);
  }
  /** `releases` with what is known of their links (link-health.js overlay); re-renders when that changes. */
  function useHealthyReleases(releases) {
    const health = linkHealth();
    const [, setVersion] = (0, useState)(health.version);
    (0, useEffect)(() => health.subscribe(setVersion), []);
    return health.overlay(releases);
  }
  /** How the check of `key`'s links stands (link-health.js progressOf), updated as it goes. */
  function useLinkCheck(key) {
    const health = linkHealth();
    const [progress, setProgress] = (0, useState)(() => health.progressOf(key));
    (0, useEffect)(() => {
      setProgress(health.progressOf(key));
      return health.subscribe(() => setProgress(health.progressOf(key)));
    }, [key]);
    return progress;
  }
  /** Checks every link of `releases` now; resolves with the counts (or null). */
  var checkLinksNow = (key, releases) => linkHealth().checkNow(key, releases);

export { checkLinksNow, linkHealth, useHealthyReleases, useLinkCheck, useLinkWatch, watchLinks };
