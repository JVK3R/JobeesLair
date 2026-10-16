// ../pub-game-store/native/game/useFreeSpace.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: free space comes from the drive cache (state/drives.js), read by its worker: nothing here asks a
// drive on the render thread. While `watching` (no download of this game running) it is read every
// EVERY_MS, as before; a download of it asks no more often than the cache's own slow poll.

import { useDrives } from '../state/drives.js';

  var EVERY_MS = 3e3;
  var SLOW_MS = 15e3;
  function useFreeSpace(roots, status, watching) {
    const drives = useDrives({ every: watching ? EVERY_MS : SLOW_MS });
    return roots.map((root) => drives.usage[root]?.free ?? null);
  }

export { useFreeSpace };
