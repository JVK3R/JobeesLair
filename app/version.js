// ../pub-game-store/native/version.js
// reconstructed from the esbuild bundle in eboot.bin
import { EDITION, EDITIONS } from './edition.js';


  // Jobee'sLair 0.5.4. VERSION is what the update check compares with release tags (v0.5.4),
  // so it keeps the tag's form; VERSION_LABEL is how the screens write it. The console's package version
  // (app.json) stays in its 01.xxx.xxx form, without the pre-release part (contentVersionOf in
  // state/updater.js).
  var VERSION = "0.5.4";
  var VERSION_LABEL = "0.5.4";
  var CREATOR = "JVK3R";
  // Its own ID (0.4.0 and earlier shared Overdrive's, PPSA99058, and the console keeps one app per title ID).
  // state/title-migration.js carries over what it can from the earlier version. 0.5.1: the edition's
  // (edition.js): the homebrew-only build has an ID, a repository and an image of its own.
  var TITLE_ID = EDITIONS[EDITION].titleId;
  // The official repository: the update check reads its latest release, the About page links to it.
  var REPO = EDITIONS[EDITION].repo;
  // The disk image this build runs from (state/updater.js ASSETS, auto-update.js), and the app's name.
  var IMAGE_NAME = EDITIONS[EDITION].image;
  var APP_NAME = EDITIONS[EDITION].name;

export { APP_NAME, CREATOR, IMAGE_NAME, REPO, TITLE_ID, VERSION, VERSION_LABEL };
