// What the library shows: one entry per game on the console's drives, from the queue's finished jobs (the
// game, its backport and add-ons together) and the games in homebrew/ that no job put there (copied over
// FTP). Each entry carries its readiness (state/readiness.js), the job that speaks for it, and the one
// thing ✕ does for it. Free of React and the runtime, so tests drive it with plain objects.

import { COMPLETE } from '../state/download-queue.js';
import { cardPick, readinessOf } from '../state/readiness.js';

  // Every path a job put on its drive, as the Files screen counts them (files/useFiles.js).
  var ownedBy = (job2) => [job2.artifact?.destination, ...job2.artifact?.images ?? [], job2.downloadDestination, job2.output, job2.publishTo, job2.backportPath, job2.extras].filter(Boolean);
  var related = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  // A game copied over FTP: installed once its title ID is in /user/app, else waiting on ShadowMount.
  var untracked = (file) => readinessOf({ state: file.installed ? "installed" : "downloaded", artifact: { nextAction: "shadowmount" } });
  /**
   * `jobs`: the queue's snapshots, in queue order (newest last). `files`: homebrew/ entries
   * (files/scan.js, with `root` and `installed`). `gameOf(id)`: the catalog's game, or undefined.
   * Returns the entries, the ones that need the gamer first, then the newest.
   */
  function shelfEntries({ jobs, files = [], gameOf }) {
    const entries = /* @__PURE__ */ new Map();
    const owned = [];
    const entryOf = (key, game, order) => {
      const entry = entries.get(key) ?? { key, game, jobs: [], files: [], order };
      entry.order = Math.max(entry.order, order);
      entries.set(key, entry);
      return entry;
    };
    jobs.forEach((job2, index) => {
      owned.push(...ownedBy(job2));
      if (!COMPLETE.includes(job2.removingFrom ?? job2.state)) return;
      const game = gameOf(job2.gameId) ?? { id: job2.gameId, title: job2.title, art: {} };
      entryOf(job2.gameId, game, index).jobs.push(job2);
    });
    for (const file of files) {
      if (file.kind !== "images" || file.backport || !file.path.includes("/homebrew/")) continue;
      if (owned.some((path) => related(path, file.path))) continue;
      const key = file.titleId ?? file.path;
      const game = (file.titleId && gameOf(file.titleId)) ?? { id: key, title: file.name, art: {} };
      entryOf(key, game, -1).files.push(file);
    }
    return [...entries.values()].map((entry) => {
      const pick = cardPick(entry.jobs);
      const ready = pick?.ready ?? untracked(entry.files[0]);
      const removing = entry.jobs.some((job2) => job2.state === "removing");
      const size = entry.jobs.reduce((sum, job2) => sum + (job2.total || job2.written || 0), 0) + entry.files.reduce((sum, file) => sum + (file.size || 0), 0);
      return { ...entry, job: pick?.job ?? null, ready, removing, size, catalog: Boolean(gameOf(entry.game.id)), action: actionOf(pick?.job ?? null, ready, Boolean(gameOf(entry.game.id))) };
    }).sort((a, b) => Number(b.ready.tone === "bad") - Number(a.ready.tone === "bad") || b.order - a.order || a.game.title.localeCompare(b.game.title));
  }
  // ✕ on a tile: "See why" for a game that won't start, the install step it waits on, else its game page.
  function actionOf(job2, ready, catalog) {
    if (job2 && ready.action === "seeWhy") return { name: "seeWhy", label: "ready.seeWhy", icon: "alert" };
    if (job2 && ["downloaded", "attention"].includes(job2.state)) return { name: "register", label: job2.state === "attention" ? "downloads.action.checkAgain" : "downloads.action.install", icon: "restart" };
    if (job2 && job2.state === "installer-required") return { name: "install", label: "downloads.action.install", icon: "package" };
    if (catalog) return { name: "gamePage", label: "downloads.action.gamePage", icon: "chevronRight" };
    return null;
  }

export { shelfEntries };
