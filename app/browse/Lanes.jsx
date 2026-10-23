// The library's swimlanes under the hero: Featured as wide banner cards, Recently Added and Top Rated as
// portrait rows. Each "See all" opens the full library sorted to match. Homebrew has its own section since
// 0.5.0: in its old place a banner, with the section's most-starred apps, opens it.
// 0.5.0 Pre Release 3: "Ready for 13.60", the games with a folder dump or disk image (state/formats.js); its
// See all opens the library with the Format filter on 13.60 Ready.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { memo } from 'react';
import { GameRail } from './GameRail.jsx';
import { games } from '../data/catalog.js';
import { useT } from '../i18n/index.js';
import { NO_FILTERS, fromArchive, oneEach, ratingScore, readyHere, readyLabel, sortGames, topRated } from '../state/catalog.js';
import { isoDate } from '../state/clock.js';
import { useNavActions } from '../state/nav.jsx';
import { useStoreActions } from '../state/store.jsx';
import { GameCard } from '../ui/GameCard.jsx';
import { WideCard } from '../ui/WideCard.jsx';
import { HomebrewArt } from '../homebrew/HomebrewArt.jsx';
import { hb } from '../homebrew/palette.js';
import { homebrew } from '../state/homebrew-store.js';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { colors, radius } from '../ui/colors.js';
import { Text, View, useIsFocused } from '@ps5-react/core';
import { useEffect, useState } from 'react';

  var PORTRAIT = 152;
  // Famous games with banner art, the ones Archive.org serves (fastest) first.
  // 0.5.1: each row shows a game once (state/catalog.js oneEach), not its PS4 and PS5 editions side by side.
  var FEATURED = oneEach([...games].filter((game) => game.art.hero).sort((a, b) => fromArchive(b) - fromArchive(a) || b.recommendations - a.recommendations)).slice(0, 12);
  var RECENT = oneEach(sortGames(games.filter((game) => game.releaseDate), "newest")).slice(0, 15);
  // 0.5.1: by PlayStation Store rating, weighed by how many rated (state/catalog.js topRated), over every game.
  var TOP = topRated(games).slice(0, 20);
  // 0.5.1: the games the live catalog added in the last seven days (their addedAt, state/feed-format.js), the
  // newest first, then the best rated. Nothing new: no row.
  var WEEK_AGO = isoDate(Date.now() - 7 * 864e5);
  var NEW_ALL = oneEach(games.filter((game) => game.addedAt && game.addedAt >= WEEK_AGO).sort((a, b) => b.addedAt.localeCompare(a.addedAt) || ratingScore(b) - ratingScore(a)));
  var NEW_WEEK = NEW_ALL.slice(0, 20);
  var READY_ALL = games.filter(readyHere);
  var READY = oneEach(sortGames(READY_ALL, "relevance")).slice(0, 15);
  var READY_GREEN = "#4ade80";
  var FIRST_FEATURED = FEATURED.length ? `lane:featured:${FEATURED[0].id}` : void 0;
  function useSeeAll() {
    const { focusLater } = useNavActions();
    const { setFilters, setQuery, setSort } = useStoreActions();
    return (sort) => () => {
      setFilters(NO_FILTERS);
      setQuery("");
      setSort(sort);
      focusLater("catalog:sort");
    };
  }
  function Lane({ name, title, list, wide, seeAll, accent, count }) {
    const { openGame } = useNavActions();
    if (!list.length) return null;
    const Card = wide ? WideCard : GameCard;
    return /* @__PURE__ */ (0, jsx)(GameRail, { title, accent, count, onSeeAll: seeAll, seeAllKey: seeAll ? `lane:${name}:all` : void 0, children: list.map((game, index) => {
      const key = `lane:${name}:${game.id}`;
      return /* @__PURE__ */ (0, jsx)(
        Card,
        {
          game,
          ...wide ? {} : { width: PORTRAIT, detailed: true },
          focusKey: key,
          rowEnd: index === list.length - 1,
          onPress: () => openGame(game.id, key)
        },
        game.id
      );
    }) });
  }
  var FeaturedLane = (0, memo)(function FeaturedLane2() {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsx)(Lane, { name: "featured", title: t2("browse.lane.featured"), list: FEATURED, wide: true, seeAll: useSeeAll()("relevance") });
  });
  var RecentLane = (0, memo)(function RecentLane2() {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsx)(Lane, { name: "recent", title: t2("browse.lane.recent"), list: RECENT, seeAll: useSeeAll()("newest") });
  });
  // The banner's face: the section's name and size beside a row of its most-starred apps' art, in the Homebrew
  // section's own color (0.5.0 Pre Release 2), the door to the other side of the store.
  function PromoFace({ apps, count }) {
    const t2 = useT();
    const focused = useIsFocused();
    return jsxs(View, { style: { height: 220, flexDirection: "row", alignItems: "center", gap: 48, borderRadius: radius.xl, overflow: "hidden", roundedClip: true, paddingHorizontal: 54, backgroundGradient: { type: "linear", to: "right", stops: [{ color: hb().deep, offset: 0 }, { color: colors.surface2, offset: 0.55 }, { color: colors.surface, offset: 1 }] } }, children: [
      jsx(FocusRing, { round: "lg", color: hb().hi }),
      jsxs(View, { style: { width: 640, gap: 8 }, children: [
        jsxs(View, { style: { flexDirection: "row", alignItems: "center", gap: 14 }, children: [
          jsx(Icon, { name: "package", size: 22, color: hb().hi }),
          jsx(Text, { style: { fontFamily: "Exo2", fontSize: 40, fontWeight: 700, lineHeight: 50, color: colors.fg }, children: t2("homebrew.promo.title") }),
          jsx(Icon, { name: "chevronRight", size: 18, color: focused ? hb().hi : colors.muted })
        ] }),
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 22, lineHeight: 32, color: colors.muted }, children: t2("homebrew.promo.detail", { count }) })
      ] }),
      jsx(View, { style: { flex: 1, flexDirection: "row", gap: 24, justifyContent: "flex-end" }, children: apps.map((app) => jsx(HomebrewArt, { app, size: 132, round: radius.lg }, app.id)) })
    ] });
  }
  // Read a moment after the store is up, so the store's first screen never waits on the section's index.
  var HomebrewLane = (0, memo)(function HomebrewLane2() {
    const { push } = useNavActions();
    const [shown, setShown] = useState(null);
    useEffect(() => {
      const id = setTimeout(() => {
        const { apps } = homebrew().index;
        setShown({ count: apps.length, apps: [...apps].filter((app) => app.icon && !app.iconFromAvatar).sort((a, b) => b.stars - a.stars).slice(0, 7) });
      }, 2500);
      return () => clearTimeout(id);
    }, []);
    if (!shown || !shown.count) return null;
    return jsx(View, { scrollAnchor: true, focusKey: "lane:homebrew", onPress: () => push({ name: "homebrew" }, "lane:homebrew"), children: jsx(PromoFace, { apps: shown.apps, count: shown.count }) });
  });
  var ReadyLane = (0, memo)(function ReadyLane2() {
    const t2 = useT();
    const { focusLater } = useNavActions();
    const { setFilters, setQuery, setSort } = useStoreActions();
    const seeAll = () => {
      setFilters({ ...NO_FILTERS, format: ["ready"] });
      setQuery("");
      setSort("relevance");
      focusLater("catalog:filters");
    };
    return /* @__PURE__ */ (0, jsx)(Lane, { name: "ready", title: readyLabel(t2("browse.lane.ready")), list: READY, accent: READY_GREEN, count: READY_ALL.length, seeAll });
  });
  var NewLane = (0, memo)(function NewLane2() {
    const t2 = useT();
    return jsx(Lane, { name: "new", title: t2("browse.lane.newWeek"), list: NEW_WEEK, count: NEW_ALL.length });
  });
  var TopLane = (0, memo)(function TopLane2() {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsx)(Lane, { name: "top", title: t2("browse.lane.top"), list: TOP, seeAll: useSeeAll()("rating") });
  });

export { FIRST_FEATURED, FeaturedLane, HomebrewLane, NewLane, ReadyLane, RecentLane, TopLane };
