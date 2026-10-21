// ../pub-game-store/native/browse/GameRail.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: lane titles in Exo 2 with an ice-blue accent bar and its halo (the renderer has no text glow).
// MODIFIED (0.5.0 Pre Release 2): `accent` colors the bar, the title link's focus and its chevron (Homebrew's own
// color); `count` shows how many the row holds next to its title.

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { colors, radius } from '../ui/colors.js';
import { ScrollView, Text, View, useIsFocused } from '@ps5-react/core';

  var TITLE = { fontFamily: "Exo2", fontSize: 31, fontWeight: 600, color: colors.fg, lineHeight: 42, letterSpacing: 0.6 };
  // A lit bar before each lane's name: a crisp ice-blue core over a wider translucent halo.
  // Built as it renders, in the theme's accent.
  var ACCENT = (tone) => /* @__PURE__ */ (0, jsxs)(View, { style: { width: 6, height: 30, justifyContent: "center", alignItems: "center" }, children: [
    /* @__PURE__ */ (0, jsx)(View, { style: { width: 6, height: 30, borderRadius: radius.pill, backgroundColor: tone ?? colors.accentHi } })
  ] });
  function TitleLink({ title, accent }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, { color: accent }),
      /* @__PURE__ */ (0, jsx)(Text, { style: TITLE, children: title }),
      /* @__PURE__ */ (0, jsx)(Icon, { name: "chevronRight", size: 16, color: focused ? accent ?? colors.fg : colors.muted })
    ] });
  }
  var Arrow = ({ name }) => /* @__PURE__ */ (0, jsx)(View, { style: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.xs, backgroundColor: colors.surface }, children: /* @__PURE__ */ (0, jsx)(Icon, { name, size: 16, color: colors.muted, fixed: true }) });
  var LTR = { direction: "ltr" };
  function GameRail({ title, onSeeAll, seeAllKey, accent, count, children }) {
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { marginBottom: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 16 }, children: [
          ACCENT(accent),
          onSeeAll ? /* @__PURE__ */ (0, jsx)(View, { onPress: onSeeAll, focusKey: seeAllKey, style: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.sm }, children: /* @__PURE__ */ (0, jsx)(TitleLink, { title, accent }) }) : /* @__PURE__ */ (0, jsx)(Text, { style: TITLE, children: title }),
          count != null ? /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 22, lineHeight: 42, color: colors.subtle }, children: String(count) }) : null
        ] }),
        /* @__PURE__ */ (0, jsxs)(View, { style: [{ flexDirection: "row", gap: 12 }, LTR], children: [
          /* @__PURE__ */ (0, jsx)(Arrow, { name: "chevronLeft" }),
          /* @__PURE__ */ (0, jsx)(Arrow, { name: "chevronRight" })
        ] })
      ] }),
      /* @__PURE__ */ (0, jsx)(View, { style: { marginHorizontal: -12, marginVertical: -24 }, children: /* @__PURE__ */ (0, jsx)(ScrollView, { style: [{ flexDirection: "row", gap: 36, paddingHorizontal: 12, paddingVertical: 24 }, LTR], children }) })
    ] });
  }

export { GameRail };
