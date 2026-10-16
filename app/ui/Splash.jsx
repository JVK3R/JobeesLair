// ../pub-game-store/native/ui/Splash.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Jobee'sLair launch, industrial. On the graphite canvas the two halves of the "JL" mark slide
// together while the mark scales up into the center of the frame; under it, monospace telemetry lines
// ([SYSTEM] [AUTH] [FEED] [STATUS]) type in one after another with real values (version, whether a companion
// PIN is set, how many titles are indexed). Then the whole screen slides up and away, off the startup notice
// that was mounted under it. Nothing fades: every move is a transform of a small element (the mark, a line)
// or of the full-screen layer, which is translated, never faded or scaled. About 2.7 seconds. Same lifecycle
// as before: nothing of the store is rendered until `onDone`.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { Text, View, motion } from '@ps5-react/core';
import { needsPin } from '../companion/service.js';
import { formatNumber2 } from '../i18n/core.js';
import { libraryCount } from '../state/library-count.js';
import { TITLE_ID, VERSION } from '../version.js';
import { JLHalf, J_RED } from './JLMark.jsx';
import { colors } from './colors.js';
import { EASE_OUT } from './ease.js';
import { logical } from './scale.js';

  // The mark's box in output pixels, under 512 wide so the engine can scale it.
  var MARK_H = 300;
  var MARK_W = MARK_H * 1.5;
  var GREEN = "#4ade80";
  // Milliseconds from launch: the lines type in, the screen holds on READY, then it leaves.
  var LINE_AT = [480, 780, 1080, 1380];
  var EXIT_AT = 2200;
  var GONE_MS = 3e3;
  var ARRIVE = { type: "tween", duration: 0.66, ease: EASE_OUT };
  var SLIDE = { type: "tween", duration: 0.18, ease: "easeOut" };
  var LEAVE = { type: "tween", duration: 0.5, ease: [0.7, 0, 0.84, 0] };
  // What the log says, read from the app as it starts.
  function bootLines() {
    let pin = "NOT SET";
    try {
      pin = needsPin() ? "NOT SET" : "OK";
    } catch {
    }
    let index = "0 TITLES";
    try {
      const { titles, direct } = libraryCount();
      index = `${formatNumber2(titles)} TITLES | ${formatNumber2(direct)} DIRECT`;
    } catch {
    }
    return [
      { tag: "SYSTEM", message: "MOUNTING KERNEL...", result: `v${VERSION}  ${TITLE_ID}`, tone: colors.fg },
      { tag: "AUTH", message: "VERIFYING PIN...", result: pin, tone: pin === "OK" ? GREEN : colors.muted },
      { tag: "FEED", message: "INDEXING SOURCES...", result: index, tone: colors.fg },
      { tag: "STATUS", message: "READY", result: "", tone: GREEN }
    ];
  }
  var mono = { fontFamily: "JetBrainsMono-Regular", fontSize: 24, lineHeight: 36, letterSpacing: 1 };
  function Line({ line }) {
    return /* @__PURE__ */ (0, jsx)(motion.View, {
      initial: { x: -14 },
      animate: { x: 0 },
      transition: SLIDE,
      children: /* @__PURE__ */ (0, jsxs)(Text, { style: [mono, { color: colors.muted }], children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { color: line.tag === "STATUS" ? J_RED : colors.subtle }, children: `[${line.tag}] ` }),
        line.message,
        line.result ? /* @__PURE__ */ (0, jsx)(Text, { style: { color: line.tone }, children: `  ${line.result}` }) : null
      ] })
    });
  }
  function Splash({ onDone, onExit }) {
    const [shown, setShown] = (0, useState)(0);
    const [leaving, setLeaving] = (0, useState)(false);
    const [done, setDone] = (0, useState)(false);
    const [lines] = (0, useState)(bootLines);
    const finished = (0, useRef)(false);
    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      setDone(true);
      if (onDone) onDone();
    };
    const left = (0, useRef)(false);
    const leave = () => {
      if (left.current) return;
      left.current = true;
      setLeaving(true);
      if (onExit) onExit();
    };
    (0, useEffect)(() => {
      const ids = LINE_AT.map((ms, index) => setTimeout(() => setShown(index + 1), ms));
      ids.push(setTimeout(leave, EXIT_AT));
      ids.push(setTimeout(finish, GONE_MS));
      return () => ids.forEach(clearTimeout);
    }, []);
    if (done) return null;
    return /* @__PURE__ */ (0, jsx)(motion.View, {
      style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 90, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
      initial: false,
      animate: { y: leaving ? -logical(1080) : 0 },
      transition: LEAVE,
      onAnimationComplete: () => {
        if (leaving) finish();
      },
      children: /* @__PURE__ */ (0, jsxs)(View, { style: { alignItems: "center", gap: 44 }, children: [
        // The mark: it scales up into the frame while its halves close on each other.
        /* @__PURE__ */ (0, jsxs)(motion.View, {
          style: { width: MARK_W, height: MARK_H },
          initial: { scale: 0.45 },
          animate: { scale: 1 },
          transition: ARRIVE,
          children: [
            /* @__PURE__ */ (0, jsx)(motion.View, { style: { position: "absolute", left: 0, top: 0 }, initial: { x: -70 }, animate: { x: 0 }, transition: ARRIVE, children: /* @__PURE__ */ (0, jsx)(JLHalf, { height: MARK_H, which: "j" }) }),
            /* @__PURE__ */ (0, jsx)(motion.View, { style: { position: "absolute", left: 0, top: 0 }, initial: { x: 70 }, animate: { x: 0 }, transition: ARRIVE, children: /* @__PURE__ */ (0, jsx)(JLHalf, { height: MARK_H, which: "l" }) })
          ]
        }),
        // The log: a fixed block, so lines typing in never move the mark.
        /* @__PURE__ */ (0, jsxs)(View, { style: { width: 820, height: 4 * 36 + 20, gap: 0, borderLeftWidth: 3, borderColor: colors.line, paddingLeft: 24, paddingTop: 10 }, children: lines.slice(0, shown).map((line) => /* @__PURE__ */ (0, jsx)(Line, { line }, line.tag)) })
      ] })
    });
  }

export { Splash };
