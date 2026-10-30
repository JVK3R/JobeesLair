// The phone's Library (0.5.4): what the console's Library shows, the games and apps on its drives with where each
// stands, and Fix it for one that won't start. Built as library/useShelf.js builds it, outside React, and kept for a
// few seconds: listing the drives' homebrew/ folders takes a moment, and a phone may ask twice in a row.
// Fix it runs as the Library's does (library/LibraryScreen.jsx fixTarget / fixIt) and answers later, by `notice`.

import { fixNeeded, fixStateText, fixText } from '../game/fix-text.js';
import { t } from '../i18n/core.js';
import { titleOf } from '../library/make-room.js';
import { shelfEntries } from '../library/shelf.js';
import { homebrewOf, scanHomebrew, titleLaunch } from '../library/useShelf.js';
import { getGame } from '../state/catalog.js';
import { downloadQueue, driveName } from '../state/downloads.js';
import { driveSnapshot } from '../state/drives.js';
import { readinessText } from '../state/readiness.js';

  var KEEP_MS = 8e3;
  var cache = null;
  var https = (url) => typeof url === "string" && /^https:\/\//.test(url) ? url : null;
  function entries() {
    if (cache && Date.now() - cache.at < KEEP_MS) return cache.entries;
    const jobs = downloadQueue().snapshot();
    const files = scanHomebrew(driveSnapshot().roots);
    const list = shelfEntries({ jobs, files, gameOf: getGame, homebrewOf, titleLaunch }).map((entry) => ({ ...entry, root: entry.jobs[0]?.root ?? entry.files[0]?.root ?? null }));
    cache = { at: Date.now(), entries: list };
    return list;
  }
  // What Fix it would be pressed on: an installed game ShadowMount runs, by its job or by the copy on the drive.
  function fixTarget(entry) {
    const job = entry.job;
    if (job) return job.artifact?.nextAction === "shadowmount" && job.state === "installed" ? { jobId: job.id, titleId: titleOf(entry) } : null;
    const file = entry.files[0];
    return file?.installed && file.titleId ? { titleId: file.titleId, folders: [file.path], root: file.root } : null;
  }
  function fixStateOf(entry) {
    const target = fixTarget(entry);
    if (!target) return null;
    let state = "notLaunched";
    try {
      state = downloadQueue().fixState(target.titleId);
    } catch {
    }
    return { needed: fixNeeded(state), text: fixStateText(t, state, entry.game.title) };
  }
  // One entry as the phone shows it, in the console's language.
  function card(entry) {
    const app = entry.game.homebrewApp ?? null;
    return {
      key: entry.key,
      title: entry.game.title,
      cover: https(entry.game.art?.cover) ?? (app && !app.self ? https(app.icon) : null),
      homebrew: Boolean(app),
      size: entry.size || 0,
      drive: entry.root ? driveName(entry.root) : "",
      state: readinessText(entry.ready),
      tone: entry.ready?.tone ?? "accent",
      removing: entry.removing,
      fix: fixStateOf(entry)
    };
  }
  function libraryList() {
    return entries().map(card);
  }
  // Starts Fix it for an entry; `done({text, bad})` says what it changed. False when there is nothing to fix there.
  function fixEntry(key, done) {
    const entry = entries().find((item) => item.key === key);
    const target = entry && fixTarget(entry);
    if (!target) return false;
    const queue = downloadQueue();
    void Promise.resolve().then(() => target.jobId ? queue.fixIt(target.jobId) : queue.fixTitle({ title: target.titleId, folders: target.folders, root: target.root, label: entry.game.title })).then((result) => {
      cache = null;
      done(fixText(t, result, entry.game.title));
    }, (error) => done({ text: error?.message ?? String(error), bad: true }));
    return true;
  }
  // A change on the console (a download finished, an app went): the next ask reads the drives again.
  function forgetLibrary() {
    cache = null;
  }

export { fixEntry, forgetLibrary, libraryList };
