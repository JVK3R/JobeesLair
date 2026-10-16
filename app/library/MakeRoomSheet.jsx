// Make Room: a side sheet that frees space on one drive, safest first (library/make-room.js). At the top,
// each drive's bar as it is and as it will be; below, the three tiers (Reclaim, Move to another drive,
// Delete) as rows the controller walks down, ✕ ticking or unticking each; △ (or the button at the end)
// carries out what is ticked. While it runs, each row shows how far it got, and the library's tiles show the
// games moving; closing the sheet leaves it running. Opened from a download that does not fit, it frees
// what that download needs and starts it once done.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useMemo, useRef, useState } from 'react';
import { findLeftovers } from './leftovers.js';
import { planRoom, selection, ticked0, titleOf, toggle } from './make-room.js';
import { useRoomRunner } from './room-runner.js';
import { heldReason, runner } from './services.js';
import { useShelf } from './useShelf.js';
import { installedTitles } from '../files/useFiles.js';
import { formatPercent2 } from '../i18n/core.js';
import { useT } from '../i18n/index.js';
import { driveName } from '../state/downloads.js';
import { useKeptInternal } from '../state/keep-internal.js';
import { useMounts } from '../state/mount-monitor.js';
import { playParts, usePlaytimes } from '../state/playtime.js';
import { formatBytes } from '../state/size.js';
import { Button2 } from '../ui/Button.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { HINT } from '../ui/Legend.jsx';
import { SideSheet } from '../ui/SideSheet.jsx';
import { colors, radius } from '../ui/colors.js';
import { DeviceInfo, FileSystem, Text, View } from '@ps5-react/core';

  var WIDTH = 900;
  var INNER = WIDTH - 2 * 36 - 2 * 9;
  var BAR = INNER - 36;
  var GREEN = "#4ade80", RED = "#f87171";
  var GB = 1e9;
  var GOALS = [50, 100, 150, 200, 300, 500].map((gb) => gb * GB);
  var HINTS = [{ button: "cross", label: "hints.tick" }, { button: "triangle", label: "hints.makeRoom" }, HINT.close];
  var DONE_HINTS = [HINT.select, HINT.close];
  var LABEL = { fontFamily: "Exo2", fontSize: 23, fontWeight: 600, lineHeight: 32, color: colors.fg };
  var DETAIL = { fontFamily: "Exo2", fontSize: 20, lineHeight: 28, color: colors.muted };
  var SIZE = { fontFamily: "JetBrainsMono-Regular", fontSize: 19, lineHeight: 28, color: colors.muted };
  var offset = () => {
    try {
      return DeviceInfo.utcOffset(Date.now());
    } catch {
      return 0;
    }
  };
  function playText(t2, item) {
    const { time, last } = playParts(item.seconds || item.lastPlayed ? { seconds: item.seconds, lastPlayed: item.lastPlayed } : null, { now: Date.now(), offsetMinutes: offset() });
    if (!time && !last) return t2("shelf.notPlayed");
    return [last && t2(last.key, last.params), time && t2(time.key, time.params)].filter(Boolean).join(" \xB7 ");
  }
  function detailOf(t2, item) {
    if (item.tier === "reclaim") return t2(`room.kind.${item.kind}`);
    if (item.tier === "relocate") return [t2("room.moveTo", { drive: driveName(item.to) }), playText(t2, item)].join(" \xB7 ");
    return item.kind === "wontStart" ? t2("room.wontStart") : playText(t2, item);
  }
  // One drive's bar: what stays used, what this frees (green) or takes (accent), and what is free after.
  function DriveBar({ root, usage, after, target }) {
    const t2 = useT();
    if (!usage?.total) return null;
    const share = (bytes) => Math.max(0, Math.round(bytes / usage.total * BAR));
    const change = (after ?? usage.free) - usage.free;
    const used = usage.total - Math.max(usage.free, after ?? usage.free);
    const segments = [
      { width: share(used), color: colors.subtle },
      { width: share(Math.abs(change)), color: change > 0 ? GREEN : colors.accent },
      { width: share(Math.min(usage.free, after ?? usage.free)), color: colors.surface }
    ];
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 10 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { width: BAR, flexDirection: "row", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: [LABEL, { fontSize: 21, color: root === target ? colors.fg : colors.muted }], children: driveName(root) }),
        /* @__PURE__ */ (0, jsx)(Text, { style: SIZE, children: change ? t2("room.freeArrow", { before: formatBytes(usage.free), after: formatBytes(after) }) : t2("download.free", { size: formatBytes(usage.free) }) })
      ] }),
      /* @__PURE__ */ (0, jsx)(View, { style: { width: BAR, height: 14, flexDirection: "row", overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surface }, children: segments.filter((segment) => segment.width > 0).map((segment, index) => /* @__PURE__ */ (0, jsx)(View, { style: { width: segment.width, height: 14, backgroundColor: segment.color } }, index)) })
    ] });
  }
  function Block({ children, autoFocus, onPress }) {
    return /* @__PURE__ */ (0, jsxs)(View, { focusable: true, autoFocus, onPress, style: (_state) => [{ position: "relative", gap: 18, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 16 }, _state.focused ? { backgroundColor: colors.surface2 } : null], children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      children
    ] });
  }
  function Check({ on }) {
    return /* @__PURE__ */ (0, jsx)(View, { style: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: radius.xs, borderWidth: on ? 0 : 2, borderColor: colors.glassEdge, backgroundColor: on ? colors.accent : "transparent" }, children: on ? /* @__PURE__ */ (0, jsx)(Icon, { name: "check", size: 18, color: colors.accentFg }) : null });
  }
  // One step: its tick (or, while running, how far it got), what it is, and its size.
  function Row({ item, ticked, progress, onPress, autoFocus }) {
    const t2 = useT();
    const status = progress ? progress.state === "running" ? formatPercent2(Math.round((progress.fraction ?? 0) * 100)) : t2(`room.state.${progress.state}`) : null;
    const tone = progress?.state === "failed" ? RED : progress?.state === "done" ? GREEN : colors.muted;
    return /* @__PURE__ */ (0, jsxs)(View, { autoFocus, onPress, focusable: true, style: (_state) => [{ position: "relative", flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 14 }, _state.focused ? { backgroundColor: colors.surface2 } : null], children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      progress ? /* @__PURE__ */ (0, jsx)(Icon, { name: progress.state === "done" ? "circleCheck" : progress.state === "failed" ? "alert" : progress.state === "running" ? "download" : "list", size: 22, color: tone }) : /* @__PURE__ */ (0, jsx)(Check, { on: ticked }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 2 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: [LABEL, { width: INNER - 260, numberOfLines: 1, ellipsizeMode: "tail" }], children: item.tier === "reclaim" ? item.title || t2(`room.kind.${item.kind}`) : item.title }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [DETAIL, { width: INNER - 260, numberOfLines: 2, ellipsizeMode: "tail", color: progress?.state === "failed" ? RED : colors.muted }], children: progress?.state === "failed" ? progress.error : detailOf(t2, item) })
      ] }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { alignItems: "flex-end", gap: 2 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: SIZE, children: formatBytes(item.bytes) }),
        status ? /* @__PURE__ */ (0, jsx)(Text, { style: [SIZE, { color: tone }], children: status }) : null
      ] })
    ] });
  }
  function Tier({ tier, children }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 6 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 2, paddingHorizontal: 18, paddingTop: 12 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: [LABEL, { fontSize: 25, color: colors.fg }], children: t2(`room.tier.${tier}`) }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [DETAIL, { width: INNER - 36, numberOfLines: 2, ellipsizeMode: "tail", color: colors.subtle }], children: t2(`room.tierDetail.${tier}`) })
      ] }),
      children
    ] });
  }
  /**
   * `target` and `need` (bytes that must be free there) when a download asked for the room, with `then`
   * ({ game, release, root, alternatives }) to queue after; without them the gamer picks the drive and a
   * goal.
   */
  function MakeRoomSheet({ target: asked, need: needed, then = null, onClose }) {
    const t2 = useT();
    runner();
    const room = useRoomRunner();
    const [version, setVersion] = (0, useState)(0);
    const { jobs, files, entries, drives } = useShelf(version);
    const mounts = useMounts();
    const playtimes = usePlaytimes();
    const kept = useKeptInternal();
    const roots = drives.roots;
    const [target, setTarget] = (0, useState)(asked ?? "/data");
    const [goal, setGoal] = (0, useState)(1);
    const need = needed ?? GOALS[goal];
    const live = (0, useRef)({});
    live.current = { jobs, files, entries, mounts, playtimes, kept, usage: drives.usage, room };
    // The plan holds still while the gamer ticks: it is made again only for another drive or goal, once
    // the drives' space is known, when the games or jobs themselves change (the queue's first answer comes
    // after the first draw), or after a run.
    const shelfKey = [...entries.map((entry) => `${entry.key}:${entry.size}:${entry.root}:${entry.ready.stage}`), ...jobs.map((job2) => `${job2.id}:${job2.state}:${job2.root}`)].join("\n");
    const plan = (0, useMemo)(() => {
      const { jobs: jobs2, files: files2, entries: entries2, mounts: mounts2, playtimes: playtimes2, kept: kept2, usage, room: room2 } = live.current;
      const leftovers = findLeftovers({ fs: FileSystem, roots, jobs: jobs2, installed: installedTitles(), titles: new Set(entries2.map(titleOf).filter(Boolean)), backports: files2.filter((file) => file.backport) });
      return planRoom({ target, need, drives: usage, entries: entries2, leftovers, playtimes: playtimes2, kept: kept2, held: (entry) => Boolean(heldReason(entry, { jobs: jobs2, mounts: mounts2, room: room2 })) });
    }, [target, need, version, drives.ready, roots.join("\n"), shelfKey]);
    const [ticks, setTicks] = (0, useState)({ plan: null, ids: /* @__PURE__ */ new Set() });
    const ticked = ticks.plan === plan ? ticks.ids : ticked0(plan);
    const chosen = selection(plan, ticked);
    const showing = room.running || room.finished;
    const flip = (id) => setTicks({ plan, ids: toggle(plan, ticked, id) });
    const start = () => {
      if (showing || !ticked.size) return;
      const byKey = new Map(live.current.entries.map((entry) => [entry.key, entry]));
      void runner().run({ plan, ticked, entries: byKey, then }).finally(() => setVersion((value) => value + 1));
    };
    const finish = () => {
      runner().dismiss();
      onClose();
    };
    const onAction = (action) => {
      if (action === "triangle") start();
    };
    const subtitle = then ? t2("room.forDownload", { title: then.game.title, size: formatBytes(Math.max(0, need - (drives.usage[target]?.free ?? 0))), drive: driveName(target) }) : room.running ? t2("room.working") : t2("room.subtitle");
    // While running or done: the steps as they go, then what came of them.
    if (showing) {
      const steps = room.steps ?? [];
      const doneText = room.finished ? [t2("room.finished", { size: formatBytes(room.freed), drive: driveName(room.target) }), room.startedDownload ? t2("room.startedDownload", { title: room.startedDownload }) : "", ...room.notes].filter(Boolean) : [t2("room.keepGoing")];
      return /* @__PURE__ */ (0, jsx)(SideSheet, { title: t2("room.title"), subtitle, onClose: room.finished ? finish : onClose, hints: DONE_HINTS, width: WIDTH, children: /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 12, padding: 9 }, children: [
        /* @__PURE__ */ (0, jsx)(Block, { autoFocus: !room.finished, children: roots.map((root) => /* @__PURE__ */ (0, jsx)(DriveBar, { root, usage: drives.usage[root], after: drives.usage[root]?.free, target: room.target }, root)) }),
        /* @__PURE__ */ (0, jsx)(View, { style: { gap: 4, paddingHorizontal: 18 }, children: doneText.map((line, index) => /* @__PURE__ */ (0, jsx)(Text, { style: [DETAIL, { width: INNER - 36, fontSize: 22, lineHeight: 32, color: index === 0 && room.finished ? GREEN : colors.muted, numberOfLines: 3, ellipsizeMode: "tail" }], children: line }, index)) }),
        steps.map((item) => /* @__PURE__ */ (0, jsx)(Row, { item, ticked: true, progress: room.items[item.id] }, item.id)),
        room.finished ? /* @__PURE__ */ (0, jsx)(View, { style: { paddingHorizontal: 9, paddingTop: 12 }, children: /* @__PURE__ */ (0, jsx)(Button2, { variant: "primary", label: t2("room.done"), autoFocus: true, onPress: finish }) }) : null
      ] }) });
    }
    const rows = (tier) => plan.tiers[tier].map((item, index) => /* @__PURE__ */ (0, jsx)(Row, { item, ticked: ticked.has(item.id), onPress: () => flip(item.id) }, item.id));
    const empty = !plan.items.length;
    const short = Math.max(0, need - (chosen.after[target] ?? 0));
    return /* @__PURE__ */ (0, jsx)(SideSheet, { title: t2("room.title"), subtitle, onClose, onAction, hints: HINTS, width: WIDTH, children: /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 12, padding: 9 }, children: [
      asked ? null : /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
        /* @__PURE__ */ (0, jsx)(Block, { autoFocus: true, onPress: () => setTarget((root) => roots[(roots.indexOf(root) + 1) % roots.length] ?? "/data"), children: /* @__PURE__ */ (0, jsx)(Text, { style: LABEL, children: t2("room.drive", { drive: driveName(target) }) }) }),
        /* @__PURE__ */ (0, jsx)(Block, { onPress: () => setGoal((index) => (index + 1) % GOALS.length), children: /* @__PURE__ */ (0, jsx)(Text, { style: LABEL, children: t2("room.goal", { size: formatBytes(GOALS[goal]) }) }) })
      ] }),
      /* @__PURE__ */ (0, jsxs)(Block, { autoFocus: Boolean(asked), children: [
        roots.map((root) => /* @__PURE__ */ (0, jsx)(DriveBar, { root, usage: drives.usage[root], after: chosen.after[root], target }, root)),
        /* @__PURE__ */ (0, jsx)(Text, { style: [DETAIL, { width: BAR, fontSize: 22, color: chosen.enough ? GREEN : colors.muted }], children: [
          t2("room.frees", { size: formatBytes(chosen.freed) }),
          chosen.enough ? t2("room.enough") : t2("room.short", { size: formatBytes(short) })
        ].join(" \xB7 ") })
      ] }),
      empty ? /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 6, paddingHorizontal: 18, paddingVertical: 12 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: LABEL, children: t2("room.nothing") }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [DETAIL, { width: INNER - 36, numberOfLines: 3, ellipsizeMode: "tail" }], children: t2("room.nothingDetail") })
      ] }) : null,
      plan.tiers.reclaim.length ? /* @__PURE__ */ (0, jsx)(Tier, { tier: "reclaim", children: rows("reclaim") }) : null,
      plan.tiers.relocate.length ? /* @__PURE__ */ (0, jsx)(Tier, { tier: "relocate", children: rows("relocate") }) : null,
      plan.tiers.remove.length ? /* @__PURE__ */ (0, jsx)(Tier, { tier: "remove", children: rows("remove") }) : null,
      empty ? null : /* @__PURE__ */ (0, jsx)(View, { style: { paddingHorizontal: 9, paddingTop: 18 }, children: /* @__PURE__ */ (0, jsx)(Button2, { variant: ticked.size ? "primary" : "outline", icon: "hardDrive", label: ticked.size ? t2("room.confirmSize", { size: formatBytes(chosen.freed) }) : t2("room.pickSomething"), onPress: start }) })
    ] }) });
  }

export { MakeRoomSheet };
