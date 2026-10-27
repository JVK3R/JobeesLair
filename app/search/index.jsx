// The search page. MODIFIED (0.5.0 Pre Release 3): the store's own catalog grid with the keyboard as a sheet.
// Under the island, the query in a wide field, with Games and Homebrew tabs (one search for both sides, each in
// its own color). Under it a row of chips: "13.60 Ready" first (the games with a folder dump or disk image,
// state/formats.js), then each kind of download, favorites, the filter sheet (genres, hosts, sizes ...) and
// the sort. Then the results as the store's cover grid. The keyboard (DockKeyboard.jsx) pops up over the
// bottom of the grid when the page opens and whenever the field or Triangle asks for it, and closes when you
// search (R2) or press Circle, so the results get the whole screen.
// The page searches with the store's filters (state/store.jsx); it starts with none and hands back the ones the
// store had when it closes. Square favorites the focused game, L2 clears the query.
// MODIFIED (0.5.3): opened from the Homebrew section, it searches homebrew only (no Games tab, no game chips), and
// from the top menu while in that section it opens on Homebrew. Back from a result's page brings the page back
// as it was left: its side, its chips, the keyboard down. It came back on Games with the chips cleared and the
// keyboard up, so a homebrew search's results were gone.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { GameGrid } from '../browse/Catalog.jsx';
import { FilterDrawer } from '../browse/FilterDrawer.jsx';
import { SortSelect } from '../browse/SortSelect.jsx';
import { SPAN_MAX, fitBytes } from '../i18n/fit.js';
import { useLocale, useT } from '../i18n/index.js';
import { FIRST_KEY, KeyboardSheet } from './DockKeyboard.jsx';
import { forgetSearch, rememberSearch, useSearchHistory } from './history.js';
import { searchGames } from './match.js';
import { HomebrewGrid } from '../homebrew/HomebrewScreen.jsx';
import { hb } from '../homebrew/palette.js';
import { FACETS, NO_FILTERS, activeCount, filterGames, optionLabel, sortGames } from '../state/catalog.js';
import { searchApps } from '../state/homebrew-index.js';
import { homebrew } from '../state/homebrew-store.js';
import { useNavActions, useNavState } from '../state/nav.jsx';
import { useStore, useStoreActions } from '../state/store.jsx';
import { ButtonGlyph } from '../ui/ButtonHints.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { useFavoriteAction } from '../ui/GameCard.jsx';
import { Icon } from '../ui/Icon.jsx';
import { HINT, useHints } from '../ui/Legend.jsx';
import { colors, radius } from '../ui/colors.js';
import { FocusScope, ScrollView, Text, View, motion } from '@ps5-react/core';

  var SETTLE_MS = 150;
  // 0.5.3: the page as it was left for a result's page ({side, before, only}), for when Back brings it back (a page
  // is mounted anew each time it is shown). Null once the page is closed.
  var kept = null;
  // Homebrew results: nothing to favorite (Square was the games' Favorite).
  var APP_HINTS = [HINT.select, HINT.clear, HINT.back, HINT.sections];
  var READY_GREEN = "#4ade80";
  var FORMAT = FACETS.find((facet) => facet.key === "format");
  var blink = { duration: 0.5, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" };
  var text = (size, color, extra) => ({ fontFamily: "Exo2", fontSize: size, lineHeight: Math.round(size * 1.4), color, ...extra });
  // A query typed one letter at a time is searched once typing pauses; a pasted or cleared one at once.
  function useSettled(query) {
    const [settled, setSettled] = useState(query);
    const typed = Math.abs(query.length - settled.length) === 1;
    useEffect(() => {
      const id = setTimeout(() => setSettled(query), typed ? SETTLE_MS : 0);
      return () => clearTimeout(id);
    }, [query]);
    return typed ? settled : query;
  }
  // ---- The bar: the query field, which side is searched, and the filter sheet ---------------------------------
  function Field({ query, side, typing, onPress }) {
    const t2 = useT();
    const { rtl } = useLocale();
    const tone = side === "homebrew" ? hb().hi : colors.accentHi;
    return jsxs(View, { focusKey: "search:field", onPress, style: (state) => [{ position: "relative", flex: 1, height: 84, flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.lg, borderWidth: 2, borderColor: typing || state.focused ? tone : colors.line, backgroundColor: colors.surface, paddingHorizontal: 30 }], children: [
      jsx(FocusRing, { round: "lg", color: tone }),
      jsx(Icon, { name: side === "homebrew" ? "package" : "search", size: 22, color: tone }),
      query ? jsx(Text, { style: [text(30, colors.fg, { fontWeight: 600 }), { writingDirection: "ltr" }], children: query }) : null,
      typing ? jsx(motion.View, { style: [{ width: 3, height: 34, backgroundColor: tone }, rtl ? { marginRight: -12 } : { marginLeft: -12 }], initial: { opacity: 1 }, animate: { opacity: 0 }, transition: blink }) : null,
      query ? null : jsx(Text, { style: text(28, colors.subtle, { flex: 1 }), children: side === "homebrew" ? t2("homebrew.searchPlaceholder") : t2("search.placeholder") }),
      typing ? null : jsxs(View, { style: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 10 }, children: [
        jsx(ButtonGlyph, { button: "triangle", size: 16 }),
        jsx(Text, { style: text(20, colors.muted), children: t2("hints.type") })
      ] })
    ] });
  }
  function SideTab({ id, label, icon, tone, selected, onPress }) {
    return jsxs(View, { focusKey: `search:side:${id}`, onPress, style: (state) => [{ position: "relative", height: 64, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.pill, paddingHorizontal: 24, backgroundColor: selected ? tone : colors.surface2 }, state.focused && !selected ? { backgroundColor: colors.surface3 } : null], children: [
      jsx(FocusRing, { round: "full", color: tone }),
      jsx(Icon, { name: icon, size: 16, color: selected ? "#ffffff" : colors.fg }),
      jsx(Text, { style: text(21, selected ? "#ffffff" : colors.fg, { fontWeight: 600 }), children: label })
    ] });
  }
  // ---- Chips: 13.60 Ready, each kind of download, favorites, the filter sheet ---------------------------------
  function Chip({ id, label, icon, tone = colors.accent, selected, onPress, count }) {
    return jsxs(View, { focusKey: `search:chip:${id}`, onPress, style: (state) => [{ position: "relative", height: 52, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.pill, paddingHorizontal: 20, backgroundColor: selected ? tone : colors.surface2 }, state.focused && !selected ? { backgroundColor: colors.surface3 } : null], children: [
      jsx(FocusRing, { round: "full", color: tone }),
      icon ? jsx(Icon, { name: icon, size: 14, color: selected ? "#0b0f14" : colors.fg }) : null,
      jsx(Text, { style: text(20, selected ? "#0b0f14" : colors.fg, { fontWeight: 600 }), children: label }),
      count ? jsx(View, { style: { height: 28, minWidth: 28, alignItems: "center", justifyContent: "center", borderRadius: radius.xs, backgroundColor: colors.accent, paddingHorizontal: 8 }, children: jsx(Text, { style: text(17, "#ffffff", { fontWeight: 700 }), children: String(count) }) }) : null
    ] });
  }
  function GameChips({ filters, onFormat, onWishlist, onFilters }) {
    const t2 = useT();
    const others = activeCount({ ...filters, format: [], wishlist: false });
    return jsxs(View, { style: { zIndex: 10, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }, children: [
      ...FORMAT.options.map((option) => jsx(Chip, {
        id: option.value,
        label: optionLabel(option),
        icon: option.value === "ready" ? "check" : void 0,
        tone: option.value === "ready" ? READY_GREEN : colors.accentHi,
        selected: filters.format.includes(option.value),
        onPress: () => onFormat(option.value)
      }, option.value)),
      jsx(Chip, { id: "favorites", icon: "heart", label: t2("filters.favorites"), tone: colors.accentHi, selected: filters.wishlist, onPress: onWishlist }, "favorites"),
      jsx(Chip, { id: "filters", icon: "list", label: t2("filters.title"), tone: colors.accentHi, selected: false, count: others, onPress: onFilters }, "filters"),
      jsx(SortSelect, { focusKey: "search:sort" })
    ] });
  }
  // ---- What the results area shows --------------------------------------------------------------------------
  function Recent({ onSearch }) {
    const recent = useSearchHistory();
    const { focusLater } = useNavActions();
    if (!recent.length) return null;
    return jsx(View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, children: recent.map((term) => jsx(FocusScope, { onAction: (action) => {
      if (action !== "square") return false;
      forgetSearch(term);
      focusLater("search:field");
      return true;
    }, children: jsxs(View, { focusKey: `search:recent:${term}`, onPress: () => onSearch(term), style: (state) => [{ position: "relative", height: 48, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.pill, paddingHorizontal: 18, backgroundColor: state.focused ? colors.surface3 : colors.surface }], children: [
      jsx(FocusRing, { round: "full" }),
      jsx(Icon, { name: "restart", size: 14, color: colors.muted }),
      jsx(Text, { style: text(19, colors.fg), children: term })
    ] }) }, term)) });
  }
  function Heading({ title, count, note }) {
    return jsxs(View, { style: { gap: 6 }, children: [
      jsxs(Text, { style: text(30, colors.fg, { fontWeight: 600, letterSpacing: 0.4 }), children: [
        fitBytes(title, SPAN_MAX),
        jsx(Text, { style: { fontWeight: 400, color: colors.subtle }, children: fitBytes(`  ${count}`, SPAN_MAX) })
      ] }),
      note ? jsxs(View, { style: { flexDirection: "row", alignItems: "center", gap: 10 }, children: [
        jsx(Icon, { name: "check", size: 15, color: READY_GREEN }),
        jsx(Text, { style: text(20, colors.muted), children: note })
      ] }) : null
    ] });
  }
  function Empty({ text: message }) {
    return jsxs(View, { style: { alignItems: "center", gap: 14, paddingTop: 72 }, children: [
      jsx(Icon, { name: "searchX", size: 30, color: colors.subtle }),
      jsx(Text, { style: text(26, colors.fg, { fontWeight: 600, textAlign: "center" }), children: message })
    ] });
  }
  var GameResults = memo(function GameResults2({ query, filters, wishlist, sort }) {
    const t2 = useT();
    const trimmed = query.trim();
    const list = useMemo(() => {
      const passing = filterGames({ filters, query: "", wishlist });
      if (!trimmed) return sortGames(passing, sort);
      const passed = new Set(passing);
      return sortGames(searchGames(trimmed).filter((game) => passed.has(game)), sort);
    }, [trimmed, filters, wishlist, sort]);
    const title = trimmed ? t2("search.resultsFor", { query: trimmed }) : filters.wishlist ? t2("catalog.favorites") : t2("catalog.library");
    const signature = JSON.stringify([trimmed, filters, sort]);
    return jsxs(View, { scrollAnchor: true, style: { gap: 4 }, children: [
      jsx(Heading, { title, count: t2("catalog.gameCount", { count: list.length }), note: filters.format.includes("ready") ? t2("search.readyNote") : "" }),
      list.length ? jsx(GameGrid, { games: list, signature, enter: false }, signature) : jsx(Empty, { text: trimmed ? t2("search.noMatch", { query: trimmed }) : t2("search.noneFiltered") })
    ] });
  });
  var AppResults = memo(function AppResults2({ query }) {
    const t2 = useT();
    const { push } = useNavActions();
    const trimmed = query.trim();
    const list = useMemo(() => {
      const { apps, categories } = homebrew().index;
      // A category's name in the player's language as well as the index's English one.
      const categoryLabel = (app) => {
        const key = `homebrew.category.${app.category}`;
        const translated = t2(key);
        return translated === key ? categories.find((category) => category.id === app.category)?.name ?? "" : translated;
      };
      return trimmed ? searchApps(apps, trimmed, categoryLabel) : [...apps].sort((a, b) => b.stars - a.stars);
    }, [trimmed, t2]);
    const title = trimmed ? t2("search.resultsFor", { query: trimmed }) : t2("homebrew.rail.popular");
    return jsxs(View, { scrollAnchor: true, style: { gap: 4 }, children: [
      jsx(Heading, { title, count: t2("homebrew.results", { count: list.length }) }),
      jsx(HomebrewGrid, { apps: list, columns: 7, name: "search", onOpen: (app, key) => {
        rememberSearch(trimmed);
        push({ name: "homebrew-app", id: app.id }, key);
      } }, trimmed)
    ] });
  });
  // ---- The page --------------------------------------------------------------------------------------------------
  function SearchScreen({ onBack }) {
    const t2 = useT();
    const store = useStore();
    const { setQuery, setFilters, toggleFilter } = useStoreActions();
    const { focusLater } = useNavActions();
    const filters = store.filters ?? NO_FILTERS;
    const query = store.query ?? "";
    const settled = useSettled(query);
    const { top } = useNavState();
    // Back from a result's page (its entry has the result's key in `from`): as it was left. Else a new search, on the
    // side the opener asked for (`side`), homebrew only when `only`.
    const [returning] = useState(() => Boolean(top.from) && kept !== null);
    const [view] = useState(() => returning ? kept : kept = { side: top.side === "homebrew" ? "homebrew" : "games", before: store.filters ?? NO_FILTERS, only: top.only === "homebrew" });
    const [side, setSide] = useState(view.only ? "homebrew" : view.side);
    const [typing, setTyping] = useState(!returning);
    const [drawer, setDrawer] = useState(false);
    const onFavorite = useFavoriteAction();
    useHints(side === "homebrew" && !typing ? APP_HINTS : null);
    // The store's filters as they were (`view.before`): searching starts from none, and closing hands these back.
    // Going back hands them back (below, in `leave`), not when the page unmounts: a header pill (Favorites, Top, New)
    // closes this page too, having just set filters of its own that must stay. Back from a result keeps the page's own.
    useEffect(() => {
      if (!returning) setFilters(NO_FILTERS);
    }, []);
    const current = useRef(store.query);
    current.current = store.query;
    const [on] = useState(() => ({
      type: () => {
        setTyping(true);
        focusLater(FIRST_KEY);
      },
      submit: () => {
        rememberSearch(current.current);
        setTyping(false);
        focusLater("search:results");
      },
      close: () => {
        setTyping(false);
        focusLater("search:field");
      },
      search: (term) => {
        setQuery(term);
        focusLater("search:results");
      }
    }));
    const leave = () => {
      kept = null;
      setQuery("");
      setFilters(view.before);
      onBack();
      return true;
    };
    const onAction = (action) => {
      if (action === "l2") setQuery("");
      else if (action === "r2") on.submit();
      else if (action === "triangle" && !typing) on.type();
      else if ((action === "square" || action === "options") && side === "games") return onFavorite(action);
      else return false;
      return true;
    };
    const chooseSide = (next) => {
      setSide(next);
      view.side = next;
      focusLater(`search:side:${next}`);
    };
    const games = side === "games";
    return jsxs(View, { style: { flex: 1, backgroundColor: colors.canvas }, children: [
      jsx(FocusScope, { autoFocus: !typing, onBack: leave, onAction, inert: typing, children: jsxs(ScrollView, { style: { flex: 1, gap: 26, paddingHorizontal: 48, paddingTop: 24, paddingBottom: typing ? 300 : 72 }, children: [
        jsxs(View, { scrollAnchor: true, style: { gap: 20 }, children: [
          jsxs(View, { style: { height: 84, flexDirection: "row", alignItems: "center", gap: 16 }, children: [
            jsx(Field, { query, side, typing, onPress: on.type }),
            // Homebrew only (opened from its section): the field says so, and there is no other side to pick.
            view.only ? null : jsx(SideTab, { id: "games", label: t2("search.games"), icon: "disc", tone: colors.accent, selected: games, onPress: () => chooseSide("games") }),
            view.only ? null : jsx(SideTab, { id: "homebrew", label: t2("nav.homebrew"), icon: "package", tone: hb().accent, selected: !games, onPress: () => chooseSide("homebrew") })
          ] }),
          games ? jsx(GameChips, {
            filters: filters,
            onFormat: (value) => toggleFilter("format", value),
            onWishlist: () => setFilters({ ...filters, wishlist: !filters.wishlist }),
            onFilters: () => {
              setDrawer(true);
            }
          }) : null,
          query ? null : jsx(Recent, { onSearch: on.search })
        ] }),
        jsx(FocusScope, { focusKey: "search:results", children: games ? jsx(GameResults, { query: settled, filters, wishlist: store.wishlist ?? [], sort: store.sort ?? "relevance" }) : jsx(AppResults, { query: settled }) })
      ] }) }),
      typing ? jsx(KeyboardSheet, { onChange: setQuery, onSubmit: on.submit, onClose: on.close }) : null,
      jsx(FilterDrawer, { open: drawer, onClose: () => {
        setDrawer(false);
        focusLater("search:chip:filters");
      } })
    ] });
  }

export { SearchScreen };
