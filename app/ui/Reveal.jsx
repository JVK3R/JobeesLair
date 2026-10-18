// The store's reveal after the startup notice (0.4.0): a vortex. Sparks in the theme's accent spiral in from
// around the screen and meet in its middle, where the JL mark pops out of them, spinning up from nothing and
// overshooting into place, with a flash and two rings bursting outward, and the name and version under it.
// Then the mark flies up toward its place in the top island, fading as it goes, while the dark backdrop fades
// away and leaves the store, already drawn underneath. About 2.9 seconds.
//
// Inspired by console boot intros where a logo comes out of a spiral (the Dreamcast's swirl), and by the
// "particles converge into a vortex, flash, logo" reveals of motion design. Built within the engine's limits
// (ps5-react docs/ANIMATION.md): everything that spins or scales is small (under 512 px), and the only
// full-screen change is the backdrop's single fade at the end. The motion engine has no keyframes, so each
// spark's spiral is a series of targets handed to its springs every STEP_MS: a spring keeps its speed when
// retargeted, which rounds the corners into a curve.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { Text, View, motion } from '@ps5-react/core';
import { VERSION_LABEL } from '../version.js';
import { JLMark, J_RED } from './JLMark.jsx';
import { colors } from './colors.js';
import { dockMark } from './dock-mark.js';
import { EASE_OUT } from './ease.js';
import { logical } from './scale.js';

  // The screen in output pixels, and its middle.
  var W = 1920, H = 1080, CX = W / 2, CY = H / 2;
  // The spiral: ARMS sparks (each with a dimmer one trailing it), STEPS targets STEP_MS apart, from RADIUS out
  // to the middle, turning TURN degrees per step.
  var ARMS = 14;
  var STEPS = 9;
  var STEP_MS = 95;
  var RADIUS = 720;
  var TURN = 34;
  var SPARK_W = 34, SPARK_H = 6;
  // When (ms from the start) the mark pops, starts leaving, and the reveal is over.
  var POP_AT = STEPS * STEP_MS + 60;
  var LEAVE_AT = POP_AT + 1100;
  var DONE_AT = LEAVE_AT + 950;
  // The mark: 180 px tall (270 wide, small enough to spin and scale), its middle MARK_LIFT above the screen's
  // to leave room for the name. When it leaves it flies to the island's own mark (dock-mark.js) and shrinks to
  // its size, so it lands on it.
  var MARK_H = 180;
  var MARK_W = MARK_H * 1.5;
  var MARK_LIFT = 40;
  var SPARK_SPRING = { type: "spring", stiffness: 150, damping: 19 };
  var TRAIL_SPRING = { type: "spring", stiffness: 90, damping: 17 };
  var POP_SPRING = { type: "spring", stiffness: 210, damping: 12 };
  var BURST = { type: "tween", duration: 0.8, ease: EASE_OUT };
  var FADE_OUT = { type: "tween", duration: 0.75, ease: [0.4, 0, 0.2, 1] };
  var FLY = { type: "tween", duration: 0.8, ease: [0.65, 0, 0.35, 1] };

  // Where spark `arm` is at step `k`: on the spiral, pointing along it (degrees for `rotate`).
  function spiral(arm, k) {
    const left = 1 - k / STEPS;
    const r = RADIUS * Math.pow(left, 1.35);
    const angle = arm * (360 / ARMS) + k * TURN;
    const rad = angle * Math.PI / 180;
    return { x: logical(r * Math.cos(rad)), y: logical(r * Math.sin(rad)), rotate: angle + 90 + 25 * left };
  }
  function Spark({ arm, step, trail }) {
    const tone = arm % 3 === 0 ? J_RED : arm % 3 === 1 ? colors.accentHi : colors.accent;
    const arrived = step >= STEPS;
    const size = trail ? { width: SPARK_W * 0.7, height: SPARK_H - 2 } : { width: SPARK_W, height: SPARK_H };
    return /* @__PURE__ */ (0, jsx)(motion.View, {
      initial: { ...spiral(arm, 0), opacity: trail ? 0.45 : 1 },
      animate: { ...spiral(arm, Math.min(step, STEPS)), opacity: arrived ? 0 : trail ? 0.45 : 1 },
      transition: { ...(trail ? TRAIL_SPRING : SPARK_SPRING), opacity: { type: "tween", duration: arrived ? 0.16 : 0.01 } },
      style: { position: "absolute", left: CX - size.width / 2, top: CY - size.height / 2, ...size, borderRadius: SPARK_H, backgroundColor: tone }
    });
  }
  // A ring bursting out of the middle: laid out at 440 (under 512) and scaled up from a dot.
  function Ring({ color, delay, to }) {
    return /* @__PURE__ */ (0, jsx)(motion.View, {
      initial: { scale: 0.12, opacity: 1 },
      animate: { scale: to, opacity: 0 },
      transition: { ...BURST, delay },
      style: { position: "absolute", left: CX - 220, top: CY - 220, width: 440, height: 440, borderRadius: 220, borderWidth: 4, borderColor: color }
    });
  }
  function Reveal({ onDone }) {
    const [step, setStep] = (0, useState)(0);
    const [phase, setPhase] = (0, useState)("swirl");
    const finished = (0, useRef)(false);
    (0, useEffect)(() => {
      const ids = [];
      for (let k = 1; k <= STEPS; k++) ids.push(setTimeout(() => setStep(k), k * STEP_MS));
      ids.push(setTimeout(() => setPhase("pop"), POP_AT));
      ids.push(setTimeout(() => setPhase("leave"), LEAVE_AT));
      ids.push(setTimeout(() => {
        if (finished.current) return;
        finished.current = true;
        onDone?.();
      }, DONE_AT));
      return () => ids.forEach(clearTimeout);
    }, []);
    const popped = phase !== "swirl";
    const leaving = phase === "leave";
    const arms = Array.from({ length: ARMS }, (_, arm) => arm);
    // Every child is keyed: the sparks, flash and rings come and go, and the mark and the name must stay the
    // same elements through that (an unkeyed one would remount from its first frame).
    return /* @__PURE__ */ (0, jsxs)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 100 }, children: [
      // The backdrop: the one full-screen layer, faded once at the end.
      /* @__PURE__ */ (0, jsx)(motion.View, { initial: false, animate: { opacity: leaving ? 0 : 1 }, transition: FADE_OUT, style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.canvas } }, "backdrop"),
      // The vortex: each arm a spark and, a little behind it on a softer spring, its trail.
      ...popped ? [] : arms.flatMap((arm) => [
        /* @__PURE__ */ (0, jsx)(Spark, { arm, step, trail: true }, `t${arm}`),
        /* @__PURE__ */ (0, jsx)(Spark, { arm, step }, `s${arm}`)
      ]),
      // The pop: a flash in the middle and two rings, mounted when the sparks meet.
      ...popped && !leaving ? [
        /* @__PURE__ */ (0, jsx)(motion.View, { initial: { scale: 0.3, opacity: 1 }, animate: { scale: 3.2, opacity: 0 }, transition: { type: "tween", duration: 0.45, ease: EASE_OUT }, style: { position: "absolute", left: CX - 40, top: CY - 40, width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accentHi } }, "flash"),
        /* @__PURE__ */ (0, jsx)(Ring, { color: colors.accentHi, delay: 0, to: 1.25 }, "ring1"),
        /* @__PURE__ */ (0, jsx)(Ring, { color: J_RED, delay: 0.14, to: 1.05 }, "ring2")
      ] : [],
      // The mark: spins up out of the vortex, overshoots into place, then flies toward the island.
      /* @__PURE__ */ (0, jsx)(motion.View, {
        initial: { scale: 0.05, rotate: -220, opacity: 0 },
        animate: leaving ? { x: logical(dockMark.x - CX), y: logical(dockMark.y - (CY - MARK_LIFT)), scale: dockMark.height / MARK_H, rotate: 0, opacity: 0 } : popped ? { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 } : { scale: 0.05, rotate: -220, opacity: 0 },
        transition: leaving ? { ...FLY, opacity: { type: "tween", duration: 0.3, delay: 0.55, ease: "easeIn" } } : { ...POP_SPRING, opacity: { type: "tween", duration: 0.12 } },
        style: { position: "absolute", left: CX - MARK_W / 2, top: CY - MARK_H / 2 - MARK_LIFT, width: MARK_W, height: MARK_H },
        children: /* @__PURE__ */ (0, jsx)(JLMark, { height: MARK_H })
      }, "mark"),
      // The name and the version, rising in under the mark and gone as it leaves.
      /* @__PURE__ */ (0, jsxs)(motion.View, {
        initial: { y: logical(16), opacity: 0 },
        animate: popped && !leaving ? { y: 0, opacity: 1 } : { y: logical(leaving ? -8 : 16), opacity: 0 },
        transition: leaving ? { type: "tween", duration: 0.22, ease: "easeIn" } : { type: "tween", duration: 0.5, delay: 0.25, ease: EASE_OUT },
        style: { position: "absolute", left: CX - 400, top: CY + MARK_H / 2 - 4, width: 800, alignItems: "center", gap: 6 },
        children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 52, fontWeight: 600, letterSpacing: 2, color: colors.fg }, children: "Jobee'sLair" }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 20, letterSpacing: 3, color: colors.muted }, children: VERSION_LABEL.toUpperCase() })
        ]
      }, "name")
    ] });
  }

export { Reveal };
