// ../pub-game-store/native/browse/PopularRail.jsx
// reconstructed from the esbuild bundle in eboot.bin

import { jsx } from 'react/jsx-runtime';
import { memo } from 'react';
import { GameRail } from './GameRail.jsx';
import { games } from '../data/catalog.js';
import { useT } from '../i18n/index.js';
import { NO_FILTERS, showcase, sortGames } from '../state/catalog.js';
import { useNavActions } from '../state/nav.jsx';
import { useStoreActions } from '../state/store.jsx';
import { GameCard } from '../ui/GameCard.jsx';

  var WIDTH4 = 152;
  var POPULAR = showcase(sortGames(games, "relevance"), 15);
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

export { PopularRail };
