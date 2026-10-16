// Jobee'sLair startup notice: the terms of use and legal notice, as plain text in a square box, shown on
// every launch right after the intro and before the store. It stays until the player presses ✕ on Continue
// (focused from the start). Back does nothing here. Nothing of the store is mounted underneath it, so the
// only way on is through the notice. No logo, colors, animation or fade: it is a notice, not a screen.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useRef } from 'react';
import { FocusScope, Text, View, useIsFocused } from '@ps5-react/core';
import { t } from '../i18n/core.js';
import { CREATOR } from '../version.js';
import { ButtonGlyph } from './ButtonHints.jsx';
import { colors } from './colors.js';

  var WIDTH = 1100;
  var CONTINUE_KEY = "notice:continue";
  var mono = (size, color) => ({ fontFamily: "JetBrainsMono-Regular", fontSize: size, lineHeight: Math.round(size * 1.5), letterSpacing: 1, color });
  var body = { fontFamily: "Exo2", fontSize: 25, lineHeight: 37, color: colors.fg };
  function Clause({ label, children }) {
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 4 }, children: [
      label ? /* @__PURE__ */ (0, jsx)(Text, { style: mono(18, colors.muted), children: label }) : null,
      /* @__PURE__ */ (0, jsx)(Text, { style: body, children })
    ] });
  }
  // The label inverts with focus: white box and dark text when selected, the reverse otherwise.
  function ContinueFace() {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 14 }, children: [
      /* @__PURE__ */ (0, jsx)(ButtonGlyph, { button: "cross", size: 22 }),
      /* @__PURE__ */ (0, jsx)(Text, { style: mono(21, focused ? colors.canvas : colors.fg), children: t("notice.continue").toUpperCase() })
    ] });
  }
  function Disclaimer({ onDone }) {
    const done = useRef(false);
    const acknowledge = () => {
      if (done.current) return;
      done.current = true;
      onDone();
    };
    return /* @__PURE__ */ (0, jsx)(View, {
      style: { width: 1920, height: 1080, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
      children: /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: () => true, children: /* @__PURE__ */ (0, jsxs)(View, { style: { width: WIDTH, gap: 30, borderWidth: 2, borderColor: colors.fg, backgroundColor: colors.canvas2, padding: 56 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: mono(22, colors.fg), children: t("notice.title").toUpperCase() }),
        /* @__PURE__ */ (0, jsx)(View, { style: { height: 2, backgroundColor: colors.line } }),
        /* @__PURE__ */ (0, jsx)(Clause, { children: t("notice.termsText", { creator: CREATOR }) }),
        /* @__PURE__ */ (0, jsx)(Clause, { label: t("notice.disclaimer"), children: t("notice.disclaimerText") }),
        /* @__PURE__ */ (0, jsx)(Clause, { label: t("notice.strict"), children: t("notice.strictText") }),
        /* @__PURE__ */ (0, jsx)(View, { style: { height: 2, backgroundColor: colors.line } }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 36 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: { ...body, fontSize: 21, lineHeight: 30, color: colors.muted, flex: 1 }, children: t("notice.agreement") }),
          /* @__PURE__ */ (0, jsx)(View, {
            focusKey: CONTINUE_KEY,
            autoFocus: true,
            onPress: acknowledge,
            style: (_state) => [{ height: 60, justifyContent: "center", paddingHorizontal: 28, borderWidth: 2, borderColor: colors.fg }, _state.focused ? { backgroundColor: colors.fg } : { backgroundColor: colors.canvas }],
            children: /* @__PURE__ */ (0, jsx)(ContinueFace, {})
          })
        ] })
      ] }) })
    });
  }

export { CONTINUE_KEY, Disclaimer };
