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
