// ../pub-game-store/native/ui/PlatformBadge.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: industrial tag. The slanted, rounded logotype pills are replaced by square monospace tags
// ("PS5", "PS4"): PS5 inverted (light fill, dark text), PS4 outlined. Sony's logotype is not redrawn.

import '../assets/JetBrainsMono-Regular.ttf';
import { jsx } from 'react/jsx-runtime';
import { Text, View } from '@ps5-react/core';
import { colors } from './colors.js';

  var TAG = {
    ps5: { label: "PS5", box: { backgroundColor: colors.fg, borderColor: colors.fg }, ink: colors.canvas },
    ps4: { label: "PS4", box: { backgroundColor: `${colors.canvas}d9`, borderColor: colors.fg }, ink: colors.fg }
  };
  function PlatformBadge({ platforms, style }) {
    const order = [...platforms].sort().reverse();
    return /* @__PURE__ */ (0, jsx)(View, { style: [{ flexDirection: "row", gap: 4 }, style], children: order.map((platform) => {
      const { label, box, ink } = TAG[platform];
      return /* @__PURE__ */ (0, jsx)(View, { style: [{ height: 26, minWidth: 52, alignItems: "center", justifyContent: "center", borderWidth: 2 }, box], children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 16, lineHeight: 20, letterSpacing: 1, color: ink }, children: label }) }, platform);
    }) });
  }

export { PlatformBadge };
