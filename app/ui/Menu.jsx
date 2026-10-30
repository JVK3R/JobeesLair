// ../pub-game-store/native/ui/Menu.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: `placement: "above"` opens it upward (Settings' language menu); graphite glass, square.
// MODIFIED (0.5.4): the focused item gets the accent frame (FocusInset), not only a lighter row.

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { createContext, useContext } from 'react';
import { useLocale } from '../i18n/index.js';
import { FocusInset } from './FocusRing.jsx';
import { Icon } from './Icon.jsx';
import { colors, radius } from './colors.js';
import { EASE_OUT } from './ease.js';
import { canScale } from './scale.js';
import { AnimatePresence, FocusScope, ScrollView, Text, View, motion, useIsFocused } from '@ps5-react/core';

  var CloseContext = (0, createContext)(null);
  var MAX_HEIGHT = 512;
  function Menu({ open, onClose, align = "left", placement = "below", rows, children }) {
    const { rtl } = useLocale();
    const left = align === "left" !== rtl;
    const above = placement === "above";
    const pop = canScale(240, Math.min(rows * 36 + 8, MAX_HEIGHT)) ? 0.98 : 1;
    const close = () => {
      onClose();
      return true;
    };
    return /* @__PURE__ */ (0, jsx)(AnimatePresence, { children: open && /* @__PURE__ */ (0, jsx)(
      motion.View,
      {
        style: [
          { position: "absolute", zIndex: 50, width: 360, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 6 },
          left ? { left: 0 } : { right: 0 },
          // Above its anchor (a menu low on its page) or below it, growing out of the anchor's edge.
          above ? { bottom: "100%", marginBottom: 12, transformOrigin: [left ? 0 : 1, 1] } : { top: "100%", marginTop: 9, transformOrigin: [left ? 0 : 1, 0] }
        ],
        initial: { opacity: 0, y: above ? 8 : -6, scale: pop },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: above ? 6 : -4, transition: { type: "tween", duration: 0.1, ease: "easeIn" } },
        transition: { type: "tween", duration: 0.18, ease: EASE_OUT },
        children: /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, onBack: close, children: /* @__PURE__ */ (0, jsx)(ScrollView, { style: { maxHeight: 768 }, children: /* @__PURE__ */ (0, jsx)(CloseContext.Provider, { value: onClose, children }) }) })
      },
      "menu"
    ) });
  }
  function ItemContent({ label, checked }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(Text, { focused, selected: checked, style: [{ flex: 1, fontFamily: "Exo2", fontSize: 21, color: colors.muted, numberOfLines: 1, ellipsizeMode: "tail", lineHeight: 30 }, checked ? { color: colors.fg } : null, focused ? { color: colors.fg } : null], children: label }),
      checked && /* @__PURE__ */ (0, jsx)(Icon, { name: "check", color: colors.fg })
    ] });
  }
  function MenuItem({ label, checked = false, autoFocus = false, onSelect }) {
    const close = (0, useContext)(CloseContext);
    return /* @__PURE__ */ (0, jsxs)(View, { autoFocus: checked || autoFocus, onPress: () => {
      onSelect();
      close();
    }, style: (_state) => [{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 36, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 12 }, _state.focused ? { backgroundColor: colors.surface3 } : null], children: [
      /* @__PURE__ */ (0, jsx)(FocusInset, { radius: radius.sm }),
      /* @__PURE__ */ (0, jsx)(ItemContent, { label, checked })
    ] });
  }
  var MenuDivider = () => /* @__PURE__ */ (0, jsx)(View, { style: { marginVertical: 6, height: 2, backgroundColor: colors.line } });

export { Menu, MenuDivider, MenuItem };
