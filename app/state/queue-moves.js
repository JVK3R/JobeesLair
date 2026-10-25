// Moving a finished game to another drive (Make Room, the library's Options), and following a game that was
// moved outside the app. Split out of download-queue.js: the queue hands it what it shares (its jobs, change,
// emit, the network lease and ShadowMount's requests) and keeps who may move a game and when.

import { t } from '../i18n/core.js';
import { reregister, mountedImages } from './shadowmount.js';
import { formatBytes } from './size.js';
import { MARGIN2 } from './space.js';

  /**
   * @param deps fs, platform, COMPLETE; jobs/active/deletions are read when needed; find, change, emit,
   *   storageIdentity, ownedPaths, quietNetwork, shadowRequest, gameInfo and removePath are the queue's own.
   */
  function createMoves({ fs, platform, COMPLETE, jobs, active, deletions, find, change, emit, storageIdentity, ownedPaths, quietNetwork, shadowRequest, gameInfo, removePath }) {
    // The sidecar files a download leaves beside its file: its receipt ties it to that file's inode, so
    // they are not copied; they go with the original.
    const SIDECAR2 = /\.(?:complete|complete\.tmp|part|resume|resume\.tmp)$/;
    const moves = /* @__PURE__ */ new Map();
    // A file's bytes, or a folder's (its files, as far as `budget` entries go).
    function treeSize(path, budget = { left: 2e4 }) {
      const info = fs.stat(path);
      if (!info) return 0;
      if (!info.isDirectory) return info.size || 0;
      let total = 0;
      for (const entry2 of fs.readDir(path)) {
        if (--budget.left < 0) break;
        total += entry2.isDirectory ? treeSize(`${path}/${entry2.name}`, budget) : entry2.size || 0;
      }
      return total;
    }
    // What a move of `job2` copies: the files and folders it put on its drive that are still there, without
    // the sidecars and without what lies inside another of them; and the sidecars, which only go. A backport
    // (homebrew/backports/<TITLE>) stays where ShadowMount was given it: where ShadowMount looks for the
    // backport of a game on another drive is not established.
    function movable(job2) {
      const owned2 = ownedPaths(job2).filter((path) => fs.exists(path) && path !== job2.backportPath);
      const copies2 = owned2.filter((path) => !SIDECAR2.test(path)).filter((path, _, all) => !all.some((other) => other !== path && path.startsWith(`${other}/`)));
      return { copies: copies2, sidecars: owned2.filter((path) => SIDECAR2.test(path) && !copies2.some((other) => path.startsWith(`${other}/`))) };
    }
    const onRoot = (path, from, to) => path === from ? to : path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path;
    // Every path in the job (its artifact, payload, outputs...) under `from` now under `to`. The release
    // and its fallbacks are where it came from, not where it is, and stay.
    function rehome(value, from, to, depth = 0) {
      if (typeof value === "string") return onRoot(value, from, to);
      if (depth > 6 || value === null || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map((item) => rehome(item, from, to, depth + 1));
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, depth === 0 && ["release", "fallbacks", "currentSource", "options", "backportPath"].includes(key) ? item : rehome(item, from, to, depth + 1)]));
    }
    function rootIdentityOf(root2) {
      const info = fs.stat(root2);
      if (!info?.isDirectory) throw new Error(t("move.driveGone"));
      return `${info.device}:${info.inode}`;
    }
    // Points the job at its files' new drive, and saves that: from here on the copy is the game.
    function rehomeJob(job2, to) {
      const from = job2.root;
      const moved = rehome(job2, from, to);
      for (const key of Object.keys(job2)) if (!(key in moved)) delete job2[key];
      Object.assign(job2, moved, { root: to, rootIdentity: rootIdentityOf(to) });
    }
    async function mountedOf(job2, paths, log2) {
      if (job2.artifact.nextAction !== "shadowmount" || platform !== "ps5") return [];
      const mounted = await quietNetwork(`move ${job2.id}`, () => mountedImages(shadowRequest, paths, job2.root)).catch((error2) => {
        throw new Error(t("move.mountUnknown", { error: error2.message }));
      });
      if (mounted === null) log2("ShadowMount is not running, so none of its files is mounted");
      return mounted ?? [];
    }
    /**
     * Moves a finished game (everything its download put on its drive) to `to` (a storage root), in this
     * order, each step logged:
     *  1. checks: the job is finished and still, the other drive has room for it, nothing is in the way
     *     there, and ShadowMount has none of its images mounted;
     *  2. each file or folder is copied with FileSystem.copyAsync, read back against the original (and its
     *     download receipt, when it has one); the copy is `<path>.partial` until then;
     *  3. checked unmounted again, the job is pointed at the copy and saved: the copy is the game now;
     *  4. the originals and their sidecars are deleted;
     *  5. ShadowMount is told (shadowmount.js reregister): its scan finds the new place, or a manual entry
     *     names it, and a rescan is asked for (held until Jobee'sLair closes, being a game itself).
     * A move cut off before step 3 (a failure, a cancel, the app closing) leaves the game where it was and
     * the copy so far in place; moving again resumes it, cancelling deletes it. `onProgress(fraction)`.
     * Resolves with { note }.
     */
    function relocate(id, to, { onProgress = () => {
    } } = {}) {
      const job2 = find(id);
      if (moves.has(job2)) return moves.get(job2).done;
      const log2 = (message) => console.log(`[download-queue] move ${job2.id}: ${message}`);
      const control = { task: null, cancelled: false };
      const done = (async () => {
        if (!COMPLETE.includes(job2.state) || deletions().has(job2) || active()?.job === job2) throw new Error(t("move.notReady"));
        if (job2.root === to) throw new Error(t("move.sameDrive"));
        const from = job2.root;
        storageIdentity(job2);
        rootIdentityOf(to);
        const { copies: copies2, sidecars } = movable(job2);
        if (!copies2.length) throw new Error(t("move.nothing"));
        // 0.5.2: a folder of more entries than treeSize counts here (on the JS thread) came out short, so the room check
        // could pass and the copy run the other drive out of space part-way. Its copy counts it whole on its worker
        // thread before it writes (copyAsync's first `total`), and the room is checked again on that count.
        const budgets = copies2.map(() => ({ left: 2e4 }));
        const sizes = copies2.map((path, index) => treeSize(path, budgets[index]));
        const counted = budgets.map((budget) => budget.left >= 0);
        let total = sizes.reduce((sum, size) => sum + size, 0);
        const staged = (path) => {
          try {
            return treeSize(`${onRoot(path, from, to)}.partial`);
          } catch {
            return 0;
          }
        };
        const room = fs.diskUsage(to).free + copies2.reduce((sum, path) => sum + staged(path), 0);
        log2(`${copies2.length} paths, ${total} bytes, to ${to} (${room} bytes there)`);
        if (room < total + MARGIN2) throw new Error(t("move.noRoom", { size: formatBytes(total + MARGIN2 - room) }));
        for (const path of copies2) if (fs.exists(onRoot(path, from, to))) throw new Error(t("move.inTheWay", { path: onRoot(path, from, to) }));
        const mounted = await mountedOf(job2, copies2, log2);
        if (mounted.length) throw new Error(t("move.mounted", { path: mounted[0].path }));
        job2.moving = { to, total, written: 0, at: Date.now() };
        change();
        let copied = 0;
        try {
          for (const [index, path] of copies2.entries()) {
            if (control.cancelled) throw Object.assign(new Error(t("move.cancelled")), { name: "AbortError" });
            const target = onRoot(path, from, to);
            fs.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
            const task = control.task = fs.copyAsync(path, target, { verify: true, resume: true, receipt: true });
            let noRoom = null;
            task.subscribe((progress) => {
              if (!counted[index] && progress.total) {
                counted[index] = true;
                total += progress.total - sizes[index];
                sizes[index] = progress.total;
                job2.moving.total = total;
                const need = sizes.slice(index).reduce((sum, size) => sum + size, 0) + MARGIN2;
                const room2 = fs.diskUsage(to).free + staged(path);
                if (room2 < need) {
                  log2(`${path} holds ${progress.total} bytes, more than counted before; ${room2} bytes there`);
                  noRoom = new Error(t("move.noRoom", { size: formatBytes(need - room2) }));
                  task.cancel();
                  return;
                }
              }
              // Copying, then reading back: each half of the work.
              job2.moving.written = copied + ((progress.written || 0) + (progress.verified || 0)) / 2;
              onProgress(total ? job2.moving.written / total : 0);
              emit();
            });
            const result = await task.done.catch((error2) => {
              throw noRoom ?? error2;
            });
            copied += sizes[index];
            log2(`copied ${path} to ${target}${result.receipt ? ` (download receipt: ${result.receipt})` : ""}, read back and matched`);
          }
          control.task = null;
          const still = await mountedOf(job2, copies2, log2);
          if (still.length) throw new Error(t("move.mounted", { path: still[0].path }));
        } catch (error2) {
          job2.moving = { ...job2.moving, interrupted: true, error: error2.name === "AbortError" ? "" : error2.message };
          log2(`stopped: ${error2.message}`);
          change();
          throw error2;
        }
        const previous = JSON.parse(JSON.stringify(job2));
        delete job2.moving;
        rehomeJob(job2, to);
        try {
          change();
        } catch (error2) {
          for (const key of Object.keys(job2)) delete job2[key];
          Object.assign(job2, previous);
          throw error2;
        }
        log2(`the game now lives on ${to}`);
        let note = null;
        for (const path of [...copies2, ...sidecars]) {
          try {
            await fs.removeAsync(path);
            log2(`deleted the original ${path}`);
          } catch (error2) {
            log2(`original ${path} not deleted: ${error2.message}`);
            note = t("move.leftBehind", { path });
          }
        }
        // The folder an archive's images were unpacked into, empty now, goes too (homebrew/ itself stays).
        for (const folder of new Set(copies2.map((path) => path.slice(0, path.lastIndexOf("/"))))) {
          try {
            if (folder.startsWith(`${from}/homebrew/`) && fs.exists(folder) && !fs.readDir(folder).length) fs.remove(folder);
          } catch {
          }
        }
        if (job2.artifact.nextAction === "shadowmount" && platform === "ps5") {
          // ShadowMount's sources are each image (or the game's folder), not the folder holding a set of
          // images: those are what its scan and manual.lst name.
          const sources = job2.artifact.images?.length ? job2.artifact.images : [job2.artifact.destination];
          for (const path of sources.filter((item) => item.startsWith(`${to}/homebrew/`))) {
            const { steps, failed } = await quietNetwork(`move ${job2.id}`, () => reregister(shadowRequest, { from: onRoot(path, to, from), to: path }));
            log2(`ShadowMount: ${steps.join("; ")}`);
            note || (note = failed ? t("move.tellShadowMount") : t("move.afterClose"));
          }
        }
        emit();
        return { note };
      })().finally(() => moves.delete(job2));
      moves.set(job2, { done, control });
      done.catch(() => {
      });
      return done;
    }
    // Stops a move and deletes its copy so far: the game stays where it was, untouched.
    async function cancelMove(id) {
      const job2 = find(id);
      const running = moves.get(job2);
      if (running) {
        running.control.cancelled = true;
        running.control.task?.cancel();
        await running.done.catch(() => {
        });
      }
      if (!job2.moving) return;
      const { copies: copies2 } = movable(job2);
      for (const path of copies2) {
        const partial = `${onRoot(path, job2.root, job2.moving.to)}.partial`;
        if (fs.exists(partial)) await removePath(partial);
      }
      console.log(`[download-queue] move ${job2.id}: cancelled, its copy deleted`);
      delete job2.moving;
      change();
    }
    // A game moved outside the app (another tool, FTP): when its file is gone from where the job left it,
    // and ShadowMount's record of the title points at that file's name on another drive, the job follows it.
    async function adoptMoved() {
      const lost = jobs().filter((job2) => job2.state === "installed" && job2.artifact.nextAction === "shadowmount" && !job2.moving && !fs.exists(job2.artifact.destination));
      let adopted = false;
      for (const job2 of lost) {
        const game = await gameInfo(job2.installedTitleId ?? job2.consoleTitleId ?? job2.titleId).catch(() => null);
        const root2 = /^(\/data|\/mnt\/(?:usb|ext)\d+)\//.exec(game?.path ?? "")?.[1];
        if (!root2 || root2 === job2.root || onRoot(job2.artifact.destination, job2.root, root2) !== game.path || !fs.exists(game.path)) continue;
        console.log(`[download-queue] ${job2.id}: its files moved to ${root2} (ShadowMount has ${game.path}); the task follows them`);
        rehomeJob(job2, root2);
        adopted = true;
      }
      if (adopted) change();
      return adopted;
    }
    return { moves, relocate, cancelMove, adoptMoved };
  }

export { createMoves };
