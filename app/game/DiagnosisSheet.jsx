// "Why won't it start?": what ShadowMount's logs say about a game's last launch. Read-only: the queue
// fetches ShadowMount's debug and system logs and picks out this title's lines (state/launch-diagnosis.js).
// 0.5.2: Fix it under the verdict (state/download-queue.js fixIt / fixTitle), the one thing on the sheet that
// changes anything. Its button shows only when a press would change something; otherwise the sheet says why not
// (not started yet, started fine, nothing left to try). Its answer takes the place of what it would do. A
// Homebrew app or a game copied by hand comes by its title ID (`titleId`, `folders`, `root`) instead of `jobId`.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { tWhole, useT } from '../i18n/index.js';
import { downloadQueue } from '../state/downloads.js';
import { Button2 } from '../ui/Button.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { fixNeeded, fixStateText, fixText } from './fix-text.js';
import { SideSheet } from '../ui/SideSheet.jsx';
import { LongText } from '../ui/LongText.jsx';
import { colors, radius } from '../ui/colors.js';
import { Text, View } from '@ps5-react/core';

  var BODY = { width: 690, fontFamily: "Exo2", fontSize: 22, lineHeight: 32 };
  var LINE = { width: 690, fontFamily: "JetBrainsMono-Regular", fontSize: 16, lineHeight: 24, color: colors.muted };
  // Every block is focusable, so the controller walks down the sheet and it scrolls along.
  function Block({ autoFocus, children }) {
    return /* @__PURE__ */ (0, jsxs)(View, { focusable: true, autoFocus, style: (_state) => [{ position: "relative", gap: 6, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 12 }, _state.focused ? { backgroundColor: colors.surface2 } : null], children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      children
    ] });
  }
  function Lines({ heading, lines }) {
    return /* @__PURE__ */ (0, jsxs)(Block, { children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { fontWeight: 600, color: colors.fg }], children: heading }),
      ...lines.map((line, index) => /* @__PURE__ */ (0, jsx)(Text, { style: LINE, children: line }, index))
    ] });
  }
  function DiagnosisSheet({ title, jobId, titleId, folders, root, onClose }) {
    const t2 = useT();
    const [state, setState] = (0, useState)({ loading: true });
    (0, useEffect)(() => {
      let live = true;
      const queue = downloadQueue();
      Promise.resolve().then(() => jobId ? queue.diagnose(jobId) : queue.diagnoseTitle(titleId, title)).then(
        (result) => live && setState({ result }),
        (error) => live && setState({ error: error.message })
      );
      return () => {
        live = false;
      };
    }, [jobId, titleId]);
    const { loading, result, error } = state;
    // Where Fix it stands once the logs are read (reading them teaches the queue the newest launch), and after a
    // press, its answer and the state that follows.
    const [fix, setFix] = (0, useState)(null);
    const stateOf = () => {
      try {
        return result ? downloadQueue().fixState(result.title) : null;
      } catch {
        return null;
      }
    };
    const now = fix ? fix.state : stateOf();
    const runFix = () => {
      if (fix?.busy) return;
      setFix({ busy: true, text: t2("fix.working", { title }), bad: false, state: now });
      const queue = downloadQueue();
      Promise.resolve().then(() => jobId ? queue.fixIt(jobId) : queue.fixTitle({ title: titleId, folders, root, label: title })).then(
        (answer) => setFix({ ...fixText(t2, answer, title), state: stateOf() }),
        (failure) => setFix({ text: failure.message, bad: true, state: now })
      );
    };
    const body = loading ? [/* @__PURE__ */ (0, jsx)(Block, { autoFocus: true, children: /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { color: colors.muted }], children: t2("diagnosis.checking") }) }, "loading")] : error ? [/* @__PURE__ */ (0, jsx)(Block, { autoFocus: true, children: /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { color: colors.fg }], children: t2("diagnosis.unavailable", { error }) }) }, "error")] : [
      /* @__PURE__ */ (0, jsxs)(Block, { autoFocus: true, children: [
        /* @__PURE__ */ (0, jsx)(LongText, { style: [BODY, { color: colors.fg }], children: result.verdict.text }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { fontSize: 19, color: colors.subtle }], children: t2("diagnosis.attempts", { count: result.launches, version: result.version || "?" }) })
      ] }, "verdict"),
      now ? /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 10, paddingHorizontal: 18, paddingVertical: 6 }, children: [
        // Once pressed it stays where the focus is, and a press again says where things stand.
        fixNeeded(now) || fix ? /* @__PURE__ */ (0, jsx)(Button2, { variant: "primary", icon: "restart", label: t2("fix.label"), focusKey: "diagnosis:fix", onPress: runFix, style: { alignSelf: "flex-start" } }) : null,
        /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { fontSize: 19, color: fix?.bad ? "#f87171" : fix ? colors.fg : colors.subtle }], children: fix?.text ?? fixStateText(t2, now, title) })
      ] }, "fix") : null,
      // 0.5.1: it loaded its own fakelib; turning that off is the first thing to try when it crashes.
      result.fakelib ? /* @__PURE__ */ (0, jsx)(Block, { children: /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { color: colors.fg }], children: t2("diagnosis.fakelibTip") }) }, "fakelib") : null,
      // 0.5.4: it froze; the error code alone read like a failed install.
      result.froze ? /* @__PURE__ */ (0, jsx)(Block, { children: /* @__PURE__ */ (0, jsx)(LongText, { style: [BODY, { color: colors.fg }], children: tWhole("diagnosis.frozeTip") }) }, "froze") : null,
      result.lines.length ? /* @__PURE__ */ (0, jsx)(Lines, { heading: t2("diagnosis.logLines"), lines: result.lines }, "log") : null,
      result.kernel.length ? /* @__PURE__ */ (0, jsx)(Lines, { heading: t2("diagnosis.kernelLines"), lines: result.kernel }, "kernel") : /* @__PURE__ */ (0, jsx)(Block, { children: /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { color: colors.muted }], children: t2(result.kernelRead ? "diagnosis.noKernel" : "diagnosis.kernelUnread") }) }, "kernel")
    ].filter(Boolean);
    return /* @__PURE__ */ (0, jsx)(SideSheet, { title: t2("diagnosis.title"), subtitle: title, onClose, children: /* @__PURE__ */ (0, jsx)(View, { style: { gap: 12, padding: 9 }, children: body }) });
  }

export { DiagnosisSheet };
