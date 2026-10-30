// A download started from the phone companion: the same release, drive and fallbacks the game page's
// Download button would pick, through the same queue checks (duplicates, an existing file, the 32-job
// limit, free space). 0.5.4: the phone may pick the source (`source`, its index in the game's list); the others stay
// fallbacks, best first. Also 0.5.4: one a debrid service can take goes through it (`debrid`; the best source does on
// its own when it needs the browser or is a torrent, as on the console), and one that needs the browser is queued
// too: it waits for its page, which the phone opens on the console or on itself (then hands the file link over).

import { spaceNeeded } from '../game/releases.js';
import { describeSource, fallbacks, preferredRelease } from '../game/sources.js';
import { debridSource, debridSupports, serviceName } from '../state/debrid.js';
import { downloadQueue, freeBytes, storageRoots } from '../state/downloads.js';
import { linkHealth } from '../state/links.js';
import { MARGIN2 } from '../state/space.js';

  // Whether `release` can go through the debrid service set up now (only one the app cannot fetch on its own).
  var throughDebrid = (release) => ["browser", "torrent"].includes(describeSource(release).group) && debridSupports(release);
  function startRemoteDownload(game, source = null, { debrid = null } = {}) {
    // With what is known of their links: a dead one is never picked or fallen back to (state/links.js).
    const releases = linkHealth().overlay(game.releases);
    if (!releases.length) throw new Error("This game has no download source.");
    if (source !== null && !(source >= 0 && source < releases.length)) throw new Error("That source is no longer listed.");
    const selected = source ?? preferredRelease(releases);
    const picked = releases[selected];
    const { group, host } = describeSource(picked);
    if (group === "unavailable") throw new Error(picked.unavailableReason || "Its sources are unavailable.");
    const viaDebrid = debrid ?? (source === null && throughDebrid(picked));
    if (viaDebrid && !throughDebrid(picked)) throw new Error("No debrid service set up on the console takes this source.");
    if (group === "torrent" && !viaDebrid) throw new Error("A torrent needs TorBox or AllDebrid: add a key under Settings.");
    const release = viaDebrid ? debridSource(picked) : picked;
    const roots = storageRoots();
    if (!roots.length) throw new Error("No drive to download to.");
    // The first drive with room for it, as the game page picks; the queue still checks the space itself.
    const index = Math.max(0, roots.findIndex((root) => {
      const need = spaceNeeded(release, root);
      return !need || (freeBytes(root) ?? 0) >= need + MARGIN2;
    }));
    const id = downloadQueue().enqueue(game, release, roots[index], fallbacks(releases, selected));
    return { id, source: host, root: roots[index], debrid: viaDebrid ? serviceName(release.debrid.service) : null, browser: group === "browser" && !viaDebrid };
  }

export { startRemoteDownload, throughDebrid };
