// Play time per title, from ShadowMount+'s debug log: every game it launches logs "[GAME] started: TITLE
// pid=N" when its process starts and "[GAME] process exited ...: TITLE pid=N" (then "finalizing stopped
// application") when it ends, each line stamped with the console's local clock ("[23:39:48]", no date).
// A session is the time between the two. The queue reads the log's tail whenever the gamer comes back to
// Jobee'sLair (download-queue.js refreshLaunches), so each session is counted once, by its title, process
// and start time, and the totals are kept here: the log's tail rolls over, the hours played do not.
//
// The log has no dates. Its clock only runs forward, so a clock that goes back from one line to the next
// is a midnight passed; the last line is dated from the time the log was read. Durations are exact
// across midnights; the day a session ended is exact for the current ShadowMount run and approximate
// before it (the log says when ShadowMount restarted, not how long the console was off).

import { useEffect, useState } from 'react';
import { localDay } from './clock.js';
import { isRecord, readJSON } from './read-json.js';
import { OLD_TITLE_ID } from './title-migration.js';
import { TITLE_ID } from '../version.js';

  // Jobee'sLair's own launches are not games: this version's title ID and the one 0.4.0 and Overdrive use.
  var SELF = TITLE_ID;
  var OLD_SELF = OLD_TITLE_ID;
  var CLOCK = /^\[(\d{2}):(\d{2}):(\d{2})\]/;
  var STARTED = /\[GAME\] started: ([A-Z]{4}\d{5}) pid=(\d+)/;
  var ENDED = /\[GAME\] (?:process exited[^:]*|finalizing stopped application): ([A-Z]{4}\d{5}) pid=(\d+)/;
  var RESTART = /^\[[\d:]+\]\s*ShadowMount\+? v\d/;
  var DAY = 86400;
  var SEEN = 2e3;
  /**
   * The finished sessions in a debug log's text, oldest first: { key, title, pid, seconds, endedAt,
   * approximate }. `now`: when the log was read (ms); `offsetMinutes`: the console's time zone. A session
   * still running (no exit yet) and Jobee'sLair's own are left out.
   */
  function sessionsIn(text, { now = Date.now(), offsetMinutes = 0, self = SELF } = {}) {
    const lines = String(text ?? "").split("\n");
    // Each stamped line on one timeline: its clock plus a day for every midnight passed before it.
    const stamped = [];
    let days = 0, previous = null, restarts = 0;
    for (const line of lines) {
      const clock = CLOCK.exec(line);
      if (!clock) continue;
      const seconds = +clock[1] * 3600 + +clock[2] * 60 + +clock[3];
      if (RESTART.test(line)) restarts++;
      if (previous !== null && seconds < previous) days++;
      previous = seconds;
      stamped.push({ line, at: days * DAY + seconds, clock: clock[0].slice(1, -1), restarts });
    }
    if (!stamped.length) return [];
    // The last line happened at most a day before `now`, on the local clock.
    const nowLocal = Math.floor((now + offsetMinutes * 6e4) / 1e3);
    const last = stamped.at(-1);
    const lastLocal = nowLocal - ((nowLocal % DAY - last.at % DAY) % DAY + DAY) % DAY;
    const epochOf = (at) => (lastLocal - (last.at - at)) * 1e3 - offsetMinutes * 6e4;
    const open = /* @__PURE__ */ new Map();
    const sessions = [];
    for (const entry of stamped) {
      const start = STARTED.exec(entry.line);
      if (start) {
        open.set(`${start[1]}|${start[2]}`, entry);
        continue;
      }
      const end = ENDED.exec(entry.line);
      if (!end) continue;
      const begun = open.get(`${end[1]}|${end[2]}`);
      if (!begun) continue;
      open.delete(`${end[1]}|${end[2]}`);
      if (end[1] === self || end[1] === OLD_SELF) continue;
      sessions.push({
        key: `${end[1]}|${end[2]}|${begun.clock}`,
        title: end[1],
        pid: Number(end[2]),
        seconds: Math.max(0, entry.at - begun.at),
        endedAt: epochOf(entry.at),
        approximate: entry.restarts < last.restarts
      });
    }
    return sessions;
  }
  /**
   * The totals, kept in `file`: { TITLE: { seconds, sessions, lastPlayed } }. `learn(text)` takes a debug
   * log's sessions it has not counted yet; `played(title, ms)` takes a last-launch time ShadowMount
   * reports (its app.db), which dates "Last played" better than the log can.
   */
  function createPlaytime({ fs, file, now = Date.now, offsetMinutes = () => 0, log = console.log }) {
    const saved = readJSON(fs, file, null, (value) => value?.version === 1 && isRecord(value.titles) && Array.isArray(value.seen), (message) => log(`[playtime] ${message}`));
    let titles = saved?.titles ?? {};
    let seen = saved?.seen ?? [];
    const listeners = /* @__PURE__ */ new Set();
    const emit = () => {
      for (const listener of [...listeners]) listener(titles);
    };
    function save() {
      try {
        fs.mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
        fs.writeFile(`${file}.tmp`, JSON.stringify({ version: 1, titles, seen }), { sync: true });
        fs.rename(`${file}.tmp`, file);
      } catch (error) {
        log(`[playtime] not saved: ${error.message}`);
      }
    }
    function learn(text) {
      let offset = 0;
      try {
        offset = offsetMinutes(now());
      } catch {
      }
      const known = new Set(seen);
      const fresh = sessionsIn(text, { now: now(), offsetMinutes: offset }).filter((session) => !known.has(session.key));
      if (!fresh.length) return false;
      const next = { ...titles };
      for (const session of fresh) {
        const was = next[session.title] ?? { seconds: 0, sessions: 0, lastPlayed: null };
        next[session.title] = {
          seconds: was.seconds + session.seconds,
          sessions: was.sessions + 1,
          lastPlayed: Math.max(was.lastPlayed ?? 0, session.endedAt) || null
        };
        log(`[playtime] ${session.title}: ${Math.round(session.seconds / 60)} minutes${session.approximate ? " (before ShadowMount last restarted)" : ""}, ${Math.round(next[session.title].seconds / 360) / 10} hours in all`);
      }
      titles = next;
      seen = [...seen, ...fresh.map((session) => session.key)].slice(-SEEN);
      save();
      emit();
      return true;
    }
    function played(title, at) {
      if (!title || !at || at > now() + 864e5) return false;
      const was = titles[title];
      if ((was?.lastPlayed ?? 0) >= at) return false;
      titles = { ...titles, [title]: { seconds: was?.seconds ?? 0, sessions: was?.sessions ?? 0, lastPlayed: at } };
      save();
      emit();
      return true;
    }
    return {
      learn,
      played,
      of: (title) => titles[title] ?? null,
      snapshot: () => titles,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }
  // "42 hours played" / "35 minutes played" / null (never played), and "Last played today" / "yesterday" /
  // "3 days ago" / "on 2026-08-14": the parts of the line under a game, as i18n keys and params.
  function playParts(record, { now = Date.now(), offsetMinutes = 0 } = {}) {
    if (!record) return { time: null, last: null };
    const minutes = Math.round((record.seconds ?? 0) / 60);
    const time = !record.seconds ? null : minutes < 60 ? { key: "play.minutes", params: { count: Math.max(1, minutes) } } : { key: "play.hours", params: { count: minutes < 600 ? Math.round(minutes / 6) / 10 : Math.round(minutes / 60) } };
    if (!record.lastPlayed) return { time, last: null };
    const days = localDay(now, offsetMinutes) - localDay(record.lastPlayed, offsetMinutes);
    const last = days <= 0 ? { key: "play.lastToday" } : days === 1 ? { key: "play.lastYesterday" } : days < 30 ? { key: "play.lastDays", params: { count: days } } : { key: "play.lastLong", params: { count: Math.floor(days / 30) } };
    return { time, last };
  }
  var instance = null;
  // The app's one store; `make` builds it the first time (state/downloads.js gives it the file and clock).
  function playtimeStore(make) {
    if (!instance && make) instance = make();
    return instance;
  }
  /** The play time of `title` ({ seconds, sessions, lastPlayed } or null), redrawn when it changes. */
  function usePlaytime(title) {
    const store = playtimeStore();
    const [record, setRecord] = (0, useState)(() => store?.of(title) ?? null);
    (0, useEffect)(() => {
      if (!store) return void 0;
      setRecord(store.of(title));
      return store.subscribe((titles) => setRecord(titles[title] ?? null));
    }, [store, title]);
    return record;
  }
  /** Every title's play time, redrawn when any changes. */
  function usePlaytimes() {
    const store = playtimeStore();
    const [titles, setTitles] = (0, useState)(() => store?.snapshot() ?? {});
    (0, useEffect)(() => store ? store.subscribe(setTitles) : void 0, [store]);
    return titles;
  }

export { createPlaytime, playParts, playtimeStore, sessionsIn, usePlaytime, usePlaytimes };
