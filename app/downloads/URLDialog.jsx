// ../pub-game-store/native/downloads/URLDialog.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { useT } from '../i18n/index.js';
import { Keyboard } from '../search/Keyboard.jsx';
import { Button2 } from '../ui/Button.jsx';
import { FocusScope, Text, View } from '@ps5-react/core';
import { colors, radius } from '../ui/colors.js';

  function URLDialog({ title, detail: detail2, initial = "https://", submit, onClose }) {
    const t2 = useT();
    const [value, setValue] = (0, useState)(initial);
    const [error2, setError] = (0, useState)("");
    const done = () => {
      try {
        submit(value);
        onClose();
      } catch (failure) {
        setError(failure.message);
      }
    };
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
            /* @__PURE__ */ (0, jsx)(Button2, { label: t2("urlDialog.confirm"), onPress: done }),
            /* @__PURE__ */ (0, jsx)(Button2, { label: t2("urlDialog.cancel"), variant: "outline", onPress: onClose }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.muted, lineHeight: 30 }, children: t2("urlDialog.controls") })
          ] })
        ] })
      ] }) }) })
    );
  }

export { URLDialog };
