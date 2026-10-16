// ../pub-game-store/native/game/About.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { LayoutAnimation, Text, View, motion, useIsFocused } from '@ps5-react/core';
import { LATIN_IN_RTL, useLocale, useT } from '../i18n/index.js';
import { FocusRing } from '../ui/FocusRing.jsx';
import { colors, radius } from '../ui/colors.js';

  var isHeading = (line) => line.length < 70 && line === line.toUpperCase() && line !== line.toLowerCase();
  function ToggleLabel({ expanded }) {
    const t2 = useT();
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsx)(Text, { focused, style: [{ fontFamily: "Exo2", fontSize: 21, color: colors.muted, lineHeight: 30 }, focused ? { color: colors.fg } : null], children: t2(expanded ? "game.showLess" : "game.showMore") });
  }
  function About({ paragraphs }) {
    const t2 = useT();
    const { rtl } = useLocale();
    const latin2 = rtl ? LATIN_IN_RTL : void 0;
    const [expanded, setExpanded] = (0, useState)(false);
    const toggle = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded((value) => !value);
    };
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 30, fontWeight: 600, color: colors.fg, lineHeight: 42, letterSpacing: 0.4 }, children: t2("game.about") }),
      /* @__PURE__ */ (0, jsxs)(View, { style: [{ position: "relative", marginTop: 24, overflow: "hidden" }, expanded ? null : { height: 288 }], children: [
        /* @__PURE__ */ (0, jsx)(View, { style: { width: 900, gap: 18 }, children: paragraphs.map(
          (paragraph, i) => isHeading(paragraph) ? /* @__PURE__ */ (0, jsx)(Text, { style: [{ paddingTop: 18, fontFamily: "Exo2", fontSize: 21, fontWeight: 600, color: colors.fg, lineHeight: 30, letterSpacing: 1.26 }, latin2], children: paragraph }, i) : /* @__PURE__ */ (0, jsx)(Text, { style: [{ width: 900, fontFamily: "Exo2", fontSize: 23, color: colors.muted, lineHeight: 37 }, latin2], children: paragraph }, i)
        ) }),
        /* @__PURE__ */ (0, jsx)(
          motion.View,
          {
            style: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120, backgroundGradient: { type: "linear", to: "top", stops: [{ color: colors.canvas, offset: 0 }, { color: `${colors.canvas}00`, offset: 1 }] } },
            pointerEvents: "none",
            initial: false,
            animate: { opacity: expanded ? 0 : 1 }
          }
        )
      ] }),
      /* @__PURE__ */ (0, jsxs)(View, { focusKey: "game:about", onPress: toggle, style: { position: "relative", marginTop: 18, alignSelf: "flex-start", borderRadius: radius.sm }, children: [
        /* @__PURE__ */ (0, jsx)(ToggleLabel, { expanded }),
        /* @__PURE__ */ (0, jsx)(FocusRing, {})
      ] })
    ] });
  }

export { About };
