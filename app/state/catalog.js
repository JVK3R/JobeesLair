// ../pub-game-store/native/state/catalog.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: hosts this build no longer downloads from are left out of each game's hosts and the host
// filter (none now: Vikingfile and AkiraBox are back, their file links captured from the browser).
// MODIFIED: games from catalog feeds (state/feeds.js) are merged in before anything is derived.
// MODIFIED: bundledIndex keeps the bundled titles' ids and direct flags for the live game counter.
// MODIFIED: each game carries `formats`, the kinds of download it has (state/formats.js), for the Format filter:
// the bundled games' from data/formats.js, a feed's releases sorted when the feeds load.
// MODIFIED (0.5.1): each game carries its PlayStation Store star rating, `stars` and `ratingCount` (the live
// catalog's when it has one, else data/ratings.js), and the rating sort and Top Rated go by ratingScore.

import { features, games, twins } from '../data/catalog.js';
import { formats as bundledFormats } from '../data/formats.js';
import { formatDate2, t } from '../i18n/core.js';
import { createPageCache } from './page-cache.js';
import { feedRatings, loadFeedGames } from './feeds.js';
import { ratings as bundledRatings } from '../data/ratings.js';
import { createReleaseCache } from './release-cache.js';
import { KINDS, gameFormats, ready1360 } from './formats.js';
import { deviceFacts } from './device.js';
import { consoleFirmware, firmwareText, ps5FakePackagesLaunch } from './firmware.js';
import { FileSystem, Image } from '@ps5-react/core';

  // 0.5.1: "Ready" is for this console's firmware. At 11.60 or lower PS5 fake packages start too, so a PS5 game
  // with one is ready there, and the label names that firmware ("Ready for 9.60"); above, it is 13.60's rule and
  // label, as before. Unknown firmware reads as 13.60.
  // Read once the console has said its firmware (it cannot change while the app runs): readyHere asks for
  // every game of every pass.
  var lowKnown;
  var lowFirmware = () => {
    if (lowKnown !== void 0) return lowKnown;
    try {
      const text = deviceFacts().firmware;
      if (!text) return null;
      lowKnown = ps5FakePackagesLaunch(text) === true ? firmwareText(consoleFirmware(text)) : null;
      return lowKnown;
    } catch {
      return null;
    }
  };
  var readyHere = (game) => ready1360(game.formats ?? []) || Boolean(lowFirmware()) && game.platform === "ps5" && (game.formats ?? []).includes("fpkg");
  var readyLabel = (text) => {
    const low = lowFirmware();
    return low ? text.replace("13.60", low) : text;
  };
  var COVER_WIDTH = 440;
  var coverSize = (url) => url.startsWith("https://image.api.playstation.com/") ? url.replace(/([?&]w=)\d+/, `$1${COVER_WIDTH}`) : url;
  var releaseCache = createReleaseCache((path) => FileSystem.readFile(`/app0/${path}`));
  var pageCache = createPageCache((path) => FileSystem.readFile(`/app0/${path}`));
  var NO_PAGE = { about: [], shots: [], summary: "" };
  var SYNONYMS = {
    "Role Playing Game (RPG)": "RPG",
    "Role Playing Games": "RPG",
    "Role-playing": "RPG",
    Simulator: "Simulation",
    "Driving/Racing": "Racing"
  };
  var dataFile = (dir2, id) => `data/${dir2}/${encodeURIComponent(id)}.json`;
  var pageOf = (game) => {
    try {
      return pageCache(dataFile("pages", game.id));
    } catch {
      return NO_PAGE;
    }
  };
  var Entry = {
    get releases() {
      try {
        return releaseCache(dataFile("releases", this.id), feedReleases.get(this.id));
      } catch {
        return [];
      }
    },
    get about() {
      return pageOf(this).about;
    },
    get shots() {
      return pageOf(this).shots;
    },
    get shortDescription() {
      return pageOf(this).summary;
    },
    get titleId() {
      return this.id;
    }
  };
  // A game only a feed lists: its page comes from the feed, its releases from the feed alone.
  var FeedEntry = Object.create(Entry, {
    about: { get() {
      return this.feedPage.about;
    } },
    shots: { get() {
      return this.feedPage.shots;
    } },
    shortDescription: { get() {
      return this.feedPage.summary;
    } }
  });
  // Feed releases join the catalog game they name (the same id); a game the catalog lacks is listed with
  // the feed's details. Two feeds naming one new game add up on the first one's entry.
  var feedReleases = /* @__PURE__ */ new Map();
  // The bundled titles as [id, direct] pairs, taken before any feed is merged in: the live game counter
  // (state/library-count.js) adds the feeds' own lists to these.
  var bundledIndex = games.map((game) => [game.id, game.direct ? 1 : 0]);
  var catalogIds = new Map([...games, ...twins].map((game) => [game.id, game]));
  for (const { game: feedGame, page, releases } of loadFeedGames()) {
    feedReleases.set(feedGame.id, [...feedReleases.get(feedGame.id) ?? [], ...releases]);
    const known = catalogIds.get(feedGame.id);
    if (known) {
      known.providers = [.../* @__PURE__ */ new Set([...known.providers ?? [], ...feedGame.providers])];
      if (feedGame.direct) known.direct = true;
    } else {
      const entry = { ...feedGame, feedPage: page };
      games.push(entry);
      catalogIds.set(feedGame.id, entry);
    }
  }
  var entries = [...games, ...twins];
  var _a;
  for (const game of entries) {
    Object.setPrototypeOf(game, game.feedPage ? FeedEntry : Entry);
    game.genres = [...new Set(game.genres.flatMap((genre) => genre.split(" / ")).map((genre) => SYNONYMS[genre] ?? genre))];
    (_a = game.art).cover && (_a.cover = coverSize(game.art.cover));
    if (game.art.coverFallbacks) game.art.coverFallbacks = game.art.coverFallbacks.map(coverSize);
  }
  for (const game of entries) {
    const bundled = bundledFormats[game.id]?.split(" ") ?? [];
    const fed = feedReleases.get(game.id);
    const fromFeed = fed?.length ? gameFormats(fed, game.platform) : [];
    game.formats = fromFeed.length ? KINDS.filter((kind) => bundled.includes(kind) || fromFeed.includes(kind)) : bundled;
  }
  var editionsByWork = /* @__PURE__ */ new Map();
  for (const game of entries) if (game.work) editionsByWork.set(game.work, [...editionsByWork.get(game.work) ?? [], game]);
  for (const game of entries) {
    const pair = feedRatings[game.id] ?? bundledRatings[game.id];
    if (pair) [game.stars, game.ratingCount] = pair;
  }
  // An edition the store has no rating for takes its work's best-known one (the PS4 and PS5 versions of a game).
  for (const game of entries) {
    if (game.ratingCount || !game.work) continue;
    const rated = (editionsByWork.get(game.work) ?? []).filter((edition2) => edition2.ratingCount).sort((a, b) => b.ratingCount - a.ratingCount)[0];
    if (rated) [game.stars, game.ratingCount] = [rated.stars, rated.ratingCount];
  }
  var listed = new Set(games);
  for (const game of entries) game.platforms = [...new Set(editionsOf(game).map((edition2) => edition2.platform))].sort();
  function editionsOf(game) {
    return [...editionsByWork.get(game.work) ?? [game]].sort((a, b) => b.platform.localeCompare(a.platform) || Number(listed.has(b)) - Number(listed.has(a)) || a.titleId.localeCompare(b.titleId));
  }
  var genres = [...new Set(games.flatMap((game) => game.genres))].sort();
  var byId = new Map(entries.map((game) => [game.id, game]));
  var getGame = (id) => byId.get(id);
  function listedId(id) {
    const game = byId.get(id);
    if (!game || listed.has(game)) return id;
    return editionsOf(game).find((edition2) => listed.has(edition2) && edition2.platform === game.platform)?.id ?? id;
  }
  function warmCovers() {
    Image.warm(sortGames(games, "relevance").filter((game) => game.art.cover).map((game) => game.art.cover));
  }
  var SORTS = [
    // Most popular puts the games Archive.org serves first: the app downloads them fastest.
    { id: "relevance", compare: (a, b) => fromArchive(b) - fromArchive(a) || b.recommendations - a.recommendations },
    { id: "newest", compare: (a, b) => b.releaseDate.localeCompare(a.releaseDate) },
    { id: "rating", compare: (a, b) => ratingScore(b) - ratingScore(a) || (b.metacritic ?? 0) - (a.metacritic ?? 0) },
    { id: "size", compare: (a, b) => (b.sizeGb ?? 0) - (a.sizeGb ?? 0) },
    { id: "title", compare: (a, b) => a.title.localeCompare(b.title) }
  ];
  // A game's store rating weighed by how many rated it: the average pulled toward RATING_PRIOR stars by
  // RATING_WEIGHT imagined ratings, so 4.9 stars from 40 people ranks under 4.8 from 70 000. 0 when unrated.
  var RATING_PRIOR = 3.5, RATING_WEIGHT = 500;
  // The fewest ratings a game needs to stand in Top Rated.
  var TOP_RATED_MIN = 200;
  var ratingScore = (game) => game.ratingCount ? (game.stars * game.ratingCount + RATING_PRIOR * RATING_WEIGHT) / (game.ratingCount + RATING_WEIGHT) : 0;
  // One card a game, the first of each in `list`'s order: the PS4 and PS5 editions of a work, and the regions of
  // one store page (they share its rating exactly; a rating from TOP_RATED_MIN people is never shared by chance).
  // The Browse rows and the catalog grid show a game once; its page offers the other editions.
  // A title as editions share it: no ™/®, no platform word, letters and digits only.
  var plainTitle = (title) => title.toLowerCase().replace(/[™®©]/g, "").replace(/\b(?:ps[45]|playstation ?[45])\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  function oneEach(list) {
    const seen = /* @__PURE__ */ new Set();
    return list.filter((game) => {
      // The same name and the same stars is one game too (eFootball's editions, rated a person apart).
      const keys = [...game.work ? [`work:${game.work}`] : [], ...game.ratingCount >= TOP_RATED_MIN ? [`rated:${game.stars}/${game.ratingCount}`, `named:${plainTitle(game.title)}/${game.stars}`] : []];
      if (keys.some((key) => seen.has(key))) return false;
      for (const key of keys) seen.add(key);
      return true;
    });
  }
  var topRated = (list) => oneEach(sortGames(list.filter((game) => game.ratingCount >= TOP_RATED_MIN), "rating"));
  var sortLabel = (id) => t(`sort.${id}`);
  var sortGames = (list, id) => [...list].sort(SORTS.find((sort) => sort.id === id).compare);
  var fromArchive = (game) => Boolean(game.providers?.includes("archive.org"));
  function showcase(list, count) {
    list = oneEach(list);
    const first = list.filter(fromArchive);
    return first.length >= count ? first.slice(0, count) : [...first, ...list.filter((game) => !fromArchive(game))].slice(0, count);
  }
  var HOST_NAMES = {
    "overdrive cdn": "Overdrive CDN",
    "archive.org": "Archive.org",
    "1fichier": "1fichier",
    "pippo26442999.github": "Pippo mirror",
    datanodes: "DataNodes",
    mediafire: "MediaFire",
    filekeeper: "FileKeeper",
    datavaults: "DataVaults",
    spectrum: "Spectrum",
    buzzheavier: "Buzzheavier",
    gofile: "Gofile",
    rapidgator: "Rapidgator",
    filecrypt: "Filecrypt",
    fileditchfiles: "FileDitch",
    ranoz: "Ranoz",
    transfer: "Transfer.it"
  };
  var MIN_HOST_GAMES = 20;
  var MIN_KIND_GAMES = 5;
  var hostCounts = /* @__PURE__ */ new Map();
  for (const game of games) for (const host2 of game.providers ?? []) hostCounts.set(host2, (hostCounts.get(host2) ?? 0) + 1);
  function slug(value) {
    const words = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return words.map((word, i) => i ? word[0].toUpperCase() + word.slice(1) : word).join("");
  }
  var CDN_HOST = "overdrive cdn";
  var hosts = [...hostCounts].filter(([host2, count]) => count >= MIN_HOST_GAMES || host2 === CDN_HOST).sort((a, b) => (b[0] === CDN_HOST) - (a[0] === CDN_HOST) || b[1] - a[1]).map(([host2]) => ({ value: host2, name: HOST_NAMES[host2] ?? host2 }));
  var onCdn = (game) => Boolean(game.providers?.includes(CDN_HOST));
  var SIZES = [
    { value: "small", label: "filters.size.small", test: (gb) => gb < 10 },
    { value: "medium", label: "filters.size.medium", test: (gb) => gb >= 10 && gb <= 50 },
    { value: "large", label: "filters.size.large", test: (gb) => gb > 50 }
  ];
  var named = (values, namespace) => values.map((value) => ({ value, label: `${namespace}.${slug(value)}`, name: value }));
  var byGames = (values, has) => {
    const counts = new Map(values.map((value) => [value, games.filter((game) => has(game, value)).length]));
    return [...values].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
  };
  var RELEASES = [
    { value: "recent", label: "filters.release.recent", test: (year) => year >= 2024 },
    { value: "current", label: "filters.release.current", test: (year) => year >= 2020 && year <= 2023 },
    { value: "older", label: "filters.release.older", test: (year) => year < 2020 }
  ];
  var FACETS = [
    {
      key: "platform",
      any: true,
      options: [{ value: "ps5", name: "PS5" }, { value: "ps4", name: "PS4" }],
      has: (game, value) => game.platform === value
    },
    // What kind of download a game has. "13.60 Ready" first: a folder dump or a disk image, what ShadowMount+
    // runs on 13.60. Only the kinds at least MIN_KIND_GAMES games have are offered.
    {
      key: "format",
      any: true,
      options: [
        { value: "ready", label: "release.compat.ready", name: "13.60 Ready" },
        ...KINDS.filter((kind) => games.filter((game) => game.formats.includes(kind)).length >= MIN_KIND_GAMES).map((kind) => ({ value: kind, label: `release.type.${kind}`, name: kind }))
      ],
      has: (game, value) => value === "ready" ? readyHere(game) : game.formats.includes(value)
    },
    // A source the app downloads by itself, with no CAPTCHA page to pass in a browser.
    { key: "access", options: [{ value: "direct", label: "filters.access.direct" }], has: (game) => Boolean(game.direct) },
    {
      key: "genre",
      options: named(byGames(genres, (game, genre) => game.genres.includes(genre)), "genre"),
      has: (game, value) => game.genres.includes(value)
    },
    { key: "feature", options: named(features, "feature"), has: (game, value) => game.features.includes(value) },
    {
      key: "release",
      any: true,
      options: RELEASES,
      has: (game, value) => game.year != null && RELEASES.find((release) => release.value === value).test(game.year)
    },
    {
      key: "size",
      any: true,
      options: SIZES,
      has: (game, value) => game.sizeGb != null && SIZES.find((size) => size.value === value).test(game.sizeGb)
    },
    { key: "provider", any: true, options: hosts, has: (game, value) => game.providers?.includes(value) }
  ];
  var facetTitle = (key) => t(`filters.facet.${key}`);
  function optionLabel(option) {
    if (!option.label) return option.name;
    const text = t(option.label);
    return readyLabel(text === option.label ? option.name : text);
  }
  var facetLabel = (key, value) => {
    const option = FACETS.find((facet) => facet.key === key).options.find((candidate) => candidate.value === value);
    return option ? optionLabel(option) : value;
  };
  var genreLabel = (genre) => optionLabel({ label: `genre.${slug(genre)}`, name: genre });
  var featureLabel = (feature) => optionLabel({ label: `feature.${slug(feature)}`, name: feature });
  var NO_FILTERS = { ...Object.fromEntries(FACETS.map((facet) => [facet.key, []])), wishlist: false };
  var activeCount = (filters) => FACETS.reduce((sum, facet) => sum + (filters[facet.key]?.length ?? 0), Number(filters.wishlist));
  var toggleValue = (list, value) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  var passes = (game, facet, picked) => !picked?.length || (facet.any ? picked.some((value) => facet.has(game, value)) : picked.every((value) => facet.has(game, value)));
  // What a search matches against, lowercased once per game rather than on every keystroke for every game.
  var searchTexts = /* @__PURE__ */ new WeakMap();
  function searchText(game) {
    let text = searchTexts.get(game);
    if (text === void 0) searchTexts.set(game, text = `${game.title} ${game.developer} ${game.publisher}`.toLowerCase());
    return text;
  }
  // The filter sheet asks for every facet's counts on each draw, and the facets that are not "any" share one
  // pool: each pool (and each facet's counts) is kept while the filters, query and wishlist are the same
  // objects the store handed out last time.
  var pools = /* @__PURE__ */ new Map();
  var countsKept = /* @__PURE__ */ new Map();
  var sameInputs = (kept, { filters, query, wishlist }) => kept && kept.filters === filters && kept.query === query && kept.wishlist === wishlist;
  function matching(state, skip) {
    const key = skip?.key ?? "";
    const kept = pools.get(key);
    if (sameInputs(kept, state)) return kept.result;
    const { filters, query, wishlist } = state;
    const q = query.trim().toLowerCase();
    const result = games.filter((game) => (!q || searchText(game).includes(q)) && FACETS.every((facet) => facet === skip || passes(game, facet, filters[facet.key])) && (!filters.wishlist || wishlist.includes(game.id)));
    pools.set(key, { filters, query, wishlist, result });
    return result;
  }
  var filterGames = (state) => matching(state);
  function facetCounts(state, facet) {
    const kept = countsKept.get(facet.key);
    if (sameInputs(kept, state)) return kept.result;
    const pool = matching(state, facet.any ? facet : void 0);
    const result = Object.fromEntries(facet.options.map(({ value }) => [value, pool.filter((game) => facet.has(game, value)).length]));
    countsKept.set(facet.key, { filters: state.filters, query: state.query, wishlist: state.wishlist, result });
    return result;
  }
  var summaryOf = (game) => game.about.find((text) => text.length > 80 && text !== text.toUpperCase()) ?? game.shortDescription;
  // The games sharing the most genres with `game`, then the most recommended; ties keep catalog order. One
  // pass that keeps only the best `limit` (the whole catalog was sorted with the shared count worked out in
  // the comparator), remembered per game: the list is complete once this module has loaded, and the game
  // page asks on every render.
  var relatedCache = /* @__PURE__ */ new Map();
  function relatedGames(game, limit = 6) {
    const key = `${game.id}\n${limit}`;
    const known = relatedCache.get(key);
    if (known) return known;
    const mine = new Set(game.genres);
    const best = [];
    for (const other of games) {
      if (other.id === game.id) continue;
      let shared = 0;
      for (const genre of other.genres) if (mine.has(genre)) shared++;
      if (!shared) continue;
      const after = (entry) => entry.shared > shared || entry.shared === shared && entry.game.recommendations >= other.recommendations;
      let at = best.length;
      while (at > 0 && !after(best[at - 1])) at--;
      if (at < limit) {
        best.splice(at, 0, { game: other, shared });
        if (best.length > limit) best.pop();
      }
    }
    const result = best.map((entry) => entry.game);
    if (relatedCache.size >= 32) relatedCache.delete(relatedCache.keys().next().value);
    relatedCache.set(key, result);
    return result;
  }
  var formatDate3 = (iso) => iso ? formatDate2(iso) : "\u2014";

export { CDN_HOST, FACETS, NO_FILTERS, SORTS, activeCount, bundledIndex, editionsOf, facetCounts, facetLabel, facetTitle, featureLabel, filterGames, formatDate3, fromArchive, genreLabel, genres, getGame, listedId, onCdn, oneEach, optionLabel, ratingScore, readyHere, readyLabel, relatedGames, showcase, sortGames, sortLabel, summaryOf, toggleValue, topRated, warmCovers };
