// Carries out a Make Room plan (library/make-room.js) the gamer confirmed, one ticked item at a time,
// safest tier first, and says how each is doing so the sheet and the library's tiles can show it.
//
// While the drive does not yet have the room it needs, the download queue is held (quietNetwork): the
// download in progress pauses and none starts, so nothing new lands on the drive being freed and
// ShadowMount's answers about mounts come at once. As soon as the drive has the room, the queue is let go
// (the paused download resumes) and the remaining ticked items carry on beside it. Last, the download that
// asked for the room, if one did, is queued. An item that fails is reported and the rest go on.

import { useEffect, useState } from 'react';
import { t } from '../i18n/core.js';

  var IDLE = { running: false, target: null, need: 0, steps: [], order: [], items: {}, entries: {}, freed: 0, notes: [], finished: false, started: null };
  var SIDECARS = [".complete", ".part", ".resume"];
  function createRoomRunner({ queue, fs, deleteFile, moveFile, freeOf, refresh = () => {
  }, log = console.log }) {
    let state = IDLE;
    const listeners = /* @__PURE__ */ new Set();
    const emit = () => {
      for (const listener of [...listeners]) listener(state);
    };
    const set = (change) => {
      state = { ...state, ...change };
      emit();
    };
    const setItem = (item, change) => {
      const next = { ...state.items[item.id], ...change };
      const entries = item.entryKey ? { ...state.entries, [item.entryKey]: next.state === "running" ? { kind: item.tier === "relocate" ? "moving" : "removing", to: item.to ?? null, fraction: next.fraction ?? 0 } : void 0 } : state.entries;
      if (item.entryKey && !entries[item.entryKey]) delete entries[item.entryKey];
      set({ items: { ...state.items, [item.id]: next }, entries });
    };
    async function removePath(path) {
      for (const candidate of [path, ...SIDECARS.map((suffix) => path + suffix)]) {
        if (fs.exists(candidate)) await fs.removeAsync(candidate);
      }
    }
    async function exec(item, entries) {
      const action = item.action;
      const entry = action.entryKey ? entries.get(action.entryKey) : null;
      if (action.entryKey && !entry) throw new Error(t("room.gone"));
      const onProgress = (fraction) => setItem(item, { fraction });
      switch (action.type) {
        case "path":
          return void await removePath(action.path);
        case "deleteExtras":
          return void await queue.deleteExtras(action.jobId);
        case "cancelJob":
          return void await queue.cancel(action.jobId);
        case "deleteFile":
          return (await deleteFile(action.file, action.file.root))?.note ?? null;
        case "relocate": {
          // The game and its add-ons move; a backport stays (download-queue.js relocate).
          const jobs = entry.jobs.filter((job) => job.role !== "backport");
          const parts = jobs.length + entry.files.length;
          let note = null, index = 0;
          const step = (fraction) => onProgress((index + fraction) / parts);
          for (const job of jobs) {
            note = (await queue.relocate(job.id, action.to, { onProgress: step }))?.note ?? note;
            index++;
          }
          for (const file of entry.files) {
            note = (await moveFile(file, file.root, action.to, { onProgress: step }))?.note ?? note;
            index++;
          }
          return note;
        }
        case "remove": {
          let note = null;
          for (const job of entry.jobs) note = (await queue.deleteFromDisk(job.id))?.note ?? note;
          for (const file of entry.files) note = (await deleteFile(file, file.root))?.note ?? note;
          return note;
        }
        default:
          throw new Error(`Unknown step ${action.type}`);
      }
    }
    const enough = async () => {
      try {
        return (await freeOf(state.target) ?? 0) >= state.need;
      } catch {
        return false;
      }
    };
    /**
     * `plan`: from planRoom; `ticked`: the ids to carry out; `entries`: the library's games by key;
     * `then`: { game, release, root, alternatives } to queue once done (the download that asked), or null.
     * Resolves when everything ticked has been tried.
     */
    // `hold: false` (one game moved from its Options) leaves the queue running beside it.
    async function run({ plan, ticked, entries, then = null, hold = true }) {
      if (state.running) throw new Error(t("room.running"));
      const items = ["reclaim", "relocate", "remove"].flatMap((tier) => plan.tiers[tier].filter((item) => ticked.has(item.id)));
      state = { ...IDLE, running: true, target: plan.target, need: plan.need, steps: items, order: items.map((item) => item.id), items: Object.fromEntries(items.map((item) => [item.id, { state: "waiting", fraction: 0 }])), started: Date.now(), title: then?.game?.title ?? null };
      emit();
      log(`[make-room] ${plan.target}: ${items.length} steps for ${plan.need} bytes free (${plan.freeBefore} free now)${then ? `, then ${then.game.title}` : ""}`);
      const before = await freeOf(plan.target).catch(() => plan.freeBefore) ?? plan.freeBefore;
      const notes = [];
      let at = 0;
      const one = async (item) => {
        setItem(item, { state: "running", fraction: 0 });
        try {
          const note = await exec(item, entries);
          if (note && !notes.includes(note)) notes.push(note);
          setItem(item, { state: "done", fraction: 1 });
          log(`[make-room] ${item.id}: done`);
        } catch (error) {
          setItem(item, { state: "failed", error: error.message });
          log(`[make-room] ${item.id}: failed: ${error.message}`);
        }
      };
      try {
        // Held until the drive has its room (or every item was tried).
        if (hold) await queue.quietNetwork("make room", async () => {
          while (at < items.length) {
            if (state.need > 0 && await enough()) break;
            await one(items[at++]);
          }
        });
        while (at < items.length) await one(items[at++]);
      } finally {
        await Promise.resolve(refresh()).catch(() => {
        });
        const after = await freeOf(plan.target).catch(() => null);
        const freed = after == null ? 0 : Math.max(0, after - before);
        let started = null;
        if (then) {
          try {
            queue.enqueue(then.game, then.release, then.root, then.alternatives ?? []);
            started = then.game.title;
          } catch (error) {
            notes.push(error.message);
          }
        }
        set({ running: false, finished: true, freed, notes, startedDownload: started, entries: {} });
        log(`[make-room] finished: ${freed} bytes freed on ${plan.target}${started ? `, ${started} queued` : ""}`);
      }
      return state;
    }
    return {
      run,
      snapshot: () => state,
      dismiss() {
        if (!state.running) set(IDLE);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }
  var instance = null;
  function roomRunner(make) {
    if (!instance && make) instance = make();
    return instance;
  }
  function useRoomRunner() {
    const runner = roomRunner();
    const [state, setState] = (0, useState)(() => runner?.snapshot() ?? IDLE);
    (0, useEffect)(() => runner ? (setState(runner.snapshot()), runner.subscribe(setState)) : void 0, [runner]);
    return state;
  }

export { createRoomRunner, roomRunner, useRoomRunner };
