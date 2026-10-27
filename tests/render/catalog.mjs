// The catalog's filter caches (state/catalog.js): a redraw with nothing changed gets the same answer, and
// any change of filters, query or wishlist is worked out afresh, never served from what was kept.
// Run: npm run test:render
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('../..', import.meta.url));
const { FACETS, NO_FILTERS, facetCounts, filterGames } = await import(pathToFileURL(path.join(repo, 'app/state/catalog.js')).href);
const fresh = (state) => {
  // The same question with new objects: nothing kept can answer it.
  const copy = { filters: { ...state.filters }, query: `${state.query}`, wishlist: [...state.wishlist] };
  return { list: filterGames(copy), counts: FACETS.map((facet) => facetCounts(copy, facet)) };
};
const wishlist = [];
const all = { filters: NO_FILTERS, query: '', wishlist };
const everything = filterGames(all);
assert.ok(everything.length > 100, 'the bundled catalog loads');
assert.equal(filterGames(all), everything, 'nothing changed: the kept list');
const genre = FACETS.find((facet) => facet.key === 'genre').options[0].value;
const byGenre = { filters: { ...NO_FILTERS, genre: [genre] }, query: '', wishlist };
const genreList = filterGames(byGenre);
assert.ok(genreList.length > 0 && genreList.length < everything.length, 'a genre narrows the list');
assert.ok(genreList.every((game) => game.genres.includes(genre)));
const searched = { filters: byGenre.filters, query: 'the', wishlist };
const searchedList = filterGames(searched);
assert.ok(searchedList.every((game) => `${game.title} ${game.developer} ${game.publisher}`.toLowerCase().includes('the')), 'a new query is searched again');
assert.ok(searchedList.length <= genreList.length);
const starred = { filters: { ...NO_FILTERS, wishlist: true }, query: '', wishlist: [everything[0].id] };
assert.deepEqual(filterGames(starred).map((game) => game.id), [everything[0].id], 'the wishlist filter keeps only starred games');
for (const state of [all, byGenre, searched, starred]) {
  const expected = fresh(state);
  assert.deepEqual(filterGames(state).map((game) => game.id), expected.list.map((game) => game.id));
  assert.deepEqual(FACETS.map((facet) => facetCounts(state, facet)), expected.counts, 'counts match a fresh count');
}
console.log('OK: catalog filter caches answer like a fresh search');

// The Format filter (0.5.0 Pre Release 3): "13.60 Ready" first, then only the kinds some game has.
const format = FACETS.find((facet) => facet.key === 'format');
assert.equal(format.options[0].value, 'ready');
const formatCounts = facetCounts(all, format);
assert.ok(format.options.every((option) => formatCounts[option.value] > 0), 'no kind is offered that no game has');
const ready = filterGames({ filters: { ...NO_FILTERS, format: ['ready'] }, query: '', wishlist });
assert.ok(ready.length > 100 && ready.length < everything.length, `${ready.length} games are 13.60 ready`);
assert.ok(ready.every((game) => game.formats.some((kind) => ['folder', 'exfat', 'ffpkg', 'ffpfs', 'image'].includes(kind))));
console.log(`OK: format filter (${ready.length} games 13.60 ready; ${format.options.map((option) => `${option.value} ${formatCounts[option.value]}`).join(', ')})`);

// 0.5.1 Pre Release 1: Browse shows a game once, its PS4 and PS5 editions and the regions of one store page as one
// card, and Top Rated goes by the store ratings with no game twice.
const { oneEach, topRated, sortGames } = await import(pathToFileURL(path.join(repo, 'app/state/catalog.js')).href);
const card = (id, title, extra = {}) => ({ id, title, platform: 'ps5', ...extra });
const sample = [
  card('PPSA07411', 'Resident Evil 4', { work: 49, stars: 4.74, ratingCount: 160842 }),
  card('CUSA33388', 'Resident Evil 4', { platform: 'ps4', work: 49, stars: 4.74, ratingCount: 160842 }),
  card('PPSA07570', 'Mortal Kombat™ 1', { stars: 4.16, ratingCount: 61580 }),
  card('PPSA07571', 'Mortal Kombat 1', { stars: 4.16, ratingCount: 61580 }),
  card('PPSA03073', 'eFootball', { stars: 3.8, ratingCount: 623565 }),
  card('CUSA26997', 'eFootball', { platform: 'ps4', stars: 3.8, ratingCount: 623564 }),
  card('CUSA02636', 'Until Dawn™', { platform: 'ps4', stars: 4.63, ratingCount: 105522 }),
  card('PPSA15421', 'Until Dawn™', { stars: 4.51, ratingCount: 15710 }),
  card('PPSA00001', 'Little Game', { stars: 4.9, ratingCount: 12 }),
  card('PPSA00002', 'Other Little Game', { stars: 4.9, ratingCount: 12 }),
];
assert.deepEqual(oneEach(sample).map((game) => game.id), ['PPSA07411', 'PPSA07570', 'PPSA03073', 'CUSA02636', 'PPSA15421', 'PPSA00001', 'PPSA00002'],
  'the first of each stays; the Until Dawn remake is a game of its own; two lightly rated games are not one by their rating');
const plain = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const top = topRated(everything).slice(0, 20);
assert.equal(top.length, 20);
assert.equal(new Set(top.map((game) => plain(game.title))).size, top.length, 'no game twice in Top Rated');
assert.ok(top.every((game) => game.ratingCount >= 200 && game.stars >= 4.5), 'Top Rated is well rated by many');
const grid = oneEach(sortGames(everything, 'rating')).slice(0, 100);
assert.equal(new Set(grid.map((game) => plain(game.title))).size, grid.length, 'no game twice in the rating grid');
console.log(`OK: one card a game (${everything.length} -> ${oneEach(everything).length}); Top Rated opens with ${top.slice(0, 3).map((game) => game.title).join(', ')}`);

// The sections (0.5.2, app/ui/sections.js): Browse is one L1 and R1 step to, between Discover and Top rated. It was
// only a menu, and they stepped past it (Jake: "it never lets you select it, it just jumps over it").
const { BROWSE_SORT, TABS, sectionOf, stepFrom } = await import(pathToFileURL(path.join(repo, 'app/ui/sections.js')).href);
assert.deepEqual(TABS.slice(0, 5), ['search', 'discover', 'catalog', 'top', 'new']);
assert.equal(stepFrom('discover', true), 'catalog', 'R1 from Discover is Browse');
assert.equal(stepFrom('catalog', true), 'top');
assert.equal(stepFrom('top', false), 'catalog', 'L1 from Top rated is Browse');
assert.equal(stepFrom('catalog', false), 'discover');
assert.equal(stepFrom('search', false), null, 'nothing before Search');
assert.equal(stepFrom('settings', true), null, 'nothing after Settings');
const at = (filters, sort, query = '') => sectionOf({ filters, sort }, query);
assert.equal(at(NO_FILTERS, BROWSE_SORT), 'catalog', "Browse's own order lights Browse, not Discover");
assert.equal(at(NO_FILTERS, 'relevance'), 'discover');
assert.equal(at(NO_FILTERS, 'size'), 'catalog');
assert.equal(at({ ...NO_FILTERS, genre: [genre] }, 'relevance'), 'catalog', 'a genre is Browse');
assert.equal(at(NO_FILTERS, 'relevance', 'zelda'), 'catalog');
assert.equal(at(NO_FILTERS, 'rating'), 'top');
assert.equal(at(NO_FILTERS, 'newest'), 'new');
assert.equal(at({ ...NO_FILTERS, wishlist: true }, BROWSE_SORT), 'favorites');
for (const name of TABS) if (name !== 'search') assert.ok(stepFrom(stepFrom(name, false) ?? name, true) === name || stepFrom(name, false) === null, `${name} is reached back from its neighbour`);
console.log(`OK: L1 and R1 step through ${TABS.join(' > ')}`);

// The Discover carousel (0.5.3, app/browse/featured.js): top games, a new few each launch. It picked from the games
// with a logo that Archive.org serves, 7 of 1,845, and showed the same five every launch.
const { SLIDES, TOP_POOL, featured, pickFeatured, studioOf } = await import(pathToFileURL(path.join(repo, 'app/browse/featured.js')).href);
const { ratingScore } = await import(pathToFileURL(path.join(repo, 'app/state/catalog.js')).href);
const seeded = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const launches = Array.from({ length: 40 }, (_, launch) => pickFeatured(undefined, seeded(launch + 1)));
for (const picks of launches) {
  assert.equal(picks.length, SLIDES);
  assert.equal(new Set(picks).size, SLIDES, 'no game twice');
  assert.ok(picks.every((game) => game.art.hero && game.art.logo), 'each has a banner and a logo');
  assert.ok(picks.every((game) => ratingScore(game) >= 4.3), 'each is well rated');
  assert.equal(new Set(picks.map(studioOf)).size, SLIDES, 'one game a studio');
  assert.equal(oneEach(picks).length, SLIDES, 'one edition a game');
}
const shownOnce = new Set(launches.flat());
assert.ok(shownOnce.size >= TOP_POOL - 4, `many top games over 40 launches (${shownOnce.size})`);
assert.ok(new Set(launches.map((picks) => picks.map((game) => game.id).sort().join())).size >= 30, 'a different five most launches');
const mostRated = [...shownOnce].sort((a, b) => b.ratingCount - a.ratingCount)[0];
assert.ok(mostRated.ratingCount > 100000, `the top of the pool is a big game (${mostRated.title})`);
assert.equal(studioOf({ developer: 'CAPCOM Co., Ltd.' }), studioOf({ developer: 'Capcom' }));
// The Featured lane under it leaves the carousel's games out, every edition of them.
globalThis.screen ??= { width: 1920, height: 1080 };
const { FIRST_FEATURED } = await import(pathToFileURL(path.join(repo, 'app/browse/Lanes.jsx')).href);
assert.ok(FIRST_FEATURED && !featured.some((game) => FIRST_FEATURED === `lane:featured:${game.id}`), 'the Featured lane starts with another game');
console.log(`OK: the carousel shows ${SLIDES} of the top games, ${shownOnce.size} different ones over 40 launches; this launch: ${featured.map((game) => game.title).join(', ')}`);

// Discover's rows (0.5.3): each shows games the rows above it do not. Featured, Ready for 13.60 and Popular now all opened
// with the same eight Archive.org games; Popular now is now the most played on PlayStation (most rated on its store).
const { FEATURED, READY, TOP } = await import(pathToFileURL(path.join(repo, 'app/browse/Lanes.jsx')).href);
const { POPULAR } = await import(pathToFileURL(path.join(repo, 'app/browse/PopularRail.jsx')).href);
const { editionsOf } = await import(pathToFileURL(path.join(repo, 'app/state/catalog.js')).href);
const work = (game) => editionsOf(game).map((edition) => edition.id).sort().join();
const rows = { carousel: featured, featured: FEATURED, ready: READY, popular: POPULAR };
const where = new Map();
for (const [name, list] of Object.entries(rows)) {
  assert.ok(list.length >= 5, `${name} has games`);
  for (const game of list) {
    assert.ok(!where.has(work(game)), `${game.title} is in ${where.get(work(game))} and ${name}`);
    where.set(work(game), name);
  }
}
assert.ok(POPULAR.every((game, i) => i === 0 || POPULAR[i - 1].ratingCount >= game.ratingCount), 'Popular now: the most rated first');
assert.ok(!POPULAR.some((game) => TOP.includes(game)), 'not the Top rated row\'s either');
console.log(`OK: Discover's rows share no game; Popular now opens with ${POPULAR.slice(0, 3).map((game) => game.title).join(', ')}`);
