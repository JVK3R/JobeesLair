// Jobee'sLair download card: one job as a square-edged graphite tile in the dashboard grid.
// A state stripe down its leading edge and a state chip name what it is doing (accent while it moves,
// amber held, red failed, green done); the big readout is its percentage; the meter, sizes, time left and a
// live speed trace follow; the controls sit along the bottom: the main action (Pause, Resume, Retry,
// Restart, Install, Continue on the page), the game page, and a cancel that arms before it deletes.
// The card redraws only when the job's shape changes (memo on shapeOf); the moving numbers live in
// CardMeter and CardSpeed, which follow the job's own progress, so a running download repaints its meter
// and not the whole card.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { memo, useEffect, useState } from 'react';
import { SpeedChart } from './SpeedChart.jsx';
import { STALE_PARTIAL, cause, explainError } from './errors.js';
import { formatSpeed, formatTimeLeft } from './format.js';
import { WAITING, clearAction, shownState, stateLabel } from './labels.js';
import { fractionOf, shapeOf, useProgress } from './useQueue.js';
import { useThroughput } from './useThroughput.js';
import { isCdnProvider } from '../game/sources.js';
import { SPAN_MAX, fitBytes } from '../i18n/fit.js';
import { useT } from '../i18n/index.js';
import { BUSY, COMPLETE } from '../state/download-queue.js';
import { readinessOf, readinessText, stageLabel } from '../state/readiness.js';
import { formatBytes } from '../state/size.js';
import { Button2 } from '../ui/Button.jsx';
import { CdnSpark } from '../ui/CdnAura.jsx';
import { Cover } from '../ui/Cover.jsx';
import { ShimmerText } from '../ui/ShimmerText.jsx';
import { colors, radius } from '../ui/colors.js';
import { logical, px } from '../ui/scale.js';
import { Text, View, motion } from '@ps5-react/core';

  var CARD_WIDTH = 900;
  var INNER = CARD_WIDTH - 2 * 28 - 2; // the padding and the border
  var THUMB = { width: px(72), height: px(96), borderRadius: radius.sm };
  var ARM_MS = 3e3;
  var AMBER = "#fbbf24", RED = "#f87171", GREEN = "#4ade80";
  var primaryKey = (id) => `downloads:${id}`;
  var mono = (size, color, extra) => ({ fontFamily: "JetBrainsMono-Regular", fontSize: size, lineHeight: Math.round(size * 1.45), color, ...extra });
  var font = (size, color, extra) => ({ fontFamily: "Exo2", fontSize: size, lineHeight: Math.round(size * 1.42), color, ...extra });
  // The card's tone: what color its stripe, chip and meter take, from its readiness stage: green once it
  // is installed or played, red only for what the gamer can act on (a stopped download, a game that won't
  // start), amber while it waits on the gamer, the accent while it moves.
  function toneOf(job2, ready) {
    if (ready?.tone === "bad") return RED;
    if (ready?.tone === "good") return GREEN;
    if (["paused", "pausing", "awaiting-browser"].includes(job2.state)) return AMBER;
    return colors.accentHi;
  }
  function primary({ state, error: error2 }, run, openGame, ready) {
    if (ready?.action === "seeWhy") return { icon: "alert", label: "ready.seeWhy", onPress: () => run("seeWhy") };
    if (state === "pausing") return { icon: "pause", label: "downloads.action.pausing", onPress: () => {
    } };
    if (BUSY.includes(state)) return { icon: "pause", label: "downloads.action.pause", onPress: () => run("pause") };
    if (["paused", "failed"].includes(state) && STALE_PARTIAL.test(cause(error2))) return { icon: "download", label: "downloads.action.restart", onPress: () => run("restart") };
    if (state === "paused") return { icon: "play", label: "downloads.action.resume", onPress: () => run("resume") };
    if (state === "failed") return { icon: "download", label: "downloads.action.retry", onPress: () => run("resume") };
    if (state === "awaiting-browser") return { icon: "play", label: "downloads.action.continueOnPage", onPress: openGame };
    if (state === "downloaded") return { icon: "circleCheck", label: "downloads.action.install", onPress: () => run("register") };
    if (state === "attention") return { icon: "restart", label: "downloads.action.checkAgain", onPress: () => run("register") };
    return null;
  }
  // Cancel arms on the first press (it turns into a delete for three seconds), deletes on the second: an
  // unfinished job's partial files, or a finished game from disk (ShadowMount uninstalls it first).
  function CancelButton({ id, action, run, onFocus, onBlur }) {
    const [armed, setArmed] = (0, useState)(false);
    (0, useEffect)(() => {
      if (!armed) return void 0;
      const timer = setTimeout(() => setArmed(false), ARM_MS);
      return () => clearTimeout(timer);
    }, [armed]);
    return /* @__PURE__ */ (0, jsx)(Button2, {
      variant: armed ? "primary" : "secondary",
      size: "icon",
      icon: armed ? "delete" : "x",
      focusKey: `downloads-cancel:${id}`,
      onFocus,
      onBlur: () => {
        setArmed(false);
        onBlur();
      },
      onPress: () => {
        if (action === "remove") {
          run(action);
          return;
        }
        setArmed(!armed);
        if (armed) run(action);
      }
    });
  }
  // The moving part: percentage, meter, sizes and time left, from the job's own progress.
  function CardMeter({ id, tone, moving, complete, waiting: waiting2, label, detail: detail2 }) {
    const t2 = useT();
    const progress = useProgress(id);
    const { written = 0, total = null, bytesPerSecond = 0 } = progress ?? {};
    const fraction = complete ? 1 : fractionOf(progress);
    const percent = complete || total ? `${Math.floor(fraction * 100)}%` : "—";
    const left = moving && total && bytesPerSecond ? formatTimeLeft((total - written) / bytesPerSecond) : "";
    const size = detail2 ?? (complete ? formatBytes(total || written) : total ? t2("download.status.progress", { done: formatBytes(written), total: formatBytes(total) }) : written ? t2("download.soFar", { size: formatBytes(written) }) : "");
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 12 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { width: INNER, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }, children: [
        waiting2 ? /* @__PURE__ */ (0, jsx)(View, { style: { width: 600 }, children: /* @__PURE__ */ (0, jsx)(ShimmerText, { textStyle: font(21, colors.fg), background: colors.surface, children: label }) }) : /* @__PURE__ */ (0, jsxs)(Text, { style: font(21, colors.fg, { width: 600, numberOfLines: 1, ellipsizeMode: "tail" }), children: [
          fitBytes(label, SPAN_MAX),
          /* @__PURE__ */ (0, jsx)(Text, { style: { color: colors.muted }, children: left ? fitBytes(`  \xB7  ${left}`, SPAN_MAX) : "" })
        ] }),
        /* @__PURE__ */ (0, jsx)(Text, { style: { width: 220, textAlign: "end", fontFamily: "JetBrainsMono-Regular", fontSize: 40, lineHeight: 46, color: complete || moving ? tone : colors.muted }, children: percent })
      ] }),
      // The meter: a 10 px square track, filled in the card's tone; a moving one carries a lighter edge.
      // Layout is in screen pixels; motion's x is in 1280-wide design units, hence logical().
      /* @__PURE__ */ (0, jsx)(View, { style: { width: INNER, height: 10, borderRadius: radius.pill, roundedClip: true, backgroundColor: colors.surface3 }, children: /* @__PURE__ */ (0, jsx)(motion.View, {
        style: { position: "absolute", top: 0, bottom: 0, left: 0, width: INNER, backgroundColor: tone },
        initial: false,
        animate: { x: -(1 - fraction) * logical(INNER) },
        transition: { type: "tween", duration: 0.25, ease: "linear" },
        children: moving ? /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, bottom: 0, right: 0, width: 18, backgroundColor: "#ffffff66" } }) : null
      }) }),
      /* @__PURE__ */ (0, jsx)(Text, { style: mono(18, colors.muted, { width: INNER, numberOfLines: 1, ellipsizeMode: "tail" }), children: size || " " })
    ] });
  }
  // A running download's speed and its last minute, drawn only while it downloads.
  function CardSpeed({ id, tone }) {
    const { network } = useThroughput(id);
    const latest = network[network.length - 1] ?? 0;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 18 }, children: [
      /* @__PURE__ */ (0, jsx)(SpeedChart, { samples: network, max: Math.max(...network, 1), color: tone, width: 200, height: 40 }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { width: 170, textAlign: "end", fontFamily: "JetBrainsMono-Regular", fontSize: 22, lineHeight: 30, color: colors.fg }, children: latest ? formatSpeed(latest) : "—" })
    ] });
  }
  function DownloadCardView({ job: job2, game, autoFocus, run, onOpenGame, onFocusRow }) {
    const t2 = useT();
    // Which of its controls has focus (null: none), so the card's edge lights while focus is anywhere in it,
    // whichever order a move's blur and focus arrive in.
    const [within, setWithin] = (0, useState)(null);
    const { state, release } = job2;
    const shown = shownState(job2);
    const complete = COMPLETE.includes(state);
    const moving = BUSY.includes(state) && state !== "pausing";
    const ready = readinessOf(job2);
    const tone = toneOf(job2, ready);
    const openGame = () => onOpenGame(job2);
    const main = primary(job2, (name) => run(job2, name), openGame, ready);
    const focusOf = (name) => ({
      onFocus: () => {
        setWithin(name);
        onFocusRow(job2);
      },
      onBlur: () => setWithin((current) => current === name ? null : current)
    });
    const meta = [(job2.artifact.format || release.format || "").toUpperCase(), `${release.provider} ${release.version || ""}`.trim(), job2.root].filter(Boolean).join(" \xB7 ");
    const problem = job2.error && explainError(job2.error, Boolean(release.parts));
    const note = problem ? problem.action ? t2("downloads.problem", { title: problem.title, action: problem.action }) : problem.title : ready.action === "seeWhy" ? t2("ready.seeWhyHint") : state === "downloaded" ? job2.message || t2("downloads.installHint") : "";
    const cdn = isCdnProvider(release.provider);
    return /* @__PURE__ */ (0, jsxs)(View, { style: { width: CARD_WIDTH, flexDirection: "row", borderRadius: radius.lg, roundedClip: true, borderWidth: 1, borderColor: within ? colors.glow : colors.line, backgroundColor: within ? colors.surface2 : colors.surface }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 18, padding: 28 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 24 }, children: [
          /* @__PURE__ */ (0, jsx)(Cover, { game, label: false, style: THUMB }),
          /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 6 }, children: [
            /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 14 }, children: [
              /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.pill, backgroundColor: colors.canvas2, paddingHorizontal: 12, paddingVertical: 2 }, children: [
                /* @__PURE__ */ (0, jsx)(View, { style: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: tone } }),
                /* @__PURE__ */ (0, jsx)(Text, { style: mono(16, tone, { letterSpacing: 1.5 }), children: fitBytes(stageLabel(ready.stage).toUpperCase(), 96) })
              ] }),
              cdn ? /* @__PURE__ */ (0, jsx)(CdnSpark, { size: 13 }) : null,
              /* @__PURE__ */ (0, jsx)(Text, { style: mono(17, colors.subtle, { flex: 1, numberOfLines: 1, ellipsizeMode: "tail" }), children: meta })
            ] }),
            /* @__PURE__ */ (0, jsx)(Text, { style: font(27, colors.fg, { fontWeight: 600, numberOfLines: 1, ellipsizeMode: "tail", letterSpacing: 0.4 }), children: job2.title }),
            /* @__PURE__ */ (0, jsx)(Text, { style: font(20, problem ? RED : colors.muted, { numberOfLines: 1, ellipsizeMode: "tail" }), children: note || " " })
          ] })
        ] }),
        /* @__PURE__ */ (0, jsx)(CardMeter, {
          id: job2.id,
          tone,
          moving,
          complete,
          waiting: WAITING.includes(shown),
          label: shown === "finishing" ? stateLabel(shown) : readinessText(ready),
          detail: shown === "finishing" ? t2("downloads.writingToDisk") : null
        }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, children: [
          /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 12 }, children: [
            main ? /* @__PURE__ */ (0, jsx)(Button2, { variant: "primary", icon: main.icon, label: t2(main.label), style: { width: 230 }, autoFocus, focusKey: primaryKey(job2.id), ...focusOf("main"), onPress: main.onPress }) : null,
            /* @__PURE__ */ (0, jsx)(Button2, { variant: main ? "secondary" : "primary", icon: "chevronRight", label: t2("downloads.action.gamePage"), style: { width: 210 }, autoFocus: main ? false : autoFocus, focusKey: main ? `downloads-page:${job2.id}` : primaryKey(job2.id), ...focusOf("page"), onPress: openGame }),
            /* @__PURE__ */ (0, jsx)(CancelButton, { id: job2.id, action: clearAction(state), run: (name) => run(job2, name), ...focusOf("cancel") })
          ] }),
          state === "downloading" ? /* @__PURE__ */ (0, jsx)(CardSpeed, { id: job2.id, tone }) : null
        ] })
      ] })
    ] });
  }
  var DownloadCard = (0, memo)(
    DownloadCardView,
    (a, b) => shapeOf(a.job) === shapeOf(b.job) && a.autoFocus === b.autoFocus
  );

export { CARD_WIDTH, DownloadCard, primaryKey };
