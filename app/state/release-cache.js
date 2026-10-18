// ../pub-game-store/native/state/release-cache.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: a game's feed releases (`extra`, the same each launch) join its bundled ones; a game with
// feed releases and no release file has those alone.
// MODIFIED: each release carries its type for a 13.60 console (release-sets.js releaseType: dumpType and
// compatible1360), the game's platform read from its title ID (PPSA is PS5, CUSA PS4).

import { releaseSets, withReleaseTypes } from './release-sets.js';

  var KEPT2 = 6;
  function createReleaseCache(read) {
    const games2 = /* @__PURE__ */ new Map();
    return (file, extra = []) => {
      if (!/^data\/releases\/[a-z0-9%_-]+\.json$/i.test(file)) throw new Error("Invalid release data path.");
      let releases = games2.get(file);
      if (!releases) {
        let parsed = [];
        try {
          parsed = JSON.parse(read(file));
        } catch (error2) {
          if (!extra.length) throw error2;
        }
        if (!Array.isArray(parsed)) throw new Error("Invalid release data; rebuild the catalog.");
        const platform = /\/PPSA/i.test(file) ? "ps5" : /\/CUSA/i.test(file) ? "ps4" : void 0;
        releases = withReleaseTypes(releaseSets([...parsed, ...extra]), platform);
        if (games2.size === KEPT2) games2.delete(games2.keys().next().value);
      }
      games2.delete(file);
      games2.set(file, releases);
      return releases;
    };
  }

export { createReleaseCache };
