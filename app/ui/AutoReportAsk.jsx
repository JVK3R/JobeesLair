// 0.5.5: the question the first failure asks (state/bug-report.js startAutoReports): may Jobee'sLair send its logs
// to the Jobee'sLair Discord by itself when something fails? Yes sends what just failed and turns it on, No (or
// Back) turns it off; either way it is asked once, and Settings > About & credits changes it.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { useT } from '../i18n/index.js';
import { askingAutoReports, setAutoReports, subscribeAutoReports } from '../state/bug-report.js';
import { Button2 } from './Button.jsx';
import { LongText } from './LongText.jsx';
import { colors, radius } from './colors.js';
import { FocusScope, Text, View, motion } from '@ps5-react/core';

  var ENTER = { type: "tween", duration: 0.24, ease: [0.22, 1, 0.36, 1] };
  var sans = (size, color, extra) => ({ fontFamily: "Exo2", fontSize: size, lineHeight: Math.round(size * 1.42), color, ...extra });
  function AutoReportAsk() {
    const t2 = useT();
    const [open, setOpen] = (0, useState)(askingAutoReports);
    (0, useEffect)(() => subscribeAutoReports(() => setOpen(askingAutoReports())), []);
    if (!open) return null;
    const no = () => {
      setAutoReports(false);
      return true;
    };
    return (
      // A modal: the page's actions stop here.
      /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: no, onAction: () => true, children: /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 70, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.canvas}f2` }, children: /* @__PURE__ */ (0, jsxs)(motion.View, {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        transition: ENTER,
        style: { width: 860, gap: 26, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 52 },
        children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: sans(44, colors.fg, { fontWeight: 600 }), children: t2("settings.report.askTitle") }),
          // Longer than one Text node keeps in most languages (ui/LongText.jsx).
          /* @__PURE__ */ (0, jsx)(LongText, { style: sans(23, colors.fg, { lineHeight: 34 }), children: t2("settings.report.askDetail") }),
          /* @__PURE__ */ (0, jsx)(Text, { style: sans(21, colors.subtle), children: t2("settings.report.askWhere") }),
          /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 16 }, children: [
            /* @__PURE__ */ (0, jsx)(Button2, { variant: "primary", size: "lg", icon: "circleCheck", label: t2("settings.report.askYes"), autoFocus: true, onPress: () => setAutoReports(true) }),
            /* @__PURE__ */ (0, jsx)(Button2, { variant: "secondary", size: "lg", label: t2("settings.report.askNo"), onPress: no })
          ] })
        ]
      }) }) })
    );
  }

export { AutoReportAsk };
