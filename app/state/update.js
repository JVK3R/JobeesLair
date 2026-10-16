// The update check's schedule and state (the checker itself is state/updater.js): once at launch, then
// every 24 hours while the app stays open. Nothing is installed from here: a newer build is reported as
// an indicator in the header (ui/Header.jsx) and a dialog (ui/UpdateDialog.jsx) that points at the
// release page. A check that cannot reach GitHub changes nothing and the next one tries again.

import { useEffect, useState } from 'react';
import { DAY_MS, HOUR_MS, createUpdateChecker } from './updater.js';
import { savedList } from './saved.js';
import { REPO, VERSION } from '../version.js';
import { Http } from '@ps5-react/core';

  var store = savedList("update-check.json", "update check");
  var checker = createUpdateChecker({ http: Http, store, version: VERSION, repo: REPO });
  var CHECK_DELAY_MS = 4e3;
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
    } catch (error2) {
      console.log(`update: check failed: ${error2.message}`);
      publish({ checking: false, failed: true });
    }
    return state;
  }
  // At launch, and every 24 hours after; returns the function that stops it. A relaunch within the hour
  // reuses the last answer instead of asking again.
  function startUpdateChecks() {
    const first = setTimeout(() => void checkForUpdate({ minAge: HOUR_MS }), CHECK_DELAY_MS);
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

export { checkForUpdate, closeUpdateDialog, openUpdateDialog, startUpdateChecks, useUpdate, useUpdateDialog };
