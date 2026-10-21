// The search page's keyboard (0.5.0 Pre Release 3): a sheet that pops up over the bottom of the results while
// you type and closes when you search, so the grid gets the whole screen the rest of the time. Three wide rows
// (A–M, N–Z, the digits with space, delete, clear and search). Square deletes, Triangle types a space, L2
// clears, R2 or the search key searches, Circle closes it. Focus stays in it while it is open.
// Every key has a focus key ("key:a"), so the page can come back to the keyboard.

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { memo, useCallback } from 'react';
import { useT } from '../i18n/index.js';
import { edit } from './edit.js';
import { ButtonGlyph } from '../ui/ButtonHints.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { HINT, useHints } from '../ui/Legend.jsx';
import { colors, radius } from '../ui/colors.js';
import { FocusScope, Text, View, motion, useIsFocused } from '@ps5-react/core';

  var ROWS = ["ABCDEFGHIJKLM", "NOPQRSTUVWXYZ", "0123456789"].map((row) => row.split(""));
  var MAX_QUERY = 40;
  var KEY = 92, KEY_HEIGHT = 62, GAP = 10;
  var LTR = { direction: "ltr" };
  var HINTS = [
    { button: "cross", label: "hints.type" },
    { button: "square", label: "hints.delete" },
    { button: "triangle", label: "hints.space" },
    { button: "r2", label: "hints.search" },
    HINT.clear,
    { button: "circle", label: "hints.close" }
  ];
  var FIRST_KEY = "key:a";
  var rise = { type: "tween", duration: 0.22, ease: [0.22, 1, 0.36, 1] };
  function KeyFace({ label, icon, button }) {
    const focused = useIsFocused();
    useHints(focused ? HINTS : null);
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(FocusRing, { round: "md" }),
      icon ? /* @__PURE__ */ jsx(Icon, { name: icon, size: 18, color: focused ? colors.accentFg : colors.fg }) : null,
      label ? /* @__PURE__ */ jsx(Text, { style: { fontFamily: "Exo2", fontSize: 25, fontWeight: 600, lineHeight: 34, color: focused ? colors.accentFg : colors.fg }, children: label }) : null,
      button ? /* @__PURE__ */ jsx(ButtonGlyph, { button, size: 15 }) : null
    ] });
  }
  var Key = memo(function Key2({ label, icon, button, width = KEY, value, onKey, focusKey, autoFocus }) {
    return /* @__PURE__ */ jsx(View, { focusKey, autoFocus, onPress: () => onKey(value), style: (state) => [
      { position: "relative", width, height: KEY_HEIGHT, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surface3 },
      state.focused ? { backgroundColor: colors.accent } : null
    ], children: /* @__PURE__ */ jsx(KeyFace, { label, icon, button }) });
  });
  var KeyboardSheet = memo(function KeyboardSheet2({ onChange, onSubmit, onClose }) {
    const t2 = useT();
    const onKey = useCallback((value) => value === "done" ? onSubmit() : onChange((query) => edit(query, value, MAX_QUERY)), [onChange, onSubmit]);
    const onAction = (action) => {
      if (action === "square") onKey("delete");
      else if (action === "triangle") onKey(" ");
      // The page under the sheet is out of navigation while it is open, so the sheet takes L2 and R2 itself.
      else if (action === "l2") onKey("clear");
      else if (action === "r2") onKey("done");
      else return false;
      return true;
    };
    const row = (characters) => /* @__PURE__ */ jsx(View, { style: [{ flexDirection: "row", gap: GAP, justifyContent: "center" }, LTR], children: characters.map((character) => /* @__PURE__ */ jsx(Key, { label: character, value: character.toLowerCase(), onKey, focusKey: `key:${character.toLowerCase()}`, autoFocus: character === "A" }, character)) });
    return /* @__PURE__ */ jsx(motion.View, { style: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingTop: 22, paddingBottom: 26 }, initial: { y: 120, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: rise, children: /* @__PURE__ */ jsx(FocusScope, { focusKey: "search:keys", trap: true, onAction, onBack: () => {
      onClose();
      return true;
    }, children: /* @__PURE__ */ jsxs(View, { style: { gap: GAP, alignItems: "center" }, children: [
      row(ROWS[0]),
      row(ROWS[1]),
      /* @__PURE__ */ jsxs(View, { style: [{ flexDirection: "row", gap: GAP, justifyContent: "center" }, LTR], children: [
        ...ROWS[2].map((character) => /* @__PURE__ */ jsx(Key, { label: character, value: character, onKey, focusKey: `key:${character}` }, character)),
        /* @__PURE__ */ jsx(Key, { label: t2("keyboard.space"), button: "triangle", value: " ", onKey, width: KEY * 2 + GAP, focusKey: "key:space" }, "space"),
        /* @__PURE__ */ jsx(Key, { icon: "delete", button: "square", value: "delete", onKey, width: KEY + 40, focusKey: "key:delete" }, "delete"),
        /* @__PURE__ */ jsx(Key, { icon: "x", button: "l2", value: "clear", onKey, width: KEY + 40, focusKey: "key:clear" }, "clear"),
        /* @__PURE__ */ jsx(Key, { icon: "search", button: "r2", value: "done", onKey, width: KEY + 40, focusKey: "key:done" }, "done")
      ] })
    ] }) }) });
  });

export { FIRST_KEY, KeyboardSheet };
