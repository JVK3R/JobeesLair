// ../pub-game-store/native/ui/DownloadToast.jsx
// reconstructed from the esbuild bundle in eboot.bin

import { jsx } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { useDownloadAlerts } from '../downloads/useDownloadAlerts.js';
import { useT } from '../i18n/index.js';
import { getGame } from '../state/catalog.js';
import { useNavActions, useNavState } from '../state/nav.jsx';
import { countFinished } from '../state/thanks.js';
import { Toast } from './Toast.jsx';
import { pulseNotice } from './haptics.js';
import { AnimatePresence } from '@ps5-react/core';

  var TOAST_MS2 = 6e3;
  var THANKS_MS = 10e3;     // two sentences to read
  function DownloadToast({ actionRef }) {
    const t2 = useT();
    const [alert, setAlert] = (0, useState)(null);
    // 0.5.6: the fifth finished download's toast is followed by the one thank-you (state/thanks.js).
    const thanks = (0, useRef)(false);
    useDownloadAlerts((next) => {
      pulseNotice();
      if (next.kind === "complete" && countFinished()) thanks.current = true;
      setAlert((last) => ({ ...next, n: (last?.n ?? 0) + 1 }));
    });
    const { top } = useNavState();
    const nav = useNavActions();
    const thanking = alert?.kind === "thanks";
    const quiet = !thanking && (top.name === "downloads" || top.name === "game" && top.id === alert?.gameId);
    const shown = alert && !quiet ? alert : null;
    const game = shown && !thanking && getGame(shown.gameId);
    const failed = shown?.kind === "failed";
    (0, useEffect)(() => {
      if (!alert) return void 0;
      const id = setTimeout(() => {
        if (thanks.current && !thanking) {
          thanks.current = false;
          setAlert((last) => ({ kind: "thanks", n: (last?.n ?? 0) + 1 }));
        } else setAlert(null);
      }, thanking ? THANKS_MS : TOAST_MS2);
      return () => clearTimeout(id);
    }, [alert]);
    actionRef.current = shown && (() => {
      setAlert(null);
      if (thanking) {
        nav.push({ name: "settings" });
        nav.focusLater("settings:support");
      } else if (failed || !game) nav.push({ name: "downloads" });
      else nav.openGame(game.id);
    });
    return /* @__PURE__ */ (0, jsx)(AnimatePresence, { children: shown && /* @__PURE__ */ (0, jsx)(
      Toast,
      thanking ? {
        icon: "heart",
        title: t2("thanks.title"),
        status: t2("thanks.text"),
        action: { button: "r2", label: t2("thanks.open") },
        duration: THANKS_MS
      } : {
        game,
        icon: failed ? "alert" : "circleCheck",
        status: shown.message,
        title: shown.title,
        failed,
        action: { button: "r2", label: t2(failed ? "toast.openDownloads" : "toast.viewGame") },
        duration: TOAST_MS2
      },
      shown.n
    ) });
  }

export { DownloadToast };
