// ../pub-game-store/native/ui/ProgressBar.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: industrial: a flat fill in the accent while active, grey when not; nothing pulses (the width is the data).

import { jsx } from 'react/jsx-runtime';
import { useLocale } from '../i18n/index.js';
import { px } from './scale.js';
import { View } from '@ps5-react/core';
import { colors, radius } from './colors.js';

  var glide = { type: "tween", duration: 0.05, ease: "linear" };
  // MODIFIED (Jobee'sLair 0.5.1): the fill is a view as wide as the progress, not the whole bar translated
  // left and clipped. The engine applies transforms only to elements up to 512 px a side (scale.js
  // TRANSFORM_PX) and clips nothing it translates, so the update dialog's 756 px bar drew its fill across
  // the whole dialog and past it. A width needs neither.
  function ProgressBar({ fraction, width, active: active2 }) {
    const { rtl } = useLocale();
    const filled = px(Math.max(0, Math.min(1, Number(fraction) || 0)) * width);
    return /* @__PURE__ */ (0, jsx)(View, { style: [{ height: 6, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surface2 }, { width: px(width) }], children: /* @__PURE__ */ (0, jsx)(View, { style: [{ position: "absolute", top: 0, bottom: 0, width: filled, borderRadius: radius.pill, backgroundColor: active2 ? colors.accent : colors.subtle }, rtl ? { right: 0 } : { left: 0 }] }) });
  }

export { ProgressBar, glide };
