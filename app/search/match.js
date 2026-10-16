// ../pub-game-store/native/search/match.js
// reconstructed from the esbuild bundle in eboot.bin

import { games } from '../data/catalog.js';

  var fold = (text) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  var haystacks = games.map((game) => fold(`${game.title} ${game.developer} ${game.publisher}`));
  function searchGames(query) {
    const needle = fold(query.trim());
    return needle ? games.filter((_, i) => haystacks[i].includes(needle)) : games;
  }

export { searchGames };
