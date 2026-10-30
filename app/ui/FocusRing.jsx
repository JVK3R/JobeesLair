// ../pub-game-store/native/ui/FocusRing.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Jobee'sLair focus. A focused element gets one clean 3 px frame in the accent, drawn just outside
// it with a corner radius that follows the element's own, and it eases in over a sixth of a second. No
// orbiting highlight, no halo, no loop: focus is a state that arrives smoothly and then holds still.
// MODIFIED (0.5.4): players said they couldn't always see what they were on. The frame sat 1 px off the element,
// so a frame in the element's own color (a green app tile in Homebrew green, a cyan cover) read as part of it.
// Now a dark band always parts the two: the frame stands further out, with the band between, and a frame drawn
// inside a card is thicker, with the band on its inner side. On the black canvas the band can't be seen; over art
// or a colored tile it outlines the frame. FocusInset is the inset frame for rows inside a menu or list.

import { jsx, jsxs } from 'react/jsx-runtime';
import { View, motion, useIsFocused } from '@ps5-react/core';
import { px } from './scale.js';
import { colors, radius } from './colors.js';

  var OUTSET = 6, WIDTH = 3, INSET_WIDTH = 4, BAND = 2;
  // The canvas, nearly opaque: the band between the frame and what it frames.
  var BAND_COLOR = "#05070de6";
  var ARRIVE = { type: "tween", duration: 0.16, ease: "easeOut" };
  // The radius of the element the frame wraps, by the call sites' `round` name; `radius` overrides it.
  var HOST = { full: radius.pill, lg: radius.lg, md: radius.md, sm: radius.sm };
  // `inset` draws the frame inside the element (cards clip what is drawn outside them).
  // MODIFIED (0.5.0 Pre Release 2): `color` draws it in another color (the Homebrew section's own).
  // 0.5.1: `instant` draws it at once. A card's frame (ShineBorder) faded in on every step along a row, so the
  // frame blinked while the row scrolled; it is solid from the first frame now, as CardFocus intends.
  // A border `at` in from the frame's outer edge.
  var layer = (at, round, width, color) => /* @__PURE__ */ (0, jsx)(View, { pointerEvents: "none", style: { position: "absolute", top: at, right: at, bottom: at, left: at, borderRadius: Math.max(0, round), borderWidth: width, borderColor: color } });
  function Frame({ host, inset = false, color, instant = false }) {
    const width = px(inset ? INSET_WIDTH : WIDTH);
    const pill = host >= radius.pill;
    const out = inset ? 0 : px(OUTSET);
    const outer = pill ? host : host + out;
    // Outside the element, the band fills the gap between the frame and it; inside a card, it runs along the
    // frame's inner edge. Both are borders only: nothing of the element is covered. They are siblings in a box as
    // large as the frame: the engine clips a fading view's children to its box, and a child of a bordered view
    // would start at its outer edge, over the border.
    const band = inset ? px(BAND) : out - width;
    return /* @__PURE__ */ (0, jsxs)(motion.View, {
      pointerEvents: "none",
      initial: instant ? false : { opacity: 0 },
      animate: { opacity: 1 },
      transition: ARRIVE,
      style: { position: "absolute", top: -out, right: -out, bottom: -out, left: -out },
      children: [
        band > 0 ? layer(width, pill ? host : outer - width, band, BAND_COLOR) : null,
        layer(0, outer, width, color ?? colors.accentHi)
      ]
    });
  }
  function FocusRing({ round = "md", radius: host, color }) {
    return useIsFocused() ? /* @__PURE__ */ (0, jsx)(Frame, { host: host ?? HOST[round] ?? radius.md, color }) : null;
  }
  function FocusFrame({ round = "lg", radius: host }) {
    return useIsFocused() ? /* @__PURE__ */ (0, jsx)(Frame, { host: host ?? (round === "xl" ? radius.lg : HOST[round] ?? radius.md) }) : null;
  }
  function ShineBorder({ radius: host = radius.md }) {
    return /* @__PURE__ */ (0, jsx)(Frame, { host, inset: true, instant: true });
  }
  // 0.5.4: the frame inside a focused row whose neighbors sit close (a menu's items), where one outside would
  // cross into them.
  function FocusInset({ radius: host = radius.sm, color }) {
    return useIsFocused() ? /* @__PURE__ */ (0, jsx)(Frame, { host, inset: true, instant: true, color }) : null;
  }

export { FocusFrame, FocusInset, FocusRing, ShineBorder };
