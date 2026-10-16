// "Why won't it start?": what ShadowMount's logs say about a game's last launch. Read-only: the queue
// fetches ShadowMount's debug and system logs and picks out this title's lines (state/launch-diagnosis.js).

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { useT } from '../i18n/index.js';
import { downloadQueue } from '../state/downloads.js';
import { FocusRing } from '../ui/FocusRing.jsx';
import { SideSheet } from '../ui/SideSheet.jsx';
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
  function DiagnosisSheet({ title, jobId, onClose }) {
    const t2 = useT();
    const [state, setState] = (0, useState)({ loading: true });
    (0, useEffect)(() => {
      let live = true;
      Promise.resolve().then(() => downloadQueue().diagnose(jobId)).then(
        (result) => live && setState({ result }),
        (error) => live && setState({ error: error.message })
      );
      return () => {
        live = false;
      };
    }, [jobId]);
    const { loading, result, error } = state;
    const body = loading ? [/* @__PURE__ */ (0, jsx)(Block, { autoFocus: true, children: /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { color: colors.muted }], children: t2("diagnosis.checking") }) }, "loading")] : error ? [/* @__PURE__ */ (0, jsx)(Block, { autoFocus: true, children: /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { color: colors.fg }], children: t2("diagnosis.unavailable", { error }) }) }, "error")] : [
      /* @__PURE__ */ (0, jsxs)(Block, { autoFocus: true, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { color: colors.fg }], children: result.verdict.text }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { fontSize: 19, color: colors.subtle }], children: t2("diagnosis.attempts", { count: result.launches, version: result.version || "?" }) })
      ] }, "verdict"),
      result.lines.length ? /* @__PURE__ */ (0, jsx)(Lines, { heading: t2("diagnosis.logLines"), lines: result.lines }, "log") : null,
      result.kernel.length ? /* @__PURE__ */ (0, jsx)(Lines, { heading: t2("diagnosis.kernelLines"), lines: result.kernel }, "kernel") : /* @__PURE__ */ (0, jsx)(Block, { children: /* @__PURE__ */ (0, jsx)(Text, { style: [BODY, { color: colors.muted }], children: t2(result.kernelRead ? "diagnosis.noKernel" : "diagnosis.kernelUnread") }) }, "kernel")
    ].filter(Boolean);
    return /* @__PURE__ */ (0, jsx)(SideSheet, { title: t2("diagnosis.title"), subtitle: title, onClose, children: /* @__PURE__ */ (0, jsx)(View, { style: { gap: 12, padding: 9 }, children: body }) });
  }

export { DiagnosisSheet };
