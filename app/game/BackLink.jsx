// ../pub-game-store/native/game/BackLink.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED (0.5.3): where Back goes, by name. A game opened from the Library said "game.back.files" (there was no
// such message), and one opened from the store said "Library" from any of its sections.

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useT } from '../i18n/index.js';
import { getGame } from '../state/catalog.js';
import { useNavState } from '../state/nav.jsx';
import { useStoreState } from '../state/store.jsx';
import { sectionOf } from '../ui/sections.js';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { colors, radius } from '../ui/colors.js';
import { Text, View, useIsFocused } from '@ps5-react/core';

  var SECTION_NAMES = { discover: "nav.discover", catalog: "nav.browse", top: "nav.top", new: "nav.new", favorites: "filters.favorites" };
  function useOrigin() {
    const t2 = useT();
    const store = useStoreState();
    const { stack } = useNavState();
    const previous = stack[stack.length - 2];
    if (previous.name === "game") return getGame(previous.id)?.title ?? t2("hints.back");
    // The store: the section it showed (Discover, Browse, Top rated...).
    if (previous.name === "browse") return t2(SECTION_NAMES[sectionOf(store, store.query ?? "")] ?? "nav.discover");
    // The Files section is the Library (its island button's name).
    if (previous.name === "files") return t2("game.back.browse");
    const key = `game.back.${previous.name}`;
    const said = t2(key);
    return said === key ? t2("hints.back") : said;
  }
  function Label2() {
    const focused = useIsFocused();
    const origin = useOrigin();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(Icon, { name: "chevronLeft", size: 16, color: focused ? colors.fg : colors.muted }),
      /* @__PURE__ */ (0, jsx)(Text, { focused, style: [{ maxWidth: 720, fontFamily: "Exo2", fontSize: 21, color: colors.muted, numberOfLines: 1, ellipsizeMode: "tail", lineHeight: 30 }, focused ? { color: colors.fg } : null], children: origin })
    ] });
  }
  function BackLink({ onPress }) {
    return /* @__PURE__ */ (0, jsxs)(View, { onPress, nextFocusUp: "nav:search", style: { position: "relative", alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.sm }, children: [
      /* @__PURE__ */ (0, jsx)(Label2, {}),
      /* @__PURE__ */ (0, jsx)(FocusRing, {})
    ] });
  }

export { BackLink };
