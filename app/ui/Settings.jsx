// Jobee'sLair Settings: a full-screen page of rounded cards in two columns. On the left: the phone
// companion (switch, live status, address, your PIN and changing it), audio and haptics, theme and light
// bar, language. On the right: storage and feeds (drives, catalog feeds with their mirrors), the Source
// Addition Guide, and About (version, update check, origin and credits). Back closes it.
// Every card is a scroll anchor: focus on any row in it scrolls the whole card into view, header and all,
// so Up from lower cards always comes back to the top cards and their headers instead of leaving them cut
// off above the viewport. The page has a solid canvas under its scrolling cards, so the engine can
// copy-scroll them; the page slides in as one piece (a full-screen container is translated, not faded).

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { CREATOR, choosePin, setCompanion, useCompanion } from '../companion/service.js';
import { URLDialog } from '../downloads/URLDialog.jsx';
import { formatDate2 } from '../i18n/core.js';
import { chooseLanguage, languageChoice, systemLocale, useT } from '../i18n/index.js';
import { LOCALES } from '../i18n/locales.js';
import { driveName } from '../state/downloads.js';
import { useDrives } from '../state/drives.js';
import { MAX_FEEDS, MAX_MIRRORS, addFeed, addMirror, refreshFeeds, removeFeed, removeMirror, useFeeds } from '../state/feeds.js';
import { formatBytes } from '../state/size.js';
import { isoDate } from '../state/clock.js';
import { checkForUpdate, openUpdateDialog, useUpdate } from '../state/update.js';
import { REPO, VERSION_LABEL } from '../version.js';
import { JLMark } from './JLMark.jsx';
import { FocusRing } from './FocusRing.jsx';
import { Icon } from './Icon.jsx';
import { Menu, MenuDivider, MenuItem } from './Menu.jsx';
import { PinDialog } from './PinDialog.jsx';
import { ProgressBar } from './ProgressBar.jsx';
import { chooseTheme, colors, commitTheme, radius } from './colors.js';
import { setNavigationHaptics, useNavigationHaptics } from './haptics.js';
import { onStatusLight, setStatusLight, statusLightOn } from './lightBar.js';
import { logical } from './scale.js';
import { PRESETS, presetOf, useActiveTheme, userName } from './themes.js';
import { FocusScope, Linking, ScrollView, Text, View, motion, useIsFocused } from '@ps5-react/core';

  var COLUMN = 852;
  var CARD = { gap: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 34 };
  var ENTER = { type: "tween", duration: 0.34, ease: [0.22, 1, 0.36, 1] };
  var THUMB = { type: "tween", duration: 0.18, ease: "easeOut" };
  var text = (size, color, extra) => ({ fontFamily: "Exo2", fontSize: size, lineHeight: Math.round(size * 1.4), color, ...extra });
  var STATUS = {
    off: { color: colors.subtle, label: "settings.status.off" },
    starting: { color: "#fbbf24", label: "settings.status.starting" },
    live: { color: "#4ade80", label: "settings.status.live" },
    locked: { color: "#fbbf24", label: "settings.status.locked" },
    error: { color: "#f87171", label: "settings.status.error" }
  };
  // A status pill with a colored dot: the companion's state at a glance.
  function Chip({ status }) {
    const t2 = useT();
    const { color, label } = STATUS[status];
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.pill, backgroundColor: colors.surface3, paddingHorizontal: 18, paddingVertical: 6 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: color } }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(19, colors.fg, { fontWeight: 600 }), children: t2(label) })
    ] });
  }
  // The switch: a pill track and a round thumb that slides across it. The thumb is positioned inside the
  // track (not centered on it) and moves 30 px, which motion takes in 1280-wide design units (logical),
  // so at any output size it stops short of the track's end; the track clips to its rounded shape anyway.
  function Switch({ on }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsx)(View, { style: { width: 76, height: 44, borderRadius: radius.pill, roundedClip: true, borderWidth: 1, borderColor: on || focused ? colors.accentHi : colors.glassEdge, backgroundColor: on ? colors.accent : colors.surface3 }, children: /* @__PURE__ */ (0, jsx)(motion.View, {
      style: { position: "absolute", left: 4, top: 4, width: 34, height: 34, borderRadius: radius.pill, backgroundColor: on ? colors.accentFg : colors.muted },
      initial: false,
      animate: { x: on ? logical(30) : 0 },
      transition: THUMB
    }) });
  }
  function CardHead({ icon, title, right }) {
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 18, marginBottom: 6 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surface3 }, children: /* @__PURE__ */ (0, jsx)(Icon, { name: icon, size: 24, color: colors.glow }) }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(28, colors.fg, { flex: 1, fontWeight: 600, letterSpacing: 0.2 }), children: title }),
      right ?? null
    ] });
  }
  // A focusable row inside a card: a title and detail, and at its end a switch or an icon.
  function RowFace({ name, detail, end }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, { round: "md" }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: text(23, colors.fg, { fontWeight: 600, numberOfLines: 1, ellipsizeMode: "tail" }), children: name }),
        detail ? /* @__PURE__ */ (0, jsx)(Text, { style: text(20, focused ? colors.fg : colors.muted, { numberOfLines: 2, ellipsizeMode: "tail" }), children: detail }) : null
      ] }),
      end
    ] });
  }
  var ROW = (_state) => [{ position: "relative", flexDirection: "row", alignItems: "center", gap: 24, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 16, marginHorizontal: -20 }, _state.focused ? { backgroundColor: colors.surface3 } : null];
  function Row({ focusKey, name, detail, end, onPress, autoFocus, onBlur }) {
    return /* @__PURE__ */ (0, jsx)(View, { focusKey, autoFocus, onPress, onBlur, style: ROW, children: /* @__PURE__ */ (0, jsx)(RowFace, { name, detail, end }) });
  }
  function Callout({ tone = "info", children }) {
    const color = tone === "error" ? "#f87171" : tone === "warn" ? "#fbbf24" : colors.glow;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 16, borderRadius: radius.md, backgroundColor: colors.surface2, paddingHorizontal: 20, paddingVertical: 14 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 4, borderRadius: radius.pill, backgroundColor: color } }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.fg, { flex: 1 }), children })
    ] });
  }
  function CompanionCard({ onChoosePin }) {
    const t2 = useT();
    const companion = useCompanion();
    const status = !companion.enabled ? "off" : companion.state === "failed" ? "error" : companion.locked ? "locked" : companion.state === "listening" ? "live" : "starting";
    let body = null;
    if (status === "error") body = /* @__PURE__ */ (0, jsx)(Callout, { tone: "error", children: t2("settings.companion.failed", { error: companion.error }) });
    else if (status === "starting") body = /* @__PURE__ */ (0, jsx)(Callout, { children: t2("settings.companion.starting") });
    else if (status !== "off" && !companion.address) body = /* @__PURE__ */ (0, jsx)(Callout, { tone: "warn", children: t2("settings.companion.offline") });
    else if (status !== "off") body = /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 14 }, children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.companion.open") }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 20 }, children: [
        /* @__PURE__ */ (0, jsx)(View, { style: { flex: 1, borderRadius: radius.md, backgroundColor: colors.canvas2, paddingHorizontal: 22, paddingVertical: 14 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 25, lineHeight: 34, color: colors.fg }, children: companion.url }) }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { alignItems: "center", borderRadius: radius.md, backgroundColor: colors.canvas2, paddingHorizontal: 24, paddingVertical: 8 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: text(16, colors.subtle, { fontWeight: 600, letterSpacing: 2 }), children: t2("settings.companion.pin") }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 36, lineHeight: 46, letterSpacing: 6, color: colors.glow }, children: companion.pin })
        ] })
      ] }),
      companion.locked ? /* @__PURE__ */ (0, jsx)(Callout, { tone: "warn", children: t2("settings.companion.locked") }) : companion.phones ? /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.companion.phones", { count: companion.phones }) }) : null
    ] });
    // Turning it on for the first time asks for a PIN first: the switch changes nothing until one is set.
    const toggle = () => {
      if (!setCompanion(!companion.enabled)) onChoosePin("create");
    };
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "globe", title: t2("settings.card.companion"), right: /* @__PURE__ */ (0, jsx)(Chip, { status }) }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:companion", autoFocus: true, name: t2("settings.companion"), detail: t2("settings.companion.detail"), end: /* @__PURE__ */ (0, jsx)(Switch, { on: companion.enabled }), onPress: toggle }),
      body,
      companion.hasPin ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:pin", name: t2("settings.companion.changePin"), detail: t2("settings.companion.changePinDetail"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: "chevronRight", color: colors.muted }), onPress: () => onChoosePin("change") }) : /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.subtle), children: t2("settings.companion.noPin") })
    ] });
  }
  function FeedbackCard() {
    const t2 = useT();
    const vibration = useNavigationHaptics();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "star", title: t2("settings.card.feedback") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:vibration", name: t2("settings.vibration"), detail: t2("settings.vibrationDetail"), end: /* @__PURE__ */ (0, jsx)(Switch, { on: vibration }), onPress: () => setNavigationHaptics(!vibration) }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.subtle), children: t2("settings.sounds") })
    ] });
  }
  // One swatch per preset: its accent filled, the accent frame when focused, a check on the chosen one.
  function SwatchFace({ preset, chosen }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { width: 88, height: 88, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: focused ? 3 : 1, borderColor: focused ? preset.hi : chosen ? colors.fg : colors.line, backgroundColor: colors.surface2 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: preset.accent } }),
      chosen ? /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute" }, children: /* @__PURE__ */ (0, jsx)(Icon, { name: "check", size: 30, color: preset.fg }) }) : null
    ] });
  }
  function useStatusLight() {
    const [on, setOn] = (0, useState)(statusLightOn);
    (0, useEffect)(() => onStatusLight(setOn), []);
    return on;
  }
  function ThemeCard() {
    const t2 = useT();
    const active = useActiveTheme();
    const light = useStatusLight();
    const [shown, setShown] = (0, useState)(null);
    const [changed, setChanged] = (0, useState)(false);
    const user = userName();
    const label = presetOf(shown ?? active);
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "disc", title: t2("settings.card.theme") }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 4 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: text(23, colors.fg, { fontWeight: 600 }), children: `${t2("settings.theme")} · ${t2(label.name)}` }),
        /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: user ? t2("settings.theme.detailUser", { user }) : t2("settings.theme.detail") })
      ] }),
      /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", gap: 16, paddingVertical: 6 }, children: PRESETS.map((preset) => /* @__PURE__ */ (0, jsx)(View, {
        focusKey: `settings:theme:${preset.id}`,
        focusable: true,
        onFocus: () => setShown(preset.id),
        onBlur: () => setShown(null),
        onPress: () => {
          if (preset.id === active) return;
          chooseTheme(preset.id);
          setChanged(true);
        },
        children: /* @__PURE__ */ (0, jsx)(SwatchFace, { preset, chosen: preset.id === active })
      }, preset.id)) }),
      changed ? /* @__PURE__ */ (0, jsx)(Callout, { children: t2("settings.theme.redraw") }) : null,
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:statusLight", name: t2("settings.statusLight"), detail: t2("settings.statusLightDetail"), end: /* @__PURE__ */ (0, jsx)(Switch, { on: light }), onPress: () => setStatusLight(!light) })
    ] });
  }
  function LanguageCard() {
    const t2 = useT();
    const choice = languageChoice();
    const [open, setOpen] = (0, useState)(false);
    const nameOf = (code) => LOCALES.find((locale) => locale.code === code)?.name ?? code;
    const current = choice === null ? `${t2("language.system")} · ${nameOf(systemLocale())}` : nameOf(choice);
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "languages", title: t2("settings.card.language") }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { position: "relative" }, children: [
        /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:language", name: current, detail: t2("language.subtitle"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: open ? "chevronDown" : "chevronUp", color: colors.muted }), onPress: () => setOpen((value) => !value) }),
        /* @__PURE__ */ (0, jsxs)(Menu, { open, placement: "above", onClose: () => setOpen(false), rows: LOCALES.length + 2, children: [
          /* @__PURE__ */ (0, jsx)(MenuItem, { label: t2("language.system"), checked: choice === null, onSelect: () => chooseLanguage(null) }),
          /* @__PURE__ */ (0, jsx)(MenuDivider, {}),
          LOCALES.map(({ code, name }) => /* @__PURE__ */ (0, jsx)(MenuItem, { label: name, checked: choice === code, onSelect: () => chooseLanguage(code) }, code))
        ] })
      ] })
    ] });
  }
  var hostOf = (url) => /^https?:\/\/([^/?#]+)/i.exec(url)?.[1] ?? url;
  function feedDetail(t2, feed) {
    if (feed.state === "refreshing") return t2("settings.feeds.refreshing");
    if (feed.state === "failed") return t2("settings.feeds.failed", { error: feed.error });
    const base = t2("settings.feeds.games", { count: feed.games, date: feed.fetchedAt ? formatDate2(feed.fetchedAt.slice(0, 10)) : "—" });
    const extra = [feed.via ? t2("settings.feeds.via", { host: hostOf(feed.via) }) : null, feed.mirrors.length ? t2("settings.feeds.mirrors", { count: feed.mirrors.length }) : null].filter(Boolean);
    return extra.length ? `${base} \xB7 ${extra.join(" \xB7 ")}` : base;
  }
  // A drive's space comes from the cache (state/drives.js): nothing in a render asks the drive itself.
  function Drive({ root, usage }) {
    const t2 = useT();
    const free = usage?.free ?? null;
    const total = usage?.total ?? null;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 10 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: text(21, colors.fg, { fontWeight: 600 }), children: driveName(root) }),
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 18, lineHeight: 28, color: colors.muted }, children: free != null && total ? t2("settings.storage.free", { free: formatBytes(free), total: formatBytes(total) }) : "—" })
      ] }),
      total ? /* @__PURE__ */ (0, jsx)(ProgressBar, { fraction: Math.min(1, Math.max(0, 1 - free / total)), width: 520, active: false }) : null
    ] });
  }
  // A feed's row and the menu it opens: add a mirror, remove one, remove the feed.
  function FeedRow({ feed, onMirror }) {
    const t2 = useT();
    const [open, setOpen] = (0, useState)(false);
    return /* @__PURE__ */ (0, jsxs)(View, { style: { position: "relative" }, children: [
      /* @__PURE__ */ (0, jsx)(Row, {
        focusKey: `settings:feed:${feed.url}`,
        name: feed.name ?? feed.url,
        detail: feedDetail(t2, feed),
        end: /* @__PURE__ */ (0, jsx)(Icon, { name: feed.state === "failed" ? "alert" : "layers", color: feed.state === "failed" ? "#f87171" : colors.muted }),
        onPress: () => setOpen((value) => !value)
      }),
      /* @__PURE__ */ (0, jsxs)(Menu, { open, onClose: () => setOpen(false), rows: feed.own.length + 3, children: [
        feed.own.length < MAX_MIRRORS ? /* @__PURE__ */ (0, jsx)(MenuItem, { label: t2("settings.feeds.addMirror"), autoFocus: true, onSelect: () => onMirror(feed.url) }) : null,
        ...feed.own.map((mirror) => /* @__PURE__ */ (0, jsx)(MenuItem, { label: t2("settings.feeds.removeMirror", { host: hostOf(mirror) }), onSelect: () => removeMirror(feed.url, mirror) }, mirror)),
        /* @__PURE__ */ (0, jsx)(MenuDivider, {}),
        /* @__PURE__ */ (0, jsx)(MenuItem, { label: t2("settings.feeds.removeFeed"), onSelect: () => removeFeed(feed.url) })
      ] })
    ] });
  }
  function StorageCard({ onAdd, onMirror }) {
    const t2 = useT();
    const feeds = useFeeds();
    const drives = useDrives();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "hardDrive", title: t2("settings.card.storage") }),
      ...drives.roots.map((root) => /* @__PURE__ */ (0, jsx)(Drive, { root, usage: drives.usage[root] }, root)),
      /* @__PURE__ */ (0, jsx)(View, { style: { height: 1, marginVertical: 8, backgroundColor: colors.line } }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.feeds.detail") }),
      ...feeds.map((feed) => /* @__PURE__ */ (0, jsx)(FeedRow, { feed, onMirror }, feed.url)),
      feeds.length < MAX_FEEDS ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:feeds:add", name: t2("settings.feeds.add"), detail: t2("settings.feeds.addHint", { count: MAX_FEEDS }), end: /* @__PURE__ */ (0, jsx)(Icon, { name: "external", color: colors.muted }), onPress: onAdd }) : null,
      feeds.length ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:feeds:refresh", name: t2("settings.feeds.refresh"), detail: feeds.some((feed) => feed.state === "refreshing") ? t2("settings.feeds.refreshing") : t2("settings.feeds.refreshHint"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: "restart", color: colors.muted }), onPress: () => void refreshFeeds() }) : null,
      feeds.some((feed) => feed.restart) ? /* @__PURE__ */ (0, jsx)(Callout, { children: t2("settings.feeds.restart") }) : null
    ] });
  }
  // The Source Addition Guide: how a catalog feed gets into the store, step by step. One row until opened;
  // then each step is focusable, so the controller walks down it and the page scrolls along.
  var STEP = (_state) => [{ position: "relative", flexDirection: "row", alignItems: "flex-start", gap: 20, paddingHorizontal: 20, paddingVertical: 14, marginHorizontal: -20, borderRadius: radius.md }, _state.focused ? { backgroundColor: colors.surface3 } : null];
  function StepFace({ index, title, detail }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, { round: "md" }),
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: focused ? colors.accent : colors.surface3 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 22, lineHeight: 30, color: focused ? colors.accentFg : colors.glow }, children: String(index + 1) }) }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 4 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: text(23, colors.fg, { fontWeight: 600 }), children: title }),
        /* @__PURE__ */ (0, jsx)(Text, { style: text(20, focused ? colors.fg : colors.muted), children: detail })
      ] })
    ] });
  }
  function GuideCard() {
    const t2 = useT();
    const companion = useCompanion();
    const [open, setOpen] = (0, useState)(false);
    const steps = [
      [t2("settings.guide.find"), t2("settings.guide.findDetail")],
      [t2("settings.guide.console"), t2("settings.guide.consoleDetail", { count: MAX_FEEDS })],
      [t2("settings.guide.phone"), t2("settings.guide.phoneDetail", { url: companion.url || "http://192.168.x.x:34177/" })],
      [t2("settings.guide.mirrors"), t2("settings.guide.mirrorsDetail", { count: MAX_MIRRORS })],
      [t2("settings.guide.refresh"), t2("settings.guide.refreshDetail")],
      [t2("settings.guide.reopen"), t2("settings.guide.reopenDetail")]
    ];
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "list", title: t2("settings.card.guide") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:guide", name: open ? t2("settings.guide.hide") : t2("settings.guide.show"), detail: t2("settings.guide.detail"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: open ? "chevronUp" : "chevronDown", color: colors.muted }), onPress: () => setOpen((value) => !value) }),
      ...open ? steps.map(([title, detail], index) => /* @__PURE__ */ (0, jsx)(View, { focusKey: `settings:guide:${index}`, focusable: true, style: STEP, children: /* @__PURE__ */ (0, jsx)(StepFace, { index, title, detail }) }, index)) : []
    ] });
  }
  // What the update row says: checking, a newer version, a failed check, or when it last looked.
  function updateDetail(t2, update) {
    if (update.checking) return t2("settings.update.checking");
    if (update.update) return t2("settings.update.available", { version: update.update.version });
    if (update.failed) return t2("settings.update.failed");
    return update.checkedAt ? t2("settings.update.current", { date: formatDate2(isoDate(update.checkedAt)) }) : t2("settings.update.never");
  }
  function AboutCard() {
    const t2 = useT();
    const update = useUpdate();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "star", title: t2("settings.card.about") }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 24 }, children: [
        /* @__PURE__ */ (0, jsx)(JLMark, { height: 72 }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 4 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: text(26, colors.fg, { fontWeight: 600 }), children: t2("settings.about.version", { version: VERSION_LABEL }) }),
          /* @__PURE__ */ (0, jsx)(Text, { style: text(22, colors.glow), children: t2("settings.about.creator", { creator: CREATOR }) }),
          /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.about.ai", { creator: CREATOR }) })
        ] })
      ] }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:update", name: t2("settings.update.row"), detail: updateDetail(t2, update), end: /* @__PURE__ */ (0, jsx)(Icon, { name: update.update ? "download" : "restart", color: update.update ? colors.glow : colors.muted }), onPress: () => update.update ? openUpdateDialog() : void checkForUpdate() }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:project", name: t2("settings.about.project"), detail: `github.com/${REPO}`, end: /* @__PURE__ */ (0, jsx)(Icon, { name: "external", color: colors.muted }), onPress: () => {
        try {
          Linking.openURL(`https://github.com/${REPO}`);
        } catch {
        }
      } }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.about.origin") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.subtle), children: t2("settings.about.credits") })
    ] });
  }
  // The content neutrality and takedown notice (the same text as README.md and LICENSE): what the app is, what it
  // does not hold, who configures what, and how to report an infringing feed or catalog entry.
  function NoticeCard() {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "alert", title: t2("settings.card.legal") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.legal.neutral") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.legal.nohost") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.legal.feeds") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.legal.report") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:report", name: t2("settings.legal.reportRow"), detail: `github.com/${REPO}/issues`, end: /* @__PURE__ */ (0, jsx)(Icon, { name: "external", color: colors.muted }), onPress: () => {
        try {
          Linking.openURL(`https://github.com/${REPO}/issues/new?template=takedown.yml`);
        } catch {
        }
      } })
    ] });
  }
  function Settings({ onClose }) {
    const t2 = useT();
    const [adding, setAdding] = (0, useState)(false);
    const [mirrorOf, setMirrorOf] = (0, useState)(null);
    const [pinMode, setPinMode] = (0, useState)(null);
    // Drawn again in a newly chosen accent while open; the rest of the store follows once it closes,
    // whichever way it closes (Back, or a phone shortcut).
    useActiveTheme();
    (0, useEffect)(() => () => commitTheme(), []);
    return /* @__PURE__ */ (0, jsxs)(motion.View, {
      style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 55, backgroundColor: colors.canvas },
      initial: { x: 90 },
      animate: { x: 0 },
      transition: ENTER,
      children: [
        /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: () => {
          onClose();
          return true;
        }, children: /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1 }, children: [
          /* @__PURE__ */ (0, jsxs)(View, { style: { height: 160, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 72, paddingBottom: 28 }, children: [
            /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 24 }, children: [
              /* @__PURE__ */ (0, jsx)(JLMark, { height: 56 }),
              /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 2 }, children: [
                /* @__PURE__ */ (0, jsx)(Text, { style: text(46, colors.fg, { fontWeight: 600 }), children: t2("settings.title") }),
                /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 19, lineHeight: 28, color: colors.subtle }, children: `Jobee'sLair  v${VERSION_LABEL}` })
              ] })
            ] }),
            /* @__PURE__ */ (0, jsx)(Text, { style: text(21, colors.subtle), children: t2("settings.closeHint") })
          ] }),
          /* @__PURE__ */ (0, jsx)(ScrollView, { style: { flex: 1, paddingHorizontal: 72, paddingBottom: 72 }, children: /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 36, paddingTop: 12 }, children: [
            /* @__PURE__ */ (0, jsxs)(View, { style: { width: COLUMN, gap: 32 }, children: [
              /* @__PURE__ */ (0, jsx)(CompanionCard, { onChoosePin: setPinMode }),
              /* @__PURE__ */ (0, jsx)(FeedbackCard, {}),
              /* @__PURE__ */ (0, jsx)(ThemeCard, {}),
              /* @__PURE__ */ (0, jsx)(LanguageCard, {})
            ] }),
            /* @__PURE__ */ (0, jsxs)(View, { style: { width: COLUMN, gap: 32 }, children: [
              /* @__PURE__ */ (0, jsx)(StorageCard, { onAdd: () => setAdding(true), onMirror: setMirrorOf }),
              /* @__PURE__ */ (0, jsx)(GuideCard, {}),
              /* @__PURE__ */ (0, jsx)(AboutCard, {}),
              /* @__PURE__ */ (0, jsx)(NoticeCard, {})
            ] })
          ] }) })
        ] }) }),
        adding ? /* @__PURE__ */ (0, jsx)(URLDialog, { title: t2("settings.feeds.add"), detail: t2("settings.feeds.addDetail"), submit: addFeed, onClose: () => setAdding(false) }) : null,
        mirrorOf ? /* @__PURE__ */ (0, jsx)(URLDialog, { title: t2("settings.feeds.addMirror"), detail: t2("settings.feeds.mirrorDetail"), submit: (value) => addMirror(mirrorOf, value), onClose: () => setMirrorOf(null) }) : null,
        pinMode ? /* @__PURE__ */ (0, jsx)(PinDialog, { mode: pinMode, onDone: choosePin, onClose: () => setPinMode(null) }) : null
      ]
    });
  }

export { Settings };
