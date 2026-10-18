// Jobee'sLair download telemetry: the band across the top of the dashboard. Live throughput (the whole
// queue's speed, large, with its last minute traced under it), the queue's overall progress (percent,
// meter, sizes and time left), the job counts by state as square tiles, and each drive's free space from
// the drive cache (state/drives.js; nothing here asks a drive itself).
// It follows the queue through one subscription and redraws at most twice a second.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { SpeedChart } from './SpeedChart.jsx';
import { formatDuration, formatSpeed } from './format.js';
import { createActivity } from './rates.js';
import { subscribe2 } from './useQueue.js';
import { SAMPLES } from './useThroughput.js';
import { formatNumber2 } from '../i18n/core.js';
import { useT } from '../i18n/index.js';
import { BUSY, COMPLETE } from '../state/download-queue.js';
import { downloadQueue, driveName } from '../state/downloads.js';
import { useDrives } from '../state/drives.js';
import { formatBytes } from '../state/size.js';
import { useSpeedLimit } from '../state/speed-limit.js';
import { colors, radius } from '../ui/colors.js';
import { Text, View } from '@ps5-react/core';

  var REDRAW_MS = 500, SAMPLE_MS = 1e3;
  var AMBER = "#fbbf24", RED = "#f87171", GREEN = "#4ade80";
  var font = (size, color, extra) => ({ fontFamily: "Exo2", fontSize: size, lineHeight: Math.round(size * 1.42), color, ...extra });
  var mono = (size, color, extra) => ({ fontFamily: "JetBrainsMono-Regular", fontSize: size, lineHeight: Math.round(size * 1.2), color, ...extra });
  var EMPTY = { speed: 0, active: 0, peak: 0, connections: 0, written: 0, total: 0, left: 0, counts: { moving: 0, held: 0, failed: 0, done: 0 }, samples: [] };
  function awake() {
    try {
      return downloadQueue().awake;
    } catch {
      return false;
    }
  }
  // The queue reduced to the band's numbers. Overall progress counts the unfinished jobs that know their
  // size; finished ones would pin it near 100%.
  function useTelemetry() {
    const [shown, setShown] = (0, useState)(EMPTY);
    (0, useEffect)(() => {
      const measure = createActivity();
      let samples = [], sampledAt = 0, drawnAt = 0, latest = EMPTY, timer = null;
      const draw = () => {
        timer = null;
        drawnAt = Date.now();
        setShown(latest);
      };
      const stop = subscribe2((jobs) => {
        const now = Date.now();
        const activity = measure(jobs, now);
        if (now - sampledAt >= SAMPLE_MS) {
          sampledAt = now;
          samples = activity.active ? [...samples, activity.speed].slice(-SAMPLES) : [];
        }
        const open = jobs.filter((job2) => !COMPLETE.includes(job2.state) && job2.total > 0);
        latest = {
          speed: activity.speed,
          active: activity.active,
          peak: activity.peak,
          connections: activity.connections,
          left: activity.left,
          written: open.reduce((sum, job2) => sum + Math.min(job2.written || 0, job2.total), 0),
          total: open.reduce((sum, job2) => sum + job2.total, 0),
          counts: {
            moving: jobs.filter((job2) => BUSY.includes(job2.state) && job2.state !== "pausing").length,
            held: jobs.filter((job2) => ["paused", "pausing", "awaiting-browser"].includes(job2.state)).length,
            failed: jobs.filter((job2) => job2.state === "failed").length,
            done: jobs.filter((job2) => COMPLETE.includes(job2.state)).length
          },
          samples
        };
        if (timer) return;
        const wait = Math.max(0, REDRAW_MS - (now - drawnAt));
        if (wait === 0) draw();
        else timer = setTimeout(draw, wait);
      });
      return () => {
        clearTimeout(timer);
        stop?.();
      };
    }, []);
    return shown;
  }
  function Label({ children }) {
    return /* @__PURE__ */ (0, jsx)(Text, { style: mono(16, colors.subtle, { letterSpacing: 2 }), children });
  }
  function Tile({ label, value, tone }) {
    const lit = value > 0;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { width: 128, height: 96, justifyContent: "space-between", borderRadius: radius.md, borderWidth: 1, borderColor: lit ? tone : colors.line, backgroundColor: colors.canvas2, paddingHorizontal: 14, paddingVertical: 10 }, children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: mono(15, lit ? tone : colors.subtle, { letterSpacing: 1.5 }), children: label }),
      /* @__PURE__ */ (0, jsx)(Text, { style: mono(34, lit ? colors.fg : colors.subtle), children: formatNumber2(value) })
    ] });
  }
  var METER = 520;
  function Telemetry({ error: error2 }) {
    const t2 = useT();
    const data = useTelemetry();
    const drives = useDrives();
    // The download speed limit set in Settings (state/speed-limit.js), said beside the peak while one is set.
    const limit = useSpeedLimit();
    const fraction = data.total ? Math.min(1, data.written / data.total) : 0;
    const speed = data.active ? formatSpeed(data.speed) : t2("downloads.panel.idle");
    // "42.1 MB/s" as a large number and a small unit; a locale that writes it another way shows it whole.
    const split = /^([\d.,]+)\s*(\D+)$/.exec(speed);
    const [number, unit] = data.active && split ? [split[1], split[2]] : [speed, ""];
    const max = Math.max(...data.samples, 1);
    const roots = drives.roots.slice(0, 3);
    return /* @__PURE__ */ (0, jsxs)(View, { style: { height: 200, flexDirection: "row", borderRadius: radius.lg, roundedClip: true, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, children: [
      // Throughput.
      /* @__PURE__ */ (0, jsxs)(View, { style: { width: 600, gap: 10, paddingHorizontal: 30, paddingVertical: 22, borderRightWidth: 1, borderColor: colors.line }, children: [
        /* @__PURE__ */ (0, jsx)(Label, { children: t2("downloads.dash.throughput") }),
        // The number with the last minute traced beside it.
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }, children: [
          /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "flex-end", gap: 12 }, children: [
            /* @__PURE__ */ (0, jsx)(Text, { style: mono(56, data.active ? colors.glow : colors.muted, { numberOfLines: 1 }), children: number }),
            unit ? /* @__PURE__ */ (0, jsx)(Text, { style: font(24, colors.muted, { marginBottom: 8 }), children: unit }) : null
          ] }),
          /* @__PURE__ */ (0, jsx)(SpeedChart, { samples: data.samples, max, color: colors.accentHi, width: 240, height: 60 })
        ] }),
        /* @__PURE__ */ (0, jsx)(Text, { style: mono(17, colors.subtle, { numberOfLines: 1 }), children: error2 ? error2 : [t2("downloads.dash.peak", { peak: data.peak ? formatSpeed(data.peak) : "—", connections: formatNumber2(data.connections) }), limit ? t2("downloads.dash.capped", { limit: t2("units.speed", { n: String(limit) }) }) : null].filter(Boolean).join(" · ") })
      ] }),
      // Queue progress.
      /* @__PURE__ */ (0, jsxs)(View, { style: { width: 600, gap: 10, paddingHorizontal: 30, paddingVertical: 22, borderRightWidth: 1, borderColor: colors.line }, children: [
        /* @__PURE__ */ (0, jsx)(Label, { children: t2("downloads.dash.progress") }),
        /* @__PURE__ */ (0, jsx)(Text, { style: mono(56, data.total ? colors.fg : colors.muted), children: data.total ? `${Math.floor(fraction * 100)}%` : "—" }),
        // A plain fill, resized twice a second at most: the queue's total moves slowly.
        /* @__PURE__ */ (0, jsx)(View, { style: { width: METER, height: 10, borderRadius: radius.pill, roundedClip: true, backgroundColor: colors.surface3 }, children: /* @__PURE__ */ (0, jsx)(View, { style: { width: Math.round(fraction * METER), height: 10, borderRadius: radius.pill, backgroundColor: data.active ? colors.accent : colors.subtle } }) }),
        /* @__PURE__ */ (0, jsx)(Text, { style: mono(17, colors.muted, { width: METER, numberOfLines: 1, ellipsizeMode: "tail" }), children: data.total ? data.active && data.speed && data.left ? t2("downloads.dash.sizesLeft", { done: formatBytes(data.written), total: formatBytes(data.total), left: formatDuration(data.left / data.speed) }) : t2("downloads.dash.sizes", { done: formatBytes(data.written), total: formatBytes(data.total) }) :awake() ? t2("downloads.panel.awake") : t2("downloads.dash.nothing") })
      ] }),
      // Counts and drives.
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 14, paddingHorizontal: 30, paddingVertical: 22 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 12 }, children: [
          /* @__PURE__ */ (0, jsx)(Tile, { label: t2("downloads.dash.active"), value: data.counts.moving, tone: colors.accentHi }),
          /* @__PURE__ */ (0, jsx)(Tile, { label: t2("downloads.dash.paused"), value: data.counts.held, tone: AMBER }),
          /* @__PURE__ */ (0, jsx)(Tile, { label: t2("downloads.dash.failed"), value: data.counts.failed, tone: RED }),
          /* @__PURE__ */ (0, jsx)(Tile, { label: t2("downloads.dash.done"), value: data.counts.done, tone: GREEN })
        ] }),
        /* @__PURE__ */ (0, jsx)(Text, { style: mono(17, colors.muted, { numberOfLines: 1, ellipsizeMode: "tail" }), children: roots.map((root2) => {
          const usage = drives.usage[root2];
          return `${driveName(root2)} ${usage ? t2("download.free", { size: formatBytes(usage.free) }) : "—"}`;
        }).join("   \xB7   ") || " " })
      ] })
    ] });
  }

export { Telemetry };
