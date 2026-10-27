// The Homebrew section: open-source PS5 apps and payloads, listed by homebrew/index.json and installed
// straight from each author's own GitHub release (state/homebrew-index.js checks that every file comes from
// there). Pure over what it is given, so it runs (and is tested) without the console; state/homebrew-store.js
// binds it to the runtime and to React.
//
// The index: the copy shipped in the app (/app0/data/homebrew.json) first, then the last one fetched
// (<dataDir>/homebrew-index.json), then, a little after launch, the live one from the repository. The newest
// by its `generated` time wins.
//
// Installing, by what the file is (homebrew-index.js KINDS):
//   image            a disk image: downloaded to <drive>/downloads/homebrew/, then moved into
//                    <drive>/homebrew/, where ShadowMount+ mounts it and puts its icon on the home screen;
//   app              a .zip holding an app folder (sce_sys/param.json, eboot.bin): downloaded, unpacked, and
//                    the folder moved to <drive>/homebrew/<its title ID>;
//   archive-image    a .zip/.7z holding a disk image: unpacked, then as an image;
//   payload          an .elf/.bin: kept in <payloadDir>/<owner>__<repo>/ and sent to the payload loader on
//                    127.0.0.1:9021 when the player runs it;
//   archive-payload  an archive holding one: the payload's folder is kept the same way (its data with it);
//   pkg, archive-pkg a package: handed to the console's installer (Packages.install).
// An update installs the newer file over the older one, on the drive it is on (rootFor): an old image is moved
// aside first and deleted once the new one is in place; a folder takes the new version's files into it, and what
// the app keeps there (saves, settings) stays (mergeInto). What is installed is recorded in <dataDir>/homebrew-installed.json:
// the release tag (to tell an update), the file and where it went.
// Apps installed by hand are found too: an app folder or image in a drive's homebrew/ folder that has the
// name an app's release gives it counts as installed, version unknown.
// One install runs at a time, in the order asked; the console's runtime runs one network task at a time
// anyway, so an install also waits for a game download in progress.

import { extractInTurn } from './archive-turn.js';
import { stagingOf } from './extraction-staging.js';
import { normalizeIndex, roleOf } from './homebrew-index.js';

  // 0.5.1: the index is built and kept in its own repository, apart from the store's.
  var INDEX_URL = "https://raw.githubusercontent.com/JVK3R/JobeesLair-Homebrew/main/index.json";
  // Http.request takes at most 4 MiB; the index is about half a megabyte.
  var MAX_INDEX_BYTES = 4 * 1024 * 1024;
  var slugOf = (id) => id.replace("/", "__").replace(/[^A-Za-z0-9_.-]/g, "_");
  var baseName = (path) => path.slice(path.lastIndexOf("/") + 1);
  var parentOf = (path) => path.slice(0, path.lastIndexOf("/")) || "/";
  var TITLE_ID = /^[A-Z]{4}\d{5}$/;
  // A payload's loader port: ELF loaders take .elf on 9021; a raw .bin goes to 9021 too (most PS5 .bin
  // payloads are ELF files), and to the 9020 loader when 9021 does not answer.
  var portsOf = (path) => /\.elf$/i.test(path) ? [9021] : [9021, 9020];
  // 0.5.3: smaller than this, a release file is a stand-in, not an app (one author's newest release held a
  // 4-byte Void.pkg reading "soon"). The index passes such releases over; this covers an index from before.
  var MIN_FILE = 1024;
  var standIn = (file) => Number.isFinite(file.size) && file.size > 0 && file.size < MIN_FILE;
  // 0.5.3: a file's name with its version taken out, so a release's file is matched with the one an older release
  // gave the same variant: "EVOPlayer-v0.13.0-PPSA99039-pro.ffpfsc" and "EVOPlayer-v0.14.0-PPSA99039-pro.ffpfsc" are
  // one, the "-pro" and the plain build are not, and neither are PS5MC's kodi21 and kodi22 builds.
  var variantOf = (name) => String(name).toLowerCase().replace(/v?\d+(?:\.\d+)+|\bv\d+\b/g, "#");
  // An error as the stats get it: without the native call and the path that a task's message starts with
  // ("Packages.install /data/downloads/homebrew/<app>/<file>.pkg: ").
  var reasonOf = (message) => String(message).replace(/^[A-Z][A-Za-z]*\.[a-z][A-Za-z]* \/[^\n]*?: /, "");
  // What a package install's failure means, in plain words where the reason is a known one.
  function packageFailure(message) {
    const reason = reasonOf(message);
    if (/is not a (PS4 or PS5 package|PKG)/.test(reason)) return "This file isn't a package the console can install: it doesn't start like a PS4 or PS5 package.";
    if (/payload loader on port 9021 did not answer/.test(reason)) return "Installing a package needs an ELF loader on port 9021 (etaHEN and OnionHEN have one). Load one, then try again.";
    return reason;
  }
  function createHomebrew({
    fs,
    http,
    downloads,
    archives,
    packages = null,
    payloads = null,
    // ShadowMount+'s API (state/shadowmount.js shadowRequest bound to http), or null where there is none.
    shadow = null,
    // The same, asked only when no download holds the network (skipped otherwise): for checks nobody waits on.
    shadowQuick = null,
    // When the one-time repair of older installs runs: well after launch, so a big app folder never holds the
    // store's first screens.
    defer = (work) => setTimeout(work, 2e4),
    dataDir,
    payloadDir,
    // The drives an app may go to, the internal one first, and the free bytes of one (null: unknown).
    roots = () => [],
    freeBytes = () => null,
    // A drive's and a size's names in the gamer's words, for the errors that stop an install (0.5.2).
    driveName = (root) => root,
    sizeText = (bytes) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.ceil(bytes / 1e6)} MB`,
    readBundled = () => null,
    platform = "ps5",
    now = Date.now,
    log = (line) => console.log(`[homebrew] ${line}`),
    // 0.5.2: told when an install finishes ({app, ok: true}) or fails ({app, ok: false, error}); not when cancelled.
    onInstalled = () => {}
  }) {
    const indexFile = `${dataDir}/homebrew-index.json`;
    const installedFile = `${dataDir}/homebrew-installed.json`;
    const listeners = /* @__PURE__ */ new Set();
    let index = null;
    let installed = {};
    // Installs by app id: { appId, file, phase, written, total, error, startedAt }.
    const tasks = /* @__PURE__ */ new Map();
    const queue = [];
    let running = null;
    let refreshing = null;
    let found = {};
    let version = 0;
    const emit = () => {
      version += 1;
      for (const listener of [...listeners]) listener();
    };
    const readJSON = (path) => {
      try {
        return fs.exists(path) ? JSON.parse(fs.readFile(path)) : null;
      } catch (error) {
        log(`${path} not read: ${error.message}`);
        return null;
      }
    };
    const writeJSON = (path, value) => {
      fs.mkdir(parentOf(path), { recursive: true });
      fs.writeFile(`${path}.tmp`, JSON.stringify(value), { sync: true });
      fs.rename(`${path}.tmp`, path);
    };
    // ---- The index ----------------------------------------------------------------------------------
    function adopt(doc, from) {
      const next = normalizeIndex(doc);
      if (!next || !next.apps.length) return false;
      if (index && next.generated <= index.generated) return false;
      // 0.5.3: an app whose newest release holds only stand-ins keeps the release the index before had, when that
      // one has the app in it, so it still installs and no "update" to nothing is offered (an index built before
      // the builder passed such releases over listed Spectrum Library 1.4.9, a 4-byte Void.pkg).
      const apps = next.apps.map((app) => {
        const before = index?.byId.get(app.id);
        return app.files.every(standIn) && before && !before.files.every(standIn) ? { ...app, release: before.release, files: before.files, with: before.with } : app;
      });
      index = { ...next, apps, from, byId: new Map(apps.map((app) => [app.id, app])) };
      log(`index from ${from}: ${next.apps.length} apps`);
      return true;
    }
    function load() {
      if (index) return index;
      try {
        const text = readBundled();
        if (text) adopt(JSON.parse(text), "the app");
      } catch (error) {
        log(`the app's own index not read: ${error.message}`);
      }
      const cached = readJSON(indexFile);
      if (cached) adopt(cached, "the last download");
      if (!index) index = { generated: 0, categories: [], apps: [], from: "none", byId: /* @__PURE__ */ new Map() };
      const saved = readJSON(installedFile);
      installed = saved && saved.version === 1 && saved.apps && typeof saved.apps === "object" ? saved.apps : {};
      pruneGone();
      defer(() => {
        repairModes();
        sweepTrash();
      });
      scanFound();
      return index;
    }
    // Fetches the live index; keeps it when it is newer. Resolves with whether it changed anything.
    function refresh() {
      if (refreshing) return refreshing;
      refreshing = (async () => {
        load();
        try {
          const response = await http.request(INDEX_URL, { maxBytes: MAX_INDEX_BYTES });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const doc = JSON.parse(await response.text());
          if (!adopt(doc, "GitHub")) return false;
          try {
            writeJSON(indexFile, doc);
          } catch (error) {
            log(`index not kept: ${error.message}`);
          }
          emit();
          return true;
        } catch (error) {
          log(`index not refreshed: ${error.message}`);
          return false;
        } finally {
          refreshing = null;
        }
      })();
      return refreshing;
    }
    // ---- What is installed ------------------------------------------------------------------------------
    // The record, and beside the payloads a list of them (<payloadDir>/index.json) for the companion's helper
    // that answers while the app is closed (app/native/companion_daemon.c): it can read /data, not the app's
    // own storage.
    const saveInstalled = () => {
      writeJSON(installedFile, { version: 1, apps: installed });
      try {
        const apps = Object.entries(installed).filter(([, record]) => record.run).map(([id, record]) => {
          const app = index?.byId.get(id);
          return { id, name: app?.name ?? id, author: app?.author ?? "", version: record.tag, run: record.run };
        });
        writeJSON(`${payloadDir}/index.json`, { version: 1, apps });
      } catch (error) {
        log(`payload list not written: ${error.message}`);
      }
    };
    // An app deleted by hand (FTP, the library) is no longer "installed": a record whose files are all gone is
    // dropped, with its helper. A record on a drive that is not plugged in stays.
    function pruneGone() {
      let changed = false;
      for (const [id, record] of Object.entries(installed)) {
        const paths = record.paths ?? [];
        if (!paths.length || record.package) continue;
        if (record.root && !roots().includes(record.root)) continue;
        if (paths.some((path) => fs.exists(path))) continue;
        if (record.helperDir) {
          try {
            if (fs.exists(record.helperDir)) fs.removeTree(record.helperDir);
          } catch {
          }
        }
        delete installed[id];
        changed = true;
        log(`${id}: its files are gone, so it is no longer listed as installed`);
      }
      if (changed) {
        try {
          saveInstalled();
        } catch (error) {
          log(`record not saved: ${error.message}`);
        }
      }
    }
    // The names an app's files take in a homebrew/ folder (an image's file name, an app folder's name).
    function placedNames(app) {
      const names = [];
      for (const file of app.files) {
        if (file.kind === "image") names.push(file.name);
        else if (file.kind === "archive-image") names.push(baseName(file.inner));
        else if (file.kind === "app" && file.folder && file.folder !== ".") names.push(baseName(file.folder));
      }
      return names;
    }
    // Apps installed by hand: what each drive's homebrew/ folder holds, matched by name. Read once at load
    // and after each install (one directory listing per drive).
    function scanFound() {
      found = {};
      if (!index?.apps.length) return;
      const present = /* @__PURE__ */ new Map();
      for (const root of roots()) {
        try {
          for (const entry of fs.readDir(`${root}/homebrew`)) present.set(entry.name, `${root}/homebrew/${entry.name}`);
        } catch {
        }
      }
      for (const app of index.apps) {
        if (installed[app.id]) continue;
        const match = placedNames(app).find((name) => present.has(name));
        if (match) found[app.id] = { path: present.get(match) };
      }
    }
    // An app's state: what is installed of it, whether a newer release is out, and its install in progress.
    function statusOf(id) {
      const app = load().byId.get(id);
      const record = installed[id] ?? null;
      const task = tasks.get(id) ?? null;
      const outside = !record && found[id] ? found[id] : null;
      return {
        installed: Boolean(record || outside),
        record,
        outside,
        update: Boolean(app && record && record.tag !== app.release.tag),
        // 0.5.3: an install still under way. A failed one counted too, so its page said "Installing…" for good,
        // beside the reason it failed and a Cancel with nothing left to stop, until the app was restarted.
        task: task && task.phase !== "done" && task.phase !== "failed" ? task : null,
        failed: task?.phase === "failed" ? task.error : ""
      };
    }
    const updates = () => load().apps.filter((app) => statusOf(app.id).update);
    const installedApps = () => load().apps.filter((app) => statusOf(app.id).installed);
    // ---- Installing ----------------------------------------------------------------------------------------
    // The drive an app goes to: the internal one when it has room, else the one with the most free space. 0.5.2: an
    // app already on the console (installed from here, or found in a homebrew/ folder) is updated on its own drive,
    // and one removed with its saves kept goes back to the drive they wait on. Files only move within a drive: on
    // another, the update would be a second copy without the saves, and kept saves would never come back. When that
    // drive has no room, the install stops and says what to do instead.
    function rootFor(file, app) {
      const list = roots();
      if (!list.length) throw new Error("No drive to install to.");
      const need = (file.size || 0) * (file.kind === "image" || file.kind === "payload" ? 1.1 : 2.2) + 64 * 1024 ** 2;
      const free = (root) => freeBytes(root);
      const room = (root) => free(root) === null || free(root) >= need;
      const record = installed[app.id];
      const at = record && !record.package ? record.root : found[app.id] ? list.find((root) => found[app.id].path.startsWith(`${root}/homebrew/`)) : null;
      if (at) {
        if (!list.includes(at)) throw new Error(`${app.name} is on a drive that isn't plugged in. Plug it in to update it, or remove ${app.name} and install it again.`);
        if (!room(at)) throw new Error(`Not enough free space to update ${app.name}: ${driveName(at)}, where it's installed, needs about ${sizeText(need)} free.`);
        return at;
      }
      const saves = `homebrew-saves/${slugOf(app.id)}`;
      const kept = list.find((root) => fs.stat(`${root}/${saves}`)?.isDirectory);
      if (kept) {
        if (!room(kept)) throw new Error(`Not enough free space to install ${app.name} again: ${driveName(kept)}, where what it saved is kept (${kept}/${saves}), needs about ${sizeText(need)} free. Free up some room there, or delete that folder to install it on another drive.`);
        return kept;
      }
      if (room(list[0])) return list[0];
      const best = [...list].sort((a, b) => (free(b) ?? 0) - (free(a) ?? 0))[0];
      if ((free(best) ?? 0) < need) throw new Error("Not enough free space on any drive.");
      return best;
    }
    const update = (task, change) => {
      Object.assign(task, change);
      emit();
    };
    async function fetchTo(task, file, destination, root) {
      fs.mkdir(parentOf(destination), { recursive: true });
      for (const leftover of [destination, `${destination}.part`, `${destination}.resume`, `${destination}.complete`]) {
        try {
          if (fs.exists(leftover)) fs.remove(leftover);
        } catch {
        }
      }
      update(task, { phase: "downloading", written: 0, total: file.size || null });
      const download = downloads.enqueue({ url: file.url, destination, rejectHtml: true, ...(file.size ? { expectedBytes: file.size } : {}), ...(root ? { storageRoot: root } : {}) });
      task.cancel = () => download.cancel();
      const off = download.subscribe((snapshot) => {
        if (snapshot.state === "queued") {
          if (task.phase !== "waiting") update(task, { phase: "waiting" });
          return;
        }
        if (task.phase === "waiting") task.phase = "downloading";
        const written = snapshot.written || 0;
        // Redraws at most every whole percent.
        const step = (task.total || 1) / 100;
        if (Math.floor(written / step) !== Math.floor((task.written || 0) / step) || snapshot.total !== task.total) update(task, { written, total: snapshot.total || task.total });
      });
      try {
        await download.done;
      } finally {
        off();
        task.cancel = null;
      }
    }
    // Resolves with the folder the archive went to: `destination`, or one beside it when that will not clear.
    async function unpack(task, source, destination) {
      update(task, { phase: "extracting" });
      // 0.5.3: with the extractor's own staging beside it (extraction-staging.js): an install cut off while it
      // unpacked left that, and every later try, downloading the archive anew, was refused as another extraction's.
      let clear = true;
      for (const path of [destination, ...stagingOf(destination)]) {
        try {
          if (fs.exists(path)) fs.removeTree(path);
        } catch (error) {
          clear = false;
          log(`${path} not cleared: ${error.message}`);
        }
      }
      // 0.5.2: the extractor refuses a folder it did not finish ("Existing extraction has no matching, valid
      // completion receipt"), so a staging folder that will not clear made every later update of the app fail.
      const into = clear && !fs.exists(destination) ? destination : `${destination}-${now()}`;
      fs.mkdir(parentOf(into), { recursive: true });
      // 0.5.3: the console extracts one archive at a time, so a game download's extraction goes first (archive-turn.js).
      const turn = { stopped: () => task.cancelled, waiting: () => update(task, { phase: "waiting", waitFor: "unpack" }) };
      task.cancel = () => turn.wake?.();
      try {
        const extraction = await extractInTurn(archives, { sources: [source], destination: into, maxBytes: 64 * 1024 ** 3 }, turn);
        if (task.waitFor) update(task, { phase: "extracting", waitFor: null });
        task.cancel = () => extraction.cancel();
        await extraction.done;
      } finally {
        task.cancel = null;
      }
      return into;
    }
    // The first path under `dir` (depth-first, at most `depth` levels) whose name matches `test`.
    function findIn(dir, test, depth = 4) {
      let entries = [];
      try {
        entries = fs.readDir(dir);
      } catch {
        return null;
      }
      for (const entry of entries) if (!entry.isDirectory && test(entry.name)) return `${dir}/${entry.name}`;
      if (depth > 0) for (const entry of entries) if (entry.isDirectory) {
        const hit = findIn(`${dir}/${entry.name}`, test, depth - 1);
        if (hit) return hit;
      }
      return null;
    }
    // The app folder in an unpacked archive: the index's own folder, else any folder with sce_sys/param.json
    // beside an eboot.bin.
    function appFolder(dir, file) {
      const named = file.folder && file.folder !== "." ? `${dir}/${file.folder}` : dir;
      const isApp = (path) => fs.exists(`${path}/sce_sys/param.json`) && fs.exists(`${path}/eboot.bin`);
      if (isApp(named)) return named;
      const param = findIn(dir, (name) => name === "param.json", 5);
      const folder = param && param.endsWith("/sce_sys/param.json") ? param.slice(0, -"/sce_sys/param.json".length) : null;
      if (folder && isApp(folder)) return folder;
      throw new Error("The archive holds no app folder (sce_sys/param.json and eboot.bin).");
    }
    function titleOf(folder) {
      try {
        const param = JSON.parse(fs.readFile(`${folder}/sce_sys/param.json`));
        return TITLE_ID.test(param.titleId) ? param.titleId : null;
      } catch {
        return null;
      }
    }
    // Puts `from` at `to`, moving what is there aside first; the old copy is deleted after, when it can be.
    // ShadowMount+ keeps an app's folder mounted (nullfs). Renaming or deleting it from under that mount leaves the mount
    // stale, and ShadowMount then answers "Device busy" to every refresh and unmount. So it is asked to let go first.
    async function release(titleId) {
      if (!shadow || !titleId) return;
      try {
        await shadow("games/unmount", { title_id: titleId });
      } catch (error) {
        log(`${titleId}: unmount before the change: ${error?.message}`);
      }
    }
    function place(from, to) {
      fs.mkdir(parentOf(to), { recursive: true });
      let aside = null;
      if (fs.exists(to)) {
        aside = `${parentOf(from)}/.replaced-${now()}-${baseName(to)}`;
        fs.rename(to, aside);
      }
      try {
        fs.rename(from, to);
      } catch (error) {
        if (aside) fs.rename(aside, to);
        throw error;
      }
      if (aside) {
        try {
          if (typeof fs.removeAsync === "function") fs.removeAsync(aside, { background: true }).catch((error) => log(`${aside} not deleted: ${error.message}`));
          else fs.removeTree(aside);
        } catch (error) {
          log(`${aside} not deleted: ${error.message}`);
        }
      }
    }
    // 0.5.2: an update of an app or payload folder moves the new version's files into the installed folder instead
    // of putting a new folder in its place. A file replaces the old one of its name, a folder only the new version
    // has moves in whole, a folder both have is merged the same way, and what only the installed folder holds is
    // never touched: an emulator's saves, settings, caches and logs. The folder used to be swapped and the old one
    // deleted with all of that in it; PS5X360 0.6.0 to 1.0.0 lost its Xbox 360 profile so, all but a folder the
    // app could not enter. An old entry of the other kind (a folder where the new version has a file) goes to
    // <keep>/<time>/<its path> and stays. A file the new version replaces goes to `backup` (in the staging, tidied
    // once the install is done), so a merge that fails partway moves every file back and the old version still runs.
    function mergeInto(from, to, keep, backup) {
      const undo = [];
      const stamp = now();
      const move = (source, target) => {
        fs.mkdir(parentOf(target), { recursive: true });
        fs.rename(source, target);
        undo.push([target, source]);
      };
      const merge = (fromDir, toDir, rel) => {
        for (const entry of fs.readDir(fromDir)) {
          if (entry.name.startsWith(".ps5-react-")) continue;
          const path = rel ? `${rel}/${entry.name}` : entry.name;
          const source = `${fromDir}/${entry.name}`, target = `${toDir}/${entry.name}`;
          const there = fs.stat(target);
          if (there?.isDirectory && entry.isDirectory) {
            merge(source, target, path);
            continue;
          }
          if (there) move(target, Boolean(there.isDirectory) !== Boolean(entry.isDirectory) ? `${keep}/${stamp}/${path}` : `${backup}/${path}`);
          move(source, target);
        }
      };
      try {
        merge(from, to, "");
      } catch (error) {
        for (const [at, back] of undo.reverse()) {
          try {
            fs.rename(at, back);
          } catch (failure) {
            log(`${at} not put back: ${failure.message}`);
          }
        }
        throw new Error(`The new version could not be put in place, so the one you had was left as it was (${error.message}).`);
      }
    }
    // Earlier builds moved an updated folder aside inside its own staging (<work>/unpacked/.replaced-…), which the
    // next install clears, and when ShadowMount held the folder its delete failed part-way: what the app kept there
    // was left behind (PS5X360's saves). Such a folder goes to <drive>/downloads/homebrew/kept/<app>/ and stays.
    // If it cannot be moved, the install stops before anything is cleared.
    function keepLeftovers(work, slug) {
      const kept = `${parentOf(work)}/kept/${slug}`;
      for (const dir of [`${work}/unpacked`, work]) {
        let entries = [];
        try {
          entries = fs.readDir(dir);
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (!entry.isDirectory || !entry.name.startsWith(".replaced-")) continue;
          const to = `${kept}/${entry.name.slice(1)}`;
          try {
            fs.mkdir(kept, { recursive: true });
            fs.rename(`${dir}/${entry.name}`, to);
          } catch (error) {
            throw new Error(`An earlier update left this app's old files in ${dir}/${entry.name}, and they could not be moved out of the way (${error.message}). Nothing was changed.`);
          }
          log(`what an earlier update left of this app (its saves and settings, if it kept any there) is kept in ${to}`);
        }
      }
    }
    // ---- What an app saves in its own folder (0.5.2) --------------------------------------------------------
    // The files an app's package put in its folder, by their path inside it (<dataDir>/homebrew-files/<app>.json),
    // so that removing it can tell them from what the app saved there since (an emulator's saves, settings,
    // caches, logs) and ask whether to keep that. Kept, it waits in <drive>/homebrew-saves/<app>/ (a payload's
    // in <payloadDir>/.saves/<app>/) and goes back into the folder when the app is installed again.
    const shippedFile = (slug) => `${dataDir}/homebrew-files/${slug}.json`;
    const keptDirOf = (slug, record) => record.run ? `${payloadDir}/.saves/${slug}` : `${record.root}/homebrew-saves/${slug}`;
    // An app kept whole (installed before its files were listed) carries this, so its own files are not brought back.
    var WHOLE = ".jobeeslair-kept-whole";
    function listFiles(dir, rel = "", out = []) {
      let entries = [];
      try {
        entries = fs.readDir(dir);
      } catch {
        return out;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".ps5-react-")) continue;
        const path = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory) listFiles(`${dir}/${entry.name}`, path, out);
        else out.push(path);
      }
      return out;
    }
    function readShipped(slug) {
      try {
        const saved = JSON.parse(fs.readFile(shippedFile(slug)));
        return saved?.version === 1 && Array.isArray(saved.files) ? new Set(saved.files) : null;
      } catch {
        return null;
      }
    }
    // After an install: the new package's files, and after an update also the older ones still in the folder.
    function rememberShipped(slug, files, folder) {
      const all = new Set(files);
      for (const path of readShipped(slug) ?? []) if (fs.exists(`${folder}/${path}`)) all.add(path);
      try {
        writeJSON(shippedFile(slug), { version: 1, files: [...all] });
      } catch (error) {
        log(`${slug}: its list of files is not saved: ${error.message}`);
      }
    }
    /**
     * What an installed app saved in its own folder: { folder, paths (inside it; a folder whole when none of the
     * package is in it, or when it cannot be read), whole, keptAt }, or null when there is nothing (or no folder).
     * An app installed before its files were listed counts as all saved (`whole`): nothing tells them apart.
     */
    function savedData(id) {
      load();
      const record = installed[id];
      const folder = record?.paths?.[0];
      if (!folder || !fs.stat(folder)?.isDirectory) return null;
      const keptAt = keptDirOf(slugOf(id), record);
      const shipped = readShipped(slugOf(id));
      if (!shipped) {
        const paths = listTop(folder);
        return paths.length ? { folder, paths, whole: true, keptAt } : null;
      }
      const dirs = /* @__PURE__ */ new Set();
      for (const path of shipped) for (let at = path.indexOf("/"); at > 0; at = path.indexOf("/", at + 1)) dirs.add(path.slice(0, at));
      const walk = (dir, rel) => {
        const out = [];
        let entries = [];
        try {
          entries = fs.readDir(dir);
        } catch {
          return rel ? [rel] : [];
        }
        for (const entry of entries) {
          if (entry.name.startsWith(".ps5-react-")) continue;
          const path = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory) out.push(...dirs.has(path) ? walk(`${dir}/${entry.name}`, path) : [path]);
          else if (!shipped.has(path)) out.push(path);
        }
        return out;
      };
      const paths = walk(folder, "");
      return paths.length ? { folder, paths, whole: false, keptAt } : null;
    }
    function listTop(folder) {
      try {
        return fs.readDir(folder).filter((entry) => !entry.name.startsWith(".ps5-react-")).map((entry) => entry.name);
      } catch {
        return [];
      }
    }
    // Moves what the app saved out of its folder before the folder goes; an earlier keep not brought back yet is
    // set aside beside it, never replaced. A folder the app made that Jobee'sLair may not even read (PS5X360's
    // phone-camera, drwx------) cannot be moved either: it stays with the app. Any other failure puts back what
    // was moved and throws, so nothing is removed. Returns where it went, or null when there was nothing.
    function keepSaved(id) {
      const data = savedData(id);
      if (!data) return null;
      const kept = data.keptAt;
      if (fs.exists(kept)) fs.rename(kept, `${kept}-${now()}`);
      const moved = [];
      for (const path of data.paths) {
        const from = `${data.folder}/${path}`, to = `${kept}/${path}`;
        try {
          fs.mkdir(parentOf(to), { recursive: true });
          fs.rename(from, to);
          moved.push([from, to]);
        } catch (error) {
          let closed = false;
          try {
            if (fs.stat(from)?.isDirectory) fs.readDir(from);
          } catch {
            closed = true;
          }
          if (closed) {
            log(`${id}: ${path} stays with the app: it cannot be read or moved (${error.message})`);
            continue;
          }
          for (const [back, at] of moved.reverse()) {
            try {
              fs.rename(at, back);
            } catch (failure) {
              log(`${at} not put back: ${failure.message}`);
            }
          }
          throw new Error(`${path}: ${error.message}`);
        }
      }
      if (data.whole) writeJSON(`${kept}/${WHOLE}`, { version: 1 });
      log(`${id}: what it saved (${data.paths.length} ${data.whole ? "entries of its folder, kept whole" : "files and folders"}) is kept in ${kept}`);
      return kept;
    }
    // When the app is installed again: what was kept goes back into its folder, except what the new package
    // ships itself (that is the new version's). Those copies go only when it was kept whole (its own old files);
    // a file of the app's own that the package now ships too, or anything that could not be moved back, is set
    // aside with the rest, never deleted.
    function bringBack(slug, record, folder, shipped) {
      const kept = keptDirOf(slug, record);
      if (!fs.stat(kept)?.isDirectory) return;
      const whole = fs.exists(`${kept}/${WHOLE}`);
      let back = 0, old = 0, left = 0;
      const move = (from, to, rel) => {
        let entries = [];
        try {
          entries = fs.readDir(from);
        } catch {
          left++;
          return;
        }
        for (const entry of entries) {
          if (!rel && entry.name === WHOLE) continue;
          const path = rel ? `${rel}/${entry.name}` : entry.name;
          const source = `${from}/${entry.name}`, target = `${to}/${entry.name}`;
          const there = fs.stat(target);
          if (entry.isDirectory && there?.isDirectory) move(source, target, path);
          else if (!entry.isDirectory && shipped.has(path)) old++;
          else if (!there) {
            try {
              fs.mkdir(to, { recursive: true });
              fs.rename(source, target);
              back++;
            } catch (error) {
              log(`${source} not brought back: ${error.message}`);
              left++;
            }
          } else left++;
        }
      };
      move(kept, folder, "");
      const aside = left || old && !whole ? `${kept}-${now()}` : null;
      try {
        if (aside) fs.rename(kept, aside);
        else fs.removeTree(kept);
      } catch (error) {
        log(`${kept} not tidied: ${error.message}`);
      }
      log(`${slug}: ${back} files and folders it saved before it was removed are back in ${folder}${aside ? `; the rest (${left} that could not be moved back, ${old} the new version ships itself) is kept in ${aside}` : ""}`);
    }
    // The extractor's own bookkeeping files (.ps5-react-stage, .ps5-react-extraction) are not the app's.
    function dropMarkers(dir) {
      try {
        for (const entry of fs.readDir(dir)) if (entry.name.startsWith(".ps5-react-")) fs.removeTree(`${dir}/${entry.name}`);
      } catch {
      }
    }
    // Prospero's folder, and every game or app copied over FTP, is open to everyone (rwxrwxrwx). An app unpacked by
    // the console's extractor is rw-rw-rw-, which cannot be started: ShadowMount mounts it, the console never runs its
    // eboot.bin (PS5SX2, the Wii U / 3DS / DS emulator). Every file and folder of an app is opened after it is placed.
    function openTree(dir) {
      if (typeof fs.chmod !== "function") return;
      let entries = [];
      try {
        entries = fs.readDir(dir);
      } catch {
      }
      for (const entry of entries) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory) openTree(path);
        else {
          try {
            fs.chmod(path, 0o777);
          } catch {
          }
        }
      }
      try {
        fs.chmod(dir, 0o777);
      } catch {
      }
    }
    // An app folder installed by an earlier build was left rw-rw-rw- and cannot start: opened once, then marked.
    function repairModes() {
      if (typeof fs.chmod !== "function") return;
      let changed = false;
      for (const record of Object.values(installed)) {
        if (record.kind !== "app" || record.opened) continue;
        for (const path of record.paths ?? []) if (fs.exists(path)) openTree(path);
        record.opened = true;
        changed = true;
      }
      if (changed) {
        try {
          saveInstalled();
        } catch (error) {
          log(`record not saved: ${error.message}`);
        }
      }
    }
    const tidy = (...paths) => {
      for (const path of paths) {
        try {
          if (path && fs.exists(path)) fs.removeTree(path);
        } catch (error) {
          log(`${path} not tidied: ${error.message}`);
        }
      }
    };
    // What a removal or an update set aside to delete: <drive>/downloads/homebrew/.removed-<time>-<name>, deleted
    // in the background. Paths this launch is deleting, so the sweep below never starts a second deletion of one.
    // 0.5.3: on the engine's background worker (removeAsync's `background`). The console deletes one thing at a
    // time, and RetroArch's 19,462 files, deleted at launch, kept a cancelled download's card on "Removing" for
    // minutes behind them.
    const TRASH = ".removed-";
    const deleting = /* @__PURE__ */ new Set();
    function deleteLater(path) {
      if (deleting.has(path)) return;
      if (typeof fs.removeAsync !== "function") {
        try {
          fs.removeTree(path);
        } catch (error) {
          log(`${path} not deleted: ${error.message}`);
        }
        return;
      }
      deleting.add(path);
      fs.removeAsync(path, { background: true }).catch((error) => log(`${path} not deleted: ${error.message}`)).finally(() => deleting.delete(path));
    }
    // 0.5.3: a deletion the app was closed during stopped there, and what it had not reached stayed for good
    // (PS5X360's whole folder, after a removal, on Jake's console). Deleted again once per launch, after the
    // drives are known (load's deferred work, then each rescan).
    const swept = /* @__PURE__ */ new Set();
    function sweepTrash() {
      for (const root of roots()) {
        const dir = `${root}/downloads/homebrew`;
        if (swept.has(dir)) continue;
        swept.add(dir);
        let entries = [];
        try {
          entries = fs.exists(dir) ? fs.readDir(dir) : [];
        } catch (error) {
          log(`${dir} not read: ${error.message}`);
        }
        for (const entry of entries) {
          if (!entry.name.startsWith(TRASH) || deleting.has(`${dir}/${entry.name}`)) continue;
          log(`${dir}/${entry.name}: left by a removal that was cut off; deleting it`);
          deleteLater(`${dir}/${entry.name}`);
        }
      }
    }
    // 0.5.3: an update whose image (or payload) is named after its version is put beside the old one, not over it:
    // Lineup-1.4.1.exfat stayed in homebrew/ next to Lineup-1.4.2.exfat, two images of one title for ShadowMount+
    // and the old one's space taken. Once the new one is in place, the old one goes the way a removed app's does,
    // but only an older copy of the same file (variantOf): another variant the player put there stays.
    function dropReplaced(previous, target) {
      const old = previous?.run ?? previous?.paths?.[0];
      if (!old || old === target || previous.package || parentOf(old) !== parentOf(target)) return;
      if (variantOf(baseName(old)) !== variantOf(baseName(target)) || !fs.exists(old)) return;
      try {
        if (previous.run) fs.remove(old);
        else {
          const trash = `${previous.root}/downloads/homebrew/${TRASH}${now()}-${baseName(old)}`;
          fs.mkdir(parentOf(trash), { recursive: true });
          fs.rename(old, trash);
          deleteLater(trash);
        }
        log(`${baseName(old)} is replaced by ${baseName(target)}, so it was deleted`);
      } catch (error) {
        log(`${old} not deleted: ${error.message}`);
      }
    }
    // 0.5.3: another of the release's files than the installed one (Spectrum Library's package after its payload)
    // wrote its record over the old one, and the payload stayed on the console, where Remove no longer looked. The
    // payload's own files go once the new install is in; anything else in its folder (what it saved) stays.
    function dropOtherKind(previous, shipped, record) {
      const folder = previous?.run ? previous.paths?.[0] : null;
      if (!folder || record.run?.startsWith(`${folder}/`) || record.helperDir === folder || !fs.exists(folder)) return;
      for (const path of shipped ?? [baseName(previous.run)]) {
        try {
          if (fs.exists(`${folder}/${path}`)) fs.remove(`${folder}/${path}`);
        } catch (error) {
          log(`${folder}/${path} not deleted: ${error.message}`);
        }
      }
      try {
        if (!listFiles(folder).length) fs.removeTree(folder);
      } catch (error) {
        log(`${folder} not removed: ${error.message}`);
      }
      log(`${baseName(previous.run)} is replaced by ${record.package ? "the package" : baseName(record.paths[0])}, so it was deleted`);
    }
    // An app's helper payloads (an emulator's launcher): kept like any payload, run from the app's page.
    async function addHelpers(task, app, slug, record) {
      for (const wanted of app.with ?? []) {
        const helper = app.files.find((item) => item.name === wanted && roleOf(item) === "payload");
        if (!helper) continue;
        const from = `${payloadDir}/.incoming/${slug}/${helper.name}`;
        await fetchTo(task, helper, from, void 0);
        const kept = `${payloadDir}/${slug}/${helper.name}`;
        place(from, kept);
        record.helper = record.helper ?? kept;
        record.helperDir = `${payloadDir}/${slug}`;
      }
    }
    async function runInstall(task) {
      const app = index.byId.get(task.appId);
      const file = task.file;
      const slug = slugOf(app.id);
      if (task.helperOnly) {
        // Only the helper again (after Remove helper): the app itself stays as it is.
        const record = installed[app.id];
        if (!record) throw new Error("Install the app first.");
        log(`${app.id}: installing its helper`);
        await addHelpers(task, app, slug, record);
        tidy(`${payloadDir}/.incoming/${slug}`);
        installed[app.id] = record;
        saveInstalled();
        return;
      }
      const role = roleOf(file);
      // What was installed before, for dropReplaced and dropOtherKind (the record is written anew at the end).
      const previous = installed[app.id] ?? null;
      const shippedBefore = previous?.run ? readShipped(slug) : null;
      const root = role === "payload" ? null : rootFor(file, app);
      const work = role === "payload" ? `${payloadDir}/.incoming/${slug}` : `${root}/downloads/homebrew/${slug}`;
      const download = `${work}/${file.name}`;
      const unpacked = `${work}/unpacked`;
      // Where an old entry mergeInto cannot put back goes: beside the staging, which is tidied after.
      const keep = `${parentOf(work)}/kept/${slug}`;
      // The files an update replaces, until it is in place: in the staging, so they go with it (one folder each
      // install, so what an earlier attempt left there is never in the way).
      const backup = `${work}/previous-${now()}`;
      log(`${app.id}: installing ${file.name} (${file.kind}) ${app.release.tag}`);
      if (standIn(file)) {
        throw new Error(`This release's ${file.name} is only ${file.size} bytes, so it isn't ${app.name} itself. Its author may not have uploaded it yet.`);
      }
      keepLeftovers(work, slug);
      await fetchTo(task, file, download, root ?? void 0);
      update(task, { phase: "installing", written: task.total ?? task.written });
      let record;
      if (file.kind === "image") {
        const target = `${root}/homebrew/${file.name}`;
        place(download, target);
        dropReplaced(previous, target);
        record = { paths: [target], root };
      } else if (file.kind === "app") {
        const into = await unpack(task, download, unpacked);
        const folder = appFolder(into, file);
        const title = titleOf(folder);
        const target = `${root}/homebrew/${title || baseName(folder)}`;
        const files = listFiles(folder);
        if (fs.exists(target)) {
          await release(installed[app.id]?.titleId || title);
          mergeInto(folder, target, keep, backup);
        } else place(folder, target);
        dropMarkers(target);
        record = { paths: [target], root, titleId: title, opened: true };
        rememberShipped(slug, files, target);
        bringBack(slug, record, target, new Set(files));
        openTree(target);
        await addHelpers(task, app, slug, record);
      } else if (file.kind === "archive-image") {
        const into = await unpack(task, download, unpacked);
        const wanted = baseName(file.inner);
        const image = findIn(into, (name) => name === wanted) ?? findIn(into, (name) => /\.(exfat|ffpkg|ffpfs|ffpfsc)$/i.test(name));
        if (!image) throw new Error("The archive holds no disk image.");
        const target = `${root}/homebrew/${baseName(image)}`;
        place(image, target);
        dropReplaced(previous, target);
        record = { paths: [target], root };
      } else if (file.kind === "payload") {
        const target = `${payloadDir}/${slug}/${file.name}`;
        place(download, target);
        dropReplaced(previous, target);
        record = { paths: [`${payloadDir}/${slug}`], run: target };
        rememberShipped(slug, [file.name], record.paths[0]);
        bringBack(slug, record, record.paths[0], /* @__PURE__ */ new Set([file.name]));
      } else if (file.kind === "archive-payload") {
        const into = await unpack(task, download, unpacked);
        const wanted = baseName(file.inner);
        const elf = findIn(into, (name) => name === wanted) ?? findIn(into, (name) => /\.elf$/i.test(name));
        if (!elf) throw new Error("The archive holds no payload.");
        // The payload's own folder comes with it: its data files sit beside it, and stay through an update.
        const folder = parentOf(elf);
        const target = `${payloadDir}/${slug}`;
        const files = listFiles(folder);
        if (fs.exists(target)) mergeInto(folder, target, keep, backup);
        else place(folder, target);
        dropMarkers(target);
        dropReplaced(previous, `${target}/${baseName(elf)}`);
        record = { paths: [target], run: `${target}/${baseName(elf)}` };
        rememberShipped(slug, files, target);
        bringBack(slug, record, target, new Set(files));
      } else {
        if (!packages) throw new Error("This console cannot install packages from the app.");
        let pkg = download;
        if (file.kind === "archive-pkg") {
          const into = await unpack(task, download, unpacked);
          // 0.5.2: the package the index names (`inner`), as for an image or a payload: an archive can hold the app's
          // package beside another (a patch, a dependency). Any package only when that one is not there.
          const wanted = baseName(file.inner);
          pkg = findIn(into, (name) => name === wanted) ?? findIn(into, (name) => /\.f?pkg$/i.test(name));
          if (!pkg) throw new Error("The archive holds no package.");
        }
        update(task, { phase: "installing" });
        const install = packages.install({ path: pkg, name: app.name });
        await install.done.catch((error) => {
          throw error?.name === "AbortError" || task.cancelled ? error : new Error(packageFailure(error?.message ?? error));
        });
        record = { paths: [], root, package: true };
        // 0.5.3: a package's helper payloads too (PS5Library's agent), kept and run like a folder app's.
        await addHelpers(task, app, slug, record);
      }
      dropOtherKind(previous, shippedBefore, record);
      tidy(work, `${payloadDir}/.incoming/${slug}`);
      installed[app.id] = { tag: app.release.tag, file: file.name, kind: file.kind, installedAt: now(), ...record };
      delete found[app.id];
      saveInstalled();
      // ShadowMount+ picks up new images and folders by itself; asking it to look now only makes that sooner.
      const ask = shadowQuick ?? shadow;
      if (ask && root && role === "app") ask("scan", { reset_attempts: false }).catch(() => {});
      log(`${app.id}: installed ${app.release.tag} at ${record.paths[0] ?? "the console's installer"}`);
    }
    async function pumpQueue() {
      if (running || !queue.length) return;
      const task = queue.shift();
      running = task;
      try {
        await runInstall(task);
        update(task, { phase: "done", error: "" });
        tasks.delete(task.appId);
        emit();
        onInstalled({ app: task.appId, ok: true });
      } catch (error) {
        const cancelled = error?.name === "AbortError" || task.cancelled;
        log(`${task.appId}: ${cancelled ? "cancelled" : `install failed: ${error?.message}`}`);
        if (cancelled) tasks.delete(task.appId);
        update(task, { phase: cancelled ? "done" : "failed", error: cancelled ? "" : String(error?.message || error) });
        if (!cancelled) onInstalled({ app: task.appId, ok: false, error: reasonOf(error?.message || error) });
      } finally {
        running = null;
        void pumpQueue();
      }
    }
    // The file an update installs: the one installed when the release still has it, else the same variant under
    // its new version's name (variantOf), else the release's best. 0.5.3: a release that names its files after
    // their version took its first file, so an update switched EVO Player's "-pro" build for the plain one.
    function updateFileOf(app, record) {
      const was = record?.file;
      if (!was) return app.files[0];
      return app.files.find((item) => item.name === was) ?? app.files.find((item) => item.kind === record.kind && variantOf(item.name) === variantOf(was)) ?? app.files[0];
    }
    // Queues the app's install (its best file, or the one named; an update, the installed one's). Returns at once;
    // statusOf shows progress.
    function install(id, fileName2) {
      load();
      const app = index.byId.get(id);
      if (!app) throw new Error("No such app.");
      const file = fileName2 ? app.files.find((item) => item.name === fileName2) : updateFileOf(app, installed[id]);
      if (!file) throw new Error("No such file in this release.");
      const current = tasks.get(id);
      if (current && current.phase !== "failed" && current.phase !== "done") return;
      const task = { appId: id, file, phase: "waiting", written: 0, total: file.size || null, error: "", startedAt: now() };
      tasks.set(id, task);
      queue.push(task);
      emit();
      void pumpQueue();
    }
    // Fetches an installed app's helper again (it was taken off with removeHelper).
    function installHelper(id) {
      load();
      const app = index.byId.get(id);
      if (!installed[id]) throw new Error("Install the app first.");
      const file = (app?.with ?? []).map((name) => app.files.find((item) => item.name === name && roleOf(item) === "payload")).find(Boolean);
      if (!file) throw new Error("This app has no helper.");
      const current = tasks.get(id);
      if (current && current.phase !== "failed" && current.phase !== "done") return;
      const task = { appId: id, file, helperOnly: true, phase: "waiting", written: 0, total: file.size || null, error: "", startedAt: now() };
      tasks.set(id, task);
      queue.push(task);
      emit();
      void pumpQueue();
    }
    function cancel(id) {
      const task = tasks.get(id);
      if (!task) return;
      task.cancelled = true;
      const waiting = queue.indexOf(task);
      if (waiting >= 0) {
        queue.splice(waiting, 1);
        tasks.delete(id);
        emit();
        return;
      }
      task.cancel?.();
    }
    // Sends an installed payload to the loader. Returns { ok, error }.
    function run(id) {
      const record = installed[id];
      const target = record?.run;
      if (!target) throw new Error("This app has no payload to run.");
      if (!payloads) throw new Error("Payloads run on the PS5 only.");
      if (!fs.exists(target)) throw new Error("The payload's file is gone. Install it again.");
      let last = { ok: false, error: "" };
      for (const port of portsOf(target)) {
        last = payloads.send(target, { port });
        if (last.ok) break;
      }
      log(`${id}: run ${baseName(target)}: ${last.ok ? "sent" : last.error}`);
      if (last.ok) {
        installed[id] = { ...record, lastRun: now() };
        try {
          saveInstalled();
        } catch {
        }
        emit();
      }
      return last;
    }
    // The app's helper payload is run only once ShadowMount has the app mounted: a helper sent before that has no app to
    // serve and, for some, must be sent again. { ok, reason } with reason "notMounted" | "unknown" | "noHelper".
    // `quick`: a check nobody waits on (the page's), asked in the background; Run helper asks now.
    async function helperReady(id, { quick = false } = {}) {
      const record = installed[id];
      if (!record?.helper) return { ok: false, reason: "noHelper" };
      if (!shadow || !record.titleId) return { ok: true, reason: "" };
      try {
        const info = await (quick && shadowQuick || shadow)("games/info", { title_id: record.titleId });
        return info && info.installed !== false ? { ok: true, reason: "" } : { ok: false, reason: "notMounted" };
      } catch (error) {
        return { ok: false, reason: /HTTP 404/.test(error?.message ?? "") ? "notMounted" : "unknown" };
      }
    }
    async function runHelper(id) {
      const record = installed[id];
      if (!record?.helper) throw new Error("This app has no helper.");
      if (!payloads) throw new Error("Payloads run on the PS5 only.");
      if (!fs.exists(record.helper)) throw new Error("The helper's file is gone. Install the app again.");
      const ready = await helperReady(id);
      if (!ready.ok) return { ok: false, error: ready.reason, reason: ready.reason };
      let last = { ok: false, error: "" };
      for (const port of portsOf(record.helper)) {
        last = payloads.send(record.helper, { port });
        if (last.ok) break;
      }
      log(`${id}: run helper ${baseName(record.helper)}: ${last.ok ? "sent" : last.error}`);
      if (last.ok && installed[id]) {
        installed[id] = { ...installed[id], helperRunAt: now() };
        try {
          saveInstalled();
        } catch {
        }
        emit();
      }
      return last;
    }
    // Takes the helper's file off the console (the app stays). A helper already running stays until the console restarts.
    function removeHelper(id) {
      const record = installed[id];
      if (!record?.helperDir) throw new Error("This app has no helper.");
      try {
        if (fs.exists(record.helperDir)) fs.removeTree(record.helperDir);
      } catch (error) {
        throw new Error(`Could not remove the helper: ${error.message}`);
      }
      const { helper, helperDir, helperRunAt, ...rest } = record;
      installed[id] = rest;
      saveInstalled();
      emit();
    }
    // The app (from the index) that a file or folder in homebrew/ belongs to, by what was installed or found there.
    function ownerOf(path, titleId) {
      load();
      for (const [id, record] of Object.entries(installed)) {
        if ((record.paths ?? []).includes(path) || (titleId && record.titleId === titleId)) return index.byId.get(id) ?? null;
      }
      for (const [id, hit] of Object.entries(found)) if (hit.path === path) return index.byId.get(id) ?? null;
      return null;
    }
    // Takes an app off the console: a payload's folder is deleted; an app's image or folder is moved out of
    // homebrew/ (ShadowMount+ then drops it; its home-screen icon can be deleted) and deleted after. 0.5.2: with
    // `keep`, what it saved in its folder (savedData) is moved out first and kept for when it is installed again;
    // the screens ask which. Resolves with where that went (or null) once it is done.
    function remove(id, { keep = false } = {}) {
      const record = installed[id];
      if (!record) throw new Error("Jobee'sLair did not install this app.");
      if (shadow && record.kind === "app" && record.titleId) {
        // Let ShadowMount+ drop its mount of the folder first, then take the folder away.
        return release(record.titleId).then(() => removeNow(id, keep)).catch((error) => {
          log(`${id}: not removed: ${error?.message}`);
          throw error;
        });
      }
      try {
        return Promise.resolve(removeNow(id, keep));
      } catch (error) {
        return Promise.reject(error);
      }
    }
    function removeNow(id, keep = false) {
      const record = installed[id];
      if (!record) return null;
      let kept = null;
      if (keep) {
        try {
          kept = keepSaved(id);
        } catch (error) {
          throw new Error(`Could not keep what ${index?.byId.get(id)?.name ?? id} saved, so nothing was removed: ${error.message}`);
        }
      }
      for (const path of record.paths || []) {
        try {
          if (!fs.exists(path)) continue;
          if (record.run) fs.removeTree(path);
          else {
            const trash = `${record.root}/downloads/homebrew/${TRASH}${now()}-${baseName(path)}`;
            fs.mkdir(parentOf(trash), { recursive: true });
            fs.rename(path, trash);
            deleteLater(trash);
          }
        } catch (error) {
          // The app stays, so what was kept goes back in with it.
          if (kept) bringBack(slugOf(id), record, record.paths[0], /* @__PURE__ */ new Set());
          throw new Error(`Could not remove ${baseName(path)}: ${error.message}`);
        }
      }
      if (record.helperDir) {
        try {
          if (fs.exists(record.helperDir)) fs.removeTree(record.helperDir);
        } catch (error) {
          log(`${record.helperDir} not removed: ${error.message}`);
        }
      }
      try {
        if (fs.exists(shippedFile(slugOf(id)))) fs.remove(shippedFile(slugOf(id)));
      } catch {
      }
      delete installed[id];
      saveInstalled();
      scanFound();
      emit();
      // 0.5.2: said when it worked too (only a failure was), so the log shows how a removal ended.
      log(`${id}: removed ${(record.paths || []).join(", ") || "(no files)"}${kept ? `; what it saved waits in ${kept}` : ""}`);
      return kept;
    }
    return {
      load,
      refresh,
      get index() {
        return load();
      },
      get version() {
        return version;
      },
      app: (id) => load().byId.get(id) ?? null,
      statusOf,
      updates,
      installedApps,
      install,
      cancel,
      run,
      remove,
      savedData,
      runHelper,
      helperReady,
      removeHelper,
      installHelper,
      ownerOf,
      rescan: () => {
        pruneGone();
        scanFound();
        sweepTrash();
        emit();
      },
      canRun: (id) => Boolean(installed[id]?.run),
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

export { INDEX_URL, createHomebrew, slugOf, variantOf };
