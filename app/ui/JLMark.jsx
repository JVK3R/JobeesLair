// Jobee'sLair's mark: a sharp, minimalist "JL" monogram. Two flat polygons with chamfered corners and no
// curves, on nothing: the J is bright red (#FF1E27) and the L deep dark red (#800000). One geometry in a
// 96×64 box (aspect 3:2), shared with the README logos, the home-screen art and the phone page
// (packaging/brand/make_brand_art.py draws the same two polygons, and writes .github/readme/logo.svg).
// Two shapes, well under the vector node's 16-shape limit.

import { jsx, jsxs } from 'react/jsx-runtime';
import { Path, Svg } from '@ps5-react/core';

  var J_RED = "#FF1E27", L_RED = "#800000";
  // The J: a flag along the top, the stem, and a hook at the foot whose outer corner is cut at 45°.
  var J_PATH = "M20 4L40 4L40 46L30 60L6 60L6 40L18 40L18 48L28 48L28 16L14 16L14 10Z";
  // The L: the stem and a long foot whose end is cut at an angle.
  var L_PATH = "M52 4L64 4L64 48L92 48L84 60L52 60Z";
  var RATIO = 96 / 64;
  // The whole mark, `height` tall.
  function JLMark({ height }) {
    return /* @__PURE__ */ (0, jsxs)(Svg, { width: Math.round(height * RATIO), height, viewBox: "0 0 96 64", children: [
      /* @__PURE__ */ (0, jsx)(Path, { d: J_PATH, fill: J_RED }, "j"),
      /* @__PURE__ */ (0, jsx)(Path, { d: L_PATH, fill: L_RED }, "l")
    ] });
  }
  // One half alone, in the same box, for an entry that brings the two in apart.
  function JLHalf({ height, which }) {
    return /* @__PURE__ */ (0, jsx)(Svg, { width: Math.round(height * RATIO), height, viewBox: "0 0 96 64", children: /* @__PURE__ */ (0, jsx)(Path, { d: which === "j" ? J_PATH : L_PATH, fill: which === "j" ? J_RED : L_RED }) });
  }

export { JLHalf, JLMark, J_PATH, J_RED, L_PATH, L_RED, RATIO };
