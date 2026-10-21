// The phone companion: Settings turns it on (off by default) and it stays on across launches. The first
// time it is turned on the player chooses a six-digit PIN on the console (ui/PinDialog.jsx); it is kept in
// settings.json and used on every later start until the player changes it in Settings. Without a PIN the
// server is never started: a phone cannot set one, so nobody on the network can claim a fresh console.
// The native server (LocalServer) runs on its own worker; here a 100 ms timer hands the API requests it
// queued to companion/api.js and returns the answers. Each pass is one native call and, when a phone
// asks something, one quick lookup, so the render thread barely notices. The server's sockets (bind,
// address lookup) only ever open on its own worker: here, starting it returns at once and Settings reads
// a status snapshot.
// MODIFIED (0.5.0): with "Keep it on when Jobee'sLair is closed" (experimental, settings.json companionAway),
// the app also hands companion-daemon.elf (app/native/companion_daemon.c) to the payload loader: it stays
// behind and answers on the same port, with the same PIN, whenever the app is not running (open the app,
// see the queue, run installed payloads). It is given the current PIN at every launch and whenever the PIN
// changes, and told to stop when either switch goes off.
// MODIFIED (0.5.0 Pre Release 2): one session cookie per PIN (settings.json companionSession, made with the
// PIN): every phone that signs in gets it, the server accepts it from launch, and the helper is given it too.
// A phone stays signed in when Jobee'sLair restarts and when it closes and the helper takes over (and back);
// a new PIN makes a new one, which signs every phone out.

import { useEffect, useState } from 'react';
import { describeSource } from '../game/sources.js';
import { filterGames, getGame, NO_FILTERS, sortGames } from '../state/catalog.js';
import { COMPLETE } from '../state/download-queue.js';
import { downloadQueue, driveName } from '../state/downloads.js';
import { driveSnapshot, refreshDrives } from '../state/drives.js';
import { addFeed, addMirror, feedsSnapshot, refreshFeeds, removeFeed, removeMirror, replaceFeed } from '../state/feeds.js';
import { linkHealth } from '../state/links.js';
import { loadList, saveList } from '../state/saved.js';
import { CREATOR, TITLE_ID, VERSION_LABEL } from '../version.js';
import { FileSystem, LocalServer, Payloads, Platform } from '@ps5-react/core';
import { PAYLOAD_DIR } from '../state/homebrew-store.js';
import { createCompanionApi } from './api.js';
import { logger } from '../services/logger.js';
import { PAGE } from './page.js';
import { pressRemote, runShortcut } from './remote.js';
import { startRemoteDownload } from './remote-download.js';
import { homebrew } from '../state/homebrew-store.js';

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
    releasesOf: (game) => linkHealth().overlay(game.releases),
    download: startRemoteDownload,
    queue: () => downloadQueue().snapshot().filter((job) => !job.cleared),
    control: {
      pause: (id) => downloadQueue().pause(id),
      resume: (id) => downloadQueue().resume(id),
      cancel: (id) => downloadQueue().cancel(id),
      clear: (id) => {
        const queue = downloadQueue();
        // A finished download is only hidden from the list; its game stays in the library.
        if (queue.snapshot().some((job) => job.id === id && COMPLETE.includes(job.state))) queue.clear(id);
        else queue.remove(id);
      },
      // 0.5.0 Pre Release 3: a part waiting on the browser opens it on the console, from the phone.
      browser: (id) => downloadQueue().openBrowser(id)
    },
    storage: drives,
    feeds: { list: () => feedsSnapshot(), add: addFeed, edit: replaceFeed, remove: removeFeed, refresh: refreshFeeds, addMirror, removeMirror },
    remote: pressRemote,
    quick: (action) => {
      if (action === "refresh") void refreshFeeds();
      else runShortcut(action);
    },
    info: () => ({ app: "Jobee'sLair", version: VERSION_LABEL, creator: CREATOR }),
    // The last 512 KB of the debug log, for "Report a problem" on the phone (0.5.0 Pre Release 4).
    logs: () => logger().tail(512 * 1024),
    // The Homebrew section, read only when a phone first asks for it.
    homebrew: {
      get index() {
        return homebrew().index;
      },
      app: (id) => homebrew().app(id),
      statusOf: (id) => homebrew().statusOf(id),
      updates: () => homebrew().updates(),
      installedApps: () => homebrew().installedApps(),
      install: (id, file) => homebrew().install(id, file),
      run: (id) => homebrew().run(id),
      cancel: (id) => homebrew().cancel(id)
    }
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
  var SESSION_PATTERN = /^[a-z0-9]{16,64}$/;
  var sessionNow = null;
  function newSession() {
    try {
      return LocalServer.token();
    } catch (error) {
      console.log(`companion: no session cookie could be made: ${error.message}`);
      return "";
    }
  }
  // The saved one, or a new one saved now ("" when none could be made: each sign-in then gets its own,
  // which the helper does not know).
  function currentSession() {
    if (sessionNow !== null) return sessionNow;
    const saved = loadList(SETTINGS, "settings").companionSession;
    if (typeof saved === "string" && SESSION_PATTERN.test(saved)) return sessionNow = saved;
    sessionNow = newSession();
    if (sessionNow) saveSettings({ companionSession: sessionNow });
    return sessionNow;
  }
  var hasPin = () => currentPin() !== "";
  // On means switched on and able to start: a console that had it on before PINs were chosen waits for one.
  var isEnabled = () => (enabledNow ?? (enabledNow = loadList(SETTINGS, "settings").companion === true)) && hasPin();
  function saveSettings(change) {
    saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), companionCode: void 0, ...change });
  }
  // The helper for while the app is closed: on only with the companion, and only on the console.
  var DAEMON = "/app0/companion-daemon.elf";
  var QUEUE_FILE = `/data/ps5-react/${TITLE_ID}/queue/downloads.json`;
  var awayNow = null, awayAnswer = "";
  var isAway = () => awayNow ?? (awayNow = loadList(SETTINGS, "settings").companionAway === true);
  // Hands the helper its settings (or "-" to stop it). MODIFIED (0.5.0 Pre Release 3): never waits for its
  // answer here. Waiting for it on the render thread (up to seconds) froze the whole app, which looked like
  // being stuck in Settings. The send itself is a quick local copy; it runs a moment after the switch, and
  // the helper writes its answer ("ready", "updated", "stopped", "busy") to helper.txt in the payload folder,
  // read back a few seconds later for Settings.
  var HELPER_FILE = `${PAYLOAD_DIR}/helper.txt`;
  var READ_ANSWER_MS = 3e3;
  var arming = null;
  function readAnswer(on) {
    let text = "";
    try {
      text = FileSystem.exists(HELPER_FILE) ? String(FileSystem.readFile(HELPER_FILE)).trim().split("\n")[0] : "";
    } catch {
    }
    awayAnswer = text || (on ? "no answer" : "stopped");
    console.log(`companion: closed-app helper ${on ? "armed" : "stopped"}: ${awayAnswer}`);
    changed();
  }
  function armAway(on) {
    if (Platform.OS !== "ps5") return awayAnswer = "desktop";
    clearTimeout(arming);
    awayAnswer = "sending";
    arming = setTimeout(() => {
      const request = ["CMP2", TITLE_ID, String(PORTS[0]), on ? currentPin() : "-", PAYLOAD_DIR, QUEUE_FILE, (on && currentSession()) || "-"].join("\n") + "\n";
      try {
        try {
          FileSystem.remove(HELPER_FILE);
        } catch {
        }
        const result = Payloads.send(DAEMON, { request, answer: false });
        if (!result.ok) {
          awayAnswer = result.error;
          console.log(`companion: closed-app helper not sent: ${awayAnswer}`);
          return changed();
        }
      } catch (error) {
        awayAnswer = error.message;
        return changed();
      }
      arming = setTimeout(() => readAnswer(on), READ_ANSWER_MS);
    }, 50);
    return awayAnswer;
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
      LocalServer.start({ ports: PORTS, pin: currentPin(), page: PAGE, session: currentSession() });
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
    if (isEnabled() && isAway()) armAway(true);
  }
  // The experimental switch. Turning it on needs the companion on (with its PIN).
  function setCompanionAway(on) {
    if (on && !isEnabled()) return false;
    awayNow = on;
    saveSettings({ companionAway: on });
    armAway(on);
    changed();
    return true;
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
    if (isAway()) armAway(on);
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
    sessionNow = newSession();
    saveSettings({ companionPin: pin, companion: true, companionSession: sessionNow || void 0 });
    if (wasRunning) stopServer();
    startServer();
    if (isAway()) armAway(true);
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
      phones: status.sessions || 0,
      away: isAway(),
      awayAnswer: Platform.OS === "ps5" ? awayAnswer : ""
    };
  }
  // Settings' view; while it is open the server's state is read once a second (bind result, address).
  // One reading serves every card that shows it, and a card draws again only when something in it
  // changed: each card asking for its own copy every second re-rendered two Settings cards a second for
  // nothing, which the console's interpreter turned into a stutter.
  var shown = null;
  var viewers = /* @__PURE__ */ new Set();
  var reading = null;
  var sameState = (a, b) => Boolean(a && b) && Object.keys(a).every((key) => a[key] === b[key]);
  function readState() {
    const next = companionState();
    if (sameState(shown, next)) return;
    shown = next;
    for (const viewer of [...viewers]) viewer(next);
  }
  // `changed` (a start, a stop, a new PIN) reads it at once rather than at the next tick.
  listeners.add(() => viewers.size && readState());
  function useCompanion() {
    const [state, setState] = (0, useState)(() => shown && viewers.size ? shown : shown = companionState());
    (0, useEffect)(() => {
      viewers.add(setState);
      readState();
      setState(shown);
      if (!reading) reading = setInterval(readState, 1e3);
      return () => {
        viewers.delete(setState);
        if (!viewers.size && reading) {
          clearInterval(reading);
          reading = null;
        }
      };
    }, []);
    return state;
  }

export { CREATOR, choosePin, needsPin, pinProblem, setCompanion, setCompanionAway, startCompanionIfEnabled, useCompanion };
