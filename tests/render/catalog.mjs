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
