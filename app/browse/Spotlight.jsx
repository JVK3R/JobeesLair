// ../pub-game-store/native/browse/Spotlight.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Up from the hero goes to the current section in the top island (nav:current).
// MODIFIED: a full-width hero banner; its slides are picked from a thumbnail strip over its lower right
// (HeroThumbs) instead of a list beside it, and Down leads to the Featured lane.
// MODIFIED (0.5.3): top games, a new few each launch (browse/featured.js), and X on a thumbnail opens its game.

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { memo, useEffect, useRef, useState } from 'react';
import { featured } from './featured.js';
import { FIRST_FEATURED } from './Lanes.jsx';
import { HeroThumbs } from './HeroThumbs.jsx';
import { useSlides } from './useSlides.js';
import { LATIN_IN_RTL, focusEnd, useLocale, useT } from '../i18n/index.js';
import { genreLabel, summaryOf } from '../state/catalog.js';
import { useNavActions, useNavState } from '../state/nav.jsx';
import { useStoreActions, useWishlist } from '../state/store.jsx';
import { Button2 } from '../ui/Button.jsx';
import { GameLogo, logoStyle } from '../ui/GameLogo.jsx';
import { WishHeart } from '../ui/WishHeart.jsx';
import { EASE_OUT } from '../ui/ease.js';
import { AnimatePresence, Image, Text, View, motion } from '@ps5-react/core';
import { colors, radius } from '../ui/colors.js';

  var ART = { width: 1824, height: 600 };
  var LOGO2 = [320, 112, 48 * 256];
  function prefetchSlides() {
    for (const game of featured) {
      if (game.art.hero) Image.prefetch(game.art.hero, ART).catch(() => {
      });
      if (game.art.logo) Image.prefetch(game.art.logo, { ...logoStyle(game, ...LOGO2), resizeMode: "contain" }).catch(() => {
      });
    }
  }
  // 0.5.1: the banner crossfades. The one showing stays under the next until the next has loaded and faded in
  // (two decoded banners for a third of a second, then one), instead of a cut to a blank while it decoded.
  var CROSS = { type: "tween", duration: 0.35, ease: "easeOut" };
  var ART_BOX = (game) => [{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.sm }, game.art.tint ? { ...ART, backgroundColor: game.art.tint } : ART];
  function Art({ game }) {
    const [shown, setShown] = (0, useState)(game);
    const [under, setUnder] = (0, useState)(null);
    const [loaded, setLoaded] = (0, useState)(true);
    (0, useEffect)(() => {
      if (shown === game) return void 0;
      const id = setTimeout(() => {
        // The banner showing goes under the next only if it loaded itself; else the one under it stays.
        setUnder((current) => loaded && shown.art.hero ? shown : current);
        setShown(game);
        setLoaded(false);
      }, 20);
      return () => clearTimeout(id);
    }, [game, shown, loaded]);
    // The banner under goes once the next has faded in over it.
    (0, useEffect)(() => {
      if (!loaded || !under) return void 0;
      const id = setTimeout(() => setUnder(null), 450);
      return () => clearTimeout(id);
    }, [loaded, under]);
    const drop = () => setUnder(null);
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      under ? /* @__PURE__ */ (0, jsx)(Image, { source: { uri: under.art.hero }, resizeMode: "cover", style: ART_BOX(under) }, `under:${under.id}`) : null,
      shown.art.hero ? /* @__PURE__ */ (0, jsx)(motion.View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }, initial: false, animate: { opacity: under && !loaded ? 0 : 1 }, transition: CROSS, children: /* @__PURE__ */ (0, jsx)(Image, { source: { uri: shown.art.hero }, resizeMode: "cover", style: ART_BOX(shown), onLoad: () => setLoaded(true), onError: drop }) }, `art:${shown.id}`) : null
    ] });
  }
  function Blurb({ game }) {
    useT();
    const { rtl } = useLocale();
    const [ready, setReady] = (0, useState)(null);
    const current = (0, useRef)(game.id);
    current.current = game.id;
    (0, useEffect)(() => {
      const id2 = setTimeout(() => setReady(game.id), 800);
      return () => clearTimeout(id2);
    }, [game.id]);
    const id = game.id;
    return /* @__PURE__ */ (0, jsx)(AnimatePresence, { mode: "wait", initial: false, children: /* @__PURE__ */ (0, jsxs)(
      motion.View,
      {
        style: { gap: 30 },
        initial: { opacity: 0, y: 12 },
        animate: ready === game.id ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 },
        exit: { opacity: 0, y: -6, transition: { type: "tween", duration: 0.15, ease: "easeIn" } },
        transition: { type: "tween", duration: 0.45, ease: EASE_OUT },
        children: [
          /* @__PURE__ */ (0, jsx)(
            GameLogo,
            {
              game,
              width: LOGO2[0],
              height: LOGO2[1],
              area: LOGO2[2],
              onReady: () => current.current === id && setReady(id)
            }
          ),
          /* @__PURE__ */ (0, jsx)(Text, { style: { marginBottom: -12, fontFamily: "Exo2", fontSize: 21, color: colors.muted, lineHeight: 30 }, children: game.genres.map(genreLabel).join(" \xB7 ") }),
          /* @__PURE__ */ (0, jsx)(Text, { style: [{ width: 552, fontFamily: "Exo2", fontSize: 23, color: colors.fg, numberOfLines: 3, ellipsizeMode: "tail", lineHeight: 37 }, rtl ? LATIN_IN_RTL : void 0], children: summaryOf(game) })
        ]
      },
      game.id
    ) });
  }
  function WishButton({ id, toList }) {
    const t2 = useT();
    const { rtl } = useLocale();
    const wishlist = useWishlist();
    const { toggleWish } = useStoreActions();
    const wished = wishlist.includes(id);
    return /* @__PURE__ */ (0, jsx)(
      Button2,
      {
        variant: "outline",
        size: "lg",
        label: wished ? t2("browse.favorited") : t2("browse.addToFavorites"),
        focusKey: "spotlight:wish",
        nextFocusUp: "nav:current",
        nextFocusDown: FIRST_FEATURED,
        ...focusEnd(rtl, toList),
        onPress: () => toggleWish(id),
        children: /* @__PURE__ */ (0, jsx)(WishHeart, { active: wished })
      }
    );
  }
  function Spotlight() {
    return /* @__PURE__ */ (0, jsx)(Carousel, { shown: useNavState().top.name === "browse" });
  }
  var Carousel = (0, memo)(function Carousel2({ shown }) {
    const t2 = useT();
    const { rtl } = useLocale();
    const slides = useSlides(featured.length, shown);
    const { openGame } = useNavActions();
    // Back from the game page returns to its thumbnail.
    const [open] = (0, useState)(() => (index) => openGame(featured[index].id, `spotlight:${index}`));
    const game = featured[slides.active];
    (0, useEffect)(() => {
      const id = setTimeout(prefetchSlides, 1500);
      return () => clearTimeout(id);
    }, []);
    return /* @__PURE__ */ (0, jsxs)(View, { children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { position: "relative", width: ART.width, height: ART.height, overflow: "hidden", roundedClip: true, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 }, children: [
        /* @__PURE__ */ (0, jsx)(Art, { game }),
        /* @__PURE__ */ (0, jsx)(View, { style: rtl ? { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundGradient: { type: "linear", to: "left", stops: [{ color: colors.canvas, offset: 0 }, { color: `${colors.canvas}bf`, offset: 0.35 }, { color: "transparent", offset: 0.75 }] } } : { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundGradient: { type: "linear", to: "right", stops: [{ color: colors.canvas, offset: 0 }, { color: `${colors.canvas}bf`, offset: 0.35 }, { color: "transparent", offset: 0.75 }] } } }),
        /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundGradient: { type: "linear", to: "top", stops: [{ color: `${colors.canvas}b3`, offset: 0 }, { color: "transparent", offset: 0.5 }] } } }),
        /* @__PURE__ */ (0, jsxs)(View, { style: rtl ? { position: "absolute", top: 0, bottom: 0, right: 0, width: 672, justifyContent: "flex-end", padding: 60 } : { position: "absolute", top: 0, bottom: 0, left: 0, width: 672, justifyContent: "flex-end", padding: 60 }, children: [
          /* @__PURE__ */ (0, jsx)(Blurb, { game }),
          /* @__PURE__ */ (0, jsxs)(View, { style: { marginTop: 30, flexDirection: "row", gap: 12 }, children: [
            /* @__PURE__ */ (0, jsx)(
              Button2,
              {
                variant: "primary",
                size: "lg",
                label: t2("browse.viewGame"),
                focusKey: "spotlight:cta",
                nextFocusUp: "nav:current",
                nextFocusDown: FIRST_FEATURED,
                onPress: () => openGame(game.id, "spotlight:cta")
              }
            ),
            /* @__PURE__ */ (0, jsx)(WishButton, { id: game.id, toList: `spotlight:${slides.active}` })
          ] })
        ] }),
        /* @__PURE__ */ (0, jsx)(View, { style: rtl ? { position: "absolute", left: 36, bottom: 36 } : { position: "absolute", right: 36, bottom: 36 }, children: /* @__PURE__ */ (0, jsx)(HeroThumbs, { games: featured, slides, open, nextFocusDown: FIRST_FEATURED }) })
      ] })
    ] });
  });

export { Spotlight };
