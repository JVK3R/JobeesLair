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
import { useHealthyReleases, useLinkCheck } from '../state/links.js';
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
    backport: { title: "sources.section.backport", icon: "layers", note: "sources.section.backportNote" },
    unavailable: { title: "links.section.dead", icon: "alert", note: "links.section.deadNote" }
  };
  // The backport tag's ink: green when this console does not need one, amber when it is recommended.
  var ADVICE_TONE = { notNeeded: "#4ade80", recommended: "#fbbf24", unknown: null };
  var AMBER = "#fbbf24";
  // A source's link tag (state/link-health.js): amber while its host does not answer, grey once it is gone.
  function linkBadge(t2, release, group) {
    if (group === "unavailable") return { text: t2("links.badge.dead"), ink: colors.muted, line: colors.line };
    if (release.linkHealth?.status === "unreachable") return { text: t2("links.badge.unreachable"), ink: AMBER, line: AMBER };
    return null;
  }
  // Why an unavailable source is: what its link answered, or the catalog's own reason.
  function deadDetail(t2, release, host) {
    const health = release.linkHealth;
    if (health?.status === "dead") return health.code === "removed" ? t2("links.dead.removed", { host }) : t2("links.dead.code", { host, code: String(health.code) });
    return [host, release.unavailableReason].filter(Boolean).join(" \xB7 ");
  }
  // What "Check link health" says under its name: what it does, how far it got, or what it found.
  function checkDetail(t2, progress) {
    if (!progress?.manual) return t2("links.check.detail");
    if (progress.state === "waiting") return t2("links.check.waiting");
    if (progress.state === "checking") return t2("links.check.checking", { done: Math.min(progress.done + 1, Math.max(progress.total, 1)), total: Math.max(progress.total, 1) });
    const summary = progress.summary;
    if (!summary) return t2("links.check.failed");
    const unchecked = summary.skipped + summary.unknown;
    if (!summary.active && !summary.unreachable && !summary.dead && !unchecked) return t2("links.check.nothing");
    return [t2("links.check.summary", summary), unchecked ? t2("links.check.skipped", { count: unchecked }) : null].filter(Boolean).join(" \xB7 ");
  }
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
  function RowFace({ icon, name, detail: detail2, size, recommended, current, cdn, badge }) {
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
          recommended ? /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.xs, backgroundColor: colors.accent, paddingHorizontal: 9, paddingVertical: 2 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 18, fontWeight: 600, color: "#ffffff", lineHeight: 24 }, children: t2("sources.recommended") }) }) : null,
          badge ? /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.xs, borderWidth: 1, borderColor: badge.line, paddingHorizontal: 9, paddingVertical: 1 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 18, fontWeight: 600, color: badge.ink, lineHeight: 24 }, children: badge.text }) }) : null
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
        const { name, detail: detail2, size, host } = describeSource(release);
        // A dead link stays in view, greyed, to say why it is not offered; it cannot be picked.
        const gone = group === "unavailable";
        return /* @__PURE__ */ (0, jsx)(View, { autoFocus: !gone && index === selected || revealed && row === 0, onPress: gone ? () => {
        } : () => onPick(index), style: (_state) => [{ position: "relative", minHeight: 84, flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 12 }, gone ? { opacity: 0.55 } : null, _state.focused ? { backgroundColor: colors.surface2 } : null], children: /* @__PURE__ */ (0, jsx)(
          RowFace,
          {
            icon,
            name,
            detail: gone ? deadDetail(t2, release, host) : detail2,
            size,
            cdn: !gone && isCdnProvider(release.provider),
            recommended: !gone && index === recommended && group !== "browser",
            current: !gone && index === selected,
            badge: linkBadge(t2, release, group)
          }
        ) }, release.id);
      })
    ] });
  }
  function RevealFace({ icon, text, note, end = "chevronDown" }) {
    const focused = useIsFocused();
    const ink2 = focused ? colors.fg : colors.muted;
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(Icon, { name: icon, size: 18, color: ink2 }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 23, fontWeight: 600, color: colors.fg }, children: text }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [{ width: 570, fontFamily: "Exo2", fontSize: 21, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, { color: ink2 }], children: note })
      ] }),
      end ? /* @__PURE__ */ (0, jsx)(Icon, { name: end, size: 18, color: ink2 }) : null
    ] });
  }
  var revealStyle = (_state) => [{ position: "relative", flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 18 }, _state.focused ? { backgroundColor: colors.surface2 } : null];
  // "Check link health": every link of the game asked now (state/links.js), with how far it got.
  function LinkCheck({ gameId, onCheck }) {
    const t2 = useT();
    const progress = useLinkCheck(gameId);
    const busy = progress?.manual && (progress.state === "waiting" || progress.state === "checking");
    return /* @__PURE__ */ (0, jsx)(View, { focusKey: `sources:check:${gameId}`, onPress: () => {
      if (!busy) void onCheck();
    }, style: revealStyle, children: /* @__PURE__ */ (0, jsx)(RevealFace, { icon: busy ? "globe" : "restart", text: t2("links.check.label"), note: checkDetail(t2, progress), end: null }) });
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
  function SourcePicker({ title, releases: catalogReleases, selected, submit, editions = [], current, onEdition, onClose, checkLinks }) {
    // What is known of the links, applied here so a check started from this sheet shows as it goes.
    const releases = useHealthyReleases(catalogReleases);
    const recommended = preferredRelease(releases);
    const sections = sourceSections(releases);
    const advice = useBackportAdvice(current);
    const count = (group) => sections.find((section) => section.group === group)?.items.length ?? 0;
    const [browser, setBrowser] = (0, useState)(() => !count("direct") && !count("page") || describeSource(releases[selected]).group === "browser");
    const [revealed, setRevealed] = (0, useState)(false);
    const [deadShown, setDeadShown] = (0, useState)(false);
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
      }, style: revealStyle, children: /* @__PURE__ */ (0, jsx)(RevealFace, { icon: "external", text: t2("sources.showBrowser", { count: count("browser") }), note: t2("sources.browserNote") }) }) : null,
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
      ) : null,
      checkLinks ? /* @__PURE__ */ (0, jsx)(LinkCheck, { gameId: current, onCheck: checkLinks }) : null,
      // Links that no longer lead to the file, out of the way until asked for.
      count("unavailable") > 0 && !deadShown ? /* @__PURE__ */ (0, jsx)(View, { onPress: () => setDeadShown(true), style: revealStyle, children: /* @__PURE__ */ (0, jsx)(RevealFace, { icon: "alert", text: t2("links.showDead", { count: count("unavailable") }), note: t2("links.section.deadNote") }) }) : null,
      count("unavailable") > 0 && deadShown ? /* @__PURE__ */ (0, jsx)(
        Section2,
        {
          group: "unavailable",
          items: sections.find(({ group }) => group === "unavailable").items,
          selected,
          recommended: -1,
          revealed: true,
          onPick: pick2
        }
      ) : null
    ] }) });
  }

export { SourcePicker };
