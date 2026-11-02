// The drive the last download went to (0.5.5, GitHub issue #2): a game page starts on it while it is there and
// has room, so a player who keeps every download on an extended drive doesn't switch drives each time. Kept in
// settings.json beside the other settings; set when a download is queued from a game page.

import { loadList, saveList } from './saved.js';

  var SETTINGS = "settings.json";
  var value;
  function lastDrive() {
    if (value === void 0) {
      const saved = loadList(SETTINGS, "settings").lastDrive;
      value = typeof saved === "string" && saved ? saved : null;
    }
    return value;
  }
  function rememberDrive(root2) {
    if (!root2 || root2 === lastDrive()) return;
    value = root2;
    saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), lastDrive: root2 });
  }
  /**
   * The index in `roots` a new download starts on: the last drive used when it is listed and `fits(root)`, else
   * the first drive that fits (as before 0.5.5), else the first.
   */
  function startingDrive(roots, fits, last = lastDrive()) {
    const index = last ? roots.indexOf(last) : -1;
    if (index >= 0 && fits(roots[index])) return index;
    return Math.max(0, roots.findIndex(fits));
  }

export { lastDrive, rememberDrive, startingDrive };
