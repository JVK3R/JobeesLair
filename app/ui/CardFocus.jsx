// ../pub-game-store/native/ui/CardFocus.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: industrial focus. A focused card shows its platform tag and the solid accent frame, at once:
// no fade-in, no glass glare sweeping across the art.

import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { ShineBorder } from './FocusRing.jsx';
import { PlatformBadge } from './PlatformBadge.jsx';
import { View } from '@ps5-react/core';

  function CardFocus({ focused, platforms }) {
    if (!focused) return null;
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", bottom: 12, left: 12 }, children: /* @__PURE__ */ (0, jsx)(PlatformBadge, { platforms }) }),
      /* @__PURE__ */ (0, jsx)(ShineBorder, {})
    ] });
  }

export { CardFocus };
