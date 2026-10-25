// Jobee'sLair online (0.5.2): the live count, announcements, and the anonymous stats behind Jake's dashboard. The
// other end is tools/online, a Cloudflare Worker at api.jobees.org.
//
// While it's open, the app asks for the count and the announcements once a minute, sending nothing about the console.
// With "Share anonymous stats" on (Settings, About; on by default), every fifth of those is a ping instead: a random
// ID made on this console the first time (not the console's own ID, not the PSN account), the app's version and
// edition, the firmware and the language. A Homebrew install that finishes or fails sends which app and the error,
// without the ID. Never sent either way: the library, downloads, games.
//
// online.json keeps the ID, the switch, and the announcements last heard, so the bar under the top menu
// (ui/AnnouncementBar.jsx) is there from launch until the server says they're down.

import { useEffect, useState } from 'react';
import { Http } from '@ps5-react/core';
import { savedList } from './saved.js';
import { deviceFacts } from './device.js';
import { getLocale } from '../i18n/core.js';
import { VERSION } from '../version.js';
import { EDITION } from '../edition.js';
import { log } from '../services/logger.js';

  var ONLINE_URL = "https://api.jobees.org";
  var ID = /^[0-9a-f]{32}$/;
  var FIRST_MS = 15e3;       // after launch, once the store is up
  var CHECK_MS = 6e4;        // the count and the announcements: one posted or taken down shows within about a minute
  var PING_MS = 5 * 6e4;     // stats on: the Worker counts a console online for ten minutes after a ping
  var STALE_MS = 10 * 6e4;   // a count not heard again for this long is no longer shown (a long download skips looks)
  var MAX_NOTES = 5;         // up at once, as the server
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
   * ping says about the app). Nothing is sent until start() or refresh().
   */
  function createOnline({ http, store, facts, busy = () => false, url = ONLINE_URL, now = Date.now, random = Math.random, log: say = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let timer = null;
    let pinged = -Infinity;  // when the last ping went through
    let heard = -Infinity;   // when the server last answered
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
      if (busy()) return void tidy();
      try {
        // Half a look's leeway, so a late timer still makes it every fifth look, not every sixth.
        const ping = enabled() && now() - pinged >= PING_MS - CHECK_MS / 2;
        const response = ping ? await http.request(`${url}/v1/ping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: id(), ...facts() }),
          maxBytes: 8192
        }) : await http.request(`${url}/v1/status`, { maxBytes: 8192 });
        if (!response.ok) {
          say(`the server answered HTTP ${response.status}`);
          return void tidy();
        }
        if (ping) pinged = now();
        const answer = await response.json();
        heard = now();
        known = { online: Number.isFinite(answer?.online) ? answer.online : null, announcements: announcementsOf(answer?.announcements) };
        // Written only when they changed, not with every ping.
        const record = saved();
        if (JSON.stringify(known.announcements) !== JSON.stringify(record.notes ?? [])) store.set({ ...record, notes: known.announcements });
        emit();
      } catch (error) {
        say(`not reached: ${error?.message}`);
        tidy();
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
      store.set({ ...saved(), enabled: Boolean(on) });
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
    return { enabled, installed, refresh, setEnabled, snapshot, start, subscribe };
  }
  var instance = null;
  var networkBusy = () => false;
  var appFacts = () => ({ version: VERSION, edition: EDITION, firmware: deviceFacts().firmware || "?", language: getLocale() });
  function online() {
    if (!instance) {
      instance = createOnline({
        http: Http,
        store: savedList("online.json", "online"),
        facts: appFacts,
        busy: () => networkBusy(),
        log: (message) => log("online", message)
      });
    }
    return instance;
  }
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

export { ONLINE_URL, createOnline, online, startOnline, useOnline };
