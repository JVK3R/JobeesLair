// ../pub-game-store/native/ui/NavPill.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Jobee'sLair: a raised capsule that glides under the current section (one smooth spring), with a
// short accent underline; sized for the floating dock.

import { jsx, jsxs } from 'react/jsx-runtime';
import { useRef, useState } from 'react';
import { logical } from './scale.js';
import { View, motion } from '@ps5-react/core';
import { colors, radius } from './colors.js';

  var slide2 = { x: { type: "spring", stiffness: 420, damping: 38, mass: 1 }, opacity: { type: "tween", duration: 0.15 } };
  function useNavLayouts() {
    const [layouts, setLayouts] = (0, useState)({});
    const handlers = (0, useRef)({}).current;
    const track = (name) => handlers[name] ?? (handlers[name] = (event) => {
      const { x, width } = event.layout;
      setLayouts((current) => current[name]?.x === x && current[name]?.width === width ? current : { ...current, [name]: { x, width } });
    });
    return [layouts, track];
  }
  function NavPill({ section, layouts }) {
    const last = (0, useRef)(null);
    const item = layouts[section];
    if (item && layouts.header) last.current = { x: logical(item.x - layouts.header.x), width: item.width };
    if (!last.current) return null;
    return /* @__PURE__ */ (0, jsxs)(
      motion.View,
      {
        style: [{ position: "absolute", left: 0, top: 10, height: 60, borderRadius: radius.pill, backgroundColor: colors.surface3 }, { width: last.current.width }],
        initial: false,
        animate: { x: last.current.x, opacity: item ? 1 : 0 },
        transition: slide2,
        children: /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", left: 0, right: 0, bottom: 7, alignItems: "center" }, children: /* @__PURE__ */ (0, jsx)(View, { style: { width: 28, height: 3, borderRadius: radius.pill, backgroundColor: colors.accentHi } }) })
      }
    );
  }

export { NavPill, useNavLayouts };
