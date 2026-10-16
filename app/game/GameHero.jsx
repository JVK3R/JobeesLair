// ../pub-game-store/native/game/GameHero.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { BackLink } from './BackLink.jsx';
import { DownloadButton } from './DownloadButton.jsx';
import { COVER, HERO, LOGO } from './art.js';
import { canDownload } from './releases.js';
import { SPAN_MAX, fitBytes } from '../i18n/fit.js';
import { latin, useLocale, useT } from '../i18n/index.js';
import { genreLabel, listedId } from '../state/catalog.js';
import { useStoreActions, useWishlist } from '../state/store.jsx';
import { Button2 } from '../ui/Button.jsx';
import { Cover } from '../ui/Cover.jsx';
import { GameLogo } from '../ui/GameLogo.jsx';
import { WishHeart } from '../ui/WishHeart.jsx';
import { EASE_OUT } from '../ui/ease.js';
import { Image, Text, View, motion } from '@ps5-react/core';
import { colors, radius } from '../ui/colors.js';

  var column = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.22 } } };
  var rise = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } } };
  function Backdrop({ game }) {
    const [failed, setFailed] = (0, useState)([]);
    const uri = [game.art.hero, ...game.shots.map((shot) => shot.url)].find((url) => url && !failed.includes(url));
    return uri ? /* @__PURE__ */ (0, jsx)(
      Image,
      {
        source: { uri },
        style: [{ position: "absolute", left: 0, top: -96, backgroundColor: colors.surface2 }, game.art.tint ? { ...HERO, backgroundColor: game.art.tint } : HERO],
        resizeMode: "cover",
        onError: () => setFailed((previous) => [...previous, uri])
      },
      uri
    ) : null;
  }
  function Meta({ game }) {
    const t2 = useT();
    const { rtl } = useLocale();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(motion.View, { variants: rise, style: { marginTop: 12 }, children: /* @__PURE__ */ (0, jsxs)(Text, { style: { width: 960, fontFamily: "Exo2", fontSize: 23, color: colors.muted, numberOfLines: 1, ellipsizeMode: "tail" }, children: [
        latin(rtl, fitBytes(game.developer, SPAN_MAX - 3)),
        game.developer && game.genres.length > 0 ? /* @__PURE__ */ (0, jsx)(Text, { style: { color: colors.subtle }, children: "  \xB7  " }) : null,
        fitBytes(game.genres.map(genreLabel).join(", "), SPAN_MAX)
      ] }) }),
      /* @__PURE__ */ (0, jsxs)(motion.View, { variants: rise, style: { marginTop: 24, flexDirection: "row", alignItems: "center", gap: 36 }, children: [
        game.metacritic ? /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 12 }, children: [
          /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.xs, backgroundColor: colors.accent, paddingHorizontal: 9 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, fontWeight: 700, color: "#ffffff", lineHeight: 30 }, children: String(game.metacritic) }) }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.muted, lineHeight: 30 }, children: t2("game.metacritic") })
        ] }) : null,
        game.year ? /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.muted, lineHeight: 30 }, children: t2("game.released", { year: String(game.year) }) }) : null
      ] })
    ] });
  }
  function GameHero({ game, download, onBack, onDownloaded, onRequestDialog }) {
    const t2 = useT();
    const { rtl } = useLocale();
    const { toggleWish } = useStoreActions();
    const wished = useWishlist().includes(listedId(game.id));
    const nextDown = game.shots.length > 0 ? "game:shots" : void 0;
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: { position: "relative", overflow: "hidden", borderBottomWidth: 1, borderColor: colors.line }, children: [
      /* @__PURE__ */ (0, jsx)(Backdrop, { game }, game.id),
      /* @__PURE__ */ (0, jsx)(View, { style: rtl ? { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundGradient: { type: "linear", to: "left", stops: [{ color: colors.canvas, offset: 0 }, { color: `${colors.canvas}d9`, offset: 0.45 }, { color: `${colors.canvas}40`, offset: 1 }] } } : { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundGradient: { type: "linear", to: "right", stops: [{ color: colors.canvas, offset: 0 }, { color: `${colors.canvas}d9`, offset: 0.45 }, { color: `${colors.canvas}40`, offset: 1 }] } } }),
      /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundGradient: { type: "linear", to: "top", stops: [{ color: colors.canvas, offset: 0 }, { color: "transparent", offset: 0.4 }, { color: `${colors.canvas}66`, offset: 1 }] } } }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { paddingHorizontal: 48, paddingTop: 36, paddingBottom: 72 }, children: [
        /* @__PURE__ */ (0, jsx)(BackLink, { onPress: onBack }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { marginTop: 60, flexDirection: "row", alignItems: "flex-end", gap: 60 }, children: [
          /* @__PURE__ */ (0, jsx)(View, { style: { width: 288, height: 384, overflow: "hidden", roundedClip: true, borderRadius: radius.sm, backgroundColor: colors.surface }, children: /* @__PURE__ */ (0, jsx)(Cover, { game, style: COVER }) }),
          /* @__PURE__ */ (0, jsxs)(motion.View, { variants: column, initial: "hidden", animate: "show", style: { flex: 1 }, children: [
            /* @__PURE__ */ (0, jsx)(motion.View, { variants: rise, style: { marginBottom: 24 }, children: /* @__PURE__ */ (0, jsx)(GameLogo, { game, width: LOGO.width, height: LOGO.height }) }),
            /* @__PURE__ */ (0, jsx)(Meta, { game }),
            /* @__PURE__ */ (0, jsxs)(View, { style: { marginTop: 42, flexDirection: "row", alignItems: "flex-start", gap: 15 }, children: [
              /* @__PURE__ */ (0, jsx)(DownloadButton, { onRequestDialog, game, start: download, onDownloaded, nextDown }, game.id),
              /* @__PURE__ */ (0, jsx)(
                Button2,
                {
                  variant: "outline",
                  size: "lg",
                  label: t2(wished ? "game.favorite" : "game.addToFavorites"),
                  onPress: () => toggleWish(game.id),
                  nextFocusDown: nextDown,
                  autoFocus: !canDownload(game),
                  focusKey: `favorite:${game.id}`,
                  children: /* @__PURE__ */ (0, jsx)(WishHeart, { active: wished })
                }
              )
            ] })
          ] })
        ] })
      ] })
    ] });
  }

export { GameHero };
