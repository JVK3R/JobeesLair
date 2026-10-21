// ../pub-game-store/native/ui/NavItem.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED (0.5.0): 15 px either side (was 24), so the island keeps its R1 in view with Homebrew in it.
// MODIFIED (0.5.0 Pre Release 2): `caption` names an icon-only item in a small tag under it while it has focus
// (favorites, downloads, library, settings: an icon alone does not say where it goes). `tone` colors the icon always and the label when current (Homebrew's own color).

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { memo } from 'react';
import { FocusRing } from './FocusRing.jsx';
import { Icon } from './Icon.jsx';
import { colors, radius } from './colors.js';
import { Text, View, useIsFocused } from '@ps5-react/core';

  function Caption({ text }) {
    return /* @__PURE__ */ (0, jsx)(View, { pointerEvents: "none", style: { position: "absolute", left: -120, right: -120, top: 78, alignItems: "center" }, children: /* @__PURE__ */ (0, jsx)(View, { style: { height: 40, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.glassEdge, backgroundColor: colors.surface3, paddingHorizontal: 16 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 19, fontWeight: 600, lineHeight: 26, color: colors.fg }, children: text }) }) });
  }
  function Content2({ label, icon, iconFill, trailing, current, tone, caption }) {
    const focused = useIsFocused();
    const color = current || focused ? colors.fg : colors.muted;
    const mark = tone ?? color;
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, { round: "full", color: tone }),
      icon && /* @__PURE__ */ (0, jsx)(Icon, { name: icon, size: 18, color: mark, fill: iconFill ? mark : "none" }),
      label && /* @__PURE__ */ (0, jsx)(Text, { style: [{ fontFamily: "Exo2", fontSize: 23 }, { color: current && tone ? tone : color }], children: label }),
      trailing && /* @__PURE__ */ (0, jsx)(Icon, { name: trailing, size: 14, color }),
      caption && focused ? /* @__PURE__ */ (0, jsx)(Caption, { text: caption }) : null
    ] });
  }
  var NavItem = (0, memo)(function NavItem2({ label, icon, iconFill, trailing, current = false, tone, caption, children, ...rest2 }) {
    return /* @__PURE__ */ (0, jsxs)(View, { ...rest2, style: { position: "relative", height: 60, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: radius.md, paddingHorizontal: 15 }, children: [
      /* @__PURE__ */ (0, jsx)(Content2, { label, icon, iconFill, trailing, current, tone, caption }),
      children
    ] });
  });

export { NavItem };
