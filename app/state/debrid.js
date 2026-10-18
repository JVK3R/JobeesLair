// Debrid providers (TorBox for now; its API is services/torbox.js): the API key and what was learned with
// it, kept in debrid.json; which sources it can take; the "TorBox Instant" check; and the resolver the
// download queue calls for a source marked `debrid` (download-sources.js), so a resumed download asks
// TorBox for a fresh link and the key never goes into downloads.json.
//
// debrid.json: { torbox: { key, account: { plan, planName, premium, expiresAt, checkedAt },
//   hosters: { at, list }, items: { <md5 of link>: { kind, id, at } } } }
// The console has no keychain: the key sits in the app's own data folder like its other settings, is shown
// only as its last four characters, and goes nowhere but api.torbox.app (never to the phone companion,
// never into a log line).
//
// The network (ps5-react docs/NETWORKING.md) runs one task at a time, so like link health this asks the
// download queue first: a background check borrows it only while nothing downloads (`lend`, the queue's
// lendNetwork); a check the gamer asks for pauses the download meanwhile (`quiet`, its quietNetwork).

import { useEffect, useState } from 'react';
import { createTorBox, hostSupported, isMagnet, md5, validKey } from '../services/torbox.js';
import { cancellation, sourceKind } from './download-sources.js';
import { savedList } from './saved.js';
import { Http } from '@ps5-react/core';

  var HOSTERS_MS = 24 * 36e5;
  var INSTANT_MS = 30 * 6e4;
  var KEPT_ITEMS = 200;
  var store = null;
  var saved = () => store ?? (store = savedList("debrid.json", "debrid settings"));
  var record = () => saved().get().torbox ?? {};
  function update(patch) {
    const next = { ...record(), ...patch };
    for (const name of Object.keys(next)) if (next[name] === void 0) delete next[name];
    saved().set({ ...saved().get(), torbox: next });
  }
  var keyOf = () => typeof record().key === "string" ? record().key : "";
  var client = null;
  var torbox = () => client ?? (client = createTorBox({ http: Http, key: keyOf }));
  /** Uses `api` (a createTorBox) in place of the runtime's (tests); null puts the runtime's back. */
  function setTorBoxClient(api) {
    client = api;
  }
  var configured = () => Boolean(keyOf());
  // The key as Settings shows it: its last four characters.
  var masked = (key) => key ? `•••• ${key.slice(-4)}` : "";
  /** Saves the API key (trimmed; empty removes it). Throws on one that cannot be a TorBox key. */
  function setTorBoxKey(value) {
    const key = String(value || "").trim();
    if (key && !validKey(key)) throw new Error("That doesn't look like a TorBox API key: it is 36 letters, digits and dashes, on torbox.app under Settings.");
    if (key === keyOf()) return;
    update({ key: key || void 0, account: void 0, items: void 0 });
    instant.clear();
  }
  // The hosts TorBox lists, kept for the rows; an empty answer says nothing (the rows treat it as unknown).
  function saveHosters(list) {
    if (Array.isArray(list) && list.length) update({ hosters: { at: Date.now(), list } });
  }
  /** "Test Connection": the account (plan, expiry) and the hosts TorBox supports, saved for the rows. */
  async function testTorBox({ quiet = (_reason, work) => work() } = {}) {
    return quiet("TorBox account check", async () => {
      const account = await torbox().me();
      update({ account: { ...account, checkedAt: Date.now() } });
      try {
        saveHosters(await torbox().hosters({ fresh: true }));
      } catch (error) {
        console.log(`[debrid] TorBox hosts not read: ${error.message}`);
      }
      return account;
    });
  }
  var listeners = /* @__PURE__ */ new Set();
  var notify = () => {
    for (const listener of listeners) listener();
  };
  /** { configured, masked, account } as saved; re-renders when it changes. */
  function useDebrid() {
    const torboxState = saved().useList().torbox ?? {};
    return { configured: Boolean(torboxState.key), masked: masked(torboxState.key), account: torboxState.account ?? null };
  }

  // The links of a release TorBox would fetch: its own, or each part's first source in a set.
  var sourcesOf = (release) => release.parts ? release.parts.map((part) => part.sources?.[0]).filter(Boolean) : [release];
  var linkOf = (source) => source.browserUrl || source.url || "";
  /**
   * Whether TorBox can take `release`: set up, the release downloadable, every link a file host page (one
   * the app already downloads straight, or a split manifest, has nothing to gain) on a host TorBox lists as
   * working, or any host while its list is not known yet (TorBox says so itself if not).
   */
  function debridSupports(release) {
    if (!configured() || !release || release.unavailableReason || release.debrid) return false;
    const sources = sourcesOf(release);
    if (!sources.length || (release.parts && sources.length !== release.parts.length)) return false;
    const hosters = record().hosters?.list ?? null;
    return sources.every((source) => {
      const link = linkOf(source);
      if (!link || source.manifestUrl) return false;
      if (isMagnet(link)) return true;
      try {
        if (sourceKind(source) === "direct") return false;
      } catch {
        return false;
      }
      return hostSupported(hosters, link) !== false;
    });
  }
  // `release` fetched through TorBox: each link marked `debrid` (the queue's resolver asks TorBox for it), its
  // own id so its download is its own. The same object for the same release, so the button's hooks hold.
  var variants = /* @__PURE__ */ new WeakMap();
  function debridSource(release) {
    let variant = variants.get(release);
    if (!variant) {
      const mark = (source) => ({ ...source, debrid: { service: "torbox" } });
      // What the host's link answered (link health) says nothing about TorBox's copy, so it is left behind.
      const { linkHealth: _health, health: _rank, ...plain } = release;
      variant = plain.parts ? { ...plain, id: `${plain.id}~torbox`, debrid: { service: "torbox" }, parts: plain.parts.map((part) => ({ ...part, sources: [mark(part.sources[0]), ...part.sources.slice(1)] })) } : { ...mark(plain), id: `${plain.id}~torbox` };
      variants.set(release, variant);
    }
    return variant;
  }
  // TorBox's item for a link, so asking again (a resume, a retry) finds the same one instead of adding it twice.
  function remember(hash, entry) {
    const items = Object.entries({ ...record().items ?? {}, [hash]: { kind: entry.kind, id: entry.id, at: Date.now() } });
    items.sort((a, b) => b[1].at - a[1].at);
    update({ items: Object.fromEntries(items.slice(0, KEPT_ITEMS)) });
  }
  /** What download-sources.js calls for a source marked `debrid`: { url } of TorBox's direct link. */
  var debridResolver = {
    async resolve(source, { signal } = {}) {
      if (!configured()) throw new Error("TorBox isn't set up any more. Add its API key in Settings, or choose another source.");
      const link = linkOf(source);
      const hash = md5(link);
      const result = await torbox().resolve(link, { known: record().items?.[hash], signal, onItem: (entry) => remember(hash, entry) });
      remember(hash, result);
      console.log(`[debrid] TorBox ${result.kind} ${result.id}: file ${result.fileId} ready`);
      return { url: result.url };
    }
  };

  // "TorBox Instant": which links TorBox already holds (so they start at once), asked once per half hour per
  // link, only while no download needs the network. Its hosts list is refreshed in the same turn once a day.
  var instant = /* @__PURE__ */ new Map();
  var asking = null;
  async function askInstant(links, lend) {
    const lease = lend(() => asking?.cancel());
    if (!lease) return false;
    const run = cancellation();
    asking = run;
    try {
      if (Date.now() - (record().hosters?.at ?? 0) > HOSTERS_MS) {
        try {
          saveHosters(await torbox().hosters({ fresh: true, signal: run.signal }));
        } catch (error) {
          console.log(`[debrid] TorBox hosts not read: ${error.message}`);
        }
      }
      const held = await torbox().checkCachedLinks(links, { signal: run.signal });
      const at = Date.now();
      for (const link of links) instant.set(link, { held: held.has(link), at });
      notify();
      return true;
    } catch (error) {
      if (!run.signal.aborted) console.log(`[debrid] TorBox cache check: ${error.message}`);
      return false;
    } finally {
      asking = null;
      lease();
    }
  }
  /** Whether TorBox holds every link of `release` (true), not all (false), or not known yet (null). */
  function heldByTorBox(release) {
    const states = sourcesOf(release).map((source) => instant.get(linkOf(source)));
    if (states.some((state) => !state || Date.now() - state.at > INSTANT_MS)) return null;
    return states.every((state) => state.held);
  }
  /** Asks TorBox which of `releases`' links it holds (while `lend` lets it); re-renders as it learns. */
  function useTorBoxInstant(releases, lend) {
    const [, setVersion] = (0, useState)(0);
    const links = configured() ? [...new Set(releases.filter(debridSupports).flatMap((release) => sourcesOf(release).map(linkOf)))] : [];
    const stale = links.filter((link) => !instant.has(link) || Date.now() - instant.get(link).at > INSTANT_MS);
    (0, useEffect)(() => {
      const listener = () => setVersion((value) => value + 1);
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, []);
    (0, useEffect)(() => {
      if (stale.length && !asking) void askInstant(stale, lend);
    }, [stale.join("\n")]);
  }

export { askInstant as askTorBoxInstant, debridResolver, debridSource, debridSupports, heldByTorBox, masked, setTorBoxClient, setTorBoxKey, testTorBox, useDebrid, useTorBoxInstant };
