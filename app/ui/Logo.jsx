// ../pub-game-store/native/ui/Logo.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Jobee'sLair: the "JL" monogram (JLMark.jsx) and its Exo 2 wordmark.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { Text, View } from '@ps5-react/core';
import { JLMark } from './JLMark.jsx';
import { colors } from './colors.js';
import { px } from './scale.js';

  // The dock's logo is lit; another `color` (the footer's muted one) dims the mark with the wordmark.
  function Logo({ color = colors.fg }) {
    const muted = color !== colors.fg;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 12 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: muted ? { opacity: 0.55 } : null, children: /* @__PURE__ */ (0, jsx)(JLMark, { height: px(34) }) }),
      /* @__PURE__ */ (0, jsx)(Text, { style: [{ fontFamily: "Exo2", fontSize: 26, fontWeight: 600, letterSpacing: 1.2 }, { color }], children: "Jobee'sLair" })
    ] });
  }

export { Logo };
