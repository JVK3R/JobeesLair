// ../pub-game-store/native/ui/Header.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: the settings button shows a gear. A newer release (state/update.js) shows as a badge before it.
// MODIFIED: the phone companion's shortcuts (Home, Downloads, Search, Settings) open here.
// MODIFIED: navigation is a floating glass island at the top (DOCK_* below; pages start under it, index.jsx
// PAGE_TOP). Back at a page's root focuses it; Down from it enters the page.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useRef, useState } from 'react';
import { focusEnd, useLocale, useT } from '../i18n/index.js';
import { NO_FILTERS, activeCount, genreLabel, genres, getGame } from '../state/catalog.js';
import { useIsImmersive, useNavActions, useNavState } from '../state/nav.jsx';
import { useWishlist } from '../state/store.jsx';
import { openUpdateDialog, useInstall, useUpdate } from '../state/update.js';
import { ButtonGlyph } from './ButtonHints.jsx';
import { DownloadToast } from './DownloadToast.jsx';
import { DownloadsBadge } from './DownloadsBadge.jsx';
import { FocusRing } from './FocusRing.jsx';
import { Logo } from './Logo.jsx';
import { QuickPreview } from './QuickPreview.jsx';
import { Menu, MenuDivider, MenuItem } from './Menu.jsx';
import { NavItem } from './NavItem.jsx';
import { NavPill, useNavLayouts } from './NavPill.jsx';
import { useSections } from './useSections.js';
import { DockCount } from './LibraryCount.jsx';
import { useHomebrewUpdates } from '../state/homebrew-store.js';
import { useRemoteShortcuts } from '../companion/remote.js';
import { FocusScope, Text, View, motion } from '@ps5-react/core';
import { VERSION } from '../version.js';
import { HOMEBREW_ONLY } from '../edition.js';
import { dockMark } from './dock-mark.js';
import { EASE_OUT } from './ease.js';
import { logical, px } from './scale.js';
import '../assets/JetBrainsMono-Regular.ttf';
import { colors, radius } from './colors.js';
import { hb } from '../homebrew/palette.js';

  // The island's place, kept clear by the pages under it (index.jsx PAGE_TOP).
  var DOCK_HEIGHT = 80, DOCK_TOP = 24;
  // Glass: graphite, lighter at its top edge as if lit from above.

  var BADGE = /* @__PURE__ */ (0, jsx)(DownloadsBadge, {});
  // The newer release's badge: its version, how far its download is (in whole percent, so the dock redraws
  // a hundred times at most), or that a restart installs it. Only this item follows the progress.
  function UpdateNavItem({ update, down }) {
    const t2 = useT();
    const install = useInstall();
    const mine = install.version === update.version;
    const percent = install.total ? Math.floor(Math.min(1, install.written / install.total) * 100) : 0;
    const label = !mine ? t2("update.badge", { version: update.version }) : ["ready", "armed"].includes(install.phase) ? t2("update.badgeReady") : ["waiting", "downloading", "checking"].includes(install.phase) ? t2("update.badgeProgress", { version: update.version, percent: String(percent) }) : t2("update.badge", { version: update.version });
    const icon = mine && ["ready", "armed"].includes(install.phase) ? "restart" : "download";
    return /* @__PURE__ */ (0, jsx)(NavItem, { focusKey: "nav:update", icon, label, onPress: openUpdateDialog, nextFocusDown: down, children: /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 12, right: 14, width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.accentHi } }) });
  }
  // On the first launch the dock drops in from above a moment after the store starts rising (index.jsx), and
  // settles without a bounce; after that it is simply there (a theme change remounts the store and must not
  // replay it). A translated layer, never faded.
  // The running version, always in sight: a small tab hanging from the island's lower edge under the logo,
  // in the gap above the page (PAGE_TOP), so it never widens the island or moves its items. "v0.4.0" for a
  // release, "v0.5.0 PRE 1" for a pre-release.
  var SHORT_VERSION = `v${VERSION.replace(/-pre\.(\d+)$/i, " PRE $1").replace(/-beta\.(\d+)$/i, " BETA $1")}`;
  function VersionTab() {
    return /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", left: 0, right: 0, bottom: -(DOCK_HEIGHT - 60) / 2 - 15, alignItems: "center" }, children: /* @__PURE__ */ (0, jsx)(View, { style: { height: 26, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.glassEdge, backgroundColor: colors.surface, paddingHorizontal: 12 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 14, lineHeight: 18, letterSpacing: 1.5, color: colors.muted }, children: SHORT_VERSION }) }) });
  }
  // The Homebrew section's item: its name, and the number of installed apps with a newer release.
  function HomebrewNavItem({ item, onPress }) {
    const t2 = useT();
    const updates = useHomebrewUpdates();
    return item("homebrew", { icon: "package", label: t2("nav.homebrew"), tone: hb().hi, onPress, children: updates ? /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 6, right: 6, minWidth: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: hb().hi, paddingHorizontal: 8 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 17, fontWeight: 700, lineHeight: 22, color: hb().fgHi }, children: String(updates) }) }) : null });
  }
  var dockArrived = false;
  // Where the island's JL mark sits on screen (dock-mark.js), for the store's reveal to fly its mark to. The
  // island is centered, so its width (the language, an update badge) moves it; in a right-to-left language the
  // logo is at the island's right end. The inset: the island's and the home button's padding, half the mark.
  var DOCK_MARK_H = px(34);
  var MARK_INSET = 18 + 18 + Math.round(DOCK_MARK_H * 1.5) / 2;
  Object.assign(dockMark, { y: DOCK_TOP + DOCK_HEIGHT / 2, height: DOCK_MARK_H });
  var DOCK_DROP = { type: "tween", duration: 0.9, delay: 0.3, ease: EASE_OUT };
  function Header({ children }) {
    const t2 = useT();
    const { rtl } = useLocale();
    const { section, filters, on, step, keyOf } = useSections();
    const wishlist = useWishlist();
    const favorites = wishlist.filter((id) => getGame(id)).length;
    const nav = useNavActions();
    const { top } = useNavState();
    const [browsing, setBrowsing] = (0, useState)(false);
    const immersive = useIsImmersive();
    const [layouts, track] = useNavLayouts();
    const { update } = useUpdate();
    const onlyGenre = filters.genre.length === 1 && activeCount(filters) === 1 && filters.genre[0];
    const down = top.name === "browse" ? "page" : "screen";
    const toastAction = (0, useRef)(null);
    const onAction = (action) => {
      if (action === "r2" && toastAction.current) {
        toastAction.current();
        return true;
      }
      if (action !== "l1" && action !== "r1") return false;
      setBrowsing(false);
      step(action === "r1");
      return true;
    };
    // Back at a page's root goes to the dock; from the dock, back into the page (`down`: its scope).
    const onBack = () => {
      if (!nav.pop()) nav.focusLater("nav:current");
      return true;
    };
    // The phone's shortcuts: each goes to its section.
    useRemoteShortcuts((action) => {
      setBrowsing(false);
      if (action === "settings") on.settings();
      else if (action === "home") on[HOMEBREW_ONLY ? "homebrew" : "discover"]();
      else if (action === "downloads") on.downloads();
      else if (action === "search") on.search();
      else if (action === "homebrew") on.homebrew();
    });
    const dockBack = () => {
      nav.focusLater(down);
      return true;
    };
    const item = (name, props) => /* @__PURE__ */ (0, jsx)(NavItem, { focusKey: keyOf(name), current: section === name, onLayout: track(name), nextFocusDown: down, ...props });
    const divider = /* @__PURE__ */ (0, jsx)(View, { style: { width: 2, height: 36, marginHorizontal: 9, borderRadius: radius.sm, backgroundColor: colors.line } });
    return /* @__PURE__ */ (0, jsxs)(FocusScope, { onAction, onBack, children: [
      children,
      /* @__PURE__ */ (0, jsx)(DownloadToast, { actionRef: toastAction }),
      /* @__PURE__ */ (0, jsx)(QuickPreview, {}),
      // The island: one floating glass bar at the top, centered. Pages start under it, so it never
      // covers what scrolls (and the engine keeps copying scrolled pixels instead of repainting).
      /* @__PURE__ */ (0, jsx)(motion.View, { initial: dockArrived ? false : { y: -logical(120) }, animate: { y: 0 }, transition: DOCK_DROP, onAnimationComplete: () => {
        dockArrived = true;
      }, style: immersive ? { position: "absolute", left: 0, right: 0, top: DOCK_TOP, zIndex: 40, display: "none" } : { position: "absolute", left: 0, right: 0, top: DOCK_TOP, zIndex: 40, alignItems: "center" }, children: /* @__PURE__ */ (0, jsx)(FocusScope, { focusKey: "header", inert: immersive, onBack: dockBack, children: /* @__PURE__ */ (0, jsxs)(View, { onLayout: (event) => {
        track("header")(event);
        const { x, width } = event.layout;
        dockMark.x = rtl ? x + width - MARK_INSET : x + MARK_INSET;
      }, style: { height: DOCK_HEIGHT, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.glassEdge, backgroundColor: colors.surface, paddingHorizontal: 18 }, children: [
        /* @__PURE__ */ (0, jsx)(NavPill, { section, layouts }),
        /* @__PURE__ */ (0, jsxs)(View, { focusKey: "nav:home", onPress: HOMEBREW_ONLY ? on.homebrew : on.discover, nextFocusDown: down, style: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, paddingHorizontal: 18, height: 60 }, children: [
          /* @__PURE__ */ (0, jsx)(FocusRing, { round: "full" }),
          /* @__PURE__ */ (0, jsx)(Logo, {}),
          HOMEBREW_ONLY ? null : /* @__PURE__ */ (0, jsx)(DockCount, {}),
          /* @__PURE__ */ (0, jsx)(VersionTab, {})
        ] }),
        divider,
        // 0.5.1: the homebrew-only edition's dock is the Homebrew section and Settings; the store's items are not in it.
        HOMEBREW_ONLY ? null : item("search", { icon: "search", label: t2("nav.search"), onPress: on.search }),
        /* @__PURE__ */ (0, jsx)(ButtonGlyph, { button: "l1" }),
        HOMEBREW_ONLY ? null : item("discover", { label: t2("nav.discover"), onPress: on.discover }),
        HOMEBREW_ONLY ? null : /* @__PURE__ */ (0, jsxs)(View, { style: { position: "relative" }, children: [
          item("catalog", { label: t2("nav.browse"), trailing: browsing ? "chevronUp" : "chevronDown", onPress: () => setBrowsing((open) => !open) }),
          /* @__PURE__ */ (0, jsxs)(Menu, { open: browsing, onClose: () => setBrowsing(false), rows: genres.length + 2, children: [
            /* @__PURE__ */ (0, jsx)(
              MenuItem,
              {
                label: t2("nav.allGames"),
                checked: section === "catalog" && !filters.genre.length,
                autoFocus: !onlyGenre,
                onSelect: () => on.show(NO_FILTERS, "relevance")
              }
            ),
            /* @__PURE__ */ (0, jsx)(MenuDivider, {}),
            genres.map(
              (genre) => /* @__PURE__ */ (0, jsx)(
                MenuItem,
                {
                  label: genreLabel(genre),
                  checked: onlyGenre === genre,
                  onSelect: () => on.show({ ...NO_FILTERS, genre: [genre] }, "relevance")
                },
                genre
              )
            )
          ] })
        ] }),
        HOMEBREW_ONLY ? null : item("top", { label: t2("nav.top"), onPress: on.top }),
        HOMEBREW_ONLY ? null : item("new", { label: t2("nav.new"), onPress: on.new }),
        HOMEBREW_ONLY ? null : divider,
        /* @__PURE__ */ (0, jsx)(HomebrewNavItem, { item, onPress: on.homebrew }),
        divider,
        HOMEBREW_ONLY ? null : item("favorites", { icon: "heart", label: favorites ? String(favorites) : null, caption: t2("filters.favorites"), onPress: on.favorites }),
        HOMEBREW_ONLY ? null : item("downloads", { icon: "download", caption: t2("downloads.title"), onPress: on.downloads, children: BADGE }),
        HOMEBREW_ONLY ? null : item("files", { icon: "grid", caption: t2("game.back.browse"), onPress: on.files }),
        update ? /* @__PURE__ */ (0, jsx)(UpdateNavItem, { update, down }) : null,
        // MODIFIED (0.5.0 Pre Release 3): Settings is a section like the others (ui/Settings.jsx), not a
        // screen over the page.
        item("settings", { icon: "settings", caption: t2("settings.title"), onPress: on.settings, ...focusEnd(rtl, keyOf("settings")) }),
        /* @__PURE__ */ (0, jsx)(ButtonGlyph, { button: "r1" })
      ] }) }) })
    ] });
  }

export { Header };
