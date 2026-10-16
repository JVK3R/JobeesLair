// ../pub-game-store/native/ui/Button.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Jobee'sLair buttons. Rounded (radius.md), flat fills: the primary is the theme's accent and
// brightens when focused; the secondary is a raised surface; the outline sits solid over any art; the ghost
// is text alone. A press eases the button in by 3 % and back. Focus draws the accent frame (FocusRing).

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { FocusRing } from './FocusRing.jsx';
import { Icon } from './Icon.jsx';
import { colors, radius } from './colors.js';
import { Text, motion, useIsFocused } from '@ps5-react/core';

  var BASE = { flexDirection: "row", flexShrink: 0, alignItems: "center", justifyContent: "center", gap: 12, borderRadius: radius.md };
  var SIZE2 = { sm: { height: 48, paddingHorizontal: 20 }, md: { height: 60, paddingHorizontal: 28 }, lg: { height: 72, paddingHorizontal: 34 }, icon: { width: 60, height: 60 } };
  // The fills follow the theme's accent (colors.js): built again only when the accent changes.
  var boxes = (accent, hi) => ({
    primary: { backgroundColor: accent },
    secondary: { backgroundColor: colors.surface3 },
    // Over light art a bare line vanishes: a solid near-black fill keeps the button readable anywhere.
    outline: { borderWidth: 1, borderColor: colors.glassEdge, backgroundColor: colors.canvas2 },
    ghost: null,
    focused: { primary: { backgroundColor: hi }, secondary: { backgroundColor: "#27344d" }, outline: { backgroundColor: colors.surface3 }, ghost: { backgroundColor: colors.surface2 } }
  });
  var tinted = null;
  function looks() {
    if (!tinted || tinted.accent !== colors.accent || tinted.hi !== colors.accentHi) tinted = { accent: colors.accent, hi: colors.accentHi, box: boxes(colors.accent, colors.accentHi) };
    return tinted.box;
  }
  var TEXT = { fontFamily: "Exo2", fontWeight: 600, letterSpacing: 0.2 };
  var TEXT_SIZE = { sm: { fontSize: 21, lineHeight: 30 }, md: { fontSize: 22, lineHeight: 30 }, lg: { fontSize: 24 }, icon: { fontSize: 21, lineHeight: 30 } };
  var press2 = { scale: 0.97 };
  var pressMotion = { type: "tween", duration: 0.12, ease: "easeOut" };
  var ink = (variant, focused) => variant === "primary" ? colors.accentFg : variant === "ghost" && !focused ? colors.muted : colors.fg;
  function Content({ variant, size, label, icon, iconFill }) {
    const focused = useIsFocused();
    const color = ink(variant, focused);
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      icon && /* @__PURE__ */ (0, jsx)(Icon, { name: icon, size: size === "icon" ? 22 : 18, color, fill: iconFill ? color : "none" }),
      label && /* @__PURE__ */ (0, jsx)(Text, { style: [TEXT, TEXT_SIZE[size], { color }], children: label })
    ] });
  }
  function Button2({ variant = "secondary", size = "md", label, icon, iconFill, children, onPress, style, ...rest2 }) {
    return /* @__PURE__ */ (0, jsxs)(
      motion.View,
      {
        ...rest2,
        onPress,
        whilePress: press2,
        transition: pressMotion,
        style: ({ focused }) => {
          const box = looks();
          return [BASE, SIZE2[size], box[variant], focused && box.focused[variant], style];
        },
        children: [
          /* @__PURE__ */ (0, jsx)(FocusRing, {}),
          children,
          /* @__PURE__ */ (0, jsx)(Content, { variant, size, label, icon, iconFill })
        ]
      }
    );
  }

export { Button2 };
