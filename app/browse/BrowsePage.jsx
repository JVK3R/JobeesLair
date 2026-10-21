// ../pub-game-store/native/browse/BrowsePage.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: no folder-install migration notice; this build has no updates to migrate for.
// MODIFIED: Jobee'sLair's library: a full-width hero, then swimlanes (Featured and Homebrew as wide
// banner cards), then the whole library; the ranked chart lists are gone.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { memo, useState } from 'react';
import { Catalog } from './Catalog.jsx';
import { CdnRail } from './CdnRail.jsx';
import { ContinueRow } from './ContinueRow.jsx';
import { FilterDrawer } from './FilterDrawer.jsx';
import { GenreRail } from './GenreRail.jsx';
import { PageHints } from './PageHints.jsx';
import { PopularRail } from './PopularRail.jsx';
import { RecentRow } from './RecentRow.jsx';
import { Spotlight } from './Spotlight.jsx';
import { FeaturedLane, HomebrewLane, ReadyLane, RecentLane, TopLane } from './Lanes.jsx';
import { useT } from '../i18n/index.js';
import { StoreFreeze } from '../state/store.jsx';
import { useFavoriteAction } from '../ui/GameCard.jsx';
import { Logo } from '../ui/Logo.jsx';
import { colors } from '../ui/colors.js';
import { FocusScope, ScrollView, Text, View } from '@ps5-react/core';

  function Footer() {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { marginHorizontal: -48, marginTop: 120, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 2, borderColor: colors.line, paddingHorizontal: 48, paddingVertical: 48 }, children: [
      /* @__PURE__ */ (0, jsx)(Logo, { color: colors.muted }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.subtle, lineHeight: 30 }, children: t2("browse.footer") })
    ] });
  }
  var Sections = (0, memo)(function Sections2({ onOpenFilters }) {
    const onAction = useFavoriteAction();
    return /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, onAction, children: /* @__PURE__ */ (0, jsxs)(ScrollView, { style: { flex: 1, gap: 60, paddingHorizontal: 48 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: { gap: 24, paddingTop: 24 }, children: [
        /* @__PURE__ */ (0, jsx)(Spotlight, {})
      ] }),
      /* @__PURE__ */ (0, jsx)(FeaturedLane, {}),
      /* @__PURE__ */ (0, jsx)(ReadyLane, {}),
      /* @__PURE__ */ (0, jsx)(ContinueRow, {}),
      /* @__PURE__ */ (0, jsx)(PopularRail, {}),
      /* @__PURE__ */ (0, jsx)(RecentLane, {}),
      /* @__PURE__ */ (0, jsx)(HomebrewLane, {}),
      /* @__PURE__ */ (0, jsx)(TopLane, {}),
      /* @__PURE__ */ (0, jsx)(RecentRow, {}),
      /* @__PURE__ */ (0, jsx)(CdnRail, {}),
      /* @__PURE__ */ (0, jsx)(GenreRail, {}),
      /* @__PURE__ */ (0, jsx)(Catalog, { onOpenFilters }),
      /* @__PURE__ */ (0, jsx)(Footer, {})
    ] }) });
  });
  var BrowsePage = (0, memo)(function BrowsePage2() {
    const [open, setOpen] = (0, useState)(false);
    const [frozen, setFrozen] = (0, useState)(false);
    const [drawer] = (0, useState)(() => ({
      open: () => {
        setOpen(true);
        setFrozen(true);
      },
      close: () => setOpen(false),
      closed: () => setFrozen(false)
    }));
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(StoreFreeze, { frozen, children: /* @__PURE__ */ (0, jsx)(Sections, { onOpenFilters: drawer.open }) }),
      /* @__PURE__ */ (0, jsx)(FilterDrawer, { open, onClose: drawer.close, onClosed: drawer.closed }),
      /* @__PURE__ */ (0, jsx)(PageHints, {})
    ] });
  });

export { BrowsePage };
