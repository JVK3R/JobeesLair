// ../pub-game-store/native/index.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Jobee'sLair; catalog feeds refresh in the background once the store is up.
// MODIFIED: the phone companion starts with the store when Settings left it on.
// MODIFIED: pages run from under the floating top island to above the button hints (PAGE_TOP, PAGE_BOTTOM).
// MODIFIED: after the startup notice the store comes out of a vortex reveal (ui/Reveal.jsx).
// MODIFIED: every launch shows the terms of use and legal notice (ui/Disclaimer.jsx) between the intro and the
// store; plain text, it stays until the player presses ✕ (Continue), then the store mounts.
// MODIFIED (0.5.0 Pre Release 4): a one-time "What's new" panel (ui/WhatsNew.jsx) and the screen saver
// (ui/ScreenSaver.jsx) sit over the whole app.
// MODIFIED: the DualSense status light follows the download queue (ui/lightBar.js), and a theme chosen in
// Settings redraws the store in its accent when Settings closes (the store is keyed on the theme epoch).

import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { AppRegistry, FocusScope, ReleaseImages, View, motion } from '@ps5-react/core';
// First of the app's own imports: the earlier version's files are carried over before any module reads one.
import { migrationLog } from './state/title-migration-run.js';
import { BrowsePage } from './browse/BrowsePage.jsx';
import { DownloadsScreen } from './downloads/DownloadsScreen.jsx';
import { FilesScreen } from './files/FilesScreen.jsx';
import { LibraryScreen } from './library/LibraryScreen.jsx';
import { HomebrewScreen } from './homebrew/HomebrewScreen.jsx';
import { HomebrewApp } from './homebrew/HomebrewApp.jsx';
import { SettingsScreen } from './ui/Settings.jsx';
import { startHomebrewRefresh } from './state/homebrew-store.js';
import { GameScreen } from './game/index.jsx';
import { LocaleProvider, useLocale } from './i18n/index.js';
import { SearchScreen } from './search/index.jsx';
import { getGame, warmCovers } from './state/catalog.js';
import { refreshFeeds } from './state/feeds.js';
import { startCompanionIfEnabled } from './companion/service.js';
import { startSandboxSweeper } from './state/sandbox-sweeper.js';
import { refreshDrives } from './state/drives.js';
import { downloadQueue } from './state/downloads.js';
import { colors, useThemeEpoch } from './ui/colors.js';
import { watchQueue } from './ui/lightBar.js';
import { startInstaller, startUpdateChecks } from './state/update.js';
import { startOnline } from './state/online.js';
import { applySpeedLimit } from './state/speed-limit.js';
import { installLogger } from './services/logger.js';
import { VERSION } from './version.js';
import { HOMEBREW_ONLY } from './edition.js';
import { deviceFacts } from './state/device.js';
import { NavProvider, useIsImmersive, useNavActions, useNavState } from './state/nav.jsx';
import { StoreFreeze, StoreProvider } from './state/store.jsx';
import { Header } from './ui/Header.jsx';
import { Legend } from './ui/Legend.jsx';
import { Splash } from './ui/Splash.jsx';
import { Reveal } from './ui/Reveal.jsx';
import { Disclaimer } from './ui/Disclaimer.jsx';
import { UpdateDialog } from './ui/UpdateDialog.jsx';
import { ScreenSaver } from './ui/ScreenSaver.jsx';
import { WhatsNew } from './ui/WhatsNew.jsx';
import { AnnouncementBar, usePageGlide } from './ui/AnnouncementBar.jsx';
import { useInterfaceHaptics } from './ui/haptics.js';
import { useInterfaceSounds } from './ui/sounds.js';

  function Screen({ screen: screen2 }) {
    const { openGame, pop, push } = useNavActions();
    const openCard = (game) => openGame(game.id, `card:${game.id}`);
    if (screen2.name === "game") return /* @__PURE__ */ (0, jsx)(GameScreen, { game: getGame(screen2.id), download: screen2.download, onBack: pop, onOpenGame: openCard });
    if (screen2.name === "downloads") return /* @__PURE__ */ (0, jsx)(DownloadsScreen, { onBack: pop, onOpenGame: openGame });
    // The Files section opens on the library (the games); its files are one level down ("storage").
    if (screen2.name === "files") return /* @__PURE__ */ (0, jsx)(LibraryScreen, { onBack: pop, onOpenGame: openGame });
    if (screen2.name === "storage") return /* @__PURE__ */ (0, jsx)(FilesScreen, { onBack: pop });
    // The Homebrew section and one app's page in it (homebrew/).
    if (screen2.name === "homebrew") return /* @__PURE__ */ (0, jsx)(HomebrewScreen, { onBack: pop, onOpenApp: (id, from) => push({ name: "homebrew-app", id }, from) });
    if (screen2.name === "homebrew-app") return /* @__PURE__ */ (0, jsx)(HomebrewApp, { id: screen2.id, onBack: pop });
    // Settings, a section since 0.5.0 Pre Release 3.
    if (screen2.name === "settings") return /* @__PURE__ */ (0, jsx)(SettingsScreen, { onBack: pop });
    return /* @__PURE__ */ (0, jsx)(SearchScreen, { onBack: pop, onOpenGame: openCard });
  }
  // Pages start under the top island (Header.jsx: 24 from the top, 80 tall) with a gap, and end above
  // the button hints (Legend, 60 tall). 0.5.2: while announcements are up, they start under their bar too, and
  // glide there when it comes or goes (ui/AnnouncementBar.jsx, usePageGlide).
  var PAGE_TOP = 128, PAGE_BOTTOM = 60;
  // The store comes up out of the vortex (ui/Reveal.jsx): it is mounted, still, under the reveal's backdrop,
  // which fades once the JL mark has popped and flown toward the island; the reveal unmounts when done.
  // CURTAIN_MS only covers a reveal that never reports back.
  var CURTAIN_MS = 3600;
  // A screen slides in over the one it replaces: the full-screen container is translated, never faded or
  // scaled (a full-screen fade repaints every frame of it).
  var SCREEN_FADE = { type: "tween", duration: 0.32, ease: [0.22, 1, 0.36, 1] };
  // While another page is up, the store's art goes (ReleaseImages): the engine registers at most 256
  // images, and the Homebrew section alone draws a few dozen.
  function BrowseLayer({ shown }) {
    const glide = usePageGlide();
    const top = PAGE_TOP + glide.top;
    return /* @__PURE__ */ (0, jsx)(motion.View, { initial: false, animate: { y: glide.y }, transition: { y: glide.transition }, style: shown ? { position: "absolute", left: 0, right: 0, top, bottom: PAGE_BOTTOM } : { position: "absolute", left: 0, right: 0, top, bottom: PAGE_BOTTOM, display: "none" }, children: /* @__PURE__ */ (0, jsx)(ReleaseImages, { when: !shown, children: /* @__PURE__ */ (0, jsx)(StoreFreeze, { frozen: !shown, children: /* @__PURE__ */ (0, jsx)(FocusScope, { focusKey: "page", autoFocus: true, inert: !shown, children: /* @__PURE__ */ (0, jsx)(BrowsePage, {}) }) }) }) });
  }
  // Any other page. It slides in over the one it replaces, and glides with the announcement bar; an immersive one
  // covers the whole screen (the bar is not shown then) and stays put.
  function ScreenFrame({ immersive, children }) {
    const glide = usePageGlide();
    const y = immersive ? 0 : glide.y;
    return jsx(motion.View, { initial: { x: 56, y }, animate: { x: 0, y }, transition: { ...SCREEN_FADE, y: glide.transition }, style: immersive ? { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } : { position: "absolute", left: 0, right: 0, top: PAGE_TOP + glide.top, bottom: PAGE_BOTTOM }, children });
  }
  var WARM_DELAY_MS = 3e3;
  // After the covers warm: a feed's new copy is only read at the next launch, so nothing here waits on it.
  var FEEDS_DELAY_MS = 8e3;
  function App() {
    useInterfaceSounds();
    useInterfaceHaptics();
    // 0.5.1: the homebrew-only edition has no catalog to warm, no feeds and no phone companion.
    (0, useEffect)(() => {
      if (HOMEBREW_ONLY) return void 0;
      const id = setTimeout(warmCovers, WARM_DELAY_MS);
      return () => clearTimeout(id);
    }, []);
    (0, useEffect)(() => {
      if (HOMEBREW_ONLY) return void 0;
      const id = setTimeout(() => void refreshFeeds(), FEEDS_DELAY_MS);
      return () => clearTimeout(id);
    }, []);
    (0, useEffect)(() => HOMEBREW_ONLY ? void 0 : startCompanionIfEnabled(), []);
    // MODIFIED (0.5.0 Pre Release 4): the helper that clears this app's sandbox once it closes, so
    // ShadowMount+ can let go of the title (state/sandbox-sweeper.js).
    (0, useEffect)(() => startSandboxSweeper(), []);
    // The drives and their space are read once at launch, on the probe worker, so the first screen that
    // wants them finds them in the cache.
    (0, useEffect)(() => {
      void refreshDrives();
    }, []);
    // The light bar watches the queue from launch; a queue that cannot start leaves it breathing idle.
    (0, useEffect)(() => watchQueue((listener) => downloadQueue().subscribe(listener)), []);
    // The update check: once at launch (after the store is up), then every 24 hours.
    (0, useEffect)(() => startUpdateChecks(), []);
    // The Homebrew section's live index, fetched once a while after launch (state/homebrew-store.js).
    (0, useEffect)(() => startHomebrewRefresh(), []);
    // 0.5.2: the live count, announcements and (unless turned off) the anonymous stats (state/online.js).
    (0, useEffect)(() => startOnline(() => downloadQueue().transferring?.() ?? false), []);
    const { top } = useNavState();
    const onBrowse = top.name === "browse";
    const key = top.name === "game" ? `game:${top.id}` : top.name === "homebrew-app" ? `homebrew-app:${top.id}` : top.name;
    const immersive = useIsImmersive();
    const { rtl } = useLocale();
    return (
      // Arabic and Urdu mirror every row and right-align every paragraph from here.
      /* @__PURE__ */ (0, jsxs)(View, { style: [{ width: 1920, height: 1080, backgroundColor: colors.canvas }, { direction: rtl ? "rtl" : "ltr" }], children: [
        /* @__PURE__ */ (0, jsxs)(Header, { children: [
          HOMEBREW_ONLY ? null : /* @__PURE__ */ (0, jsx)(BrowseLayer, { shown: onBrowse }),
          onBrowse ? null : (
            // No background of its own: the root's canvas shows through, so a screen change does not
            // fill the whole screen twice. `screen` lets the header's Down return to where it was left.
            jsx(ScreenFrame, { immersive, children: /* @__PURE__ */ (0, jsx)(FocusScope, { focusKey: "screen", children: /* @__PURE__ */ (0, jsx)(Screen, { screen: top }) }) }, key)
          ),
          immersive ? null : /* @__PURE__ */ (0, jsx)(Legend, { screen: top.name }),
          immersive ? null : jsx(AnnouncementBar, {}),
          /* @__PURE__ */ (0, jsx)(UpdateDialog, {})
        ] }),
        // 0.5.0 Pre Release 4: the one-time What's new, and the screen saver over everything.
        HOMEBREW_ONLY ? null : /* @__PURE__ */ (0, jsx)(WhatsNew, {}),
        HOMEBREW_ONLY ? null : /* @__PURE__ */ (0, jsx)(ScreenSaver, {})
      ] })
    );
  }
  // The intro owns the screen until it ends, then the startup notice does: the store is mounted by the
  // notice's `onDone`, so no page, cover or catalog work happens underneath either of them.
  function Boot() {
    const [introDone, setIntroDone] = (0, useState)(false);
    // The intro starts leaving (it slides up) while the startup notice is already mounted under it.
    const [introLeaving, setIntroLeaving] = (0, useState)(false);
    const [booted, setBooted] = (0, useState)(false);
    const [curtain, setCurtain] = (0, useState)(true);
    const theme = useThemeEpoch();
    // This build says it started right away (state/update.js startInstaller): after an update the updater
    // waits for that, and the startup notice below can stay up for as long as the player likes.
    // The debug log (services/logger.js) opens first, so everything after it, the speed limit included, is in it.
    (0, useEffect)(() => {
      let facts = {};
      try {
        facts = { version: VERSION, firmware: deviceFacts().firmware ?? "unknown" };
      } catch {
      }
      installLogger(facts);
      // What the title-ID migration did as the app loaded, now that the debug log is open.
      for (const line of migrationLog) console.log(line);
    }, []);
    (0, useEffect)(() => startInstaller(), []);
    // The saved download speed limit, handed to the engine before any download starts.
    (0, useEffect)(() => applySpeedLimit(), []);
    (0, useEffect)(() => {
      if (!booted) return void 0;
      const id = setTimeout(() => setCurtain(false), CURTAIN_MS);
      return () => clearTimeout(id);
    }, [booted]);
    // The intro reports itself (about 2.5s); this only covers an animation callback that never
    // arrives, where a stuck intro forever is worse than a store without it.
    (0, useEffect)(() => {
      const id = setTimeout(() => setIntroDone(true), 5e3);
      return () => clearTimeout(id);
    }, []);
    return /* @__PURE__ */ (0, jsx)(View, { style: { width: 1920, height: 1080, backgroundColor: colors.canvas }, children: booted
      ? [/* @__PURE__ */ (0, jsx)(View, { style: { width: 1920, height: 1080 }, children: /* @__PURE__ */ (0, jsx)(LocaleProvider, { children: /* @__PURE__ */ (0, jsx)(StoreProvider, { children: /* @__PURE__ */ (0, jsx)(NavProvider, { children: /* @__PURE__ */ (0, jsx)(App, {}) }) }) }) }, `store:${theme}`), curtain ? /* @__PURE__ */ (0, jsx)(Reveal, { onDone: () => setCurtain(false) }, "curtain") : null]
      : [introDone || introLeaving ? /* @__PURE__ */ (0, jsx)(Disclaimer, { onDone: () => setBooted(true) }, "notice") : null, introDone ? null : /* @__PURE__ */ (0, jsx)(Splash, { onExit: () => setIntroLeaving(true), onDone: () => setIntroDone(true) }, "intro")] });
  }
  AppRegistry.registerComponent("jobeeslair", () => () => /* @__PURE__ */ (0, jsx)(Boot, {}));
