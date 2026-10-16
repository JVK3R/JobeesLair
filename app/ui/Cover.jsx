// ../pub-game-store/native/ui/Cover.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { jsx } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { Image, Text, View } from '@ps5-react/core';
import { colors } from './colors.js';

  var SKELETON = { backgroundColor: colors.surface2 };
  var tinted = /* @__PURE__ */ new Map();
  var skeleton = (tint) => tint ? tinted.get(tint) ?? tinted.set(tint, { backgroundColor: tint }).get(tint) : SKELETON;
  var STALL_MS = 8e3;
  var waiting = /* @__PURE__ */ new Map();
  var sweep = null;
  function watchStall(onStall) {
    const token = {};
    waiting.set(token, { deadline: Date.now() + STALL_MS, onStall });
    sweep ?? (sweep = setInterval(() => {
      const now = Date.now();
      for (const [key, entry2] of waiting) if (entry2.deadline <= now) {
        waiting.delete(key);
        entry2.onStall();
      }
      if (!waiting.size) {
        clearInterval(sweep);
        sweep = null;
      }
    }, 1e3));
    return () => waiting.delete(token);
  }
  var fill = (style) => ({
    width: "100%",
    height: "100%",
    borderRadius: Object.assign({}, ...[style].flat(Infinity).filter(Boolean)).borderRadius
  });
  function Cover({ game, style, label = true }) {
    const [failed, setFailed] = (0, useState)([]);
    const [loaded, setLoaded] = (0, useState)(null);
    const copies = [game.art.cover, ...game.art.coverFallbacks || []].filter((url) => url && !failed.includes(url));
    const uri = copies[0];
    const last = copies.length < 2;
    (0, useEffect)(() => {
      if (!uri || loaded === uri || last) return void 0;
      return watchStall(() => setFailed((previous) => [...previous, uri]));
    }, [uri, loaded, last]);
    if (uri) {
      return /* @__PURE__ */ (0, jsx)(View, { style: loaded === uri ? style : [skeleton(game.art.tint), style], children: /* @__PURE__ */ (0, jsx)(
        Image,
        {
          source: { uri },
          resizeMode: "cover",
          style: fill(style),
          onLoad: () => setLoaded(uri),
          onError: () => setFailed((previous) => [...previous, uri])
        },
        uri
      ) });
    }
    return /* @__PURE__ */ (0, jsx)(View, { style: [{ overflow: "hidden" }, style], children: /* @__PURE__ */ (0, jsx)(View, { style: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2, padding: 12 }, children: label && /* @__PURE__ */ (0, jsx)(Text, { style: { width: "100%", textAlign: "center", fontFamily: "Exo2", fontSize: 21, color: colors.muted, numberOfLines: 3, ellipsizeMode: "tail", lineHeight: 30 }, children: game.title }) }) });
  }

export { Cover };
