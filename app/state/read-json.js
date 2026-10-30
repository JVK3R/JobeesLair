// ../pub-game-store/native/state/read-json.js
// reconstructed from the esbuild bundle in eboot.bin


  function readJSON(fs, path, fallback, valid = () => true, log2 = console.log) {
    let text;
    try {
      if (!fs.exists(path)) return fallback;
      text = fs.readFile(path);
    } catch (error2) {
      log2(`[saved] ${path} not read: ${error2.message}`);
      return fallback;
    }
    try {
      const value = JSON.parse(text);
      if (!valid(value)) throw new Error("unexpected contents");
      return value;
    } catch (error2) {
      const aside = `${path}.unreadable-${Date.now()}`;
      log2(`[saved] ${path} unreadable (${error2.message}); kept as ${aside}`);
      try {
        fs.rename(path, aside);
      } catch (failure) {
        log2(`[saved] ${path} not moved aside: ${failure.message}`);
      }
      return fallback;
    }
  }
  var isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
  var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  // 0.5.2: every file a savedList keeps is named here with its shape (tests/saved-files.test.mjs checks).
  // update-prompt.json, a record since 0.5.1, was missing: read as a list, it was set aside as unreadable at
  // every launch, and the update dialog forgot it had already offered a release.
  var SAVED_FILES = {
    "settings.json": isRecord,
    "wishlist.json": isStringList,
    "recent.json": isStringList,
    "searches.json": isStringList,
    "themes.json": isRecord,
    "feed-mirrors.json": isRecord,
    "update-check.json": isRecord,
    "auto-update.json": isRecord,
    "link-health.json": isRecord,
    "debrid.json": isRecord,
    "capture-hosts.json": isRecord,
    "feeds.json": isStringList,
    "update-prompt.json": isRecord,
    "online.json": isRecord,
    "compat.json": isRecord
  };

export { SAVED_FILES, isRecord, isStringList, readJSON };
