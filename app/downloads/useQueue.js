// ../pub-game-store/native/downloads/useQueue.js
// reconstructed from the esbuild bundle in eboot.bin

import { useEffect, useState } from 'react';
import { downloadQueue } from '../state/downloads.js';

  function subscribe2(listener) {
    try {
      return downloadQueue().subscribe(listener);
    } catch {
      return void 0;
    }
  }
  // Everything a card or library tile shows that is not progress: the last launch's outcome, the drive (a
  // move changes it) and whether a move is under way or stopped.
  var shapeOf = (job2) => `${job2.id}|${job2.state}|${job2.phase || ""}|${job2.error}|${job2.message || ""}|${job2.total}|${job2.launch?.outcome || ""}|${job2.root}|${job2.moving ? `${job2.moving.to}:${job2.moving.interrupted ? "stopped" : "moving"}:${job2.moving.error || ""}` : ""}|${job2.extras || ""}`;
  var fractionOf = (progress) => progress?.total ? Math.min(1, progress.written / progress.total) : 0;
  function useJobs() {
    const [state, setState] = (0, useState)({ jobs: [], shape: "", error: "" });
    (0, useEffect)(() => {
      let last = "";
      try {
        return downloadQueue().subscribe((jobs) => {
          const shape = jobs.map(shapeOf).join("\n");
          if (shape === last) return;
          last = shape;
          setState({ jobs, shape, error: "" });
        });
      } catch (failure) {
        setState({ jobs: [], shape: "", error: failure.message });
        return void 0;
      }
    }, []);
    return state;
  }
  function useProgress(id) {
    const [progress, setProgress] = (0, useState)(null);
    (0, useEffect)(() => {
      let last = null;
      return subscribe2((jobs) => {
        const job2 = jobs.find((item) => item.id === id);
        if (!job2 || last && last.written === job2.written && last.total === job2.total && last.bytesPerSecond === (job2.bytesPerSecond || 0)) return;
        last = { written: job2.written, total: job2.total, bytesPerSecond: job2.bytesPerSecond || 0 };
        setProgress(last);
      });
    }, [id]);
    return progress;
  }

export { fractionOf, shapeOf, subscribe2, useJobs, useProgress };
