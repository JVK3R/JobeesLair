// Jobee'sLair startup notice: the terms of use in a few plain lines, shown on every launch right after the intro
// and before the store. It stays until the player presses ✕ on Continue (focused from the start). Back does
// nothing here. Nothing of the store is mounted underneath it, so the only way on is through the notice.
// MODIFIED (0.5.0 Pre Release 4): shorter and plainer. It says what it has to (free and open source, hosts
// nothing, download only what you own or may use, no warranty or liability, continuing is agreeing) in
// three sentences, without the shouted headings.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useRef } from 'react';
import { FocusScope, Text, View, useIsFocused } from '@ps5-react/core';
import { t } from '../i18n/core.js';
import { CREATOR } from '../version.js';
import { ButtonGlyph } from './ButtonHints.jsx';
import { JLMark } from './JLMark.jsx';
import { colors, radius } from './colors.js';

  var WIDTH = 960;
  var CONTINUE_KEY = "notice:continue";
  var RED = "#FF1E27";
  var body = { fontFamily: "Exo2", fontSize: 25, lineHeight: 36, color: colors.fg };
  function Point({ children }) {
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 20 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 4, height: 26, marginTop: 5, borderRadius: radius.pill, backgroundColor: RED } }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { ...body, flex: 1 }, children })
    ] });
  }
  // The button inverts with focus: white with dark text when selected, the reverse otherwise.
  function ContinueFace() {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 12 }, children: [
      /* @__PURE__ */ (0, jsx)(ButtonGlyph, { button: "cross", size: 20 }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 23, fontWeight: 600, lineHeight: 32, color: focused ? colors.canvas : colors.fg }, children: t("notice.continue") })
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
      children: /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: () => true, children: /* @__PURE__ */ (0, jsxs)(View, { style: { width: WIDTH, gap: 28, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas2, paddingHorizontal: 56, paddingVertical: 50 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 20 }, children: [
          /* @__PURE__ */ (0, jsx)(JLMark, { height: 34 }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 34, fontWeight: 700, lineHeight: 44, color: colors.fg }, children: t("notice.title") })
        ] }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 18 }, children: [
          /* @__PURE__ */ (0, jsx)(Point, { children: t("notice.termsText", { creator: CREATOR }) }),
          /* @__PURE__ */ (0, jsx)(Point, { children: t("notice.strictText") }),
          /* @__PURE__ */ (0, jsx)(Point, { children: t("notice.disclaimerText") })
        ] }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 36 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: { ...body, fontSize: 21, lineHeight: 30, color: colors.muted, flex: 1 }, children: t("notice.agreement") }),
          /* @__PURE__ */ (0, jsx)(View, {
            focusKey: CONTINUE_KEY,
            autoFocus: true,
            onPress: acknowledge,
            style: (_state) => [{ height: 60, justifyContent: "center", borderRadius: radius.md, paddingHorizontal: 30, borderWidth: 2, borderColor: colors.fg }, _state.focused ? { backgroundColor: colors.fg } : { backgroundColor: colors.canvas }],
            children: /* @__PURE__ */ (0, jsx)(ContinueFace, {})
          })
        ] })
      ] }) })
    });
  }

export { CONTINUE_KEY, Disclaimer };
