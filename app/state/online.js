// Jobee'sLair online (0.5.2): the live count, announcements, and the anonymous stats behind Jake's dashboard. The
// other end is tools/online, a Cloudflare Worker at api.jobees.org.
//
// While it's open, the app asks for the count and the announcements once a minute, sending nothing about the console.
// With "Share anonymous stats" on (Settings, About; on by default), every fifth of those is a ping instead: a random
// ID made on this console the first time (not the console's own ID, not the PSN account), the app's version and
// edition, the firmware and the language. A Homebrew install that finishes or fails sends which app and the error,
// without the ID. Never sent either way: the library, downloads, games.
// 0.5.4: each ping also says whether the phone companion is on (and kept on while the app is closed), and since the
// last ping, the minutes a phone had its page open and how many times one did each kind of thing (companion/usage.js;
// counts only). They are taken off once a ping goes through; nothing counted while stats are off is ever sent.
// 0.5.4, later: how each game's latest launch went (played or won't start, why, its format, whether Fix it or a
// backport was involved), for the game page's numbers. Each goes under a token made from the title and a secret kept in
// online.json that never leaves the console, without the ID: the server can't tie it to the console or to its other
// games. Kept here until a look sends them (twenty at a time, never while a download holds the network); the first time,
// the launches known so far go too. And every six hours, every game's numbers (GET /v1/compat, nothing about the
// console sent, stats on or off), kept in compat.json for state/compat.js.
//
// online.json keeps the ID, the switch, and the announcements last heard, so the bar under the top menu
// (ui/AnnouncementBar.jsx) is there from launch until the server says they're down.

import { useEffect, useState } from 'react';
import { Http, LocalServer } from '@ps5-react/core';
import { savedList } from './saved.js';
import { md5 } from '../services/torbox.js';
import { deviceFacts } from './device.js';
import { getLocale } from '../i18n/core.js';
import { VERSION } from '../version.js';
import { EDITION } from '../edition.js';
import { log } from '../services/logger.js';
import { companionFacts, companionSent } from '../companion/usage.js';

  var ONLINE_URL = "https://api.jobees.org";
  var ID = /^[0-9a-f]{32}$/;
  var FIRST_MS = 15e3;       // after launch, once the store is up
  var CHECK_MS = 6e4;        // the count and the announcements: one posted or taken down shows within about a minute
  var PING_MS = 5 * 6e4;     // stats on: the Worker counts a console online for ten minutes after a ping
  var STALE_MS = 10 * 6e4;   // a count not heard again for this long is no longer shown (a long download skips looks)
  var MAX_NOTES = 5;         // up at once, as the server
  var REPORTS_AT_ONCE = 20;  // launches in one request, as the server takes them
  var MAX_WAITING = 300;     // launches kept to send; the oldest go past that
  var COMPAT_MS = 6 * 36e5;  // the players' numbers, asked again after six hours
  var COMPAT_RETRY_MS = 30 * 6e4;
  var TITLE = /^[A-Z]{4}\d{5}$/;
  var VERDICTS = { played: ["ran"], wontStart: ["crashed", "notStarted", "mountFailed"] };
  // A new ID: the time it was made, then random digits; 32 hex characters, nothing about the console in it.
  function newId(now, random) {
    let id = now.toString(16).padStart(12, "0").slice(-12);
    while (id.length < 32) id += Math.floor(random() * 16).toString(16);
    return id;
  }
  var announcementOf = (value) => value && Number.isFinite(value.id) && typeof value.text === "string" && value.text ? { id: value.id, text: value.text.slice(0, 280), level: value.level === "warning" ? "warning" : "info", until: Number.isFinite(value.until) ? value.until : null } : null;
  var announcementsOf = (list) => Array.isArray(list) ? list.map(announcementOf).filter(Boolean).slice(0, MAX_NOTES) : [];
  /**
   * The online side, from what it needs: `http` (Http.request), `store` ({get, set} of online.json), `facts` (what a
   * ping says about the app). `sent(said)` hears what a ping that went through said; `quiet()` is called at each look
   * with stats off, and when they're switched either way (what was counted for the next ping is dropped). Nothing is
   * sent until start() or refresh().
   */
  // `compatStore` ({get, set} of compat.json, or null): every game's numbers. `secret()` makes the launches' secret
  // (the runtime's random token where there is one).
  function createOnline({ http, store, facts, sent = () => {}, quiet = () => {}, busy = () => false, url = ONLINE_URL, now = Date.now, random = Math.random, log: say = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, compatStore = null, secret = null }) {
    let timer = null;
    let pinged = -Infinity;  // when the last ping went through
    let heard = -Infinity;   // when the server last answered
    let compatAsked = -Infinity;  // when the players' numbers were last asked for, answered or not
    const listeners = new Set();
    const saved = () => ({ enabled: true, ...store.get() });
    const enabled = () => saved().enabled !== false;
    // The ones heard last time until the server answers, less any whose time ran out meanwhile.
    let known = { online: null, announcements: announcementsOf(saved().notes).filter((note) => !note.until || note.until > now()) };
    const snapshot = () => ({ enabled: enabled(), online: known.online, announcements: known.announcements });
    const emit = () => {
      const now2 = snapshot();
      for (const listener of listeners) listener(now2);
    };
    function id() {
      const record = saved();
      if (ID.test(record.id ?? "")) return record.id;
      const made = newId(now(), random);
      store.set({ ...record, id: made });
      return made;
    }
    // What the last answer said, less what ran out since it came: an announcement past its time, and the count once
    // nothing was heard for STALE_MS. Each look does it, even one skipped for a download (hours, sometimes) or one
    // the server didn't answer, so a warning about tonight doesn't stay up into tomorrow.
    function tidy() {
      const announcements = known.announcements.filter((note) => !note.until || note.until > now());
      const count = now() - heard > STALE_MS ? null : known.online;
      if (count === known.online && announcements.length === known.announcements.length) return;
      known = { online: count, announcements };
      emit();
    }
    // One look at the status, or a ping when one is due (stats on); quiet when the server can't be reached. Skipped
    // while a download holds the network: the runtime runs one network task at a time, and a look would wait
    // behind the whole file (the console then counts as online again after the download).
    async function refresh() {
      if (!enabled()) quiet();
      if (busy()) return void tidy();
      let ping = false;
      try {
        // Half a look's leeway, so a late timer still makes it every fifth look, not every sixth.
        ping = enabled() && now() - pinged >= PING_MS - CHECK_MS / 2;
        const said = ping ? { id: id(), ...facts() } : null;
        const response = ping ? await http.request(`${url}/v1/ping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(said),
          maxBytes: 8192
        }) : await http.request(`${url}/v1/status`, { maxBytes: 8192 });
        if (!response.ok) {
          say(`the server answered HTTP ${response.status}`);
          return void tidy();
        }
        if (ping) {
          pinged = now();
          sent(said);
        }
        const answer = await response.json();
        heard = now();
        known = { online: Number.isFinite(answer?.online) ? answer.online : null, announcements: announcementsOf(answer?.announcements) };
        // Written only when they changed, not with every ping.
        const record = saved();
        if (JSON.stringify(known.announcements) !== JSON.stringify(record.notes ?? [])) store.set({ ...record, notes: known.announcements });
        emit();
      } catch (error) {
        say(`not reached: ${error?.message}`);
        return void tidy();
      }
      // The server answered: the launches waiting go, and the players' numbers when they're due. One after another,
      // and each only while no download holds the network. Launches never go with a ping (its look carries the ID):
      // one from the same address in the same second could be put beside it.
      if (!ping) await sendLaunches();
      await askCompat();
    }
    // ---- Game launches (0.5.4) ----
    // The secret the launches' tokens are made with: made once, kept in online.json, never sent.
    function launchSecret() {
      const record = saved();
      if (typeof record.launchSecret === "string" && record.launchSecret.length >= 16) return record.launchSecret;
      let made = "";
      try {
        made = secret ? String(secret() || "") : "";
      } catch {
      }
      if (made.length < 16) made = newId(now(), random) + newId(now(), random);
      store.set({ ...record, launchSecret: made });
      return made;
    }
    // `waiting` with `report` as its newest: one a title, MAX_WAITING at most.
    function keep(waiting, report) {
      if (!report || !TITLE.test(String(report.title)) || !Object.hasOwn(VERDICTS, report.outcome) || !VERDICTS[report.outcome].includes(report.verdict)) return waiting;
      const next = { ...waiting };
      delete next[report.title];
      next[report.title] = { outcome: report.outcome, verdict: report.verdict, format: String(report.format || "other"), fixed: report.fixed === true, backport: report.backport === true };
      const titles = Object.keys(next);
      for (const title of titles.slice(0, Math.max(0, titles.length - MAX_WAITING))) delete next[title];
      return next;
    }
    /** A game's latest launch ({title, outcome, verdict, format, fixed, backport}), kept to send. Only with stats on. */
    function launched(report) {
      if (!enabled()) return;
      const record = saved();
      store.set({ ...record, launches: keep(record.launches ?? {}, report) });
    }
    /** The first time with stats on: every launch known before (the queue's history), kept to send. */
    function launchedBefore(list) {
      const record = saved();
      if (!enabled() || record.launchesKnown) return;
      store.set({ ...record, launches: (list || []).reduce(keep, record.launches ?? {}), launchesKnown: true });
    }
    async function sendLaunches() {
      const waiting = saved().launches ?? {};
      const titles = Object.keys(waiting).slice(0, REPORTS_AT_ONCE);
      if (!enabled() || busy() || !titles.length) return;
      const key = launchSecret();
      const { version, firmware } = facts();
      const reports = titles.map((title) => ({ token: md5(`${key}:${title}`), title, ...waiting[title] }));
      try {
        const response = await http.request(`${url}/v1/launches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firmware, version, reports }),
          maxBytes: 1024
        });
        // Refused as a whole (none held together) they're let go too: sending them again would change nothing.
        if (!response.ok && response.status !== 400) return void say(`launches not sent: HTTP ${response.status}`);
        // Each sent one goes, unless a newer launch of that game took its place meanwhile.
        const after = { ...(saved().launches ?? {}) };
        for (const title of titles) if (JSON.stringify(after[title]) === JSON.stringify(waiting[title])) delete after[title];
        store.set({ ...saved(), launches: after });
        say(`${titles.length} launch${titles.length === 1 ? "" : "es"} sent`);
      } catch (error) {
        say(`launches not sent: ${error?.message}`);
      }
    }
    // Every game's numbers, every COMPAT_MS (and after a failure, not again for COMPAT_RETRY_MS). Nothing about the
    // console goes with it.
    async function askCompat() {
      if (!compatStore || busy()) return;
      const at = compatStore.get()?.at;
      if (now() - (Number.isFinite(at) ? at : -Infinity) < COMPAT_MS || now() - compatAsked < COMPAT_RETRY_MS) return;
      compatAsked = now();
      try {
        // The runtime's most for one answer (Http.request maxBytes): some 50,000 games' numbers.
        const response = await http.request(`${url}/v1/compat`, { maxBytes: 4 * 1024 * 1024 });
        if (!response.ok) return void say(`the players' numbers: HTTP ${response.status}`);
        const answer = await response.json();
        if (!answer?.titles || typeof answer.titles !== "object" || Array.isArray(answer.titles)) return void say("the players' numbers: not what was asked for");
        compatStore.set({ at: now(), titles: answer.titles });
        say(`the players' numbers: ${Object.keys(answer.titles).length} games`);
      } catch (error) {
        say(`the players' numbers not read: ${error?.message}`);
      }
    }
    function schedule(delay) {
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        void refresh().then(() => schedule(CHECK_MS));
      }, delay);
    }
    /** Starts the looks (and pings): the first a moment after launch. Returns a stop function. */
    function start() {
      schedule(FIRST_MS);
      return () => {
        if (timer !== null) clearTimer(timer);
        timer = null;
      };
    }
    function setEnabled(on) {
      quiet();
      // Launches kept while it was on and not yet sent are let go with it.
      store.set({ ...saved(), enabled: Boolean(on), ...on ? {} : { launches: {} } });
      emit();
      if (timer !== null) schedule(0);
    }
    /** A Homebrew install finished ({app, ok}) or failed ({app, ok: false, error}). Sent only with stats on. */
    function installed({ app, ok, error = "" }) {
      if (!enabled() || !app) return;
      const { version, firmware } = facts();
      // An error's links lose their queries, the way the log has them.
      const said = ok ? "" : String(error).replace(/\?\S*/g, "").slice(0, 200);
      void http.request(`${url}/v1/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "homebrew-install", app, ok: Boolean(ok), error: said, version, firmware }),
        maxBytes: 1024
      }).then((response) => {
        if (!response.ok) say(`install of ${app} not sent: HTTP ${response.status}`);
      }, (failure) => say(`install of ${app} not sent: ${failure?.message}`));
    }
    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
    return { enabled, installed, launched, launchedBefore, refresh, setEnabled, snapshot, start, subscribe };
  }
  var instance = null;
  var networkBusy = () => false;
  var appFacts = () => ({ version: VERSION, edition: EDITION, firmware: deviceFacts().firmware || "?", language: getLocale(), companion: companionFacts() });
  function online() {
    if (!instance) {
      instance = createOnline({
        http: Http,
        store: savedList("online.json", "online"),
        facts: appFacts,
        sent: (said) => companionSent(said.companion),
        quiet: () => companionSent(companionFacts()),
        busy: () => networkBusy(),
        log: (message) => log("online", message),
        compatStore: compatStore(),
        secret: () => LocalServer.token()
      });
    }
    return instance;
  }
  // compat.json: every game's numbers as last heard ({at, titles}); state/compat.js reads it.
  var compatList = null;
  var compatStore = () => compatList ?? (compatList = savedList("compat.json", "players' numbers"));
  /** Starts it at launch; `busy` says when a download holds the network (index.jsx: the download queue's). */
  function startOnline(busy) {
    if (busy) networkBusy = busy;
    return online().start();
  }
  /** {enabled, online, announcements}, kept current. */
  function useOnline() {
    const [value, setValue] = useState(() => online().snapshot());
    useEffect(() => {
      setValue(online().snapshot());
      return online().subscribe(setValue);
    }, []);
    return value;
  }

export { ONLINE_URL, compatStore, createOnline, online, startOnline, useOnline };
