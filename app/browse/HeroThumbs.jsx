// The hero's slide picker: a strip of banner thumbnails over the hero's lower right (where the old side
// list stood beside it). Focusing one holds the timer at once and, once focus rests there (useSlides
// SETTLE_MS), shows its slide; the shown one carries the timer's progress and an ice-blue edge. 0.5.3: X opens
// the thumbnail's game (it only showed its slide, and the game was a trip back to View game away).

import { jsx, jsxs } from 'react/jsx-runtime';
import { memo, useMemo } from 'react';
import { SLIDE_MS } from './useSlides.js';
import { focusEnd, focusStart, useLocale } from '../i18n/index.js';
import { Cover } from '../ui/Cover.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { colors, radius } from '../ui/colors.js';
import { lightGame, unlight } from '../ui/lightBar.js';
import { Image, View, motion, useIsFocused } from '@ps5-react/core';

  var THUMB = { width: 176, height: 99 };
  function Progress({ left, paused }) {
    const { rtl } = useLocale();
    const sign = rtl ? -1 : 1;
    const x = -THUMB.width * left / SLIDE_MS * sign;
    return /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", left: 9, right: 9, bottom: 7, height: 4, overflow: "hidden", borderRadius: radius.pill, backgroundColor: "#ffffff2e" }, children: /* @__PURE__ */ (0, jsx)(
      motion.View,
      {
        style: { position: "absolute", top: 0, bottom: 0, left: 0, width: THUMB.width, backgroundColor: colors.glow },
        initial: { x: -THUMB.width * sign },
        animate: { x: paused ? x : 0 },
        transition: paused ? { type: "tween", duration: 0 } : { type: "tween", duration: left / 1e3, ease: "linear" }
      }
    ) });
  }
  function Face({ game, active, progress }) {
    const focused = useIsFocused();
    const box = { width: THUMB.width, height: THUMB.height, borderRadius: radius.sm };
    return /* @__PURE__ */ (0, jsxs)(View, { style: [box, { overflow: "hidden", borderWidth: 1, borderColor: active || focused ? colors.glow : "#ffffff26", backgroundColor: game.art.tint || colors.surface2, opacity: active || focused ? 1 : 0.72 }], children: [
      game.art.hero ? /* @__PURE__ */ (0, jsx)(Image, { source: { uri: game.art.hero }, resizeMode: "cover", style: [box, { position: "absolute", top: 0, left: 0 }] }) : /* @__PURE__ */ (0, jsx)(Cover, { game, label: false, style: box }),
      progress ? /* @__PURE__ */ (0, jsx)(Progress, { left: progress.left, paused: progress.paused }) : null
    ] });
  }
  var Thumb = (0, memo)(function Thumb2({ game, index, count, active, progress, select, focus, blur, open, nextFocusDown }) {
    const { rtl } = useLocale();
    return /* @__PURE__ */ (0, jsxs)(View, {
      focusKey: `spotlight:${index}`,
      selected: active,
      nextFocusUp: "nav:current",
      nextFocusDown,
      ...index === 0 ? focusStart(rtl, "spotlight:wish") : {},
      ...index === count - 1 ? focusEnd(rtl, `spotlight:${index}`) : {},
      onFocus: () => {
        focus(index);
        lightGame(`spotlight:${index}`, game);
      },
      onBlur: () => {
        blur();
        unlight(`spotlight:${index}`);
      },
      onPress: () => {
        select(index);
        open(index);
      },
      style: { position: "relative", borderRadius: radius.sm },
      children: [
        /* @__PURE__ */ (0, jsx)(FocusRing, { round: "md" }),
        /* @__PURE__ */ (0, jsx)(Face, { game, active, progress })
      ]
    });
  });
  function HeroThumbs({ games: games2, slides, open, nextFocusDown }) {
    const { active, left, paused, select, focus, blur } = slides;
    const progress = (0, useMemo)(() => ({ left, paused }), [left, paused]);
    return /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", gap: 14 }, children: games2.map(
      (game, index) => /* @__PURE__ */ (0, jsx)(
        Thumb,
        {
          game,
          index,
          count: games2.length,
          active: index === active,
          progress: index === active ? progress : null,
          select,
          focus,
          blur,
          open,
          nextFocusDown
        },
        game.id
      )
    ) });
  }

export { HeroThumbs };
