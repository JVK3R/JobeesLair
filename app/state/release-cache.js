// ../pub-game-store/native/state/release-cache.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: releases on retired hosts (Vikingfile, AkiraBox) are dropped before sets are built.
// MODIFIED: a game's feed releases (`extra`, the same each launch) join its bundled ones; a game with
// feed releases and no release file has those alone.

import { retiredSource } from './download-sources.js';
import { releaseSets } from './release-sets.js';

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
        releases = releaseSets([...parsed, ...extra].filter((release) => !retiredSource(release)));
        if (games2.size === KEPT2) games2.delete(games2.keys().next().value);
      }
      games2.delete(file);
      games2.set(file, releases);
      return releases;
    };
  }

export { createReleaseCache };
