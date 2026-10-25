// One app's page in the Homebrew section: its picture, name and maker over its own background art, what it
// is and what installing it does, the buttons (install, update, run a payload, pick another file, remove,
// open its repository), then its screenshots, its README's opening, what its newest release changed, and the
// facts (repository, licence, stars, release, files). Every file installs from the author's own release.
// MODIFIED (0.5.0 Pre Release 2): the top is the page's scroll anchor, so going back up shows it whole (it
// stopped at the buttons before), and it grows with its content instead of cutting wrapped buttons off; a
// "Homebrew › category" trail and the section's own color (palette.js).

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { MediaGallery } from '../game/MediaGallery.jsx';
import { ShotViewer } from '../game/ShotViewer.jsx';
import { useT } from '../i18n/index.js';
import en from '../i18n/locales/en.json';
import { formatDate3 } from '../state/catalog.js';
import { isoDate } from '../state/clock.js';
import { deviceFacts } from '../state/device.js';
import { ps5FakePackagesLaunch } from '../state/firmware.js';
import { roleOf } from '../state/homebrew-index.js';
import { homebrew, useHomebrewStatus } from '../state/homebrew-store.js';
import { useNavActions } from '../state/nav.jsx';
import { formatBytes } from '../state/size.js';
import { Button2 } from '../ui/Button.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { ProgressBar } from '../ui/ProgressBar.jsx';
import { SideSheet } from '../ui/SideSheet.jsx';
import { colors, radius } from '../ui/colors.js';
import { EASE_OUT } from '../ui/ease.js';
import { HomebrewArt, gradientOf } from './HomebrewArt.jsx';
import { RemoveSheet } from './RemoveSheet.jsx';
import { hb, hbTint } from './palette.js';
import { AnimatePresence, FocusScope, Image, Linking, Platform, ScrollView, Text, View, motion } from '@ps5-react/core';

  var HERO_HEIGHT = 470;
  var rise = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { type: "tween", duration: 0.5, ease: EASE_OUT } };
  var TEXT = { fontFamily: "Exo2", fontSize: 23, lineHeight: 36, color: colors.fg };
  var HEADING = { fontFamily: "Exo2", fontSize: 30, fontWeight: 600, color: colors.fg, lineHeight: 42, letterSpacing: 0.4, marginBottom: 18 };
  var MONO = { fontFamily: "JetBrainsMono-Regular", fontSize: 18, lineHeight: 26, color: colors.muted };
  var label = (key) => en[key];
  var daysSince = (ms) => Math.max(0, Math.floor((Date.now() - ms) / 864e5));
  function when(t2, ms) {
    if (!ms) return "—";
    const days = daysSince(ms);
    if (days === 0) return t2("homebrew.today");
    if (days < 45) return t2("homebrew.daysAgo", { count: days });
    return formatDate3(isoDate(ms));
  }
  // ---- The top ---------------------------------------------------------------------------------------
  function Tag({ icon, text, tone }) {
    const color = tone === "accent" ? hb().fg : tone === "warn" ? "#1c1300" : colors.fg;
    const background = tone === "accent" ? hb().accent : tone === "warn" ? "#fbbf24" : `${colors.canvas}b3`;
    return jsxs(View, { style: { height: 42, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.pill, backgroundColor: background, paddingHorizontal: 16 }, children: [
      icon ? jsx(Icon, { name: icon, size: 12, color }) : null,
      jsx(Text, { style: { fontFamily: "Exo2", fontSize: 19, fontWeight: 600, lineHeight: 26, color }, children: text })
    ] });
  }
  // What the app's file does once installed, in one line: the reason to read before installing.
  function whatItDoes(t2, app, file) {
    const role = roleOf(file);
    if (role === "app") return t2("homebrew.does.app");
    if (role === "payload") return t2("homebrew.does.payload");
    const launches = ps5FakePackagesLaunch(deviceFacts().firmware);
    return launches === false ? t2("homebrew.does.packageOld") : t2("homebrew.does.package");
  }
  // Removes an app and says how it went, once it has: 0.5.2, with where what it saved was kept, if it was.
  function removeApp(store, app, record, keep, t2, onMessage) {
    let done;
    try {
      done = store.remove(app.id, { keep });
    } catch (error) {
      onMessage({ bad: true, text: error.message });
      return;
    }
    void Promise.resolve(done).then(
      (kept) => onMessage({ text: kept ? t2("homebrew.removedKept", { name: app.name, path: kept }) : t2(record.run ? "homebrew.removedPayload" : "homebrew.removedApp", { name: app.name }) }),
      (error) => onMessage({ bad: true, text: error.message })
    );
  }
  function Actions({ app, status, onFiles, onMessage, onRemove }) {
    const t2 = useT();
    const store = homebrew();
    const task = status.task;
    const primaryFile = app.files[0];
    const install = (name) => {
      try {
        store.install(app.id, name);
        onMessage(null);
      } catch (error) {
        onMessage({ bad: true, text: error.message });
      }
    };
    const run = () => {
      try {
        const result = store.run(app.id);
        onMessage(result.ok ? { text: t2("homebrew.ran", { name: app.name }) } : { bad: true, text: result.error });
      } catch (error) {
        onMessage({ bad: true, text: error.message });
      }
    };
    // The helper (an emulator's payload) runs only once ShadowMount has the app mounted: asked every few seconds.
    const hasHelper = Boolean(status.record?.helper);
    const [ready, setReady] = useState(null);
    useEffect(() => {
      if (!hasHelper) return void 0;
      let live = true;
      const check = () => store.helperReady(app.id, { quick: true }).then((answer) => live && setReady(answer), () => {});
      check();
      const timer = setInterval(check, 3000);
      return () => {
        live = false;
        clearInterval(timer);
      };
    }, [app.id, hasHelper]);
    const runHelper = async () => {
      try {
        const result = await store.runHelper(app.id);
        if (result.ok) onMessage({ text: t2("homebrew.helperRan", { name: app.name }) });
        else if (result.reason === "notMounted") onMessage({ bad: true, text: t2("homebrew.helperNotMounted", { name: app.name }) });
        else if (result.reason === "unknown") onMessage({ bad: true, text: t2("homebrew.helperUnknown", { name: app.name }) });
        else onMessage({ bad: true, text: result.error });
      } catch (error) {
        onMessage({ bad: true, text: error.message });
      }
    };
    // The install, progress, update, run and reinstall buttons share one key: the button the player just pressed is
    // updated in place. A new key would unmount it, and focus would jump to the nearest thing, lower on the page.
    const buttons = [];
    if (task) {
      const percent = task.total ? Math.min(100, Math.floor(task.written / task.total * 100)) : null;
      const text = task.phase === "waiting" ? t2("homebrew.phase.waiting") : task.phase === "downloading" ? t2("homebrew.phase.downloading", { percent: percent ?? 0 }) : task.phase === "extracting" ? t2("homebrew.phase.extracting") : t2("homebrew.phase.installing");
      buttons.push(jsx(Button2, { focusKey: "hb:install", variant: "primary", tint: hbTint(), size: "lg", label: text, icon: "download", onPress: () => {} }, "main"));
      buttons.push(jsx(Button2, { focusKey: "hb:cancel", variant: "outline", size: "lg", label: t2("homebrew.cancel"), icon: "x", onPress: () => store.cancel(app.id) }, "cancel"));
    } else if (status.update) {
      buttons.push(jsx(Button2, { focusKey: "hb:install", variant: "primary", tint: hbTint(), size: "lg", label: t2("homebrew.updateTo", { version: app.release.tag }), icon: "restart", onPress: () => install(status.record?.file && app.files.some((f) => f.name === status.record.file) ? status.record.file : void 0) }, "main"));
    } else if (!status.installed) {
      buttons.push(jsx(Button2, { focusKey: "hb:install", variant: "primary", tint: hbTint(), size: "lg", label: status.failed ? t2("homebrew.retry") : t2("homebrew.install"), icon: status.failed ? "restart" : "download", onPress: () => install() }, "main"));
    }
    if (!task && status.record?.run) buttons.push(jsx(Button2, { focusKey: status.update ? "hb:run" : "hb:install", variant: status.update ? "secondary" : "primary", tint: hbTint(), size: "lg", label: t2("homebrew.run"), icon: "play", iconFill: true, onPress: run }, status.update ? "run" : "main"));
    if (!task && status.installed && !status.update && !status.record?.run) buttons.push(jsx(Button2, { focusKey: "hb:install", variant: "secondary", size: "lg", label: t2("homebrew.reinstall"), icon: "restart", onPress: () => install(status.record?.file) }, "main"));
    if (!task && app.files.length > 1) buttons.push(jsx(Button2, { focusKey: "hb:files", variant: "outline", size: "lg", label: t2("homebrew.otherFiles", { count: app.files.length }), icon: "list", onPress: onFiles }, "files"));
    // After the install buttons, so the page never opens with focus on Run helper (it is sent only once the app is mounted).
    if (!task && hasHelper) {
      buttons.push(jsx(Button2, { focusKey: "hb:helper", variant: ready?.ok ? "secondary" : "outline", tint: ready?.ok ? hbTint() : void 0, size: "lg", label: t2("homebrew.runHelper"), icon: "play", iconFill: true, onPress: runHelper }, "helper"));
      buttons.push(jsx(Button2, { focusKey: "hb:helper-off", variant: "outline", size: "lg", icon: "trash", label: t2("homebrew.removeHelper"), onPress: () => {
        try {
          store.removeHelper(app.id);
          onMessage({ text: t2("homebrew.helperRemoved") });
        } catch (error) {
          onMessage({ bad: true, text: error.message });
        }
      } }, "helper-off"));
    }
    // Remove helper takes the helper off the console; this fetches it again (the app itself is not touched).
    if (!task && status.installed && !hasHelper && (app.with?.length ?? 0) > 0) {
      buttons.push(jsx(Button2, { focusKey: "hb:helper", variant: "outline", size: "lg", label: t2("homebrew.installHelper"), icon: "download", onPress: () => {
        try {
          store.installHelper(app.id);
        } catch (error) {
          onMessage({ bad: true, text: error.message });
        }
      } }, "helper-install"));
    }
    // 0.5.2: an app that saved things in its own folder asks first whether to keep them (RemoveSheet).
    if (!task && status.record) buttons.push(jsx(Button2, { focusKey: "hb:remove", variant: "outline", size: "lg", icon: "trash", label: t2("homebrew.remove"), onPress: () => {
      let saved = null;
      try {
        saved = store.savedData(app.id);
      } catch {
      }
      if (saved) onRemove(saved);
      else removeApp(store, app, status.record, false, t2, onMessage);
    } }, "remove"));
    if (Platform.OS === "ps5") buttons.push(jsx(Button2, { focusKey: "hb:github", variant: "outline", size: "lg", icon: "external", label: t2("homebrew.github"), onPress: () => {
      try {
        Linking.openURL(`https://github.com/${app.repo}`);
      } catch {
      }
    } }, "github"));
    return jsxs(View, { style: { gap: 18 }, children: [
      jsx(View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 18 }, children: buttons }),
      task && task.total ? jsx(ProgressBar, { fraction: Math.min(1, task.written / task.total), width: 480, active: task.phase !== "waiting" }) : null,
      jsx(Text, { style: { fontFamily: "Exo2", fontSize: 21, lineHeight: 30, color: colors.muted, width: 1100 }, children: whatItDoes(t2, app, status.record ? app.files.find((f) => f.name === status.record.file) ?? primaryFile : primaryFile) }),
      !task && hasHelper ? jsx(Text, { style: { fontFamily: "Exo2", fontSize: 21, lineHeight: 30, color: ready?.ok ? "#86efac" : "#fbbf24", width: 1100 }, children: ready?.ok === false && ready.reason === "notMounted" ? t2("homebrew.helperNotMounted", { name: app.name }) : status.record.helperRunAt ? t2("homebrew.helperLast", { when: when(t2, status.record.helperRunAt), name: app.name }) : t2("homebrew.helperNever", { name: app.name }) }) : null
    ] });
  }
  function Hero({ app, status, onFiles, message, onMessage, onRemove }) {
    const t2 = useT();
    const store = homebrew();
    const category = store.index.categories.find((c) => c.id === app.category);
    const categoryKey = `homebrew.category.${app.category}`;
    const categoryName = t2(categoryKey) === categoryKey ? category?.name ?? "" : t2(categoryKey);
    const tags = [
      jsx(Tag, { icon: "package", text: t2(`homebrew.kind.${roleOf(app.files[0])}`) }, "kind"),
      jsx(Tag, { icon: "star", text: String(app.stars) }, "stars"),
      jsx(Tag, { text: app.release.tag }, "tag")
    ];
    if (app.release.prerelease) tags.push(jsx(Tag, { text: t2("homebrew.prerelease"), tone: "warn" }, "pre"));
    if (status.update) tags.push(jsx(Tag, { icon: "restart", text: t2("homebrew.updateFrom", { version: status.record.tag }), tone: "accent" }, "update"));
    else if (status.record) tags.push(jsx(Tag, { icon: "check", text: t2("homebrew.installedVersion", { version: status.record.tag }) }, "installed"));
    else if (status.outside) tags.push(jsx(Tag, { icon: "check", text: t2("homebrew.foundOnConsole") }, "found"));
    return jsxs(View, { scrollAnchor: true, style: { minHeight: HERO_HEIGHT, overflow: "hidden", backgroundGradient: gradientOf(app.category) }, children: [
      app.hero ? jsx(Image, { source: { uri: app.hero }, resizeMode: "cover", style: { position: "absolute", top: 0, right: 0, width: 1920, height: HERO_HEIGHT } }) : null,
      jsx(View, { style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundGradient: { type: "linear", to: "right", stops: [{ color: colors.canvas, offset: 0 }, { color: `${colors.canvas}eb`, offset: 0.45 }, { color: `${colors.canvas}80`, offset: 0.8 }, { color: `${colors.canvas}40`, offset: 1 }] } } }),
      jsx(View, { style: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120, backgroundGradient: { type: "linear", to: "top", stops: [{ color: colors.canvas, offset: 0 }, { color: "transparent", offset: 1 }] } } }),
      jsxs(motion.View, { ...rise, style: { paddingHorizontal: 48, paddingTop: 42, paddingBottom: 48, flexDirection: "row", gap: 48 }, children: [
        jsx(View, { style: { width: 260, height: 260 }, children: jsx(HomebrewArt, { app, size: 260, round: radius.xl }) }),
        jsxs(View, { style: { flex: 1, gap: 14 }, children: [
          jsxs(View, { style: { flexDirection: "row", alignItems: "center", gap: 10 }, children: [
            jsx(Icon, { name: "package", size: 13, color: hb().hi }),
            jsx(Text, { style: { fontFamily: "Exo2", fontSize: 19, fontWeight: 700, letterSpacing: 2.4, lineHeight: 26, color: hb().hi }, children: t2("homebrew.title").toUpperCase() }),
            jsx(Icon, { name: "chevronRight", size: 12, color: colors.subtle }),
            jsx(Text, { style: { fontFamily: "Exo2", fontSize: 19, fontWeight: 700, letterSpacing: 2.4, lineHeight: 26, color: hb().glow }, children: categoryName.toUpperCase() })
          ] }),
          jsx(Text, { style: { fontFamily: "Exo2", fontSize: 60, fontWeight: 700, lineHeight: 70, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, children: app.name }),
          jsx(Text, { style: { fontFamily: "Exo2", fontSize: 23, lineHeight: 32, color: colors.muted, numberOfLines: 1 }, children: t2("homebrew.by", { author: app.author, repo: app.repo }) }),
          jsx(View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 }, children: tags }),
          jsx(View, { style: { marginTop: 18 }, children: jsx(Actions, { app, status, onFiles, onMessage, onRemove }) }),
          message ? jsx(Text, { style: { fontFamily: "Exo2", fontSize: 21, lineHeight: 30, color: message.bad ? "#fca5a5" : "#86efac", width: 1100 }, children: message.text }) : status.failed ? jsx(Text, { style: { fontFamily: "Exo2", fontSize: 21, lineHeight: 30, color: "#fca5a5", width: 1100 }, children: t2("homebrew.failed", { error: status.failed }) }) : null
        ] })
      ] })
    ] });
  }
  // ---- The body --------------------------------------------------------------------------------------
  function Facts({ app, status }) {
    const t2 = useT();
    const rows = [
      [label("homebrew.facts.repository"), app.repo],
      [label("homebrew.facts.license"), app.license || t2("homebrew.noLicense")],
      [label("homebrew.facts.stars"), String(app.stars)],
      [label("homebrew.facts.release"), app.release.title || app.release.tag],
      [label("homebrew.facts.released"), when(t2, app.release.date)],
      [label("homebrew.facts.downloads"), String(app.release.downloads)]
    ];
    if (status.record) rows.push([label("homebrew.facts.installedTo"), (status.record.paths?.[0] || "").replace(/^\/data\//, "/data/")]);
    return jsxs(View, { style: { width: 432, gap: 18 }, children: [
      jsx(Text, { style: HEADING, children: t2("homebrew.facts") }),
      ...rows.map(([name, value]) => jsxs(View, { style: { gap: 2 }, children: [
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 18, lineHeight: 26, color: colors.subtle }, children: name }),
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 21, lineHeight: 30, color: colors.fg, numberOfLines: 2, ellipsizeMode: "tail" }, children: value })
      ] }, name)),
      jsx(Text, { style: { marginTop: 18, fontFamily: "Exo2", fontSize: 24, fontWeight: 600, lineHeight: 34, color: colors.fg }, children: t2("homebrew.files") }),
      ...app.files.map((file) => jsxs(View, { style: { gap: 2 }, children: [
        jsx(Text, { style: [MONO, { color: colors.fg, numberOfLines: 1, ellipsizeMode: "middle" }], children: file.name }),
        jsx(Text, { style: MONO, children: `${t2(`homebrew.kind.${roleOf(file)}`)}${file.size ? ` · ${formatBytes(file.size)}` : ""}` })
      ] }, file.name))
    ] });
  }
  function Paragraphs({ title, text, focusKey }) {
    if (!text) return null;
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(0, 8);
    // A focusable block, so the page scrolls to it and back with the d-pad.
    return jsxs(View, { scrollAnchor: true, focusKey, onPress: () => {}, style: { width: 1308, borderRadius: radius.lg, padding: 6 }, children: [
      jsx(FocusRing, { round: "lg", color: hb().hi }),
      jsx(Text, { style: HEADING, children: title }),
      ...paragraphs.map((p, i) => jsx(Text, { style: [TEXT, { marginBottom: 14, color: i === 0 ? colors.fg : colors.muted }], children: p }, i))
    ] });
  }
  function FilesSheet({ app, status, onClose, onPick }) {
    const t2 = useT();
    return jsx(SideSheet, { title: t2("homebrew.chooseFile"), subtitle: t2("homebrew.chooseFileDetail"), onClose, children: app.files.map((file, i) => jsxs(View, { focusKey: `hb:file:${i}`, onPress: () => onPick(file.name), style: { marginBottom: 12, borderRadius: radius.md, backgroundColor: colors.surface2, paddingHorizontal: 24, paddingVertical: 18, gap: 4 }, children: [
      jsx(FocusRing, { color: hb().hi }),
      jsx(Text, { style: { fontFamily: "Exo2", fontSize: 22, fontWeight: 600, lineHeight: 30, color: colors.fg, numberOfLines: 1, ellipsizeMode: "middle" }, children: file.name }),
      jsx(Text, { style: { fontFamily: "Exo2", fontSize: 19, lineHeight: 26, color: colors.subtle }, children: [t2(`homebrew.kind.${roleOf(file)}`), file.size ? formatBytes(file.size) : null, i === 0 ? t2("homebrew.recommended") : null, status.record?.file === file.name ? t2("homebrew.badge.installed") : null].filter(Boolean).join(" · ") })
    ] }, file.name)) });
  }
  function HomebrewApp({ id, onBack }) {
    const t2 = useT();
    const app = homebrew().app(id);
    const status = useHomebrewStatus(id);
    const { focusLater } = useNavActions();
    const [sheet, setSheet] = useState(false);
    // 0.5.2: what the app saved, while "Remove {name}?" asks whether to keep it.
    const [removing, setRemoving] = useState(null);
    const [viewing, setViewing] = useState(null);
    const [message, setMessage] = useState(null);
    useEffect(() => {
      if (!message) return void 0;
      const timer = setTimeout(() => setMessage(null), 9e3);
      return () => clearTimeout(timer);
    }, [message]);
    if (!app) return jsx(View, { style: { flex: 1, alignItems: "center", justifyContent: "center" }, children: jsx(Text, { style: { fontFamily: "Exo2", fontSize: 26, color: colors.muted }, children: t2("homebrew.gone") }) });
    const shots = app.shots.map((url) => ({ url, thumb: url }));
    return jsx(FocusScope, { trap: true, autoFocus: true, onBack: () => {
      onBack();
      return true;
    }, children: jsxs(View, { style: { position: "relative", flex: 1 }, children: [
      jsxs(ScrollView, { style: { flex: 1 }, children: [
        jsx(Hero, { app, status, message, onMessage: setMessage, onFiles: () => setSheet(true), onRemove: setRemoving }),
        jsx(View, { style: { paddingHorizontal: 48, paddingTop: 36, paddingBottom: 96 }, children: jsxs(View, { style: { flexDirection: "row", gap: 84 }, children: [
          jsxs(View, { style: { width: 1308, gap: 72 }, children: [
            shots.length ? jsx(MediaGallery, { shots, nextDown: "hb:about", onOpen: setViewing }) : null,
            jsx(Paragraphs, { focusKey: "hb:about", title: t2("homebrew.about"), text: [app.description, app.about].filter(Boolean).join("\n\n") }),
            jsx(Paragraphs, { focusKey: "hb:notes", title: t2("homebrew.whatsNew", { version: app.release.tag }), text: app.release.notes }),
            app.note ? jsx(Paragraphs, { focusKey: "hb:note", title: t2("homebrew.note"), text: app.note }) : null
          ] }),
          jsx(Facts, { app, status })
        ] }) })
      ] }),
      viewing === null ? null : jsx(ShotViewer, { shots, start: viewing, onClose: (index) => {
        setViewing(null);
        focusLater(`game:shot:${index}`);
      } }),
      // 0.5.1: inside an AnimatePresence, so the sheet's exit (SideSheet) plays as it closes.
      jsx(AnimatePresence, { children: sheet ? jsx(FilesSheet, { app, status, onClose: () => {
        setSheet(false);
        focusLater("hb:files");
      }, onPick: (name) => {
        setSheet(false);
        try {
          homebrew().install(app.id, name);
        } catch (error) {
          setMessage({ bad: true, text: error.message });
        }
        focusLater("hb:install");
      } }, "files") : null }),
      jsx(AnimatePresence, { children: removing ? jsx(RemoveSheet, { name: app.name, saved: removing, onClose: () => {
        setRemoving(null);
        focusLater("hb:remove");
      }, onChoose: (keep) => {
        const record = status.record;
        setRemoving(null);
        if (record) removeApp(homebrew(), app, record, keep, t2, setMessage);
        focusLater("hb:install");
      } }, "remove") : null })
    ] }) });
  }

export { HomebrewApp };
