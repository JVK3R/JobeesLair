// One app in the Homebrew section's rows and grids: its picture (HomebrewArt), its name, who made it and what
// it is, and where it stands on this console: installed, an update out, or installing with its progress.
// Focus lifts and grows it like the store's cards (sized so the engine scales it cheaply).
// MODIFIED (0.5.0 Pre Release 2): focus and the update badge in the section's own color (palette.js).

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useT } from '../i18n/index.js';
import { useHomebrewStatus } from '../state/homebrew-store.js';
import { roleOf } from '../state/homebrew-index.js';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { colors, radius } from '../ui/colors.js';
import { EASE_OUT } from '../ui/ease.js';
import { canScale } from '../ui/scale.js';
import { HomebrewArt } from './HomebrewArt.jsx';
import { hb } from './palette.js';
import { Text, View, motion, useIsFocused } from '@ps5-react/core';

  var TILE = 228;
  var CAPTION_HEIGHT = 96;
  var TILE_HEIGHT = TILE + CAPTION_HEIGHT;
  var focusMotion = { type: "tween", duration: 0.26, ease: EASE_OUT };
  var rest = { y: 0, scale: 1 };
  var lift = { y: -6, scale: 1.05 };
  var press = { scale: 0.97 };
  var SCALES = canScale(TILE / 1.5, TILE / 1.5);
  // Where it stands, on the art's top-left corner: an update (accent), installed (green), installing (its
  // percent), or failed (red).
  function StatusBadge({ id }) {
    const t2 = useT();
    const status = useHomebrewStatus(id);
    let label = null, background = `${colors.canvas}d9`, color = colors.fg, icon = null;
    if (status.task) {
      const percent = status.task.total ? Math.min(99, Math.floor(status.task.written / status.task.total * 100)) : null;
      label = status.task.phase === "waiting" ? t2("homebrew.badge.waiting") : percent === null || status.task.phase !== "downloading" ? t2("homebrew.badge.working") : `${percent}%`;
      icon = "download";
    } else if (status.failed) {
      label = t2("homebrew.badge.failed");
      background = "#b91c1ccc";
      icon = "alert";
    } else if (status.update) {
      label = t2("homebrew.badge.update");
      background = hb().accent;
      color = hb().fg;
      icon = "restart";
    } else if (status.installed) {
      label = t2("homebrew.badge.installed");
      icon = "check";
      color = "#4ade80";
    }
    if (!label) return null;
    return jsxs(View, { style: { position: "absolute", left: 12, top: 12, height: 36, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, backgroundColor: background, paddingHorizontal: 12 }, children: [
      jsx(Icon, { name: icon, size: 11, color }),
      jsx(Text, { style: { fontFamily: "Exo2", fontSize: 17, fontWeight: 600, lineHeight: 24, color }, children: label })
    ] });
  }
  function Face({ app }) {
    const t2 = useT();
    const focused = useIsFocused();
    const kind = roleOf(app.files[0]);
    return jsxs(Fragment, { children: [
      jsxs(motion.View, { initial: false, animate: SCALES ? focused ? lift : rest : { y: focused ? -6 : 0 }, transition: focusMotion, style: { width: TILE, height: TILE }, children: [
        jsx(FocusRing, { round: "lg", color: hb().hi }),
        jsx(HomebrewArt, { app, size: TILE }),
        jsx(StatusBadge, { id: app.id })
      ] }),
      jsxs(View, { style: { marginTop: 14, width: TILE, gap: 2 }, children: [
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 22, fontWeight: 600, lineHeight: 30, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, children: app.name }),
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 18, lineHeight: 25, color: focused ? hb().glow : colors.subtle, numberOfLines: 1, ellipsizeMode: "tail" }, children: `${t2(`homebrew.kind.${kind}`)} · ${app.author}` })
      ] })
    ] });
  }
  function HomebrewTile({ app, focusKey, onPress, rowEnd, ...rest2 }) {
    return jsx(motion.View, {
      ...rest2,
      ...rowEnd ? { nextFocusRight: focusKey } : {},
      focusKey,
      onPress,
      whilePress: SCALES ? press : void 0,
      transition: focusMotion,
      style: { width: TILE, height: TILE_HEIGHT },
      children: jsx(Face, { app })
    });
  }

export { HomebrewTile, TILE, TILE_HEIGHT };
