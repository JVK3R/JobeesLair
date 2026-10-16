// ../pub-game-store/native/browse/GenreCard.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { memo } from 'react';
import { useT } from '../i18n/index.js';
import { genreLabel } from '../state/catalog.js';
import { Cover } from '../ui/Cover.jsx';
import { FocusFrame } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Shine } from '../ui/Shine.jsx';
import { colors, radius } from '../ui/colors.js';
import { EASE_OUT } from '../ui/ease.js';
import { Text, View, motion, useIsFocused } from '@ps5-react/core';

  var spread = { type: "tween", duration: 0.3, ease: EASE_OUT };
  var cover = { width: 126, height: 168, borderRadius: radius.sm };
  var side = { width: 113, height: 151, borderRadius: radius.sm };
  var front = { position: "absolute", left: 87, top: 24, zIndex: 10 };
  var OPEN = [-12.6, 12.6];
  function Fan({ covers }) {
    const focused = useIsFocused();
    return covers.slice(1).map(
      (game, index) => /* @__PURE__ */ (0, jsx)(
        motion.View,
        {
          style: index === 0 ? { position: "absolute", left: 18, top: 32 } : { position: "absolute", left: 169, top: 32 },
          initial: false,
          animate: { x: focused ? OPEN[index] : 0 },
          transition: spread,
          children: /* @__PURE__ */ (0, jsx)(Cover, { game, style: side, label: false })
        },
        game.id
      )
    );
  }
  var GenreCard = (0, memo)(function GenreCard2({ genre, count, covers, active: active2, onToggle }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(
      motion.View,
      {
        focusKey: `genre:${genre}`,
        onPress: () => onToggle(genre),
        selected: active2,
        transition: spread,
        style: (_state) => [{ width: 300, borderRadius: radius.lg, backgroundColor: colors.surface, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 216 }, active2 ? { backgroundColor: colors.surface2 } : null, _state.focused ? { backgroundColor: colors.surface2 } : null],
        children: [
          /* @__PURE__ */ (0, jsx)(Fan, { covers }),
          covers[0] && /* @__PURE__ */ (0, jsx)(Cover, { game: covers[0], style: [cover, front], label: false }),
          active2 && /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", right: 18, top: 18, zIndex: 20, width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.xs, backgroundColor: colors.accent }, children: /* @__PURE__ */ (0, jsx)(Icon, { name: "check", size: 14, strokeWidth: 3, color: colors.canvas }) }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 24, color: colors.fg, lineHeight: 36 }, children: genreLabel(genre) }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.subtle, lineHeight: 30 }, children: t2("catalog.gameCount", { count }) }),
          /* @__PURE__ */ (0, jsx)(Shine, { width: 200, round: "xl" }),
          /* @__PURE__ */ (0, jsx)(FocusFrame, { round: "xl" })
        ]
      }
    );
  });

export { GenreCard };
