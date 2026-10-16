// ../pub-game-store/native/game/DownloadProblem.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useT } from '../i18n/index.js';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { colors, radius } from '../ui/colors.js';
import { Text, View, useIsFocused } from '@ps5-react/core';

  function ProblemNote({ title, action }) {
    return /* @__PURE__ */ (0, jsxs)(View, { style: { width: 408, flexDirection: "row", gap: 15 }, children: [
      /* @__PURE__ */ (0, jsx)(Icon, { name: "alert", size: 16, color: colors.fg }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, fontWeight: 600, color: colors.fg, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, children: title }),
        action ? /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.muted, numberOfLines: 3, ellipsizeMode: "tail", lineHeight: 30 }, children: action }) : null
      ] })
    ] });
  }
  function TriggerFace() {
    const t2 = useT();
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(Text, { style: focused ? { fontFamily: "Exo2", fontSize: 21, color: colors.fg, lineHeight: 30 } : { fontFamily: "Exo2", fontSize: 21, color: colors.muted, lineHeight: 30 }, children: t2("download.moreOptions") }),
      /* @__PURE__ */ (0, jsx)(Icon, { name: "chevronRight", size: 14, color: focused ? colors.fg : colors.muted })
    ] });
  }
  function MoreOptions({ focusKey, nextFocusDown, onPress }) {
    return /* @__PURE__ */ (0, jsx)(View, { focusKey, nextFocusDown, onPress, style: (_state) => [{ position: "relative", marginHorizontal: -18, height: 54, width: 444, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, paddingHorizontal: 18 }, _state.focused ? { backgroundColor: colors.surface2 } : null], children: /* @__PURE__ */ (0, jsx)(TriggerFace, {}) });
  }

export { MoreOptions, ProblemNote };
