// ../pub-game-store/native/game/index.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: no Vikingfile capture dialog.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { URLDialog } from '../downloads/URLDialog.jsx';
import { BrowserCaptureDialog } from '../downloads/BrowserCaptureDialog.jsx';
import { About } from './About.jsx';
import { GameFacts } from './GameFacts.jsx';
import { GameHero } from './GameHero.jsx';
import { InstallToast, TOAST_MS } from './InstallToast.jsx';
import { MediaGallery } from './MediaGallery.jsx';
import { OptionsSheet } from './OptionsSheet.jsx';
import { DiagnosisSheet } from './DiagnosisSheet.jsx';
import { MakeRoomSheet } from '../library/MakeRoomSheet.jsx';
import { ShotViewer } from './ShotViewer.jsx';
import { SourcePicker } from './SourcePicker.jsx';
import { VersionSheet } from './VersionSheet.jsx';
import { useT } from '../i18n/index.js';
import { featureLabel, relatedGames } from '../state/catalog.js';
import { downloadQueue } from '../state/downloads.js';
import { useLinkWatch } from '../state/links.js';
import { useNavActions } from '../state/nav.jsx';
import { GameCard, useFavoriteAction } from '../ui/GameCard.jsx';
import { SectionHeader } from '../ui/SectionHeader.jsx';
import { lightGame, unlight } from '../ui/lightBar.js';
import { playNotify } from '../ui/sounds.js';
import { AnimatePresence, FocusScope, ScrollView, Text, View } from '@ps5-react/core';
import { colors, radius } from '../ui/colors.js';

  var CARD_WIDTH2 = 189;
  function Features({ features: features2 }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 30, fontWeight: 600, color: colors.fg, lineHeight: 42, letterSpacing: 0.4 }, children: t2("game.features") }),
      /* @__PURE__ */ (0, jsx)(View, { style: { marginTop: 24, flexDirection: "row", flexWrap: "wrap", gap: 12 }, children: features2.map(
        (feature) => /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.sm, backgroundColor: colors.surface2, paddingHorizontal: 18, paddingVertical: 9 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.fg, lineHeight: 30 }, children: featureLabel(feature) }) }, feature)
      ) })
    ] });
  }
  function Related({ games: games2, onOpenGame }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: { marginTop: 120 }, children: [
      /* @__PURE__ */ (0, jsx)(SectionHeader, { title: t2("game.moreLikeThis") }),
      /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", columnGap: 24 }, children: games2.map(
        (other) => /* @__PURE__ */ (0, jsx)(GameCard, { game: other, width: CARD_WIDTH2, onPress: () => onOpenGame(other) }, other.id)
      ) })
    ] });
  }
  function GameScreen({ game, download, onBack, onOpenGame }) {
    const [dialog, setDialog] = (0, useState)(null);
    const [toast, setToast] = (0, useState)(null);
    const [viewing, setViewing] = (0, useState)(null);
    const { focusLater } = useNavActions();
    const Dialog = { source: SourcePicker, options: OptionsSheet, version: VersionSheet, diagnosis: DiagnosisSheet, makeRoom: MakeRoomSheet }[dialog?.kind] ?? URLDialog;
    const related = relatedGames(game);
    const about = game.about.filter((text) => text.trim());
    // Its download links checked in the background while the page is open (state/links.js).
    useLinkWatch(game.id, game);
    (0, useEffect)(() => {
      const key = `page:${game.id}`;
      lightGame(key, game);
      return () => unlight(key);
    }, [game.id]);
    (0, useEffect)(() => {
      if (!toast) return void 0;
      playNotify();
      const timer = setTimeout(() => setToast(null), TOAST_MS);
      return () => clearTimeout(timer);
    }, [toast]);
    // A download of this game whose file link is being captured from the browser (BrowserCaptureDialog).
    const [captureJob, setCaptureJob] = (0, useState)(null);
    (0, useEffect)(() => {
      let known;
      const queued = (jobs) => jobs.filter((job2) => job2.gameId === game.id).length;
      try {
        return downloadQueue().subscribe((jobs) => {
          const count = queued(jobs);
          if (known !== void 0 && count > known) setToast("started");
          known = count;
          setCaptureJob(jobs.find((job2) => job2.gameId === game.id && job2.captureState) || null);
        });
      } catch {
        return void 0;
      }
    }, [game.id]);
    const onAction = useFavoriteAction(game);
    const back2 = () => {
      onBack();
      return true;
    };
    return /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: back2, onAction, children: /* @__PURE__ */ (0, jsxs)(View, { style: { position: "relative", flex: 1 }, children: [
      /* @__PURE__ */ (0, jsxs)(ScrollView, { style: { flex: 1 }, children: [
        /* @__PURE__ */ (0, jsx)(GameHero, { onRequestDialog: setDialog, game, download, onBack, onDownloaded: () => setToast("complete") }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { paddingHorizontal: 48, paddingTop: 60, paddingBottom: 96 }, children: [
          /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 84 }, children: [
            /* @__PURE__ */ (0, jsxs)(View, { style: { width: 1308, gap: 84 }, children: [
              game.shots.length > 0 ? /* @__PURE__ */ (0, jsx)(MediaGallery, { shots: game.shots, nextDown: about.length > 0 ? "game:about" : void 0, onOpen: setViewing }) : null,
              about.length > 0 ? /* @__PURE__ */ (0, jsx)(About, { paragraphs: about }) : null,
              game.features.length > 0 ? /* @__PURE__ */ (0, jsx)(Features, { features: game.features }) : null
            ] }),
            /* @__PURE__ */ (0, jsx)(GameFacts, { game })
          ] }),
          related.length > 0 ? /* @__PURE__ */ (0, jsx)(Related, { games: related, onOpenGame }) : null
        ] })
      ] }),
      viewing === null ? null : /* @__PURE__ */ (0, jsx)(ShotViewer, { shots: game.shots, start: viewing, onClose: (index) => {
        setViewing(null);
        focusLater(`game:shot:${index}`);
      } }),
      // 0.5.1: inside an AnimatePresence, so a sheet's exit (SideSheet) plays as it closes.
      /* @__PURE__ */ (0, jsx)(AnimatePresence, { children: dialog ? /* @__PURE__ */ (0, jsx)(Dialog, { ...dialog, onClose: () => {
        setDialog(null);
        focusLater(dialog.from ?? `download:${game.id}`);
      } }, dialog.kind ?? "url") : null }),
      captureJob ? /* @__PURE__ */ (0, jsx)(BrowserCaptureDialog, { job: captureJob }, captureJob.id) : null,
      /* @__PURE__ */ (0, jsx)(AnimatePresence, { children: toast ? /* @__PURE__ */ (0, jsx)(InstallToast, { game, started: toast === "started" }, toast) : null })
    ] }) });
  }

export { GameScreen };
