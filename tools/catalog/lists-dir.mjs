// Where the live catalog and its builder's records are kept (0.5.7): a clone of github.com/JVK3R/JobeesLair-Lists,
// its ps5/ folder, not this repository. That repository's own workflow runs the builder with JL_LISTS_DIR set to its
// checkout; by hand it is ~/.jobeeslair/JobeesLair-Lists (the PS4 build's publish-ps4-games.mjs uses the same clone).
import { homedir } from 'node:os';
import { join } from 'node:path';

export const LISTS_DIR = process.env.JL_LISTS_DIR || join(homedir(), '.jobeeslair', 'JobeesLair-Lists');
export const PS5_LIVE = join(LISTS_DIR, 'ps5', 'live.jlx');
export const PS5_NAMES = join(LISTS_DIR, 'ps5', 'names.jlx');
// The builder's records: store ratings (tools/catalog/ratings.mjs), the day each game was first listed, store art.
export const PS5_RATINGS = join(LISTS_DIR, 'ps5', 'ratings.json');
export const PS5_FIRST_SEEN = join(LISTS_DIR, 'ps5', 'first-seen.json');
export const PS5_ART = join(LISTS_DIR, 'ps5', 'art.json');
