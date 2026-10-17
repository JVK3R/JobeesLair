// ../pub-game-store/native/files/useFiles.js
// reconstructed from the esbuild bundle in eboot.bin

import { useEffect, useMemo, useState } from 'react';
import { deletionTargets, scanDrive } from './scan.js';
import { getGame } from '../state/catalog.js';
import { t } from '../i18n/core.js';
import { BUSY, DELETABLE } from '../state/download-queue.js';
import { downloadQueue, shadowMountUp } from '../state/downloads.js';
import { busyWhileOpen, mountedImages, reregister, shadowRequest, within2 } from '../state/shadowmount.js';
import { FileSystem, Http, Packages, Platform } from '@ps5-react/core';

  function installedTitles() {
    try {
      return new Set(FileSystem.readDir("/user/app").map((entry2) => entry2.name));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  var owned = (job2) => [job2.artifact?.destination, ...job2.artifact?.images ?? [], job2.downloadDestination, job2.output, job2.publishTo, job2.backportPath, job2.extras, ...job2.packages ?? []];
  // The queue's jobs that put `path` on the drive (any state: a paused download owns its partial file).
  function ownersOf(path) {
    try {
      const queue = downloadQueue();
      return { queue, jobs: queue.snapshot().filter((job2) => owned(job2).filter(Boolean).some((item) => item === path || item.startsWith(`${path}/`))) };
    } catch {
      return { queue: null, jobs: [] };
    }
  }
  // The titles ShadowMount installed from a file or folder copied over FTP (asked before it goes). None
  // when ShadowMount is not running.
  async function shadowMountTitles(file, root2) {
    if (Platform.OS !== "ps5" || !file.path.startsWith(`${root2}/homebrew/`)) return [];
    try {
      const { games = [] } = await shadowRequest(Http, "games", { include_size: false });
      return games.filter((item) => within2(item.path, deletionTargets(file), root2)).map((item) => item.title_id);
    } catch (error2) {
      console.log(`[files] ShadowMount's games not listed: ${error2.message}`);
      return [];
    }
  }
  // After its files went: ShadowMount uninstalls the titles, or (while Jobee'sLair is open, the game it
  // counts as running) drops them at its next scan after the app closes. Returns a note, or null.
  async function uninstallTitles(file, titles) {
    let note = null;
    for (const title of titles) {
      try {
        await shadowRequest(Http, "games/uninstall", { title_id: title });
        console.log(`[files] ${file.path}: ShadowMount uninstalled ${title}`);
      } catch (error2) {
        console.log(`[files] ${file.path}: uninstall of ${title}: ${error2.message}`);
        if (error2.httpStatus === 404 || /HTTP 404/.test(error2.message)) continue;
        note = busyWhileOpen(error2) ? t("downloads.delete.afterClose") : note || t("downloads.delete.notUninstalled", { error: error2.message });
      }
    }
    return note;
  }
  async function checkUnmounted(file, root2) {
    if (Platform.OS !== "ps5" || file.kind !== "images") return;
    let mounted;
    try {
      mounted = await mountedImages((route, body) => shadowRequest(Http, route, body), deletionTargets(file), root2);
    } catch (error2) {
      throw new Error(`ShadowMount could not say whether it is mounted, so it was kept: ${error2.message}`);
    }
    console.log(`[files] ${file.path}: ${mounted === null ? "ShadowMount is not running, so it is not mounted" : mounted.length ? `still mounted (${mounted.map((image) => image.path).join(", ")})` : "not mounted"}`);
    if (mounted?.length) throw new Error("ShadowMount still has it mounted, so it was kept. Close any game and try again.");
  }
  /**
   * Deletes a file or folder the Files and Library screens show, with what belongs to it, and resolves with
   * { note } (what the gamer should know, or null). A path a queue job put there goes through the job
   * ("Delete from disk": its image or folder, partial files, extracted folder and <name>-extras go, then
   * ShadowMount uninstalls it); a job's kept notes alone go alone. Anything else (copied over FTP) goes the
   * same way: checked not mounted, deleted with its sidecar files, then uninstalled. A download in progress
   * is paused meanwhile, or ShadowMount's answers would wait for its whole file.
   */
  async function deleteFile(file, root2) {
    const { queue, jobs } = ownersOf(file.path);
    console.log(`[files] delete ${file.path}: requested (${jobs.length ? jobs.map((job2) => `${job2.id} ${job2.state}`).join(", ") : "no download owns it"})`);
    if (jobs.some((job2) => BUSY.includes(job2.state))) throw new Error(t("files.deleteDownloading"));
    const notes = jobs.find((job2) => job2.extras === file.path);
    if (notes) {
      await queue.deleteExtras(notes.id);
      return { note: null };
    }
    let note = null;
    for (const job2 of jobs) {
      if (DELETABLE.includes(job2.state)) note = (await queue.deleteFromDisk(job2.id))?.note ?? note;
    }
    if (!deletionTargets(file).some((path) => FileSystem.exists(path))) return { note };
    const sweep = async () => {
      const titles = await shadowMountTitles(file, root2);
      await checkUnmounted(file, root2);
      for (const path of deletionTargets(file)) {
        if (!FileSystem.exists(path)) continue;
        try {
          await FileSystem.removeAsync(path);
        } catch (error2) {
          console.log(`[files] ${path} not deleted: ${error2.message}`);
          throw error2;
        }
        console.log(`[files] deleted ${path}`);
      }
      return uninstallTitles(file, titles);
    };
    note = (queue?.quietNetwork ? await queue.quietNetwork(`delete ${file.path}`, sweep) : await sweep()) ?? note;
    return { note };
  }
  /**
   * Moves a game no download owns (an image or folder in homebrew/, copied over FTP) to drive `to`, as the
   * queue moves its own (download-queue.js relocate): checked not mounted, copied and read back
   * (FileSystem.copyAsync, `<path>.partial` until then), checked again, the original and its sidecars
   * deleted, then ShadowMount told where it is now. Resolves with { note }; a move cut off keeps the copy so
   * far for the next try, and the game where it was.
   */
  async function moveFile(file, root2, to, { onProgress = () => {
  } } = {}) {
    const { queue } = ownersOf(file.path);
    const target = `${to}${file.path.slice(root2.length)}`;
    const log2 = (message) => console.log(`[files] move ${file.path}: ${message}`);
    const quiet = (reason, work) => queue?.quietNetwork ? queue.quietNetwork(reason, work) : work();
    if (FileSystem.exists(target)) throw new Error(t("move.inTheWay", { path: target }));
    await quiet(`move ${file.path}`, () => checkUnmounted(file, root2));
    FileSystem.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
    const task = FileSystem.copyAsync(file.path, target, { verify: true, resume: true, receipt: true });
    task.subscribe((progress) => onProgress(progress.total ? ((progress.written || 0) + (progress.verified || 0)) / (2 * progress.total) : 0));
    await task.done;
    log2(`copied to ${target}, read back and matched`);
    await quiet(`move ${file.path}`, () => checkUnmounted(file, root2));
    let note = null;
    for (const path of deletionTargets(file)) {
      if (!FileSystem.exists(path)) continue;
      try {
        await FileSystem.removeAsync(path);
        log2(`deleted the original ${path}`);
      } catch (error2) {
        log2(`original ${path} not deleted: ${error2.message}`);
        note = t("move.leftBehind", { path });
      }
    }
    if (Platform.OS === "ps5") {
      const { steps, failed } = await quiet(`move ${file.path}`, () => reregister((route, body) => shadowRequest(Http, route, body), { from: file.path, to: target }));
      log2(`ShadowMount: ${steps.join("; ")}`);
      note || (note = failed ? t("move.tellShadowMount") : t("move.afterClose"));
    }
    return { note, path: target };
  }
  function useFiles(root2) {
    const [version2, setVersion] = (0, useState)(0);
    const rescan = () => setVersion((value) => value + 1);
    const files = (0, useMemo)(() => {
      const installed = installedTitles();
      return scanDrive(FileSystem, root2).map((file) => ({
        ...file,
        game: file.titleId ? getGame(file.titleId) ?? null : null,
        installed: Boolean(!file.backport && file.titleId && installed.has(file.titleId))
      }));
    }, [root2, version2]);
    const [installing, setInstalling] = (0, useState)(null);
    const [shadowMount, setShadowMount] = (0, useState)(true);
    (0, useEffect)(() => {
      let live = true;
      void shadowMountUp().then((up) => {
        if (live) setShadowMount(up);
      });
      return () => {
        live = false;
      };
    }, [version2]);
    const install = (file) => {
      if (installing && !installing.done && !installing.error) return;
      let task;
      try {
        task = Packages.install({ path: file.path, name: file.game?.title ?? file.name });
      } catch (error2) {
        setInstalling({ path: file.path, fraction: 0, error: error2.message });
        return;
      }
      setInstalling({ path: file.path, fraction: 0 });
      task.subscribe((progress) => setInstalling((state) => state?.path === file.path ? { ...state, fraction: progress.total ? progress.written / progress.total : 0 } : state));
      task.done.then(
        () => {
          setInstalling((state) => ({ ...state, fraction: 1, done: true }));
          rescan();
        },
        (error2) => setInstalling((state) => ({ ...state, error: error2.message }))
      );
    };
    const remove = async (file) => {
      try {
        return await deleteFile(file, root2);
      } finally {
        rescan();
      }
    };
    return { files, installing, install, remove, rescan, shadowMount };
  }

export { deleteFile, installedTitles, moveFile, useFiles };
