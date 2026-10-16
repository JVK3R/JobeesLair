// ../pub-game-store/native/ui/SideSheet.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: panels carry the purple backdrop gradient.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useLocale } from '../i18n/index.js';
import { HINT, useHints } from './Legend.jsx';
import { EASE_OUT } from './ease.js';
import { FocusScope, ScrollView, Text, View, motion } from '@ps5-react/core';
import { colors } from './colors.js';

  var enter = { type: "tween", duration: 0.28, ease: EASE_OUT };
  var PANEL = { position: "absolute", right: 0, top: 0, bottom: 0, borderLeftWidth: 2, borderColor: colors.line, backgroundColor: colors.surface };
  var PANEL_RTL = { position: "absolute", left: 0, top: 0, bottom: 0, borderRightWidth: 2, borderColor: colors.line, backgroundColor: colors.surface };
  var HINTS2 = [HINT.select, HINT.close];
  function SheetPanel({ style, children, initial, animate, exit, ...animation }) {
    const { rtl } = useLocale();
    const mirror = (values) => rtl && values?.x ? { ...values, x: -values.x } : values;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: `${colors.canvas}cc` } }),
      /* @__PURE__ */ (0, jsx)(
        motion.View,
        {
          style: [rtl ? PANEL_RTL : PANEL, style],
          initial: mirror(initial),
          animate: mirror(animate),
          exit: mirror(exit),
          ...animation,
          children
        }
      )
    ] });
  }
  function SideSheet({ title, subtitle, onClose, children }) {
    useHints(HINTS2);
    return /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: () => {
      onClose();
      return true;
    }, onAction: () => true, children: /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 50 }, children: /* @__PURE__ */ (0, jsxs)(
      SheetPanel,
      {
        style: { width: 810, gap: 30, paddingHorizontal: 36, paddingTop: 42, paddingBottom: 72 },
        initial: { opacity: 0, x: 48 },
        animate: { opacity: 1, x: 0 },
        transition: enter,
        children: [
          /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 6, paddingHorizontal: 18 }, children: [
            /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 30, fontWeight: 600, color: colors.fg, lineHeight: 42, letterSpacing: 0.4 }, children: title }),
            subtitle ? /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.muted, numberOfLines: 1, ellipsizeMode: "tail", lineHeight: 30 }, children: subtitle }) : null
          ] }),
          /* @__PURE__ */ (0, jsx)(ScrollView, { style: { flex: 1 }, children })
        ]
      }
    ) }) });
  }

export { SheetPanel, SideSheet };
