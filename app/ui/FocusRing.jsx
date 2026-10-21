// ../pub-game-store/native/ui/FocusRing.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Jobee'sLair focus. A focused element gets one clean 3 px frame in the accent, drawn just outside
// it with a corner radius that follows the element's own, and it eases in over a sixth of a second. No
// orbiting highlight, no halo, no loop: focus is a state that arrives smoothly and then holds still.

import { jsx } from 'react/jsx-runtime';
import { motion, useIsFocused } from '@ps5-react/core';
import { px } from './scale.js';
import { colors, radius } from './colors.js';

  var OUTSET = 4, WIDTH = 3;
  var ARRIVE = { type: "tween", duration: 0.16, ease: "easeOut" };
  // The radius of the element the frame wraps, by the call sites' `round` name; `radius` overrides it.
  var HOST = { full: radius.pill, lg: radius.lg, md: radius.md };
  // `inset` draws the frame inside the element (cards clip what is drawn outside them).
  // MODIFIED (0.5.0 Pre Release 2): `color` draws it in another color (the Homebrew section's own).
  function Frame({ host, inset = false, color }) {
    const outer = inset || host >= radius.pill ? host : host + OUTSET;
    const out = inset ? 0 : -px(OUTSET);
    return /* @__PURE__ */ (0, jsx)(motion.View, {
      pointerEvents: "none",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: ARRIVE,
      style: { position: "absolute", top: out, right: out, bottom: out, left: out, borderRadius: outer, borderWidth: px(WIDTH), borderColor: color ?? colors.accentHi }
    });
  }
  function FocusRing({ round = "md", radius: host, color }) {
    return useIsFocused() ? /* @__PURE__ */ (0, jsx)(Frame, { host: host ?? HOST[round] ?? radius.md, color }) : null;
  }
  function FocusFrame({ round = "lg", radius: host }) {
    return useIsFocused() ? /* @__PURE__ */ (0, jsx)(Frame, { host: host ?? (round === "xl" ? radius.lg : HOST[round] ?? radius.md) }) : null;
  }
  function ShineBorder({ radius: host = radius.md }) {
    return /* @__PURE__ */ (0, jsx)(Frame, { host, inset: true });
  }

export { FocusFrame, FocusRing, ShineBorder };
