// Catalog feeds the player added in Settings: the list (feeds.json), each feed's last good copy (one
// cache file per feed, in feed form) and its refresh state. The catalog reads the caches once, as it
// loads (state/catalog.js), so what a refresh brings in is shown from the next launch.
//
// A feed is its address plus any number of mirrors: other addresses serving the same feed. A feed that
// lists its own `mirrors` brings them along; the player can add more (feed-mirrors.json), from the
// console or the phone. A refresh tries the address that worked last first, then the feed's own address,
// then the mirrors, and stops at the first that gives a usable feed. So a feed whose domain is taken down
// keeps refreshing from a mirror, and when every address is down the last good copy on the console is
// kept. Nothing here touches the download handlers: a feed only ever supplies catalog records.

import { useEffect, useState } from 'react';
import { MAX_MIRRORS, feedDocument, parseFeed, parseFeedAsync, stableKey, stableKeyAsync } from './feed-format.js';
import { isoStamp } from './clock.js';
import { DATA_DIR, LEGACY_DATA_DIR } from './data-dir.js';
import { webURL } from './download-sources.js';
import { savedList } from './saved.js';
import { FileSystem, Http } from '@ps5-react/core';

  // The JS heap is 32 MiB for everything: a few modest feeds, each read whole.
  var MAX_FEEDS = 4, MAX_BYTES = 2 * 1024 * 1024;
  var DIR = `${DATA_DIR}/feeds`;
  // Caches an earlier build left in the old data folder are read until the feed refreshes into this one.
  var LEGACY_DIR = `${LEGACY_DATA_DIR}/feeds`;
  var feedList = savedList("feeds.json", "feeds");
  // The player's mirrors, by feed address: { "<feed url>": ["<mirror url>", …] }.
  var mirrorStore = savedList("feed-mirrors.json", "feed mirrors");
  var cacheFile = (url) => `${DIR}/${stableKey(url)}.json`;
  function readCache(url) {
    for (const path of [cacheFile(url), `${LEGACY_DIR}/${stableKey(url)}.json`]) {
      try {
        const cache = JSON.parse(FileSystem.readFile(path));
        if (cache?.url === url && cache.document) return cache;
      } catch {
      }
    }
    return null;
  }
  // What the catalog loaded from each feed this launch, by URL: a later refresh that differs needs a restart.
  var loaded = /* @__PURE__ */ new Map();
  // Each feed's last good copy, summarized for Settings ({ name, games, fetchedAt, from, mirrors }), so
  // drawing the list never reads a cache file.
  var meta = /* @__PURE__ */ new Map();
  // What each feed's last good copy lists, as [id, direct] pairs: all the live game counter (state/library-count.js)
  // needs, kept apart from the games themselves so counting never touches a cache file.
  var indexes = /* @__PURE__ */ new Map();
  var indexVersion = 0;
  var setIndex = (url, games) => {
    indexes.set(url, games.map(({ game: game2 }) => [game2.id, game2.direct ? 1 : 0]));
    indexVersion++;
  };
  var summary = (cache) => ({ name: cache.name, games: cache.games, fetchedAt: cache.fetchedAt, from: cache.from ?? cache.url, mirrors: Array.isArray(cache.mirrors) ? cache.mirrors : [] });
  // Every listed feed's cached games, validated again: { game, page, releases } as parseFeed gives them.
  function loadFeedGames() {
    const out = [];
    for (const url of feedList.get()) {
      const cache = readCache(url);
      if (!cache) continue;
      try {
        const feed = parseFeed(cache.document, url);
        loaded.set(url, cache.hash);
        meta.set(url, summary(cache));
        setIndex(url, feed.games);
        out.push(...feed.games);
      } catch (error2) {
        console.log(`feeds: cached ${url} unreadable: ${error2.message}`);
      }
    }
    return out;
  }
  // Refresh state per URL: { state: "refreshing" | "ok" | "failed", error, changed }.
  var status = /* @__PURE__ */ new Map();
  var listeners = /* @__PURE__ */ new Set();
  var notify = () => {
    for (const listener of listeners) listener();
  };
  function setStatus(url, value) {
    status.set(url, value);
    notify();
  }
  function checkURL(value) {
    const url = (value || "").trim();
    let parsed;
    try {
      parsed = webURL(url);
    } catch {
      throw new Error("Enter a full http:// or https:// address.");
    }
    if (parsed.path === "/" && !url.endsWith("/")) throw new Error("Enter the feed file's full address, not just its site.");
    return url;
  }
  var hostOf = (url) => {
    try {
      return webURL(url).host;
    } catch {
      return url;
    }
  };
  // The player's mirrors of a feed.
  var userMirrors = (url) => {
    const list = mirrorStore.get()[url];
    return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
  };
  // Every mirror of a feed: the player's, then the ones the feed names itself.
  var mirrorsOf = (url) => [...new Set([...userMirrors(url), ...meta.get(url)?.mirrors ?? []])].filter((mirror) => mirror !== url);
  // The addresses a refresh tries, in order: the one that worked last, the feed's own, then its mirrors.
  function sourcesOf(url) {
    const all = [url, ...mirrorsOf(url)];
    const last = meta.get(url)?.from;
    return [...new Set(last && all.includes(last) ? [last, ...all] : all)];
  }
  // One fetch per feed at a time: adding a feed while every feed refreshes (or a phone and the console
  // both asking) shares the fetch instead of writing the same cache file twice at once.
  var inflight = /* @__PURE__ */ new Map();
  function refreshFeed(url) {
    if (!inflight.has(url)) inflight.set(url, fetchFeed(url).finally(() => inflight.delete(url)));
    return inflight.get(url);
  }
  var listed = (url) => feedList.get().includes(url);
  // A refresh runs while the store or Settings is on screen, and checking a 2 MiB feed took the console's
  // interpreter about a second per feed in one piece: the screen stopped answering (Settings froze when
  // opened just after launch, when the feeds refresh, or on Refresh feeds). Its checking and hashing now
  // stop for a frame every few milliseconds of work.
  var nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));
  // One address: the parsed feed, or an error saying why not (so the next address gets its turn). It is
  // parsed as the feed's own address (`url`), so a copy from a mirror has the same release ids and
  // downloads started from either keep their identity.
  async function fetchFrom(source, url) {
    // No custom headers: with them the transport will not follow a redirect (raw file hosts redirect).
    const response = await Http.request(source, { maxBytes: MAX_BYTES });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let document2;
    try {
      document2 = JSON.parse(await response.text());
    } catch {
      throw new Error("Not JSON.");
    }
    const feed = await parseFeedAsync(document2, url, nextFrame);
    document2 = null; // the raw document can go before the normalized copy is built
    if (!feed.games.length) throw new Error("No usable games in this feed.");
    return feed;
  }
  async function fetchFeed(url) {
    setStatus(url, { state: "refreshing" });
    try {
      const sources = sourcesOf(url);
      let feed = null, from = null;
      const failures = [];
      for (const source of sources) {
        try {
          feed = await fetchFrom(source, url);
          from = source;
          break;
        } catch (error2) {
          failures.push(error2.message);
          console.log(`feeds: ${source} failed: ${error2.message}`);
        }
      }
      if (!feed) throw new Error(failures.length > 1 ? `${failures[0]} (${failures.length - 1} mirror${failures.length > 2 ? "s" : ""} also failed)` : failures[0]);
      // Removed while it downloaded: nothing is cached for it, and it leaves no status behind.
      if (!listed(url)) return;
      const normalized = feedDocument(feed);
      const text = JSON.stringify(normalized);
      const hash = await stableKeyAsync(text, nextFrame);
      if (!listed(url)) return;
      const cache = { url, from, hash, fetchedAt: isoStamp(Date.now()), name: feed.name, games: feed.games.length, skipped: feed.skipped, mirrors: feed.mirrors };
      FileSystem.mkdir(DIR, { recursive: true });
      // The document goes in as the text already made for the hash: one stringify of the feed, not two.
      FileSystem.writeFile(`${cacheFile(url)}.tmp`, `${JSON.stringify(cache).slice(0, -1)},"document":${text}}`);
      FileSystem.rename(`${cacheFile(url)}.tmp`, cacheFile(url));
      meta.set(url, summary(cache));
      setIndex(url, feed.games);
      setStatus(url, { state: "ok", changed: loaded.get(url) !== hash });
      console.log(`feeds: ${url}${from === url ? "" : ` (via ${hostOf(from)})`}: ${feed.games.length} games, ${feed.skipped} skipped`);
    } catch (error2) {
      console.log(`feeds: ${url} failed: ${error2.message}`);
      if (listed(url)) setStatus(url, { state: "failed", error: error2.message });
    }
  }
  var refreshing = null;
  // One refresh at a time, feed by feed: they share the console's connection with downloads.
  function refreshFeeds() {
    return refreshing ?? (refreshing = (async () => {
      try {
        for (const url of feedList.get()) await refreshFeed(url);
      } finally {
        refreshing = null;
      }
    })());
  }
  // Adds a feed and fetches it; throws (for the address dialog to show) when it cannot be added.
  function addFeed(value) {
    const url = checkURL(value);
    const urls = feedList.get();
    if (urls.includes(url)) throw new Error("That feed is already added.");
    if (urls.length >= MAX_FEEDS) throw new Error(`Up to ${MAX_FEEDS} feeds. Remove one first.`);
    feedList.set([...urls, url]);
    void refreshFeed(url);
  }
  // Adds a fallback address for a feed (kept in feed-mirrors.json); throws when it cannot be added.
  function addMirror(feedUrl, value) {
    if (!listed(feedUrl)) throw new Error("No such feed.");
    const mirror = checkURL(value);
    if (mirror === feedUrl) throw new Error("That is the feed's own address.");
    const mine = userMirrors(feedUrl);
    if (mine.includes(mirror) || meta.get(feedUrl)?.mirrors.includes(mirror)) throw new Error("That mirror is already added.");
    if (mine.length >= MAX_MIRRORS) throw new Error(`Up to ${MAX_MIRRORS} mirrors for a feed. Remove one first.`);
    mirrorStore.set({ ...mirrorStore.get(), [feedUrl]: [...mine, mirror] });
    notify();
  }
  function removeMirror(feedUrl, mirror) {
    const mine = userMirrors(feedUrl);
    if (!mine.includes(mirror)) return;
    const rest = mine.filter((item) => item !== mirror);
    const next = { ...mirrorStore.get() };
    if (rest.length) next[feedUrl] = rest;
    else delete next[feedUrl];
    mirrorStore.set(next);
    notify();
  }
  function forget(url) {
    status.delete(url);
    meta.delete(url);
    if (indexes.delete(url)) indexVersion++;
    try {
      if (FileSystem.exists(cacheFile(url))) FileSystem.remove(cacheFile(url));
    } catch (error2) {
      console.log(`feeds: cache of ${url} not removed: ${error2.message}`);
    }
  }
  function removeFeed(url) {
    feedList.set(feedList.get().filter((item) => item !== url));
    if (url in mirrorStore.get()) {
      const next = { ...mirrorStore.get() };
      delete next[url];
      mirrorStore.set(next);
    }
    forget(url);
    notify();
  }
  // Edits a feed's address in place (the phone's Edit): checked like a new one, kept in its position,
  // and fetched; the old address's cache goes and its mirrors move to the new address. Throws when the
  // new address cannot be used.
  function replaceFeed(from, value) {
    const urls = feedList.get();
    const index = urls.indexOf(from);
    if (index < 0) throw new Error("No such feed.");
    const url = checkURL(value);
    if (url === from) {
      void refreshFeed(url);
      return;
    }
    if (urls.includes(url)) throw new Error("That feed is already added.");
    feedList.set(urls.map((item, at) => at === index ? url : item));
    const mine = userMirrors(from).filter((mirror) => mirror !== url);
    const next = { ...mirrorStore.get() };
    delete next[from];
    if (mine.length) next[url] = mine;
    mirrorStore.set(next);
    forget(from);
    notify();
    void refreshFeed(url);
  }
  // The feeds: address, last good copy (name, games, when), where it came from, its mirrors and refresh
  // state, for Settings and the phone companion alike.
  function feedsSnapshot(urls = feedList.get()) {
    return urls.map((url) => {
      const known = meta.get(url);
      return {
        url,
        name: known?.name ?? null,
        games: known?.games ?? 0,
        fetchedAt: known?.fetchedAt ?? null,
        // The mirrors in order (the player's first) and the address the last good copy came from.
        mirrors: mirrorsOf(url),
        own: userMirrors(url),
        via: known?.from && known.from !== url ? known.from : null,
        // A refresh that brought a different copy (a new feed's first) shows its games after a restart.
        restart: status.get(url)?.changed === true,
        ...status.get(url) ?? (known ? { state: "ok" } : { state: "failed", error: "Not loaded yet." })
      };
    });
  }
  // The games each feed lists right now, by feed: [[id, direct], …]. `feedIndexVersion` changes whenever
  // that does (a refresh, a mirror answering instead of the feed, a feed removed); `subscribeFeeds` calls
  // back on every change to the feeds or their state.
  var feedIndexes = () => [...indexes.values()];
  var feedIndexVersion = () => indexVersion;
  function subscribeFeeds(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  function useFeeds() {
    const urls = feedList.useList();
    const [, redraw] = (0, useState)(0);
    (0, useEffect)(() => {
      const listener = () => redraw((n) => n + 1);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }, []);
    return feedsSnapshot(urls);
  }

export { MAX_FEEDS, MAX_MIRRORS, addFeed, addMirror, feedIndexVersion, feedIndexes, feedsSnapshot, loadFeedGames, refreshFeeds, removeFeed, removeMirror, replaceFeed, subscribeFeeds, useFeeds };
