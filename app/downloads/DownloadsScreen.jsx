// Jobee'sLair downloads dashboard (replaces the inherited list-and-sidebar layout).
// Top to bottom: the page title with the queue's state in words and the last action's error; the
// telemetry band (Telemetry.jsx: live throughput, overall progress, counts, drive space); then the jobs as
// square-edged cards, two to a row, grouped In progress / On hold / Finished. Square pauses or resumes the
// focused card, Triangle opens its game; cancelling a card moves focus to its neighbor.
// The queue's actions, their order and their error handling are the same as before; only the look changed.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD_WIDTH, DownloadCard, primaryKey } from './DownloadCard.jsx';
import { Telemetry } from './Telemetry.jsx';
import { DiagnosisSheet } from '../game/DiagnosisSheet.jsx';
import { useJobs } from './useQueue.js';
import { formatNumber2, t } from '../i18n/core.js';
import { SPAN_MAX, fitBytes } from '../i18n/fit.js';
import { useT } from '../i18n/index.js';
import { getGame } from '../state/catalog.js';
import { BUSY, COMPLETE } from '../state/download-queue.js';
import { downloadQueue } from '../state/downloads.js';
import { useNavActions } from '../state/nav.jsx';
import { Button2 } from '../ui/Button.jsx';
import { ButtonHints } from '../ui/ButtonHints.jsx';
import { Icon } from '../ui/Icon.jsx';
import { CountBand } from '../ui/LibraryCount.jsx';
import { HINT } from '../ui/Legend.jsx';
import { colors, radius } from '../ui/colors.js';
import { AnimatePresence, FocusScope, ScrollView, Text, View } from '@ps5-react/core';

  var LIST_HINTS = [
    HINT.select,
    { button: "square", label: "hints.pauseResume" },
    { button: "triangle", label: "hints.gamePage" },
    HINT.back
  ];
  var EMPTY_HINTS = [HINT.select, HINT.back];
  var EMPTY_KEY = "downloads:empty";
  var PER_ROW = 2, GAP = 24;
  var ARM_MS = 3e3;
  // 0.5.1: the whole list at once, above it. "Clear finished" tidies every finished card away; "Cancel all"
  // stops and removes every download that is not finished, on a second press within three seconds (the first
  // arms it, like a card's X).
  function QueueActions({ finished, unfinished, run }) {
    const t2 = useT();
    const [armed, setArmed] = (0, useState)(false);
    (0, useEffect)(() => {
      if (!armed) return void 0;
      const timer = setTimeout(() => setArmed(false), ARM_MS);
      return () => clearTimeout(timer);
    }, [armed]);
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", justifyContent: "flex-end", gap: 12 }, children: [
      finished ? /* @__PURE__ */ (0, jsx)(Button2, { variant: "secondary", size: "md", icon: "check", label: t2("downloads.clearFinished"), focusKey: "downloads:clear-finished", onPress: () => run("clearFinished") }) : null,
      unfinished ? /* @__PURE__ */ (0, jsx)(Button2, { variant: armed ? "primary" : "secondary", size: "md", icon: armed ? "delete" : "x", label: t2(armed ? "downloads.cancelAllArmed" : "downloads.cancelAll"), focusKey: "downloads:cancel-all", onBlur: () => setArmed(false), onPress: () => {
        if (armed) run("cancelAll");
        setArmed(!armed);
      } }) : null
    ] });
  }
  function summary(jobs) {
    const count = (states) => jobs.filter((job2) => states.includes(job2.state)).length;
    return [
      [count(BUSY), "inProgress"],
      [count(["paused", "awaiting-browser"]), "paused"],
      [count(["failed"]), "failed"],
      [count(COMPLETE), "completed"]
    ].filter(([n]) => n > 0).map(([n, key]) => t(`downloads.summary.${key}`, { count: n })).join(" \xB7 ");
  }
  // `anchor`: the list scrolls to the section's title when focus comes to its first row, so moving up a
  // section shows its heading; the first section is anchored with the page's top instead (see below).
  function Section({ title, tone, jobs, first, handlers, anchor = true }) {
    const t2 = useT();
    if (!jobs.length) return null;
    const rows = [];
    for (let at = 0; at < jobs.length; at += PER_ROW) rows.push(jobs.slice(at, at + PER_ROW));
    const rowView = (row) => /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", gap: GAP }, children: row.map(
      (job2) => /* @__PURE__ */ (0, jsx)(
        DownloadCard,
        {
          job: job2,
          game: getGame(job2.gameId) ?? { title: job2.title, art: {} },
          autoFocus: job2 === first,
          run: handlers.run,
          onOpenGame: handlers.openGame,
          onFocusRow: handlers.focusRow
        },
        job2.id
      )
    ) }, row[0].id);
    // 0.5.1: the title and the first row share the section's anchor; every later row anchors on its own. The
    // whole section as one anchor was taller than the page once it held two rows of these cards, and the
    // engine gives an anchor taller than the viewport up for minimal movement, so the first section (with the
    // band and the telemetry) never scrolled back to the top.
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: GAP }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { ...anchor ? { scrollAnchor: true } : {}, style: { gap: GAP }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 16 }, children: [
          /* @__PURE__ */ (0, jsx)(View, { style: { width: 14, height: 14, backgroundColor: tone } }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 20, fontWeight: 600, color: colors.muted, letterSpacing: 2, lineHeight: 28 }, children: `${t2(title)}  ${formatNumber2(jobs.length)}` }),
          /* @__PURE__ */ (0, jsx)(View, { style: { flex: 1, height: 2, backgroundColor: colors.line } })
        ] }),
        rowView(rows[0])
      ] }),
      ...rows.slice(1).map((row) => /* @__PURE__ */ (0, jsx)(View, { scrollAnchor: true, children: rowView(row) }, `anchor:${row[0].id}`))
    ] });
  }
  function Empty({ error: error2, onBack }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsx)(View, { style: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 }, children: /* @__PURE__ */ (0, jsxs)(View, { style: { width: CARD_WIDTH, alignItems: "center", borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingVertical: 48, paddingHorizontal: 60 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 84, height: 84, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surface2 }, children: /* @__PURE__ */ (0, jsx)(Icon, { name: "download", size: 36, color: colors.glow }) }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { marginTop: 24, fontFamily: "Exo2", fontSize: 30, fontWeight: 600, color: colors.fg, lineHeight: 42 }, children: t2(error2 ? "downloads.unavailable" : "downloads.empty") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { marginTop: 6, width: 720, textAlign: "center", fontFamily: "Exo2", fontSize: 23, color: colors.muted, numberOfLines: 3, ellipsizeMode: "tail", lineHeight: 34 }, children: error2 || t2("downloads.emptyDetail") }),
      /* @__PURE__ */ (0, jsx)(View, { style: { marginTop: 36 }, children: /* @__PURE__ */ (0, jsx)(Button2, { variant: "primary", label: t2("downloads.browseGames"), focusKey: EMPTY_KEY, autoFocus: true, onPress: onBack }) })
    ] }) });
  }
  function DownloadsScreen({ onBack, onOpenGame }) {
    const t2 = useT();
    const { jobs: everyJob, error: error2 } = useJobs();
    const jobs = useMemo(() => everyJob.filter((job2) => !job2.cleared), [everyJob]);
    (0, useEffect)(() => {
      try {
        void downloadQueue().syncInstalls();
      } catch {
      }
    }, []);
    const [failure, setFailure] = (0, useState)("");
    const [note, setNote] = (0, useState)("");
    // The job whose "See why" is open: what ShadowMount's logs say about its last launch.
    const [diagnosing, setDiagnosing] = (0, useState)(null);
    const { focusLater } = useNavActions();
    const focused = (0, useRef)(null);
    const latest2 = (0, useRef)(jobs);
    latest2.current = jobs;
    const neighbor = (job2) => {
      const index = latest2.current.findIndex((item) => item.id === job2.id);
      const next = latest2.current[index + 1] ?? latest2.current[index - 1];
      return next ? primaryKey(next.id) : EMPTY_KEY;
    };
    const [handlers] = (0, useState)(() => ({
      run(job2, name) {
        setFailure("");
        if (name === "seeWhy") {
          setDiagnosing(job2);
          return;
        }
        const target = ["remove", "cancel", "clear", "deleteFromDisk"].includes(name) ? neighbor(job2) : null;
        setNote("");
        try {
          const done2 = Promise.resolve(downloadQueue()[name](job2.id));
          // A delete says what is left to happen (ShadowMount uninstalls once the app closes, say).
          void done2.then((result) => {
            if (result?.note) setNote(result.note);
          }, (caught) => setFailure(caught.message));
          // A deletion can be refused (ShadowMount still has it mounted): focus moves on once it is gone.
          if (target && name === "deleteFromDisk") void done2.then(() => focusLater(target), () => {
          });
          else if (target) focusLater(target);
        } catch (caught) {
          setFailure(caught.message);
        }
      },
      // 0.5.1: Clear finished and Cancel all (QueueActions). Focus moves to the button left, else to the
      // empty page's own.
      runAll(name) {
        setFailure("");
        setNote("");
        const left = latest2.current.filter((job2) => name === "cancelAll" ? COMPLETE.includes(job2.state) : !COMPLETE.includes(job2.state)).length;
        const target = left ? name === "cancelAll" ? "downloads:clear-finished" : "downloads:cancel-all" : EMPTY_KEY;
        Promise.resolve().then(() => downloadQueue()[name]()).then(() => focusLater(target), (caught) => setFailure(caught.message));
      },
      openGame: (job2) => {
        if (getGame(job2.gameId)) onOpenGame(job2.gameId, primaryKey(job2.id));
      },
      focusRow: (job2) => {
        focused.current = job2;
      }
    }));
    const back2 = () => {
      onBack();
      return true;
    };
    const onAction = (action) => {
      const job2 = focused.current && jobs.find((item) => item.id === focused.current.id);
      if (!job2) return false;
      if (action === "triangle") handlers.openGame(job2);
      else if (action === "square" && BUSY.includes(job2.state)) handlers.run(job2, "pause");
      else if (action === "square" && ["paused", "failed"].includes(job2.state)) handlers.run(job2, "resume");
      else
        return false;
      return true;
    };
    const placed = (job2) => job2.removingFrom ?? job2.state;
    const active2 = jobs.filter((job2) => BUSY.includes(placed(job2)));
    const stopped = jobs.filter((job2) => ["paused", "failed", "awaiting-browser"].includes(placed(job2)));
    const done = jobs.filter((job2) => COMPLETE.includes(placed(job2)));
    const first = active2[0] ?? stopped[0] ?? done[0];
    const sections = [
      { title: "downloads.section.active", tone: colors.accentHi, jobs: active2 },
      { title: "downloads.section.stopped", tone: "#fbbf24", jobs: stopped },
      { title: "downloads.section.completed", tone: "#4ade80", jobs: done }
    ].filter((section) => section.jobs.length);
    return /* @__PURE__ */ (0, jsx)(FocusScope, { autoFocus: true, onBack: back2, onAction, children: /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, paddingHorizontal: 48 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingTop: 12, paddingBottom: 20 }, children: [
        /* @__PURE__ */ (0, jsxs)(Text, { style: { width: 1200, fontFamily: "Exo2", fontSize: 36, fontWeight: 600, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail", lineHeight: 48, letterSpacing: 1 }, children: [
          fitBytes(t2("downloads.title"), SPAN_MAX),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontSize: 22, fontWeight: 400, color: colors.subtle }, children: jobs.length ? fitBytes(`   ${summary(jobs)}`, SPAN_MAX) : "" })
        ] }),
        // 0.5.1: Clear finished and Cancel all, at the top right where they are seen (QueueActions).
        /* @__PURE__ */ (0, jsx)(QueueActions, { finished: done.length, unfinished: active2.length + stopped.length, run: handlers.runAll })
      ] }),
      failure || note ? /* @__PURE__ */ (0, jsx)(Text, { style: { width: 1800, marginBottom: 16, fontFamily: "Exo2", fontSize: 21, color: failure ? "#f87171" : colors.muted, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, children: failure || note }) : null,
      // One scroll for the whole page below the title: the library band and the telemetry scroll away
      // with the cards (a fixed band left the cards a strip a card and a half tall, and moving up never
      // brought the top back). The band, the telemetry and the first section are one scroll anchor, so
      // focus on the first row scrolls to the very top; each later section anchors on its own title.
      jobs.length > 0 ? /* @__PURE__ */ (0, jsx)(ScrollView, { style: { flex: 1 }, children: /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 48, paddingBottom: 48 }, children: sections.map(
        (section, index) => index === 0 ? /* @__PURE__ */ (0, jsxs)(View, { scrollAnchor: true, children: [
          /* @__PURE__ */ (0, jsx)(View, { style: { marginBottom: 20 }, children: /* @__PURE__ */ (0, jsx)(CountBand, {}) }),
          /* @__PURE__ */ (0, jsx)(Telemetry, { error: error2 }),
          /* @__PURE__ */ (0, jsx)(View, { style: { marginTop: 30 }, children: /* @__PURE__ */ (0, jsx)(Section, { ...section, first, handlers, anchor: false }, section.title) })
        ] }, "top") : /* @__PURE__ */ (0, jsx)(Section, { ...section, first, handlers }, section.title)
      ) }) }) : [
        /* @__PURE__ */ (0, jsx)(View, { style: { marginBottom: 20 }, children: /* @__PURE__ */ (0, jsx)(CountBand, {}) }, "band"),
        /* @__PURE__ */ (0, jsx)(Telemetry, { error: error2 }, "telemetry"),
        /* @__PURE__ */ (0, jsx)(Empty, { error: error2, onBack }, "empty")
      ],
      /* @__PURE__ */ (0, jsx)(ButtonHints, { hints: jobs.length > 0 ? LIST_HINTS : EMPTY_HINTS }),
      /* @__PURE__ */ (0, jsx)(AnimatePresence, { children: diagnosing ? /* @__PURE__ */ (0, jsx)(DiagnosisSheet, { title: diagnosing.title, jobId: diagnosing.id, onClose: () => {
        setDiagnosing(null);
        focusLater(primaryKey(diagnosing.id));
      } }, "diagnosis") : null })
    ] }) });
  }

export { DownloadsScreen };
