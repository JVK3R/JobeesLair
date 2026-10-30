// MODIFIED (0.5.1): magnet links (a feed's torrents, download-sources.js kind "torrent") go through either
// service: TorBox holds torrents and packs one of many files as a zip; AllDebrid unlocks one file of it. The
// resolver's answer then names the bytes' own size (the listed one is the torrent's), or that they are a repack.
// MODIFIED (0.5.1): AllDebrid beside TorBox (services/alldebrid.js), its key and account under debrid.json's
// "alldebrid". One provider at a time: TorBox when its key is set, else AllDebrid (activeService). A download
// remembers which one it went through (its sources' debrid.service), so a resume asks the same one.
//
// Debrid providers (TorBox; its API is services/torbox.js): the API key and what was learned with
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
import { createAllDebrid, hostSupported as allDebridHost, validKey as validAllDebridKey } from '../services/alldebrid.js';
import { cancellation, sourceKind } from './download-sources.js';
import { savedList } from './saved.js';
import { formatDate2 } from '../i18n/core.js';
import { log, logger } from '../services/logger.js';
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
  var torbox = () => client ?? (client = createTorBox({ http: Http, key: keyOf, log: (message) => log("torbox", message) }));
  // The key is never to be written to the log, in whatever line it might turn up.
  try {
    logger().addSecret(keyOf());
  } catch {
  }
  // AllDebrid: the same, under "alldebrid".
  var allRecord = () => saved().get().alldebrid ?? {};
  function updateAll(patch) {
    const next = { ...allRecord(), ...patch };
    for (const name of Object.keys(next)) if (next[name] === void 0) delete next[name];
    saved().set({ ...saved().get(), alldebrid: next });
  }
  var allKeyOf = () => typeof allRecord().key === "string" ? allRecord().key : "";
  var allClient = null;
  var alldebrid = () => allClient ?? (allClient = createAllDebrid({ http: Http, key: allKeyOf, log: (message) => log("alldebrid", message) }));
  try {
    logger().addSecret(allKeyOf());
  } catch {
  }
  /** Uses `api` (a createAllDebrid) in place of the runtime's (tests); null puts the runtime's back. */
  function setAllDebridClient(api) {
    allClient = api;
  }
  /** The provider debrid buttons use now: "torbox" while its key is set, else "alldebrid", else null. */
  var activeService = () => keyOf() ? "torbox" : allKeyOf() ? "alldebrid" : null;
  var serviceName = (service) => service === "alldebrid" ? "AllDebrid" : "TorBox";
  /** Saves the AllDebrid API key (trimmed; empty removes it). Throws on one that cannot be an AllDebrid key. */
  function setAllDebridKey(value) {
    const key = String(value || "").trim();
    if (key && !validAllDebridKey(key)) throw new Error("That doesn't look like an AllDebrid API key: letters and digits, from alldebrid.com under Account, API keys.");
    if (key === allKeyOf()) return;
    try {
      logger().removeSecret(allKeyOf());
      logger().addSecret(key);
    } catch {
    }
    log("alldebrid", key ? "API key set" : "API key removed");
    updateAll({ key: key || void 0, account: void 0, hosters: void 0 });
  }
  /** "Test connection" for AllDebrid: the account and the hosts it can use, saved for the rows. */
  async function testAllDebrid({ quiet = (_reason, work) => work() } = {}) {
    return quiet("AllDebrid account check", async () => {
      const account = await alldebrid().me();
      updateAll({ account: { ...account, checkedAt: Date.now() } });
      try {
        const list = await alldebrid().hosters();
        if (list.length) updateAll({ hosters: { at: Date.now(), list } });
      } catch (error) {
        console.log(`[debrid] AllDebrid hosts not read: ${error.message}`);
      }
      return account;
    });
  }
  /** Uses `api` (a createTorBox) in place of the runtime's (tests); null puts the runtime's back. */
  function setTorBoxClient(api) {
    client = api;
  }
  var configured = () => Boolean(activeService());
  // The key as Settings shows it: its last four characters.
  var masked = (key) => key ? `•••• ${key.slice(-4)}` : "";
  /** Saves the API key (trimmed; empty removes it). Throws on one that cannot be a TorBox key. */
  function setTorBoxKey(value) {
    const key = String(value || "").trim();
    if (key && !validKey(key)) throw new Error("That doesn't look like a TorBox API key: it is 36 letters, digits and dashes, on torbox.app under Settings.");
    if (key === keyOf()) return;
    try {
      logger().removeSecret(keyOf());
      logger().addSecret(key);
    } catch {
    }
    log("torbox", key ? "API key set" : "API key removed");
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
    return debridView(saved().useList());
  }
  /** The same, read now (the phone companion's Settings, 0.5.4). */
  var debridSnapshot = () => debridView(saved().get());
  function debridView(all) {
    const torboxState = all.torbox ?? {};
    const allState = all.alldebrid ?? {};
    return {
      configured: Boolean(torboxState.key),
      masked: masked(torboxState.key),
      account: torboxState.account ?? null,
      allDebrid: { configured: Boolean(allState.key), masked: masked(allState.key), account: allState.account ?? null },
      active: torboxState.key ? "torbox" : allState.key ? "alldebrid" : null
    };
  }
  /**
   * What an account looks like from its last connection test (`t2` the message function; Settings and the phone's
   * Settings): its plan and how long it runs, or free; null before any test.
   */
  function debridStatus(t2, service, account) {
    if (!account) return null;
    if (service === "alldebrid") {
      if (!account.premium) return t2("settings.alldebrid.free");
      return account.expiresAt ? t2("settings.alldebrid.okUntil", { date: formatDate2(account.expiresAt.slice(0, 10)) }) : t2("settings.alldebrid.ok");
    }
    const plan = t2(`settings.debrid.plan.${account.planName}`);
    if (!account.premium) return t2("settings.debrid.free");
    return account.expiresAt ? t2("settings.debrid.okUntil", { plan, date: formatDate2(account.expiresAt.slice(0, 10)) }) : t2("settings.debrid.ok", { plan });
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
    const service = activeService();
    const hosters = (service === "alldebrid" ? allRecord() : record()).hosters?.list ?? null;
    return sources.every((source) => {
      const link = linkOf(source);
      if (!link || source.manifestUrl) return false;
      if (isMagnet(link)) return true;
      try {
        if (sourceKind(source) === "direct") return false;
      } catch {
        return false;
      }
      return (service === "alldebrid" ? allDebridHost(hosters, link) : hostSupported(hosters, link)) !== false;
    });
  }
  // `release` fetched through TorBox: each link marked `debrid` (the queue's resolver asks TorBox for it), its
  // own id so its download is its own. The same object for the same release, so the button's hooks hold.
  var variants = /* @__PURE__ */ new WeakMap();
  function debridSource(release) {
    const service = activeService() ?? "torbox";
    let variant = variants.get(release);
    if (!variant || variant.debrid?.service !== service) {
      const mark = (source) => ({ ...source, debrid: { service } });
      // What the host's link answered (link health) says nothing about TorBox's copy, so it is left behind.
      const { linkHealth: _health, health: _rank, ...plain } = release;
      variant = plain.parts ? { ...plain, id: `${plain.id}~${service}`, debrid: { service }, parts: plain.parts.map((part) => ({ ...part, sources: [mark(part.sources[0]), ...part.sources.slice(1)] })) } : { ...mark(plain), id: `${plain.id}~${service}` };
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
  /**
   * What download-sources.js calls for a source marked `debrid`: { url } of the service's direct link. For a
   * torrent, also `expectedBytes` (the file's own size, null when not known: the listing's is the whole
   * torrent's) and `repacked` (TorBox's zip of many files: no listed checksum applies).
   */
  var debridResolver = {
    async resolve(source, { signal } = {}) {
      const link = linkOf(source);
      const torrent = isMagnet(link);
      if (source.debrid?.service === "alldebrid") {
        if (!allKeyOf()) throw new Error("AllDebrid isn't set up any more. Add its API key in Settings, or choose another source.");
        const result = torrent ? await alldebrid().resolveMagnet(link, { filename: source.filename, signal }) : await alldebrid().resolve(link, { signal });
        log("alldebrid", `${torrent ? "torrent" : "link"} unlocked (${md5(link).slice(0, 8)})`);
        return torrent ? { url: result.url, expectedBytes: result.size || null } : { url: result.url };
      }
      if (!keyOf()) throw new Error("TorBox isn't set up any more. Add its API key in Settings, or choose another source.");
      const hash = md5(link);
      const result = await torbox().resolve(link, { known: record().items?.[hash], filename: source.filename, signal, onItem: (entry) => remember(hash, entry) });
      remember(hash, result);
      log("torbox", `${result.kind} ${result.id}: ${result.repacked ? "all files as one zip" : `file ${result.fileId}`} ready (${hash.slice(0, 8)})`);
      return torrent ? { url: result.url, expectedBytes: result.repacked ? null : result.size || null, repacked: Boolean(result.repacked) } : { url: result.url };
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
    if (activeService() !== "torbox") return null;
    const states = sourcesOf(release).map((source) => instant.get(linkOf(source)));
    if (states.some((state) => !state || Date.now() - state.at > INSTANT_MS)) return null;
    return states.every((state) => state.held);
  }
  /** Asks TorBox which of `releases`' links it holds (while `lend` lets it); re-renders as it learns. */
  function useTorBoxInstant(releases, lend) {
    const [, setVersion] = (0, useState)(0);
    const links = activeService() === "torbox" ? [...new Set(releases.filter(debridSupports).flatMap((release) => sourcesOf(release).map(linkOf)))] : [];
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

export { activeService, askInstant as askTorBoxInstant, debridResolver, debridSnapshot, debridSource, debridStatus, debridSupports, heldByTorBox, masked, serviceName, setAllDebridClient, setAllDebridKey, setTorBoxClient, setTorBoxKey, testAllDebrid, testTorBox, useDebrid, useTorBoxInstant };
