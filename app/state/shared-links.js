// Dead links found by any player, for every player (0.5.5; api.jobees.org /v1/links, tools/online/worker.js). A
// download that fails because its catalog link is gone (HTTP 404 or 410, Archive.org's refusal) reports that link,
// and one that finishes reports it working (download-queue.js reportOutcome); the server calls a link dead once two
// players found it gone since anyone last downloaded from it. The list comes down once a launch and is kept
// (shared-links.json), and link health ranks those links last and says why (link-health.js sharedDead), as it does a
// link this console checked itself, which works for the host pages a HEAD can't ask.
//
// Only the catalog's own link goes up, never a link the player typed in or the file link a host handed out, and
// nothing about the console; only with stats on (state/online.js).
//
// 0.5.7 (PS4 Beta 6): the server's list comes as JLX1 (state/jlx.js), as the catalogs do; a plain one still reads.

import { Http } from '@ps5-react/core';
import { ONLINE_URL, online } from './online.js';
import { savedList } from './saved.js';
import { readJlxAsync } from './jlx.js';
import { log } from '../services/logger.js';

  var MAX_LINKS = 5e3;
  var store = null;
  var dead = null;
  var listeners = /* @__PURE__ */ new Set();
  var nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));
  function known() {
    if (dead) return dead;
    store ?? (store = savedList("shared-links.json", "shared dead links"));
    const saved = store.get();
    dead = new Set(Array.isArray(saved?.dead) ? saved.dead.filter((url) => typeof url === "string").slice(0, MAX_LINKS) : []);
    return dead;
  }
  /** Whether other players found `url` (a catalog link, as the catalog has it) gone. */
  var sharedDead = (url) => Boolean(url) && known().has(url);
  function subscribeShared(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  /** Asks the server for the list now; keeps the last one when it can't. */
  async function refreshShared({ http = Http, url = ONLINE_URL, now = Date.now } = {}) {
    try {
      const response = await http.request(`${url}/v1/links/dead`, { maxBytes: 2 * 1024 * 1024 });
      if (!response.ok) return log("links", `the shared dead links didn't come: HTTP ${response.status}`);
      const answer = JSON.parse(await readJlxAsync(await response.text(), nextFrame));
      const list = Array.isArray(answer?.dead) ? answer.dead.filter((link) => typeof link === "string").slice(0, MAX_LINKS) : null;
      if (!list) return;
      known();
      const changed = list.length !== dead.size || list.some((link) => !dead.has(link));
      dead = new Set(list);
      store.set({ at: now(), dead: list });
      if (changed) for (const listener of [...listeners]) listener();
    } catch (error) {
      log("links", `the shared dead links didn't come: ${error.message}`);
    }
  }
  /** Tells the server how a catalog link did: `ok` false when it was gone, true when a download from it finished. */
  function reportShared(link, ok, { http = Http, url = ONLINE_URL, enabled = () => online().enabled() } = {}) {
    if (!link || !/^https:\/\//i.test(link) || link.length > 2048 || !enabled()) return;
    void http.request(`${url}/v1/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link, ok: Boolean(ok) }),
      maxBytes: 1024
    }).then((response) => {
      if (!response.ok) log("links", `a link's outcome not sent: HTTP ${response.status}`);
    }, (failure) => log("links", `a link's outcome not sent: ${failure?.message}`));
  }

export { refreshShared, reportShared, sharedDead, subscribeShared };
