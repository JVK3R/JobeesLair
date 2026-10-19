// Carrying a player's files over when the app's title ID changed (0.4.1: PPSA99058, which Overdrive also
// uses, so the two could not be installed together, became PPSA99471).
//
// The console keeps an app's saved data per title ID: /download0 is a disk image of its own for each ID
// (/user/download/<ID>/download0.dat), mounted into the app's sandbox while it runs. A new ID starts with
// an empty one. The earlier version's queue, launches and play time sit in the real
// /data/ps5-react/<old ID>/queue/, which this app can read: those are copied, once, to this version's folder.
// Its settings, wishlist, feeds and the rest are in the earlier image, at /mnt/sandbox/<old ID>_000/download0/
// while the console has it mounted. This app's own sandbox does not show that path (on the console tried it
// was not there), so that copy is only tried: it costs nothing when the folder is absent, and the player sets
// those up again. A file already in place is never overwritten, and nothing of the earlier version is
// changed or deleted.
//
// Only the app's own folder (JobeesLair) is read: Overdrive keeps its files in the same image, and they are
// not ours. State tied to one version or one check (update-check, auto-update, link-health) is not carried.

  var OLD_TITLE_ID = "PPSA99058";
  // What is not carried over: it describes the earlier build or is rebuilt in moments.
  var LEFT_BEHIND = /* @__PURE__ */ new Set(["update-check.json", "auto-update.json", "link-health.json"]);
  var QUEUE_FILES = ["downloads.json", "launches.json", "playtime.json"];
  var MAX_FILE = 2 * 1024 * 1024;
  // A run that finds nothing (the console restarted since the earlier version ran) is tried again on the next
  // launches, in case that version is launched again; then it stops.
  var ATTEMPTS = 3;
  var SANDBOXES = "/mnt/sandbox";
  var PRIVATE_STATE = (name) => name.endsWith(".json") && !name.endsWith(".tmp") && !name.includes(".unreadable-");

  /**
   * Copies the earlier version's files, when this launch should. `fs`: the app's FileSystem; `log`: where
   * its lines go; `dataDir`/`queueDir`: this version's saved-files folder and queue folder; `oldTitle`: the
   * earlier title ID. Never throws. Returns { state, copied: [paths], from }.
   */
  function migrateFromOldTitle({ fs, log = () => {}, oldTitle = OLD_TITLE_ID, dataDir, queueDir, sandboxRoot = SANDBOXES, now = () => Date.now() }) {
    const marker = `${dataDir}/.migrated-from-${oldTitle}`;
    const exists = (path) => {
      try {
        return fs.exists(path);
      } catch {
        return false;
      }
    };
    const listing = (path) => {
      try {
        return fs.readDir(path) ?? [];
      } catch {
        return [];
      }
    };
    let before = null;
    try {
      if (exists(marker)) before = JSON.parse(fs.readFile(marker));
    } catch {
      before = { attempts: ATTEMPTS };
    }
    if (before && (before.found || (before.attempts ?? 0) >= ATTEMPTS)) return { state: "done", copied: [] };

    // Copies one small file to a place it is not yet in, through a temporary name.
    const copy = (from, to, kept) => {
      if (exists(to)) return false;
      try {
        const text = fs.readFile(from);
        if (typeof text !== "string" || !text.length || text.length > MAX_FILE) return false;
        JSON.parse(text);
        fs.mkdir(to.slice(0, to.lastIndexOf("/")), { recursive: true });
        fs.writeFile(`${to}.tmp`, text, { sync: true });
        fs.rename(`${to}.tmp`, to);
        kept.push(to);
        return true;
      } catch (error) {
        log(`[migrate] ${from} not carried over: ${error.message}`);
        return false;
      }
    };
    const copied = [];
    let from = null;
    try {
      // The earlier version's mounted data: the console numbers the sandbox of a title _000, _001, ...
      let names = listing(sandboxRoot).map((entry) => entry.name).filter((name) => name.startsWith(`${oldTitle}_`));
      if (!names.length) names = [0, 1, 2].map((n) => `${oldTitle}_${String(n).padStart(3, "0")}`);
      let newest = -1;
      for (const name of names) {
        const dir = `${sandboxRoot}/${name}/download0/JobeesLair`;
        if (!exists(dir)) continue;
        const files = listing(dir).filter((entry) => !entry.isDirectory && PRIVATE_STATE(entry.name));
        if (!files.length) continue;
        const stamp = Math.max(0, ...files.map((entry) => {
          try {
            return fs.stat(`${dir}/${entry.name}`)?.modified ?? 0;
          } catch {
            return 0;
          }
        }));
        if (stamp > newest) {
          newest = stamp;
          from = dir;
        }
      }
      if (from) {
        for (const entry of listing(from)) {
          if (entry.isDirectory || !PRIVATE_STATE(entry.name) || LEFT_BEHIND.has(entry.name) || entry.size > MAX_FILE) continue;
          copy(`${from}/${entry.name}`, `${dataDir}/${entry.name}`, copied);
        }
      } else {
        log(`[migrate] the earlier version's settings are not reachable from this app (${sandboxRoot}/${oldTitle}_*/download0 is not visible); they start fresh`);
      }
      // The queue, its launches and play time: in the real data folder, so there whether or not it ran.
      const oldQueue = queueDir.replace(/\/ps5-react\/[^/]+\/queue$/, `/ps5-react/${oldTitle}/queue`);
      for (const name of QUEUE_FILES) copy(`${oldQueue}/${name}`, `${queueDir}/${name}`, copied);
    } catch (error) {
      log(`[migrate] stopped: ${error.message}`);
    }
    const found = copied.length > 0;
    try {
      fs.mkdir(dataDir, { recursive: true });
      fs.writeFile(marker, JSON.stringify({ found, attempts: (before?.attempts ?? 0) + 1, at: now(), from, copied: copied.map((path) => path.slice(path.lastIndexOf("/") + 1)) }));
    } catch (error) {
      log(`[migrate] marker not written: ${error.message}`);
    }
    log(found ? `[migrate] carried over ${copied.length} files from ${from ?? "the earlier queue"}: ${copied.map((path) => path.slice(path.lastIndexOf("/") + 1)).join(", ")}` : "[migrate] nothing of the earlier version was found to carry over");
    return { state: found ? "migrated" : "nothing", copied, from };
  }

export { ATTEMPTS, LEFT_BEHIND, OLD_TITLE_ID, migrateFromOldTitle };
