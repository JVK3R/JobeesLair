// A download started from the phone companion: the same release, drive and fallbacks the game page's
// Download button would pick, through the same queue checks (duplicates, an existing file, the 32-job
// limit, free space). A source that needs the console's browser cannot be passed from a phone.

import { spaceNeeded } from '../game/releases.js';
import { describeSource, fallbacks, preferredRelease } from '../game/sources.js';
import { downloadQueue, freeBytes, storageRoots } from '../state/downloads.js';
import { linkHealth } from '../state/links.js';
import { MARGIN2 } from '../state/space.js';

  function startRemoteDownload(game) {
    // With what is known of their links: a dead one is never picked or fallen back to (state/links.js).
    const releases = linkHealth().overlay(game.releases);
    if (!releases.length) throw new Error("This game has no download source.");
    const selected = preferredRelease(releases);
    const release = releases[selected];
    const { group, host } = describeSource(release);
    if (group === "unavailable") throw new Error(release.unavailableReason || "Its sources are unavailable.");
    if (group === "browser") throw new Error(`${host} needs a check in the console's browser: start this one on the console.`);
    const roots = storageRoots();
    if (!roots.length) throw new Error("No drive to download to.");
    // The first drive with room for it, as the game page picks; the queue still checks the space itself.
    const index = Math.max(0, roots.findIndex((root) => {
      const need = spaceNeeded(release, root);
      return !need || (freeBytes(root) ?? 0) >= need + MARGIN2;
    }));
    const id = downloadQueue().enqueue(game, release, roots[index], fallbacks(releases, selected));
    return { id, source: host, root: roots[index] };
  }

export { startRemoteDownload };
