// "What's new" (0.5.0 Pre Release 4): shown once, a moment after the store first comes up on a release that has
// one (state/whats-new.js), so what it brings is found. Two buttons: open the Homebrew section, or close it.
// Circle closes it too.

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { FocusScope, Text, View, motion, useIsFocused } from '@ps5-react/core';
import { useT } from '../i18n/index.js';
import { useNavActions } from '../state/nav.jsx';
import { markWhatsNewSeen, shouldShowWhatsNew } from '../state/whats-new.js';
import { FocusRing } from './FocusRing.jsx';
import { Icon } from './Icon.jsx';
import { JLMark } from './JLMark.jsx';
import { colors, radius } from './colors.js';

  // After the store's reveal (index.jsx CURTAIN_MS) has finished.
  var DELAY_MS = 4500;
  var ITEMS = [
    // 0.5.2: the online card says the stats are on, and where they turn off.
    { icon: "globe", tone: "#38bdf8", title: "whatsNew.online", detail: "whatsNew.onlineDetail" },
    { icon: "restart", tone: "#4ade80", title: "whatsNew.fixIt", detail: "whatsNew.fixItDetail" },
    { icon: "folder", tone: "#facc15", title: "whatsNew.saves", detail: "whatsNew.savesDetail" },
    { icon: "package", tone: "#a78bfa", title: "whatsNew.backports", detail: "whatsNew.backportsDetail" }
  ];
  var text = (size, color, extra) => ({ fontFamily: "Exo2", fontSize: size, lineHeight: Math.round(size * 1.35), color, ...extra });
  function ButtonFace({ label, primary }) {
    const focused = useIsFocused();
    return jsxs(Fragment, { children: [
      jsx(FocusRing, { round: "md" }),
      jsx(Text, { style: text(23, primary || focused ? "#ffffff" : colors.fg, { fontWeight: 600 }), children: label })
    ] });
  }
  function WhatsNew() {
    const t2 = useT();
    const { push } = useNavActions();
    const [open, setOpen] = useState(false);
    const done = useRef(false);
    useEffect(() => {
      if (!shouldShowWhatsNew()) return void 0;
      const id = setTimeout(() => setOpen(true), DELAY_MS);
      return () => clearTimeout(id);
    }, []);
    if (!open) return null;
    const close = (then) => {
      if (done.current) return;
      done.current = true;
      markWhatsNewSeen();
      setOpen(false);
      then?.();
    };
    return jsx(View, { style: { position: "absolute", top: 0, left: 0, width: 1920, height: 1080, zIndex: 90, alignItems: "center", justifyContent: "center", backgroundColor: "#000000b3" }, children: jsx(FocusScope, { trap: true, autoFocus: true, onBack: () => (close(), true), children: jsxs(motion.View, { initial: { y: 24, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { type: "tween", duration: 0.3, ease: [0.22, 1, 0.36, 1] }, style: { width: 1120, gap: 30, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas2, paddingHorizontal: 56, paddingVertical: 48 }, children: [
      jsxs(View, { style: { flexDirection: "row", alignItems: "center", gap: 20 }, children: [
        jsx(JLMark, { height: 34 }),
        jsx(Text, { style: text(36, colors.fg, { fontWeight: 700 }), children: t2("whatsNew.title") })
      ] }),
      jsx(View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 18 }, children: ITEMS.map((item) => jsxs(View, { style: { width: 495, flexDirection: "row", gap: 18, borderRadius: radius.md, backgroundColor: colors.surface, padding: 20 }, children: [
        jsx(View, { style: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surface3 }, children: jsx(Icon, { name: item.icon, size: 22, color: item.tone }) }),
        jsxs(View, { style: { flex: 1, gap: 4 }, children: [
          jsx(Text, { style: text(23, colors.fg, { fontWeight: 600 }), children: t2(item.title) }),
          jsx(Text, { style: text(19, colors.muted), children: t2(item.detail) })
        ] })
      ] }, item.title)) }),
      jsxs(View, { style: { flexDirection: "row", justifyContent: "flex-end", gap: 16 }, children: [
        jsx(View, { focusKey: "whatsnew:homebrew", onPress: () => close(() => push({ name: "homebrew" }, "nav:homebrew")), style: (state) => [{ position: "relative", height: 60, justifyContent: "center", borderRadius: radius.md, paddingHorizontal: 28, backgroundColor: state.focused ? colors.surface3 : colors.surface2 }], children: jsx(ButtonFace, { label: t2("whatsNew.openHomebrew") }) }),
        jsx(View, { focusKey: "whatsnew:done", autoFocus: true, onPress: () => close(), style: (state) => [{ position: "relative", height: 60, justifyContent: "center", borderRadius: radius.md, paddingHorizontal: 34, backgroundColor: state.focused ? colors.accentHi : colors.accent }], children: jsx(ButtonFace, { label: t2("whatsNew.done"), primary: true }) })
      ] })
    ] }) }) });
  }

export { WhatsNew };
