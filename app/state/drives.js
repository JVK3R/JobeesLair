// The console's drives and their space, read off the render thread. Asking a drive for its space waits on
// the drive (an extended HDD spinning up, a USB stick waking), and listing the mounts asks up to 96 paths
// that way: done while a screen draws, that is a frozen screen with controller input stuck behind it.
// Here both go to the native probe worker (FileSystem.mountsAsync, diskUsageAsync); this module keeps the
// last answers in memory, and everything else reads them without waiting:
//   storageRoots(), freeBytes(root), driveSnapshot()   the cache, at once (never blocks)
//   refreshDrives()                                    asks the worker; resolves when its answers are in
//   useDrives({ every })                               the cache for a component, redrawn when an answer
//                                                      changes it; polling while any component uses it
// Until the first answer the cache holds the internal drive with its space unknown.

import { useEffect, useState } from 'react';
import { FileSystem, Platform } from '@ps5-react/core';
import { consoleRoots } from './roots.js';

  var SLOW_MS = 15e3;
  // A drive that does not answer in this long keeps its last numbers; the worker is left to finish.
  var PROBE_TIMEOUT_MS = 8e3;
  var firstRoots = () => Platform.OS === "ps5" ? ["/data"] : [FileSystem.dataDir];
  var snapshot = { roots: firstRoots(), usage: {}, ready: false };
  var subscribers = /* @__PURE__ */ new Set();
  var timer = null;
  var timerEvery = 0;
  var inflight = null;
  var driveSnapshot = () => snapshot;
  var storageRoots = () => snapshot.roots;
  var freeBytes = (root) => snapshot.usage[root]?.free ?? null;
  function within(promise, ms) {
    let id;
    const late = new Promise((resolve) => {
      id = setTimeout(() => resolve(void 0), ms);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(id));
  }
  // The async call where the runtime has it; a synchronous stand-in where it does not (tests, tools).
  var mounts = () => typeof FileSystem.mountsAsync === "function" ? FileSystem.mountsAsync() : Promise.resolve(FileSystem.mounts());
  var usageOf = (root) => typeof FileSystem.diskUsageAsync === "function" ? FileSystem.diskUsageAsync(root) : Promise.resolve().then(() => FileSystem.diskUsage(root));
  var same = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);
  async function listRoots() {
    if (Platform.OS !== "ps5") return snapshot.roots;
    let listed = null;
    let failure = null;
    try {
      listed = await within(mounts(), PROBE_TIMEOUT_MS);
    } catch (error) {
      failure = error;
    }
    // Not answered (or failed): the drives already known stay; a drive is never lost to a slow answer.
    if (!listed || failure) return snapshot.roots;
    return consoleRoots(() => listed);
  }
  async function readUsage(root) {
    try {
      const usage = await within(usageOf(root), PROBE_TIMEOUT_MS);
      if (usage === void 0) return void 0; // no answer in time: keep what is known
      return { total: usage.total, free: usage.free };
    } catch {
      return null; // the drive refused: its space is unknown (the screens show a dash)
    }
  }
  function refreshDrives() {
    return inflight ?? (inflight = (async () => {
      try {
        const roots = await listRoots();
        const usage = {};
        for (const root of roots) {
          const read = await readUsage(root);
          usage[root] = read === void 0 ? snapshot.usage[root] ?? null : read;
        }
        const unchanged = same(roots, snapshot.roots) && snapshot.ready && roots.every((root) => snapshot.usage[root]?.free === usage[root]?.free && snapshot.usage[root]?.total === usage[root]?.total);
        if (unchanged) return;
        snapshot = { roots: same(roots, snapshot.roots) ? snapshot.roots : roots, usage, ready: true };
        for (const { listener } of [...subscribers]) listener(snapshot);
      } catch (error) {
        console.log(`drives: not refreshed: ${error?.message ?? error}`);
      } finally {
        inflight = null;
      }
    })());
  }
  // One timer for every user of the cache, at the fastest rate any of them asked for.
  function reschedule() {
    const every = Math.min(SLOW_MS, ...[...subscribers].map((item) => item.every));
    if (!subscribers.size) {
      if (timer) clearInterval(timer);
      timer = null;
      timerEvery = 0;
      return;
    }
    if (timer && timerEvery === every) return;
    if (timer) clearInterval(timer);
    timerEvery = every;
    timer = setInterval(() => void refreshDrives(), every);
  }
  function useDrives({ every = SLOW_MS } = {}) {
    const [value, setValue] = (0, useState)(snapshot);
    (0, useEffect)(() => {
      const subscriber = { listener: setValue, every };
      subscribers.add(subscriber);
      setValue(snapshot);
      reschedule();
      void refreshDrives();
      return () => {
        subscribers.delete(subscriber);
        reschedule();
      };
    }, [every]);
    return value;
  }

export { driveSnapshot, freeBytes, refreshDrives, storageRoots, useDrives };
