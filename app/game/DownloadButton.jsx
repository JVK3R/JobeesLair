// ../pub-game-store/native/game/DownloadButton.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { STALE_PARTIAL, cause, explainError } from '../downloads/errors.js';
import { WAITING, shownState } from '../downloads/labels.js';
import { Choice, TextAction } from './Choice.jsx';
import { DISABLED, DownloadLabel, statusLine } from './DownloadLabel.jsx';
import { MoreOptions, ProblemNote } from './DownloadProblem.jsx';
import { canDownload, spaceAdvice, spaceNeeded } from './releases.js';
import { describeSource, fallbacks, isCdnProvider, preferredRelease } from './sources.js';
import { useDownload } from './useDownload.js';
import { useFreeSpace } from './useFreeSpace.js';
import { useShadowMount } from './useShadowMount.js';
import { formatPercent2 } from '../i18n/core.js';
import { useT } from '../i18n/index.js';
import { editionsOf } from '../state/catalog.js';
import { BUSY, COMPLETE } from '../state/download-queue.js';
import { checkLinksNow, useHealthyReleases } from '../state/links.js';
import { readinessOf, readinessText } from '../state/readiness.js';
import { downloadQueue, driveName, freeBytes, storageRoots } from '../state/downloads.js';
import { useNavActions } from '../state/nav.jsx';
import { formatBytes } from '../state/size.js';
import { MARGIN2, stillNeeded } from '../state/space.js';
import { FocusRing } from '../ui/FocusRing.jsx';
import { glide } from '../ui/ProgressBar.jsx';
import { ShimmerText } from '../ui/ShimmerText.jsx';
import { Shine } from '../ui/Shine.jsx';
import { EASE_OUT } from '../ui/ease.js';
import { DownloadFormats, Text, View, motion } from '@ps5-react/core';
import { colors, radius } from '../ui/colors.js';

  var WIDTH6 = 272;
  var GB2 = 1e9;
  var STATUS = { fontFamily: "Exo2", fontSize: 21, lineHeight: 30 };
  function DownloadButton({ game, start, onDownloaded, nextDown, onRequestDialog }) {
    const t2 = useT();
    // The game's sources with what is known of their links (state/links.js): a dead one is unavailable,
    // one that does not answer ranks after those that do.
    const releases = useHealthyReleases(game.releases || []);
    const [selected, setSelected] = (0, useState)(() => {
      let jobs = [];
      try {
        jobs = downloadQueue().snapshot().filter((job3) => job3.gameId === game.id);
      } catch {
      }
      const owned2 = jobs.map((job3) => releases.findIndex((release2) => release2.id === (job3.requestedId ?? job3.release.id))).find((index) => index >= 0);
      return owned2 ?? preferredRelease(releases);
    });
    const [roots] = (0, useState)(() => {
      try {
        return storageRoots();
      } catch {
        return ["/data"];
      }
    });
    const [storage, setStorage] = (0, useState)(() => {
      const first = releases[preferredRelease(releases)];
      return Math.max(0, roots.findIndex((root2) => {
        const need2 = spaceNeeded(first, root2);
        return !need2 || freeBytes(root2) >= need2 + MARGIN2;
      }));
    });
    const release = releases[selected];
    const alternatives = (0, useMemo)(() => fallbacks(releases, selected), [releases, selected]);
    const download = useDownload(game, release, roots[storage], alternatives);
    const { progress, restart, remove, deleteFromDisk, job: job2, error: error2 } = download;
    // The source picked for the gamer turns out gone or silent: the best one that answers takes its place,
    // unless they picked it themselves or a download of it exists.
    const chosen = (0, useRef)(false);
    const [switched, setSwitched] = (0, useState)(null);
    (0, useEffect)(() => {
      const health = release?.linkHealth?.status;
      if (chosen.current || job2 || health !== "dead" && health !== "unreachable") return;
      const best = preferredRelease(releases);
      const next = releases[best];
      if (best === selected || !next || next.unavailableReason || health === "unreachable" && next.linkHealth?.status !== "active") return;
      setSwitched(t2(health === "dead" ? "links.switched" : "links.switchedSlow", { from: describeSource(release).host, to: describeSource(next).host }));
      setSelected(best);
    }, [releases]);
    const free = useFreeSpace(roots, download.status, !job2);
    const need = spaceNeeded(release, roots[storage]);
    const lacking = download.status === "idle" && need && free[storage] !== null && free[storage] < need + MARGIN2;
    const stale = ["paused", "failed"].includes(download.status) && STALE_PARTIAL.test(cause(error2));
    const status = lacking ? "no-space" : stale ? "stale" : download.status;
    // Not enough room, by the button's own count or the queue's (which counts the downloads queued before
    // it): Make Room frees what the drive needs for it and its queue, then starts it.
    const roomless = !job2 && (lacking || /Not enough space/i.test(error2));
    const openRoom = () => {
      const root2 = roots[storage];
      let reserved = 0;
      try {
        reserved = downloadQueue().snapshot().filter((item) => item.root === root2 && (BUSY.includes(item.state) || item.state === "paused")).reduce((sum, item) => sum + stillNeeded(item), 0);
      } catch {
      }
      onRequestDialog({ kind: "makeRoom", target: root2, need: (need || release?.sizeBytes || 0) + MARGIN2 + reserved, then: { game, release, root: root2, alternatives }, from: roomFocus });
    };
    const begin = () => {
      if (stale) restart();
      else if (lacking) openRoom();
      else download.advance();
    };
    const { openEdition, focusLater, push } = useNavActions();
    const editions = editionsOf(game);
    const advance = () => {
      // "Won't start": the button explains why (the last launch, from ShadowMount's logs).
      if (job2?.state === "installed" && readinessOf(job2)?.action === "seeWhy") {
        onRequestDialog({ kind: "diagnosis", title: game.title, jobId: job2.id });
        return;
      }
      if (status !== "idle" || editions.length < 2) {
        begin();
        return;
      }
      onRequestDialog({
        kind: "version",
        title: game.title,
        editions,
        current: game.id,
        submit: (edition2) => {
          if (edition2.id === game.id) begin();
          else openEdition(edition2.id, true);
        }
      });
    };
    const latest2 = (0, useRef)(null);
    latest2.current = { status, begin };
    (0, useEffect)(() => {
      if (!start) return void 0;
      const id = setTimeout(() => {
        if (latest2.current.status === "idle") latest2.current.begin();
      }, 0);
      return () => clearTimeout(id);
    }, []);
    const shadowMount = useShadowMount(DownloadFormats.images.includes(release?.format));
    const browser = status === "awaiting-browser";
    const step = job2?.parts ? { part: job2.partIndex + 1, parts: job2.parts.length } : null;
    const requestFile = () => onRequestDialog({
      title: step ? t2("download.partFileLink", step) : t2("download.fileLink"),
      detail: t2("download.fileLinkDetail"),
      submit: (url) => downloadQueue().continueWithURL(job2.id, url)
    });
    const written = (job2?.parts?.[job2.partIndex]?.written ?? job2?.written) > 0;
    const recoverable = ["paused", "failed", "stale"].includes(status) || browser;
    const choosing = !job2 || browser && !written;
    const sizeGb = job2?.total ? job2.total / GB2 : release?.sizeBytes ? release.sizeBytes / GB2 : game.sizeGb;
    const inProgress = BUSY.includes(status) || status === "paused";
    const sizeless = inProgress && !job2?.total;
    const amount = sizeless ? formatBytes(job2?.written || 0) : formatPercent2(Math.round(progress * 100));
    // Where the game stands for the gamer (state/readiness.js): an installed game reads Played or Won't start
    // once ShadowMount's log shows a launch, and the status line names the stage, not the queue's state.
    const ready = job2 ? readinessOf(job2) : null;
    const settled = job2?.state === "installed" && (ready?.stage === "played" || ready?.stage === "wontStart") ? ready.stage : null;
    const shown = settled ?? (job2 && shownState(job2) === "finishing" ? "finishing" : status);
    const [plain, line] = statusLine(stale ? download.status : settled ? "installed" : shown, progress, sizeGb);
    const state = ready && !stale && shown !== "finishing" ? readinessText(ready) : plain;
    const detail2 = sizeless ? t2("download.soFar", { size: formatBytes(job2?.written || 0) }) : line;
    const problem = browser ? {
      title: step ? t2("download.browser.partTitle", step) : t2("download.browser.title"),
      action: t2("download.browser.action")
    } : error2 ? explainError(error2, Boolean(job2?.release.parts)) : lacking ? { title: t2("download.noFit"), action: spaceAdvice(roots, free, storage, need) } : shadowMount || status === "installed" ? null : { title: t2("shadowMount.offTitle"), action: t2("shadowMount.offAction") };
    const notice = job2?.message || download.notice || switched;
    const pick2 = (index) => {
      if (index !== selected && job2 && !written && ["awaiting-browser", "failed", "paused"].includes(job2.state)) downloadQueue().remove(job2.id);
      chosen.current = true;
      setSwitched(null);
      setSelected(index);
    };
    const chooseSource = (from) => onRequestDialog({
      kind: "source",
      title: game.title,
      // The catalog's own: the picker applies link health itself, so a check run from it shows as it goes.
      releases: game.releases || [],
      selected,
      submit: pick2,
      from,
      editions,
      current: game.id,
      onEdition: (id) => openEdition(id),
      // Every link asked again, the dead ones too.
      checkLinks: () => checkLinksNow(game.id, game.releases || [])
    });
    // How the chosen source's link stands, after its name and host: nothing while it answers or is unchecked.
    const linkTag = release?.linkHealth?.status === "dead" ? t2("links.badge.dead") : release?.linkHealth?.status === "unreachable" ? t2("links.badge.unreachable") : null;
    const saved = job2?.written ? formatBytes(job2.written) : null;
    const removal = { icon: "x", label: t2("download.remove.label"), detail: t2("download.remove.detail"), onSelect: remove };
    const deletion = job2 && {
      icon: "trash",
      label: t2("hints.delete"),
      detail: job2.artifact.destination,
      onSelect: deleteFromDisk,
      armed: { label: t2("hints.confirmDelete"), detail: t2("files.confirmDelete", { size: formatBytes((COMPLETE.includes(job2.state) ? job2.total : job2.written) || 0) }) }
    };
    // A title ShadowMount installs: what its logs say about the last launch (read-only).
    const diagnosis = job2?.artifact.nextAction === "shadowmount" && {
      icon: "alert",
      label: t2("download.diagnose.label"),
      detail: t2("download.diagnose.detail"),
      onSelect: () => onRequestDialog({ kind: "diagnosis", title: game.title, jobId: job2.id }),
      next: true
    };
    const options = COMPLETE.includes(status) ? [diagnosis, removal, deletion].filter(Boolean) : recoverable ? [
      stale ? null : {
        icon: "restart",
        label: t2("download.restart.label"),
        detail: saved ? t2("download.restart.detailSaved", { size: saved }) : t2("download.restart.detail"),
        onSelect: restart
      },
      removal,
      releases.length > 1 ? {
        icon: "list",
        label: t2("download.otherSource.label"),
        detail: t2("download.otherSource.detail"),
        onSelect: () => chooseSource(),
        next: true
      } : null,
      // A stopped download's partial and extracted files go too, not only its entry.
      job2 ? deletion : null
    ].filter(Boolean) : [];
    const openOptions = () => onRequestDialog({ kind: "options", title: game.title, items: options });
    const [pulse3, setPulse] = (0, useState)(false);
    const hidden = (1 - progress) * WIDTH6;
    const sourceFocus = `download-source:${game.id}`;
    const storageFocus = `download-storage:${game.id}`;
    const moreFocus = `download-more:${game.id}`;
    const browserFocus = `download-continue:${game.id}`;
    const queueFocus = `download-queue:${game.id}`;
    const roomFocus = `download-room:${game.id}`;
    const mainFocus = `download:${game.id}`;
    const disabled = DISABLED.includes(status);
    const sourceChoice = releases.length > 1 || editions.length > 1;
    const chain = [
      mainFocus,
      roomless && release && roomFocus,
      choosing && release && sourceChoice && sourceFocus,
      !job2 && roots.length > 1 && storageFocus,
      browser && browserFocus,
      job2 && queueFocus,
      options.length > 0 && moreFocus
    ].filter(Boolean);
    const after = (key) => chain[chain.indexOf(key) + 1] ?? nextDown;
    (0, useEffect)(() => {
      if (canDownload(game) && disabled) focusLater(`favorite:${game.id}`);
    }, []);
    (0, useEffect)(() => {
      if (!COMPLETE.includes(status)) return;
      setPulse(true);
      onDownloaded();
    }, [status]);
    return /* @__PURE__ */ (0, jsxs)(View, { style: { width: 408, gap: 12 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { onPress: advance, autoFocus: canDownload(game) && !disabled, focusKey: mainFocus, nextFocusDown: after(mainFocus), style: (_state) => [
        { position: "relative", height: 72, width: 408, borderRadius: radius.md },
        disabled ? { borderWidth: 1, borderColor: colors.line } : inProgress ? { backgroundColor: colors.surface2 } : [{ backgroundColor: colors.accent }, _state.focused ? { backgroundColor: colors.accentHi } : null]
      ], children: [
        /* @__PURE__ */ (0, jsxs)(
          motion.View,
          {
            style: { overflow: "hidden", roundedClip: true, borderRadius: radius.sm },
            initial: false,
            animate: { scale: pulse3 ? 1.035 : 1 },
            transition: { duration: 0.225, ease: EASE_OUT },
            onAnimationComplete: () => setPulse(false),
            children: [
              /* @__PURE__ */ (0, jsx)(DownloadLabel, { status: shown, amount, dark: !inProgress && !disabled }),
              inProgress && /* @__PURE__ */ (0, jsx)(
                motion.View,
                {
                  style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden", backgroundColor: colors.accent },
                  initial: { x: -WIDTH6 },
                  animate: { x: -hidden },
                  transition: glide,
                  children: /* @__PURE__ */ (0, jsx)(motion.View, { initial: { x: WIDTH6 }, animate: { x: hidden }, transition: glide, children: /* @__PURE__ */ (0, jsx)(DownloadLabel, { status: shown, amount, dark: true }) })
                }
              ),
              /* @__PURE__ */ (0, jsx)(Shine, { width: WIDTH6 })
            ]
          }
        ),
        /* @__PURE__ */ (0, jsx)(FocusRing, {})
      ] }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", justifyContent: "space-between" }, children: [
        WAITING.includes(shown) ? /* @__PURE__ */ (0, jsx)(ShimmerText, { textStyle: STATUS, children: state }) : /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.subtle, lineHeight: 30 }, children: state }),
        detail2 ? /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 21, color: colors.subtle, lineHeight: 30 }, children: detail2 }) : null
      ] }),
      problem ? /* @__PURE__ */ (0, jsx)(ProblemNote, { title: problem.title, action: problem.action }) : notice ? /* @__PURE__ */ (0, jsx)(Text, { style: { width: 408, fontFamily: "Exo2", fontSize: 21, color: colors.muted, numberOfLines: 3, ellipsizeMode: "tail", lineHeight: 30 }, children: notice.slice(0, 160) }) : null,
      roomless && release ? /* @__PURE__ */ (0, jsx)(TextAction, { focusKey: roomFocus, nextFocusDown: after(roomFocus), onPress: openRoom, text: t2("download.makeRoom", { drive: driveName(roots[storage]) }) }) : null,
      choosing && release ? /* @__PURE__ */ (0, jsx)(
        Choice,
        {
          focusKey: sourceFocus,
          nextFocusDown: after(sourceFocus),
          onPress: sourceChoice ? () => chooseSource(sourceFocus) : null,
          magic: isCdnProvider(release.provider) ? {
            name: release.provider,
            detail: [t2("sources.cdnFastest"), release.sizeBytes && formatBytes(release.sizeBytes)].filter(Boolean).join(" \xB7 ")
          } : null,
          // What the gamer gets first ("Disk image · USA v1.10"), then where from and how big.
          text: [describeSource(release).name, describeSource(release).host, release.sizeBytes && formatBytes(release.sizeBytes), linkTag].filter(Boolean).join(" \xB7 ")
        }
      ) : null,
      !job2 ? /* @__PURE__ */ (0, jsx)(
        Choice,
        {
          focusKey: storageFocus,
          nextFocusDown: after(storageFocus),
          onPress: roots.length > 1 ? () => setStorage((index) => (index + 1) % roots.length) : null,
          text: [t2("download.saveTo", { drive: driveName(roots[storage]) }), free[storage] !== null && t2("download.free", { size: formatBytes(free[storage]) })].filter(Boolean).join(" \xB7 ")
        }
      ) : null,
      browser ? /* @__PURE__ */ (0, jsx)(
        TextAction,
        {
          focusKey: browserFocus,
          nextFocusDown: after(browserFocus),
          onPress: requestFile,
          text: step ? t2("download.enterPartLink", step) : t2("download.enterLink")
        }
      ) : null,
      job2 ? /* @__PURE__ */ (0, jsx)(
        TextAction,
        {
          focusKey: queueFocus,
          nextFocusDown: after(queueFocus),
          text: t2("download.openQueue"),
          onPress: () => push({ name: "downloads" }, queueFocus)
        }
      ) : null,
      options.length ? /* @__PURE__ */ (0, jsx)(MoreOptions, { focusKey: moreFocus, nextFocusDown: nextDown, onPress: openOptions }) : null
    ] });
  }

export { DownloadButton };
