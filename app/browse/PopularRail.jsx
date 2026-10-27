// ../pub-game-store/native/browse/PopularRail.jsx
// reconstructed from the esbuild bundle in eboot.bin

import { jsx } from 'react/jsx-runtime';
import { memo } from 'react';
import { GameRail } from './GameRail.jsx';
import { featured } from './featured.js';
import { FEATURED, READY, TOP } from './Lanes.jsx';
import { games } from '../data/catalog.js';
import { useT } from '../i18n/index.js';
import { NO_FILTERS, oneEach, otherThan } from '../state/catalog.js';
import { useNavActions } from '../state/nav.jsx';
import { useStoreActions } from '../state/store.jsx';
import { GameCard } from '../ui/GameCard.jsx';

  var WIDTH4 = 152;
  // 0.5.3: the most played games on PlayStation (the most rated on its store), less those the rows above already show
  // (the carousel, Featured, Top rated, Ready). It took Most popular's order, which puts the games Archive.org serves
  // first, and opened with the same eight games as Featured and Ready right above it.
  var POPULAR = oneEach(otherThan(games.filter((game) => game.ratingCount > 0).sort((a, b) => b.ratingCount - a.ratingCount || b.recommendations - a.recommendations), [...featured, ...FEATURED, ...TOP, ...READY])).slice(0, 15);
  var PopularRail = (0, memo)(function PopularRail2() {
    const t2 = useT();
    const { openGame, focusLater } = useNavActions();
    const { setFilters, setQuery, setSort } = useStoreActions();
    const seeAll = () => {
      setFilters(NO_FILTERS);
      setQuery("");
      setSort("relevance");
      focusLater("catalog:sort");
    };
    return /* @__PURE__ */ (0, jsx)(GameRail, { title: t2("browse.popularNow"), onSeeAll: seeAll, seeAllKey: "popular:all", children: POPULAR.map((game, index) => {
      const key = `popular:${game.id}`;
      return /* @__PURE__ */ (0, jsx)(
        GameCard,
        {
          game,
          width: WIDTH4,
          detailed: true,
          focusKey: key,
          rowEnd: index === POPULAR.length - 1,
          onPress: () => openGame(game.id, key)
        },
        game.id
      );
    }) });
  });

export { POPULAR, PopularRail };
