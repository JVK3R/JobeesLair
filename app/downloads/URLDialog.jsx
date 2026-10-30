// ../pub-game-store/native/downloads/URLDialog.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED (0.5.4): the PS5's own keyboard opens with the dialog (state/system-keyboard.js), where a link or a key
// is typed (or pasted) the way the player types everywhere else; Go submits it. Backing out of it closes the
// dialog. A link the dialog refuses comes back with its reason and "Type it again". The keys below stay for a
// console where it does not open. `kind` "key" (an API key) types plain Latin text instead of a link.
// While it is open, the phone companion may answer it (state/phone-typing.js): the PS5 keyboard closes and the phone's
// text goes in as if typed here; a refusal shows here and on the phone.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import { Keyboard } from '../search/Keyboard.jsx';
import { askPhone } from '../state/phone-typing.js';
import { closeForPhone, systemKeyboardOn, typeOnSystemKeyboard } from '../state/system-keyboard.js';
import { Button2 } from '../ui/Button.jsx';
import { FocusScope, Text, View } from '@ps5-react/core';
import { colors, radius } from '../ui/colors.js';

  var MAX_TYPED = 2048;
  function URLDialog({ title, detail: detail2, initial = "https://", submit, onClose, kind = "url" }) {
    const t2 = useT();
    const [value, setValue] = (0, useState)(initial);
    const [error2, setError] = (0, useState)("");
    const [system] = (0, useState)(systemKeyboardOn);
    // Why `typed` was refused ("" when it was taken and the dialog closed).
    const attempt = (typed) => {
      try {
        submit(typed);
        onClose();
        return "";
      } catch (failure) {
        setError(failure.message);
        return failure.message;
      }
    };
    const done = (typed = value) => void attempt(typed);
    const latest = (0, useRef)(attempt);
    latest.current = attempt;
    (0, useEffect)(() => askPhone({ title, detail: detail2, kind, answer: (text) => {
      closeForPhone();
      const typed = text.trim();
      setValue(typed);
      return latest.current(typed);
    } }), []);
    const typeOnConsole = (from = value) => {
      void typeOnSystemKeyboard({ title, text: from, maxLength: MAX_TYPED, type: kind === "key" ? "basic" : "url", enter: "go" }).then((result) => {
        if (!result) return;
        // The phone answered while it was up: that answer stands.
        if (result.status === "phone") return;
        if (result.status !== "done") {
          // Backed out of it: so is the dialog, unless it already holds an answer to fix.
          if (!error2) onClose();
          return;
        }
        const typed = result.text.trim();
        setValue(typed);
        setError("");
        done(typed);
      });
    };
    (0, useEffect)(() => {
      if (system) typeOnConsole(initial);
    }, []);
    return (
      // A modal: actions the keyboard leaves (L1/R1, Square outside it) stop here instead of reaching the page.
      /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: () => {
        onClose();
        return true;
      }, onAction: (action) => {
        if (action === "r2") done();
        return true;
      }, children: /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.canvas}f2` }, children: /* @__PURE__ */ (0, jsxs)(View, { style: { width: 1380, gap: 30, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 48 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 36, color: colors.fg, lineHeight: 48 }, children: title }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 48 }, children: [
          /* @__PURE__ */ (0, jsx)(Keyboard, { url: true, onChange: setValue, onSubmit: done }),
          /* @__PURE__ */ (0, jsxs)(View, { style: { width: 600, gap: 30 }, children: [
            /* @__PURE__ */ (0, jsx)(Text, { style: { width: 600, fontFamily: "Exo2", fontSize: 24, color: colors.muted, numberOfLines: 5, ellipsizeMode: "tail", lineHeight: 36 }, children: detail2 }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { width: 600, fontFamily: "JetBrainsMono-Regular", fontSize: 22, color: colors.fg, numberOfLines: 5, ellipsizeMode: "tail", lineHeight: 34 }, children: value.slice(-180) || t2("urlDialog.empty") }),
            error2 ? /* @__PURE__ */ (0, jsx)(Text, { style: { width: 600, fontFamily: "Exo2", fontSize: 21, color: colors.fg, numberOfLines: 3, ellipsizeMode: "tail", lineHeight: 30 }, children: error2 }) : null,
            system ? /* @__PURE__ */ (0, jsx)(Button2, { label: t2("urlDialog.typeAgain"), icon: "keyboard", onPress: () => typeOnConsole() }) : null,
            /* @__PURE__ */ (0, jsx)(Button2, { label: t2("urlDialog.confirm"), onPress: () => done() }),
            /* @__PURE__ */ (0, jsx)(Button2, { label: t2("urlDialog.cancel"), variant: "outline", onPress: onClose }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.muted, lineHeight: 30 }, children: t2("urlDialog.controls") })
          ] })
        ] })
      ] }) }) })
    );
  }

export { URLDialog };
