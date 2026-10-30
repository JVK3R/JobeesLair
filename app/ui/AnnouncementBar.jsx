// 0.5.2: announcements from Jobee'sLair (state/online.js, posted from the dashboard), in a bar under the top island
// on every section, for as long as they're up: nothing on it takes focus or closes it, and it goes when it's taken
// down. With a few up, they take turns: each stays long enough to read (TURN_MS), fades out, and the next comes in;
// warnings come first. The dots at the end say how many there are, and the one showing fills up until the next.
// Pages start under it while it's up (index.jsx, useBarSpace). When it comes or goes, it fades and the pages glide
// the 66 px to their new place: they used to jump there at once, under the gamer's eyes, wherever they were.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { AnimatePresence, Text, View, motion } from '@ps5-react/core';
import { LATIN_IN_RTL, useLocale, useT } from '../i18n/index.js';
import { online, useOnline } from '../state/online.js';
import { Icon } from './Icon.jsx';
import { colors, radius } from './colors.js';
import { EASE_OUT } from './ease.js';
import { GLIDE, SNAP, nextPlace } from './page-glide.js';
import { logical } from './scale.js';

  // Under the island and its version tab, a little lower than pages start without it (index.jsx PAGE_TOP, 128).
  var BAR_TOP = 132, BAR_HEIGHT = 48;
  // How far pages move down while it's up: to under the bar, with a gap.
  var BAR_SPACE = BAR_TOP + BAR_HEIGHT + 14 - 128;
  var AMBER = "#fbbf24";
  // Long enough to read: 6 s, more for a long one.
  var turnOf = (note) => Math.max(6e3, 2500 + note.text.length * 60);
  var LEAVE_MS = 200;
  // How the bar goes when the last announcement is taken down.
  var GONE = { opacity: 0, transition: { type: "tween", duration: 0.25, ease: "easeIn" } };
  var DOT = 8, RUN = 28;
  var toneOf = (note) => note.level === "warning" ? AMBER : colors.glow;
  // The dots: one each, the one showing a short track that fills over its turn.
  function Turns({ count, at, note, turn }) {
    const { rtl } = useLocale();
    const sign = rtl ? -1 : 1;
    return jsx(View, { style: { flexDirection: "row", alignItems: "center", gap: 8 }, children: Array.from({ length: count }, (_, i) => i === at
      ? jsx(View, { style: { width: RUN, height: DOT, overflow: "hidden", roundedClip: true, borderRadius: radius.pill, backgroundColor: "#ffffff2e" }, children: jsx(motion.View, {
        style: { position: "absolute", top: 0, bottom: 0, left: 0, width: RUN, backgroundColor: toneOf(note) },
        initial: { x: -RUN * sign },
        animate: { x: 0 },
        transition: { type: "tween", duration: turn / 1e3, ease: "linear" }
      }, `${note.id}:${at}`) }, i)
      : jsx(View, { style: { width: DOT, height: DOT, borderRadius: radius.pill, backgroundColor: "#ffffff40" } }, i)) });
  }
  function AnnouncementBar() {
    const t2 = useT();
    const { rtl } = useLocale();
    const { announcements } = useOnline();
    const [index, setIndex] = useState(0);
    const [leaving, setLeaving] = useState(false);
    const count = announcements.length;
    const at = count ? index % count : 0;
    const note = announcements[at];
    const turn = note ? turnOf(note) : 0;
    useEffect(() => {
      if (count < 2) return void 0;
      const id = setTimeout(() => setLeaving(true), turn);
      return () => clearTimeout(id);
    }, [count, at, note?.id]);
    useEffect(() => {
      if (!leaving) return void 0;
      const id = setTimeout(() => {
        setLeaving(false);
        setIndex(at + 1);
      }, LEAVE_MS);
      return () => clearTimeout(id);
    }, [leaving]);
    // In an AnimatePresence, so the bar fades out when the last one is taken down instead of vanishing.
    if (!note) return jsx(AnimatePresence, { children: null });
    const warning = note.level === "warning";
    const tone = toneOf(note);
    return jsx(AnimatePresence, { children: jsxs(motion.View, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: GONE, transition: { type: "tween", duration: 0.4, ease: EASE_OUT }, style: { position: "absolute", left: 48, right: 48, top: BAR_TOP, height: BAR_HEIGHT, zIndex: 30, flexDirection: "row", alignItems: "center", gap: 14, overflow: "hidden", roundedClip: true, borderRadius: radius.md, borderWidth: 1, borderColor: warning ? `${AMBER}66` : colors.glassEdge, backgroundColor: colors.surface, paddingLeft: 7, paddingRight: 20 }, children: [
      // The icon, the label and the text change together as the next comes in (and the edge, amber for a warning).
      jsxs(motion.View, { initial: { opacity: 0, y: 10 }, animate: leaving ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }, transition: leaving ? { type: "tween", duration: LEAVE_MS / 1e3, ease: "easeIn" } : { type: "tween", duration: 0.4, ease: EASE_OUT }, style: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 }, children: [
        jsx(View, { style: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: `${tone}26` }, children: jsx(Icon, { name: warning ? "alert" : "megaphone", size: 18, color: tone }) }),
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 15, fontWeight: 700, letterSpacing: 1.6, lineHeight: 20, color: tone }, children: t2("news.title").toUpperCase() }),
        jsx(View, { style: { width: 2, height: 20, borderRadius: radius.sm, backgroundColor: colors.line } }),
        jsx(Text, { style: [{ flex: 1, fontFamily: "Exo2", fontSize: 20, lineHeight: 26, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, rtl ? LATIN_IN_RTL : void 0], children: note.text })
      ] }, note.id),
      count > 1 ? jsx(Turns, { count, at, note, turn }) : null
    ] }, "bar") });
  }
  /** How far pages move down for the bar: BAR_SPACE while announcements are up, else 0. */
  function useBarSpace() {
    const [up, setUp] = useState(() => online().snapshot().announcements.length > 0);
    useEffect(() => online().subscribe((now) => setUp(now.announcements.length > 0)), []);
    return up ? BAR_SPACE : 0;
  }
  /**
   * 0.5.2: where a page is while the bar comes or goes, gliding instead of jumping (ui/page-glide.js): { top, its
   * layout's offset in screen px; y, its drawing's in motion's 1280-wide units (logical); transition, how y gets there }.
   */
  function usePageGlide() {
    const up = useBarSpace() > 0;
    const [place, setPlace] = useState(() => ({ top: up ? BAR_SPACE : 0, y: 0, glide: false }));
    useEffect(() => {
      const step = nextPlace(place, up, BAR_SPACE);
      if (!step) return void 0;
      if (!step.after) {
        setPlace(step.place);
        return void 0;
      }
      const id = setTimeout(() => setPlace(step.place), step.after);
      return () => clearTimeout(id);
    }, [up, place]);
    return { top: place.top, y: logical(place.y), transition: place.glide ? GLIDE : SNAP };
  }

export { AnnouncementBar, BAR_SPACE, useBarSpace, usePageGlide };
