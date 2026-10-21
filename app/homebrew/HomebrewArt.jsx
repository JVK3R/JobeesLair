// An app's picture in the Homebrew section, at any size: its own icon (sce_sys/icon0.png and the like) fills
// the square; a logo sits whole on a tile tinted for its category; a project with neither shows its banner
// or screenshot, cropped to the square; one with no art at all gets a monogram tile in its category's
// colors, with its author's avatar in the corner. Every picture is a link to the author's own repository
// (tools/homebrew/build-index.mjs checked each one decodes here).
// A page of tiles asks GitHub for dozens of pictures at once, and it refuses some for a moment: a picture
// that fails is asked for again twice, a few seconds apart, before the next one in line is drawn.
// MODIFIED (0.5.0 Pre Release 2): a picture refused because the engine's image registry was full is not given
// up: it is asked for again, later each time, as other pictures leave the screen. The author's avatar in a
// monogram's corner is drawn only on an app's page (a big tile), not on the many small ones.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { Image, Text, View } from '@ps5-react/core';
import { colors, radius as radii } from '../ui/colors.js';

  // Each category's pair of colors: the tile's gradient, dark to light.
  var TINTS = {
    emulators: ["#2b1055", "#7597de"],
    games: ["#5f0a2c", "#ff5f6d"],
    media: ["#1e3c72", "#2a9df4"],
    streaming: ["#0f2027", "#2c9a8f"],
    jailbreak: ["#3a0b0b", "#e0482a"],
    files: ["#11324d", "#3fa9d6"],
    dumps: ["#232526", "#7a8a99"],
    system: ["#16222a", "#3a8f8a"],
    controllers: ["#2d1b3d", "#b05ee6"],
    mods: ["#3d2a05", "#f2a516"],
    stores: ["#0b2e1f", "#2ec27e"],
    dev: ["#1c1c2e", "#6366f1"],
    linux: ["#2b2b0c", "#d4c21a"]
  };
  var tintOf = (category) => TINTS[category] ?? ["#1d2738", "#4cc9f0"];
  var gradientOf = (category) => {
    const [dark, light] = tintOf(category);
    return { type: "linear", to: "bottom right", stops: [{ color: light, offset: 0 }, { color: dark, offset: 1 }] };
  };
  var RETRIES = 2, RETRY_MS = 2500;
  // A full registry is waited out: up to this many tries, 4, 8, 12... seconds apart.
  var FULL_RETRIES = 8, FULL_MS = 4e3;
  var BADGE_MIN = 250;
  var full = (event) => /registry is full/.test(event?.nativeEvent?.error ?? "");
  // Pictures that failed for good this launch: not asked for again by the next tile that shows them.
  var lost = /* @__PURE__ */ new Set();
  var logged = /* @__PURE__ */ new Set();
  // Up to two letters: the first of each of the first two words (a camel-cased one splits too).
  function monogram(name) {
    const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
    return letters.toUpperCase();
  }
  // The pictures to try, best first: [url, how it is drawn].
  function candidates(app) {
    const list = [];
    if (app.icon && !app.iconFromAvatar) list.push([app.icon, "icon"]);
    if (app.logo) list.push([app.logo, "logo"]);
    if (app.hero) list.push([app.hero, "banner"]);
    return list;
  }
  // The one being drawn and its attempt; a failure retries it, then moves on to the next.
  function useArt(app) {
    const list = candidates(app);
    const [at, setAt] = useState({ index: 0, tries: 0 });
    const [waiting, setWaiting] = useState(0);
    useEffect(() => {
      if (!waiting) return void 0;
      const id = setTimeout(() => {
        setWaiting(0);
        setAt((now) => ({ ...now, tries: now.tries + 1 }));
      }, waiting);
      return () => clearTimeout(id);
    }, [waiting]);
    // The first from where it is that has not failed for good (another tile may have given one up).
    const current = list.slice(at.index).find(([url]) => !lost.has(url)) ?? null;
    const onError = (event) => {
      const url = current?.[0];
      if (!url) return;
      if (full(event)) {
        if (at.tries < FULL_RETRIES) return setWaiting(FULL_MS * (at.tries + 1));
      } else if (at.tries < RETRIES) return setWaiting(RETRY_MS * (at.tries + 1));
      // Not lost for good when only the registry was full: the next tile (or this one, remounted) tries it.
      if (!full(event)) lost.add(url);
      if (!logged.has(url)) {
        logged.add(url);
        console.log(`[homebrew] ${app.id}: picture not drawn (${event?.nativeEvent?.error ?? "error"}): ${url}`);
      }
      setAt({ index: list.indexOf(current) + 1, tries: 0 });
    };
    return { current: waiting ? null : current, waiting: waiting > 0, key: `${at.index}:${at.tries}`, onError };
  }
  function Monogram({ app, size, round }) {
    const [failed, setFailed] = useState(false);
    const badge = Math.round(size * 0.3);
    return jsxs(View, { style: { width: size, height: size, borderRadius: round, overflow: "hidden", roundedClip: true, backgroundGradient: gradientOf(app.category), alignItems: "center", justifyContent: "center" }, children: [
      jsx(Text, { style: { fontFamily: "Exo2", fontWeight: 700, fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.46), color: "#ffffffee", letterSpacing: 1 }, children: monogram(app.name) }),
      size >= BADGE_MIN && app.icon && app.iconFromAvatar && !failed ? jsx(View, { style: { position: "absolute", right: Math.round(size * 0.06), bottom: Math.round(size * 0.06), width: badge, height: badge, borderRadius: radii.pill, overflow: "hidden", roundedClip: true, borderWidth: Math.max(2, Math.round(size / 80)), borderColor: "#ffffffcc", backgroundColor: colors.surface2 }, children: jsx(Image, { source: { uri: app.icon }, resizeMode: "cover", style: { width: badge, height: badge, borderRadius: radii.pill }, onError: () => setFailed(true) }) }) : null
    ] });
  }
  function HomebrewArt({ app, size, round = radii.lg }) {
    const { current, waiting, key, onError } = useArt(app);
    const box = { width: size, height: size, borderRadius: round };
    // Between attempts: the category's tile, empty.
    if (waiting) return jsx(View, { style: [box, { backgroundGradient: gradientOf(app.category) }] });
    if (!current) return jsx(Monogram, { app, size, round });
    const [uri, how] = current;
    if (how === "logo") {
      const inset = Math.round(size * 0.1);
      return jsx(View, { style: [box, { overflow: "hidden", roundedClip: true, backgroundGradient: gradientOf(app.category), alignItems: "center", justifyContent: "center" }], children: jsx(Image, { source: { uri }, resizeMode: "contain", style: { width: size - inset * 2, height: size - inset * 2 }, onError }, key) });
    }
    return jsx(Image, { source: { uri }, resizeMode: "cover", style: [box, { backgroundColor: colors.surface2 }], onError }, key);
  }

export { HomebrewArt, gradientOf, tintOf };
