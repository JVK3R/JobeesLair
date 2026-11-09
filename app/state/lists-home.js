// 0.5.7 (PS4 Beta 6): where the published lists live. They are read from github.com/JVK3R/JobeesLair-Lists (the PS5
// live catalog: state/feeds.js; the PS4 games lists: state/ps4-catalog.js). When an address there answers that the
// file is not there (404, 410 or 451), the app asks api.jobees.org once a launch where the lists are now
// (GET /v1/lists/home: {"base": "https://…/"}), keeps the answer in the data folder and reads from that place from
// then on, this launch included. Any other answer, or none, leaves the lists where they were: the copies already kept
// stand, as before.

import { FileSystem, Http } from '@ps5-react/core';
import { DATA_DIR } from './data-dir.js';

  var LISTS_HOME = "https://raw.githubusercontent.com/JVK3R/JobeesLair-Lists/main/";
  var WHERE = "https://api.jobees.org/v1/lists/home";
  var SAVED = `${DATA_DIR}/lists-home.json`;
  var GONE = /* @__PURE__ */ new Set([404, 410, 451]);
  // An https address of a folder (it ends in "/"), nothing that could break out of a URL.
  var goodBase = (base) => typeof base === "string" && base.length <= 300 && /^https:\/\/[^\s"'<>\\]+\/$/.test(base);
  var base = null;
  function listsBase(fs = FileSystem) {
    if (base === null) {
      base = LISTS_HOME;
      try {
        if (fs.exists(SAVED)) {
          const saved = JSON.parse(fs.readFile(SAVED))?.base;
          if (goodBase(saved)) base = saved;
        }
      } catch {
      }
    }
    return base;
  }
  // A list's address: its path under the lists' home ("ps4/store.jlx").
  var listsAddress = (path, fs = FileSystem) => listsBase(fs) + path;
  // Whether an answer says the file is not at that address any more (a busy or failing server is not that).
  var listsGone = (status) => GONE.has(Number(status));
  // Once a launch at most: the new home when api.jobees.org names one other than the current, else null. Never throws.
  var asking = null;
  function askListsHome(http = Http, fs = FileSystem) {
    if (asking) return asking;
    asking = (async () => {
      try {
        const response = await http.request(WHERE, { maxBytes: 4096 });
        if (!response.ok) {
          console.log(`[lists] ${WHERE}: HTTP ${response.status}, the lists stay at ${listsBase(fs)}`);
          return null;
        }
        const moved = JSON.parse(await response.text())?.base;
        if (!goodBase(moved) || moved === listsBase(fs)) return null;
        fs.writeFile(`${SAVED}.tmp`, JSON.stringify({ base: moved, at: Date.now() }));
        fs.rename(`${SAVED}.tmp`, SAVED);
        base = moved;
        console.log(`[lists] the lists are now read from ${moved}`);
        return moved;
      } catch (error) {
        console.log(`[lists] ${WHERE} not read: ${error?.message}`);
        return null;
      }
    })();
    return asking;
  }
  // Tests only: as a new launch.
  function forgetListsHome() {
    base = null;
    asking = null;
  }

export { LISTS_HOME, askListsHome, forgetListsHome, listsAddress, listsBase, listsGone };
