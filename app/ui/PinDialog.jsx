// Choosing the phone companion's PIN, on the console. Six digits on a keypad, entered twice: the first
// time it is checked (no run of one digit, no straight sequence), the second must match. ✕ enters a digit,
// □ deletes one, ○ cancels. A phone cannot set the PIN, so a console that has never had one cannot be
// claimed by whoever reaches port 34177 first. `onDone(pin)` saves it (companion/service.js choosePin) and
// may throw a message key, which is shown here; the dialog closes after it returns.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { pinProblem } from '../companion/service.js';
import { useT } from '../i18n/index.js';
import { ButtonGlyph } from './ButtonHints.jsx';
import { FocusRing } from './FocusRing.jsx';
import { colors, radius } from './colors.js';
import { FocusScope, Text, View, motion, useIsFocused } from '@ps5-react/core';

  var DIGITS = 6;
  var SETTLE_MS = 160;
  var ENTER = { type: "tween", duration: 0.24, ease: [0.22, 1, 0.36, 1] };
  var KEYS = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["clear", "0", "delete"]];
  var mono = (size, color) => ({ fontFamily: "JetBrainsMono-Regular", fontSize: size, lineHeight: Math.round(size * 1.3), color });
  var sans = (size, color, extra) => ({ fontFamily: "Exo2", fontSize: size, lineHeight: Math.round(size * 1.4), color, ...extra });
  function KeyFace({ value, label }) {
    const focused = useIsFocused();
    const color = focused ? colors.accentFg : colors.fg;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { alignItems: "center", justifyContent: "center" }, children: [
      value.length === 1 ? /* @__PURE__ */ (0, jsx)(Text, { style: mono(36, color), children: value }) : /* @__PURE__ */ (0, jsx)(Text, { style: sans(22, focused ? colors.accentFg : colors.muted, { fontWeight: 600 }), children: label })
    ] });
  }
  function Key({ value, label, onKey, autoFocus }) {
    return /* @__PURE__ */ (0, jsx)(motion.View, {
      focusKey: `pin:${value}`,
      autoFocus,
      onPress: () => onKey(value),
      initial: false,
      whilePress: { scale: 0.95 },
      transition: { type: "tween", duration: 0.1, ease: "easeOut" },
      style: (_state) => [{ width: 150, height: 80, alignItems: "center", justifyContent: "center", borderRadius: radius.md }, _state.focused ? { backgroundColor: colors.accent } : { backgroundColor: colors.surface3 }],
      children: [/* @__PURE__ */ (0, jsx)(FocusRing, { round: "md" }, "ring"), /* @__PURE__ */ (0, jsx)(KeyFace, { value, label }, "face")]
    });
  }
  function PinDialog({ mode = "create", onDone, onClose }) {
    const t2 = useT();
    const [stage, setStage] = (0, useState)(0);
    const [entry, setEntry] = (0, useState)("");
    const [first, setFirst] = (0, useState)("");
    const [error2, setError] = (0, useState)("");
    const timer = (0, useRef)(null);
    (0, useEffect)(() => () => clearTimeout(timer.current), []);
    const restart = (message) => {
      setStage(0);
      setFirst("");
      setEntry("");
      setError(message);
    };
    // The sixth digit is shown for a moment, then the entry is judged.
    const settle = (pin) => {
      timer.current = setTimeout(() => {
        if (stage === 0) {
          const refused = pinProblem(pin);
          if (refused) return restart(t2(refused));
          setFirst(pin);
          setEntry("");
          setStage(1);
          return;
        }
        if (pin !== first) return restart(t2("pin.mismatch"));
        try {
          onDone(pin);
        } catch (failure) {
          return restart(t2(failure.message));
        }
        onClose();
      }, SETTLE_MS);
    };
    const onKey = (value) => {
      if (value === "delete" || value === "clear") {
        clearTimeout(timer.current);
        return void setEntry((current) => value === "clear" ? "" : current.slice(0, -1));
      }
      if (entry.length >= DIGITS) return;
      const next = entry + value;
      setEntry(next);
      setError("");
      if (next.length === DIGITS) settle(next);
    };
    return /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: () => {
      onClose();
      return true;
    }, onAction: (action) => {
      if (action === "square") onKey("delete");
      return true;
    }, children: /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 60, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.canvas}f2` }, children: /* @__PURE__ */ (0, jsxs)(motion.View, {
      initial: { opacity: 0, y: 24 },
      animate: { opacity: 1, y: 0 },
      transition: ENTER,
      style: { width: 640, alignItems: "center", gap: 26, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 56, paddingVertical: 48 },
      children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: sans(38, colors.fg, { fontWeight: 600 }), children: t2(stage === 0 ? mode === "change" ? "pin.title.change" : "pin.title.create" : "pin.title.confirm") }),
          /* @__PURE__ */ (0, jsx)(Text, { style: sans(21, colors.muted, { textAlign: "center", width: 520 }), children: t2(stage === 0 ? "pin.detail.create" : "pin.detail.confirm") })
        ] }),
        /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", gap: 12 }, children: Array.from({ length: DIGITS }, (_, index) => /* @__PURE__ */ (0, jsx)(View, { style: { width: 70, height: 84, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.canvas2, borderWidth: index === entry.length ? 2 : 1, borderColor: index === entry.length ? colors.accentHi : colors.line }, children: /* @__PURE__ */ (0, jsx)(Text, { style: mono(42, colors.fg), children: entry[index] ?? "" }) }, index)) }),
        /* @__PURE__ */ (0, jsx)(Text, { style: sans(20, "#f87171", { textAlign: "center", width: 520, numberOfLines: 2 }), children: error2 || " " }),
        /* @__PURE__ */ (0, jsx)(FocusScope, { wrap: true, children: /* @__PURE__ */ (0, jsx)(View, { style: { gap: 12 }, children: KEYS.map((row) => /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", gap: 12 }, children: row.map((value) => /* @__PURE__ */ (0, jsx)(Key, { value, label: t2(value === "clear" ? "pin.clear" : "pin.delete"), onKey, autoFocus: value === "5" }, value)) }, row[0])) }) }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 28 }, children: [
          /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 9 }, children: [/* @__PURE__ */ (0, jsx)(ButtonGlyph, { button: "cross", size: 18 }), /* @__PURE__ */ (0, jsx)(Text, { style: sans(20, colors.muted), children: t2("pin.hint.enter") })] }),
          /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 9 }, children: [/* @__PURE__ */ (0, jsx)(ButtonGlyph, { button: "square", size: 18 }), /* @__PURE__ */ (0, jsx)(Text, { style: sans(20, colors.muted), children: t2("pin.hint.delete") })] }),
          /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 9 }, children: [/* @__PURE__ */ (0, jsx)(ButtonGlyph, { button: "circle", size: 18 }), /* @__PURE__ */ (0, jsx)(Text, { style: sans(20, colors.muted), children: t2("pin.hint.cancel") })] })
        ] })
      ]
    }) }) });
  }

export { PinDialog };
