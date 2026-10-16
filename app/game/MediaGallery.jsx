// ../pub-game-store/native/game/MediaGallery.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { SHOT, THUMB } from './art.js';
import { useT } from '../i18n/index.js';
import { FocusFrame } from '../ui/FocusRing.jsx';
import { HINT, useHints } from '../ui/Legend.jsx';
import { FocusScope, Image, Text, View, motion } from '@ps5-react/core';
import { colors, radius } from '../ui/colors.js';

  var HINTS6 = [{ button: "cross", label: "hints.view" }, HINT.back, HINT.favorite, HINT.sections];
  function MainShot({ shots, index }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { style: [{ position: "relative", overflow: "hidden", roundedClip: true, borderRadius: radius.sm, backgroundColor: colors.surface2 }, SHOT], children: [
      /* @__PURE__ */ (0, jsx)(Image, { source: { uri: shots[index].url }, style: [{ borderRadius: radius.sm }, SHOT], resizeMode: "cover" }),
      /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", right: 24, bottom: 24, borderRadius: radius.sm, backgroundColor: `${colors.canvas}b3`, paddingHorizontal: 15, paddingVertical: 6 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.fg, lineHeight: 30 }, children: t2("game.shotPosition", { index: index + 1, total: shots.length }) }) })
    ] });
  }
  function MediaGallery({ shots, nextDown, onOpen }) {
    const [index, setIndex] = (0, useState)(0);
    const [inside, setInside] = (0, useState)(false);
    useHints(inside ? HINTS6 : null);
    (0, useEffect)(() => {
      for (const shot of shots.slice(1)) Image.prefetch(shot.url, SHOT).catch(() => {
      });
    }, [shots]);
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: { width: 1308 }, children: [
      /* @__PURE__ */ (0, jsx)(MainShot, { shots, index }),
      /* @__PURE__ */ (0, jsx)(FocusScope, { focusKey: "game:shots", children: /* @__PURE__ */ (0, jsx)(View, { style: { marginTop: 18, flexDirection: "row", gap: 12 }, children: shots.map(
        (shot, i) => /* @__PURE__ */ (0, jsxs)(
          View,
          {
            focusKey: `game:shot:${i}`,
            onPress: () => onOpen(i),
            onFocus: () => {
              setIndex(i);
              setInside(true);
            },
            onBlur: () => setInside(false),
            nextFocusDown: nextDown,
            style: { position: "relative", width: 192, height: 108 },
            children: [
              /* @__PURE__ */ (0, jsx)(
                motion.View,
                {
                  style: { width: 192, height: 108, overflow: "hidden", roundedClip: true, borderRadius: radius.md },
                  initial: false,
                  animate: { opacity: i === index ? 1 : 0.45 },
                  transition: { duration: 0.2 },
                  children: /* @__PURE__ */ (0, jsx)(Image, { source: { uri: shot.thumb }, style: [{ borderRadius: radius.sm, backgroundColor: colors.surface2 }, THUMB], resizeMode: "cover" })
                }
              ),
              /* @__PURE__ */ (0, jsx)(FocusFrame, {})
            ]
          },
          shot.url
        )
      ) }) })
    ] });
  }

export { MediaGallery };
