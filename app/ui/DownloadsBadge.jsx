// ../pub-game-store/native/ui/DownloadsBadge.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { BUSY } from '../state/download-queue.js';
import { downloadQueue } from '../state/downloads.js';
import { colors, radius } from './colors.js';
import { Text, View, useIsFocused } from '@ps5-react/core';

  var IDLE = { count: 0, percent: null };
  function summary3(jobs) {
    const busy = jobs.filter((job2) => BUSY.includes(job2.state));
    if (!busy.length) return IDLE;
    const sized = busy.filter((job2) => job2.total > 0);
    const total = sized.reduce((sum, job2) => sum + job2.total, 0);
    const written = sized.reduce((sum, job2) => sum + Math.min(job2.written, job2.total), 0);
    return { count: busy.length, percent: total ? Math.floor(written / total * 100) : null };
  }
  function DownloadsBadge() {
    const [state, setState] = (0, useState)(IDLE);
    const focused = useIsFocused();
    (0, useEffect)(() => {
      let last = IDLE;
      try {
        return downloadQueue().subscribe((jobs) => {
          const next = summary3(jobs);
          if (last.count === next.count && last.percent === next.percent) return;
          last = next;
          setState(next);
        });
      } catch (error2) {
        console.log(`[downloads] queue unavailable: ${error2.message}`);
        return void 0;
      }
    }, []);
    if (!state.count) return null;
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: [{ fontFamily: "Exo2", fontSize: 23 }, { color: focused ? colors.fg : colors.muted }], children: String(state.count) }),
      state.percent === null ? null : /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", left: 24, right: 24, bottom: 6, height: 5, overflow: "hidden", borderRadius: radius.pill, backgroundColor: "#ffffff33" }, children: /* @__PURE__ */ (0, jsx)(View, { style: [{ height: "100%", backgroundColor: colors.accent }, { width: `${state.percent}%` }] }) })
    ] });
  }

export { DownloadsBadge };
