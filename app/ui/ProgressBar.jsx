// ../pub-game-store/native/ui/ProgressBar.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: industrial: a flat fill in the accent while active, grey when not; nothing pulses (the width is the data).

import { jsx } from 'react/jsx-runtime';
import { useLocale } from '../i18n/index.js';
import { px } from './scale.js';
import { View, motion } from '@ps5-react/core';
import { colors, radius } from './colors.js';

  var glide = { type: "tween", duration: 0.05, ease: "linear" };
  function ProgressBar({ fraction, width, active: active2 }) {
    const { rtl } = useLocale();
    return /* @__PURE__ */ (0, jsx)(View, { style: [{ height: 6, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surface2 }, { width: px(width) }], children: /* @__PURE__ */ (0, jsx)(
      motion.View,
      {
        style: active2 ? { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.accent } : { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.subtle },
        initial: false,
        animate: { x: (rtl ? 1 : -1) * (1 - fraction) * width },
        transition: glide,
        children: null
      }
    ) });
  }

export { ProgressBar, glide };
