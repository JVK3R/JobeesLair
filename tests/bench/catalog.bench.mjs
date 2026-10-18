// Times the catalog's search and filter work on the bundled catalog: what the browse screen and the filter
// sheet (a count per option of every facet) do on each keystroke, tick or redraw.
// Run: node --import ./tests/render/loader.mjs tests/bench/catalog.bench.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('../..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const started = process.hrtime.bigint();
const catalog = await load('app/state/catalog.js');
console.log(`${'catalog module load'.padEnd(40)} ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (once)`);
const { FACETS, NO_FILTERS, facetCounts, filterGames } = catalog;
const time = (name, fn, rounds = 40) => {
  fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) fn();
  console.log(`${name.padEnd(40)} ${(Number(process.hrtime.bigint() - start) / 1e6 / rounds).toFixed(3)} ms`);
};
const wishlist = [];
const genre = FACETS[2].options[0].value;
let n = 0;
// A new filters object each round: the store hands out a new one whenever the gamer changes something.
const changed = (query) => ({ filters: { ...NO_FILTERS, genre: n++ % 2 ? [genre] : [] }, query, wishlist });
const still = { filters: NO_FILTERS, query: 'the', wishlist };
console.log(`games: ${filterGames({ filters: NO_FILTERS, query: '', wishlist }).length}`);
time('search, filters just changed', () => filterGames(changed('the')));
time('filter sheet, filters just changed', () => { const state = changed('the'); FACETS.forEach((facet) => facetCounts(state, facet)); });
time('filter sheet redraw, nothing changed', () => FACETS.forEach((facet) => facetCounts(still, facet)));
