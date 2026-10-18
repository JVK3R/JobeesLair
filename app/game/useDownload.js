// ../pub-game-store/native/game/useDownload.js
// reconstructed from the esbuild bundle in eboot.bin

import { useEffect, useRef, useState } from 'react';
import { fractionOf } from '../downloads/useQueue.js';
import { BUSY } from '../state/download-queue.js';
import { downloadQueue } from '../state/downloads.js';
import { sameRelease } from '../state/release-sets.js';

  function useDownload(game, release, root2, alternatives) {
    const [job2, setJob] = (0, useState)(null);
    const [error2, setError] = (0, useState)("");
    const started = (0, useRef)(false);
    (0, useEffect)(() => {
      setError("");
      try {
        return downloadQueue().subscribe((jobs) => setJob(jobs.find((item) => item.gameId === game.id && release && ((item.requestedId ?? item.release.id) === release.id || sameRelease(item.release, release))) || null));
      } catch (failure) {
        setError(failure.message);
        return void 0;
      }
    }, [game.id, release?.id]);
    (0, useEffect)(() => {
      try {
        if (job2?.state === "downloaded" || job2?.state === "attention") void downloadQueue().syncInstalls(job2.id);
        // An installed game's page asks ShadowMount's log how its last launch went (Played / Won't start).
        else if (job2?.state === "installed") void downloadQueue().refreshLaunches?.();
      } catch {
      }
    }, [job2?.id]);
    const advance = () => {
      try {
        setError("");
        const queue = downloadQueue();
        if (!job2) {
          if (release) {
            started.current = true;
            queue.enqueue(game, release, root2, alternatives);
          }
        } else if (BUSY.includes(job2.state) && job2.state !== "pausing" && job2.state !== "installing") queue.pause(job2.id);
        else if (job2.state === "installer-required") queue.install(job2.id);
        else if (job2.state === "paused" || job2.state === "failed") {
          started.current = true;
          queue.resume(job2.id);
        } else if (job2.state === "awaiting-browser") queue.openBrowser(job2.id);
        else if (job2.state === "downloaded" || job2.state === "attention") void queue.register(job2.id).catch((failure) => setError(failure.message));
      } catch (failure) {
        setError(failure.message);
      }
    };
    (0, useEffect)(() => {
      if (!started.current || !job2) return;
      if (job2.state === "awaiting-browser") {
        started.current = false;
        console.log(`[download-ui] ${job2.id} waits for the browser: opening it`);
        try {
          downloadQueue().openBrowser(job2.id);
        } catch (failure) {
          console.log(`[download-ui] openBrowser failed: ${failure.message}`);
          setError(failure.message);
        }
      } else if (!["queued", "resolving", "connecting"].includes(job2.state)) started.current = false;
    }, [job2?.state]);
    const status = job2?.state || (release ? "idle" : "unavailable");
    const action = (name) => {
      try {
        setError("");
        if (job2) void Promise.resolve(downloadQueue()[name](job2.id)).catch((failure) => setError(failure.message));
      } catch (failure) {
        setError(failure.message);
      }
    };
    // What a finished delete left to say (ShadowMount uninstalls once the app closes, say).
    const [note, setNote] = (0, useState)("");
    const deleteFromDisk = () => {
      setError("");
      setNote("");
      void downloadQueue().deleteFromDisk(job2.id).then((result) => setNote(result?.note || ""), (failure) => setError(failure.message));
    };
    return {
      status,
      progress: fractionOf(job2),
      advance,
      restart: () => action("restart"),
      remove: () => action("remove"),
      deleteFromDisk,
      job: job2,
      notice: note,
      error: error2 || job2?.error || ""
    };
  }

export { useDownload };
