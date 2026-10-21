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
  // A finished card's X only clears it from this list (the game stays in the library, which is where it is
  // deleted); an unfinished one's cancels it and deletes its partial files, arming first.
  var clearAction = (state) => COMPLETE.includes(state) ? "clear" : "cancel";

  // MODIFIED (0.5.0 Pre Release 3): the format a download card shows. What the file's own header turned out to be
  // (read in its first megabytes), else its name's extension once a capture named it, else the catalog's; a
  // source listed without one says it is still being checked rather than showing nothing.
  var EXTENSION = /\.(exfat|ffpfsc|ffpkg|pkg|zip|7z|rar|iso)(?:\.\d+)?$/i;
  function formatOf(job2, release) {
    const named = EXTENSION.exec(job2.fileName || "")?.[1];
    const known = job2.inspected || named || job2.artifact?.format || release?.format || "";
    if (known && known !== "binary") return String(known).toUpperCase();
    // Nothing more will be learned about a finished or failed download, so it says nothing.
    return COMPLETE.includes(job2.state) || job2.state === "failed" ? "" : t("downloads.formatPending");
  }
  // "Part 3 of 10" for a download in parts.
  var partOf = (job2) => job2.parts?.length > 1 ? t("downloads.part", { part: (job2.partIndex ?? 0) + 1, parts: job2.parts.length }) : "";

export { WAITING, clearAction, formatOf, hasStateLabel, partOf, shownState, stateLabel };
