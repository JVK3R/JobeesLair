// The Discover carousel's games (browse/Spotlight.jsx), picked once a launch. 0.5.3: top games, a new few at
// each launch. It took the games with a logo that Archive.org serves, and 7 of the 1,845 were: the same five
// every launch. The Featured lane under it leaves these out (browse/Lanes.jsx).

import { games } from '../data/catalog.js';
import { oneEach, ratingScore, sortGames } from '../state/catalog.js';

  var SLIDES = 5;
  // The pool: games with a banner and a logo, the most rated on the PlayStation Store first, 4.3 stars or more
  // (weighed by how many rated, state/catalog.js ratingScore). Each launch shows SLIDES of the first TOP_POOL.
  var TOP_POOL = 24;
  var MIN_SCORE = 4.3;
  // One of them is a recent hit: one of the RECENT_POOL most rated among the NEWEST latest releases.
  var NEWEST = 60;
  var RECENT_POOL = 8;
  // One game a studio, as its name varies: "CAPCOM Co., Ltd." and "Capcom" are one.
  var studioOf = (game) => (game.developer || game.publisher || game.id).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")[0];
  function pickFeatured(list = games, random = Math.random) {
    const shuffle = (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    };
    // 0.5.4: too few with a logo (none of the PS4's has one): any with a banner, its name written where the logo goes
    // (ui/GameLogo.jsx).
    const banners = list.filter((game) => game.art.hero);
    const logos = banners.filter((game) => game.art.logo);
    const showable = oneEach(logos.length >= SLIDES ? logos : banners);
    const liked = showable.filter((game) => ratingScore(game) >= MIN_SCORE);
    const ranked = (liked.length >= SLIDES ? liked : showable).sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0) || (b.recommendations ?? 0) - (a.recommendations ?? 0));
    const newest = new Set(sortGames(showable.filter((game) => game.releaseDate), "newest").slice(0, NEWEST));
    const picks = [];
    const studios = /* @__PURE__ */ new Set();
    const take = (game) => {
      if (picks.length >= SLIDES || picks.includes(game) || studios.has(studioOf(game))) return;
      picks.push(game);
      studios.add(studioOf(game));
    };
    shuffle(ranked.filter((game) => newest.has(game)).slice(0, RECENT_POOL)).slice(0, 1).forEach(take);
    shuffle(ranked.slice(0, TOP_POOL)).forEach(take);
    // Too few studios among them: the next most rated, whoever made them.
    for (const game of ranked) if (picks.length < SLIDES && !picks.includes(game)) picks.push(game);
    return shuffle(picks);
  }
  var featured = pickFeatured();

export { SLIDES, TOP_POOL, featured, pickFeatured, studioOf };
