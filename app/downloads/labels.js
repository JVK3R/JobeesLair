// ../pub-game-store/native/downloads/labels.js
// reconstructed from the esbuild bundle in eboot.bin

import { t } from '../i18n/core.js';
import { COMPLETE } from '../state/download-queue.js';

  var LABELED = /* @__PURE__ */ new Set([
    "awaiting-browser",
    "queued",
    "resolving",
    "connecting",
    "downloading",
    "verifying",
    "pausing",
    "extracting",
    "finishing",
    "extracted",
    "paused",
    "failed",
    "file-downloaded",
    "downloaded",
    "installer-required",
    "installing",
    "installed",
    "attention",
    "extraction-required",
    "removing"
  ]);
  var WAITING = ["resolving", "connecting", "verifying", "pausing", "finishing", "removing"];
  var shownState = (job2) => job2.state === "extracting" && job2.phase === "finishing" ? "finishing" : job2.state;
  var hasStateLabel = (state) => LABELED.has(state);
  var stateLabel = (state) => t(`downloadState.${state}`);
  // A finished card's X deletes the game from disk (its entry alone would leave every file behind); an
  // unfinished one's cancels it and deletes its partial files. Both arm first.
  var clearAction = (state) => COMPLETE.includes(state) ? "deleteFromDisk" : "cancel";

export { WAITING, clearAction, hasStateLabel, shownState, stateLabel };
