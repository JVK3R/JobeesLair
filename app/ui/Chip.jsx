// ../pub-game-store/native/ui/Chip.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useLocale } from '../i18n/index.js';
import { FocusRing } from './FocusRing.jsx';
import { Icon } from './Icon.jsx';
import { colors, radius } from './colors.js';
import { Text, View } from '@ps5-react/core';

  function Chip({ label, onPress, focusKey }) {
    const { rtl } = useLocale();
    return /* @__PURE__ */ (0, jsxs)(View, { focusKey, onPress, style: [
      { height: 60, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: radius.md, backgroundColor: colors.accent },
      rtl ? { paddingRight: 24, paddingLeft: 18 } : { paddingLeft: 24, paddingRight: 18 }
    ], children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, { round: "md" }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, fontWeight: 600, color: "#ffffff", lineHeight: 30 }, children: label }),
      /* @__PURE__ */ (0, jsx)(Icon, { name: "x", size: 14, color: colors.canvas })
    ] });
  }

export { Chip };
