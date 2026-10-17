// The five stages a gamer sees for a download, whatever the queue is doing inside: Downloading, Getting
// ready, Installed, Played, Won't start. The queue keeps its own states (paused, verifying, extracting...);
// they show here only as the short note under a stage, and red is kept for what the gamer can act on.

import { t } from '../i18n/core.js';

  var ICON = { downloading: "download", preparing: "settings", installed: "circleCheck", played: "play", wontStart: "alert" };
  var TONE = { downloading: "accent", preparing: "accent", installed: "good", played: "good", wontStart: "bad" };
  // The queue's states by stage, and the note each one adds (null: none).
  var DOWNLOADING = { queued: "queued", resolving: null, connecting: null, downloading: null, pausing: "pausing", paused: "paused", failed: "failed", "awaiting-browser": "browser" };
  var PREPARING = { verifying: "verifying", extracting: "extracting", installing: "installing", downloaded: "waitingShadowMount", "installer-required": "installPackage", "extraction-required": "unpack", extracted: "notAGame", "file-downloaded": "notAGame", removing: "removing" };
  /**
   * `job`: a queue snapshot (its `launch` is what ShadowMount's log said about the title's last launch).
   * Returns { stage, icon, tone ("accent" | "good" | "bad"), note (an i18n key or null), action }:
   * `action` is "seeWhy" when the last launch did not start, "checkAgain" when ShadowMount reports a
   * problem with the install.
   */
  function readinessOf(job2) {
    const state = job2?.state;
    if (!state) return null;
    const stage = (stage2, note = null, extra = {}) => ({ stage: stage2, icon: ICON[stage2], tone: TONE[stage2], note: note && `ready.note.${note}`, action: null, ...extra });
    if (state in DOWNLOADING) {
      const note = DOWNLOADING[state];
      return stage("downloading", note, note === "failed" ? { tone: "bad" } : {});
    }
    if (state in PREPARING) return stage("preparing", PREPARING[state]);
    if (state === "attention") return stage("wontStart", "attention", { action: "checkAgain" });
    if (state === "installed") {
      if (job2.role === "backport") return stage("installed", "backport");
      if (job2.launch?.outcome === "wontStart") return stage("wontStart", "lastLaunch", { action: "seeWhy" });
      if (job2.launch?.outcome === "played") return stage("played");
      return stage("installed", job2.artifact?.nextAction === "shadowmount" ? "notPlayedYet" : null);
    }
    return stage("preparing");
  }
  var stageLabel = (stage) => t(`ready.stage.${stage}`);
  // "Won't start · Its last launch never got going" for one line; the stage alone when there is no note.
  var readinessText = (ready) => ready ? [stageLabel(ready.stage), ready.note ? t(ready.note) : ""].filter(Boolean).join(" \xB7 ") : "";
  // Which of a game's jobs speaks for its card: the game's own over its add-ons and backports, then the one
  // that most needs the gamer (won't start, downloading, getting ready) over the settled ones.
  var WEIGHT = { wontStart: 0, downloading: 1, preparing: 2, played: 3, installed: 4 };
  // The job that speaks for the card, with its readiness ({ job, ready }), or null.
  function cardPick(jobs) {
    let best = null;
    for (const job2 of jobs) {
      const ready = readinessOf(job2);
      if (!ready) continue;
      const own = job2.role === "backport" || job2.role === "dlc" ? 1 : 0;
      const score = own * 10 + WEIGHT[ready.stage];
      if (!best || score < best.score) best = { score, job: job2, ready };
    }
    return best && { job: best.job, ready: best.ready };
  }
  var cardReadiness = (jobs) => cardPick(jobs)?.ready ?? null;

export { cardPick, cardReadiness, readinessOf, readinessText, stageLabel };
