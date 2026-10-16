// Make Room's first tier, found on a drive: what no game needs any more. Each find is an item for
// library/make-room.js: { id, kind, root, path, bytes, title, selected, action }.
//   "archive"   an archive (or a set's volumes) whose game was unpacked and is in place
//   "orphan"    a file or partial download under downloads/ that no download owns (one cancelled before
//               this build cleaned up after itself, or cut off and forgotten)
//   "paused"    a download stopped part-way, with its partial file: unticked, it may be resumed
//   "notes"     the notes an archive came with, kept beside its game (<name>-extras)
//   "backport"  homebrew/backports/<TITLE> for a game no longer installed
//   "copy"      a move's copy so far (homebrew/<name>.partial) that no move will carry on
// Only files a download put there, or ones nothing owns under downloads/, are ever offered: a game in
// homebrew/ is a game, and Make Room offers it in the next tiers.

import { COMPLETE } from '../state/download-queue.js';

  var FOLDERS = ["downloads/images", "downloads/archives", "downloads/sets", "downloads/extracted", "downloads/files", "downloads/packages"];
  var SIDECAR = /\.(?:complete|complete\.tmp|part|resume|resume\.tmp|partial)$/;
  var TITLE_ID = /\b(CUSA|PPSA)\d{5}\b/;
  var related = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || a.replace(SIDECAR, "") === b;
  function sizeOf(fs, path, budget = { left: 2e4 }) {
    let info;
    try {
      info = fs.stat(path);
    } catch {
      return 0;
    }
    if (!info) return 0;
    if (!info.isDirectory) return info.size || 0;
    let total = 0;
    let entries;
    try {
      entries = fs.readDir(path);
    } catch {
      return 0;
    }
    for (const entry of entries) {
      if (--budget.left < 0) break;
      total += entry.isDirectory ? sizeOf(fs, `${path}/${entry.name}`, budget) : entry.size || 0;
    }
    return total;
  }
  var exists = (fs, path) => {
    try {
      return Boolean(path && fs.stat(path));
    } catch {
      return false;
    }
  };
  // Every path a job may own, any state (a paused download owns its partial file).
  // An image downloads under downloads/images/ before it moves into homebrew/ (download-queue.js stagedPath).
  var owned = (job) => [job.artifact?.destination, job.artifact?.destination && `${job.root}/downloads/images/${job.artifact.destination.slice(job.artifact.destination.lastIndexOf("/") + 1)}`, job.artifact?.directory, ...job.artifact?.images ?? [], job.downloadDestination, job.output, job.publishTo, job.backportPath, job.extras, ...job.packages ?? [], ...(job.parts ?? []).map((part) => part.destination)].filter(Boolean);
  /**
   * `roots`: the drives. `jobs`: the queue's snapshot. `installed`: the title IDs the console has
   * installed (/user/app). `titles`: the title IDs of the games the library shows. `backports`: the
   * library scan's homebrew/backports entries (files/scan.js, with `root`).
   */
  function findLeftovers({ fs, roots, jobs, installed = /* @__PURE__ */ new Set(), titles = /* @__PURE__ */ new Set(), backports = [] }) {
    const found = [];
    const add = (item) => {
      if (!found.some((other) => other.path === item.path)) found.push(item);
    };
    for (const job of jobs) {
      if (job.state === "removing" || job.moving) continue;
      const done = COMPLETE.includes(job.state) && job.state !== "extraction-required" && exists(fs, job.artifact?.destination);
      // The archive a finished game was unpacked from, still beside it.
      const archives = [job.downloadDestination !== job.artifact?.destination && job.downloadDestination, job.release?.parts && job.artifact?.directory].filter(Boolean);
      for (const path of done ? archives : []) {
        if (job.artifact.destination.startsWith(`${path}/`) || !exists(fs, path)) continue;
        add({ id: `archive:${path}`, kind: "archive", root: job.root, path, bytes: sizeOf(fs, path), title: job.title, selected: true, action: { type: "path", path } });
      }
      if (done && job.extras && exists(fs, job.extras)) {
        add({ id: `notes:${job.extras}`, kind: "notes", root: job.root, path: job.extras, bytes: sizeOf(fs, job.extras), title: job.title, selected: true, action: { type: "deleteExtras", jobId: job.id } });
      }
      if (["paused", "failed"].includes(job.state) && (job.written || 0) > 0) {
        add({ id: `paused:${job.id}`, kind: "paused", root: job.root, path: job.downloadDestination || job.artifact?.destination, bytes: job.written, title: job.title, selected: false, action: { type: "cancelJob", jobId: job.id } });
      }
    }
    const paths = jobs.flatMap(owned);
    for (const root of roots) {
      for (const folder of FOLDERS) {
        let entries = [];
        try {
          entries = fs.readDir(`${root}/${folder}`);
        } catch {
          continue;
        }
        for (const entry of entries) {
          const path = `${root}/${folder}/${entry.name}`;
          if (paths.some((own) => related(path, own))) continue;
          add({ id: `orphan:${path}`, kind: "orphan", root, path, bytes: entry.isDirectory ? sizeOf(fs, path) : entry.size || 0, title: entry.name.replace(SIDECAR, ""), selected: true, action: { type: "path", path } });
        }
      }
    }
    // A move's copy so far (<name>.partial in homebrew/) whose move is gone: no download will resume it.
    // One a download's move left (job.moving) is that move's, to resume or cancel from the library.
    const resumable = jobs.filter((job) => job.moving).map((job) => `${job.moving.to}${job.artifact.destination.slice(job.root.length)}.partial`);
    for (const root of roots) {
      let entries = [];
      try {
        entries = fs.readDir(`${root}/homebrew`);
      } catch {
        continue;
      }
      for (const entry of entries.filter((item) => item.name.endsWith(".partial"))) {
        const path = `${root}/homebrew/${entry.name}`;
        if (resumable.includes(path)) continue;
        add({ id: `copy:${path}`, kind: "copy", root, path, bytes: entry.isDirectory ? sizeOf(fs, path) : entry.size || 0, title: entry.name.replace(/\.partial$/, ""), selected: true, action: { type: "path", path } });
      }
    }
    for (const file of backports) {
      const title = file.titleId ?? TITLE_ID.exec(file.name)?.[0] ?? null;
      if (!title || installed.has(title) || titles.has(title)) continue;
      add({ id: `backport:${file.path}`, kind: "backport", root: file.root, path: file.path, bytes: file.size || 0, title, selected: true, action: { type: "deleteFile", file } });
    }
    return found;
  }

export { findLeftovers };
