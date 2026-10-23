// A wide (16:9) game card for the library's swimlanes: the game's banner art, its title over a midnight
// fade, an ice-blue focus ring, and the same lift as the portrait cards (sized so the engine scales it
// cheaply). Options and Square act on it like on any card.

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef } from 'react';
import { genreLabel } from '../state/catalog.js';
import { Cover } from './Cover.jsx';
import { ShineBorder } from './FocusRing.jsx';
import { blurCard, focusCard } from './GameCard.jsx';
import { colors, radius } from './colors.js';
import { EASE_OUT } from './ease.js';
import { lightGame, unlight } from './lightBar.js';
import { canScale, px } from './scale.js';
import { Image, Text, View, motion, useIsFocused } from '@ps5-react/core';

  // Logical size; px(300) x px(169) stays under the engine's cached-transform limit.
  var WIDE = { width: 300, height: 169 };
  var focusMotion = { type: "tween", duration: 0.26, ease: EASE_OUT };
  var press = { scale: 0.97 };
  var rest = { y: 0, scale: 1 };
  var lift = { y: -6, scale: 1.05 };
  var SCALES = canScale(WIDE.width, WIDE.height);
  var FADE = { type: "linear", to: "top", stops: [{ color: `${colors.canvas}f2`, offset: 0 }, { color: `${colors.canvas}99`, offset: 0.45 }, { color: "transparent", offset: 0.8 }] };
  function Face({ game, subtitle }) {
    const focused = useIsFocused();
    const box = { width: px(WIDE.width), height: px(WIDE.height), borderRadius: radius.lg };
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsxs)(
        motion.View,
        {
          style: [box, { overflow: "hidden", roundedClip: true, backgroundColor: game.art.tint || colors.surface2 }],
          initial: false,
          animate: SCALES ? focused ? lift : rest : { y: focused ? -6 : 0 },
          transition: focusMotion,
          children: [
            game.art.hero ? /* @__PURE__ */ (0, jsx)(Image, { source: { uri: game.art.hero }, resizeMode: "cover", style: [box, { position: "absolute", top: 0, left: 0 }] }) : /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, alignItems: "flex-end" }, children: /* @__PURE__ */ (0, jsx)(Cover, { game, label: false, style: { height: box.height, aspectRatio: 0.75 } }) }),
            /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundGradient: FADE } }),
            /* @__PURE__ */ (0, jsxs)(View, { style: { position: "absolute", left: 21, right: 21, bottom: 18, gap: 3 }, children: [
              /* @__PURE__ */ (0, jsx)(Text, { focused, style: { fontFamily: "Exo2", fontSize: 24, fontWeight: 600, lineHeight: 32, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, children: game.title }),
              /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 19, lineHeight: 26, color: focused ? colors.glow : colors.muted, numberOfLines: 1 }, children: subtitle })
            ] }),
            // 0.5.1: the frame inside the tile, so it lifts and grows with it (it stood still outside before, and
            // the card moved out from under it), drawn at once like a portrait card's (CardFocus).
            focused ? /* @__PURE__ */ (0, jsx)(ShineBorder, { radius: radius.lg }) : null
          ]
        }
      )
    ] });
  }
  function WideCard({ game, focusKey, onPress, rowEnd, ...rest2 }) {
    const card = (0, useRef)({}).current;
    card.game = game;
    (0, useEffect)(() => () => {
      blurCard(card);
      unlight(focusKey);
    }, []);
    const subtitle = [game.genres[0] && genreLabel(game.genres[0]), game.year, game.sizeGb ? `${Math.round(game.sizeGb * 10) / 10} GB` : null].filter(Boolean).join(" · ");
    return /* @__PURE__ */ (0, jsx)(
      motion.View,
      {
        ...rest2,
        ...rowEnd ? { nextFocusRight: focusKey } : {},
        focusKey,
        onPress,
        onFocus: () => {
          focusCard(card);
          lightGame(focusKey, game);
        },
        onBlur: () => {
          blurCard(card);
          unlight(focusKey);
        },
        whilePress: SCALES ? press : void 0,
        transition: focusMotion,
        style: { position: "relative", width: px(WIDE.width), height: px(WIDE.height) },
        children: /* @__PURE__ */ (0, jsx)(Face, { game, subtitle })
      }
    );
  }

export { WIDE, WideCard };
