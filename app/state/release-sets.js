// ../pub-game-store/native/state/release-sets.js
// reconstructed from the esbuild bundle in eboot.bin

import { archivePassword } from './archive-password.js';

  function stableKey(value) {
    let first = 2166136261, second = 5381;
    for (let index = 0; index < value.length; index++) {
      first = Math.imul(first ^ value.charCodeAt(index), 16777619);
      second = Math.imul(second, 33) ^ value.charCodeAt(index);
    }
    return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
  }
  var hostKey = (provider) => provider.toLowerCase().replace(/^www\./, "").replace(/\.[a-z]+$/, "");
  var VOLUME_NAME = /\bpart(\d+)\.(?:rar|7z|zip)\b/i;
  function missingVolumes(parts, declaredBytes) {
    if (parts.some((part, index) => part.number !== index + 1)) return "gap";
    const volumes = parts.map((part) => VOLUME_NAME.exec(part.name || "")?.[1]);
    if (volumes.some((digits, index) => digits && Number(digits) !== index + 1)) return "renumbered";
    if (parts.length === 1 && volumes[0]) return "count";
    const [first, last] = [parts[0], parts.at(-1)];
    if (volumes[0] && volumes.at(-1) && first.bytes && last.bytes && Math.abs(last.bytes - first.bytes) <= first.bytes / 100 && (!declaredBytes || first.bytes * (parts.length - 1) + last.bytes < declaredBytes * 0.97)) return "last";
    return null;
  }
  // (From Overdrive 1.0.6.) DLPSGAME's "backport files" downloads hold only the eboot and a few files to copy
  // over the base game. The catalog sometimes numbers one as a part of a full backport archive; it is its
  // own file, so it never joins a set (a set of them was missing volumes, or half another archive).
  var PATCH_FILES = /backport[+_ -]*files/i;
  var isPatchOnly = (release) => {
    const first = release.parts?.[0]?.sources[0] ?? release;
    return PATCH_FILES.test(`${first.url || ""} ${first.browserUrl || ""} ${release.label || ""}`);
  };
  function releaseSets(releases) {
    const groups = /* @__PURE__ */ new Map();
    const output = [];
    for (const release of releases) {
      const match = !isPatchOnly(release) && /\bpart\s*(\d+)\b/i.exec(release.label || release.volume || "");
      if (!match) {
        output.push(release);
        continue;
      }
      const number2 = Number(match[1]);
      if (!Number.isSafeInteger(number2) || number2 < 1 || number2 > 1024) {
        output.push({ ...release, unavailableReason: "Invalid volume number." });
        continue;
      }
      const label = (release.label || "").replace(/\bpart\s*\d+\b/i, "").trim();
      const record = release.record ?? release.id.replace(/-\d+$/, "");
      const key = `${record}/${hostKey(release.provider)}/${label.toLowerCase()}`;
      let group = groups.get(key);
      const first = group?.parts.find((part2) => part2.number === 1);
      if (number2 === 1 && first && !first.sources.some((source2) => source2.url === release.url && source2.browserUrl === release.browserUrl)) group = void 0;
      if (!group) {
        group = { ...release, label, format: "archive-set", parts: [], sizeBytes: null, sha256: void 0, volume: void 0 };
        delete group.url;
        delete group.browserUrl;
        delete group.manifestUrl;
        groups.set(key, group);
        output.push(group);
      }
      let part = group.parts.find((part2) => part2.number === number2);
      if (!part) {
        part = { number: number2, sources: [] };
        group.parts.push(part);
      }
      if (!part.sources.some((source2) => source2.url === release.url && source2.browserUrl === release.browserUrl))
        if (part.sources.length) group.unavailableReason = "Ambiguous duplicate volume. Choose another complete set.";
        else part.sources.push(release);
    }
    for (const group of output.filter((release) => release.parts)) {
      group.parts.sort((a, b) => a.number - b.number);
      const spellings = [...new Set(group.parts.map((part) => part.sources[0].provider))].join("+");
      group.id = group.filename = `set-${stableKey(`${spellings}/${group.label.toLowerCase()}/${group.parts[0].sources[0].id}`)}`;
      if (missingVolumes(group.parts.map((part) => ({ number: part.number, name: part.sources[0].url || part.sources[0].browserUrl }))))
        group.unavailableReason = "This source has missing volumes. Choose another complete set.";
      try {
        const password = archivePassword(group);
        if (password !== void 0) group.archivePassword = password;
      } catch (error2) {
        group.unavailableReason = error2.message;
      }
      group.label = `${group.label} \xB7 ${group.parts.length} parts`;
    }
    return output;
  }
  // What a release is for a console on 13.60 with ShadowMount+ (the setup this app is confirmed on,
  // INSTALLATION-GUIDE.md), from its format, then the words in its label and file names:
  //   image    a disk image ShadowMount+ mounts as it is, or an archive of one; imageFormat says which:
  //            exfat, ffpkg or ffpfs (null when only "image" can be said)
  //   folder   an extracted game folder ("folder dump"), mounted by ShadowMount+ once unpacked
  //   backport files ShadowMount+ lays over a game when it starts (download-queue.js puts them in
  //            homebrew/backports)
  //   fpkg     a fake package, installed by the console's package service: a PS5 one installs but does not
  //            launch on firmware above 11.60 (ps5-react docs/NATIVE-API.md); a PS4 one is not confirmed
  //   unknown  nothing says (an archive or file whose contents show only once downloaded)
  // compatible1360: true for image, folder and backport, false for a PS5 fpkg, null when it cannot be said.
  var IMAGE_FORMATS = /* @__PURE__ */ new Set(["exfat", "ffpkg", "ffpfs", "ffpfsc"]);
  var PACKAGE_FORMATS = /* @__PURE__ */ new Set(["pkg", "fpkg"]);
  // A word in a label or file name: anything but a letter or digit separates (file names join words with
  // "_", which \b counts as part of a word: "Game_ShadowMount.rar").
  var word = (body) => new RegExp(`(?<![a-z0-9])(?:${body})(?![a-z0-9])`, "i");
  var FOLDER_WORDS = word("folder[\\s_.-]*dump|shadow[\\s_.-]*mount");
  var IMAGE_WORDS = word("exfat|ffpkg|ffpfsc?");
  var BACKPORT_WORDS = word("back[\\s_-]*port");
  var FFPKG_WORD = word("ffpkg"), FFPFS_WORD = word("ffpfsc?"), EXFAT_WORD = word("exfat");
  // Which image a format or a name says: exfat, ffpkg or ffpfs (ffpfsc is a compressed ffpfs), else null.
  function imageFormatOf(format, text) {
    const named = IMAGE_FORMATS.has(format) ? format : FFPKG_WORD.test(text) ? "ffpkg" : FFPFS_WORD.test(text) ? "ffpfs" : EXFAT_WORD.test(text) ? "exfat" : null;
    return named === "ffpfsc" ? "ffpfs" : named;
  }
  // "FPKG" as a word (so not inside "FFPKG"), or a .pkg name ("Game.pkg", "Game.pkg.rar"; not ".ffpkg").
  var PACKAGE_WORDS = word("fpkg|(?<=\\.)pkg");
  function textOf(release) {
    const sources = release.parts ? release.parts.flatMap((part) => part.sources.slice(0, 1)) : [release];
    const names = sources.flatMap((source) => [source.filename, source.volume, (source.url || source.browserUrl || "").split(/[?#]/)[0].split("/").pop()]);
    return [release.label, ...names].filter((value) => typeof value === "string" && value).map((value) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }).join(" ");
  }
  function releaseType(release, platform) {
    const format = String(release.format || "").toLowerCase();
    const text = textOf(release);
    let dumpType = "unknown";
    if (PACKAGE_FORMATS.has(format)) dumpType = "fpkg";
    else if (BACKPORT_WORDS.test(release.label || "")) dumpType = "backport";
    else if (IMAGE_FORMATS.has(format)) dumpType = "image";
    else if (FOLDER_WORDS.test(text)) dumpType = "folder";
    else if (IMAGE_WORDS.test(text)) dumpType = "image";
    else if (PACKAGE_WORDS.test(text)) dumpType = "fpkg";
    const system = platform || release.platform || null;
    const compatible1360 = ["image", "folder", "backport"].includes(dumpType) ? true : dumpType === "fpkg" && system === "ps5" ? false : null;
    return { dumpType, imageFormat: dumpType === "image" ? imageFormatOf(format, text) : null, compatible1360, platform: system };
  }
  // The releases with their type (releaseType) set; `platform` is the game's ("ps5" or "ps4").
  var withReleaseTypes = (releases, platform) => releases.map((release) => ({ ...release, ...releaseType(release, platform) }));
  var link = (release) => {
    const first = release.parts?.[0]?.sources[0] ?? release;
    return first.manifestUrl || first.url || first.browserUrl;
  };
  // A download through TorBox (state/debrid.js) is its own, never the same link's plain one.
  var sameRelease = (saved, release) => saved.id === release.id || Boolean(link(saved)) && link(saved) === link(release) && saved.parts?.length === release.parts?.length && Boolean(saved.debrid) === Boolean(release.debrid);

export { isPatchOnly, releaseSets, releaseType, sameRelease, withReleaseTypes };
