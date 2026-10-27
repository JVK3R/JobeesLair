// While a download's file link is captured from the console's browser (state/download-queue.js, from
// Overdrive 1.0.6): what to do on the page and how far it got; a file that names no game, for the gamer to
// accept or pass over; and, when the capture fails, typing the link in as before.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { URLDialog } from './URLDialog.jsx';
import { useT } from '../i18n/index.js';
import { downloadQueue } from '../state/downloads.js';
import { formatBytes } from '../state/size.js';
import { Button2 } from '../ui/Button.jsx';
import { colors, radius } from '../ui/colors.js';
import { FocusScope, Text, View } from '@ps5-react/core';

  var text = (size, color, extra) => ({ fontFamily: "Exo2", fontSize: size, lineHeight: Math.round(size * 1.5), color, ...extra });
  function Panel({ onBack, children }) {
    return /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: () => {
      onBack();
      return true;
    }, children: /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.canvas}f2` }, children: /* @__PURE__ */ (0, jsx)(View, { style: { width: 1380, gap: 30, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 48 }, children }) }) });
  }
  function BrowserCaptureDialog({ job: job2 }) {
    const t2 = useT();
    const close = () => downloadQueue().cancelBrowserCapture(job2.id);
    if (job2.captureState === "failed") return /* @__PURE__ */ (0, jsx)(URLDialog, {
      title: t2("download.fileLink"),
      detail: job2.captureError ? t2("capture.failed", { error: job2.captureError }) : t2("download.fileLinkDetail"),
      submit: (url) => downloadQueue().continueWithURL(job2.id, url),
      onClose: close
    });
    // A captured file that names no game: the gamer says whether it is the one they chose.
    if (job2.captureState === "confirm" && job2.captureFile) return /* @__PURE__ */ (0, jsxs)(Panel, { onBack: () => downloadQueue().confirmCapturedFile(job2.id, false), children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: text(36, colors.fg), children: t2("capture.confirm.title") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(24, colors.muted, { width: 1260, numberOfLines: 2, ellipsizeMode: "tail" }), children: job2.title }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(24, colors.fg, { width: 1260, numberOfLines: 2, ellipsizeMode: "tail" }), children: `${job2.captureFile.name || t2("capture.confirm.noName")} \xB7 ${formatBytes(job2.captureFile.bytes)}` }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(24, colors.muted, { width: 1260, numberOfLines: 3, ellipsizeMode: "tail" }), children: t2("capture.confirm.detail") }),
      /* @__PURE__ */ (0, jsx)(Button2, { label: t2("capture.confirm.accept"), onPress: () => downloadQueue().confirmCapturedFile(job2.id, true) }),
      /* @__PURE__ */ (0, jsx)(Button2, { label: t2("capture.confirm.refuse"), variant: "outline", onPress: () => downloadQueue().confirmCapturedFile(job2.id, false) })
    ] });
    const link = job2.captureMode === "link";
    // 0.5.3: how far it got, by a state it has a message for: "confirm" just answered (its file gone, the next state
    // not set yet) read "capture.confirm" on screen for a moment.
    const stage = ["preparing", "capturing", "validating"].includes(job2.captureState) ? job2.captureState : "preparing";
    return /* @__PURE__ */ (0, jsxs)(Panel, { onBack: close, children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: text(36, colors.fg), children: t2(link ? "capture.link.title" : "capture.title") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(24, colors.muted, { width: 1260, numberOfLines: 2, ellipsizeMode: "tail" }), children: job2.title }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(26, colors.glow, { fontWeight: 600 }), children: t2(`capture.${stage}`) }),
      /* @__PURE__ */ (0, jsx)(Text, { style: text(24, colors.muted, { width: 1260, numberOfLines: 3, ellipsizeMode: "tail" }), children: t2(link ? "capture.link.detail" : "capture.detail") }),
      /* @__PURE__ */ (0, jsx)(Button2, { label: t2("download.enterLink"), variant: "outline", onPress: () => downloadQueue().cancelBrowserCapture(job2.id, { manual: true }) }),
      /* @__PURE__ */ (0, jsx)(Button2, { label: t2("urlDialog.cancel"), variant: "outline", onPress: close })
    ] });
  }

export { BrowserCaptureDialog };
