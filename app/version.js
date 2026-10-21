// ../pub-game-store/native/version.js
// reconstructed from the esbuild bundle in eboot.bin


  // Jobee'sLair 0.5.0. VERSION is what the update check compares with release tags (v0.5.0),
  // so it keeps the tag's form; VERSION_LABEL is how the screens write it. The console's package version
  // (app.json) stays in its 01.xxx.xxx form, without the pre-release part (contentVersionOf in
  // state/updater.js).
  var VERSION = "0.5.0";
  var VERSION_LABEL = "0.5.0";
  var CREATOR = "JVK3R";
  // Its own ID (0.4.0 and earlier shared Overdrive's, PPSA99058, and the console keeps one app per title ID).
  // state/title-migration.js carries over what it can from the earlier version.
  var TITLE_ID = "PPSA99471";
  // The official repository: the update check reads its latest release, the About page links to it.
  var REPO = "JVK3R/JobeesLair";

export { CREATOR, REPO, TITLE_ID, VERSION, VERSION_LABEL };
