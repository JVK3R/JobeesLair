// The phone companion: Settings turns it on (off by default) and it stays on across launches. The first
// time it is turned on the player chooses a six-digit PIN on the console (ui/PinDialog.jsx); it is kept in
// settings.json and used on every later start until the player changes it in Settings. Without a PIN the
// server is never started: a phone cannot set one, so nobody on the network can claim a fresh console.
// The native server (LocalServer) runs on its own worker; here a 100 ms timer hands the API requests it
// queued to companion/api.js and returns the answers. Each pass is one native call and, when a phone
// asks something, one quick lookup, so the render thread barely notices. The server's sockets (bind,
// address lookup) only ever open on its own worker: here, starting it returns at once and Settings reads
// a status snapshot.

import { useEffect, useState } from 'react';
import { describeSource } from '../game/sources.js';
import { filterGames, getGame, NO_FILTERS, sortGames } from '../state/catalog.js';
import { downloadQueue, driveName } from '../state/downloads.js';
import { driveSnapshot, refreshDrives } from '../state/drives.js';
import { addFeed, addMirror, feedsSnapshot, refreshFeeds, removeFeed, removeMirror, replaceFeed } from '../state/feeds.js';
import { loadList, saveList } from '../state/saved.js';
import { CREATOR, VERSION_LABEL } from '../version.js';
import { LocalServer } from '@ps5-react/core';
import { createCompanionApi } from './api.js';
import { PAGE } from './page.js';
import { pressRemote, runShortcut } from './remote.js';
import { startRemoteDownload } from './remote-download.js';

  // Tried in order; 0 lets the system pick any free port. Settings shows the one it got.
  var PORTS = [34177, 8080, 0];
  var PUMP_MS = 100;
  var SETTINGS = "settings.json";
  var handle = createCompanionApi({
    catalog: {
      search: (query) => sortGames(filterGames({ filters: NO_FILTERS, query, wishlist: [] }), "relevance"),
      getGame
    },
    describe: describeSource,
    download: startRemoteDownload,
    queue: () => downloadQueue().snapshot(),
    control: {
      pause: (id) => downloadQueue().pause(id),
      resume: (id) => downloadQueue().resume(id),
      cancel: (id) => downloadQueue().cancel(id),
      clear: (id) => downloadQueue().remove(id)
    },
    storage: drives,
    feeds: { list: () => feedsSnapshot(), add: addFeed, edit: replaceFeed, remove: removeFeed, refresh: refreshFeeds, addMirror, removeMirror },
    remote: pressRemote,
    quick: (action) => {
      if (action === "refresh") void refreshFeeds();
      else runShortcut(action);
    },
    info: () => ({ app: "Jobee'sLair", version: VERSION_LABEL, creator: CREATOR })
  });
  // Every drive downloads can go to, with its space, from the cache: nothing here waits on a drive. The
  // phone asks again every few seconds, so asking the worker to look again is enough to keep it current.
  function drives() {
    void refreshDrives();
    const { roots, usage } = driveSnapshot();
    return roots.map((root) => ({ root, name: driveName(root), free: usage[root]?.free ?? null, total: usage[root]?.total ?? null }));
  }
  // The PIN phones sign in with: exactly six digits, chosen by the player. The server (http_server.hpp)
  // throttles wrong guesses and locks after 20 until it is started again.
  var PIN_PATTERN = /^[0-9]{6}$/;
  // Why a PIN is refused, as a message key (null when it is fine): a run of one digit or a straight
  // sequence is the first thing anyone on the network would try.
  function pinProblem(pin) {
    if (typeof pin !== "string" || !PIN_PATTERN.test(pin)) return "pin.digits";
    if (/^([0-9])\1{5}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) return "pin.weak";
    return null;
  }
  // The PIN and whether the companion is on, read from settings.json once and then kept here: Settings
  // asks every second, and a render has no business reading a file that often. Only this module changes
  // them, and it saves through a fresh read, so the other settings (language, vibration) are never
  // overwritten. A PIN in the file that is not six digits (an older build's four) counts as none.
  var enabledNow = null, pinNow = null;
  var savedPin = () => {
    const pin = loadList(SETTINGS, "settings").companionPin;
    return typeof pin === "string" && PIN_PATTERN.test(pin) ? pin : "";
  };
  var currentPin = () => pinNow ?? (pinNow = savedPin());
  var hasPin = () => currentPin() !== "";
  // On means switched on and able to start: a console that had it on before PINs were chosen waits for one.
  var isEnabled = () => (enabledNow ?? (enabledNow = loadList(SETTINGS, "settings").companion === true)) && hasPin();
  function saveSettings(change) {
    saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), companionCode: void 0, ...change });
  }
  var timer = null;
  var problem = "";
  var listeners = /* @__PURE__ */ new Set();
  var changed = () => {
    for (const listener of listeners) listener();
  };
  function pump() {
    let requests;
    try {
      requests = LocalServer.poll();
    } catch (error) {
      console.log(`companion: poll failed: ${error.message}`);
      return;
    }
    // Each request on its own: an answer the server refuses (too large) becomes a 500, and one failure
    // never leaves the rest of the batch waiting out their timeout.
    for (const request of requests) {
      try {
        const answer = handle(request);
        LocalServer.respond(request.id, answer.status, answer.type, answer.body);
      } catch (error) {
        console.log(`companion: answering ${request.path} failed: ${error?.message}`);
        try {
          LocalServer.respond(request.id, 500, "application/json", JSON.stringify({ error: "The console could not answer that." }));
        } catch {
        }
      }
    }
  }
  function startServer() {
    if (timer || !hasPin()) return;
    try {
      LocalServer.start({ ports: PORTS, pin: currentPin(), page: PAGE });
      problem = "";
      timer = setInterval(pump, PUMP_MS);
      console.log(`companion: starting on the first free of ${PORTS.join(", ")}`);
    } catch (error) {
      problem = error.message;
      console.log(`companion: not started: ${problem}`);
    }
    changed();
  }
  function stopServer() {
    if (timer) clearInterval(timer);
    timer = null;
    try {
      LocalServer.stop();
    } catch (error) {
      console.log(`companion: stop failed: ${error.message}`);
    }
    changed();
  }
  // At launch: on only if it was left on (and has its PIN).
  function startCompanionIfEnabled() {
    if (isEnabled()) startServer();
  }
  // The switch takes effect first; the file is written after, so the screen never waits on the disk.
  // Returns false, changing nothing, when it is being turned on without a PIN: Settings then asks for one
  // (needsPin) and calls choosePin, which starts it.
  function setCompanion(on) {
    if (on && !hasPin()) return false;
    enabledNow = on;
    if (on) startServer();
    else stopServer();
    saveSettings({ companion: on });
    return true;
  }
  var needsPin = () => !hasPin();
  // Saves the player's PIN and, with it, turns the companion on. A PIN that is not six digits, or is too
  // easy to guess, throws its message key. Changing the PIN while the companion runs restarts the server,
  // which signs every phone out and clears a lock.
  function choosePin(pin) {
    const refused = pinProblem(pin);
    if (refused) throw new Error(refused);
    const wasRunning = timer !== null;
    pinNow = pin;
    enabledNow = true;
    saveSettings({ companionPin: pin, companion: true });
    if (wasRunning) stopServer();
    startServer();
    changed();
  }
  // Only reads: the native status snapshot (state, the port it bound, the address its worker looked up,
  // sign-ins) and the player's PIN. Nothing here opens a socket or can throw into a render.
  function companionState() {
    const enabled = isEnabled();
    let status = { state: "stopped", error: "", port: 0, address: "" };
    try {
      status = LocalServer.status();
    } catch (error) {
      status = { state: "failed", error: error.message, port: 0, address: "" };
    }
    const address = enabled && status.state === "listening" ? status.address : "";
    return {
      enabled,
      hasPin: hasPin(),
      state: problem ? "failed" : status.state,
      error: problem || status.error,
      pin: enabled ? currentPin() : "",
      address,
      port: status.port,
      // Nothing secret in it: the phone asks for the PIN, then keeps a session cookie.
      url: address ? `http://${address}:${status.port}/` : "",
      locked: status.locked === true,
      phones: status.sessions || 0
    };
  }
  // Settings' view; while it is open the server's state is read once a second (bind result, address).
  function useCompanion() {
    const [state, setState] = (0, useState)(companionState);
    (0, useEffect)(() => {
      const update = () => setState(companionState());
      listeners.add(update);
      const id = setInterval(update, 1e3);
      return () => {
        listeners.delete(update);
        clearInterval(id);
      };
    }, []);
    return state;
  }

export { CREATOR, choosePin, needsPin, pinProblem, setCompanion, startCompanionIfEnabled, useCompanion };
