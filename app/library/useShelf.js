// The library's games for a screen: the queue's finished jobs and the homebrew/ entries of every drive
// (library/shelf.js), with each game's drive and when it arrived. Shared by the library and Make Room.

import { useMemo } from 'react';
import { shelfEntries } from './shelf.js';
import { useJobs } from '../downloads/useQueue.js';
import { KINDS, scanDrive } from '../files/scan.js';
import { installedTitles } from '../files/useFiles.js';
import { getGame } from '../state/catalog.js';
import { homebrew } from '../state/homebrew-store.js';
import { useDrives } from '../state/drives.js';
import { FileSystem } from '@ps5-react/core';

  var HOMEBREW = KINDS.filter((kind) => kind.key === "images").map((kind) => ({ ...kind, folders: ["homebrew"] }));
  // The homebrew/ entries of every drive (backports included, marked), read when asked and after a change.
  function useHomebrew(roots, version) {
    return (0, useMemo)(() => {
      const installed = installedTitles();
      return roots.flatMap((root) => scanDrive(FileSystem, root, HOMEBREW).map((file) => ({ ...file, root, installed: Boolean(!file.backport && file.titleId && installed.has(file.titleId)) })));
    }, [roots.join("\n"), version]);
  }
  // A finished file's time, asked once per path: the job list redraws on every download tick.
  var modified = /* @__PURE__ */ new Map();
  var modifiedOf = (path) => {
    if (!path) return 0;
    if (!modified.has(path)) {
      try {
        modified.set(path, FileSystem.stat(path)?.modified ?? 0);
      } catch {
        modified.set(path, 0);
      }
    }
    return modified.get(path);
  };
  // The Homebrew app a homebrew/ entry is (by what was installed or found there); Jobee'sLair's own image is itself.
  var SELF = { id: "jobeeslair", name: "Jobee'sLair", self: true, category: "system", files: [] };
  function homebrewOf(file) {
    if (/\/JobeesLair[^/]*\.(exfat|ffpkg|ffpfs|ffpfsc)$/i.test(file.path)) return SELF;
    try {
      return homebrew().ownerOf(file.path, file.titleId);
    } catch {
      return null;
    }
  }
  function useShelf(version = 0) {
    const { jobs } = useJobs();
    const drives = useDrives();
    const files = useHomebrew(drives.roots, version);
    const entries = (0, useMemo)(() => shelfEntries({ jobs, files, gameOf: getGame, homebrewOf }).map((entry) => ({
      ...entry,
      root: entry.jobs[0]?.root ?? entry.files[0]?.root ?? null,
      addedAt: Math.max(0, ...entry.files.map((file) => file.modified || 0), ...entry.jobs.map((job) => modifiedOf(job.artifact?.destination)))
    })), [jobs, files]);
    return { jobs, files, entries, drives };
  }

export { useHomebrew, useShelf };
