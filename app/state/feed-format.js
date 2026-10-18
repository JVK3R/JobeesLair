// Catalog feeds: JSON documents that add games, or sources for games the catalog has, from outside the
// bundled data. This module only validates and normalizes; state/feeds.js fetches and caches.
//
// A feed (see FEEDS.md at the repository root):
//   { "version": 1, "name": "…", "games": [ { "id": "PPSA01234", "title": "…", "releases": [ { "url": "https://…" } ] } ] }
// Everything else is optional. Anything malformed is dropped, field by field and game by game, never
// trusted: a feed only ever yields plain catalog records, the same shapes data/catalog.js and
// data/releases/*.json hold.

import { sourceKind, webURL } from './download-sources.js';

  // MAX_TOTAL_RELEASES bounds a whole feed: 1500 games × 64 releases would be ~96 000 records, far
  // more than the 32 MiB JS heap holds beside the catalog; real feeds list a few per game.
  var MAX_GAMES = 1500, MAX_RELEASES = 64, MAX_TOTAL_RELEASES = 6e3, MAX_MIRRORS = 4;
  var FORMATS = /* @__PURE__ */ new Set(["pkg", "fpkg", "binary", "ffpfsc", "ffpfs", "ffpkg", "exfat", "rar", "7z", "zip"]);
  var TITLE_ID = /^(?:CUSA|PPSA)\d{5}$/;
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  // The hash, as steps: it yields after every `slice` characters and returns the key. A refreshed feed's
  // text is up to 2 MiB, which the console's interpreter takes about a second to walk: stableKeyAsync
  // gives the screen its frames in between.
  function* hashSteps(value, slice) {
    let first = 2166136261, second = 5381;
    for (let index = 0; index < value.length; index++) {
      first = Math.imul(first ^ value.charCodeAt(index), 16777619);
      second = Math.imul(second, 33) ^ value.charCodeAt(index);
      if ((index + 1) % slice === 0) yield;
    }
    return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
  }
  // Runs steps to the end at once, or (with `pause`) awaits `pause()` at each step.
  function finish(steps) {
    for (; ; ) {
      const step = steps.next();
      if (step.done) return step.value;
    }
  }
  async function finishPaced(steps, pause) {
    for (; ; ) {
      const step = steps.next();
      if (step.done) return step.value;
      await pause();
    }
  }
  var HASH_SLICE = 32 * 1024;
  var stableKey = (value) => finish(hashSteps(value, Infinity));
  var stableKeyAsync = (value, pause) => finishPaced(hashSteps(value, HASH_SLICE), pause);
  var text = (value, max = 200) => typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, max) : "";
  var count = (value, max) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
  function httpURL(value) {
    try {
      return typeof value === "string" ? webURL(value).url : null;
    } catch {
      return null;
    }
  }
  var list = (value, max, map) => Array.isArray(value) ? value.slice(0, max).map(map).filter((item) => item != null && item !== "") : [];
  // A host's catalog name, as data/catalog.js lists providers: archive.org whole, others without their TLD.
  function hostName(url) {
    const host2 = webURL(url).host.replace(/^www\./, "");
    return host2 === "archive.org" || host2.endsWith(".archive.org") ? "archive.org" : host2.replace(/\.[a-z]+$/, "");
  }
  function lastSegment(url) {
    const path = webURL(url).path.split(/[?#]/)[0];
    try {
      return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
    } catch {
      return "";
    }
  }
  var usableFilename = (name) => Boolean(name) && name.length <= 160 && !/[\/\\\x00-\x1f\x7f]/.test(name) && name !== "." && !name.includes("..");
  function release(raw, gameId, index, feedKey) {
    if (!raw || typeof raw !== "object") return null;
    const url = httpURL(raw.url);
    if (!url) return null;
    const browserUrl = raw.browserUrl == null ? null : httpURL(raw.browserUrl);
    const named = text(raw.filename, 160);
    const filename = usableFilename(named) ? named : usableFilename(lastSegment(url)) ? lastSegment(url) : `${gameId}-${index + 1}`;
    const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1].toLowerCase();
    const provider = text(raw.provider, 40) || hostName(url);
    const label = text(raw.label) || provider;
    const record = {
      // From what the release is, not where it sits: the queue keeps it across launches and feed edits.
      id: `feed-${feedKey}-${gameId}-${stableKey(`${url} ${label}`)}`,
      format: FORMATS.has(raw.format) ? raw.format : FORMATS.has(extension) ? extension : "binary",
      filename,
      url,
      ...browserUrl ? { browserUrl } : {},
      requiresBrowser: raw.requiresBrowser === true,
      sizeBytes: Number.isSafeInteger(raw.sizeBytes) && raw.sizeBytes > 0 ? raw.sizeBytes : null,
      version: text(raw.version, 32),
      category: text(raw.category, 16) || "game",
      provider,
      source: "feed",
      flow: "feed",
      label,
      // Volumes of one set share a record (and a label but for "part N"); one per game unless the feed splits them.
      record: text(raw.record, 80) || `feed-${feedKey}-${gameId}`
    };
    const volume = text(raw.volume, 40);
    if (volume) record.volume = volume;
    const password = text(raw.archivePassword, 256);
    if (password) record.archivePassword = password;
    if (typeof raw.sha256 === "string" && /^[0-9a-f]{64}$/i.test(raw.sha256)) record.sha256 = raw.sha256.toLowerCase();
    return record;
  }
  function direct(record) {
    try {
      return sourceKind(record) === "direct";
    } catch {
      return false;
    }
  }
  function art(raw) {
    const out = {};
    const cover = httpURL(raw?.cover), hero = httpURL(raw?.hero);
    if (cover) out.cover = cover;
    if (hero) out.hero = hero;
    const fallbacks = list(raw?.coverFallbacks, 4, httpURL);
    if (fallbacks.length) out.coverFallbacks = fallbacks;
    if (typeof raw?.tint === "string" && /^#[0-9a-f]{6}$/i.test(raw.tint)) out.tint = raw.tint;
    return out;
  }
  // One feed game: its catalog record, its page (about, shots, summary) and its release records.
  function game(raw, feedKey) {
    if (!raw || typeof raw !== "object") return null;
    const id = text(raw.id, 9).toUpperCase();
    const title = text(raw.title);
    if (!TITLE_ID.test(id) || !title) return null;
    const releases = list(raw.releases, MAX_RELEASES, (item, index) => release(item, id, index, feedKey));
    if (!releases.length) return null;
    const releaseDate = typeof raw.releaseDate === "string" && DATE.test(raw.releaseDate) ? raw.releaseDate : "";
    const bytes = releases.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
    const record = {
      id,
      title,
      platform: raw.platform === "ps4" || raw.platform === "ps5" ? raw.platform : id.startsWith("PPSA") ? "ps5" : "ps4",
      providers: [...new Set(releases.map((item) => hostName(item.url)))],
      direct: releases.some(direct),
      developer: text(raw.developer, 120),
      publisher: text(raw.publisher, 120),
      releaseDate,
      genres: list(raw.genres, 8, (genre) => text(genre, 40)),
      features: list(raw.features, 12, (feature) => text(feature, 40)),
      recommendations: count(raw.recommendations, 1e9) ?? 0,
      art: art(raw.art)
    };
    if (releaseDate) record.year = Number(releaseDate.slice(0, 4));
    const metacritic = count(raw.metacritic, 100);
    if (metacritic != null) record.metacritic = metacritic;
    const sizeGb = count(raw.sizeGb, 4096) ?? (bytes ? Math.round(bytes / 1e8) / 10 : null);
    if (sizeGb) record.sizeGb = sizeGb;
    const page = {
      about: list(raw.about, 20, (paragraph) => text(paragraph, 4e3)),
      shots: list(raw.shots, 12, httpURL),
      summary: text(raw.summary, 600)
    };
    return { game: record, page, releases };
  }
  // The feed at `url`, validated: its name, games, and how many entries were dropped. Throws when the
  // document is not a feed at all.
  // As steps, yielding after every `batch` games (parseFeedAsync paces them; parseFeed does not).
  function* feedSteps(document2, url, batch) {
    if (!document2 || typeof document2 !== "object" || document2.version !== 1 || !Array.isArray(document2.games))
      throw new Error("Not a catalog feed: expected version 1 with a games list.");
    const key = stableKey(url);
    const games2 = [];
    const seen = /* @__PURE__ */ new Set();
    const offered = document2.games.slice(0, MAX_GAMES);
    let releases = 0;
    let done = 0;
    for (const raw of offered) {
      if (releases >= MAX_TOTAL_RELEASES) break; // the rest count as skipped
      const item = game(raw, key);
      if (item && !seen.has(item.game.id)) {
        seen.add(item.game.id);
        item.releases = item.releases.slice(0, MAX_TOTAL_RELEASES - releases);
        releases += item.releases.length;
        games2.push(item);
      }
      if (++done % batch === 0) yield;
    }
    // Addresses the publisher says the same feed is also served from, tried when this one is down.
    const mirrors = [...new Set(list(document2.mirrors, 16, httpURL))].filter((mirror) => mirror !== url).slice(0, MAX_MIRRORS);
    return { name: text(document2.name, 80) || webURL(url).host, games: games2, skipped: offered.length - games2.length, mirrors };
  }
  var PARSE_BATCH = 40;
  var parseFeed = (document2, url) => finish(feedSteps(document2, url, Infinity));
  // The same, with the screen's frames in between: a refresh while the store or Settings is open.
  var parseFeedAsync = (document2, url, pause) => finishPaced(feedSteps(document2, url, PARSE_BATCH), pause);
  // A parsed feed back in feed form, as the cache stores it: what parseFeed gives for it is the same feed.
  function feedDocument({ name, games: games2, mirrors = [] }) {
    return {
      version: 1,
      name,
      mirrors,
      games: games2.map(({ game: record, page, releases }) => ({
        ...record,
        ...page,
        releases: releases.map(({ id, source: source2, flow, ...rest }) => rest)
      }))
    };
  }

export { MAX_GAMES, MAX_MIRRORS, feedDocument, parseFeed, parseFeedAsync, stableKey, stableKeyAsync };
