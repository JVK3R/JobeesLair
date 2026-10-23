// The screen saver (0.5.0 Pre Release 4). After ten minutes without a button press (IDLE_MS), a slideshow of the
// catalog's most popular games fills the screen: full-screen screenshots from their own store pages
// (data/screensaver.js), each drifting slowly while the next fades in, the game's name, the time, and how a
// download is going if one is. Any button brings the store back, and that press does nothing else. It stays
// away while a browser capture is open or a video plays, and when Settings turns it off.
// One picture is drawn at a time (two while they cross), well inside the engine's image budget.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { DeviceInfo, FocusScope, Image, Text, View, motion, useController } from '@ps5-react/core';
import { slides } from '../data/screensaver.js';
import { useLocale, useT } from '../i18n/index.js';
import { downloadQueue } from '../state/downloads.js';
import { useIsImmersive } from '../state/nav.jsx';
import { IDLE_MS, onShowScreenSaver, useScreenSaverOn } from '../state/screen-saver.js';
import { JLMark } from './JLMark.jsx';

  var CHECK_MS = 15e3;
  var SLIDE_MS = 9e3;
  var FADE = { type: "tween", duration: 1.4, ease: "easeInOut" };
  var FULL = { position: "absolute", top: 0, left: 0, width: 1920, height: 1080 };
  // MODIFIED (0.5.1): full-screen slides. (An earlier 0.5.1 build decoded a slide at 1280 x 720 and asked the
  // engine to draw it 1.5 times over; the engine applies a scale only to elements up to 512 px a side
  // (ui/scale.js canScale), so the slide sat in the middle of the screen at 1280 x 720.) A slide is the screen's
  // size plus the drift at each side, and drifts sideways only. Memory: three screen-size slides (the one
  // showing, the one under it, the next) are 25 MB, which failed with "out of memory for decoded pixels"
  // while a game extracted (its decoder holds most of the heap); so while one does, one slide is decoded at a
  // time (none under the next, no prefetch) and the next fades in from black.
  var DRIFT = 36;
  var SHOT = { position: "absolute", left: -DRIFT, top: 0, width: 1920 + 2 * DRIFT, height: 1080 };
  var SLIDE_SIZE = { width: SHOT.width, height: SHOT.height };
  var CAPTURING = /* @__PURE__ */ new Set(["preparing", "capturing", "validating", "confirm"]);
  var text = (size, color, extra) => ({ fontFamily: "Exo2", fontSize: size, lineHeight: Math.round(size * 1.3), color, ...extra });
  // Whether a game is being extracted now (the slides are shown one at a time then, see SHOT).
  function extracting() {
    try {
      return downloadQueue().snapshot().some((job) => job.state === "extracting");
    } catch {
      return false;
    }
  }
  // Whether the console's browser is open for a capture (the app is behind it, and the player is busy there).
  function capturing() {
    try {
      return downloadQueue().snapshot().some((job) => CAPTURING.has(job.captureState) || job.aheadState === "capturing");
    } catch {
      return false;
    }
  }
  // The time on the console's clock: 12-hour in English, 24-hour elsewhere. No Date objects (state/clock.js).
  function clock(locale) {
    let offset = 0;
    try {
      offset = Number(DeviceInfo.utcOffset(Date.now())) || 0;
    } catch {
    }
    const inDay = ((Date.now() + offset * 6e4) % 864e5 + 864e5) % 864e5;
    const hours = Math.floor(inDay / 36e5), minutes = String(Math.floor(inDay % 36e5 / 6e4)).padStart(2, "0");
    if (String(locale || "en").startsWith("en")) return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  }
  // One slide: the screenshot fading in over the one before, and drifting while it shows.
  function Slide({ slide, index, onShown, onFail }) {
    const drift = index % 2 ? DRIFT : -DRIFT;
    return jsx(motion.View, { style: FULL, initial: { opacity: 0 }, animate: { opacity: 1 }, transition: FADE, children: jsx(motion.View, { style: SHOT, initial: { x: 0 }, animate: { x: drift }, transition: { type: "tween", duration: (SLIDE_MS + 1600) / 1e3, ease: "linear" }, children: jsx(Image, { source: { uri: slide.url }, resizeMode: "cover", style: SLIDE_SIZE, onLoad: onShown, onError: onFail }) }) });
  }
  // The download in progress, if any: its name and how far along.
  function useDownloading() {
    const [shown, setShown] = useState(null);
    useEffect(() => {
      let last = "";
      try {
        return downloadQueue().subscribe((jobs) => {
          const job = jobs.find((item) => item.state === "downloading");
          const percent = job?.total ? Math.floor(Math.min(1, job.written / job.total) * 100) : null;
          const key = job ? `${job.id}|${percent}` : "";
          if (key === last) return;
          last = key;
          setShown(job ? { title: job.title, percent } : null);
        });
      } catch {
        return void 0;
      }
    }, []);
    return shown;
  }
  function Saver({ onWake }) {
    const t2 = useT();
    const { locale } = useLocale();
    const [index, setIndex] = useState(() => Math.floor(Math.random() * slides.length));
    const [time, setTime] = useState(() => clock(locale));
    const downloading = useDownloading();
    // Any button wakes the store: a press here is taken by the saver's own scope, so it does nothing else.
    useController(() => onWake());
    useEffect(() => {
      const id = setInterval(() => setIndex((n) => (n + 1) % slides.length), SLIDE_MS);
      return () => clearInterval(id);
    }, []);
    // 0.5.1: a picture that cannot be shown (its host not answering, no memory to decode it while a game
    // extracts) is skipped for the next at once instead of leaving the screen black, up to once round the
    // list; a picture that shows starts the count again.
    const failed = useRef(0);
    const skip = (at) => {
      if (failed.current++ >= slides.length) return;
      setIndex((n) => n === at ? (n + 1) % slides.length : n);
    };
    const shown = () => {
      failed.current = 0;
    };
    useEffect(() => {
      const id = setInterval(() => setTime(clock(locale)), 15e3);
      return () => clearInterval(id);
    }, [locale]);
    // One slide at a time while a game extracts (SHOT).
    const tight = extracting();
    // The next picture is fetched while this one shows, so it is ready to fade in.
    useEffect(() => {
      if (tight) return;
      const next = slides[(index + 1) % slides.length];
      try {
        Image.prefetch(next.url, { ...SLIDE_SIZE, resizeMode: "cover" }).catch(() => {
        });
      } catch {
      }
    }, [index, tight]);
    const slide = slides[index];
    const previous = tight ? null : slides[(index - 1 + slides.length) % slides.length];
    return jsx(View, { style: { ...FULL, zIndex: 100, backgroundColor: "#000000" }, children: jsx(FocusScope, { trap: true, autoFocus: true, onBack: () => (onWake(), true), onAction: () => (onWake(), true), children: jsxs(View, { focusKey: "screensaver", onPress: onWake, style: FULL, children: [
      previous ? jsx(View, { style: FULL, children: jsx(View, { style: SHOT, children: jsx(Image, { source: { uri: previous.url }, resizeMode: "cover", style: SLIDE_SIZE }) }) }, `under:${index}`) : null,
      jsx(Slide, { slide, index, onShown: shown, onFail: () => skip(index) }, `slide:${index}`),
      jsx(View, { style: { position: "absolute", left: 0, right: 0, top: 0, height: 220, backgroundGradient: { type: "linear", to: "bottom", stops: [{ color: "#000000aa", offset: 0 }, { color: "#00000000", offset: 1 }] } } }),
      jsx(View, { style: { position: "absolute", left: 0, right: 0, bottom: 0, height: 320, backgroundGradient: { type: "linear", to: "top", stops: [{ color: "#000000cc", offset: 0 }, { color: "#00000000", offset: 1 }] } } }),
      jsxs(View, { style: { position: "absolute", left: 80, top: 64, flexDirection: "row", alignItems: "center", gap: 16 }, children: [
        jsx(JLMark, { height: 34 }),
        jsx(Text, { style: text(28, "#ffffff", { fontWeight: 700 }), children: "Jobee'sLair" })
      ] }),
      jsx(View, { style: { position: "absolute", right: 80, top: 56 }, children: jsx(Text, { style: text(44, "#ffffff", { fontWeight: 600 }), children: time }) }),
      jsx(View, { style: { position: "absolute", left: 80, right: 760, bottom: 76 }, children: jsx(Text, { style: text(40, "#ffffff", { fontWeight: 700, numberOfLines: 1, ellipsizeMode: "tail" }), children: slide.title }) }),
      downloading ? jsxs(View, { style: { position: "absolute", right: 80, bottom: 80, width: 600, gap: 12 }, children: [
        jsx(Text, { style: text(22, "#ffffff", { textAlign: "right", numberOfLines: 1, ellipsizeMode: "tail" }), children: downloading.percent == null ? t2("saver.downloadingNoPercent", { title: downloading.title }) : t2("saver.downloading", { title: downloading.title, percent: downloading.percent }) }),
        jsx(View, { style: { height: 6, borderRadius: 3, backgroundColor: "#ffffff33" }, children: jsx(View, { style: { width: `${downloading.percent ?? 0}%`, height: 6, borderRadius: 3, backgroundColor: "#FF1E27" } }) })
      ] }) : jsx(View, { style: { position: "absolute", right: 80, bottom: 84 }, children: jsx(Text, { style: text(22, "#ffffffb3"), children: t2("saver.wake") }) })
    ] }) }) });
  }
  function ScreenSaver() {
    const on = useScreenSaverOn();
    const immersive = useIsImmersive();
    const [active, setActive] = useState(false);
    const last = useRef(Date.now());
    const busy = useRef(immersive);
    busy.current = immersive;
    useController(() => {
      last.current = Date.now();
    });
    useEffect(() => onShowScreenSaver(() => setActive(true)), []);
    useEffect(() => {
      if (!on || active || !slides.length) return void 0;
      const id = setInterval(() => {
        if (Date.now() - last.current < IDLE_MS || busy.current || capturing()) return;
        setActive(true);
      }, CHECK_MS);
      return () => clearInterval(id);
    }, [on, active]);
    if (!active || !slides.length) return null;
    return jsx(Saver, { onWake: () => {
      last.current = Date.now();
      setActive(false);
    } });
  }

export { ScreenSaver, clock };
