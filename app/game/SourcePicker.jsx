// ../pub-game-store/native/game/SourcePicker.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useMemo, useState } from 'react';
import { VersionFace } from './VersionSheet.jsx';
import { captureStanding, describeSource, isCdnProvider, preferredRelease, sourceSections } from './sources.js';
import { useT } from '../i18n/index.js';
import { getGame, readyLabel } from '../state/catalog.js';
import { activeService, debridSupports, heldByTorBox, serviceName, useTorBoxInstant } from '../state/debrid.js';
import { downloadQueue } from '../state/downloads.js';
import { deviceFacts } from '../state/device.js';
import { backportAdvice, ps5FakePackagesLaunch } from '../state/firmware.js';
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
    // 0.5.1: magnet links, through the debrid service (its note says to add a key when there is none).
    torrent: { title: "sources.section.torrent", icon: "zap", note: "sources.section.torrentNote" },
    browser: { title: "sources.section.browser", icon: "external" },
    dlc: { title: "sources.section.dlc", icon: "download", note: "sources.section.dlcNote" },
    backport: { title: "sources.section.backport", icon: "layers", note: "sources.section.backportNote" },
    unavailable: { title: "links.section.dead", icon: "alert", note: "links.section.deadNote" }
  };
  // The backport tag's ink: green when this console does not need one, amber when it is recommended.
  var ADVICE_TONE = { notNeeded: "#4ade80", recommended: "#fbbf24", unknown: null };
  var AMBER = "#fbbf24";
  // A source's link tag (state/link-health.js): "Offline" in amber while its host does not answer, "Broken
  // link" in red when the check found it gone (still listed, last, and can still be picked).
  function linkBadge(t2, release) {
    if (release.linkHealth?.status === "dead") return { text: t2("links.badge.dead"), ink: RED, line: RED };
    if (release.linkHealth?.status === "unreachable") return { text: t2("links.badge.unreachable"), ink: AMBER, line: AMBER };
    return null;
  }
  // Why an unavailable source is: what its link answered (which part, in a set), or the catalog's own reason.
  function deadDetail(t2, release, host) {
    const health = release.linkHealth;
    if (health?.status === "dead") {
      const part = health.part ? String(health.part) : null;
      if (health.code === "removed") return part ? t2("links.dead.partRemoved", { host, part }) : t2("links.dead.removed", { host });
      return part ? t2("links.dead.part", { host, part, code: String(health.code) }) : t2("links.dead.code", { host, code: String(health.code) });
    }
    return [host, release.unavailableReason].filter(Boolean).join(" \xB7 ");
  }
  var GREEN = "#4ade80";
  var RED = "#f87171";
  var GOLD = "#facc15";
  // "TorBox Instant": TorBox holds this source's file already, so it starts at once (state/debrid.js).
  var instantBadge = (t2, release) => heldByTorBox(release) === true ? { text: t2("debrid.instant"), ink: GOLD, line: GOLD } : null;
  // A browser source's host on this console (state/capture-hosts.js): green when its captures finish, amber
  // when they fail; nothing while it is untried.
  function captureBadge(t2, release) {
    const standing = captureStanding(release);
    if (standing === "works") return { text: t2("capture.badge.works"), ink: GREEN, line: GREEN };
    if (standing === "hard") return { text: t2("capture.badge.hard"), ink: AMBER, line: AMBER };
    return null;
  }
  // The TorBox button beside a row: the same source, fetched through TorBox and downloaded in the app.
  function TorBoxFace() {
    const t2 = useT();
    const focused = useIsFocused();
    const ink2 = focused ? colors.fg : colors.muted;
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(Icon, { name: "zap", size: 20, color: focused ? GOLD : ink2 }),
      // 0.5.1: the provider in use, TorBox or AllDebrid (state/debrid.js activeService).
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 19, fontWeight: 600, color: ink2, lineHeight: 24 }, children: t2("debrid.button").replace("TorBox", serviceName(activeService())) })
    ] });
  }
  var torboxStyle = (_state) => [{ position: "relative", width: 112, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingVertical: 10 }, _state.focused ? { backgroundColor: colors.surface2, borderColor: GOLD } : null];
  var PILL = { ink: colors.subtle, line: colors.line };
  // What a source is (release-sets.js releaseType), as a plain pill: Folder Dump, .exfat Image, FFPKG,
  // FFPFS Image, (PS4) Backport, FPKG. Nothing when it cannot be told before the download.
  function typePill(t2, release) {
    const type = release.dumpType;
    if (type === "image") return { text: t2(`release.type.${release.imageFormat ?? "image"}`), ...PILL };
    if (type === "backport") return { text: t2(release.platform === "ps4" ? "release.type.ps4Backport" : "release.type.backport"), ...PILL };
    // A PS5 package's compatibility badge already says FPKG ("FPKG (<=11.60)").
    if (type === "fpkg" && release.compatible1360 === false) return null;
    if (type === "folder" || type === "fpkg") return { text: t2(`release.type.${type}`), ...PILL };
    return null;
  }
  // Whether it runs on 13.60: green "13.60 Ready" for what ShadowMount+ mounts (dumps, images, backports); a
  // PS5 fake package is "FPKG (<=11.60)", amber unless this console is at 11.60 or below. Nothing when
  // not known (a PS4 package, an archive that does not say what it holds).
  function compatBadge(t2, release, launches) {
    // A PS4 backport keeps its pill but not the green badge: whether a console needs one is the backport
    // section's own advice, and "13.60 Ready" beside it read as a recommendation.
    if (release.dumpType === "backport" && release.platform === "ps4") return null;
    if (release.compatible1360 === true) return { text: readyLabel(t2("release.compat.ready")), ink: GREEN, line: GREEN };
    // 0.5.1: at 11.60 or lower a PS5 fake package starts, so it is as ready there as an image ("Ready for 9.60").
    if (release.compatible1360 === false) return launches === true ? { text: readyLabel(t2("release.compat.ready")), ink: GREEN, line: GREEN } : { text: t2("release.compat.fpkg"), ink: AMBER, line: AMBER };
    return null;
  }
  // A row's second line: where from, or why to think twice (gone, not answering, won't launch here).
  function rowDetail(t2, release, detail, host, launches) {
    if (release.linkHealth?.status === "dead") return deadDetail(t2, release, host);
    if (release.linkHealth?.status === "unreachable") {
      const part = release.linkHealth.part;
      return part ? t2("links.unreachable.partDetail", { host, part: String(part) }) : t2("links.unreachable.detail", { host });
    }
    if (release.compatible1360 === false && launches !== true) return [detail, t2("release.fpkg.detail")].filter(Boolean).join(" \xB7 ");
    return detail;
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
  function RowFace({ icon, name, detail: detail2, size, recommended, current, cdn, badges = [], narrow = false }) {
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
        // What it is, whether it runs on 13.60 and how its link stands, on a line of their own so a long name
        // never pushes them out of the row.
        badges.some(Boolean) ? /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }, children: badges.filter(Boolean).map((badge) => /* @__PURE__ */ (0, jsx)(View, { style: { borderRadius: radius.xs, borderWidth: 1, borderColor: badge.line, paddingHorizontal: 8, paddingVertical: 1 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 17, fontWeight: 600, color: badge.ink, lineHeight: 22 }, children: badge.text }) }, badge.text)) }) : null,
        /* @__PURE__ */ (0, jsx)(Text, { style: [{ width: narrow ? 330 : 450, fontFamily: "Exo2", fontSize: 21, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, { color: ink2 }], children: detail2 || t2("sources.noDetails") })
      ] }),
      /* @__PURE__ */ (0, jsx)(Text, { style: [{ width: narrow ? 96 : 108, fontFamily: "Exo2", fontSize: 21, textAlign: "end", lineHeight: 30 }, { color: ink2 }], children: size ?? "" }),
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 27, alignItems: "flex-end" }, children: current ? /* @__PURE__ */ (0, jsx)(Icon, { name: "check", size: 18, color: colors.fg }) : null })
    ] });
  }
  function Section2({ group, items, selected, recommended, revealed, onPick, onDebrid, tag }) {
    const t2 = useT();
    const launches = ps5FakePackagesLaunch(deviceFacts().firmware);
    const { title, icon } = SECTION[group];
    const note = group === "torrent" && !(onDebrid && activeService()) ? "sources.section.torrentNeeds" : SECTION[group].note;
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 6 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { marginBottom: 6, gap: 3, paddingHorizontal: 18 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 20, fontWeight: 600, color: colors.subtle }, children: `${t2(title)} \xB7 ${items.length}` }),
        tag ? /* @__PURE__ */ (0, jsx)(Text, { style: { width: 660, fontFamily: "Exo2", fontSize: 21, fontWeight: 600, color: ADVICE_TONE[tag.key] ?? colors.subtle, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, children: tag.text }) : null,
        note ? /* @__PURE__ */ (0, jsx)(Text, { style: { width: 660, fontFamily: "Exo2", fontSize: 21, color: colors.subtle, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, children: t2(note) }) : null
      ] }),
      items.map(({ release, index }, row) => {
        const { name, detail: detail2, size, host } = describeSource(release);
        // A source that cannot be downloaded as listed (a set missing a part) stays in view, greyed, to say
        // why it is not offered; it cannot be picked. A link the check found gone is not one of these.
        const gone = group === "unavailable";
        // 0.5.1: a torrent row is the debrid download itself (no button beside it); greyed without a key.
        const torrent = group === "torrent";
        const viaDebrid = torrent && Boolean(onDebrid) && debridSupports(release);
        // TorBox can fetch it (a TorBox key is set and it lists the host): a TorBox button beside the row.
        const torbox = !gone && !torrent && Boolean(onDebrid) && debridSupports(release);
        const idle = gone || torrent && !viaDebrid;
        const face = /* @__PURE__ */ (0, jsx)(View, { autoFocus: !gone && index === selected || revealed && row === 0, onPress: idle ? () => {
        } : torrent ? () => onDebrid(index) : () => onPick(index), style: (_state) => [{ position: "relative", minHeight: 84, flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 12 }, torbox ? { flex: 1 } : null, idle ? { opacity: 0.55 } : null, _state.focused ? { backgroundColor: colors.surface2 } : null], children: /* @__PURE__ */ (0, jsx)(
          RowFace,
          {
            icon,
            name,
            detail: gone ? deadDetail(t2, release, host) : rowDetail(t2, release, detail2, host, launches),
            size,
            narrow: torbox,
            cdn: !gone && isCdnProvider(release.provider),
            recommended: !gone && index === recommended && group !== "browser" && release.linkHealth?.status !== "dead",
            current: !gone && index === selected,
            badges: [typePill(t2, release), gone ? null : compatBadge(t2, release, launches), linkBadge(t2, release, group), gone ? null : captureBadge(t2, release), torbox || viaDebrid ? instantBadge(t2, release) : null]
          }
        ) }, torbox ? "row" : release.id);
        if (!torbox) return face;
        return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "stretch", gap: 8 }, children: [
          face,
          /* @__PURE__ */ (0, jsx)(View, { focusKey: `sources:torbox:${release.id}`, onPress: () => onDebrid(index), style: torboxStyle, children: /* @__PURE__ */ (0, jsx)(TorBoxFace, {}) }, "torbox")
        ] }, release.id);
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
  // The download queue's network, lent while it downloads nothing (TorBox's Instant check waits otherwise).
  var lendNetwork = (onYield) => {
    try {
      return downloadQueue().lendNetwork?.(onYield) ?? null;
    } catch {
      return null;
    }
  };
  function SourcePicker({ title, releases: catalogReleases, selected, submit, onDebrid, editions = [], current, onEdition, onClose, checkLinks }) {
    // What is known of the links, applied here so a check started from this sheet shows as it goes.
    const releases = useHealthyReleases(catalogReleases);
    const recommended = preferredRelease(releases);
    const sections = sourceSections(releases);
    const advice = useBackportAdvice(current);
    const count = (group) => sections.find((section) => section.group === group)?.items.length ?? 0;
    useTorBoxInstant(onDebrid ? releases : [], lendNetwork);
    // With TorBox, a browser-only host it supports downloads in the app, so those sources are shown at once.
    const [browser, setBrowser] = (0, useState)(() => !count("direct") && !count("page") && !count("torrent") || describeSource(releases[selected]).group === "browser" || Boolean(onDebrid) && sections.some(({ group, items }) => group === "browser" && items.some(({ release }) => debridSupports(release))));
    const debrid = onDebrid ? (index) => {
      onDebrid(index);
      onClose();
    } : null;
    const [revealed, setRevealed] = (0, useState)(false);
    // Shown from the start when nothing can be downloaded in the app any more (every file link was taken
    // down, say): an empty sheet would look like a fault, the list of what is gone and why does not.
    const [deadShown, setDeadShown] = (0, useState)(() => !count("direct") && !count("page") && !count("torrent"));
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
      sections.filter(({ group }) => group === "direct" || group === "page" || group === "torrent" || browser && group === "browser").map(
        ({ group, items }) => /* @__PURE__ */ (0, jsx)(
          Section2,
          {
            group,
            items,
            selected,
            recommended,
            revealed: revealed && group === "browser",
            onPick: pick2,
            onDebrid: debrid
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
          onPick: pick2,
            onDebrid: debrid
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
          onDebrid: debrid,
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
          onPick: pick2,
            onDebrid: debrid
        }
      ) : null
    ] }) });
  }

export { SourcePicker };
