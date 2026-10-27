// Catalog feeds: JSON documents that add games, or sources for games the catalog has, from outside the
// bundled data. This module only validates and normalizes; state/feeds.js fetches and caches.
//
// A feed (see FEEDS.md at the repository root):
//   { "version": 1, "name": "…", "games": [ { "id": "PPSA01234", "title": "…", "releases": [ { "url": "https://…" } ] } ] }
// Everything else is optional. Anything malformed is dropped, field by field and game by game, never
// trusted: a feed only ever yields plain catalog records, the same shapes data/catalog.js and
// data/releases/*.json hold.

import { isMagnetLink, sourceKind, webURL } from './download-sources.js';

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
    for (let start = 0; start < value.length; start += slice) {
      const end = Math.min(start + slice, value.length);
      for (let index = start; index < end; index++) {
        const code = value.charCodeAt(index);
        first = Math.imul(first ^ code, 16777619);
        second = Math.imul(second, 33) ^ code;
      }
      if (end < value.length) yield;
    }
    return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
  }
  // Runs steps to the end at once, or (with `pause`) gives the screen a frame, awaiting `pause()`, whenever
  // they have run for FRAME_WORK_MS. 0.5.3: it paused at every step, and a step (32 KiB hashed, 40 games
  // checked) took the console 20 ms and more: the screen dropped a frame at each of them for over a second
  // after every launch, as the live catalog refreshed.
  var FRAME_WORK_MS = 6;
  function finish(steps) {
    for (; ; ) {
      const step = steps.next();
      if (step.done) return step.value;
    }
  }
  async function finishPaced(steps, pause) {
    for (let since = Date.now(); ; ) {
      const step = steps.next();
      if (step.done) return step.value;
      if (Date.now() - since >= FRAME_WORK_MS) {
        await pause();
        since = Date.now();
      }
    }
  }
  var HASH_SLICE = 4 * 1024;
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
  // A magnet's display name (its dn parameter), for the file's name; "" when it has none.
  function magnetName(magnet) {
    const value = /[?&]dn=([^&]*)/i.exec(magnet)?.[1];
    try {
      return value ? decodeURIComponent(value.replace(/\+/g, " ")) : "";
    } catch {
      return "";
    }
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
    // 0.5.1: a magnet link too (a torrent, downloaded through the gamer's debrid service).
    const magnet = typeof raw.url === "string" && isMagnetLink(raw.url.trim()) ? raw.url.trim() : null;
    const url = magnet ?? httpURL(raw.url);
    if (!url) return null;
    const browserUrl = magnet || raw.browserUrl == null ? null : httpURL(raw.browserUrl);
    const named = text(raw.filename, 160);
    const fromLink = magnet ? magnetName(magnet) : lastSegment(url);
    const filename = usableFilename(named) ? named : usableFilename(fromLink) ? fromLink : `${gameId}-${index + 1}`;
    const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1].toLowerCase();
    const provider = text(raw.provider, 40) || (magnet ? "Torrent" : hostName(url));
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
      providers: [...new Set(releases.map((item) => isMagnetLink(item.url) ? "torrent" : hostName(item.url)))],
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
    // 0.5.1: the day the feed first listed the game (the live catalog's "New this week").
    if (typeof raw.addedAt === "string" && DATE.test(raw.addedAt)) record.addedAt = raw.addedAt;
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
  // MODIFIED (0.5.1): the "Pegasus standard" catalogs (pegasus-dl.dev/catalogs/<name>.json) read as feeds too:
  //   { "name": "…", "packages": [ { "titleId", "title", "version", "category", "posterUrl", "originalPosterUrl",
  //     "description" (HTML), "downloadLinks": [ { "name": "Dump - VikingFile", "url", "details": { "buildKey", "hostLabel" } } ] } ] }
  // Each link is its own one-file release: the hosts of one build are alternatives, never parts of one set.
  var ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
  var plainText = (html) => typeof html === "string" ? html.replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity]) : "";
  var slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  var PART = /\s*\bpart\s*(\d{1,3})\s*$/i;
  function packageGame(item) {
    if (!item || typeof item !== "object" || !Array.isArray(item.downloadLinks)) return null;
    const version = text(item.version, 32);
    const lines = plainText(item.description).split("\n").map((line) => text(line, 4e3)).filter(Boolean);
    return {
      id: item.titleId,
      title: item.title,
      art: { cover: item.originalPosterUrl || item.posterUrl },
      summary: lines.slice(0, 2).join(" "),
      about: lines,
      releases: item.downloadLinks.map((link) => {
        const build = text(link?.details?.buildKey, 16).toLowerCase();
        const host2 = text(link?.details?.hostLabel, 40);
        const label = text(link?.name, 100) || [build, host2].filter(Boolean).join(" - ");
        const url = typeof link?.url === "string" ? link.url : "";
        // "EUR 12.xx Base - Akirabox part 2": the volumes of one set share a record; any other link is its own set.
        const part = PART.exec(label);
        return {
          url,
          // Hosts name files "file" or nothing: name the download after the game and the link.
          filename: `${slug(`${item.titleId}-${label}`).slice(0, 80)}-${stableKey(url).slice(0, 8)}`,
          label,
          ...part ? { volume: `part ${Number(part[1])}` } : {},
          ...host2 ? { provider: host2.toLowerCase() } : {},
          version,
          category: build === "dlc" ? "dlc" : "game",
          ...build === "fpkg" ? { format: "fpkg" } : {},
          requiresBrowser: true,
          record: part ? `pkg-${slug(`${item.titleId}-${build}`)}-${stableKey(label.replace(PART, ""))}` : `pkg-${slug(String(item.titleId))}-${stableKey(url)}`
        };
      })
    };
  }
  // A game listed more than once (another region, another build) is one game with all of its links.
  function fromPackages(document2) {
    const byId = /* @__PURE__ */ new Map();
    for (const item of document2.packages) {
      const game2 = packageGame(item);
      if (!game2) continue;
      const key = String(game2.id).toUpperCase();
      const known = byId.get(key);
      if (!known) byId.set(key, game2);
      else {
        // By address, and by part (record and label): the same "part 1" re-uploaded under a new address
        // would otherwise make a set with two part 1s.
        const urls = new Set(known.releases.map((release2) => release2.url));
        const parts = new Set(known.releases.map((release2) => `${release2.record}|${release2.label ?? ""}`));
        known.releases.push(...game2.releases.filter((release2) => !urls.has(release2.url) && !parts.has(`${release2.record}|${release2.label ?? ""}`)));
        if (!known.about.length) known.about = game2.about;
      }
    }
    return { version: 1, name: document2.name, games: [...byId.values()] };
  }
  // The feed at `url`, validated: its name, games, and how many entries were dropped. Throws when the
  // document is not a feed at all.
  // As steps, yielding after every `batch` games (parseFeedAsync paces them; parseFeed does not).
  function* feedSteps(document2, url, batch) {
    if (document2 && typeof document2 === "object" && !Array.isArray(document2.games) && Array.isArray(document2.packages))
      document2 = fromPackages(document2);
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
    return { name: text(document2.name, 80) || webURL(url).host, games: games2, skipped: offered.length - games2.length, mirrors, ratings: ratingsOf(document2.ratings) };
  }
  // 0.5.1: a feed's store ratings, { "PPSA21564": [4.77, 76635] }: any title's, listed in the feed or not (the
  // live catalog rates every game the app has). Up to MAX_RATINGS, stars 1-5 and a whole count.
  var MAX_RATINGS = 6e3;
  var TITLE = /^[A-Z]{4}\d{5}$/;
  function ratingsOf(value) {
    const out = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return out;
    let kept = 0;
    for (const [id, pair] of Object.entries(value)) {
      if (kept >= MAX_RATINGS) break;
      if (!TITLE.test(id) || !Array.isArray(pair)) continue;
      const [stars, count] = pair;
      if (typeof stars !== "number" || !(stars >= 1 && stars <= 5) || !Number.isSafeInteger(count) || count <= 0) continue;
      out[id] = [stars, count];
      kept++;
    }
    return out;
  }
  var PARSE_BATCH = 4;
  var parseFeed = (document2, url) => finish(feedSteps(document2, url, Infinity));
  // The same, with the screen's frames in between: a refresh while the store or Settings is open.
  var parseFeedAsync = (document2, url, pause) => finishPaced(feedSteps(document2, url, PARSE_BATCH), pause);
  // A parsed feed back in feed form, as the cache stores it: what parseFeed gives for it is the same feed.
  function feedDocument({ name, games: games2, mirrors = [], ratings = {} }) {
    return {
      version: 1,
      name,
      mirrors,
      ...Object.keys(ratings).length ? { ratings } : {},
      games: games2.map(({ game: record, page, releases }) => ({
        ...record,
        ...page,
        releases: releases.map(({ id, source: source2, flow, ...rest }) => rest)
      }))
    };
  }

export { MAX_GAMES, MAX_MIRRORS, feedDocument, parseFeed, parseFeedAsync, stableKey, stableKeyAsync };
