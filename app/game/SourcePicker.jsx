// ../pub-game-store/native/game/SourcePicker.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useMemo, useState } from 'react';
import { VersionFace } from './VersionSheet.jsx';
import { describeSource, isCdnProvider, preferredRelease, sourceSections } from './sources.js';
import { useT } from '../i18n/index.js';
import { getGame } from '../state/catalog.js';
import { downloadQueue } from '../state/downloads.js';
import { deviceFacts } from '../state/device.js';
import { backportAdvice } from '../state/firmware.js';
import { CdnAura, CdnSpark } from '../ui/CdnAura.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { SideSheet } from '../ui/SideSheet.jsx';
import { colors, radius } from '../ui/colors.js';
import { FileSystem, Text, View, useIsFocused } from '@ps5-react/core';

  var SECTION = {
    direct: { title: "sources.section.direct", icon: "download" },
    page: { title: "sources.section.page", icon: "download", note: "sources.section.pageNote" },
    browser: { title: "sources.section.browser", icon: "external" },
    dlc: { title: "sources.section.dlc", icon: "download", note: "sources.section.dlcNote" },
    backport: { title: "sources.section.backport", icon: "layers", note: "sources.section.backportNote" }
  };
  // The backport tag's ink: green when this console does not need one, amber when it is recommended.
  var ADVICE_TONE = { notNeeded: "#4ade80", recommended: "#fbbf24", unknown: null };
  // Whether this console needs a backport for the game (game param.json against its system software).
  function useBackportAdvice(gameId) {
    return useMemo(() => {
      try {
        let jobs = [];
        try {
          jobs = downloadQueue().snapshot();
        } catch {
        }
        return backportAdvice({ fs: FileSystem, titleId: getGame(gameId)?.titleId ?? gameId, firmware: deviceFacts().firmware, jobs });
      } catch {
        return null;
      }
    }, [gameId]);
  }
  function RowFace({ icon, name, detail: detail2, size, recommended, current, cdn }) {
    const t2 = useT();
    const focused = useIsFocused();
    const ink2 = focused ? colors.fg : colors.muted;
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      cdn ? /* @__PURE__ */ (0, jsx)(CdnAura, { radius: 8, width: 492 }) : null,
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      cdn ? /* @__PURE__ */ (0, jsx)(CdnSpark, { size: 18 }) : /* @__PURE__ */ (0, jsx)(Icon, { name: icon, size: 18, color: ink2 }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 12 }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 23, fontWeight: 600, color: colors.fg }, children: name }),
          recommended ? /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.xs, backgroundColor: colors.accent, paddingHorizontal: 9, paddingVertical: 2 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 18, fontWeight: 600, color: "#ffffff", lineHeight: 24 }, children: t2("sources.recommended") }) }) : null
        ] }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [{ width: 450, fontFamily: "Exo2", fontSize: 21, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, { color: ink2 }], children: detail2 || t2("sources.noDetails") })
      ] }),
      /* @__PURE__ */ (0, jsx)(Text, { style: [{ width: 108, fontFamily: "Exo2", fontSize: 21, textAlign: "end", lineHeight: 30 }, { color: ink2 }], children: size ?? "" }),
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 27, alignItems: "flex-end" }, children: current ? /* @__PURE__ */ (0, jsx)(Icon, { name: "check", size: 18, color: colors.fg }) : null })
    ] });
  }
  function Section2({ group, items, selected, recommended, revealed, onPick, tag }) {
    const t2 = useT();
    const { title, icon, note } = SECTION[group];
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 6 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { marginBottom: 6, gap: 3, paddingHorizontal: 18 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 20, fontWeight: 600, color: colors.subtle }, children: `${t2(title)} \xB7 ${items.length}` }),
        tag ? /* @__PURE__ */ (0, jsx)(Text, { style: { width: 660, fontFamily: "Exo2", fontSize: 21, fontWeight: 600, color: ADVICE_TONE[tag.key] ?? colors.subtle, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, children: tag.text }) : null,
        note ? /* @__PURE__ */ (0, jsx)(Text, { style: { width: 660, fontFamily: "Exo2", fontSize: 21, color: colors.subtle, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, children: t2(note) }) : null
      ] }),
      items.map(({ release, index }, row) => {
        const { name, detail: detail2, size } = describeSource(release);
        return /* @__PURE__ */ (0, jsx)(View, { autoFocus: index === selected || revealed && row === 0, onPress: () => onPick(index), style: (_state) => [{ position: "relative", minHeight: 84, flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 12 }, _state.focused ? { backgroundColor: colors.surface2 } : null], children: /* @__PURE__ */ (0, jsx)(
          RowFace,
          {
            icon,
            name,
            detail: detail2,
            size,
            cdn: isCdnProvider(release.provider),
            recommended: index === recommended && group !== "browser",
            current: index === selected
          }
        ) }, release.id);
      })
    ] });
  }
  function RevealFace({ count }) {
    const t2 = useT();
    const focused = useIsFocused();
    const ink2 = focused ? colors.fg : colors.muted;
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(Icon, { name: "external", size: 18, color: ink2 }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 23, fontWeight: 600, color: colors.fg }, children: t2("sources.showBrowser", { count }) }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [{ width: 570, fontFamily: "Exo2", fontSize: 21, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, { color: ink2 }], children: t2("sources.browserNote") })
      ] }),
      /* @__PURE__ */ (0, jsx)(Icon, { name: "chevronDown", size: 18, color: ink2 })
    ] });
  }
  function Versions({ editions, current, onEdition }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 6 }, children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: { marginBottom: 6, paddingHorizontal: 18, fontFamily: "Exo2", fontSize: 20, fontWeight: 600, color: colors.subtle }, children: `${t2("sources.section.versions")} \xB7 ${editions.length}` }),
      editions.map(
        (edition2, index) => /* @__PURE__ */ (0, jsx)(View, { onPress: () => onEdition(edition2), style: (_state2) => [{ position: "relative", flexDirection: "row", alignItems: "center", gap: 24, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 18 }, _state2.focused ? { backgroundColor: colors.surface2 } : null], children: /* @__PURE__ */ (0, jsx)(
          VersionFace,
          {
            edition: edition2,
            here: edition2.id === current,
            recommended: index === 0 && edition2.platform === "ps5",
            twin: editions.some((other) => other !== edition2 && other.platform === edition2.platform)
          }
        ) }, edition2.id)
      )
    ] });
  }
  function SourcePicker({ title, releases, selected, submit, editions = [], current, onEdition, onClose }) {
    const recommended = preferredRelease(releases);
    const sections = sourceSections(releases);
    const advice = useBackportAdvice(current);
    const count = (group) => sections.find((section) => section.group === group)?.items.length ?? 0;
    const [browser, setBrowser] = (0, useState)(() => !count("direct") && !count("page") || describeSource(releases[selected]).group === "browser");
    const [revealed, setRevealed] = (0, useState)(false);
    const pick2 = (index) => {
      submit(index);
      onClose();
    };
    const t2 = useT();
    return /* @__PURE__ */ (0, jsx)(SideSheet, { title: t2("sources.title"), subtitle: title, onClose, children: /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 42, padding: 9, paddingBottom: 48 }, children: [
      editions.length > 1 ? /* @__PURE__ */ (0, jsx)(
        Versions,
        {
          editions,
          current,
          onEdition: (edition2) => {
            onClose();
            if (edition2.id !== current) onEdition(edition2.id);
          }
        }
      ) : null,
      sections.filter(({ group }) => group === "direct" || group === "page" || browser && group === "browser").map(
        ({ group, items }) => /* @__PURE__ */ (0, jsx)(
          Section2,
          {
            group,
            items,
            selected,
            recommended,
            revealed: revealed && group === "browser",
            onPick: pick2
          },
          group
        )
      ),
      !browser && count("browser") ? /* @__PURE__ */ (0, jsx)(View, { onPress: () => {
        setBrowser(true);
        setRevealed(true);
      }, style: (_state3) => [{ position: "relative", flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 18 }, _state3.focused ? { backgroundColor: colors.surface2 } : null], children: /* @__PURE__ */ (0, jsx)(RevealFace, { count: count("browser") }) }) : null,
      count("dlc") ? /* @__PURE__ */ (0, jsx)(
        Section2,
        {
          group: "dlc",
          items: sections.find(({ group }) => group === "dlc").items,
          selected,
          recommended: -1,
          revealed: false,
          onPick: pick2
        }
      ) : null,
      // Backports apart from the game, with whether this console needs one.
      count("backport") ? /* @__PURE__ */ (0, jsx)(
        Section2,
        {
          group: "backport",
          items: sections.find(({ group }) => group === "backport").items,
          selected,
          recommended: -1,
          revealed: false,
          onPick: pick2,
          tag: advice
        }
      ) : null
    ] }) });
  }

export { SourcePicker };
