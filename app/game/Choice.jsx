// ../pub-game-store/native/game/Choice.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { CdnAura, CdnSpark } from '../ui/CdnAura.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { colors, radius } from '../ui/colors.js';
import { Text, View } from '@ps5-react/core';

  function Choice({ focusKey, nextFocusDown, onPress, text, magic = null }) {
    if (magic) {
      return /* @__PURE__ */ (0, jsxs)(View, { focusKey, nextFocusDown, onPress: onPress ?? void 0, style: { position: "relative", height: 84, width: 408, flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.md, paddingHorizontal: 21 }, children: [
        /* @__PURE__ */ (0, jsx)(CdnAura, { radius: 8, width: 272 }),
        /* @__PURE__ */ (0, jsx)(FocusRing, {}),
        /* @__PURE__ */ (0, jsx)(CdnSpark, { size: 20 }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 23, fontWeight: 600, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, children: magic.name }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { width: 276, fontFamily: "Exo2", fontSize: 20, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, children: magic.detail })
        ] }),
        onPress ? /* @__PURE__ */ (0, jsx)(Icon, { name: "chevronRight", size: 16, color: colors.fg }) : null
      ] });
    }
    if (!onPress) {
      return /* @__PURE__ */ (0, jsx)(View, { style: { paddingVertical: 12 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { width: 408, fontFamily: "Exo2", fontSize: 21, color: colors.subtle, numberOfLines: 1, ellipsizeMode: "tail", lineHeight: 30 }, children: text }) });
    }
    return /* @__PURE__ */ (0, jsxs)(View, { focusKey, nextFocusDown, onPress, style: (_state2) => [{ position: "relative", flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 18, paddingVertical: 12 }, _state2.focused ? { backgroundColor: colors.surface2 } : null], children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(Text, { style: { width: 339, fontFamily: "Exo2", fontSize: 21, color: colors.muted, numberOfLines: 1, ellipsizeMode: "tail", lineHeight: 30 }, children: text }),
      /* @__PURE__ */ (0, jsx)(Icon, { name: "chevronRight", size: 14, color: colors.muted })
    ] });
  }
  var GREEN = "#4ade80";
  // 0.5.1: another source that runs on this console, offered on the page itself: its green tag ("13.60 Ready")
  // before what it is and where from. A press picks it as the download's source.
  function ReadyPick({ focusKey, nextFocusDown, onPress, tag, text }) {
    return /* @__PURE__ */ (0, jsxs)(View, { focusKey, nextFocusDown, onPress, style: (_state4) => [{ position: "relative", width: 408, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 18, paddingVertical: 10 }, _state4.focused ? { backgroundColor: colors.surface2 } : null], children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.xs, borderWidth: 1, borderColor: GREEN, paddingHorizontal: 8, paddingVertical: 1 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 17, fontWeight: 600, color: GREEN, lineHeight: 22 }, children: tag }) }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { flex: 1, fontFamily: "Exo2", fontSize: 20, color: colors.muted, numberOfLines: 1, ellipsizeMode: "tail", lineHeight: 28 }, children: text }),
      /* @__PURE__ */ (0, jsx)(Icon, { name: "chevronRight", size: 14, color: colors.muted })
    ] });
  }
  function TextAction({ focusKey, nextFocusDown, onPress, text }) {
    return /* @__PURE__ */ (0, jsxs)(View, { focusKey, nextFocusDown, onPress, style: (_state3) => [{ position: "relative", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 18, paddingVertical: 12 }, _state3.focused ? { backgroundColor: colors.surface2 } : null], children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.muted, lineHeight: 30 }, children: text })
    ] });
  }

export { Choice, ReadyPick, TextAction };
