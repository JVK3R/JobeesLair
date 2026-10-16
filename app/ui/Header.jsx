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
import { Settings } from './Settings.jsx';
import { Logo } from './Logo.jsx';
import { QuickPreview } from './QuickPreview.jsx';
import { Menu, MenuDivider, MenuItem } from './Menu.jsx';
import { NavItem } from './NavItem.jsx';
import { NavPill, useNavLayouts } from './NavPill.jsx';
import { useSections } from './useSections.js';
import { DockCount } from './LibraryCount.jsx';
import { useRemoteShortcuts } from '../companion/remote.js';
import { FocusScope, View } from '@ps5-react/core';
import '../assets/JetBrainsMono-Regular.ttf';
import { colors, radius } from './colors.js';

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
  function Header({ children }) {
    const t2 = useT();
    const { rtl } = useLocale();
    const { section, filters, on, step, keyOf } = useSections();
    const wishlist = useWishlist();
    const favorites = wishlist.filter((id) => getGame(id)).length;
    const nav = useNavActions();
    const { top } = useNavState();
    const [browsing, setBrowsing] = (0, useState)(false);
    const [choosingLanguage, setChoosingLanguage] = (0, useState)(false);
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
      if (action === "r1" && section === "files") setChoosingLanguage(true);
      else
        step(action === "r1");
      return true;
    };
    // Back at a page's root goes to the dock; from the dock, back into the page (`down`: its scope).
    const onBack = () => {
      if (!nav.pop()) nav.focusLater("nav:current");
      return true;
    };
    // The phone's shortcuts: Settings opens over the page; the others close it and go to their section.
    useRemoteShortcuts((action) => {
      if (action === "settings") return setChoosingLanguage(true);
      setChoosingLanguage(false);
      setBrowsing(false);
      if (action === "home") on.discover();
      else if (action === "downloads") on.downloads();
      else if (action === "search") on.search();
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
      choosingLanguage ? /* @__PURE__ */ (0, jsx)(Settings, { onClose: () => setChoosingLanguage(false) }) : null,
      /* @__PURE__ */ (0, jsx)(QuickPreview, {}),
      // The island: one floating glass bar at the top, centered. Pages start under it, so it never
      // covers what scrolls (and the engine keeps copying scrolled pixels instead of repainting).
      /* @__PURE__ */ (0, jsx)(View, { style: immersive ? { position: "absolute", left: 0, right: 0, top: DOCK_TOP, zIndex: 40, display: "none" } : { position: "absolute", left: 0, right: 0, top: DOCK_TOP, zIndex: 40, alignItems: "center" }, children: /* @__PURE__ */ (0, jsx)(FocusScope, { focusKey: "header", inert: immersive, onBack: dockBack, children: /* @__PURE__ */ (0, jsxs)(View, { onLayout: track("header"), style: { height: DOCK_HEIGHT, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.glassEdge, backgroundColor: colors.surface, paddingHorizontal: 18 }, children: [
        /* @__PURE__ */ (0, jsx)(NavPill, { section, layouts }),
        /* @__PURE__ */ (0, jsxs)(View, { focusKey: "nav:home", onPress: on.discover, nextFocusDown: down, style: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, paddingHorizontal: 18, height: 60 }, children: [
          /* @__PURE__ */ (0, jsx)(FocusRing, { round: "full" }),
          /* @__PURE__ */ (0, jsx)(Logo, {}),
          /* @__PURE__ */ (0, jsx)(DockCount, {})
        ] }),
        divider,
        item("search", { icon: "search", label: t2("nav.search"), onPress: on.search }),
        /* @__PURE__ */ (0, jsx)(ButtonGlyph, { button: "l1" }),
        item("discover", { label: t2("nav.discover"), onPress: on.discover }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { position: "relative" }, children: [
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
        item("top", { label: t2("nav.top"), onPress: on.top }),
        item("new", { label: t2("nav.new"), onPress: on.new }),
        divider,
        item("favorites", { icon: "heart", label: favorites ? String(favorites) : null, onPress: on.favorites }),
        item("downloads", { icon: "download", onPress: on.downloads, children: BADGE }),
        item("files", { icon: "grid", onPress: on.files }),
        update ? /* @__PURE__ */ (0, jsx)(UpdateNavItem, { update, down }) : null,
        /* @__PURE__ */ (0, jsx)(
          NavItem,
          {
            focusKey: "nav:language",
            icon: "settings",
            onPress: () => setChoosingLanguage(true),
            nextFocusDown: down,
            ...focusEnd(rtl, "nav:language")
          }
        ),
        /* @__PURE__ */ (0, jsx)(ButtonGlyph, { button: "r1" })
      ] }) }) })
    ] });
  }

export { Header };
