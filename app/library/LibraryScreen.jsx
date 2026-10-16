// Jobee'sLair library: the games on the console, as a console's own library shows them. Wide tiles, three to
// a row: the game's banner art with its readiness badge (Installed, Played, Won't start...) over it, the title
// large beneath, a line for where it stands and one for how much it was played ("42 hours played · Last
// played yesterday"). A focused tile lifts and shows its buttons: ✕ the one thing to do (See why, Install,
// Check again, else the game page), △ the game page, ▢ delete (press twice), Options the game's menu (move
// it to another drive, keep it on internal storage). Above the tiles: Make Room, the sort order, and the
// files themselves (packages, archives, extracted folders) under Manage files.

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { MakeRoomSheet } from './MakeRoomSheet.jsx';
import { titleOf } from './make-room.js';
import { useRoomRunner } from './room-runner.js';
import { heldReason, runner } from './services.js';
import { useShelf } from './useShelf.js';
import { deleteFile } from '../files/useFiles.js';
import { DiagnosisSheet } from '../game/DiagnosisSheet.jsx';
import { OptionsSheet } from '../game/OptionsSheet.jsx';
import { formatNumber2, formatPercent2 } from '../i18n/core.js';
import { useT } from '../i18n/index.js';
import { getGame } from '../state/catalog.js';
import { driveName, downloadQueue } from '../state/downloads.js';
import { refreshDrives } from '../state/drives.js';
import { setKeptInternal, useKeptInternal } from '../state/keep-internal.js';
import { useMounts } from '../state/mount-monitor.js';
import { useNavActions } from '../state/nav.jsx';
import { playParts, usePlaytimes } from '../state/playtime.js';
import { readinessText } from '../state/readiness.js';
import { formatBytes } from '../state/size.js';
import { MARGIN2 } from '../state/space.js';
import { Button2 } from '../ui/Button.jsx';
import { ButtonGlyph, ButtonHints } from '../ui/ButtonHints.jsx';
import { Cover } from '../ui/Cover.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { HINT } from '../ui/Legend.jsx';
import { colors, radius } from '../ui/colors.js';
import { EASE_OUT } from '../ui/ease.js';
import { DeviceInfo, FocusScope, Image, ScrollView, Text, View, motion, useIsFocused } from '@ps5-react/core';

  var PER_ROW = 3, GAP = 36;
  var TILE = Math.floor((1920 - 2 * 48 - (PER_ROW - 1) * GAP) / PER_ROW);
  var BANNER = Math.round(TILE * 9 / 16);
  var COVER = { position: "absolute", left: 0, top: 0, width: Math.round(BANNER * 3 / 4), height: BANNER };
  var ARM_MS = 4e3;
  var GREEN = "#4ade80", RED = "#f87171", AMBER = "#fbbf24";
  var MANAGE_KEY = "library:manage";
  var ROOM_KEY = "library:room";
  var SORT_KEY = "library:sort";
  var EMPTY_KEY = "library:browse";
  var SORTS = ["recent", "played", "most", "size"];
  var tileKey = (key) => `library:${key}`;
  var lift = { type: "tween", duration: 0.24, ease: EASE_OUT };
  var offset = () => {
    try {
      return DeviceInfo.utcOffset(Date.now());
    } catch {
      return 0;
    }
  };
  // "42 hours played · Last played yesterday", or "Not played yet".
  function playLine(t2, record) {
    const { time, last } = playParts(record, { now: Date.now(), offsetMinutes: offset() });
    if (!time && !last) return t2("shelf.notPlayed");
    return [time && t2(time.key, time.params), last && t2(last.key, last.params)].filter(Boolean).join(" \xB7 ");
  }
  // The badge: the stage in words beside its icon, solid red for "Won't start", graphite glass otherwise; a
  // game on its way to another drive reads "Moving".
  function Badge({ ready, moving }) {
    const t2 = useT();
    const bad = ready.tone === "bad" && !moving;
    const ink2 = bad ? "#1c0a0a" : moving ? colors.accentHi : ready.tone === "good" ? GREEN : colors.accentHi;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { position: "absolute", left: 18, top: 18, height: 46, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.pill, backgroundColor: bad ? RED : `${colors.canvas}e6`, paddingHorizontal: 18 }, children: [
      /* @__PURE__ */ (0, jsx)(Icon, { name: moving ? "hardDrive" : ready.icon, size: 17, color: ink2 }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, fontWeight: 600, lineHeight: 28, color: bad ? ink2 : colors.fg }, children: moving ? t2("shelf.badge.moving") : t2(`ready.stage.${ready.stage}`) })
    ] });
  }
  // The game's wide art; without any, its cover at the left over the game's own tint.
  function Banner({ game }) {
    if (game.art?.hero) return /* @__PURE__ */ (0, jsx)(Image, { source: { uri: game.art.hero }, resizeMode: "cover", style: { width: TILE, height: BANNER } });
    if (game.art?.cover) return /* @__PURE__ */ (0, jsx)(Cover, { game, label: false, style: COVER });
    return /* @__PURE__ */ (0, jsx)(View, { style: { width: TILE, height: BANNER, alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ (0, jsx)(Icon, { name: "disc", size: 48, color: colors.subtle }) });
  }
  function Hint({ button, label }) {
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 9 }, children: [
      /* @__PURE__ */ (0, jsx)(ButtonGlyph, { button, size: 17 }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 20, fontWeight: 600, lineHeight: 28, color: colors.fg }, children: label })
    ] });
  }
  // Where the game stands, in one line: moving (and how far), a move that stopped, what ShadowMount's health
  // check found, else its readiness, size and drive.
  function statusLine(t2, entry) {
    if (entry.motion?.kind === "moving") return { text: t2("shelf.moving", { drive: driveName(entry.motion.to), percent: formatPercent2(Math.round((entry.motion.fraction ?? 0) * 100)) }), tone: colors.accentHi };
    if (entry.motion?.kind === "stopped") return { text: [t2("shelf.moveStopped", { drive: driveName(entry.motion.to) }), entry.motion.error].filter(Boolean).join(" \xB7 "), tone: AMBER };
    if (entry.health) return { text: t2(`shelf.health.${entry.health}`), tone: entry.health === "checking" ? colors.muted : RED };
    const text = [readinessText(entry.ready), entry.size ? formatBytes(entry.size) : "", entry.root ? driveName(entry.root) : ""].filter(Boolean).join(" \xB7 ");
    return { text, tone: entry.ready.tone === "bad" ? RED : colors.muted };
  }
  function TileBody({ entry, armed }) {
    const t2 = useT();
    const focused = useIsFocused();
    const { game, action } = entry;
    const status = statusLine(t2, entry);
    const busy = entry.removing || entry.motion?.kind === "moving";
    return /* @__PURE__ */ (0, jsxs)(motion.View, { initial: false, animate: { y: focused ? -6 : 0 }, transition: lift, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { position: "relative", width: TILE, height: BANNER }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { width: TILE, height: BANNER, overflow: "hidden", roundedClip: true, borderRadius: radius.lg, backgroundColor: game.art?.tint || colors.surface2 }, children: [
          /* @__PURE__ */ (0, jsx)(Banner, { game }),
          /* @__PURE__ */ (0, jsx)(Badge, { ready: entry.ready, moving: entry.motion?.kind === "moving" }),
          entry.kept ? /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", right: 18, top: 18, height: 46, width: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: `${colors.canvas}e6` }, children: /* @__PURE__ */ (0, jsx)(Icon, { name: "star", size: 18, color: colors.accentHi }) }) : null,
          entry.motion?.kind === "moving" ? /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", left: 0, bottom: 0, height: 6, width: Math.max(6, Math.round(TILE * (entry.motion.fraction ?? 0))), backgroundColor: colors.accent } }) : null,
          entry.removing || armed ? /* @__PURE__ */ (0, jsxs)(View, { style: { position: "absolute", left: 0, top: 0, width: TILE, height: BANNER, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: `${colors.canvas}d9` }, children: [
            /* @__PURE__ */ (0, jsx)(Icon, { name: "trash", size: 30, color: armed ? RED : colors.muted }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 23, fontWeight: 600, lineHeight: 32, color: colors.fg }, children: entry.removing ? t2("shelf.deleting") : t2("files.confirmDelete", { size: formatBytes(entry.size) }) })
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, jsx)(FocusRing, { round: "lg" })
      ] }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { width: TILE, gap: 2, paddingTop: 18, paddingHorizontal: 4 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { width: TILE - 8, fontFamily: "Exo2", fontSize: 28, fontWeight: 600, lineHeight: 38, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, children: game.title }),
        /* @__PURE__ */ (0, jsx)(Text, { style: { width: TILE - 8, fontFamily: "Exo2", fontSize: 21, lineHeight: 30, color: status.tone, numberOfLines: 1, ellipsizeMode: "tail" }, children: status.text || " " }),
        /* @__PURE__ */ (0, jsx)(Text, { style: { width: TILE - 8, fontFamily: "Exo2", fontSize: 21, lineHeight: 30, color: colors.subtle, numberOfLines: 1, ellipsizeMode: "tail" }, children: [playLine(t2, entry.played), entry.kept ? t2("shelf.keptTag") : ""].filter(Boolean).join(" \xB7 ") }),
        // The tile's buttons, shown while it has focus; the row keeps its height so nothing moves.
        /* @__PURE__ */ (0, jsx)(View, { style: { height: 44, flexDirection: "row", alignItems: "center", gap: 30, paddingTop: 10 }, children: focused && !busy ? /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
          action ? /* @__PURE__ */ (0, jsx)(Hint, { button: "cross", label: t2(action.label) }) : null,
          entry.catalog && action?.name !== "gamePage" ? /* @__PURE__ */ (0, jsx)(Hint, { button: "triangle", label: t2("hints.gamePage") }) : null,
          /* @__PURE__ */ (0, jsx)(Hint, { button: "square", label: t2(armed ? "hints.confirmDelete" : "hints.delete") }),
          /* @__PURE__ */ (0, jsx)(Hint, { button: "options", label: t2("hints.options") })
        ] }) : null })
      ] })
    ] });
  }
  // `handlers` is one object for the screen's life, so a focus move redraws only the tiles it changes.
  var Tile = (0, memo)(function Tile2({ entry, armed, autoFocus, handlers }) {
    return /* @__PURE__ */ (0, jsx)(View, { focusKey: tileKey(entry.key), autoFocus, onPress: () => handlers.press(entry.key), onFocus: () => handlers.focus(entry.key), style: { width: TILE }, children: /* @__PURE__ */ (0, jsx)(TileBody, { entry, armed }) });
  });
  function Empty({ onBack, onManage }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 96 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 96, height: 96, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, backgroundColor: colors.surface2 }, children: /* @__PURE__ */ (0, jsx)(Icon, { name: "grid", size: 40, color: colors.glow }) }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { marginTop: 30, fontFamily: "Exo2", fontSize: 32, fontWeight: 600, lineHeight: 44, color: colors.fg }, children: t2("shelf.empty") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { marginTop: 9, width: 760, textAlign: "center", fontFamily: "Exo2", fontSize: 23, lineHeight: 34, color: colors.muted, numberOfLines: 3, ellipsizeMode: "tail" }, children: t2("shelf.emptyDetail") }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { marginTop: 36, flexDirection: "row", gap: 18 }, children: [
        /* @__PURE__ */ (0, jsx)(Button2, { variant: "primary", label: t2("downloads.browseGames"), focusKey: EMPTY_KEY, autoFocus: true, onPress: onBack }),
        /* @__PURE__ */ (0, jsx)(Button2, { variant: "secondary", icon: "folder", label: t2("shelf.manage"), focusKey: MANAGE_KEY, onPress: onManage })
      ] })
    ] });
  }
  var lastPlayedOf = (entry) => entry.played?.lastPlayed ?? 0;
  var secondsOf = (entry) => entry.played?.seconds ?? 0;
  var ORDER = {
    recent: null,
    played: (a, b) => lastPlayedOf(b) - lastPlayedOf(a),
    most: (a, b) => secondsOf(b) - secondsOf(a) || lastPlayedOf(b) - lastPlayedOf(a),
    size: (a, b) => b.size - a.size
  };
  function LibraryScreen({ onBack, onOpenGame }) {
    const t2 = useT();
    const [version2, setVersion] = (0, useState)(0);
    runner();
    const { jobs, entries: shelf, drives } = useShelf(version2);
    const mounts = useMounts();
    const playtimes = usePlaytimes();
    const kept = useKeptInternal();
    const room = useRoomRunner();
    const [sort, setSort] = (0, useState)("recent");
    // Each game with what the screen adds to the shelf: its play time, whether it is kept on internal
    // storage, how a move of it is going, and what ShadowMount's health check says.
    const entries = (0, useMemo)(() => {
      const list = shelf.map((entry) => {
        const title = titleOf(entry);
        const moving = entry.jobs.find((job) => job.moving)?.moving;
        const running = room.entries?.[entry.key];
        const motion2 = running?.kind === "moving" ? running : moving && !moving.interrupted ? { kind: "moving", to: moving.to, fraction: moving.total ? moving.written / moving.total : 0 } : moving ? { kind: "stopped", to: moving.to, error: moving.error } : null;
        const health = mounts.titles?.[title]?.problem ?? null;
        return { ...entry, played: playtimes[title] ?? null, kept: kept.has(entry.key), motion: motion2, health, removing: entry.removing || running?.kind === "removing" };
      });
      return ORDER[sort] ? [...list].sort(ORDER[sort]) : list;
    }, [shelf, playtimes, kept, room.entries, mounts.titles, sort]);
    const { push, focusLater } = useNavActions();
    const [armed, setArmed] = (0, useState)(null);
    const [notice, setNotice] = (0, useState)({ text: "", bad: false });
    const [sheet, setSheet] = (0, useState)(null);
    // The focused tile's key (null: a header button or nothing), for the button hints and the actions.
    const [focusedKey, setFocusedKey] = (0, useState)(null);
    const latest2 = (0, useRef)(entries);
    latest2.current = entries;
    (0, useEffect)(() => {
      try {
        void downloadQueue().syncInstalls();
        void downloadQueue().refreshLaunches?.();
      } catch {
      }
    }, []);
    (0, useEffect)(() => {
      if (!armed) return void 0;
      const timer = setTimeout(() => setArmed(null), ARM_MS);
      return () => clearTimeout(timer);
    }, [armed]);
    const find = (key) => latest2.current.find((entry) => entry.key === key);
    const openGame = (entry) => {
      if (entry.catalog) onOpenGame(entry.game.id, tileKey(entry.key));
    };
    const fail = (error2) => setNotice({ text: error2.message, bad: true });
    const run = (entry) => {
      const { action, job: job2 } = entry;
      setNotice({ text: "", bad: false });
      if (entry.removing || entry.motion?.kind === "moving") return;
      // A move that stopped carries on from its copy so far.
      if (entry.motion?.kind === "stopped") return move(entry, entry.motion.to);
      if (!action) return;
      if (action.name === "gamePage") return openGame(entry);
      if (action.name === "seeWhy") return setSheet({ kind: "diagnosis", entry });
      try {
        void Promise.resolve(downloadQueue()[action.name](job2.id)).catch(fail);
      } catch (error2) {
        fail(error2);
      }
    };
    // One game to another drive, from its Options: a one-step Make Room that leaves downloads running.
    function move(entry, to) {
      const why = heldReason(entry, { jobs, mounts, room });
      if (why && why !== "moving" || room.running) return setNotice({ text: room.running ? t2("room.running") : t2(`shelf.held.${why}`), bad: true });
      const item = { id: `relocate:${entry.key}`, tier: "relocate", kind: "relocate", entryKey: entry.key, title: entry.game.title, bytes: entry.size, root: entry.root, to, selected: true, action: { type: "relocate", entryKey: entry.key, to } };
      const plan = { target: entry.root, need: 0, freeBefore: drives.usage[entry.root]?.free ?? 0, drives: drives.usage, items: [item], tiers: { reclaim: [], relocate: [item], remove: [] } };
      setNotice({ text: t2("shelf.moving", { drive: driveName(to), percent: formatPercent2(0) }), bad: false });
      void runner().run({ plan, ticked: /* @__PURE__ */ new Set([item.id]), entries: new Map(latest2.current.map((other) => [other.key, other])), hold: false }).then((result) => {
        const failed = Object.values(result.items).find((step) => step.state === "failed");
        setNotice(failed ? { text: failed.error, bad: true } : { text: [t2("shelf.moved", { name: entry.game.title, drive: driveName(to) }), ...result.notes].filter(Boolean).join(" "), bad: false });
        runner().dismiss();
        setVersion((value) => value + 1);
      }, fail);
    }
    const cancelMove = (entry) => {
      const job2 = entry.jobs.find((item) => item.moving);
      if (!job2) return;
      void downloadQueue().cancelMove(job2.id).then(() => setNotice({ text: t2("shelf.moveCancelled", { name: entry.game.title }), bad: false }), fail);
    };
    // The game's Options: move it to each other drive with room for it, keep it on internal storage (or not),
    // stop a move, delete it.
    const options = (entry) => {
      const items = [];
      if (entry.motion) {
        if (entry.jobs.some((job2) => job2.moving)) items.push({ icon: "x", label: t2("shelf.cancelMove"), detail: t2("shelf.cancelMoveDetail", { drive: driveName(entry.motion.to) }), onSelect: () => cancelMove(entry) });
        if (entry.motion.kind === "stopped") items.push({ icon: "restart", label: t2("shelf.resumeMove", { drive: driveName(entry.motion.to) }), detail: t2("shelf.resumeMoveDetail"), onSelect: () => move(entry, entry.motion.to) });
      } else if (entry.root && !entry.removing) {
        for (const root2 of drives.roots.filter((other) => other !== entry.root)) {
          const free = drives.usage[root2]?.free;
          const fits = free == null || free >= entry.size + MARGIN2;
          items.push({
            icon: "hardDrive",
            label: t2(root2 === "/data" ? "shelf.moveBack" : "shelf.moveTo", { drive: driveName(root2) }),
            detail: fits ? t2(root2 === "/data" ? "shelf.moveBackDetail" : "shelf.moveDetail", { size: formatBytes(entry.size), drive: driveName(entry.root) }) : t2("shelf.noRoomThere", { size: formatBytes(entry.size + MARGIN2 - free) }),
            onSelect: () => fits ? move(entry, root2) : setNotice({ text: t2("shelf.noRoomThere", { size: formatBytes(entry.size + MARGIN2 - free) }), bad: true })
          });
        }
      }
      if (entry.root === "/data") items.push(entry.kept ? { icon: "star", label: t2("shelf.unkeep"), detail: t2("shelf.unkeepDetail"), onSelect: () => setKeptInternal(entry.key, false) } : { icon: "star", label: t2("shelf.keep"), detail: t2("shelf.keepDetail"), onSelect: () => setKeptInternal(entry.key, true) });
      items.push({ icon: "hardDrive", label: t2("shelf.makeRoom"), detail: t2("shelf.makeRoomDetail"), onSelect: () => setSheet({ kind: "room", from: tileKey(entry.key) }), next: true });
      return items;
    };
    // Delete: every job of the game ("Delete from disk": ShadowMount uninstalls it, then its image or
    // folder, its backport and add-ons, extracted files and kept notes go), then any copy no job put there.
    // Resolves with what the gamer should know once everything is gone (ShadowMount uninstalls after the
    // app closes, say), or null.
    const remove = async (entry) => {
      const queue = downloadQueue();
      let note = null;
      for (const job2 of entry.jobs) note = (await queue.deleteFromDisk(job2.id))?.note ?? note;
      for (const file of entry.files) note = (await deleteFile(file, file.root))?.note ?? note;
      return note;
    };
    const live = (0, useRef)(null);
    live.current = { run, armed };
    const [handlers] = (0, useState)(() => ({
      press: (key) => {
        const entry = find(key);
        if (entry) live.current.run(entry);
      },
      focus: (key) => {
        setFocusedKey(key);
        if (live.current.armed && live.current.armed !== key) setArmed(null);
      }
    }));
    const onAction = (action) => {
      const entry = focusedKey && find(focusedKey);
      if (!entry || entry.removing) return false;
      if (action === "options") {
        setSheet({ kind: "options", entry });
        return true;
      }
      if (entry.motion?.kind === "moving") return false;
      if (action === "triangle" && entry.catalog) {
        openGame(entry);
        return true;
      }
      if (action !== "square") return false;
      if (armed !== entry.key) {
        setArmed(entry.key);
        return true;
      }
      setArmed(null);
      const list = latest2.current;
      const index = list.indexOf(entry);
      const next = list[index + 1] ?? list[index - 1];
      setNotice({ text: t2("shelf.deleting"), bad: false });
      remove(entry).then((note) => {
        setNotice({ text: [t2("files.deleted", { name: entry.game.title }), note].filter(Boolean).join(". "), bad: false });
        focusLater(next ? tileKey(next.key) : EMPTY_KEY);
      }, (error2) => setNotice({ text: /ShadowMount|download|move/i.test(error2.message) ? error2.message : t2("files.deleteFailed"), bad: true })).finally(() => {
        setVersion((value) => value + 1);
        void refreshDrives();
      });
      return true;
    };
    const back2 = () => {
      if (armed) setArmed(null);
      else onBack();
      return true;
    };
    const manage = () => push({ name: "storage" }, MANAGE_KEY);
    const closeSheet = () => {
      const from = sheet?.from ?? (sheet?.entry ? tileKey(sheet.entry.key) : null);
      setSheet(null);
      setVersion((value) => value + 1);
      if (from) focusLater(from);
    };
    const rows = [];
    for (let at = 0; at < entries.length; at += PER_ROW) rows.push(entries.slice(at, at + PER_ROW));
    const played = entries.filter((entry) => entry.ready.stage === "played").length;
    const total = entries.reduce((sum, entry) => sum + entry.size, 0);
    const hours = Math.round(entries.reduce((sum, entry) => sum + secondsOf(entry), 0) / 3600);
    const current = focusedKey && find(focusedKey);
    const hints = !current ? [HINT.select, HINT.back] : [
      current.action ? { button: "cross", label: current.action.label } : null,
      current.catalog && current.action?.name !== "gamePage" ? { button: "triangle", label: "hints.gamePage" } : null,
      { button: "square", label: armed === current.key ? "hints.confirmDelete" : "hints.delete" },
      { button: "options", label: "hints.options" },
      HINT.back
    ].filter(Boolean);
    const summary = room.running ? t2("room.working") : entries.length ? [t2("shelf.summary", { count: entries.length }), played ? t2("shelf.played", { count: formatNumber2(played) }) : "", hours ? t2("shelf.hours", { count: hours }) : "", formatBytes(total)].filter(Boolean).join(" \xB7 ") : " ";
    const Sheet = sheet?.kind === "options" ? /* @__PURE__ */ (0, jsx)(OptionsSheet, { title: sheet.entry.game.title, items: options(sheet.entry), onClose: closeSheet }) : sheet?.kind === "room" ? /* @__PURE__ */ (0, jsx)(MakeRoomSheet, { onClose: closeSheet }) : sheet?.kind === "diagnosis" ? /* @__PURE__ */ (0, jsx)(DiagnosisSheet, { title: sheet.entry.game.title, jobId: sheet.entry.job.id, onClose: closeSheet }) : null;
    return /* @__PURE__ */ (0, jsx)(FocusScope, { autoFocus: true, onBack: back2, onAction, children: /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 48, paddingTop: 12, paddingBottom: 30 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 4 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 40, fontWeight: 600, lineHeight: 52, letterSpacing: 0.4, color: colors.fg }, children: t2("shelf.title") }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { width: 1000, fontFamily: "Exo2", fontSize: 22, lineHeight: 30, color: notice.bad ? RED : colors.subtle, numberOfLines: 2, ellipsizeMode: "tail" }, children: notice.text || summary })
        ] }),
        entries.length ? /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 18 }, children: [
          /* @__PURE__ */ (0, jsx)(Button2, { variant: "primary", icon: "hardDrive", label: t2("shelf.makeRoom"), focusKey: ROOM_KEY, onPress: () => setSheet({ kind: "room", from: ROOM_KEY }), onFocus: () => setFocusedKey(null) }),
          /* @__PURE__ */ (0, jsx)(Button2, { variant: "outline", icon: "list", label: t2(`shelf.sort.${sort}`), focusKey: SORT_KEY, onPress: () => setSort((value) => SORTS[(SORTS.indexOf(value) + 1) % SORTS.length]), onFocus: () => setFocusedKey(null) }),
          /* @__PURE__ */ (0, jsx)(Button2, { variant: "outline", icon: "folder", label: t2("shelf.manage"), focusKey: MANAGE_KEY, onPress: manage, onFocus: () => setFocusedKey(null) })
        ] }) : null
      ] }),
      entries.length ? /* @__PURE__ */ (0, jsx)(ScrollView, { style: { flex: 1 }, children: /* @__PURE__ */ (0, jsx)(View, { style: { gap: 30, paddingHorizontal: 48, paddingTop: 12, paddingBottom: 48 }, children: rows.map(
        (row, index) => (
          // Each row is a scroll anchor: moving up or down shows a row whole, lift and buttons included,
          // and the first row scrolls the list to its very top.
          /* @__PURE__ */ (0, jsx)(View, { scrollAnchor: true, style: { flexDirection: "row", gap: GAP }, children: row.map(
            (entry, column) => /* @__PURE__ */ (0, jsx)(
              Tile,
              {
                entry,
                armed: armed === entry.key,
                autoFocus: index === 0 && column === 0,
                handlers
              },
              entry.key
            )
          ) }, row[0].key)
        )
      ) }) }) : /* @__PURE__ */ (0, jsx)(Empty, { onBack, onManage: manage }),
      /* @__PURE__ */ (0, jsx)(ButtonHints, { hints }),
      Sheet
    ] }) });
  }

export { LibraryScreen };
