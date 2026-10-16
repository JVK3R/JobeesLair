// ../pub-game-store/native/ui/colors.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Jobee'sLair stealth black: pitch-black canvas (#050811), near-black bands (#0A0E17) and
// graphite glass panels (#121824) with graphite edges. Electric #3A86FF and ice #4CC9F0 are kept for
// focus borders, active marks and text glows. The canvas stays one solid color so scrolled pages keep
// the engine's copy-scrolling (a gradient under a viewport makes every scroll a full repaint).
// The renderer has no backdrop blur, so "glass" is translucent graphite with a defined edge.
// MODIFIED: theme profiles (themes.js). The accent family (accent, accentHi, accentDeep, accentFg, glow)
// comes from the foreground user's preset; the black foundation is fixed. Components read the tokens
// as they render, so a retint takes effect when the store redraws (useThemeEpoch remounts it).

import { useEffect, useState } from 'react';
import { activeTheme, presetOf, saveTheme } from './themes.js';

  var accentOf = (preset) => ({ accent: preset.accent, accentHi: preset.hi, accentDeep: preset.deep, accentFg: preset.fg, glow: preset.hi });
  var colors = {
    canvas: "#05070d",
    canvas2: "#090d16",
    surface: "#0f1520",
    surface2: "#151d2b",
    surface3: "#1d2738",
    line: "#243047",
    fg: "#f3f6fb",
    muted: "#a6b1c4",
    subtle: "#75839a",
    glass: "#0f1520f2", // nearly opaque; the renderer has no blur
    glassEdge: "#2f3d58",
    ...accentOf(presetOf(activeTheme()))
  };
  // The shape scale. Small tags, controls and rows, cards, panels and sheets, and the full round of a pill
  // (a radius past half the height draws a pill). Everything rounded in the interface takes one of these.
  var radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
  // Graphite into black: the dock and sheets, drawn as `backgroundGradient`.
  var backdrop = (to = "bottom right") => ({
    type: "linear",
    to,
    stops: [{ color: "#161d2b", offset: 0 }, { color: "#0a0e17", offset: 0.55 }, { color: colors.canvas, offset: 1 }]
  });
  // The store is drawn again in the new accent once Settings closes (commitTheme), not while it is open:
  // a redraw remounts the store, which would close Settings under the player's hands.
  var epoch = 0, pending = false;
  var epochListeners = /* @__PURE__ */ new Set();
  function chooseTheme(id) {
    if (!saveTheme(id)) return;
    Object.assign(colors, accentOf(presetOf(id)));
    pending = true;
  }
  function commitTheme() {
    if (!pending) return;
    pending = false;
    epoch += 1;
    for (const listener of epochListeners) listener(epoch);
  }
  function useThemeEpoch() {
    const [value, setValue] = (0, useState)(epoch);
    (0, useEffect)(() => {
      epochListeners.add(setValue);
      return () => {
        epochListeners.delete(setValue);
      };
    }, []);
    return value;
  }

export { backdrop, chooseTheme, colors, commitTheme, radius, useThemeEpoch };
