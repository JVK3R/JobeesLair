// A newer Jobee'sLair build exists (state/update.js found a release newer than this one). Opened from the
// header's update badge or Settings → About. It says what changed and where to get it; nothing is
// downloaded or installed from here: a new build is installed by copying its .exfat over the old one.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { useT } from '../i18n/index.js';
import { closeUpdateDialog, useUpdate, useUpdateDialog } from '../state/update.js';
import { VERSION_LABEL } from '../version.js';
import { Button2 } from './Button.jsx';
import { colors, radius } from './colors.js';
import { FocusScope, Linking, Text, View, motion } from '@ps5-react/core';

  var ENTER = { type: "tween", duration: 0.24, ease: [0.22, 1, 0.36, 1] };
  var sans = (size, color, extra) => ({ fontFamily: "Exo2", fontSize: size, lineHeight: Math.round(size * 1.42), color, ...extra });
  function UpdateDialog() {
    const t2 = useT();
    const open = useUpdateDialog();
    const { update } = useUpdate();
    const [note, setNote] = (0, useState)("");
    if (!open || !update) return null;
    const view = () => {
      try {
        setNote(Linking.openURL(update.url) ? "" : t2("update.noBrowser", { url: update.url }));
      } catch {
        setNote(t2("update.noBrowser", { url: update.url }));
      }
    };
    const close = () => {
      setNote("");
      closeUpdateDialog();
      return true;
    };
    return (
      // A modal: the page's actions stop here.
      /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: close, onAction: () => true, children: /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 70, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.canvas}f2` }, children: /* @__PURE__ */ (0, jsxs)(motion.View, {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        transition: ENTER,
        style: { width: 860, gap: 26, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 52 },
        children: [
          /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 10 }, children: [
            /* @__PURE__ */ (0, jsx)(View, { style: { alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: colors.accent, paddingHorizontal: 18, paddingVertical: 4 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: sans(19, colors.accentFg, { fontWeight: 600 }), children: t2("update.available") }) }),
            /* @__PURE__ */ (0, jsx)(Text, { style: sans(60, colors.fg, { fontWeight: 600 }), children: `v${update.version}` }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 21, lineHeight: 30, color: colors.muted }, children: `v${VERSION_LABEL}  →  v${update.version}` })
          ] }),
          update.notes ? /* @__PURE__ */ (0, jsx)(Text, { style: sans(22, colors.fg, { numberOfLines: 7, ellipsizeMode: "tail", lineHeight: 33 }), children: update.notes }) : null,
          /* @__PURE__ */ (0, jsx)(Text, { style: sans(21, colors.muted), children: t2("update.howTo") }),
          note ? /* @__PURE__ */ (0, jsx)(Text, { style: sans(20, "#fbbf24"), children: note }) : null,
          /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 16 }, children: [
            /* @__PURE__ */ (0, jsx)(Button2, { variant: "primary", size: "lg", icon: "external", label: t2("update.view"), autoFocus: true, onPress: view }),
            /* @__PURE__ */ (0, jsx)(Button2, { variant: "secondary", size: "lg", label: t2("update.close"), onPress: close })
          ] })
        ]
      }) }) })
    );
  }

export { UpdateDialog };
