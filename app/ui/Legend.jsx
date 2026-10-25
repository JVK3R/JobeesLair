// ../pub-game-store/native/ui/Legend.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED (0.5.0 Pre Release 2): the bar's left end says which side of the store this is, the game store or
// Homebrew, each in its own color; and the hints for sorting the Homebrew section's grids.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { memo, useEffect, useState } from 'react';
import { ButtonHints } from './ButtonHints.jsx';
import { Text, View } from '@ps5-react/core';
import { useT } from '../i18n/index.js';
import { formatNumber2 } from '../i18n/core.js';
import { useOnline } from '../state/online.js';
import { hb, isHomebrewSection } from '../homebrew/palette.js';
import { colors, radius } from './colors.js';
import { Icon } from './Icon.jsx';

  var HINT = {
    select: { button: "cross", label: "hints.select" },
    back: { button: "circle", label: "hints.back" },
    top: { button: "circle", label: "hints.top" },
    menu: { button: "circle", label: "hints.menu" },
    preview: { button: "options", label: "hints.preview" },
    clear: { button: "l2", label: "hints.clear" },
    favorite: { button: "square", label: "hints.favorite" },
    sections: { button: "l1r1", label: "hints.sections" },
    close: { button: "circle", label: "hints.close" },
    sort: { button: "square", label: "hints.sort" },
    toTop: { button: "triangle", label: "hints.top" }
  };
  var HINTS = {
    browse: [HINT.select, HINT.preview, HINT.menu, HINT.sections],
    game: [HINT.select, HINT.back, HINT.favorite, HINT.sections],
    search: [HINT.select, HINT.favorite, HINT.clear, HINT.back, HINT.sections],
    homebrew: [HINT.select, HINT.sort, HINT.toTop, HINT.menu, HINT.sections],
    "homebrew-app": [HINT.select, HINT.back, HINT.sections],
    settings: [HINT.select, HINT.back, HINT.sections]
  };
  var registered2 = [];
  var listeners3 = /* @__PURE__ */ new Set();
  var notify = () => listeners3.forEach((listener) => listener(registered2.at(-1)?.hints ?? null));
  function useHints(hints) {
    (0, useEffect)(() => {
      if (!hints) return void 0;
      const entry2 = { hints };
      registered2.push(entry2);
      notify();
      return () => {
        registered2.splice(registered2.indexOf(entry2), 1);
        notify();
      };
    }, [hints]);
  }
  var Hints = (0, memo)(ButtonHints);
  // Search covers both sides (its bar shows which one), so it is marked as itself, like Settings.
  var SIDES = { browse: "store", game: "store", search: "search", homebrew: "homebrew", "homebrew-app": "homebrew", settings: "settings" };
  var NEUTRAL = { search: { icon: "search", label: "nav.search" }, settings: { icon: "settings", label: "settings.title" } };
  // Where this is: a lit dot, the side's icon and its name.
  var Where = (0, memo)(function Where2({ screen: screen2 }) {
    const t2 = useT();
    if (!SIDES[screen2]) return null;
    const home = isHomebrewSection(screen2);
    const neutral = NEUTRAL[SIDES[screen2]];
    const tone = home ? hb().hi : neutral ? colors.muted : colors.accentHi;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { position: "absolute", left: 48, top: 0, height: 60, flexDirection: "row", alignItems: "center", gap: 12 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: tone } }),
      /* @__PURE__ */ (0, jsx)(Icon, { name: home ? "package" : neutral ? neutral.icon : "disc", size: 15, color: tone }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 19, fontWeight: 700, letterSpacing: 2.2, lineHeight: 30, color: tone }, children: (home ? t2("nav.homebrew") : neutral ? t2(neutral.label) : t2("legend.store")).toUpperCase() }),
      jsx(OnlineCount, {})
    ] });
  });
  // 0.5.2: how many are on Jobee'sLair right now (state/online.js), once the server has said.
  function OnlineCount() {
    const t2 = useT();
    const { online: count } = useOnline();
    if (!count) return null;
    return jsx(Text, { style: { fontFamily: "Exo2", fontSize: 18, lineHeight: 30, color: colors.subtle, marginLeft: 6 }, children: `·  ${t2("online.count", { count: formatNumber2(count) })}` });
  }
  function Legend({ screen: screen2 }) {
    const [hints, setHints] = (0, useState)(() => registered2.at(-1)?.hints ?? null);
    (0, useEffect)(() => {
      listeners3.add(setHints);
      setHints(registered2.at(-1)?.hints ?? null);
      return () => listeners3.delete(setHints);
    }, []);
    if (!HINTS[screen2]) return null;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { position: "absolute", left: 0, right: 0, bottom: 0 }, children: [
      /* @__PURE__ */ (0, jsx)(Where, { screen: screen2 }),
      /* @__PURE__ */ (0, jsx)(Hints, { hints: hints ?? HINTS[screen2] })
    ] });
  }

export { HINT, Legend, useHints };
