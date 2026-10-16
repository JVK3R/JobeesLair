// ../pub-game-store/native/ui/CdnAura.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: the pastel foil, orbiting highlight and sparkle marks that dressed the CDN rows are gone. A CDN
// source is marked like any other: with a small square tag in the accent. The exports remain so the call sites
// need no change; CdnAura and CdnMark draw nothing.

import { jsx } from 'react/jsx-runtime';
import { View } from '@ps5-react/core';
import { colors } from './colors.js';
import { px } from './scale.js';

  function CdnAura() {
    return null;
  }
  function CdnMark() {
    return null;
  }
  function CdnSpark({ size = 14 }) {
    const side = Math.max(6, Math.round(size / 2));
    return /* @__PURE__ */ (0, jsx)(View, { style: { width: px(side), height: px(side), backgroundColor: colors.accentHi } });
  }

export { CdnAura, CdnMark, CdnSpark };
