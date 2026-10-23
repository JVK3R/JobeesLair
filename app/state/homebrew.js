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
// An update installs the newer file over the older one: the old image or folder is moved aside first and
// deleted once the new one is in place. What is installed is recorded in <dataDir>/homebrew-installed.json:
// the release tag (to tell an update), the file and where it went.
// Apps installed by hand are found too: an app folder or image in a drive's homebrew/ folder that has the
// name an app's release gives it counts as installed, version unknown.
// One install runs at a time, in the order asked; the console's runtime runs one network task at a time
// anyway, so an install also waits for a game download in progress.

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
    readBundled = () => null,
    platform = "ps5",
    now = Date.now,
    log = (line) => console.log(`[homebrew] ${line}`)
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
      index = { ...next, from, byId: new Map(next.apps.map((app) => [app.id, app])) };
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
      defer(repairModes);
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
        task: task && task.phase !== "done" ? task : null,
        failed: task?.phase === "failed" ? task.error : ""
      };
    }
    const updates = () => load().apps.filter((app) => statusOf(app.id).update);
    const installedApps = () => load().apps.filter((app) => statusOf(app.id).installed);
    // ---- Installing ----------------------------------------------------------------------------------------
    // The drive an app goes to: the internal one when it has room, else the one with the most free space.
    function rootFor(file) {
      const list = roots();
      if (!list.length) throw new Error("No drive to install to.");
      const need = (file.size || 0) * (file.kind === "image" || file.kind === "payload" ? 1.1 : 2.2) + 64 * 1024 ** 2;
      const free = (root) => freeBytes(root);
      if (free(list[0]) === null || free(list[0]) >= need) return list[0];
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
    async function unpack(task, source, destination) {
      update(task, { phase: "extracting" });
      try {
        if (fs.exists(destination)) fs.removeTree(destination);
      } catch {
      }
      fs.mkdir(parentOf(destination), { recursive: true });
      const extraction = archives.extract({ sources: [source], destination, maxBytes: 64 * 1024 ** 3 });
      task.cancel = () => extraction.cancel();
      try {
        await extraction.done;
      } finally {
        task.cancel = null;
      }
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
          if (typeof fs.removeAsync === "function") fs.removeAsync(aside).catch((error) => log(`${aside} not deleted: ${error.message}`));
          else fs.removeTree(aside);
        } catch (error) {
          log(`${aside} not deleted: ${error.message}`);
        }
      }
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
      const root = role === "payload" ? null : rootFor(file);
      const work = role === "payload" ? `${payloadDir}/.incoming/${slug}` : `${root}/downloads/homebrew/${slug}`;
      const download = `${work}/${file.name}`;
      const unpacked = `${work}/unpacked`;
      log(`${app.id}: installing ${file.name} (${file.kind}) ${app.release.tag}`);
      await fetchTo(task, file, download, root ?? void 0);
      update(task, { phase: "installing", written: task.total ?? task.written });
      let record;
      if (file.kind === "image") {
        const target = `${root}/homebrew/${file.name}`;
        place(download, target);
        record = { paths: [target], root };
      } else if (file.kind === "app") {
        await unpack(task, download, unpacked);
        const folder = appFolder(unpacked, file);
        const title = titleOf(folder);
        const target = `${root}/homebrew/${title || baseName(folder)}`;
        if (fs.exists(target)) await release(installed[app.id]?.titleId || title);
        place(folder, target);
        dropMarkers(target);
        openTree(target);
        record = { paths: [target], root, titleId: title, opened: true };
        await addHelpers(task, app, slug, record);
      } else if (file.kind === "archive-image") {
        await unpack(task, download, unpacked);
        const wanted = baseName(file.inner);
        const image = findIn(unpacked, (name) => name === wanted) ?? findIn(unpacked, (name) => /\.(exfat|ffpkg|ffpfs|ffpfsc)$/i.test(name));
        if (!image) throw new Error("The archive holds no disk image.");
        const target = `${root}/homebrew/${baseName(image)}`;
        place(image, target);
        record = { paths: [target], root };
      } else if (file.kind === "payload") {
        const target = `${payloadDir}/${slug}/${file.name}`;
        place(download, target);
        record = { paths: [`${payloadDir}/${slug}`], run: target };
      } else if (file.kind === "archive-payload") {
        await unpack(task, download, unpacked);
        const wanted = baseName(file.inner);
        const elf = findIn(unpacked, (name) => name === wanted) ?? findIn(unpacked, (name) => /\.elf$/i.test(name));
        if (!elf) throw new Error("The archive holds no payload.");
        // The payload's own folder comes with it: its data files sit beside it.
        const folder = parentOf(elf);
        const target = `${payloadDir}/${slug}`;
        place(folder === unpacked ? unpacked : folder, target);
        dropMarkers(target);
        record = { paths: [target], run: `${target}/${baseName(elf)}` };
      } else {
        if (!packages) throw new Error("This console cannot install packages from the app.");
        let pkg = download;
        if (file.kind === "archive-pkg") {
          await unpack(task, download, unpacked);
          pkg = findIn(unpacked, (name) => /\.f?pkg$/i.test(name));
          if (!pkg) throw new Error("The archive holds no package.");
        }
        update(task, { phase: "installing" });
        const install = packages.install({ path: pkg, name: app.name });
        await install.done;
        record = { paths: [], root, package: true };
      }
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
      } catch (error) {
        const cancelled = error?.name === "AbortError" || task.cancelled;
        log(`${task.appId}: ${cancelled ? "cancelled" : `install failed: ${error?.message}`}`);
        if (cancelled) tasks.delete(task.appId);
        update(task, { phase: cancelled ? "done" : "failed", error: cancelled ? "" : String(error?.message || error) });
      } finally {
        running = null;
        void pumpQueue();
      }
    }
    // Queues the app's install (its best file, or the one named). Returns at once; statusOf shows progress.
    function install(id, fileName2) {
      load();
      const app = index.byId.get(id);
      if (!app) throw new Error("No such app.");
      const file = fileName2 ? app.files.find((item) => item.name === fileName2) : app.files[0];
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
    // homebrew/ (ShadowMount+ then drops it; its home-screen icon can be deleted) and deleted after.
    function remove(id) {
      const record = installed[id];
      if (!record) throw new Error("Jobee'sLair did not install this app.");
      if (shadow && record.kind === "app" && record.titleId) {
        // Let ShadowMount+ drop its mount of the folder first, then take the folder away.
        void release(record.titleId).then(() => removeNow(id)).catch((error) => log(`${id}: not removed: ${error?.message}`));
        return;
      }
      removeNow(id);
    }
    function removeNow(id) {
      const record = installed[id];
      if (!record) return;
      for (const path of record.paths || []) {
        try {
          if (!fs.exists(path)) continue;
          if (record.run) fs.removeTree(path);
          else {
            const trash = `${record.root}/downloads/homebrew/.removed-${now()}-${baseName(path)}`;
            fs.mkdir(parentOf(trash), { recursive: true });
            fs.rename(path, trash);
            if (typeof fs.removeAsync === "function") fs.removeAsync(trash).catch((error) => log(`${trash} not deleted: ${error.message}`));
          }
        } catch (error) {
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
      delete installed[id];
      saveInstalled();
      scanFound();
      emit();
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
      runHelper,
      helperReady,
      removeHelper,
      installHelper,
      ownerOf,
      rescan: () => {
        pruneGone();
        scanFound();
        emit();
      },
      canRun: (id) => Boolean(installed[id]?.run),
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

export { INDEX_URL, createHomebrew, slugOf };
