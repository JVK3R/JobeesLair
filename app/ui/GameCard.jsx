// ../pub-game-store/native/ui/GameCard.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: focus lifts and grows a card (1.03, 4 px) where the engine scales it cheaply; a press
// dips to 0.97; Options on a focused card opens its quick preview.

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { prefetchWhenSettled } from '../game/art.js';
import { focusEnd, latin, useLocale } from '../i18n/index.js';
import { genreLabel, onCdn } from '../state/catalog.js';
import { formatSize } from '../state/size.js';
import { useStoreActions, useWishlist } from '../state/store.jsx';
import { CardFocus } from './CardFocus.jsx';
import { CdnMark } from './CdnAura.jsx';
import { Cover } from './Cover.jsx';
import { Icon } from './Icon.jsx';
import '../assets/JetBrainsMono-Regular.ttf';
import { colors, radius } from './colors.js';
import { EASE_OUT } from './ease.js';
import { lightGame, unlight } from './lightBar.js';
import { canScale, px } from './scale.js';
import { openPreview } from './QuickPreview.jsx';
import { Text, View, motion, transitions, useIsFocused } from '@ps5-react/core';

  var focusMotion = { type: "tween", duration: 0.26, ease: EASE_OUT };
  var CAPTION = 54;
  var DETAILED_CAPTION = 96;
  // A focused card rises and grows a little (one smooth tween), under the accent frame; a press eases it in.
  var press = { scale: 0.97 };
  var rest = { y: 0, scale: 1 };
  var lift = { y: -6, scale: 1.05 };
  // Cards too large for the engine's cached transforms only lift.
  var restFlat = { y: 0 };
  var liftFlat = { y: -6 };
  var focusedCard = null;
  // Other cards (the wide lane cards) take part in Options/Square the same way.
  function focusCard(card) {
    focusedCard = card;
  }
  function blurCard(card) {
    if (focusedCard === card) focusedCard = null;
  }
  function useFavoriteAction(fallback = null) {
    const { toggleWish } = useStoreActions();
    return (action) => {
      if (action === "options" && focusedCard?.game) {
        openPreview(focusedCard.game);
        return true;
      }
      const game = action === "square" && (focusedCard?.game ?? fallback);
      if (!game) return false;
      toggleWish(game.id);
      return true;
    };
  }
  function WishBadge({ id }) {
    const wished = useWishlist().includes(id);
    const added = (0, useRef)(0);
    const last = (0, useRef)(wished);
    if (wished && !last.current) added.current += 1;
    last.current = wished;
    if (!wished) return null;
    return /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", right: 12, top: 12, width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.xs, backgroundColor: `${colors.canvas}bf` }, children: /* @__PURE__ */ (0, jsx)(
      motion.View,
      {
        initial: false,
        animate: { scale: 1 },
        transition: transitions.pop,
        children: /* @__PURE__ */ (0, jsx)(Icon, { name: "heart", size: 14, color: colors.fg, fill: colors.fg })
      },
      added.current
    ) });
  }
  var boxes = /* @__PURE__ */ new Map();
  function boxOf(width, detailed) {
    const id = detailed ? -width : width;
    if (!boxes.has(id)) {
      const height = Math.round(width * 4 / 3);
      boxes.set(id, {
        height,
        card: { width: px(width) },
        tile: { height: px(height) },
        text: { width: px(width) },
        cover: { width: px(width), height: px(height), borderRadius: radius.md }
      });
    }
    return boxes.get(id);
  }
  function Details({ game, focused, box }) {
    const { rtl } = useLocale();
    return /* @__PURE__ */ (0, jsxs)(View, { style: [{ height: 144, paddingTop: 15 }, box.text], children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 20, color: colors.subtle, numberOfLines: 1, ellipsizeMode: "tail", lineHeight: 24 }, children: game.genres[0] ? genreLabel(game.genres[0]) : game.platform.toUpperCase() }),
      /* @__PURE__ */ (0, jsx)(Text, { focused, style: [{ marginTop: 6, height: 60, paddingRight: 6, fontFamily: "Exo2", fontSize: 23, fontWeight: 600, color: colors.fg, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, focused ? { color: colors.fg } : null], children: latin(rtl, game.title) }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { marginTop: 9, height: 30, flexDirection: "row", alignItems: "center", gap: 12 }, children: [
        game.metacritic != null && /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.xs, backgroundColor: colors.accent, paddingHorizontal: 9 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 19, color: colors.accentFg, lineHeight: 24 }, children: String(game.metacritic) }) }),
        game.sizeGb != null && /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 18, color: colors.muted }, children: formatSize(game.sizeGb) })
      ] })
    ] });
  }
  function Body({ game, width, caption, detailed, scales }) {
    const { rtl } = useLocale();
    const focused = useIsFocused();
    const box = boxOf(width, detailed);
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsxs)(
        motion.View,
        {
          style: [{ borderRadius: radius.md, backgroundColor: colors.surface }, box.tile],
          initial: false,
          animate: scales ? focused ? lift : rest : focused ? liftFlat : restFlat,
          transition: focusMotion,
          children: [
            /* @__PURE__ */ (0, jsx)(Cover, { game, style: box.cover }),
            /* @__PURE__ */ (0, jsx)(WishBadge, { id: game.id }),
            onCdn(game) ? /* @__PURE__ */ (0, jsx)(CdnMark, {}) : null,
            /* @__PURE__ */ (0, jsx)(CardFocus, { focused, width, height: box.height, platforms: game.platforms })
          ]
        }
      ),
      caption ?? (detailed ? /* @__PURE__ */ (0, jsx)(Details, { game, focused, box }) : /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
        /* @__PURE__ */ (0, jsx)(Text, { focused, style: [[{ marginTop: 18, fontFamily: "Exo2", fontSize: 23, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, focused ? { color: colors.fg } : null], box.text], children: latin(rtl, game.title) }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [{ marginTop: 3, fontFamily: "Exo2", fontSize: 21, color: colors.subtle, numberOfLines: 1, ellipsizeMode: "tail" }, box.text], children: game.genres.slice(0, 2).map(genreLabel).join(" \xB7 ") })
      ] }))
    ] });
  }
  function GameCard({
    game,
    onPress,
    width = 150,
    focusKey = `card:${game.id}`,
    rowEnd,
    enterDelay,
    caption,
    detailed,
    onFocus,
    ...rest2
  }) {
    const { rtl } = useLocale();
    const box = boxOf(width, detailed);
    const scales = canScale(width, box.height + (detailed ? DETAILED_CAPTION : CAPTION));
    const [entering, setEntering] = (0, useState)(enterDelay != null);
    const card = (0, useRef)({}).current;
    card.game = game;
    card.key = focusKey;
    (0, useEffect)(() => () => {
      if (focusedCard !== card) return;
      focusedCard = null;
      unlight(card.key);
    }, []);
    const entrance = entering && {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { ...focusMotion, duration: 0.4, delay: enterDelay },
      onAnimationComplete: () => setEntering(false)
    };
    return /* @__PURE__ */ (0, jsx)(
      motion.View,
      {
        ...focusEnd(rtl, rowEnd ? focusKey : void 0),
        ...rest2,
        focusKey,
        onPress,
        onFocus: () => {
          focusedCard = card;
          prefetchWhenSettled(game);
          lightGame(focusKey, game);
          onFocus?.();
        },
        onBlur: () => {
          if (focusedCard === card) focusedCard = null;
          unlight(focusKey);
        },
        whilePress: scales ? press : void 0,
        transition: focusMotion,
        ...entrance,
        style: box.card,
        children: /* @__PURE__ */ (0, jsx)(Body, { game, width, caption, detailed, scales })
      }
    );
  }

export { DETAILED_CAPTION, GameCard, blurCard, focusCard, useFavoriteAction };
