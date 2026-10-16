// ../pub-game-store/native/browse/GenreRail.jsx
// reconstructed from the esbuild bundle in eboot.bin

import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { GenreCard } from './GenreCard.jsx';
import { games } from '../data/catalog.js';
import { useT } from '../i18n/index.js';
import { genres } from '../state/catalog.js';
import { useStoreActions, useStoreState } from '../state/store.jsx';
import { SectionHeader } from '../ui/SectionHeader.jsx';
import { ScrollView, View } from '@ps5-react/core';
import { colors } from '../ui/colors.js';

  var used = /* @__PURE__ */ new Set();
  var RAIL = genres.map((genre) => ({ genre, matches: games.filter((game) => game.genres.includes(genre)).sort((a, b) => b.recommendations - a.recommendations) })).filter(({ matches }) => matches.length >= 3).sort((a, b) => b.matches.length - a.matches.length).map(({ genre, matches }) => {
    const covers = [...matches.filter((game) => !used.has(game.id)), ...matches.filter((game) => used.has(game.id))].slice(0, 3);
    covers.forEach((game) => used.add(game.id));
    return { genre, count: matches.length, covers };
  });
  function GenreRail() {
    const t2 = useT();
    const { filters } = useStoreState();
    const { toggleFilter } = useStoreActions();
    const [toggleGenre] = (0, useState)(() => (genre) => toggleFilter("genre", genre));
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, children: [
      /* @__PURE__ */ (0, jsx)(SectionHeader, { title: t2("browse.popularGenres") }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { position: "relative", marginHorizontal: -9, marginVertical: -30 }, children: [
        /* @__PURE__ */ (0, jsx)(ScrollView, { style: [{ flexDirection: "row", gap: 18, paddingHorizontal: 9, paddingVertical: 30 }, { direction: "ltr" }], children: RAIL.map(
          ({ genre, count, covers }) => /* @__PURE__ */ (0, jsx)(
            GenreCard,
            {
              genre,
              count,
              covers,
              active: filters.genre.includes(genre),
              onToggle: toggleGenre
            },
            genre
          )
        ) }),
        /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, bottom: 0, right: 0, width: 96, backgroundGradient: { type: "linear", to: "right", stops: [{ color: "transparent", offset: 0 }, { color: colors.canvas, offset: 1 }] } } })
      ] })
    ] });
  }

export { GenreRail };
