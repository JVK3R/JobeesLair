// Jobee'sLair Settings: a full-screen page of rounded cards in two columns. On the left: the phone
// companion (switch, live status, address, your PIN and changing it), audio and haptics, theme and light
// bar, language. On the right: storage and feeds (drives, catalog feeds with their mirrors), debrid
// providers (the TorBox API key and its connection test), the Source Addition Guide, and About (version,
// update check, origin and credits). Back closes it.
// Every card is a scroll anchor: focus on any row in it scrolls the whole card into view, header and all,
// so Up from lower cards always comes back to the top cards and their headers instead of leaving them cut
// off above the viewport. The page has a solid canvas under its scrolling cards, so the engine can
// copy-scroll them; the page slides in as one piece (a full-screen container is translated, not faded).
// 0.5.1: far less text. A row shows its name and its state; what a setting does (its `hint`) shows under the
// row only while it has focus, and the paragraphs (what debrid is, what feeds are, the credits, the legal
// notice) are gone from view or folded behind a row.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import supportQr from '../assets/support-qr.png';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { CREATOR, choosePin, setCompanion, setCompanionAway, useCompanion } from '../companion/service.js';
import { URLDialog } from '../downloads/URLDialog.jsx';
import { formatDate2, formatNumber2 } from '../i18n/core.js';
import { chooseLanguage, languageChoice, systemLocale, useT } from '../i18n/index.js';
import { LOCALES } from '../i18n/locales.js';
import { reportRelay, sendReport } from '../state/bug-report.js';
import { online, useOnline } from '../state/online.js';
import { setAllDebridKey, setTorBoxKey, testAllDebrid, testTorBox, useDebrid } from '../state/debrid.js';
import { HOMEBREW_ONLY } from '../edition.js';
import { LIMITS as SPEED_LIMITS, setSpeedLimit, useSpeedLimit } from '../state/speed-limit.js';
import { setAutoContinueParts, useAutoContinueParts } from '../state/auto-continue.js';
import { setScreenSaver, showScreenSaver, useScreenSaverOn } from '../state/screen-saver.js';
import { useNavActions } from '../state/nav.jsx';
import { downloadQueue, driveName } from '../state/downloads.js';
import { useDrives } from '../state/drives.js';
import { MAX_FEEDS, MAX_MIRRORS, addFeed, addMirror, refreshFeeds, removeFeed, removeMirror, useFeeds } from '../state/feeds.js';
import { formatBytes } from '../state/size.js';
import { isoDate } from '../state/clock.js';
import { canInstall, checkForUpdate, openUpdateDialog, setAutoInstall, useAutoInstall, useInstall, useUpdate } from '../state/update.js';
import { REPO, VERSION_LABEL } from '../version.js';
import { JLMark } from './JLMark.jsx';
import { FocusRing } from './FocusRing.jsx';
import { Icon } from './Icon.jsx';
import { Menu, MenuDivider, MenuItem } from './Menu.jsx';
import { PinDialog } from './PinDialog.jsx';
import { ProgressBar } from './ProgressBar.jsx';
import { QRCode } from './QRCode.jsx';
import { chooseTheme, colors, commitTheme, radius } from './colors.js';
import { setNavigationHaptics, useNavigationHaptics } from './haptics.js';
import { onStatusLight, setStatusLight, statusLightOn } from './lightBar.js';
import { logical } from './scale.js';
import { PRESETS, presetOf, useActiveTheme } from './themes.js';
import { FocusScope, Image, Linking, ScrollView, Text, View, motion, useIsFocused } from '@ps5-react/core';

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
  // `detail` is the row's state, always shown ("Set (…1234)", "Connected · Pro plan"); `hint` says what the
  // setting does, and shows only while the row has focus.
  function RowFace({ name, detail, hint, end }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, { round: "md" }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: text(23, colors.fg, { fontWeight: 600, numberOfLines: 1, ellipsizeMode: "tail" }), children: name }),
        detail ? /* @__PURE__ */ (0, jsx)(Text, { style: text(20, focused ? colors.fg : colors.muted, { numberOfLines: 2, ellipsizeMode: "tail" }), children: detail }) : null,
        hint && focused ? /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted, { numberOfLines: 3, ellipsizeMode: "tail" }), children: hint }) : null
      ] }),
      end
    ] });
  }
  var ROW = (_state) => [{ position: "relative", flexDirection: "row", alignItems: "center", gap: 24, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 16, marginHorizontal: -20 }, _state.focused ? { backgroundColor: colors.surface3 } : null];
  function Row({ focusKey, name, detail, hint, end, onPress, autoFocus, onBlur }) {
    return /* @__PURE__ */ (0, jsx)(View, { focusKey, autoFocus, onPress, onBlur, style: ROW, children: /* @__PURE__ */ (0, jsx)(RowFace, { name, detail, hint, end }) });
  }
  // A paragraph or two behind a row (the credits, the legal notice): shown only once the row is opened.
  function Folded({ focusKey, name, paragraphs }) {
    const t2 = useT();
    const [open, setOpen] = (0, useState)(false);
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(Row, { focusKey, name, end: /* @__PURE__ */ (0, jsx)(Icon, { name: open ? "chevronUp" : "chevronDown", color: colors.muted }), onPress: () => setOpen((value) => !value) }),
      ...open ? paragraphs.map((paragraph, index) => /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: paragraph }, index)) : []
    ] });
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
    // 0.5.0 Pre Release 4: a QR code of the address beside it, so a phone camera opens the page (typing an IP
    // on a phone is where it most often went wrong).
    else if (status !== "off") body = /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 14 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 28 }, children: [
        /* @__PURE__ */ (0, jsx)(QRCode, { text: companion.url, size: 216 }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 14 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.companion.open") }),
          /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.md, backgroundColor: colors.canvas2, paddingHorizontal: 22, paddingVertical: 14 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 25, lineHeight: 34, color: colors.fg }, children: companion.url }) }),
          /* @__PURE__ */ (0, jsxs)(View, { style: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.md, backgroundColor: colors.canvas2, paddingHorizontal: 22, paddingVertical: 6 }, children: [
            /* @__PURE__ */ (0, jsx)(Text, { style: text(16, colors.subtle, { fontWeight: 600, letterSpacing: 2 }), children: t2("settings.companion.pin") }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 36, lineHeight: 46, letterSpacing: 6, color: colors.glow }, children: companion.pin })
          ] })
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
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:companion", name: t2("settings.companion"), hint: companion.hasPin ? t2("settings.companion.detail") : `${t2("settings.companion.detail")}. ${t2("settings.companion.noPin")}`, end: /* @__PURE__ */ (0, jsx)(Switch, { on: companion.enabled }), onPress: toggle }),
      body,
      // Experimental: the helper that answers the phone while the app is closed (companion/service.js).
      companion.enabled ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:companionAway", name: t2("settings.companion.away"), detail: companion.away && companion.awayAnswer && !["ready", "updated", "sent", "sending", "stopped"].includes(companion.awayAnswer) ? t2("settings.companion.awayFailed", { error: companion.awayAnswer }) : null, hint: t2("settings.companion.awayDetail"), end: /* @__PURE__ */ (0, jsx)(Switch, { on: companion.away }), onPress: () => setCompanionAway(!companion.away) }) : null,
      companion.hasPin ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:pin", name: t2("settings.companion.changePin"), hint: t2("settings.companion.changePinDetail"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: "chevronRight", color: colors.muted }), onPress: () => onChoosePin("change") }) : null
    ] });
  }
  function FeedbackCard() {
    const t2 = useT();
    const vibration = useNavigationHaptics();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "star", title: t2("settings.card.feedback") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:vibration", name: t2("settings.vibration"), hint: t2("settings.vibrationDetail"), end: /* @__PURE__ */ (0, jsx)(Switch, { on: vibration }), onPress: () => setNavigationHaptics(!vibration) })
    ] });
  }
  // The screen saver (0.5.0 Pre Release 4; ui/ScreenSaver.jsx): on or off, and a look at it now.
  function ScreenSaverCard() {
    const t2 = useT();
    const on = useScreenSaverOn();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "disc", title: t2("settings.card.screenSaver") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:screenSaver", name: t2("settings.screenSaver"), hint: t2("settings.screenSaverDetail"), end: /* @__PURE__ */ (0, jsx)(Switch, { on }), onPress: () => setScreenSaver(!on) }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:screenSaverNow", name: t2("settings.screenSaverNow"), hint: t2("settings.screenSaverNowDetail"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: "play", color: colors.muted }), onPress: showScreenSaver })
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
    const label = presetOf(shown ?? active);
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "disc", title: t2("settings.card.theme") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(23, colors.fg, { fontWeight: 600 }), children: `${t2("settings.theme")} · ${t2(label.name)}` }),
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
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:statusLight", name: t2("settings.statusLight"), hint: t2("settings.statusLightDetail"), end: /* @__PURE__ */ (0, jsx)(Switch, { on: light }), onPress: () => setStatusLight(!light) })
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
        /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:language", name: current, hint: t2("language.subtitle"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: open ? "chevronDown" : "chevronUp", color: colors.muted }), onPress: () => setOpen((value) => !value) }),
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
  // The download speed limit (state/speed-limit.js): one pill per choice, the chosen one filled.
  function SpeedFace({ label, chosen }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, { round: "md" }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(21, chosen ? colors.accentFg : focused ? colors.fg : colors.muted, { fontWeight: 600 }), children: label })
    ] });
  }
  function SpeedLimitRow() {
    const t2 = useT();
    const limit = useSpeedLimit();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 10 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: text(23, colors.fg, { fontWeight: 600 }), children: t2("settings.speedLimit") }),
        /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.speedLimitDetail") })
      ] }),
      /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", gap: 12 }, children: SPEED_LIMITS.map((value) => /* @__PURE__ */ (0, jsx)(View, {
        focusKey: `settings:speed:${value}`,
        focusable: true,
        onPress: () => setSpeedLimit(value),
        style: { position: "relative", flex: value ? 1 : 2, height: 56, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: value === limit ? colors.accent : colors.surface2 },
        children: /* @__PURE__ */ (0, jsx)(SpeedFace, { label: value ? t2("units.speed", { n: String(value) }) : t2("settings.speedUnlimited"), chosen: value === limit })
      }, value)) })
    ] });
  }
  // Drives, the speed limit and whether a download in parts opens the browser for its next part by itself.
  function DownloadsCard() {
    const t2 = useT();
    const drives = useDrives();
    const autoParts = useAutoContinueParts();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "download", title: t2("settings.card.downloads") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:autoParts", name: t2("settings.autoParts"), hint: t2("settings.autoPartsDetail"), end: /* @__PURE__ */ (0, jsx)(Switch, { on: autoParts }), onPress: () => setAutoContinueParts(!autoParts) }),
      /* @__PURE__ */ (0, jsx)(View, { style: { height: 1, marginVertical: 8, backgroundColor: colors.line } }),
      /* @__PURE__ */ (0, jsx)(SpeedLimitRow, {}),
      /* @__PURE__ */ (0, jsx)(View, { style: { height: 1, marginVertical: 8, backgroundColor: colors.line } }),
      ...drives.roots.map((root) => /* @__PURE__ */ (0, jsx)(Drive, { root, usage: drives.usage[root] }, root))
    ] });
  }
  function FeedsCard({ onAdd, onMirror }) {
    const t2 = useT();
    const feeds = useFeeds();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "layers", title: t2("settings.card.feeds") }),
      ...feeds.map((feed) => /* @__PURE__ */ (0, jsx)(FeedRow, { feed, onMirror }, feed.url)),
      feeds.length < MAX_FEEDS ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:feeds:add", name: t2("settings.feeds.add"), hint: `${t2("settings.feeds.detail")} ${t2("settings.feeds.addHint", { count: MAX_FEEDS })}.`, end: /* @__PURE__ */ (0, jsx)(Icon, { name: "external", color: colors.muted }), onPress: onAdd }) : null,
      feeds.length ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:feeds:refresh", name: t2("settings.feeds.refresh"), detail: feeds.some((feed) => feed.state === "refreshing") ? t2("settings.feeds.refreshing") : null, hint: t2("settings.feeds.refreshHint"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: "restart", color: colors.muted }), onPress: () => void refreshFeeds() }) : null,
      feeds.some((feed) => feed.restart) ? /* @__PURE__ */ (0, jsx)(Callout, { children: t2("settings.feeds.restart") }) : null
    ] });
  }
  // What the TorBox account looks like, from the last connection test (state/debrid.js).
  function accountText(t2, account) {
    if (!account) return null;
    const plan = t2(`settings.debrid.plan.${account.planName}`);
    if (!account.premium) return t2("settings.debrid.free");
    return account.expiresAt ? t2("settings.debrid.okUntil", { plan, date: formatDate2(account.expiresAt.slice(0, 10)) }) : t2("settings.debrid.ok", { plan });
  }
  // Debrid providers: the TorBox API key (typed in, kept as its last four characters on screen), a
  // connection test that pauses a running download while it asks (the network is one task at a time),
  // and removing the key. With a key, the source list offers TorBox on the hosts it supports.
  // 0.5.1: AllDebrid's account, from its last connection test.
  function allDebridText(t2, account) {
    if (!account) return null;
    if (!account.premium) return t2("settings.alldebrid.free");
    return account.expiresAt ? t2("settings.alldebrid.okUntil", { date: formatDate2(account.expiresAt.slice(0, 10)) }) : t2("settings.alldebrid.ok");
  }
  var quietly = (reason, work) => downloadQueue().quietNetwork ? downloadQueue().quietNetwork(reason, work) : work();
  function DebridCard({ onKey, onAllDebridKey }) {
    const t2 = useT();
    const debrid = useDebrid();
    const [test, setTest] = (0, useState)({ state: "idle", error: "" });
    const [allTest, setAllTest] = (0, useState)({ state: "idle", error: "" });
    const runAll = () => {
      if (allTest.state === "testing") return;
      setAllTest({ state: "testing", error: "" });
      testAllDebrid({ quiet: quietly }).then(
        () => setAllTest({ state: "ok", error: "" }),
        (error2) => setAllTest({ state: "failed", error: error2.message })
      );
    };
    const all = debrid.allDebrid;
    const allStatus = allTest.state === "testing" ? t2("settings.alldebrid.testing") : allTest.state === "failed" ? null : allDebridText(t2, all.account);
    const run = () => {
      if (test.state === "testing") return;
      setTest({ state: "testing", error: "" });
      testTorBox({ quiet: (reason, work) => downloadQueue().quietNetwork ? downloadQueue().quietNetwork(reason, work) : work() }).then(
        () => setTest({ state: "ok", error: "" }),
        (error2) => setTest({ state: "failed", error: error2.message })
      );
    };
    const status = test.state === "testing" ? t2("settings.debrid.testing") : test.state === "failed" ? null : accountText(t2, debrid.account);
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "zap", title: t2("settings.card.debrid") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:torbox:key", name: t2("settings.debrid.key"), detail: debrid.configured ? t2("settings.debrid.keySet", { key: debrid.masked }) : t2("settings.debrid.keyNone"), hint: `${t2("settings.debrid.detail")} ${t2("settings.debrid.stored")}`, end: /* @__PURE__ */ (0, jsx)(Icon, { name: "chevronRight", color: colors.muted }), onPress: onKey }),
      debrid.configured ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:torbox:test", name: t2("settings.debrid.test"), detail: status, hint: t2("settings.debrid.testDetail"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: test.state === "testing" ? "globe" : "restart", color: colors.muted }), onPress: run }) : null,
      test.state === "failed" ? /* @__PURE__ */ (0, jsx)(Callout, { tone: "error", children: test.error }) : null,
      debrid.configured ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:torbox:remove", name: t2("settings.debrid.remove"), hint: t2("settings.debrid.removeDetail"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: "trash", color: colors.muted }), onPress: () => {
        setTorBoxKey("");
        setTest({ state: "idle", error: "" });
      } }) : null,
      // 0.5.1: AllDebrid, used when TorBox has no key.
      jsx(Row, { focusKey: "settings:alldebrid:key", name: t2("settings.alldebrid.key"), detail: all.configured ? t2("settings.debrid.keySet", { key: all.masked }) : t2("settings.debrid.keyNone"), hint: t2("settings.alldebrid.stored"), end: jsx(Icon, { name: "chevronRight", color: colors.muted }), onPress: onAllDebridKey }),
      all.configured ? jsx(Row, { focusKey: "settings:alldebrid:test", name: t2("settings.debrid.test"), detail: allStatus, hint: t2("settings.alldebrid.testDetail"), end: jsx(Icon, { name: allTest.state === "testing" ? "globe" : "restart", color: colors.muted }), onPress: runAll }) : null,
      allTest.state === "failed" ? jsx(Callout, { tone: "error", children: allTest.error }) : null,
      all.configured ? jsx(Row, { focusKey: "settings:alldebrid:remove", name: t2("settings.debrid.remove"), hint: t2("settings.alldebrid.removeDetail"), end: jsx(Icon, { name: "trash", color: colors.muted }), onPress: () => {
        setAllDebridKey("");
        setAllTest({ state: "idle", error: "" });
      } }) : null,
      all.configured && debrid.configured ? jsx(Callout, { children: t2("settings.alldebrid.both") }) : null
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
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:guide", name: open ? t2("settings.guide.hide") : t2("settings.guide.show"), hint: t2("settings.guide.detail"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: open ? "chevronUp" : "chevronDown", color: colors.muted }), onPress: () => setOpen((value) => !value) }),
      ...open ? steps.map(([title, detail], index) => /* @__PURE__ */ (0, jsx)(View, { focusKey: `settings:guide:${index}`, focusable: true, style: STEP, children: /* @__PURE__ */ (0, jsx)(StepFace, { index, title, detail }) }, index)) : []
    ] });
  }
  // What the update row says: checking, a newer version (downloading, ready to install, or not installed),
  // a failed check, or when it last looked.
  function updateDetail(t2, update, install) {
    if (update.checking) return t2("settings.update.checking");
    const version = update.update?.version;
    if (version && install.version === version) {
      if (["ready", "armed"].includes(install.phase)) return t2("settings.update.ready", { version });
      if (["waiting", "downloading", "checking"].includes(install.phase))
        return t2("settings.update.downloading", { version, percent: String(install.total ? Math.floor(Math.min(1, install.written / install.total) * 100) : 0) });
      if (install.phase === "failed") return t2("settings.update.installFailed", { version });
    }
    if (update.update) return t2("settings.update.available", { version: update.update.version });
    if (update.failed) return t2("settings.update.failed");
    return update.checkedAt ? t2("settings.update.current", { date: formatDate2(isoDate(update.checkedAt)) }) : t2("settings.update.never");
  }
  // The optional donation link: a QR code for the phone and a short note, shown only when the row is
  // opened. Nothing in the app depends on it, asks for it or reminds anyone of it.
  var SUPPORT_URL = "https://buymeacoffee.com/jvk3r";
  // The panel takes focus when it opens, so the page scrolls until the whole code shows and stays there for a
  // phone to scan (only the rows around it could take focus before, and either one scrolled half the code
  // away). Cross on it folds it again.
  function SupportPanel({ onClose }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { focusKey: "settings:support:qr", onPress: onClose, style: { position: "relative", flexDirection: "row", alignItems: "center", gap: 28, borderRadius: radius.md, backgroundColor: colors.surface2, padding: 22 }, children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, { round: "md" }),
      // Drawn at the image's own size (packaging/support-qr.py: 37 modules x 6 px), so no module edge blurs.
      /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.md, backgroundColor: "#ffffff", padding: 6 }, children: /* @__PURE__ */ (0, jsx)(Image, { source: supportQr, resizeMode: "contain", style: { width: 222, height: 222 } }) }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 12 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: text(21, colors.fg), children: t2("settings.support.note") }),
        /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.support.free") }),
        /* @__PURE__ */ (0, jsx)(Text, { style: text(19, colors.subtle), children: t2("settings.support.scan") }),
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 20, lineHeight: 28, color: colors.glow }, children: SUPPORT_URL.replace("https://", "") })
      ] })
    ] });
  }
  // 0.5.1: "Report a bug": press once to arm, again to send the logs to the Jobee'sLair Discord (state/bug-report.js).
  // Only in a build that has the relay's address.
  function ReportRow() {
    const t2 = useT();
    const [available] = (0, useState)(() => Boolean(reportRelay()));
    const [report, setReport] = (0, useState)({ state: "idle", error: "" });
    (0, useEffect)(() => {
      if (report.state !== "armed") return void 0;
      const timer = setTimeout(() => setReport({ state: "idle", error: "" }), 4e3);
      return () => clearTimeout(timer);
    }, [report.state]);
    if (!available) return null;
    const press = () => {
      if (report.state === "sending") return;
      if (report.state !== "armed") return setReport({ state: "armed", error: "" });
      setReport({ state: "sending", error: "" });
      sendReport({ queue: downloadQueue() }).then(
        () => setReport({ state: "sent", error: "" }),
        (error2) => setReport({ state: "failed", error: error2.message })
      );
    };
    const detail = report.state === "armed" ? t2("settings.report.armed") : report.state === "sending" ? t2("settings.report.sending") : report.state === "sent" ? t2("settings.report.sent") : null;
    return jsxs(Fragment, { children: [
      jsx(Row, { focusKey: "settings:bugReport", name: t2("settings.report.row"), detail, hint: t2("settings.report.detail"), end: jsx(Icon, { name: report.state === "sent" ? "circleCheck" : "alert", color: report.state === "armed" ? colors.glow : colors.muted }), onPress: press }),
      report.state === "failed" ? jsx(Callout, { tone: "error", children: report.error }) : null
    ] });
  }
  // 0.5.2: the announcements up now, whole (the bar under the top island can cut a long one short), the stats
  // switch and what it sends (state/online.js).
  function OnlineRows() {
    const t2 = useT();
    const { enabled, announcements } = useOnline();
    return jsxs(Fragment, { children: [
      ...announcements.map((note) => jsx(Callout, { tone: note.level === "warning" ? "warn" : "info", children: `${t2("news.title")}: ${note.text}` }, note.id)),
      jsx(Row, { focusKey: "settings:stats", name: t2("settings.online.row"), hint: t2("settings.online.detail"), end: jsx(Switch, { on: enabled }), onPress: () => online().setEnabled(!enabled) }),
      jsx(Folded, { focusKey: "settings:stats:what", name: t2("settings.online.what"), paragraphs: [t2("settings.online.sends"), t2("settings.online.never")] })
    ] });
  }
  function AboutCard() {
    const t2 = useT();
    const { online: count } = useOnline();
    const update = useUpdate();
    const install = useInstall();
    const automatic = useAutoInstall();
    const [support, setSupport] = (0, useState)(false);
    const { focusLater } = useNavActions();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "star", title: t2("settings.card.about") }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 24 }, children: [
        /* @__PURE__ */ (0, jsx)(JLMark, { height: 72 }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 4 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: text(26, colors.fg, { fontWeight: 600 }), children: t2("settings.about.version", { version: VERSION_LABEL }) }),
          /* @__PURE__ */ (0, jsx)(Text, { style: text(22, colors.glow), children: t2("settings.about.creator", { creator: CREATOR }) }),
          /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.about.ai", { creator: CREATOR }) }),
          count ? jsx(Text, { style: text(20, colors.glow), children: t2("online.now", { count: formatNumber2(count) }) }) : null
        ] })
      ] }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:update", name: t2("settings.update.row"), detail: updateDetail(t2, update, install), end: /* @__PURE__ */ (0, jsx)(Icon, { name: update.update ? "download" : "restart", color: update.update ? colors.glow : colors.muted }), onPress: () => update.update ? openUpdateDialog() : void checkForUpdate() }),
      canInstall ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:autoUpdate", name: t2("settings.update.auto"), hint: t2("settings.update.autoDetail"), end: /* @__PURE__ */ (0, jsx)(Switch, { on: automatic }), onPress: () => setAutoInstall(!automatic) }) : null,
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:project", name: t2("settings.about.project"), detail: `github.com/${REPO}`, end: /* @__PURE__ */ (0, jsx)(Icon, { name: "external", color: colors.muted }), onPress: () => {
        try {
          Linking.openURL(`https://github.com/${REPO}`);
        } catch {
        }
      } }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:support", name: t2("settings.support.row"), hint: t2("settings.support.detail"), end: /* @__PURE__ */ (0, jsx)(Icon, { name: support ? "chevronUp" : "chevronDown", color: colors.muted }), onPress: () => {
        setSupport(!support);
        if (!support) focusLater("settings:support:qr");
      } }),
      support ? /* @__PURE__ */ (0, jsx)(SupportPanel, { onClose: () => {
        setSupport(false);
        focusLater("settings:support");
      } }) : null,
      jsx(ReportRow, {}),
      jsx(OnlineRows, {}),
      /* @__PURE__ */ (0, jsx)(Folded, { focusKey: "settings:credits", name: t2("settings.about.creditsRow"), paragraphs: [t2("settings.about.origin"), t2("settings.about.credits")] })
    ] });
  }
  // The content neutrality and takedown notice (the same text as README.md and LICENSE): what the app is, what it
  // does not hold, who configures what, and how to report an infringing feed or catalog entry.
  function NoticeCard() {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, style: CARD, children: [
      /* @__PURE__ */ (0, jsx)(CardHead, { icon: "alert", title: t2("settings.card.legal") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(20, colors.muted), children: t2("settings.legal.neutral") }),
      /* @__PURE__ */ (0, jsx)(Folded, { focusKey: "settings:legal:read", name: t2("settings.legal.read"), paragraphs: [t2("settings.legal.nohost"), t2("settings.legal.feeds"), t2("settings.legal.report")] }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "settings:report", name: t2("settings.legal.reportRow"), detail: `github.com/${REPO}/issues`, end: /* @__PURE__ */ (0, jsx)(Icon, { name: "external", color: colors.muted }), onPress: () => {
        try {
          Linking.openURL(`https://github.com/${REPO}/issues/new?template=takedown.yml`);
        } catch {
        }
      } })
    ] });
  }
  // ---- The section (0.5.0 Pre Release 3) -------------------------------------------------------------------
  // Settings is a section like Downloads and Files: the island's gear, or L1/R1, opens it, and Circle goes back.
  // Its categories are on the left: focusing one shows its cards on the right (Right or Cross goes into
  // them, Left comes back to the category). Every dialog it opens hands focus back to the row that opened it:
  // a dialog that closed without doing so left focus nowhere, and the page could not be moved or left.
  var CATEGORIES = [
    { id: "companion", icon: "globe", label: "settings.companion" },
    { id: "downloads", icon: "download", label: "settings.card.downloads" },
    { id: "feeds", icon: "layers", label: "settings.card.feeds" },
    { id: "debrid", icon: "zap", label: "settings.card.debrid" },
    { id: "look", icon: "disc", label: "settings.card.look" },
    { id: "guide", icon: "list", label: "settings.card.guide" },
    { id: "about", icon: "star", label: "settings.card.about" }
    // 0.5.1: the homebrew-only edition has no store to feed, no debrid, no companion and no source guide.
  ].filter((item) => !HOMEBREW_ONLY || ["downloads", "look", "about"].includes(item.id));
  var RAIL = 420;
  function CategoryFace({ icon, label, selected }) {
    const focused = useIsFocused();
    const lit = selected || focused;
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, { round: "md" }),
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 5, height: 30, borderRadius: radius.pill, backgroundColor: selected ? colors.accentHi : "transparent" } }),
      /* @__PURE__ */ (0, jsx)(Icon, { name: icon, size: 20, color: lit ? colors.glow : colors.muted }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(23, lit ? colors.fg : colors.muted, { flex: 1, fontWeight: selected ? 600 : 400, numberOfLines: 1, ellipsizeMode: "tail" }), children: label })
    ] });
  }
  function SettingsScreen({ onBack, start = HOMEBREW_ONLY ? "downloads" : "companion" }) {
    const t2 = useT();
    const { focusLater } = useNavActions();
    const [category, setCategory] = (0, useState)(start);
    const [adding, setAdding] = (0, useState)(false);
    const [mirrorOf, setMirrorOf] = (0, useState)(null);
    const [pinMode, setPinMode] = (0, useState)(null);
    const [keying, setKeying] = (0, useState)(false);
    const [keyingAll, setKeyingAll] = (0, useState)(false);
    // Drawn again in a newly chosen accent while open; the rest of the store follows once it is left.
    useActiveTheme();
    (0, useEffect)(() => () => commitTheme(), []);
    // A closed dialog gives focus back to the row it came from.
    const closed = (key) => focusLater(key);
    const cards = {
      companion: [/* @__PURE__ */ (0, jsx)(CompanionCard, { onChoosePin: setPinMode }, "companion")],
      downloads: [/* @__PURE__ */ (0, jsx)(DownloadsCard, {}, "downloads")],
      feeds: [/* @__PURE__ */ (0, jsx)(FeedsCard, { onAdd: () => setAdding(true), onMirror: setMirrorOf }, "feeds")],
      debrid: [/* @__PURE__ */ (0, jsx)(DebridCard, { onKey: () => setKeying(true), onAllDebridKey: () => setKeyingAll(true) }, "debrid")],
      look: [/* @__PURE__ */ (0, jsx)(ThemeCard, {}, "theme"), /* @__PURE__ */ (0, jsx)(LanguageCard, {}, "language"), /* @__PURE__ */ (0, jsx)(FeedbackCard, {}, "feedback"), /* @__PURE__ */ (0, jsx)(ScreenSaverCard, {}, "screenSaver")],
      guide: [/* @__PURE__ */ (0, jsx)(GuideCard, {}, "guide")],
      about: [/* @__PURE__ */ (0, jsx)(AboutCard, {}, "about"), /* @__PURE__ */ (0, jsx)(NoticeCard, {}, "notice")]
    };
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1 }, children: [
      /* @__PURE__ */ (0, jsx)(FocusScope, { autoFocus: true, onBack: () => {
        onBack();
        return true;
      }, children: /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, flexDirection: "row", gap: 48, paddingHorizontal: 48 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { width: RAIL, gap: 6, paddingTop: 18 }, children: [
          /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 18, marginBottom: 24 }, children: [
            /* @__PURE__ */ (0, jsx)(JLMark, { height: 44 }),
            /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 0 }, children: [
              /* @__PURE__ */ (0, jsx)(Text, { style: text(36, colors.fg, { fontWeight: 700, letterSpacing: 1 }), children: t2("settings.title") }),
              /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "JetBrainsMono-Regular", fontSize: 17, lineHeight: 24, color: colors.subtle }, children: `v${VERSION_LABEL}` })
            ] })
          ] }),
          /* @__PURE__ */ (0, jsx)(FocusScope, { focusKey: "settings:categories", children: CATEGORIES.map((item, index) => /* @__PURE__ */ (0, jsx)(View, {
            focusKey: `settings:cat:${item.id}`,
            autoFocus: item.id === start,
            onFocus: () => setCategory(item.id),
            onPress: () => focusLater("settings:content"),
            style: (state) => [{ position: "relative", height: 64, flexDirection: "row", alignItems: "center", gap: 16, borderRadius: radius.md, paddingHorizontal: 14 }, category === item.id || state.focused ? { backgroundColor: colors.surface2 } : null],
            children: /* @__PURE__ */ (0, jsx)(CategoryFace, { icon: item.icon, label: t2(item.label), selected: category === item.id })
          }, item.id)) })
        ] }),
        /* @__PURE__ */ (0, jsx)(FocusScope, { focusKey: "settings:content", ends: ["down"], children: /* @__PURE__ */ (0, jsx)(ScrollView, { style: { flex: 1, gap: 32, paddingTop: 18, paddingBottom: 72 }, children: cards[category] }, category) })
      ] }) }),
      adding ? /* @__PURE__ */ (0, jsx)(URLDialog, { title: t2("settings.feeds.add"), detail: t2("settings.feeds.addDetail"), submit: addFeed, onClose: () => {
        setAdding(false);
        closed("settings:feeds:add");
      } }) : null,
      mirrorOf ? /* @__PURE__ */ (0, jsx)(URLDialog, { title: t2("settings.feeds.addMirror"), detail: t2("settings.feeds.mirrorDetail"), submit: (value) => addMirror(mirrorOf, value), onClose: () => {
        const url = mirrorOf;
        setMirrorOf(null);
        closed(`settings:feed:${url}`);
      } }) : null,
      keying ? /* @__PURE__ */ (0, jsx)(URLDialog, { title: t2("settings.debrid.keyTitle"), detail: t2("settings.debrid.keyDetail"), initial: "", submit: setTorBoxKey, onClose: () => {
        setKeying(false);
        closed("settings:torbox:key");
      } }) : null,
      keyingAll ? jsx(URLDialog, { title: t2("settings.alldebrid.key"), detail: t2("settings.alldebrid.keyDetail"), initial: "", submit: setAllDebridKey, onClose: () => {
        setKeyingAll(false);
        closed("settings:alldebrid:key");
      } }) : null,
      pinMode ? /* @__PURE__ */ (0, jsx)(PinDialog, { mode: pinMode, onDone: choosePin, onClose: () => {
        const mode = pinMode;
        setPinMode(null);
        closed(mode === "change" ? "settings:pin" : "settings:companion");
      } }) : null
    ] });
  }

export { SettingsScreen };
