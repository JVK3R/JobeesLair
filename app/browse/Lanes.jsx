// The library's swimlanes under the hero: Featured and Homebrew & Utilities as wide banner cards,
// Recently Added and Top Rated as portrait rows. Each "See all" opens the full library sorted to match.

import { jsx } from 'react/jsx-runtime';
import { memo } from 'react';
import { GameRail } from './GameRail.jsx';
import { games } from '../data/catalog.js';
import { useT } from '../i18n/index.js';
import { NO_FILTERS, fromArchive, sortGames } from '../state/catalog.js';
import { useNavActions } from '../state/nav.jsx';
import { useStoreActions } from '../state/store.jsx';
import { GameCard } from '../ui/GameCard.jsx';
import { WideCard } from '../ui/WideCard.jsx';

  var PORTRAIT = 152;
  // Famous games with banner art, the ones Archive.org serves (fastest) first.
  var FEATURED = [...games].filter((game) => game.art.hero).sort((a, b) => fromArchive(b) - fromArchive(a) || b.recommendations - a.recommendations).slice(0, 12);
  var RECENT = sortGames(games.filter((game) => game.releaseDate), "newest").slice(0, 15);
  var TOP = sortGames(games.filter((game) => game.metacritic != null), "rating").slice(0, 15);
  var HOMEBREW = games.filter((game) => game.contentKind === "homebrew");
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
  function Lane({ name, title, list, wide, seeAll }) {
    const { openGame } = useNavActions();
    if (!list.length) return null;
    const Card = wide ? WideCard : GameCard;
    return /* @__PURE__ */ (0, jsx)(GameRail, { title, onSeeAll: seeAll, seeAllKey: seeAll ? `lane:${name}:all` : void 0, children: list.map((game, index) => {
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
  var HomebrewLane = (0, memo)(function HomebrewLane2() {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsx)(Lane, { name: "homebrew", title: t2("browse.lane.homebrew"), list: HOMEBREW, wide: true });
  });
  var TopLane = (0, memo)(function TopLane2() {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsx)(Lane, { name: "top", title: t2("browse.lane.top"), list: TOP, seeAll: useSeeAll()("rating") });
  });

export { FIRST_FEATURED, FeaturedLane, HomebrewLane, RecentLane, TopLane };
