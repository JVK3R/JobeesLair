// ../pub-game-store/native/game/GameFacts.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: the fact labels stay in English.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { preferredRelease } from './sources.js';
import { useT } from '../i18n/index.js';
import en from '../i18n/locales/en.json';
import { formatDate3 } from '../state/catalog.js';
import { formatBytes, formatSize } from '../state/size.js';
import { playParts, usePlaytime } from '../state/playtime.js';
import { PlatformBadge } from '../ui/PlatformBadge.jsx';
import { DeviceInfo, Text, View } from '@ps5-react/core';
import { colors } from '../ui/colors.js';

  // A label gets 144 px beside its 264 px value, and every translation but English runs longer
  // (“Dimensione del download” is 253 px), pushing the value out of the panel. The labels stay
  // in English, the shortest; the title and the values (dates, sizes) follow the language.
  var label = (key) => en[key];
  var offsetNow = () => {
    try {
      return DeviceInfo.utcOffset(Date.now());
    } catch {
      return 0;
    }
  };
  function GameFacts({ game }) {
    const t2 = useT();
    const releases = game.releases || [];
    const bytes = releases[preferredRelease(releases)]?.sizeBytes;
    const size = bytes ? [label("game.facts.downloadSize"), formatBytes(bytes)] : [label("game.facts.installSize"), game.sizeGb ? formatSize(game.sizeGb) : "\u2014"];
    const platform = /* @__PURE__ */ (0, jsx)(PlatformBadge, { platforms: game.platforms });
    // Hours played and when, once ShadowMount's log has shown this game running (state/playtime.js).
    const played = usePlaytime(game.titleId || game.id);
    const { time, last } = playParts(played, { now: Date.now(), offsetMinutes: offsetNow() });
    const rows = [
      [label("game.facts.platform"), platform],
      [label("game.facts.publisher"), game.publisher || "\u2014"],
      [label("game.facts.releaseDate"), formatDate3(game.releaseDate)],
      size,
      ...time ? [[label("game.facts.playTime"), t2(time.key, time.params)]] : [],
      ...last ? [[label("game.facts.lastPlayed"), t2(last.key.replace("play.last", "play.when"), last.params)]] : []
    ];
    return /* @__PURE__ */ (0, jsxs)(View, { style: { width: 432 }, children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 30, fontWeight: 600, color: colors.fg, lineHeight: 42, letterSpacing: 0.4 }, children: t2("game.details") }),
      /* @__PURE__ */ (0, jsx)(View, { style: { marginTop: 24, borderBottomWidth: 2, borderColor: colors.line }, children: rows.map(
        ([label, value]) => /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", justifyContent: "space-between", gap: 24, borderTopWidth: 2, borderColor: colors.line, paddingVertical: 18 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.subtle, lineHeight: 30 }, children: label }),
          typeof value === "string" ? /* @__PURE__ */ (0, jsx)(Text, { style: { width: 264, fontFamily: "JetBrainsMono-Regular", fontSize: 19, color: colors.fg, textAlign: "end", numberOfLines: 1, ellipsizeMode: "tail", lineHeight: 30 }, children: value }) : value
        ] }, label)
      ) })
    ] });
  }

export { GameFacts };
