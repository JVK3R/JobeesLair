// The kinds of download a game has, for the store's format filter (0.5.0 Pre Release 3). Each release is sorted
// with release-sets.js releaseType, the same rules as the source picker's 13.60 badges:
//   folder    a folder dump ShadowMount+ mounts once unpacked
//   exfat, ffpkg, ffpfs   a disk image of that kind; image: one whose kind nothing names
//   backport  files laid over a game when it starts (not a game by itself)
//   fpkg      a fake package: a PS5 one does not launch above 11.60, a PS4 one is not confirmed
// "Ready for 13.60" is a game with a folder dump or any disk image, what ShadowMount+ runs on 13.60.
// The bundled games' kinds are worked out once by tools/catalog/formats.mjs (app/data/formats.js).

import { releaseSets, withReleaseTypes } from './release-sets.js';

  var KINDS = ["folder", "exfat", "ffpkg", "ffpfs", "image", "backport", "fpkg"];
  var READY = /* @__PURE__ */ new Set(["folder", "exfat", "ffpkg", "ffpfs", "image"]);
  function kindOf(release) {
    if (release.dumpType === "image") return release.imageFormat || "image";
    return KINDS.includes(release.dumpType) ? release.dumpType : null;
  }
  // The kinds among `releases` (a game's raw release list), in KINDS order.
  function gameFormats(releases, platform) {
    const found = new Set(withReleaseTypes(releaseSets(releases), platform).map(kindOf).filter(Boolean));
    return KINDS.filter((kind) => found.has(kind));
  }
  var ready1360 = (kinds) => kinds.some((kind) => READY.has(kind));

export { KINDS, gameFormats, ready1360 };
