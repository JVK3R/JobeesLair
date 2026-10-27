// Quick preview: the Options button on any game card opens this glass card over the page (cover, facts,
// summary) without leaving it; View game goes on to the game's page, Back closes it where it was.
// 0.5.3: Back from that game's page comes back to the card it was opened from (focus went wherever it could).

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { useT } from '../i18n/index.js';
import { genreLabel, summaryOf } from '../state/catalog.js';
import { useLinkWatch } from '../state/links.js';
import { useNavActions } from '../state/nav.jsx';
import { useStoreActions, useWishlist } from '../state/store.jsx';
import { Button2 } from './Button.jsx';
import { Cover } from './Cover.jsx';
import { colors, radius } from './colors.js';
import { AnimatePresence, FocusScope, Text, View, motion } from '@ps5-react/core';

  var showing = null;
  // The card's focus key, for Back from the game's page.
  var openedFrom = null;
  var listeners = /* @__PURE__ */ new Set();
  function openPreview(game, from = null) {
    showing = game;
    openedFrom = game ? from : null;
    for (const listener of listeners) listener(game);
  }
  var closePreview = () => openPreview(null);
  var pop = { type: "tween", duration: 0.16, ease: "easeOut" };
  var fade = { type: "tween", duration: 0.18, ease: "easeOut" };
  var COVER = { width: 300, height: 400, borderRadius: radius.sm };
  function Panel({ game }) {
    const t2 = useT();
    const { openGame } = useNavActions();
    const { toggleWish } = useStoreActions();
    const wished = useWishlist().includes(game.id);
    // A game looked at from the catalog gets its links checked once in the background (state/links.js).
    useLinkWatch(`preview:${game.id}`, game, { repeat: false });
    const facts =[game.platform?.toUpperCase(), game.year, ...game.genres.slice(0, 2).map(genreLabel), game.sizeGb ? `${Math.round(game.sizeGb * 10) / 10} GB` : null].filter(Boolean).join(" · ");
    let summary = "";
    try {
      summary = summaryOf(game) || "";
    } catch {
      summary = "";
    }
    return /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: () => {
      closePreview();
      return true;
    }, children: /* @__PURE__ */ (0, jsxs)(View, { style: { width: 1180, flexDirection: "row", gap: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassEdge, backgroundColor: colors.surface, padding: 42 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: [COVER, { overflow: "hidden", backgroundColor: colors.surface2 }], children: /* @__PURE__ */ (0, jsx)(Cover, { game, style: COVER }) }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 18 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 40, fontWeight: 600, lineHeight: 50, color: colors.fg, numberOfLines: 2, ellipsizeMode: "tail" }, children: game.title }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 14 }, children: [
          game.metacritic != null ? /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.xs, backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 2 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, fontWeight: 600, color: colors.accentFg }, children: String(game.metacritic) }) }) : null,
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 22, color: colors.muted, numberOfLines: 1 }, children: facts })
        ] }),
        summary ? /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 22, lineHeight: 34, color: colors.muted, numberOfLines: 5, ellipsizeMode: "tail" }, children: summary }) : null,
        /* @__PURE__ */ (0, jsx)(View, { style: { flex: 1 } }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 18 }, children: [
          /* @__PURE__ */ (0, jsx)(Button2, { variant: "primary", size: "lg", autoFocus: true, label: t2("browse.viewGame"), onPress: () => {
            const from = openedFrom;
            closePreview();
            openGame(game.id, from ?? void 0);
          } }),
          /* @__PURE__ */ (0, jsx)(Button2, { variant: "outline", size: "lg", icon: "heart", iconFill: wished ? colors.fg : void 0, label: wished ? t2("browse.favorited") : t2("browse.addToFavorites"), onPress: () => toggleWish(game.id) }),
          /* @__PURE__ */ (0, jsx)(Button2, { variant: "ghost", size: "lg", label: t2("hints.close"), onPress: closePreview })
        ] })
      ] })
    ] }) });
  }
  function QuickPreview() {
    const [game, setGame] = (0, useState)(showing);
    (0, useEffect)(() => {
      listeners.add(setGame);
      return () => {
        listeners.delete(setGame);
      };
    }, []);
    return /* @__PURE__ */ (0, jsx)(AnimatePresence, { children: game ? /* @__PURE__ */ (0, jsx)(
      motion.View,
      {
        style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 60, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.canvas}c7` },
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: fade,
        children: /* @__PURE__ */ (0, jsx)(motion.View, { initial: { scale: 0.94, y: 16 }, animate: { scale: 1, y: 0 }, transition: pop, children: /* @__PURE__ */ (0, jsx)(Panel, { game }) })
      },
      game.id
    ) : null });
  }

export { QuickPreview, closePreview, openPreview };
