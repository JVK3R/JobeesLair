// The Homebrew section (0.5.0): open-source apps and payloads for the PS5, apart from the game store. Its own
// header (what this side is, how many apps, what is installed and has an update), a spotlight of well-known
// projects, a row of filters (everything, what is installed, what has an update, each category, search) and,
// under it, rows for everything (updates, installed, popular, fresh releases, each category) or a grid for one
// filter. Selecting an app opens its page (HomebrewApp).
// Everything listed comes from tools/homebrew/build-index.mjs: each project's own repository and release.
// The engine registers a few hundred images at most, so the rows and grids are VirtualLists: only those near
// the screen are mounted, with their art.
// MODIFIED (0.5.0 Pre Release 2): the section's own color (palette.js) and header; each row fills the width,
// so it scrolls sideways (it grew as wide as its tiles before, and could not); a row ends on a "See all" tile;
// grids sort with Square (most popular, newest release, A–Z); Triangle goes back to the top.

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { memo, useEffect, useMemo, useState } from 'react';
import { GameRail } from '../browse/GameRail.jsx';
import { Keyboard } from '../search/Keyboard.jsx';
import { useT } from '../i18n/index.js';
import { searchApps } from '../state/homebrew-index.js';
import { homebrew, useHomebrew } from '../state/homebrew-store.js';
import { useNavActions } from '../state/nav.jsx';
import { Button2 } from '../ui/Button.jsx';
import { ButtonGlyph } from '../ui/ButtonHints.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { colors, radius } from '../ui/colors.js';
import { EASE_OUT } from '../ui/ease.js';
import { logical } from '../ui/scale.js';
import { HomebrewArt, gradientOf } from './HomebrewArt.jsx';
import { HomebrewTile, TILE, TILE_HEIGHT } from './HomebrewTile.jsx';
import { hb, hbTint } from './palette.js';
import { FocusScope, Image, ScrollView, Text, View, VirtualList, motion, useIsFocused } from '@ps5-react/core';

  var SPOT_HEIGHT = 400;
  // One row: its title (42 tall, 24 under it) over a row of tiles (GameRail).
  var RAIL_HEIGHT = 66 + TILE_HEIGHT, RAIL_GAP = 54;
  var SPOT_MS = 8e3;
  // Tiles in a row before its "See all" tile: a row's art is mounted whole, so it is kept short.
  var RAIL_LIMIT = 14;
  var COLUMNS = 7, COLUMN_GAP = 28, ROW_GAP = 36;
  var SORTS = ["popular", "newest", "name"];
  var rise = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { type: "tween", duration: 0.45, ease: EASE_OUT } };
  // The categories' names: the index's English one unless this language has its own.
  function useCategoryName() {
    const t2 = useT();
    return (category) => {
      const key = `homebrew.category.${category.id}`;
      const translated = t2(key);
      return translated === key ? category.name : translated;
    };
  }
  var byStars = (a, b) => b.stars - a.stars;
  var byNewest = (a, b) => (b.release.date || 0) - (a.release.date || 0);
  var byName = (a, b) => a.name.localeCompare(b.name);
  var SORTERS = { popular: byStars, newest: byNewest, name: byName };
  var formatCount = (n) => n >= 1e3 ? `${Math.round(n / 100) / 10}k` : String(n);
  // ---- The section's header ----------------------------------------------------------------------------
  function Stat({ text, tone }) {
    return jsx(View, { style: { height: 48, justifyContent: "center", borderRadius: radius.pill, backgroundColor: tone ? hb().soft : colors.surface2, paddingHorizontal: 20 }, children: jsx(Text, { style: { fontFamily: "Exo2", fontSize: 20, fontWeight: 600, lineHeight: 28, color: tone ?? colors.fg }, children: text }) });
  }
  function SectionHeader({ counts }) {
    const t2 = useT();
    const tone = hb();
    return jsxs(View, { scrollAnchor: true, style: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 24 }, children: [
      jsx(View, { style: { width: 72, height: 72, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, backgroundColor: tone.soft, borderWidth: 2, borderColor: tone.accent }, children: jsx(Icon, { name: "package", size: 26, color: tone.hi }) }),
      jsxs(View, { style: { flex: 1, gap: 2 }, children: [
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 40, fontWeight: 700, lineHeight: 48, letterSpacing: 3, color: colors.fg }, children: t2("homebrew.title").toUpperCase() }),
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 21, lineHeight: 30, color: colors.muted, numberOfLines: 1, ellipsizeMode: "tail" }, children: t2("homebrew.tagline") }),
        // The list itself comes from nexgen999's PS5 Repository List (tools/homebrew/build-index.mjs).
        jsxs(View, { style: { flexDirection: "row", alignItems: "center", gap: 8 }, children: [
          jsx(Icon, { name: "list", size: 14, color: tone.glow }),
          jsx(Text, { style: { fontFamily: "Exo2", fontSize: 19, lineHeight: 28, color: tone.glow }, children: t2("homebrew.listBy") })
        ] })
      ] }),
      jsxs(View, { style: { flexDirection: "row", gap: 12 }, children: [
        jsx(Stat, { text: t2("homebrew.appCount", { count: counts.all }) }),
        counts.installed ? jsx(Stat, { text: `${counts.installed} ${t2("homebrew.filter.installed")}` }) : null,
        counts.updates ? jsx(Stat, { text: `${counts.updates} ${t2("homebrew.filter.updates")}`, tone: tone.hi }) : null
      ] })
    ] });
  }
  // ---- Spotlight -------------------------------------------------------------------------------------
  function Spotlight({ apps, onOpen }) {
    const t2 = useT();
    const categoryName = useCategoryName();
    const index = homebrew().index;
    const tone = hb();
    const [at, setAt] = useState(0);
    useEffect(() => {
      if (apps.length < 2) return void 0;
      const id = setInterval(() => setAt((n) => (n + 1) % apps.length), SPOT_MS);
      return () => clearInterval(id);
    }, [apps.length]);
    const app = apps[at % Math.max(1, apps.length)];
    if (!app) return null;
    const category = index.categories.find((c) => c.id === app.category);
    return jsxs(View, { scrollAnchor: true, style: { height: SPOT_HEIGHT, borderRadius: radius.xl, overflow: "hidden", roundedClip: true, backgroundGradient: gradientOf(app.category), borderWidth: 1, borderColor: tone.soft }, children: [
      app.hero ? jsx(Image, { source: { uri: app.hero }, resizeMode: "cover", style: { position: "absolute", top: 0, right: 0, width: 1240, height: SPOT_HEIGHT } }, app.hero) : null,
      jsx(View, { style: { position: "absolute", top: 0, left: 0, bottom: 0, right: 0, backgroundGradient: { type: "linear", to: "right", stops: [{ color: colors.canvas2, offset: 0 }, { color: `${colors.canvas2}f2`, offset: 0.38 }, { color: `${colors.canvas2}66`, offset: 0.7 }, { color: "transparent", offset: 1 }] } } }),
      jsxs(motion.View, { ...rise, style: { position: "absolute", left: 60, top: 48, bottom: 48, width: 900, flexDirection: "row", gap: 42, alignItems: "center" }, children: [
        jsx(HomebrewArt, { app, size: 240, round: radius.xl }),
        jsxs(View, { style: { flex: 1, gap: 10 }, children: [
          jsx(Text, { style: { fontFamily: "Exo2", fontSize: 19, fontWeight: 700, letterSpacing: 2.4, lineHeight: 26, color: tone.glow }, children: `${t2("homebrew.spotlight").toUpperCase()} · ${(category ? categoryName(category) : "").toUpperCase()}` }),
          jsx(Text, { style: { fontFamily: "Exo2", fontSize: 54, fontWeight: 700, lineHeight: 64, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, children: app.name }),
          jsx(Text, { style: { fontFamily: "Exo2", fontSize: 22, lineHeight: 30, color: colors.muted, numberOfLines: 1 }, children: t2("homebrew.byline", { author: app.author, stars: formatCount(app.stars), version: app.release.tag }) }),
          app.description ? jsx(Text, { style: { fontFamily: "Exo2", fontSize: 22, lineHeight: 32, color: colors.fg, numberOfLines: 2, ellipsizeMode: "tail" }, children: app.description }) : null,
          jsxs(View, { style: { marginTop: 12, flexDirection: "row", gap: 18 }, children: [
            jsx(Button2, { focusKey: "hb:spot", variant: "primary", tint: hbTint(), label: t2("homebrew.open"), icon: "arrowRight", onPress: () => onOpen(app, "hb:spot") }),
            apps.length > 1 ? jsx(Button2, { focusKey: "hb:spot:next", variant: "outline", tint: hbTint(), size: "icon", icon: "chevronRight", onPress: () => setAt((n) => (n + 1) % apps.length) }) : null
          ] })
        ] })
      ] }, app.id),
      apps.length > 1 ? jsx(View, { style: { position: "absolute", right: 48, bottom: 36, flexDirection: "row", gap: 10 }, children: apps.map((item, i) => jsx(View, { style: { width: i === at % apps.length ? 36 : 12, height: 12, borderRadius: radius.pill, backgroundColor: i === at % apps.length ? tone.hi : "#ffffff55" } }, item.id)) }) : null
    ] });
  }
  // ---- Filters ---------------------------------------------------------------------------------------
  function FilterChip({ id, label, count, icon, selected, onPress }) {
    const tone = hb();
    return jsxs(View, { focusKey: `hb:chip:${id}`, onPress, style: { height: 60, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.pill, backgroundColor: selected ? tone.accent : colors.surface2, paddingHorizontal: 24 }, children: [
      jsx(FocusRing, { round: "full", color: tone.hi }),
      icon ? jsx(Icon, { name: icon, size: 14, color: selected ? tone.fg : colors.fg }) : null,
      jsx(Text, { style: { fontFamily: "Exo2", fontSize: 21, fontWeight: 600, lineHeight: 30, color: selected ? tone.fg : colors.fg }, children: label }),
      count != null ? jsx(Text, { style: { fontFamily: "Exo2", fontSize: 19, lineHeight: 30, color: selected ? tone.fg : colors.subtle }, children: String(count) }) : null
    ] });
  }
  function Filters({ filter, onFilter, onSearch, counts }) {
    const t2 = useT();
    const categoryName = useCategoryName();
    const { categories } = homebrew().index;
    return jsx(View, { scrollAnchor: true, style: { marginHorizontal: -12, marginVertical: -12 }, children: jsxs(ScrollView, { style: { flexDirection: "row", gap: 14, paddingHorizontal: 12, paddingVertical: 12 }, children: [
      jsx(FilterChip, { id: "search", icon: "search", label: t2("homebrew.search"), onPress: onSearch }),
      jsx(FilterChip, { id: "all", label: t2("homebrew.filter.all"), count: counts.all, selected: filter === "all", onPress: () => onFilter("all") }),
      counts.installed ? jsx(FilterChip, { id: "installed", icon: "check", label: t2("homebrew.filter.installed"), count: counts.installed, selected: filter === "installed", onPress: () => onFilter("installed") }) : null,
      counts.updates ? jsx(FilterChip, { id: "updates", icon: "restart", label: t2("homebrew.filter.updates"), count: counts.updates, selected: filter === "updates", onPress: () => onFilter("updates") }) : null,
      ...categories.map((category) => jsx(FilterChip, { id: category.id, label: categoryName(category), count: counts[category.id], selected: filter === category.id, onPress: () => onFilter(category.id) }, category.id))
    ] }) });
  }
  // ---- Rows and grids ----------------------------------------------------------------------------------
  // The end of a row that holds more than it shows: opens its grid.
  function SeeAllFace({ count }) {
    const t2 = useT();
    const focused = useIsFocused();
    const tone = hb();
    return jsxs(Fragment, { children: [
      jsxs(View, { style: { width: TILE, height: TILE, alignItems: "center", justifyContent: "center", gap: 14, borderRadius: radius.lg, backgroundColor: focused ? tone.soft : colors.surface, borderWidth: 2, borderColor: focused ? tone.hi : colors.line }, children: [
        jsx(FocusRing, { round: "lg", color: tone.hi }),
        jsx(View, { style: { width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: focused ? tone.accent : colors.surface3 }, children: jsx(Icon, { name: "arrowRight", size: 22, color: focused ? tone.fg : colors.fg }) }),
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 22, fontWeight: 600, lineHeight: 30, color: colors.fg }, children: t2("homebrew.seeAll") }),
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 19, lineHeight: 26, color: colors.subtle }, children: t2("homebrew.appCount", { count }) })
      ] })
    ] });
  }
  function SeeAllTile({ focusKey, count, onPress }) {
    return jsx(View, { focusKey, onPress, nextFocusRight: focusKey, style: { width: TILE, height: TILE_HEIGHT, marginRight: 12 }, children: jsx(SeeAllFace, { count }) });
  }
  function Rail({ name, title, apps, onOpen, onSeeAll }) {
    if (!apps.length) return null;
    const shown = apps.slice(0, RAIL_LIMIT);
    const more = onSeeAll && apps.length > shown.length;
    return jsx(GameRail, { title, accent: hb().hi, count: apps.length, onSeeAll, seeAllKey: onSeeAll ? `hb:${name}:all` : void 0, children: [
      ...shown.map((app, i) => {
        const key = `hb:${name}:${app.id}`;
        return jsx(HomebrewTile, { app, focusKey: key, rowEnd: !more && i === shown.length - 1, onPress: () => onOpen(app, key) }, app.id);
      }),
      more ? jsx(SeeAllTile, { focusKey: `hb:${name}:more`, count: apps.length, onPress: onSeeAll }, "more") : null
    ] });
  }
  function Grid({ apps, onOpen, columns = COLUMNS, name = "grid" }) {
    const t2 = useT();
    if (!apps.length) return jsx(Text, { style: { marginTop: 48, fontFamily: "Exo2", fontSize: 24, color: colors.muted }, children: t2("homebrew.empty") });
    // VirtualList lengths are logical px of the 1280-wide layout.
    return jsx(VirtualList, {
      style: { marginTop: 12 },
      data: apps,
      numColumns: columns,
      itemHeight: logical(TILE_HEIGHT),
      rowGap: logical(ROW_GAP),
      columnGap: logical(COLUMN_GAP),
      initialNumRows: 3,
      keyExtractor: (app) => app.id,
      renderItem: ({ item: app, index }) => {
        const key = `hb:${name}:${app.id}`;
        return jsx(HomebrewTile, { app, focusKey: key, rowEnd: index % columns === columns - 1 || index === apps.length - 1, onPress: () => onOpen(app, key) });
      }
    });
  }
  var Rails = memo(function Rails2({ lists, onOpen, onFilter }) {
    const t2 = useT();
    const categoryName = useCategoryName();
    const rails = [
      { name: "updates", title: t2("homebrew.rail.updates"), apps: lists.updates, all: "updates" },
      { name: "installed", title: t2("homebrew.rail.installed"), apps: lists.installed, all: "installed" },
      { name: "popular", title: t2("homebrew.rail.popular"), apps: lists.popular, all: "all:popular" },
      { name: "fresh", title: t2("homebrew.rail.fresh"), apps: lists.fresh, all: "all:newest" },
      ...lists.categories.map(({ category, apps }) => ({ name: category.id, title: categoryName(category), apps, all: category.id }))
    ].filter((rail) => rail.apps.length);
    return jsx(VirtualList, {
      data: rails,
      itemHeight: logical(RAIL_HEIGHT),
      rowGap: logical(RAIL_GAP),
      initialNumRows: 2,
      overscan: 1,
      keyExtractor: (rail) => rail.name,
      // flex: 1, so the row is as wide as the list and its tiles scroll inside it.
      renderItem: ({ item: rail }) => jsx(View, { style: { flex: 1, height: RAIL_HEIGHT }, children: jsx(Rail, { name: rail.name, title: rail.title, apps: rail.apps, onOpen, onSeeAll: rail.all && rail.apps.length > RAIL_LIMIT ? () => onFilter(rail.all) : void 0 }) })
    });
  });
  // The grid's heading: what it shows, how many, and how it is sorted (Square, or press the chip).
  function GridHeader({ title, count, sort, onSort }) {
    const t2 = useT();
    const tone = hb();
    return jsxs(View, { scrollAnchor: true, style: { flexDirection: "row", alignItems: "center", gap: 18 }, children: [
      jsx(View, { style: { width: 6, height: 34, borderRadius: radius.pill, backgroundColor: tone.hi } }),
      jsx(Text, { style: { fontFamily: "Exo2", fontSize: 34, fontWeight: 700, lineHeight: 44, color: colors.fg }, children: title }),
      jsx(Text, { style: { flex: 1, fontFamily: "Exo2", fontSize: 22, lineHeight: 44, color: colors.subtle }, children: t2("homebrew.appCount", { count }) }),
      jsxs(View, { focusKey: "hb:sort", onPress: onSort, style: { height: 52, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.pill, backgroundColor: colors.surface2, paddingHorizontal: 20 }, children: [
        jsx(FocusRing, { round: "full", color: tone.hi }),
        jsx(ButtonGlyph, { button: "square", size: 16 }),
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 20, fontWeight: 600, lineHeight: 28, color: colors.fg }, children: t2(`homebrew.sort.${sort}`) })
      ] })
    ] });
  }
  function Credits() {
    const t2 = useT();
    return jsxs(View, { style: { marginTop: 84, marginHorizontal: -48, borderTopWidth: 2, borderColor: colors.line, paddingHorizontal: 48, paddingVertical: 42, gap: 8 }, children: [
      jsx(Text, { style: { fontFamily: "Exo2", fontSize: 21, lineHeight: 30, color: colors.muted }, children: t2("homebrew.credits") }),
      jsx(Text, { style: { fontFamily: "Exo2", fontSize: 19, lineHeight: 28, color: colors.subtle }, children: t2("homebrew.creditsList") })
    ] });
  }
  // ---- Search ------------------------------------------------------------------------------------------
  function SearchPanel({ onClose, onOpen }) {
    const t2 = useT();
    const [query, setQuery] = useState("");
    const { apps } = homebrew().index;
    const tone = hb();
    const results = useMemo(() => query.trim() ? searchApps(apps, query) : [...apps].sort(byStars).slice(0, 24), [query, apps]);
    const onAction = (action) => {
      if (action === "l2") setQuery("");
      else return false;
      return true;
    };
    return jsx(FocusScope, { trap: true, autoFocus: true, onBack: () => {
      onClose();
      return true;
    }, onAction, children: jsxs(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, flexDirection: "row", gap: 60, backgroundColor: colors.canvas, paddingHorizontal: 48, paddingTop: 36 }, children: [
      jsxs(View, { style: { gap: 30 }, children: [
        jsxs(View, { style: { width: 564, height: 84, flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.md, borderWidth: 2, borderColor: tone.accent, backgroundColor: tone.soft, paddingHorizontal: 30 }, children: [
          jsx(Icon, { name: "package", size: 20, color: tone.hi }),
          jsx(Text, { style: { fontFamily: "Exo2", fontSize: 27, lineHeight: 36, color: query ? colors.fg : colors.subtle, writingDirection: "ltr" }, children: query || t2("homebrew.searchPlaceholder") })
        ] }),
        jsx(Keyboard, { onChange: setQuery, onSubmit: () => {} })
      ] }),
      jsxs(View, { style: { flex: 1 }, children: [
        jsx(Text, { style: { marginBottom: 6, fontFamily: "Exo2", fontSize: 30, fontWeight: 600, lineHeight: 42, color: colors.fg }, children: query.trim() ? t2("homebrew.results", { count: results.length }) : t2("homebrew.rail.popular") }),
        jsx(FocusScope, { focusKey: "search-results", children: jsx(ScrollView, { style: { flex: 1 }, children: jsx(Grid, { apps: results, onOpen, columns: 4, name: "search" }, query) }) })
      ] })
    ] }) });
  }
  // ---- The section -------------------------------------------------------------------------------------
  function HomebrewScreen({ onBack, onOpenApp }) {
    const t2 = useT();
    const store = useHomebrew();
    const categoryName = useCategoryName();
    const { focusLater } = useNavActions();
    const [filter, setFilter] = useState("all");
    const [sort, setSort] = useState("popular");
    const [searching, setSearching] = useState(false);
    const index = store.index;
    const lists = useMemo(() => {
      const apps = index.apps;
      const installed = store.installedApps();
      const updates = store.updates();
      return {
        apps,
        installed,
        updates,
        popular: [...apps].sort(byStars),
        fresh: [...apps].filter((app) => app.release.date).sort(byNewest),
        categories: index.categories.map((category) => ({ category, apps: apps.filter((app) => app.category === category.id).sort(byStars) })),
        spotlight: apps.filter((app) => app.hero && app.stars >= 50).sort(byStars).slice(0, 8)
      };
    }, [index, store.version]);
    const counts = useMemo(() => {
      const out = { all: lists.apps.length, installed: lists.installed.length, updates: lists.updates.length };
      for (const { category, apps } of lists.categories) out[category.id] = apps.length;
      return out;
    }, [lists]);
    const onOpen = (app, from) => onOpenApp(app.id, from);
    // "all:newest", "all:popular": every app in a grid, sorted so (the popular and fresh rows' "See all").
    const choose = (next) => {
      const [name, order] = next.split(":");
      setFilter(name === "all" && order ? "every" : name);
      if (order) setSort(order);
      focusLater(`hb:chip:${name}`);
    };
    const gridOf = (name) => name === "every" ? lists.apps : name === "installed" ? lists.installed : name === "updates" ? lists.updates : lists.categories.find((c) => c.category.id === name)?.apps ?? [];
    const shown = useMemo(() => filter === "all" ? null : [...gridOf(filter)].sort(SORTERS[sort]), [filter, sort, lists]);
    const gridTitle = filter === "every" ? t2("homebrew.filter.all") : filter === "installed" ? t2("homebrew.filter.installed") : filter === "updates" ? t2("homebrew.filter.updates") : (() => {
      const category = index.categories.find((c) => c.id === filter);
      return category ? categoryName(category) : "";
    })();
    // The sort pill keeps focus, so the newly sorted grid shows from its top.
    const cycleSort = () => {
      setSort((now) => SORTS[(SORTS.indexOf(now) + 1) % SORTS.length]);
      focusLater("hb:sort");
    };
    const onAction = (action) => {
      if (action === "square" && shown) cycleSort();
      else if (action === "triangle") focusLater(filter === "all" && lists.spotlight.length ? "hb:spot" : `hb:chip:${filter === "every" ? "all" : filter}`);
      else return false;
      return true;
    };
    const back = () => {
      if (searching) return false;
      if (filter !== "all") {
        choose("all");
        return true;
      }
      onBack();
      return true;
    };
    if (!index.apps.length) return jsx(View, { style: { flex: 1, alignItems: "center", justifyContent: "center" }, children: jsx(Text, { style: { fontFamily: "Exo2", fontSize: 26, color: colors.muted }, children: t2("homebrew.noIndex") }) });
    return jsx(FocusScope, { trap: true, autoFocus: true, onBack: back, onAction, children: jsxs(View, { style: { flex: 1 }, children: [
      jsxs(ScrollView, { style: { flex: 1, gap: 42, paddingHorizontal: 48, paddingBottom: 48 }, children: [
        jsx(SectionHeader, { counts }),
        filter === "all" ? jsx(Spotlight, { apps: lists.spotlight, onOpen }) : null,
        jsx(Filters, { filter: filter === "every" ? "all" : filter, onFilter: choose, onSearch: () => setSearching(true), counts }),
        shown ? jsxs(Fragment, { children: [
          jsx(GridHeader, { title: gridTitle, count: shown.length, sort, onSort: cycleSort }),
          jsx(Grid, { apps: shown, onOpen, name: filter }, `${filter}:${sort}`)
        ] }) : jsx(Rails, { lists, onOpen, onFilter: choose }),
        jsx(Credits, {})
      ] }),
      searching ? jsx(SearchPanel, { onOpen, onClose: () => {
        setSearching(false);
        focusLater("hb:chip:search");
      } }) : null
    ] }) });
  }

export { Grid as HomebrewGrid, HomebrewScreen };
