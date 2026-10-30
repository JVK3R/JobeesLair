// The update check's schedule and state (the checker itself is state/updater.js): once at launch, then
// every 24 hours while the app stays open. A newer build shows as an indicator in the header
// (ui/Header.jsx) and a dialog (ui/UpdateDialog.jsx). On the PS5 it can be installed from there
// (state/auto-update.js): downloaded and checked in the background, then put in place by updater.elf once
// the app closes. With "Install updates automatically" on (settings.json autoInstallUpdates), a newer
// build downloads as soon as the check finds it and goes in the next time the app is closed. A check that
// cannot reach GitHub changes nothing and the next one tries again.
// 0.5.1: a newer build found at launch is offered at once, the way Prospero Store does: the dialog opens by
// itself (once per release), with Download and install, then Restart to apply; it comes back once the
// download is ready.

import { useEffect, useState } from 'react';
import { formatDate2, t } from '../i18n/core.js';
import { createAutoUpdater } from './auto-update.js';
import { isoDate } from './clock.js';
import { downloadQueue } from './downloads.js';
import { DAY_MS, HOUR_MS, createUpdateChecker } from './updater.js';
import { loadList, saveList, savedList } from './saved.js';
import { shadowRequest } from './shadowmount.js';
import { shouldShowWhatsNew } from './whats-new.js';
import { REPO, TITLE_ID, VERSION } from '../version.js';
import { Archives, BackHandler, Downloads, FileSystem, Http, Notifications, Platform, SelfUpdate } from '@ps5-react/core';

  var store = savedList("update-check.json", "update check");
  // The release the dialog last opened by itself for (offerDialog).
  var prompts = savedList("update-prompt.json", "update prompt");
  var checker = createUpdateChecker({ http: Http, store, version: VERSION, repo: REPO });
  var CHECK_DELAY_MS = 4e3;
  // Installing needs the console: an image that ShadowMount+ mounts, and the payload loader.
  var canInstall = Platform.OS === "ps5";
  // The updater's files (apply.txt, result.txt, booted.txt, updater.log), where updater.elf reads them.
  var CONTROL_DIR = "/data/JobeesLair/update";
  var SETTINGS = "settings.json";
  var automatic = canInstall && loadList(SETTINGS, "settings").autoInstallUpdates === true;
  var automaticListeners = /* @__PURE__ */ new Set();
  // Where the running image is: ShadowMount+'s record of this title.
  async function locate() {
    const game = await shadowRequest(Http, "games/info", { title_id: TITLE_ID });
    if (game?.source_type && game.source_type !== "image") throw new Error(t("update.install.notImage"));
    return game?.path ?? "";
  }
  var installer = canInstall ? createAutoUpdater({
    fs: FileSystem,
    downloads: Downloads,
    archives: Archives,
    lend: (onYield) => downloadQueue().lendNetwork?.(onYield) ?? null,
    locate,
    arm: (dir) => SelfUpdate.arm(dir),
    freeBytes: async (root) => (await FileSystem.diskUsageAsync(root)).free,
    store: savedList("auto-update.json", "auto update"),
    controlDir: CONTROL_DIR,
    version: VERSION,
    titleId: TITLE_ID,
    automatic: () => automatic,
    notify: (version) => {
      try {
        Notifications.notify(t("update.install.readyNotice", { version }));
      } catch {
      }
    }
  }) : null;
  // { update: the newer release or null, checking, checkedAt, failed } and who is watching it.
  var state = { update: checker.known(), checking: false, checkedAt: store.get().checkedAt ?? null, failed: false };
  var listeners = /* @__PURE__ */ new Set();
  var dialog = false;
  function publish(next) {
    state = { ...state, ...next };
    for (const listener of listeners) listener(state);
  }
  // Asks GitHub (not again within `minAge` ms). Never throws: a failure shows as `failed`, quietly.
  async function checkForUpdate({ minAge = 0 } = {}) {
    if (state.checking) return state;
    publish({ checking: true });
    try {
      const { update, checkedAt } = await checker.check({ minAge });
      publish({ update, checkedAt, checking: false, failed: false });
      if (update) installer?.offer(update);
      if (update) offerDialog(update.version);
    } catch (error2) {
      console.log(`update: check failed: ${error2.message}`);
      publish({ checking: false, failed: true });
    }
    return state;
  }
  // Once per launch, as early as the app can (index.jsx Boot, before the startup notice): the installer says
  // this build started (booted.txt) and reads what the updater did. After a swap the updater waits for that
  // word while the app runs; written only once the store mounted, it was missing for as long as the notice
  // stayed up, and closing the app there rolled a working update back. The store also remounts when the
  // theme changes, which must not redo it.
  var installerStarted = false;
  function startInstaller() {
    if (installerStarted) return;
    installerStarted = true;
    try {
      installer?.start();
    } catch (error2) {
      console.log(`update: the installer did not start: ${error2.message}`);
    }
  }
  // At launch, and every 24 hours after; returns the function that stops it. A relaunch within the hour
  // reuses the last answer instead of asking again. The installer has read what the updater did by then.
  function startUpdateChecks() {
    startInstaller();
    // 0.5.1: an answer that found nothing is asked again at every launch (one small request): a release
    // published within the hour of the last look went unoffered otherwise, and the dock showed nothing.
    const first = setTimeout(() => void checkForUpdate({ minAge: checker.known() ? HOUR_MS : 0 }), CHECK_DELAY_MS);
    const daily = setInterval(() => void checkForUpdate(), DAY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(daily);
    };
  }
  var dialogListeners = /* @__PURE__ */ new Set();
  function setDialog(open) {
    dialog = open;
    for (const listener of dialogListeners) listener(open);
  }
  var openUpdateDialog = () => setDialog(true);
  var closeUpdateDialog = () => setDialog(false);
  // 0.5.1: a newer release is offered the moment a check finds it, the way Prospero Store does: the dialog opens
  // by itself, with Download and install, then Restart to apply. Once per release (update-prompt.json), so a
  // Close is respected and only the dock's badge stays; not with automatic installs on (the update downloads
  // by itself then, and a notice says when it is ready); and never over the one-time What's new panel: it
  // waits for that to be closed (up to PROMPT_WAIT_MS, for a launch where the panel never opens).
  var PROMPT_POLL_MS = 2e3, PROMPT_WAIT_MS = 10 * 6e4;
  function offerDialog(version) {
    if (automatic || dialog || prompts.get().version === version) return;
    let waited = 0;
    const open = () => {
      if (state.update?.version !== version || dialog || prompts.get().version === version) return;
      if (shouldShowWhatsNew() && (waited += PROMPT_POLL_MS) < PROMPT_WAIT_MS) {
        setTimeout(open, PROMPT_POLL_MS);
        return;
      }
      // Recorded as it is shown, not before: an app closed while this waited would otherwise never offer it.
      prompts.set({ ...prompts.get(), version });
      setDialog(true);
    };
    open();
  }
  // The gamer's download finished and checked out: the dialog comes back with Restart to apply (once per
  // release, across launches: a ready update is kept over a restart), wherever they are in the app, so the
  // restart is one press away.
  installer?.subscribe((next) => {
    if (next.phase !== "ready" || next.error || automatic || prompts.get().ready === next.version) return;
    prompts.set({ ...prompts.get(), ready: next.version });
    if (!dialog) setDialog(true);
  });
  function useUpdate() {
    const [value, setValue] = (0, useState)(state);
    (0, useEffect)(() => {
      listeners.add(setValue);
      setValue(state);
      return () => {
        listeners.delete(setValue);
      };
    }, []);
    return value;
  }
  function useUpdateDialog() {
    const [open, setOpen] = (0, useState)(dialog);
    (0, useEffect)(() => {
      dialogListeners.add(setOpen);
      setOpen(dialog);
      return () => {
        dialogListeners.delete(setOpen);
      };
    }, []);
    return open;
  }
  var IDLE = { phase: "idle", version: null, written: 0, total: 0, file: "", error: "", outcome: null };
  // What the screens show of the install: they draw again when it changes, not on every progress report of
  // the download (four a second), which would redraw Settings' About card and the dock that often.
  var shownKey = (install) => `${install.phase}|${install.version}|${install.file}|${install.error}|${install.outcome?.outcome ?? ""}|${install.total ? Math.floor(Math.min(1, install.written / install.total) * 100) : 0}`;
  /** The install's progress: { phase, version, written, total, file, error, outcome } (state/auto-update.js). */
  function useInstall() {
    const [value, setValue] = (0, useState)(() => installer?.state() ?? IDLE);
    (0, useEffect)(() => {
      if (!installer) return void 0;
      let last = shownKey(installer.state());
      setValue(installer.state());
      return installer.subscribe((next) => {
        const key = shownKey(next);
        if (key === last) return;
        last = key;
        setValue(next);
      });
    }, []);
    return value;
  }
  // What Settings' update row says (`t2` its message function; the phone companion's Settings too): checking, a newer
  // version (downloading, ready to install, or not installed), a failed check, or when it last looked.
  function updateDetail(t2, update, install) {
    if (update.checking) return t2("settings.update.checking");
    const version = update.update?.version;
    if (version && install.version === version) {
      if (["ready", "armed"].includes(install.phase)) return t2("settings.update.ready", { version });
      if (["waiting", "downloading", "checking"].includes(install.phase))
        return t2("settings.update.downloading", { version, percent: String(install.total ? Math.floor(Math.min(1, install.written / install.total) * 100) : 0) });
      if (install.phase === "failed") return t2("settings.update.installFailed", { version });
    }
    if (update.update) return t2("settings.update.available", { version: update.update.version });
    if (update.failed) return t2("settings.update.failed");
    return update.checkedAt ? t2("settings.update.current", { date: formatDate2(isoDate(update.checkedAt)) }) : t2("settings.update.never");
  }
  /** The update and its install as they are now, and whether updates install by themselves (the phone's Settings). */
  var updateSnapshot = () => ({ update: state, install: installer?.state() ?? IDLE, auto: automatic });
  /** Downloads and checks the newer release now. False when there is none it can install. */
  var downloadUpdate = () => Boolean(installer && state.update?.assets && installer.download(state.update));
  var cancelUpdate = () => installer?.cancel();
  /**
   * "Restart to apply": arms the updater to swap the image in and open the app again, then closes the app.
   * Returns the reason when it cannot (the app then stays open).
   */
  function restartToApply() {
    if (!installer) return t("update.install.consoleOnly");
    const { ok, reason } = installer.applyNow();
    if (!ok) return reason;
    setTimeout(() => BackHandler.exitApp(), 400);
    return "";
  }
  function setAutoInstall(on) {
    if (!canInstall) return;
    automatic = on;
    saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), autoInstallUpdates: on });
    for (const listener of automaticListeners) listener(on);
    if (!installer) return;
    if (!on) installer.disarm();
    else if (installer.state().phase === "ready") installer.armOnClose();
    else if (state.update) installer.offer(state.update);
  }
  function useAutoInstall() {
    const [on, setOn] = (0, useState)(automatic);
    (0, useEffect)(() => {
      automaticListeners.add(setOn);
      return () => {
        automaticListeners.delete(setOn);
      };
    }, []);
    return on;
  }

export { canInstall, cancelUpdate, checkForUpdate, closeUpdateDialog, downloadUpdate, openUpdateDialog, restartToApply, setAutoInstall, startInstaller, startUpdateChecks, updateDetail, updateSnapshot, useAutoInstall, useInstall, useUpdate, useUpdateDialog };
