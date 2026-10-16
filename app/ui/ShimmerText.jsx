// ../pub-game-store/native/ui/ShimmerText.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: the sweeping shimmer over a waiting label is gone; the label is plain, full-contrast text.
// (The state chip and the status line already say it is waiting.)

import { jsx } from 'react/jsx-runtime';
import { colors } from './colors.js';
import { Text, View } from '@ps5-react/core';

  function ShimmerText({ textStyle, children }) {
    return /* @__PURE__ */ (0, jsx)(View, { style: { alignSelf: "flex-start" }, children: /* @__PURE__ */ (0, jsx)(Text, { style: [textStyle, { color: colors.fg }], numberOfLines: 1, children }) });
  }

export { ShimmerText };
