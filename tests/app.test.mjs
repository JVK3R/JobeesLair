// Exercises app/state/download-queue.js against an in-memory filesystem, a fake download engine,
// a fake archive extractor and a fake ShadowMount+ API. Run: node --test queue.test.mjs <repo>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { createDownloadQueue, BUSY } = await load('app/state/download-queue.js');
const { diagnoseLaunch, launchOutcomes } = await load('app/state/launch-diagnosis.js');
const { readinessOf, readinessText, cardReadiness } = await load('app/state/readiness.js');
const { backportAdvice } = await load('app/state/firmware.js');
const { describeSource, preferredRelease, sourceSections } = await load('app/game/sources.js');
const { newer } = await load('app/state/updater.js');
const { configure } = await load('app/i18n/core.js');
const { shelfEntries } = await load('app/library/shelf.js');
const { scanDrive } = await load('app/files/scan.js');
const { busyWhileOpen, shadowRequest } = await load('app/state/shadowmount.js');
const { DownloadFormats } = await load('ps5-react/runtime/js/download-formats.js');
const en = JSON.parse(readFileSync(path.join(repo, 'app/i18n/locales/en.json'), 'utf8'));
configure(() => en, en);

function memoryFs() {
  const nodes = new Map([['/', { dir: true, inode: 1 }]]);
  let inode = 2;
  const name = (p) => p.slice(p.lastIndexOf('/') + 1);
  const parent = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
  const fs = {
    nodes,
    stat(p) {
      const n = nodes.get(p);
      return n ? { name: name(p), isDirectory: !!n.dir, isFile: !n.dir, size: n.dir ? 0 : n.size, modified: 0, device: '1', inode: String(n.inode) } : null;
    },
    exists: (p) => nodes.has(p),
    mkdir(p) {
      const parts = p.split('/').filter(Boolean);
      let at = '';
      for (const part of parts) {
        at += `/${part}`;
        if (!nodes.has(at)) nodes.set(at, { dir: true, inode: inode++ });
        else if (!nodes.get(at).dir) throw new Error(`ENOTDIR ${at}`);
      }
    },
    file(p, size, text) {
      fs.mkdir(parent(p));
      nodes.set(p, { size: text === undefined ? size : Buffer.byteLength(text), text, inode: inode++ });
    },
    readFile(p) {
      const n = nodes.get(p);
      if (!n || n.dir) throw new Error(`ENOENT ${p}`);
      return n.text ?? '';
    },
    writeFile(p, text) { fs.file(p, 0, text); },
    appendFile(p, text) { fs.file(p, 0, (nodes.get(p)?.text ?? '') + text); },
    readDir(p) {
      if (!nodes.get(p)?.dir) throw new Error(`ENOENT ${p}`);
      return [...nodes.keys()].filter((k) => k !== p && parent(k) === p).map((k) => fs.stat(k));
    },
    rename(a, b) {
      if (!nodes.has(a)) throw new Error(`ENOENT ${a}`);
      // POSIX: a file replaces a file; a directory only replaces nothing.
      if (nodes.get(b)?.dir || nodes.get(a).dir && nodes.has(b)) throw new Error(`EEXIST ${b}`);
      nodes.delete(b);
      for (const k of [...nodes.keys()]) {
        if (k === a || k.startsWith(`${a}/`)) {
          nodes.set(b + k.slice(a.length), nodes.get(k));
          nodes.delete(k);
        }
      }
    },
    remove(p) { nodes.delete(p); },
    removeTree(p) { for (const k of [...nodes.keys()]) if (k === p || k.startsWith(`${p}/`)) nodes.delete(k); },
    async removeAsync(p) { fs.removeTree(p); },
    diskUsage: () => ({ total: 1e12, free: 1e12 }),
    mounts: () => [],
  };
  fs.mkdir('/data');
  return fs;
}

const task = (work) => {
  let cancel;
  const done = new Promise((resolve, reject) => {
    cancel = () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    setImmediate(() => { try { resolve(work()); } catch (error) { reject(error); } });
  });
  return { subscribe: () => () => {}, done, cancel: () => cancel() };
};

// writes[filename] = bytes the fake engine publishes for that file (default: what the request expects).
function engine(fs, writes = {}) {
  return {
    requests: [],
    enqueue(options) {
      this.requests.push(options);
      return task(() => {
        const file = options.destination.slice(options.destination.lastIndexOf('/') + 1);
        const size = writes[file] ?? options.expectedBytes ?? 1000;
        // The engine publishes by renaming the partial into place.
        fs.remove(`${options.destination}.part`);
        fs.file(options.destination, size);
        fs.file(`${options.destination}.complete`, 0, 'receipt');
        return { written: size, total: options.expectedBytes ?? size };
      });
    },
  };
}

// files: relative path -> size; receipt: include a completion receipt listing these paths (or `listed`).
function extractor(fs, files, { receipt = true, listed } = {}) {
  return {
    streams: false,
    inspect: ([p]) => ({ kind: /\.zip$|part-\d+\.bin$/.test(p) ? 'zip' : null }),
    extract(options) {
      return task(() => {
        fs.mkdir(options.destination);
        for (const [rel, size] of Object.entries(files)) fs.file(`${options.destination}/${rel}`, size, rel.endsWith('.json') ? JSON.stringify({ titleId: 'PPSA01234' }) : undefined);
        if (receipt) fs.file(`${options.destination}/.ps5-react-extraction`, 0, `P5AR001:1:2\n${(listed ?? Object.keys(files)).map((rel) => `${'a'.repeat(64)}|${rel}`).join('\n')}\n`);
        return { artifacts: Object.keys(files).filter((rel) => /\.(exfat|ffpkg|ffpfs|ffpfsc|pkg)$/i.test(rel)) };
      });
    },
  };
}


// A fake ShadowMount+ 1.7: `images` [{path, source_available, complete, mapped, mounted}], `games`
// {TITLE: {...}} (also its /api/v1/games list), `debugLog` / `kernelLog` text.
function shadowMount(state) {
  return {
    calls: [],
    async request(url, options) {
      const route = url.replace('http://127.0.0.1:10101/api/v1/', '');
      const body = JSON.parse(options.body || '{}');
      // The runtime's one network task: a request waits while a download holds it (state.net).
      while (state.net?.busy) await new Promise((resolve) => state.net.waiters.push(resolve));
      this.calls.push(route);
      if (route === 'games/uninstall') state.onUninstall?.(body);
      if (route === 'games/uninstall' && state.uninstallBusy) return { ok: false, status: 409, json: async () => ({ status: 16, error: 'a game is active or awaiting exit; close the game and try again' }) };
      const reply = (status, value) => ({ ok: status < 400, status, json: async () => value });
      if (route === 'version') return reply(200, { api_version: 1, shadowmount_version: '1.7', capabilities: state.capabilities ?? ['list_images', 'list_games', 'game_info', 'rescan', 'read_debug_log', 'read_kernel_log'] });
      if (route === 'images') return reply(200, { images: state.images });
      if (route === 'games') return reply(200, { games: Object.values(state.games) });
      if (route === 'scan') return reply(200, {});
      if (route === 'debug-log') return reply(200, { content: state.debugLog ?? '' });
      if (route === 'kernel-log') return state.kernelLog === undefined ? reply(500, { error: 'no log' }) : reply(200, { content: state.kernelLog });
      if (route === 'games/info') return state.games[body.title_id] ? reply(200, state.games[body.title_id]) : reply(404, { error: 'unknown title' });
      if (route === 'games/uninstall' || route === 'games/unmount') return reply(200, {});
      return reply(404, {});
    },
  };
}

function queueWith({ fs, downloads, archives, http, firmware }) {
  return createDownloadQueue({
    fs, downloads, http: http ?? shadowMount({ images: [], games: {} }), formats: DownloadFormats, dataDir: '/data/app', platform: 'ps5',
    notifications: { show() {} }, power: { keepAwake() {} }, linking: null,
    sources: { resolve: async (release) => ({ url: release.url }) }, archives, packages: null, wait: async () => {},
    firmware: firmware ?? (() => '13.60'),
  });
}

async function settle(queue, id) {
  for (let i = 0; i < 200; i++) {
    const job = queue.snapshot().find((item) => item.id === id);
    if (job && !BUSY.includes(job.state)) return job;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('job did not settle');
}

const game = { id: 'PPSA01234', titleId: 'PPSA01234', title: 'Test Game' };
const image = (name, sizeBytes = 1000) => ({ id: name, provider: 'host', url: `https://example.com/${name}`, filename: name, sizeBytes });
const param = (fields = {}) => JSON.stringify({ titleId: 'PPSA01234', contentVersion: '01.000.000', requiredSystemSoftwareVersion: '0x1270000000000000', ...fields });

test('a direct image downloads to downloads/images and moves into homebrew only after its check', async () => {
  const fs = memoryFs();
  const downloads = engine(fs);
  const queue = queueWith({ fs, downloads });
  const id = queue.enqueue(game, image('Game.exfat'), '/data');
  const job = await settle(queue, id);
  assert.equal(downloads.requests[0].destination, '/data/downloads/images/Game.exfat');
  assert.equal(job.state, 'downloaded');
  assert.equal(job.artifact.destination, '/data/homebrew/Game.exfat');
  assert.deepEqual(job.artifact.images, ['/data/homebrew/Game.exfat']);
  assert.deepEqual(job.payload, [{ path: '/data/homebrew/Game.exfat', size: 1000 }]);
  assert.ok(fs.exists('/data/homebrew/Game.exfat') && !fs.exists('/data/downloads/images/Game.exfat'));
  assert.ok(fs.exists('/data/homebrew/Game.exfat.complete'), 'the completion receipt moves with the file');
});

test('a truncated image fails, never reaches homebrew, and its staged file is deleted', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs, { 'Game.exfat': 600 }) });
  const id = queue.enqueue(game, image('Game.exfat', 1000), '/data');
  const job = await settle(queue, id);
  assert.equal(job.state, 'failed');
  assert.match(job.error, /failed its check before mounting: Game\.exfat holds 600 of 1000 bytes/);
  assert.match(job.error, /retrying downloads it again/);
  assert.ok(!fs.exists('/data/homebrew/Game.exfat'));
  assert.ok(!fs.exists('/data/downloads/images/Game.exfat'));
});

test('every image of an archive is tracked, base game first', async () => {
  const fs = memoryFs();
  const files = { 'Game-Update-1.05.exfat': 300, 'Game.exfat': 900, 'readme.txt': 10 };
  const queue = queueWith({ fs, downloads: engine(fs), archives: extractor(fs, files) });
  const id = queue.enqueue(game, image('Game.zip', 500), '/data');
  const job = await settle(queue, id);
  assert.equal(job.state, 'downloaded', job.error);
  const dir = '/data/homebrew/Game.zip-extracted';
  assert.deepEqual(job.artifact.images, [`${dir}/Game.exfat`, `${dir}/Game-Update-1.05.exfat`]);
  assert.equal(job.artifact.destination, `${dir}/Game.exfat`);
  assert.deepEqual(job.payload, [{ path: `${dir}/Game.exfat`, size: 900 }, { path: `${dir}/Game-Update-1.05.exfat`, size: 300 }]);
});

test('an image missing from the extraction receipt fails before anything moves into homebrew', async () => {
  const fs = memoryFs();
  const files = { 'Game.exfat': 900, 'Game-Update.exfat': 300 };
  const queue = queueWith({ fs, downloads: engine(fs), archives: extractor(fs, files, { listed: ['Game.exfat'] }) });
  const id = queue.enqueue(game, image('Game.zip', 500), '/data');
  const job = await settle(queue, id);
  assert.equal(job.state, 'failed');
  assert.match(job.error, /Game-Update\.exfat is not in the extraction receipt/);
  assert.ok(!fs.exists('/data/homebrew/Game.zip-extracted'));
});

// An extractor whose game folder gets this param.json (and, optionally, files beside it).
function folderArchive(fs, { paramText = param(), files = { 'Game/eboot.bin': 50, 'Game/sce_module/libc.prx': 20 }, extras = {} } = {}) {
  const archives = extractor(fs, { ...files, 'Game/sce_sys/param.json': 0, ...extras });
  const original = archives.extract;
  archives.extract = (options) => {
    const t = original(options);
    return { ...t, done: t.done.then((r) => { fs.file(`${options.destination}/Game/sce_sys/param.json`, 0, paramText); return r; }) };
  };
  return archives;
}

test('an extracted game folder with an unreadable param.json fails its check', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs), archives: folderArchive(fs, { paramText: '{not json' }) });
  const id = queue.enqueue(game, image('Game.zip', 500), '/data');
  const job = await settle(queue, id);
  assert.equal(job.state, 'failed');
  assert.match(job.error, /sce_sys\/param\.json cannot be read/);
  assert.ok(!fs.exists('/data/homebrew/Game.zip-app'));
});

test('a valid extracted game folder is checked and its payload recorded, with no warnings', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs), archives: folderArchive(fs) });
  const id = queue.enqueue(game, image('Game.zip', 500), '/data');
  const job = await settle(queue, id);
  assert.equal(job.state, 'downloaded', job.error);
  assert.equal(job.artifact.destination, '/data/homebrew/Game.zip-app');
  assert.equal(job.payload[0].path, '/data/homebrew/Game.zip-app/eboot.bin');
  assert.deepEqual(job.warnings, []);
  assert.doesNotMatch(job.message, /Check before playing/);
});

test('a folder needing newer system software, or without sce_module, is handed off with a warning', async () => {
  const fs = memoryFs();
  const archives = folderArchive(fs, { paramText: param({ requiredSystemSoftwareVersion: '0x1300000000000000' }), files: { 'Game/eboot.bin': 50 } });
  const queue = queueWith({ fs, downloads: engine(fs), archives, firmware: () => '12.70' });
  const id = queue.enqueue(game, image('Game.zip', 500), '/data');
  const job = await settle(queue, id);
  assert.equal(job.state, 'downloaded', job.error);
  assert.match(job.message, /^Check before playing: it needs system software 13\.00, and this console runs 12\.70, so it may need a backport; it has no sce_module folder/);
  assert.ok(fs.exists('/data/homebrew/Game.zip-app/eboot.bin'), 'a warning does not block the handoff');
});

test('a folder needing older system software than the console has no firmware warning', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs), archives: folderArchive(fs), firmware: () => '13.6' });
  const job = await settle(queue, queue.enqueue(game, image('Game.zip', 500), '/data'));
  assert.deepEqual(job.warnings, []);
});

test("the archive's other files are kept as -extras outside homebrew, and deleted with the job", async () => {
  const fs = memoryFs();
  const archives = folderArchive(fs, { extras: { 'README - needs backport.txt': 30 } });
  const state = { images: [], games: {} };
  const queue = queueWith({ fs, downloads: engine(fs), archives, http: shadowMount(state) });
  const id = queue.enqueue(game, image('Game.zip', 500), '/data');
  const job = await settle(queue, id);
  const kept = '/data/downloads/extracted/Game.zip-extras';
  assert.equal(job.extras, kept);
  assert.ok(fs.exists(`${kept}/README - needs backport.txt`));
  assert.ok(!fs.exists(`${kept}/.ps5-react-extraction`), 'the extraction receipt is not kept');
  assert.match(job.message, /other files are kept in \/data\/downloads\/extracted\/Game\.zip-extras/);
  await queue.deleteFromDisk(id);
  assert.ok(!fs.exists(kept) && !fs.exists('/data/homebrew/Game.zip-app'));
});

test('an archive holding only the game folder leaves no -extras behind', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs), archives: folderArchive(fs) });
  const job = await settle(queue, queue.enqueue(game, image('Game.zip', 500), '/data'));
  assert.equal(job.extras, undefined);
  assert.ok(!fs.exists('/data/downloads/extracted/Game.zip') && !fs.exists('/data/downloads/extracted/Game.zip-extras'));
});

async function downloadedImage(state, files) {
  const fs = memoryFs();
  const http = shadowMount(state);
  const queue = queueWith({ fs, downloads: engine(fs), archives: files && extractor(fs, files), http });
  const id = queue.enqueue(game, files ? image('Game.zip', 500) : image('Game.exfat'), '/data');
  const job = await settle(queue, id);
  assert.equal(job.state, 'downloaded', job.error);
  return { fs, http, queue, id };
}
// ShadowMount 1.7's record of an installed title at rest: its runtime is not mounted.
const atRest = (path, title = 'PPSA01234', fields = {}) => ({ title_id: title, path, runtime_path: path, source_type: 'image', installed: true, managed: true, mounted: false, source_available: true, ...fields });
const listed = (path, fields = {}) => ({ path, mount_point: '', complete: true, source_available: true, mapped: true, mounted: false, ...fields });

test('a title at rest (runtime not mounted) counts as installed', async () => {
  const state = { images: [], games: {} };
  const { queue, id } = await downloadedImage(state);
  state.games.PPSA01234 = atRest('/data/homebrew/Game.exfat');
  assert.equal(await queue.syncInstalls(id), true);
  const job = queue.snapshot()[0];
  assert.equal(job.state, 'installed');
  assert.equal(job.installedTitleId, 'PPSA01234');
  assert.equal(job.error, '');
});

test('files ShadowMount cannot reach need attention, and a later check moves it on', async () => {
  const state = { images: [], games: {} };
  const { queue, id } = await downloadedImage(state);
  state.games.PPSA01234 = atRest('/data/homebrew/Game.exfat', 'PPSA01234', { source_available: false });
  assert.equal(await queue.syncInstalls(id), false);
  let job = queue.snapshot()[0];
  assert.equal(job.state, 'attention');
  assert.match(job.error, /cannot reach the files of PPSA01234/);
  state.games.PPSA01234.source_available = true;
  assert.equal(await queue.syncInstalls(id), true);
  job = queue.snapshot()[0];
  assert.equal(job.state, 'installed');
  assert.equal(job.error, '');
});

test('a title ShadowMount does not manage needs attention', async () => {
  const state = { images: [], games: {} };
  const { queue, id } = await downloadedImage(state);
  state.games.PPSA01234 = atRest('/data/homebrew/Game.exfat', 'PPSA01234', { managed: false });
  await queue.syncInstalls(id);
  assert.equal(queue.snapshot()[0].state, 'attention');
  assert.match(queue.snapshot()[0].error, /does not manage PPSA01234/);
});

test('an older ShadowMount that sends no source_available is not held to it', async () => {
  const state = { images: [], games: {} };
  const { queue, id } = await downloadedImage(state);
  const record = atRest('/data/homebrew/Game.exfat');
  delete record.source_available;
  state.games.PPSA01234 = record;
  assert.equal(await queue.syncInstalls(id), true);
});

test('a set counts as installed once every image is complete and registered, mapped through /api/v1/games', async () => {
  const state = { images: [], games: {} };
  const dir = '/data/homebrew/Game.zip-extracted';
  const { queue, id } = await downloadedImage(state, { 'Game.exfat': 900, 'Game-DLC.exfat': 300 });
  state.games.PPSA01234 = atRest(`${dir}/Game.exfat`);
  // The add-on is not scanned yet: waiting.
  state.images = [listed(`${dir}/Game.exfat`)];
  assert.equal(await queue.syncInstalls(id), false);
  let job = queue.snapshot()[0];
  assert.equal(job.state, 'downloaded');
  assert.match(job.message, /finish 1 more image of this set/);
  // Scanned but still being checked: waiting.
  state.images.push(listed(`${dir}/Game-DLC.exfat`, { complete: false, mapped: false }));
  assert.equal(await queue.syncInstalls(id), false);
  assert.equal(queue.snapshot()[0].state, 'downloaded');
  // Registered under its own title: installed, with both titles.
  state.images[1] = listed(`${dir}/Game-DLC.exfat`);
  state.games.PPSA05678 = atRest(`${dir}/Game-DLC.exfat`, 'PPSA05678');
  assert.equal(await queue.syncInstalls(id), true);
  job = queue.snapshot()[0];
  assert.equal(job.state, 'installed');
  assert.deepEqual(job.installedTitles, ['PPSA01234', 'PPSA05678']);
});

test("an image of a set ShadowMount cannot reach needs attention; one it skipped (shared title ID) does not", async () => {
  const state = { images: [], games: {} };
  const dir = '/data/homebrew/Game.zip-extracted';
  const { queue, id } = await downloadedImage(state, { 'Game.exfat': 900, 'Game-Update.exfat': 300 });
  state.games.PPSA01234 = atRest(`${dir}/Game.exfat`);
  state.images = [listed(`${dir}/Game.exfat`), listed(`${dir}/Game-Update.exfat`, { source_available: false })];
  await queue.syncInstalls(id);
  assert.equal(queue.snapshot()[0].state, 'attention');
  assert.match(queue.snapshot()[0].error, /cannot reach Game-Update\.exfat/);
  // Reachable, scanned, but no title registered from it: ShadowMount keeps one source per title ID.
  state.images[1] = listed(`${dir}/Game-Update.exfat`);
  assert.equal(await queue.syncInstalls(id), true);
  const job = queue.snapshot()[0];
  assert.equal(job.state, 'installed');
  assert.match(job.message, /did not register Game-Update\.exfat: it keeps one source per title ID/);
});

test('without list_games a set is checked by its first title only', async () => {
  const state = { images: [], games: {}, capabilities: ['game_info'] };
  const dir = '/data/homebrew/Game.zip-extracted';
  const { http, queue, id } = await downloadedImage(state, { 'Game.exfat': 900, 'Game-Update.exfat': 300 });
  state.games.PPSA01234 = atRest(`${dir}/Game.exfat`);
  assert.equal(await queue.syncInstalls(id), true);
  assert.ok(!http.calls.includes('games'));
});

test('a payload that changed after its check is never marked installed', async () => {
  const state = { images: [], games: {} };
  const { fs, queue, id } = await downloadedImage(state);
  fs.file('/data/homebrew/Game.exfat', 10);
  state.games.PPSA01234 = atRest('/data/homebrew/Game.exfat');
  assert.equal(await queue.syncInstalls(id), false);
  const job = queue.snapshot()[0];
  assert.equal(job.state, 'downloaded');
  assert.match(job.error, /Game\.exfat is now 10 bytes, it was 1000 when checked/);
});

test('a queue saved with the earlier "unmounted" state is checked again', async () => {
  const fs = memoryFs();
  const artifact = DownloadFormats.artifact(image('Game.exfat'), '/data');
  fs.file('/data/homebrew/Game.exfat', 1000);
  fs.file('/data/app/JobeesLair/downloads.json', 0, JSON.stringify({ version: 1, jobs: [{
    id: 'PPSA01234/Game.exfat', gameId: 'PPSA01234', titleId: 'PPSA01234', title: 'Test Game', release: image('Game.exfat'), root: '/data',
    artifact, state: 'unmounted', error: 'PPSA01234 is installed but not mounted', message: 'x', written: 1000, total: 1000 }] }));
  const state = { images: [], games: { PPSA01234: atRest('/data/homebrew/Game.exfat') } };
  const queue = queueWith({ fs, downloads: engine(fs), http: shadowMount(state) });
  assert.equal(queue.snapshot()[0].state, 'downloaded');
  assert.equal(queue.snapshot()[0].error, '');
  assert.equal(await queue.syncInstalls(), true);
  assert.equal(queue.snapshot()[0].state, 'installed');
});

test('a split set with a volume cut short fails and deletes that volume', async () => {
  const fs = memoryFs();
  const release = { id: 'set', provider: 'host', filename: 'Game', parts: [1, 2].map((number) => ({ number, sources: [{ url: `https://example.com/Game.part${number}.rar`, sizeBytes: 100 }] })) };
  const queue = queueWith({ fs, downloads: engine(fs, { 'part-2.bin': 40 }), archives: extractor(fs, { 'Game.exfat': 150 }) });
  const id = queue.enqueue(game, release, '/data');
  const job = await settle(queue, id);
  assert.equal(job.state, 'failed');
  assert.match(job.error, /Part 2 of 2: part-2\.bin holds 40 of 100 bytes/);
  assert.ok(fs.exists('/data/downloads/sets/Game/part-1.bin'));
  assert.ok(!fs.exists('/data/downloads/sets/Game/part-2.bin'));
  assert.equal(job.parts[1].completed, false);
});

test('a complete split set extracts and tracks its image', async () => {
  const fs = memoryFs();
  const release = { id: 'set', provider: 'host', filename: 'Game', parts: [1, 2].map((number) => ({ number, sources: [{ url: `https://example.com/Game.part${number}.rar`, sizeBytes: 100 }] })) };
  const queue = queueWith({ fs, downloads: engine(fs), archives: extractor(fs, { 'Game.exfat': 150 }) });
  const id = queue.enqueue(game, release, '/data');
  const job = await settle(queue, id);
  assert.equal(job.state, 'downloaded', job.error);
  assert.deepEqual(job.artifact.images, ['/data/homebrew/Game-extracted/Game.exfat']);
});

test('a leftover staged image blocks a new download of the same name', () => {
  const fs = memoryFs();
  fs.file('/data/downloads/images/Game.exfat', 1000);
  const queue = queueWith({ fs, downloads: engine(fs) });
  assert.throws(() => queue.enqueue(game, image('Game.exfat'), '/data'), /Destination already exists/);
});

test('a partial an older build started in homebrew keeps downloading in place', async () => {
  const fs = memoryFs();
  fs.file('/data/homebrew/Game.exfat.part', 400);
  const downloads = engine(fs);
  const queue = queueWith({ fs, downloads });
  const job = await settle(queue, queue.enqueue(game, image('Game.exfat'), '/data'));
  assert.equal(downloads.requests[0].destination, '/data/homebrew/Game.exfat');
  assert.equal(job.state, 'downloaded', job.error);
});

test('an image published before the queue was saved is picked up in place, not downloaded again', async () => {
  const fs = memoryFs();
  const artifact = DownloadFormats.artifact(image('Game.exfat'), '/data');
  fs.file('/data/homebrew/Game.exfat', 1000);
  fs.file('/data/homebrew/Game.exfat.complete', 0, 'receipt');
  const info = fs.stat('/data');
  fs.file('/data/app/JobeesLair/downloads.json', 0, JSON.stringify({ version: 1, jobs: [{
    id: 'PPSA01234/Game.exfat', gameId: 'PPSA01234', titleId: 'PPSA01234', title: 'Test Game', release: image('Game.exfat'),
    root: '/data', rootIdentity: `${info.device}:${info.inode}`, artifact, downloadDestination: '/data/downloads/images/Game.exfat',
    state: 'queued', written: 1000, total: 1000, error: '' }] }));
  const downloads = engine(fs);
  const queue = queueWith({ fs, downloads });
  const job = await settle(queue, 'PPSA01234/Game.exfat');
  assert.equal(downloads.requests[0].destination, '/data/homebrew/Game.exfat');
  assert.equal(job.state, 'downloaded', job.error);
});

test('deleting a set also uninstalls its add-on title', async () => {
  const state = { images: [], games: {} };
  const dir = '/data/homebrew/Game.zip-extracted';
  const { fs, http, queue, id } = await downloadedImage(state, { 'Game.exfat': 900, 'Game-DLC.exfat': 300 });
  state.images = [listed(`${dir}/Game.exfat`), listed(`${dir}/Game-DLC.exfat`)];
  state.games.PPSA01234 = atRest(`${dir}/Game.exfat`);
  state.games.PPSA05678 = atRest(`${dir}/Game-DLC.exfat`, 'PPSA05678');
  assert.equal(await queue.syncInstalls(id), true);
  await queue.deleteFromDisk(id);
  assert.deepEqual(http.calls.filter((route) => route === 'games/uninstall').length, 2);
  assert.ok(!fs.exists(dir));
  assert.equal(queue.snapshot().length, 0);
});

// "Why won't it start?", on excerpts of a real ShadowMount+ 1.7 log from this console.
const fixture = (name) => readFileSync(new URL(`./fixtures/fixture-${name}.log`, import.meta.url), 'utf8');

test('diagnosis: a launch whose sandbox was built but whose game never started', () => {
  const result = diagnoseLaunch({ title: 'PPSA24588', debug: fixture('notstarted'), kernel: '', version: '1.7-beta5fix1' });
  assert.equal(result.verdict.key, 'notStarted');
  assert.match(result.verdict.text, /never started: the console refused to run its eboot\.bin or one of its modules/);
  assert.equal(result.launches, 1);
  assert.ok(result.lines.some((line) => line.includes('sandbox ready handled: PPSA24588')));
  assert.ok(!result.lines.some((line) => line.includes('PPSA15573')), "another title's lines are left out");
});

test('diagnosis: a game that started and ran', () => {
  const result = diagnoseLaunch({ title: 'PPSA99058', debug: fixture('started'), kernel: null });
  assert.equal(result.verdict.key, 'ran');
  assert.equal(result.kernelRead, false);
});

test('diagnosis: a game that started and then hit a module-load error', () => {
  const debug = `${fixture('started')}\n[01:40:14]   [MDBG] module load error: PPSA99058 pid=102 libSceAmpr.sprx (0x80020002)\n`;
  const result = diagnoseLaunch({ title: 'PPSA99058', debug, kernel: '' });
  assert.equal(result.verdict.key, 'crashed');
  assert.match(result.verdict.text, /started, then failed: \[MDBG\] module load error: PPSA99058 pid=102 libSceAmpr\.sprx/);
});

test('diagnosis: a title ShadowMount could not register', () => {
  const result = diagnoseLaunch({ title: 'PPSA15573', debug: fixture('register'), kernel: '' });
  assert.equal(result.verdict.key, 'notRegistered');
});

test('diagnosis: nothing in the log', () => {
  assert.equal(diagnoseLaunch({ title: 'PPSA00001', debug: fixture('started'), kernel: '' }).verdict.key, 'noLog');
});

test('diagnose() reads both logs through the API and keeps the kernel lines about the title or its modules', async () => {
  const state = { images: [], games: {}, debugLog: fixture('notstarted'), kernelLog: 'boot\n[PPSA24588] failed to load eboot.bin: 0x80020002\nunrelated line\nload sce_module/libc.prx\n' };
  const { queue, id, http } = await downloadedImage(state);
  const result = await queue.diagnose(id);
  assert.ok(http.calls.includes('debug-log') && http.calls.includes('kernel-log'));
  assert.equal(result.verdict.key, 'noLog', 'the job is PPSA01234, not the fixture title');
  assert.deepEqual(result.kernel, ['load sce_module/libc.prx'], "a loader line naming another title is not this one's");
  const other = diagnoseLaunch({ title: 'PPSA24588', debug: state.debugLog, kernel: state.kernelLog });
  assert.deepEqual(other.kernel, ['[PPSA24588] failed to load eboot.bin: 0x80020002', 'load sce_module/libc.prx']);
});

test('diagnose() without a kernel-log capability reads only the debug log', async () => {
  const state = { images: [], games: {}, debugLog: '', capabilities: ['read_debug_log'] };
  const { queue, id, http } = await downloadedImage(state);
  const result = await queue.diagnose(id);
  assert.ok(!http.calls.includes('kernel-log'));
  assert.equal(result.kernelRead, false);
});

// ---- 0.1.1 beta 1: readiness ladder, launches, backports, source rows, firmware, versions ----

test('readiness: every queue state lands on one of the five stages', () => {
  const at = (state, extra = {}) => readinessOf({ state, artifact: { nextAction: 'shadowmount' }, ...extra });
  for (const state of ['queued', 'resolving', 'connecting', 'downloading', 'pausing', 'paused', 'failed', 'awaiting-browser']) assert.equal(at(state).stage, 'downloading', state);
  for (const state of ['verifying', 'extracting', 'installing', 'downloaded', 'installer-required', 'extraction-required', 'extracted', 'file-downloaded', 'removing']) assert.equal(at(state).stage, 'preparing', state);
  assert.equal(at('installed').stage, 'installed');
  assert.equal(readinessText(at('installed')), 'Installed · Not played yet');
  assert.equal(at('installed', { launch: { outcome: 'played' } }).stage, 'played');
  const wont = at('installed', { launch: { outcome: 'wontStart' } });
  assert.deepEqual([wont.stage, wont.tone, wont.action], ['wontStart', 'bad', 'seeWhy']);
  assert.equal(readinessText(wont), "Won't start · It did not start last time");
  assert.deepEqual([at('attention').stage, at('attention').action], ['wontStart', 'checkAgain']);
  assert.equal(at('failed').tone, 'bad', 'a stopped download is red');
  assert.equal(at('paused').tone, 'accent', 'a paused one is not');
  assert.equal(at('installed', { role: 'backport' }).note, 'ready.note.backport');
});

test("readiness: a card speaks for the game's own job, and for what needs the gamer most", () => {
  const job = (state, extra = {}) => ({ state, artifact: { nextAction: 'shadowmount' }, ...extra });
  assert.equal(cardReadiness([job('installed', { role: 'backport' }), job('downloading')]).stage, 'downloading');
  assert.equal(cardReadiness([job('downloading', { role: 'backport' }), job('installed', { launch: { outcome: 'played' } })]).stage, 'played');
  assert.equal(cardReadiness([job('installed'), job('installed', { launch: { outcome: 'wontStart' } })]).stage, 'wontStart');
  assert.equal(cardReadiness([]), null);
});

test('launch outcomes: the real PPSA24588 launch is "wontStart", a launch that started is "played"', () => {
  const plain = (outcomes) => Object.fromEntries(Object.entries(outcomes).map(([title, { outcome, verdict }]) => [title, { outcome, verdict }]));
  assert.deepEqual(plain(launchOutcomes(fixture('notstarted'))), { PPSA24588: { outcome: 'wontStart', verdict: 'notStarted' } });
  assert.deepEqual(plain(launchOutcomes(fixture('started'))), { PPSA99058: { outcome: 'played', verdict: 'ran' } });
  assert.match(launchOutcomes(fixture('notstarted')).PPSA24588.mark, /launch mount ready: PPSA24588/, 'each outcome is marked with its launch');
  assert.deepEqual(launchOutcomes(''), {});
});

test("the queue learns launches from ShadowMount's log, shows them on installed jobs, and keeps them", async () => {
  const state = { images: [], games: {}, debugLog: '' };
  const { fs, queue, id } = await downloadedImage(state);
  state.games.PPSA01234 = atRest('/data/homebrew/Game.exfat');
  await queue.syncInstalls(id);
  assert.equal(queue.snapshot()[0].launch, null, 'no launch logged yet');
  state.debugLog = fixture('notstarted').replaceAll('PPSA24588', 'PPSA01234');
  assert.equal(await queue.refreshLaunches(), true);
  assert.deepEqual([queue.snapshot()[0].launch.outcome, readinessOf(queue.snapshot()[0]).stage], ['wontStart', 'wontStart']);
  // The log rotates away; what was learned stays (launches.json beside the queue).
  state.debugLog = '';
  assert.equal(await queue.refreshLaunches(), false);
  assert.equal(queue.snapshot()[0].launch.outcome, 'wontStart');
  assert.equal(JSON.parse(fs.readFile('/data/app/JobeesLair/launches.json')).titles.PPSA01234.verdict, 'notStarted');
  // A later launch that started turns it to Played.
  state.debugLog = fixture('started').replaceAll('PPSA99058', 'PPSA01234');
  await queue.refreshLaunches();
  assert.equal(readinessOf(queue.snapshot()[0]).stage, 'played');
});

// A backport archive: a folder named for the title, which carries an eboot.bin and a param.json too.
function backportArchive(fs, files = { 'PPSA01234/eboot.bin': 40, 'PPSA01234/sce_sys/param.json': 0, 'PPSA01234/fakelib/libSceAmpr.sprx': 10, 'README.txt': 5 }) {
  return extractor(fs, files);
}
const backportRelease = (name = 'Game-Backport.zip') => ({ ...image(name, 500), label: 'USA Backport (v01.10) - Direct' });

test('a backport goes to homebrew/backports/<TITLE_ID>/, never where games are scanned', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs), archives: backportArchive(fs) });
  const job = await settle(queue, queue.enqueue(game, backportRelease(), '/data'));
  assert.equal(job.role, 'backport');
  assert.equal(job.state, 'installed', job.error);
  assert.equal(job.artifact.nextAction, 'backport');
  assert.equal(job.artifact.destination, '/data/homebrew/backports/PPSA01234');
  assert.ok(fs.exists('/data/homebrew/backports/PPSA01234/fakelib/libSceAmpr.sprx'));
  assert.ok(!fs.exists('/data/homebrew/Game-Backport.zip-app'), 'not registered as a second copy of the game');
  assert.ok(fs.exists('/data/downloads/extracted/Game-Backport.zip-extras/README.txt'), "the archive's notes are kept");
  assert.match(job.message, /Backport for PPSA01234 is in place/);
  assert.equal(readinessOf(job).stage, 'installed');
  await queue.deleteFromDisk(job.id);
  assert.ok(!fs.exists('/data/homebrew/backports/PPSA01234'));
});

test('a backport archive with its files at the top goes to backports/<TITLE_ID>/ as a whole', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs), archives: backportArchive(fs, { 'eboot.bin': 40, 'sce_module/libc.prx': 10 }) });
  const job = await settle(queue, queue.enqueue(game, backportRelease(), '/data'));
  assert.equal(job.state, 'installed', job.error);
  assert.ok(fs.exists('/data/homebrew/backports/PPSA01234/eboot.bin') && fs.exists('/data/homebrew/backports/PPSA01234/sce_module/libc.prx'));
  assert.ok(!fs.exists('/data/homebrew/backports/PPSA01234/.ps5-react-extraction'));
});

test('a backport already in place is not overwritten', async () => {
  const fs = memoryFs();
  fs.file('/data/homebrew/backports/PPSA01234/old.sprx', 10);
  const queue = queueWith({ fs, downloads: engine(fs), archives: backportArchive(fs) });
  const job = await settle(queue, queue.enqueue(game, backportRelease(), '/data'));
  assert.equal(job.state, 'failed');
  assert.match(job.error, /already in \/data\/homebrew\/backports\/PPSA01234/);
  assert.ok(fs.exists('/data/homebrew/backports/PPSA01234/old.sprx'));
});

test('a backport that is a disk image stays out of homebrew', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs) });
  const job = await settle(queue, queue.enqueue(game, { ...image('Game-Backport.exfat'), label: 'Backport' }, '/data'));
  assert.equal(job.state, 'file-downloaded');
  assert.ok(!fs.exists('/data/homebrew/Game-Backport.exfat'));
  assert.match(job.message, /disk image/);
});

test('source rows lead with what the gamer gets: format, region, version', () => {
  const row = describeSource({ provider: 'VikingFile', format: 'exfat', label: 'USA Base (v01.10) - VikingFile', sizeBytes: 22e9 });
  assert.equal(row.name, 'Disk image · USA v1.10');
  assert.match(row.detail, /^VikingFile/);
  assert.equal(row.host, 'VikingFile');
  assert.equal(describeSource({ provider: '1fichier.com', format: 'binary', label: 'EUR Base (v01.28) - Direct' }).name, 'Format unknown until downloaded · EUR v1.28');
  assert.equal(describeSource({ provider: 'MediaFire', format: 'rar', label: 'Backport (v01.00)', version: '01.02' }).name, 'Archive · v1.2');
  assert.match(describeSource({ provider: 'MediaFire', format: 'rar', label: 'USA Backport' }).detail, /Backport/);
});

test('disk images are recommended over archives and unknown formats; backports get their own section', () => {
  const releases = [
    { id: 'a', provider: 'gofile.io', format: 'binary', label: 'USA Base', url: 'https://gofile.io/d/x', health: 'ok' },
    { id: 'b', provider: 'gofile.io', format: 'rar', label: 'USA Base', url: 'https://gofile.io/d/y', health: 'ok' },
    { id: 'c', provider: 'gofile.io', format: 'ffpfsc', label: 'USA Base', url: 'https://gofile.io/d/z', health: 'ok' },
    { id: 'd', provider: 'gofile.io', format: 'exfat', label: 'USA Backport', url: 'https://gofile.io/d/w', health: 'ok' },
  ];
  assert.equal(releases[preferredRelease(releases)].id, 'c');
  const sections = sourceSections(releases);
  assert.deepEqual(sections.find((section) => section.group === 'backport').items.map(({ release }) => release.id), ['d']);
  assert.ok(!sections.filter((section) => section.group !== 'backport').some(({ items }) => items.some(({ release }) => release.id === 'd')));
});

test("backport tag: the game's required system software against the console's", () => {
  const fs = memoryFs();
  fs.file('/user/app/PPSA24588/sce_sys/param.json', 0, param({ titleId: 'PPSA24588', requiredSystemSoftwareVersion: '0x1270000000000000' }));
  const advice = (firmware, titleId = 'PPSA24588', jobs = []) => backportAdvice({ fs, titleId, firmware, jobs });
  assert.deepEqual([advice('13.60').key, advice('13.60').text], ['notNeeded', 'Not needed on your console: the game needs system software 12.70, and you have 13.60.']);
  assert.equal(advice('12.70').key, 'notNeeded');
  assert.equal(advice('11.0').key, 'recommended');
  assert.match(advice('11.0').text, /^Backport recommended: the game needs system software 12\.70, and you have 11\.00\./);
  assert.equal(advice('13.60', 'PPSA00001').key, 'unknown', 'not installed or downloaded');
  assert.equal(advice(null).key, 'unknown', 'console firmware not known');
  // A downloaded (not yet installed) game folder answers too.
  fs.file('/data/homebrew/Game.zip-app/sce_sys/param.json', 0, param({ requiredSystemSoftwareVersion: '0x1400000000000000' }));
  assert.equal(advice('13.60', 'PPSA01234', [{ titleId: 'PPSA01234', artifact: { destination: '/data/homebrew/Game.zip-app' } }]).key, 'recommended');
});

test('versions: 0.1.1 beta 1 is newer than 0.1.0, older than 0.1.1 and beta 2', () => {
  assert.equal(newer('0.1.1-beta.1', '0.1.0'), true);
  assert.equal(newer('v0.1.1', '0.1.1-beta.1'), true, 'the release over its own pre-release');
  assert.equal(newer('0.1.1-beta.2', '0.1.1-beta.1'), true);
  assert.equal(newer('0.1.1-beta.10', '0.1.1-beta.9'), true);
  assert.equal(newer('0.1.1-beta.1', '0.1.1'), false);
  assert.equal(newer('0.1.1-beta.1', '0.1.1-beta.1'), false);
  assert.equal(newer('0.1.1 beta 1', '0.1.0'), false, 'a label with spaces is not a version');
});

// ---- 0.1.1 beta 2: Delete from disk everywhere, the library's entries, backports listed one by one ----

// Every file (not folder) left under the queue's folders.
const leftovers = (fs) => [...fs.nodes.keys()].filter((p) => /^\/data\/(downloads|homebrew)\//.test(p) && !fs.nodes.get(p).dir);

test('Delete from disk on a finished archive takes every image, the extracted folder and its sidecars', async () => {
  const state = { images: [], games: {} };
  const { fs, queue, id } = await downloadedImage(state, { 'Game.exfat': 900, 'Game-Update.exfat': 300 });
  assert.ok(leftovers(fs).length >= 2);
  await queue.deleteFromDisk(id);
  assert.deepEqual(leftovers(fs), []);
  assert.equal(queue.snapshot().length, 0);
});

test('Delete from disk takes a download that failed after extracting, with what it extracted', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs), archives: folderArchive(fs, { paramText: '{not json' }) });
  const job = await settle(queue, queue.enqueue(game, image('Game.zip', 500), '/data'));
  assert.equal(job.state, 'failed');
  assert.ok(leftovers(fs).length > 0, 'the failed extraction left files');
  await queue.deleteFromDisk(job.id);
  assert.deepEqual(leftovers(fs), []);
  assert.equal(queue.snapshot().length, 0);
});

test('a download that is running is not deleted from disk: it is cancelled instead', async () => {
  const fs = memoryFs();
  const hanging = { enqueue: () => ({ subscribe: () => () => {}, done: new Promise(() => {}), cancel() {} }) };
  const queue = queueWith({ fs, downloads: hanging });
  const id = queue.enqueue(game, image('Game.exfat'), '/data');
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(BUSY.includes(queue.snapshot()[0].state));
  await assert.rejects(queue.deleteFromDisk(id), /still downloading/);
  assert.equal(queue.snapshot().length, 1);
});

test("deleting a game clears its launch history; the log's old launch is not learned again, a new one is", async () => {
  const state = { images: [], games: {}, debugLog: '' };
  const { fs, queue, id } = await downloadedImage(state);
  state.games.PPSA01234 = atRest('/data/homebrew/Game.exfat');
  await queue.syncInstalls(id);
  state.debugLog = fixture('notstarted').replaceAll('PPSA24588', 'PPSA01234');
  await queue.refreshLaunches();
  assert.equal(readinessOf(queue.snapshot()[0]).stage, 'wontStart');
  await queue.deleteFromDisk(id);
  assert.equal(queue.snapshot().length, 0);
  // Downloaded again: the same old launch is still in ShadowMount's log.
  const again = await settle(queue, queue.enqueue(game, image('Game.exfat'), '/data'));
  assert.equal(again.state, 'downloaded', again.error);
  await queue.syncInstalls(again.id);
  await queue.refreshLaunches();
  assert.equal(readinessText(readinessOf(queue.snapshot()[0])), 'Installed · Not played yet');
  assert.ok('forgotten' in JSON.parse(fs.readFile('/data/app/JobeesLair/launches.json')).titles.PPSA01234);
  // A launch after that counts.
  state.debugLog += `\n${fixture('started').replaceAll('PPSA99058', 'PPSA01234')}`;
  await queue.refreshLaunches();
  assert.equal(readinessOf(queue.snapshot()[0]).stage, 'played');
});

test("a job's kept notes are deleted alone, the game stays", async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs), archives: folderArchive(fs, { extras: { 'README.txt': 30 } }) });
  const job = await settle(queue, queue.enqueue(game, image('Game.zip', 500), '/data'));
  await queue.deleteExtras(job.id);
  assert.ok(!fs.exists('/data/downloads/extracted/Game.zip-extras'));
  assert.ok(fs.exists('/data/homebrew/Game.zip-app/eboot.bin'));
  assert.equal(queue.snapshot()[0].extras, undefined);
});

test('the library: one entry per game (its backport with it), FTP copies too, the game that will not start first', () => {
  const done = (gameId, extra = {}) => ({ id: `${gameId}/${extra.role ?? 'game'}`, gameId, title: gameId, root: '/data', state: 'installed', total: 100, artifact: { nextAction: 'shadowmount', destination: `/data/homebrew/${gameId}.exfat` }, ...extra });
  const jobs = [
    done('PPSA00001', { launch: { outcome: 'played' } }),
    done('PPSA00001', { role: 'backport', artifact: { nextAction: 'backport', destination: '/data/homebrew/backports/PPSA00001' }, backportPath: '/data/homebrew/backports/PPSA00001', total: 5 }),
    done('PPSA00002', { launch: { outcome: 'wontStart' } }),
    { ...done('PPSA00003'), state: 'downloading' },
  ];
  const files = [
    { kind: 'images', path: '/data/homebrew/PPSA00001.exfat', name: 'PPSA00001.exfat', size: 100, titleId: 'PPSA00001', root: '/data', installed: true },
    { kind: 'images', path: '/data/homebrew/PPSA00009-copy', name: 'PPSA00009-copy', size: 70, titleId: 'PPSA00009', root: '/data', installed: true },
    { kind: 'other', backport: true, path: '/data/homebrew/backports/PPSA00001', name: 'PPSA00001', size: 5, titleId: 'PPSA00001', root: '/data' },
  ];
  const catalog = { PPSA00001: { id: 'PPSA00001', title: 'One', art: {} }, PPSA00002: { id: 'PPSA00002', title: 'Two', art: {} } };
  const entries = shelfEntries({ jobs, files, gameOf: (id) => catalog[id] });
  assert.deepEqual(entries.map((entry) => entry.key), ['PPSA00002', 'PPSA00001', 'PPSA00009']);
  const [two, one, copy] = entries;
  assert.deepEqual([two.ready.stage, two.action.name], ['wontStart', 'seeWhy']);
  assert.deepEqual([one.ready.stage, one.jobs.length, one.files.length, one.size, one.action.name], ['played', 2, 0, 105, 'gamePage']);
  assert.equal(one.job.role, undefined, "the game's own job speaks for it, not its backport");
  assert.deepEqual([copy.game.title, copy.ready.stage, copy.catalog, copy.action, copy.files.length], ['PPSA00009-copy', 'installed', false, null, 1]);
  assert.ok(!entries.some((entry) => entry.key === 'PPSA00003'), 'a download still running is in Downloads, not the library');
});

test('Files lists each backport on its own, never the whole backports folder', () => {
  const fs = memoryFs();
  fs.file('/data/homebrew/Game.exfat', 100);
  fs.file('/data/homebrew/backports/PPSA00001/fakelib/a.sprx', 10);
  fs.file('/data/homebrew/backports/PPSA00002/eboot.bin', 20);
  const files = scanDrive(fs, '/data');
  assert.ok(!files.some((file) => file.path === '/data/homebrew/backports'));
  assert.deepEqual(files.filter((file) => file.backport).map((file) => [file.path, file.titleId, file.size]).sort(), [
    ['/data/homebrew/backports/PPSA00001', 'PPSA00001', 10],
    ['/data/homebrew/backports/PPSA00002', 'PPSA00002', 20]
  ]);
  assert.equal(files.find((file) => file.name === 'Game.exfat').kind, 'images');
});

test('versions: 0.1.1 beta 2 is newer than beta 1 and older than 0.1.1', () => {
  assert.equal(newer('0.1.1-beta.2', '0.1.1-beta.1'), true);
  assert.equal(newer('v0.1.1', '0.1.1-beta.2'), true);
  assert.equal(newer('0.1.1-beta.1', '0.1.1-beta.2'), false);
});

test("a failed card's X (cancel) deletes what the download put on the drive, archive and extraction included", async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs), archives: folderArchive(fs, { paramText: '{not json' }) });
  const job = await settle(queue, queue.enqueue(game, image('Game.zip', 500), '/data'));
  assert.equal(job.state, 'failed');
  await queue.cancel(job.id);
  assert.deepEqual(leftovers(fs), []);
  assert.equal(queue.snapshot().length, 0);
});

test('a stopped image download never deletes a homebrew file of the same name it did not publish', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs, { 'Game.exfat': 600 }) });
  const job = await settle(queue, queue.enqueue(game, image('Game.exfat', 1000), '/data'));
  assert.equal(job.state, 'failed');
  // Copied over FTP after the download started (the queue refuses to start over an existing file).
  fs.file('/data/homebrew/Game.exfat', 777);
  await queue.deleteFromDisk(job.id);
  assert.ok(fs.exists('/data/homebrew/Game.exfat'), "someone else's copy stays");
  assert.equal(queue.snapshot().length, 0);
});

// ---- 0.1.1 beta 3: deleting while a download runs, and while ShadowMount refuses to uninstall ----

// An engine whose first image downloads at once and whose later ones hold the runtime's one network task
// (state.net) until cancelled, like a large file on the console.
function sharedEngine(fs, net) {
  const quick = engine(fs);
  return {
    requests: [],
    hold: false,
    enqueue(options) {
      this.requests.push(options);
      if (!this.hold) return quick.enqueue(options);
      net.busy = true;
      let reject;
      const done = new Promise((_, fail) => { reject = fail; });
      done.catch(() => {});
      return {
        subscribe: () => () => {},
        done,
        cancel() {
          net.busy = false;
          for (const waiter of net.waiters.splice(0)) waiter();
          reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
        },
      };
    },
  };
}
const within = (promise, ms, what) => Promise.race([promise, new Promise((_, fail) => setTimeout(() => fail(new Error(`${what} did not finish within ${ms} ms`)), ms))]);
const other = { id: 'PPSA05678', titleId: 'PPSA05678', title: 'Big Game' };

async function installedWhileAnotherDownloads(extra = {}) {
  const net = { busy: false, waiters: [] };
  const state = { images: [], games: {}, net, ...extra };
  const fs = memoryFs();
  const http = shadowMount(state);
  const downloads = sharedEngine(fs, net);
  const queue = queueWith({ fs, downloads, http });
  const first = await settle(queue, queue.enqueue(game, image('Game.exfat'), '/data'));
  state.games.PPSA01234 = atRest('/data/homebrew/Game.exfat');
  await queue.syncInstalls(first.id);
  assert.equal(queue.snapshot()[0].state, 'installed');
  downloads.hold = true;
  const big = queue.enqueue(other, image('Big.exfat', 5e9), '/data');
  for (let i = 0; i < 50 && !net.busy; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(net.busy, 'the second download holds the network');
  return { fs, http, state, net, downloads, queue, first, big };
}

test('Delete from disk while another download runs: it pauses, ShadowMount answers, the files go, it resumes', async () => {
  const { fs, http, net, downloads, queue, first, big } = await installedWhileAnotherDownloads();
  const result = await within(queue.deleteFromDisk(first.id), 2000, 'the delete');
  assert.deepEqual(result, { note: null });
  assert.ok(!fs.exists('/data/homebrew/Game.exfat') && !fs.exists('/data/homebrew/Game.exfat.complete'));
  assert.ok(http.calls.includes('games/uninstall'));
  assert.ok(!queue.snapshot().some((job) => job.id === first.id));
  for (let i = 0; i < 50 && downloads.requests.length < 3; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(downloads.requests.length, 3, 'the paused download started again');
  assert.ok(net.busy);
  assert.ok(BUSY.includes(queue.snapshot().find((job) => job.id === big).state));
});

test("ShadowMount refusing to uninstall while Jobee'sLair runs (EBUSY): the files still go first, the task goes, a note says why", async () => {
  let onDiskAtUninstall = null;
  const { fs, queue, first, state } = await installedWhileAnotherDownloads({ uninstallBusy: true });
  state.onUninstall = () => { onDiskAtUninstall = fs.exists('/data/homebrew/Game.exfat'); };
  const { note } = await within(queue.deleteFromDisk(first.id), 2000, 'the delete');
  assert.equal(onDiskAtUninstall, false, 'the source is gone before ShadowMount is asked to uninstall');
  assert.match(note, /can't uninstall a game while Jobee'sLair is open/);
  assert.ok(!fs.exists('/data/homebrew/Game.exfat'));
  assert.ok(!queue.snapshot().some((job) => job.id === first.id));
});

test('an image ShadowMount keeps mounted is never deleted', async () => {
  const state = { images: [], games: {} };
  const { fs, queue, id } = await downloadedImage(state);
  state.images = [listed('/data/homebrew/Game.exfat', { mounted: true })];
  await assert.rejects(queue.deleteFromDisk(id), /still has \/data\/homebrew\/Game\.exfat mounted, so its files were kept/);
  assert.ok(fs.exists('/data/homebrew/Game.exfat'));
  assert.equal(queue.snapshot()[0].state, 'downloaded', 'the task is back as it was');
});

test('a request ShadowMount does not answer in time is cancelled and fails, never waits forever', async () => {
  let cancelled = false;
  const silent = { request: (url, options) => new Promise((_, fail) => options.signal.addEventListener('abort', () => { cancelled = true; fail(new Error('cancelled')); })) };
  await assert.rejects(shadowRequest(silent, 'images', {}, { timeoutMs: 30 }), (error) => error.timedOut === true && /did not answer images within/.test(error.message));
  assert.ok(cancelled, 'the waiting native task is cancelled');
});

test('ShadowMount errors carry its status: EBUSY reads as "busy while the app is open"', async () => {
  const answer = (status, body) => ({ request: async () => ({ ok: false, status, json: async () => body }) });
  const busy = await shadowRequest(answer(409, { status: 16, error: 'a game is active or awaiting exit; close the game and try again' }), 'games/uninstall').catch((error) => error);
  assert.deepEqual([busy.httpStatus, busy.status, busyWhileOpen(busy)], [409, 16, true]);
  const missing = await shadowRequest(answer(404, { status: 2, error: 'unknown title' }), 'games/uninstall').catch((error) => error);
  assert.equal(busyWhileOpen(missing), false);
});

test('versions: 0.1.1 beta 3 is newer than beta 2 and older than 0.1.1', () => {
  assert.equal(newer('0.1.1-beta.3', '0.1.1-beta.2'), true);
  assert.equal(newer('v0.1.1', '0.1.1-beta.3'), true);
});

test("the console's queue as beta 2 left it (a delete cut off in 'removing', its files gone since) deletes on the next try", async () => {
  const saved = JSON.parse(readFileSync(new URL('./fixtures/fixture-console-queue.json', import.meta.url), 'utf8'));
  const stuck = saved.jobs.find((job) => job.state === 'removing');
  const fs = memoryFs();
  fs.file('/data/app/JobeesLair/downloads.json', 0, JSON.stringify({ ...saved, jobs: [{ ...stuck, rootIdentity: '1:2' }] }));
  const state = { images: [], games: { PPSA24588: atRest('/data/homebrew/set-177a7e1bba8addf-app', 'PPSA24588', { source_type: 'folder' }) }, uninstallBusy: true };
  const queue = queueWith({ fs, downloads: engine(fs), http: shadowMount(state) });
  const job = queue.snapshot()[0];
  assert.deepEqual([job.state, job.error], ['installed', 'The app closed while deleting its files. Delete it again.']);
  const { note } = await within(queue.deleteFromDisk(job.id), 2000, 'the delete');
  assert.match(note, /close the app/);
  assert.equal(queue.snapshot().length, 0);
});

// ---- 0.1.1 beta 4: play time, deeper ShadowMount, moving games between drives, Make Room ----
const { sessionsIn, createPlaytime, playParts } = await load('app/state/playtime.js');
const { civilDays, parseStamp } = await load('app/state/clock.js');
const { createShadowClient, reregister, scanCovers, launchedAt } = await load('app/state/shadowmount.js');
const { createMountMonitor } = await load('app/state/mount-monitor.js');
const { planRoom, selection, ticked0, toggle } = await load('app/library/make-room.js');
const { findLeftovers } = await load('app/library/leftovers.js');
const { createRoomRunner } = await load('app/library/room-runner.js');

const H = 3600e3;
// 2026-10-16 00:30 local in a zone 120 minutes east of UTC.
const OCT16 = civilDays(2026, 10, 16) * 864e5;

test('play time: a session is the time from "[GAME] started" to its exit, across midnight, dated from when the log was read', () => {
  const log = [
    '[23:50:00]   [SHELLCORE] launch mount ready: PPSA11111',
    '[23:50:02]   [GAME] started: PPSA11111 pid=5 app_id=0x00000018',
    '[00:20:02]   [GAME] process exited, awaiting same-app handoff: PPSA11111 pid=5 app_id=0x00000018',
    '[00:20:03]   [GAME] finalizing stopped application: PPSA11111 pid=5',
    '[00:21:00]   [GAME] started: PPSA99058 pid=9 app_id=0x00002018',
    '[00:25:00]   [GAME] started: PPSA22222 pid=12 app_id=0x00004018',
  ].join('\n');
  const now = OCT16 + 30 * 60e3 - 120 * 60e3;
  const sessions = sessionsIn(log, { now, offsetMinutes: 120 });
  assert.equal(sessions.length, 1, "the app's own session and one still running are left out");
  assert.deepEqual({ ...sessions[0], endedAt: undefined }, { key: 'PPSA11111|5|23:50:02', title: 'PPSA11111', pid: 5, seconds: 1800, endedAt: undefined, approximate: false });
  assert.equal(sessions[0].endedAt, OCT16 + (20 * 60 + 2) * 1e3 - 120 * 60e3, 'ended at 00:20:02 local on the 16th');
});

test("play time: the console's own log, Jobee'sLair left out, durations exact, sessions before ShadowMount's restart approximate", () => {
  const text = readFileSync(new URL('./fixtures/console-sessions.log', import.meta.url), 'utf8');
  const sessions = sessionsIn(text, { now: Date.now(), offsetMinutes: 0 });
  assert.ok(!sessions.some((session) => session.title === 'PPSA99058'));
  const first = sessions.find((session) => session.title === 'PPSA03524');
  assert.equal(first.seconds, 281, '23:39:48 to 23:44:29');
  assert.equal(sessions.find((session) => session.title === 'CUSA11302').seconds, 167, '00:03:47 to 00:06:34, after midnight');
  assert.ok(sessions.length >= 5);
});

test('play time: the store counts each session once, keeps totals and the last played time, and survives a restart', () => {
  const fs = memoryFs();
  let now = OCT16;
  const make = () => createPlaytime({ fs, file: '/data/q/playtime.json', now: () => now, log: () => {} });
  const store = make();
  const log = '[10:00:00]   [GAME] started: PPSA11111 pid=5 app_id=0x1\n[12:30:00]   [GAME] process exited, awaiting same-app handoff: PPSA11111 pid=5 app_id=0x1\n';
  now = OCT16 + 13 * H;
  assert.equal(store.learn(log), true);
  assert.equal(store.learn(log), false, 'the same session again counts nothing');
  assert.deepEqual(store.of('PPSA11111'), { seconds: 9000, sessions: 1, lastPlayed: OCT16 + 12.5 * H });
  const later = log + '[13:00:00]   [GAME] started: PPSA11111 pid=7 app_id=0x2\n[14:00:00]   [GAME] process exited, awaiting same-app handoff: PPSA11111 pid=7 app_id=0x2\n';
  now = OCT16 + 15 * H;
  store.learn(later);
  const again = make();
  assert.deepEqual(again.of('PPSA11111'), { seconds: 12600, sessions: 2, lastPlayed: OCT16 + 14 * H });
  assert.equal(again.played('PPSA11111', OCT16 + 20 * H), true, "ShadowMount's later last launch wins");
  assert.equal(again.played('PPSA11111', OCT16), false);
});

test('play time reads as "42 hours played · Last played yesterday"', () => {
  const t = (part) => part && format(part);
  const format = ({ key, params }) => key.replace('play.', '') + (params ? `:${params.count}` : '');
  const now = OCT16 + 10 * H;
  assert.deepEqual(Object.values(playParts({ seconds: 42 * 3600, lastPlayed: now - 24 * H }, { now })).map(t), ['hours:42', 'lastYesterday']);
  assert.deepEqual(Object.values(playParts({ seconds: 2.25 * 3600, lastPlayed: now - H }, { now })).map(t), ['hours:2.3', 'lastToday']);
  assert.deepEqual(Object.values(playParts({ seconds: 20 * 60, lastPlayed: now - 5 * 24 * H }, { now })).map(t), ['minutes:20', 'lastDays:5']);
  assert.deepEqual(Object.values(playParts({ seconds: 0, lastPlayed: now - 70 * 24 * H }, { now })).map(t), [null, 'lastLong:2']);
  assert.deepEqual(playParts(null), { time: null, last: null });
});

test("ShadowMount's timestamps: epoch seconds or ms, or a local date-time string", () => {
  assert.equal(parseStamp(1760000000), 1760000000e3);
  assert.equal(parseStamp(1760000000123), 1760000000123);
  assert.equal(parseStamp('2026-10-16 00:30:00', 120), OCT16 + 30 * 60e3 - 120 * 60e3);
  assert.equal(parseStamp('2026-10-16T00:30:00Z'), OCT16 + 30 * 60e3);
  assert.equal(parseStamp('2026-10-16T02:30:00+02:00'), OCT16 + 30 * 60e3);
  assert.equal(parseStamp(0), null);
  assert.equal(parseStamp('never'), null);
  assert.equal(launchedAt({ last_access_time: '2026-10-16 00:30:00' }, (value) => parseStamp(value, 0)), OCT16 + 30 * 60e3);
});

test('the background ShadowMount client never waits behind a download, rests after a timeout, and the urgent path pauses downloads', async () => {
  let busy = true, now = 0, quiet = 0;
  const calls = [];
  const http = { request: async (url, options) => {
    calls.push(url.split('/v1/')[1]);
    if (url.endsWith('slow')) return new Promise((_, fail) => options.signal.addEventListener('abort', () => fail(new Error('cancelled'))));
    return { ok: true, status: 200, json: async () => ({ status: 0 }) };
  } };
  const client = createShadowClient({ http, transferring: () => busy, quiet: (reason, work) => (quiet++, work()), now: () => now });
  await assert.rejects(client.background('images'), (error) => error.skipped === true);
  assert.deepEqual(calls, [], 'not asked while a download holds the network');
  busy = false;
  await client.background('images');
  await assert.rejects(client.background('slow', {}, { timeoutMs: 20 }), (error) => error.timedOut === true);
  await assert.rejects(client.background('images'), (error) => error.skipped === true, 'resting after the timeout');
  await client.now('see why', 'debug-log');
  assert.equal(quiet, 1, 'the gamer-facing call goes through quietNetwork');
  now = 61e3;
  await client.background('images');
  assert.deepEqual(calls, ['images', 'slow', 'debug-log', 'images']);
});

test('scan paths: a game directly in a scan path is found by the scan; one deeper, or elsewhere, is not', () => {
  assert.equal(scanCovers(['/data/homebrew', '/mnt/usb0/homebrew'], '/mnt/usb0/homebrew/Game.exfat'), true);
  assert.equal(scanCovers(['/data/homebrew/'], '/mnt/usb0/homebrew/Game.exfat'), false);
  assert.equal(scanCovers(['/mnt/usb0'], '/mnt/usb0/homebrew/Game.exfat'), false);
  assert.equal(scanCovers(['/mnt/usb0'], '/mnt/usb0/homebrew/Game.exfat', 2), true);
});

// The fake ShadowMount's settings and manual list (state.scanPaths, state.manual), around shadowMount().
function withSettings(http, state) {
  const request = http.request.bind(http);
  http.request = async (url, options) => {
    const route = url.replace('http://127.0.0.1:10101/api/v1/', '');
    const body = JSON.parse(options.body || '{}');
    const reply = (value) => ({ ok: true, status: 200, json: async () => value });
    if (route === 'settings') return http.calls.push(route), reply({ scan_paths: state.scanPaths ?? ['/data/homebrew'] });
    if (route === 'manual/list') return http.calls.push(route), reply({ paths: state.manual ?? [] });
    if (route === 'manual/add') return http.calls.push(`${route} ${body.path}`), state.manual = [...state.manual ?? [], body.path], reply({});
    if (route === 'manual/remove') return http.calls.push(`${route} ${body.path}`), state.manual = (state.manual ?? []).filter((path) => path !== body.path), reply({});
    return request(url, options);
  };
  return http;
}

test('re-registration: a new place outside the scan paths goes into manual.lst, the old entry goes, a rescan is asked', async () => {
  const state = { images: [], games: {}, scanPaths: ['/data/homebrew'], manual: ['/data/homebrew/Game.exfat'] };
  const http = withSettings(shadowMount(state), state);
  const { steps, failed } = await reregister((route, body) => shadowRequest(http, route, body), { from: '/data/homebrew/Game.exfat', to: '/mnt/usb0/homebrew/Game.exfat' });
  assert.equal(failed, false, steps.join('; '));
  assert.deepEqual(state.manual, ['/mnt/usb0/homebrew/Game.exfat']);
  assert.ok(http.calls.includes('scan'));
  state.scanPaths = ['/data/homebrew', '/mnt/usb0/homebrew'];
  state.manual = [];
  await reregister((route, body) => shadowRequest(http, route, body), { from: '/mnt/usb0/homebrew/Game.exfat', to: '/data/homebrew/Game.exfat' });
  assert.deepEqual(state.manual, [], 'a scan path holds it: no manual entry');
});

// FileSystem.copyAsync over memoryFs: `<to>.partial` then a rename, like copies.cpp. `copies.failAt`: the
// bytes after which the next copy fails (as a drive pulled would), its partial kept.
function withCopies(fs, drives = {}) {
  const copies = { calls: [], failAt: null };
  fs.copies = copies;
  fs.diskUsage = (root) => drives[root.match(/^\/(?:data|mnt\/(?:usb|ext)\d+)/)?.[0]] ?? { total: 1e12, free: 1e12 };
  fs.copyAsync = (from, to, options) => {
    copies.calls.push({ from, to, options });
    const listeners = new Set();
    let reject;
    const done = new Promise((resolve, fail) => {
      reject = fail;
      setImmediate(() => {
        if (fs.exists(to)) return fail(new Error(`fs.copyAsync ${to}: the destination already exists`));
        if (!fs.exists(from)) return fail(new Error(`fs.copyAsync ${to}: read the source: No such file or directory`));
        const partial = `${to}.partial`;
        const total = [...fs.nodes].filter(([key, node]) => (key === from || key.startsWith(`${from}/`)) && !node.dir).reduce((sum, [, node]) => sum + node.size, 0);
        for (const [key, node] of [...fs.nodes]) {
          if (key !== from && !key.startsWith(`${from}/`)) continue;
          fs.mkdir(parentOf(partial + key.slice(from.length)));
          fs.nodes.set(partial + key.slice(from.length), { ...node });
        }
        if (copies.failAt !== null) {
          const at = copies.failAt;
          copies.failAt = null;
          for (const listener of listeners) listener({ state: 'copying', written: at, verified: 0, total });
          return fail(new Error(`fs.copyAsync ${to}: write the copy: Input/output error`));
        }
        for (const listener of listeners) listener({ state: 'verifying', written: total, verified: total, total });
        fs.rename(partial, to);
        resolve({ state: 'completed', receipt: fs.exists(`${from}.complete`) ? 'matched' : 'none' });
      });
    });
    done.catch(() => {});
    return { done, cancel: () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)) };
  };
  return fs;
}
const parentOf = (p) => p.slice(0, p.lastIndexOf('/')) || '/';

async function installedOnData(extra = {}, drives) {
  const state = { images: [], games: {}, scanPaths: ['/data/homebrew'], ...extra };
  const fs = withCopies(memoryFs(), drives);
  fs.mkdir('/mnt/usb0');
  const http = withSettings(shadowMount(state), state);
  const queue = queueWith({ fs, downloads: engine(fs), http });
  const first = await settle(queue, queue.enqueue(game, image('Game.exfat', 5000), '/data'));
  state.games.PPSA01234 = atRest('/data/homebrew/Game.exfat');
  await queue.syncInstalls(first.id);
  assert.equal(queue.snapshot()[0].state, 'installed');
  return { fs, http, state, queue, id: first.id };
}

test('a game moves to USB: copied and read back, the job follows it, the original and its receipt go, ShadowMount is told', async () => {
  const { fs, http, state, queue, id } = await installedOnData();
  const steps = [];
  const { note } = await queue.relocate(id, '/mnt/usb0', { onProgress: (fraction) => steps.push(fraction) });
  assert.ok(fs.exists('/mnt/usb0/homebrew/Game.exfat') && !fs.exists('/mnt/usb0/homebrew/Game.exfat.partial'));
  assert.ok(!fs.exists('/data/homebrew/Game.exfat') && !fs.exists('/data/homebrew/Game.exfat.complete'), 'the original and its receipt are deleted');
  assert.ok(!fs.exists('/mnt/usb0/homebrew/Game.exfat.complete'), "a receipt tied to the original's inode is not copied");
  assert.deepEqual(fs.copies.calls.map((call) => [call.from, call.to, call.options.receipt]), [['/data/homebrew/Game.exfat', '/mnt/usb0/homebrew/Game.exfat', true]]);
  const job = queue.snapshot()[0];
  assert.equal(job.root, '/mnt/usb0');
  assert.equal(job.artifact.destination, '/mnt/usb0/homebrew/Game.exfat');
  assert.deepEqual(job.artifact.images, ['/mnt/usb0/homebrew/Game.exfat']);
  assert.deepEqual(job.payload, [{ path: '/mnt/usb0/homebrew/Game.exfat', size: 5000 }]);
  assert.equal(job.state, 'installed');
  assert.equal(job.moving, undefined);
  assert.equal(job.release.url, 'https://example.com/Game.exfat', 'where it came from stays');
  assert.ok(http.calls.includes('manual/add /mnt/usb0/homebrew/Game.exfat') && http.calls.includes('scan'));
  assert.match(note, /once you close Jobee'sLair/);
  assert.equal(steps.at(-1), 1);
  assert.deepEqual(state.manual, ['/mnt/usb0/homebrew/Game.exfat']);
  // And back: internal storage is in a scan path, so no manual entry is added for it.
  await queue.relocate(id, '/data');
  assert.ok(fs.exists('/data/homebrew/Game.exfat') && !fs.exists('/mnt/usb0/homebrew/Game.exfat'));
  assert.equal(queue.snapshot()[0].root, '/data');
});

test('a mounted game is never moved; nor one with no room on the other drive', async () => {
  const { fs, state, queue, id } = await installedOnData({}, { '/mnt/usb0': { total: 1e6, free: 1000 } });
  await assert.rejects(queue.relocate(id, '/mnt/usb0'), /There isn't room there/);
  fs.diskUsage = () => ({ total: 1e12, free: 1e12 });
  state.images = [listed('/data/homebrew/Game.exfat', { mounted: true })];
  await assert.rejects(queue.relocate(id, '/mnt/usb0'), /still has \/data\/homebrew\/Game\.exfat mounted, so it stays where it is/);
  assert.equal(fs.copies.calls.length, 0, 'nothing was copied');
  assert.ok(fs.exists('/data/homebrew/Game.exfat'));
  assert.equal(queue.snapshot()[0].moving, undefined);
});

test('a move cut off keeps the game where it was and its copy so far; moving again resumes it, cancelling deletes it', async () => {
  const { fs, queue, id } = await installedOnData();
  fs.copies.failAt = 2000;
  await assert.rejects(queue.relocate(id, '/mnt/usb0'), /Input\/output error/);
  let job = queue.snapshot()[0];
  assert.equal(job.root, '/data');
  assert.ok(fs.exists('/data/homebrew/Game.exfat'), 'the original is untouched');
  assert.ok(fs.exists('/mnt/usb0/homebrew/Game.exfat.partial'), 'the copy so far is kept for a resume');
  assert.deepEqual([job.moving.to, job.moving.interrupted], ['/mnt/usb0', true]);
  assert.match(job.moving.error, /Input\/output error/);
  await queue.cancelMove(id);
  assert.ok(!fs.exists('/mnt/usb0/homebrew/Game.exfat.partial') && fs.exists('/data/homebrew/Game.exfat'));
  assert.equal(queue.snapshot()[0].moving, undefined);
  fs.copies.failAt = 10;
  await queue.relocate(id, '/mnt/usb0').catch(() => {});
  await queue.relocate(id, '/mnt/usb0');
  job = queue.snapshot()[0];
  assert.equal(job.root, '/mnt/usb0');
  assert.equal(fs.copies.calls.at(-1).options.resume, true);
});

test('a queue saved in the middle of a move reads it back as stopped, the game where it was', async () => {
  const { fs, queue, id } = await installedOnData();
  fs.copies.failAt = 100;
  await queue.relocate(id, '/mnt/usb0').catch(() => {});
  const saved = JSON.parse(fs.readFile('/data/app/JobeesLair/downloads.json'));
  saved.jobs[0].moving = { to: '/mnt/usb0', total: 5000, written: 2500, at: 1 };
  fs.writeFile('/data/app/JobeesLair/downloads.json', JSON.stringify(saved));
  const again = queueWith({ fs, downloads: engine(fs) });
  const job = again.snapshot().find((item) => item.id === id);
  assert.deepEqual([job.root, job.moving.interrupted, job.moving.written], ['/data', true, 0]);
});

test('deleting a game whose move stopped deletes its copy on the other drive too', async () => {
  const { fs, queue, id } = await installedOnData();
  fs.copies.failAt = 100;
  await queue.relocate(id, '/mnt/usb0').catch(() => {});
  await queue.deleteFromDisk(id);
  assert.ok(!fs.exists('/mnt/usb0/homebrew/Game.exfat.partial') && !fs.exists('/data/homebrew/Game.exfat'));
});

test('a game moved outside the app (FTP, another tool): the job follows the file ShadowMount points at', async () => {
  const { fs, state, queue, id } = await installedOnData();
  fs.rename('/data/homebrew/Game.exfat', '/mnt/usb0/homebrew/Game.exfat');
  fs.remove('/data/homebrew/Game.exfat.complete');
  state.games.PPSA01234 = atRest('/mnt/usb0/homebrew/Game.exfat');
  await queue.syncInstalls();
  const job = queue.snapshot()[0];
  assert.deepEqual([job.root, job.artifact.destination, job.state], ['/mnt/usb0', '/mnt/usb0/homebrew/Game.exfat', 'installed']);
});

test("a download that doesn't fit says how much more its drive needs", async () => {
  const fs = memoryFs();
  fs.diskUsage = () => ({ total: 1e12, free: 5e9 });
  const queue = queueWith({ fs, downloads: engine(fs) });
  const error = (() => { try { queue.enqueue(game, image('Big.exfat', 50e9), '/data'); } catch (failure) { return failure; } })();
  assert.match(error.message, /Not enough space on \/data/);
  assert.deepEqual([error.shortfall.root, error.shortfall.free, error.shortfall.need > 50e9], ['/data', 5e9, true]);
});

// Library entries as library/useShelf.js makes them.
const entry = (key, size, { root = '/data', stage = 'played', addedAt = 0, title = key } = {}) => ({
  key, size, root, addedAt, removing: false, game: { id: key, title }, ready: { stage, tone: stage === 'wontStart' ? 'bad' : 'good' },
  jobs: [{ id: `${key}/r`, root, titleId: key, state: 'installed', artifact: { nextAction: 'shadowmount', destination: `${root}/homebrew/${key}.exfat` } }], files: [],
});
const GB = 1e9;
const day = 864e5;

test('Make Room: leftovers first and ticked, then the least recently played games moved until the drive has room; deleting is never ticked', () => {
  const entries = [
    entry('PPSA00001', 60 * GB), entry('PPSA00002', 40 * GB), entry('PPSA00003', 30 * GB), entry('PPSA00004', 80 * GB, { stage: 'wontStart' }),
    entry('PPSA00005', 50 * GB), entry('PPSA00006', 20 * GB, { root: '/mnt/usb0' }),
  ];
  const playtimes = {
    PPSA00001: { seconds: 0, lastPlayed: 5 * day }, PPSA00002: { seconds: 0, lastPlayed: 1 * day }, PPSA00003: { seconds: 0, lastPlayed: 9 * day },
  };
  const plan = planRoom({
    target: '/data', need: 120 * GB, drives: { '/data': { total: 667 * GB, free: 20 * GB }, '/mnt/usb0': { total: 1e12, free: 500 * GB } }, entries, playtimes,
    kept: new Set(['PPSA00005']),
    leftovers: [{ id: 'archive:x', kind: 'archive', root: '/data', path: '/data/downloads/archives/x.zip', bytes: 10 * GB, selected: true }, { id: 'paused:y', kind: 'paused', root: '/data', bytes: 5 * GB, selected: false }],
  });
  assert.deepEqual(plan.tiers.reclaim.map((item) => [item.id, item.selected]), [['archive:x', true], ['paused:y', false]]);
  // PPSA00005 is kept on internal storage; PPSA00004 won't start, so it is offered for deleting, not moving.
  // The rest by last played, oldest first: PPSA00002 (day 1), PPSA00001 (day 5), PPSA00003 (day 9).
  assert.deepEqual(plan.tiers.relocate.map((item) => [item.entryKey, item.to, item.selected]), [['PPSA00002', '/mnt/usb0', true], ['PPSA00001', '/mnt/usb0', true], ['PPSA00003', '/mnt/usb0', false]]);
  assert.deepEqual(plan.tiers.remove.map((item) => [item.entryKey, item.kind, item.selected]).slice(0, 1), [['PPSA00004', 'wontStart', false]]);
  assert.ok(!plan.tiers.remove.some((item) => item.entryKey === 'PPSA00006'), 'only games on the drive being freed');
  const ticked = ticked0(plan);
  const chosen = selection(plan, ticked);
  assert.deepEqual([chosen.freed, chosen.after['/data'], chosen.after['/mnt/usb0'], chosen.enough], [110 * GB, 130 * GB, 400 * GB, true]);
  // A game is moved or deleted, never both.
  const flipped = toggle(plan, ticked, 'remove:PPSA00002');
  assert.ok(flipped.has('remove:PPSA00002') && !flipped.has('relocate:PPSA00002'));
});

test('Make Room never moves the five most played, a held game, or onto internal storage', () => {
  const entries = Array.from({ length: 7 }, (_, index) => entry(`PPSA0000${index}`, 10 * GB));
  const playtimes = Object.fromEntries(entries.map((item, index) => [item.key, { seconds: (index + 1) * 3600, lastPlayed: index * day }]));
  const plan = planRoom({ target: '/data', need: 999 * GB, drives: { '/data': { total: 667 * GB, free: 0 }, '/mnt/usb0': { total: 1e12, free: 900 * GB } }, entries, playtimes, held: (item) => item.key === 'PPSA00000' });
  assert.deepEqual(plan.tiers.relocate.map((item) => item.entryKey), ['PPSA00001'], 'PPSA00002..6 are the five most played; PPSA00000 is held');
  const usb = planRoom({ target: '/mnt/usb0', need: 999 * GB, drives: { '/data': { total: 667 * GB, free: 600 * GB }, '/mnt/usb0': { total: 1e12, free: 0 } }, entries: [entry('PPSA00009', 10 * GB, { root: '/mnt/usb0' })] });
  assert.deepEqual(usb.tiers.relocate, [], 'freeing a USB drive never fills internal storage');
});

test('Make Room finds what no game needs: an unpacked archive, a leftover partial, kept notes, a stray backport, a stopped copy', () => {
  const fs = memoryFs();
  fs.file('/data/homebrew/Game.zip-extracted/Game.exfat', 900);
  fs.file('/data/downloads/archives/Game.zip', 500);
  fs.file('/data/downloads/extracted/Game.zip-extras/readme.txt', 30);
  fs.file('/data/downloads/images/Old.exfat.part', 400);
  fs.file('/data/downloads/images/Live.exfat.part', 300);
  fs.file('/data/homebrew/Other.exfat.partial', 200);
  const jobs = [
    { id: 'a', title: 'Game', root: '/data', state: 'installed', artifact: { nextAction: 'shadowmount', destination: '/data/homebrew/Game.zip-extracted/Game.exfat' }, downloadDestination: '/data/downloads/archives/Game.zip', extras: '/data/downloads/extracted/Game.zip-extras', release: {} },
    { id: 'b', title: 'Live', root: '/data', state: 'paused', written: 300, artifact: { nextAction: 'shadowmount', destination: '/data/homebrew/Live.exfat' }, downloadDestination: '/data/downloads/images/Live.exfat', release: {} },
  ];
  const backports = [{ path: '/data/homebrew/backports/PPSA07777', name: 'PPSA07777', titleId: 'PPSA07777', size: 50, root: '/data', backport: true }, { path: '/data/homebrew/backports/PPSA01234', name: 'PPSA01234', titleId: 'PPSA01234', size: 60, root: '/data', backport: true }];
  const found = findLeftovers({ fs, roots: ['/data'], jobs, installed: new Set(['PPSA01234']), backports });
  const byKind = Object.fromEntries(found.map((item) => [item.kind, [item.path, item.bytes, item.selected]]));
  assert.deepEqual(byKind.archive, ['/data/downloads/archives/Game.zip', 500, true]);
  assert.deepEqual(byKind.notes, ['/data/downloads/extracted/Game.zip-extras', 30, true]);
  assert.deepEqual(byKind.orphan, ['/data/downloads/images/Old.exfat.part', 400, true]);
  assert.deepEqual(byKind.paused, ['/data/downloads/images/Live.exfat', 300, false], 'a paused download may be resumed: not ticked');
  assert.deepEqual(byKind.backport, ['/data/homebrew/backports/PPSA07777', 50, true], 'a backport of an installed game stays');
  assert.deepEqual(byKind.copy, ['/data/homebrew/Other.exfat.partial', 200, true]);
  assert.equal(found.length, 6);
});

test('Make Room runs: downloads held until the drive has room, then let go; a failed step does not stop the rest; the waiting download starts', async () => {
  const log = [];
  let free = 10, holding = false, enqueued = null;
  const queue = {
    quietNetwork: async (reason, work) => { holding = true; log.push(`hold ${reason}`); try { return await work(); } finally { holding = false; log.push('release'); } },
    deleteExtras: async () => { log.push(`notes ${holding}`); free += 5; },
    relocate: async (id, to) => { log.push(`move ${id} ${to} ${holding}`); if (id === 'B/r') throw new Error('drive pulled'); free += 50; return { note: 'after close' }; },
    deleteFromDisk: async () => {},
    enqueue: (gameValue) => { enqueued = gameValue.title; },
  };
  const fs = { exists: (p) => !/.(complete|part|resume)$/.test(p), removeAsync: async (p) => { log.push(`rm ${p} ${holding}`); free += 20; } };
  const runner = createRoomRunner({ queue, fs, deleteFile: async () => ({}), moveFile: async () => ({}), freeOf: async () => free, log: () => {} });
  const items = [
    { id: 'archive:x', tier: 'reclaim', bytes: 20, action: { type: 'path', path: '/data/downloads/archives/x.zip' } },
    { id: 'notes:y', tier: 'reclaim', bytes: 5, action: { type: 'deleteExtras', jobId: 'y' } },
    { id: 'relocate:B', tier: 'relocate', entryKey: 'B', bytes: 50, to: '/mnt/usb0', action: { type: 'relocate', entryKey: 'B', to: '/mnt/usb0' } },
    { id: 'relocate:A', tier: 'relocate', entryKey: 'A', bytes: 50, to: '/mnt/usb0', action: { type: 'relocate', entryKey: 'A', to: '/mnt/usb0' } },
    { id: 'relocate:C', tier: 'relocate', entryKey: 'C', bytes: 50, to: '/mnt/usb0', action: { type: 'relocate', entryKey: 'C', to: '/mnt/usb0' } },
  ];
  const plan = { target: '/data', need: 80, freeBefore: 10, items, tiers: { reclaim: items.slice(0, 2), relocate: items.slice(2), remove: [] } };
  const jobOf = (key) => ({ key, jobs: [{ id: `${key}/r`, role: 'game' }], files: [] });
  const state = await runner.run({ plan, ticked: new Set(items.map((item) => item.id)), entries: new Map(['A', 'B', 'C'].map((key) => [key, jobOf(key)])), then: { game: { title: 'GTA' }, release: {}, root: '/data' } });
  // 10 free, 80 needed: the archive (30), the notes (35), B fails, A (85): enough, so C runs beside downloads.
  assert.deepEqual(log, ['hold make room', 'rm /data/downloads/archives/x.zip true', 'notes true', 'move B/r /mnt/usb0 true', 'move A/r /mnt/usb0 true', 'release', 'move C/r /mnt/usb0 false']);
  assert.deepEqual(Object.fromEntries(Object.entries(state.items).map(([id, item]) => [id, item.state])), { 'archive:x': 'done', 'notes:y': 'done', 'relocate:B': 'failed', 'relocate:A': 'done', 'relocate:C': 'done' });
  assert.equal(state.items['relocate:B'].error, 'drive pulled');
  assert.equal(enqueued, 'GTA');
  assert.deepEqual([state.running, state.finished, state.startedDownload, state.notes], [false, true, 'GTA', ['after close']]);
});

test("the mount monitor: what ShadowMount has mounted, each game's health, its last launch; quiet while a download runs", async () => {
  const fs = memoryFs();
  fs.file('/data/homebrew/Here.exfat', 10);
  let busy = false;
  const state = { images: [listed('/mnt/usb0/homebrew/Gone.exfat', { mounted: true, source_available: false })], games: {
    PPSA00001: atRest('/data/homebrew/Here.exfat', 'PPSA00001', { last_access_time: 1760000000 }),
    PPSA00002: atRest('/mnt/usb0/homebrew/Gone.exfat', 'PPSA00002'),
    PPSA00003: atRest('/data/homebrew/Missing.exfat', 'PPSA00003'),
  } };
  const http = shadowMount(state);
  const launches = [];
  const monitor = createMountMonitor({ client: createShadowClient({ http, transferring: () => busy }), fs, parse: (value) => parseStamp(value), onLaunch: (title, at) => launches.push([title, at]), log: () => {} });
  const seen = await monitor.refresh();
  assert.deepEqual(Object.fromEntries(Object.entries(seen.titles).map(([title, health]) => [title, [health.mounted, health.problem]])), {
    PPSA00001: [false, null], PPSA00002: [true, 'sourceLost'], PPSA00003: [false, 'sourceMissing'],
  });
  assert.deepEqual(launches, [['PPSA00001', 1760000000e3]]);
  assert.deepEqual(monitor.mountedAmong(['/mnt/usb0/homebrew/Gone.exfat'], '/mnt/usb0').length, 1);
  busy = true;
  const calls = http.calls.length;
  await monitor.refresh();
  assert.equal(http.calls.length, calls, 'not asked while a download holds the network; the last answer stays');
  assert.equal(monitor.snapshot().titles.PPSA00002.problem, 'sourceLost');
});

test('versions: 0.1.1 beta 4 is newer than beta 3 and older than 0.1.1', () => {
  assert.equal(newer('0.1.1-beta.4', '0.1.1-beta.3'), true);
  assert.equal(newer('v0.1.1', '0.1.1-beta.4'), true);
});

test('a set of images unpacked into one folder moves image by image, and the emptied folder goes', async () => {
  const state = { images: [], games: {}, scanPaths: ['/data/homebrew'] };
  const fs = withCopies(memoryFs());
  fs.mkdir('/mnt/usb0');
  const http = withSettings(shadowMount(state), state);
  const queue = queueWith({ fs, downloads: engine(fs), archives: extractor(fs, { 'Game-Update-1.05.exfat': 300, 'Game.exfat': 900 }), http });
  const id = queue.enqueue(game, image('Game.zip', 500), '/data');
  await settle(queue, id);
  const dir = '/data/homebrew/Game.zip-extracted';
  state.games.PPSA01234 = atRest(`${dir}/Game.exfat`);
  state.images = [listed(`${dir}/Game.exfat`), listed(`${dir}/Game-Update-1.05.exfat`)];
  await queue.syncInstalls(id);
  assert.equal(queue.snapshot()[0].state, 'installed');
  await queue.relocate(id, '/mnt/usb0');
  const usb = '/mnt/usb0/homebrew/Game.zip-extracted';
  assert.ok(fs.exists(`${usb}/Game.exfat`) && fs.exists(`${usb}/Game-Update-1.05.exfat`));
  assert.ok(!fs.exists(dir), 'the emptied folder on internal storage is gone');
  assert.deepEqual(queue.snapshot()[0].artifact.images, [`${usb}/Game.exfat`, `${usb}/Game-Update-1.05.exfat`]);
  assert.deepEqual(state.manual, [`${usb}/Game.exfat`, `${usb}/Game-Update-1.05.exfat`]);
});

test('versions: 0.2.0 is newer than every 0.1.1 beta and 0.1.1, and the app now reports 0.5.0', async () => {
  assert.equal(newer('v0.2.0', '0.1.1-beta.4'), true);
  assert.equal(newer('v0.2.0', '0.1.1'), true);
  assert.equal(newer('0.1.1-beta.4', '0.2.0'), false);
  const { VERSION, VERSION_LABEL } = await load('app/version.js');
  assert.deepEqual([VERSION, VERSION_LABEL], ['0.5.0', '0.5.0']);
});


// ---- 0.2.1 beta 1: installing updates (release assets, the network lent while idle, staging, the updater) ----
const { describe: describeRelease, contentVersionOf, ASSETS } = await load('app/state/updater.js');
const { createAutoUpdater, STAGING, IMAGE_NAME } = await load('app/state/auto-update.js');
const { VERSION, TITLE_ID } = await load('app/version.js');

const SHA = (c) => c.repeat(64);
const releaseJson = (overrides = {}) => ({
  tag_name: 'v0.5.1', html_url: 'https://github.com/JVK3R/JobeesLair/releases/tag/v0.5.1', body: 'notes', published_at: '2026-10-20T00:00:00Z',
  assets: [
    { name: 'JobeesLair.exfat', size: 5000, digest: `sha256:${SHA('a')}`, browser_download_url: 'https://github.com/JVK3R/JobeesLair/releases/download/v0.5.1/JobeesLair.exfat' },
    { name: 'update.zip', size: 300, digest: `sha256:${SHA('b')}`, browser_download_url: 'https://github.com/JVK3R/JobeesLair/releases/download/v0.5.1/update.zip' },
  ],
  ...overrides,
});

test('versions: 0.5.0 is newer than 0.4.1 and every 0.5.0 pre-release, and older than 0.5.1; its package version is 01.005.000', () => {
  assert.equal(VERSION, '0.5.0');
  assert.equal(newer('v0.5.0', '0.5.0-pre.4'), true, 'testers on Pre Release 4 are offered 0.5.0');
  assert.equal(newer('0.5.0', '0.4.1'), true, 'and so is everyone on 0.4.1');
  assert.equal(newer('v0.5.1', '0.5.0'), true, '0.5.1 will be offered to 0.5.0');
  assert.equal(contentVersionOf('0.5.0'), '01.005.000');
  assert.equal(newer('0.2.1-beta.1', '0.2.0'), true);
  assert.equal(newer('v0.2.1', '0.2.1-beta.1'), true);
  assert.equal(newer('0.2.0', '0.2.1-beta.1'), false);
  assert.equal(contentVersionOf('0.2.1-beta.1'), '01.002.001');
  assert.equal(contentVersionOf('0.2.1'), '01.002.001', 'the beta and the release share one package version');
  assert.equal(contentVersionOf('0.2.3'), '01.002.003');
  assert.equal(newer('v0.2.3', '0.2.1'), true);
  assert.equal(newer('0.3.0-beta.1', '0.2.3'), true);
  assert.equal(newer('v0.3.0', '0.3.0-beta.1'), true);
  assert.equal(contentVersionOf('0.3.0-beta.1'), '01.003.000');
  assert.equal(newer('0.4.0-pre.5', '0.3.0'), true, 'a 0.4.0 pre-release is newer than the published 0.3.0');
  assert.equal(newer('v0.4.0', '0.4.0-pre.5'), true, 'and older than 0.4.0 itself');
  assert.equal(newer('v0.4.0', '0.3.0'), true);
  assert.equal(contentVersionOf('0.4.0-pre.5'), '01.004.000', 'the pre-releases and 0.4.0 share one package version');
  assert.equal(contentVersionOf('0.4.0'), '01.004.000');
  assert.equal(newer('0.4.1-pre.1', '0.4.0'), true, 'a 0.4.1 pre-release is newer than the published 0.4.0');
  assert.equal(newer('v0.4.1', '0.4.1-pre.1'), true, 'and older than 0.4.1 itself');
  assert.equal(contentVersionOf('0.4.1-pre.1'), '01.004.001');
  assert.equal(contentVersionOf('0.4.1'), '01.004.001');
  assert.equal(newer('v0.4.1', '0.4.0'), true);
  assert.equal(contentVersionOf('0.2.0'), '01.002.000', "0.2.0's own package version");
  assert.equal(contentVersionOf('v1.10.2'), '02.010.002');
  assert.equal(contentVersionOf('99.0.0'), null);
  const app = JSON.parse(readFileSync(path.join(repo, 'app/app.json'), 'utf8'));
  assert.equal(app.version, contentVersionOf(VERSION), "app.json's package version is the version's");
  assert.equal(app.userAgent, `JobeesLair/${VERSION} (PS5)`);
});

test("release assets: offered only at the release's own download path, with GitHub's SHA-256 and a size", () => {
  const offered = describeRelease(releaseJson(), 'JVK3R/JobeesLair');
  assert.deepEqual(offered.assets, {
    image: { url: 'https://github.com/JVK3R/JobeesLair/releases/download/v0.5.1/JobeesLair.exfat', size: 5000, sha256: SHA('a') },
    zip: { url: 'https://github.com/JVK3R/JobeesLair/releases/download/v0.5.1/update.zip', size: 300, sha256: SHA('b') },
  });
  assert.deepEqual(Object.values(ASSETS), ['JobeesLair.exfat', 'update.zip']);
  const without = (change) => describeRelease(releaseJson({ assets: releaseJson().assets.map((asset) => asset.name === 'JobeesLair.exfat' ? change(asset) : asset) }), 'JVK3R/JobeesLair');
  assert.equal(without((asset) => ({ ...asset, digest: undefined })).assets, null, 'no digest, nothing to check it against');
  assert.equal(without((asset) => ({ ...asset, digest: 'sha1:abc' })).assets, null);
  assert.equal(without((asset) => ({ ...asset, browser_download_url: 'https://evil.example/JobeesLair.exfat' })).assets, null, 'another host');
  assert.equal(without((asset) => ({ ...asset, browser_download_url: 'https://github.com/someone/fork/releases/download/v0.5.1/JobeesLair.exfat' })).assets, null, 'another repository');
  assert.equal(without((asset) => ({ ...asset, browser_download_url: asset.browser_download_url.replace('v0.5.1', 'v0.2.1') })).assets, null, "another release's file");
  assert.equal(without((asset) => ({ ...asset, size: '5000' })).assets, null);
  assert.equal(without((asset) => ({ ...asset, size: 0 })).assets, null);
  assert.equal(describeRelease(releaseJson({ assets: releaseJson().assets.slice(0, 1) }), 'JVK3R/JobeesLair').assets, null, 'both files, or neither');
  assert.equal(describeRelease(releaseJson({ assets: undefined }), 'JVK3R/JobeesLair').version, '0.5.1', 'still offered to read and install by hand');
});

test('the queue lends the network only while idle, and takes it back the moment a game download is queued', async () => {
  const fs = memoryFs();
  const downloads = engine(fs);
  const queue = queueWith({ fs, downloads });
  let yielded = 0;
  const giveBack = queue.lendNetwork(() => { yielded++; });
  assert.equal(typeof giveBack, 'function');
  assert.equal(queue.transferring(), true, 'background ShadowMount requests stay off the borrowed network');
  assert.equal(queue.lendNetwork(() => {}), null, 'one borrower at a time');
  const id = queue.enqueue(game, image('Game.exfat'), '/data');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(yielded, 1, 'the borrower is asked to stop');
  assert.equal(downloads.requests.length, 0, 'the game download waits until the network is given back');
  assert.equal(queue.lendNetwork(() => {}), null, 'nothing is lent while a job is queued');
  giveBack();
  const job = await settle(queue, id);
  assert.equal(job.state, 'downloaded');
  assert.equal(downloads.requests.length, 1);
  giveBack();
  const again = queue.lendNetwork(() => {});
  assert.equal(typeof again, 'function', 'idle again: lent again');
  again();
});

test('a request to ShadowMount that cannot wait asks the borrower to stop first', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs) });
  let giveBack;
  giveBack = queue.lendNetwork(() => giveBack());
  const order = [];
  await queue.quietNetwork('test', async () => { order.push(queue.transferring() ? 'still lent' : 'free'); });
  assert.deepEqual(order, ['free']);
});

// The install's world: a USB drive with the installed image, a fake download engine that publishes each file
// at its expected size (or fails as told), an extractor that unpacks update.zip's title folder.
function installWorld({ param: paramFields = {}, eboot = 2000, lendable = () => true, failures = {}, free = 1e12, located = '/mnt/usb0/homebrew/JobeesLair.exfat', armed = () => true, automatic = false, version = VERSION } = {}) {
  const fs = memoryFs();
  fs.mkdir('/mnt/usb0/homebrew');
  fs.file('/mnt/usb0/homebrew/JobeesLair.exfat', 4000);
  const saved = { value: {} };
  const world = { fs, requests: [], extracts: [], arms: [], yields: [], lendCalls: 0, notified: [], logs: [] };
  world.downloads = {
    enqueue(options) {
      world.requests.push(options);
      const file = options.destination.slice(options.destination.lastIndexOf('/') + 1);
      const listeners = new Set();
      let cancel;
      const done = new Promise((resolve, reject) => {
        cancel = () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
        setImmediate(() => {
          for (const listener of listeners) listener({ written: Math.floor(options.expectedBytes / 2) });
          setImmediate(() => {
            const failure = failures[file]?.shift?.();
            if (failure) return reject(new Error(failure));
            fs.file(options.destination, options.expectedBytes);
            fs.file(`${options.destination}.complete`, 0, 'receipt');
            resolve({ state: 'completed' });
          });
        });
      });
      done.catch(() => {});
      return { done, cancel: () => cancel(), subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
    },
  };
  world.archives = {
    extract(options) {
      world.extracts.push(options);
      return task(() => {
        const top = `${options.destination}/${TITLE_ID}`;
        fs.file(`${top}/sce_sys/param.json`, 0, JSON.stringify({ titleId: TITLE_ID, contentVersion: '01.005.001', ...paramFields }));
        if (eboot) fs.file(`${top}/eboot.bin`, eboot);
        return { artifacts: [] };
      });
    },
  };
  let lent = null;
  world.updater = createAutoUpdater({
    fs, downloads: world.downloads, archives: world.archives,
    lend: (onYield) => {
      world.lendCalls++;
      if (lent || !lendable()) return null;
      lent = { onYield };
      world.borrower = lent;
      return () => { lent = null; world.borrower = null; };
    },
    locate: async () => located,
    arm: (dir) => { world.arms.push(dir); return armed(); },
    freeBytes: async () => free,
    store: { get: () => saved.value, set: (next) => { saved.value = next; } },
    controlDir: '/data/JobeesLair/update', version, titleId: TITLE_ID,
    // A wait that lets the rest of the test run (an already-resolved promise would spin the loop forever).
    automatic: () => automatic, notify: (v) => world.notified.push(v), wait: () => new Promise((resolve) => setImmediate(resolve)), log: (line) => world.logs.push(line),
  });
  world.saved = saved;
  world.release = { ...describeRelease(releaseJson(), 'JVK3R/JobeesLair') };
  // A release one version past this build (0.5.1, package version 01.005.001), with its assets.
  world.until = async (test, limit = 500) => {
    for (let i = 0; i < limit; i++) {
      if (test(world.updater.state())) return world.updater.state();
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error(`never reached: ${JSON.stringify(world.updater.state())}`);
  };
  return world;
}
const STAGED = `/mnt/usb0/${STAGING}/0.5.1`;

test('install: both files download into staging on the installed image\'s drive, checked against their SHA-256; update.zip is unpacked, checked and removed', async () => {
  const world = installWorld();
  assert.equal(world.updater.download(world.release), true);
  const state = await world.until((s) => ['ready', 'failed'].includes(s.phase));
  assert.equal(state.phase, 'ready', state.error);
  assert.deepEqual(world.requests.map(({ url, destination, sha256, expectedBytes, recoverCompleted }) => ({ url, destination, sha256, expectedBytes, recoverCompleted })), [
    { url: world.release.assets.zip.url, destination: `${STAGED}/update.zip`, sha256: SHA('b'), expectedBytes: 300, recoverCompleted: true },
    { url: world.release.assets.image.url, destination: `${STAGED}/${IMAGE_NAME}`, sha256: SHA('a'), expectedBytes: 5000, recoverCompleted: true },
  ]);
  assert.equal(IMAGE_NAME.endsWith('.exfat'), false, 'ShadowMount+ never takes the staged image for a second copy');
  assert.equal(world.extracts[0].destination, `${STAGED}/update`);
  assert.deepEqual(world.extracts[0].sources, [`${STAGED}/update.zip`]);
  assert.equal(world.fs.stat(`${STAGED}/${IMAGE_NAME}`).size, 5000);
  assert.ok(!world.fs.exists(`${STAGED}/update.zip`) && !world.fs.exists(`${STAGED}/update`), 'the zip and its unpacked copy are gone once checked');
  assert.equal(world.saved.value.target, '/mnt/usb0/homebrew/JobeesLair.exfat');
  assert.equal(world.saved.value.checked, true);
  assert.equal(state.written, 5300, 'progress counts both files');
  assert.deepEqual(world.notified, ['0.5.1']);
  assert.equal(world.borrower, null, 'the network is given back');
  assert.deepEqual(world.arms, [], 'nothing is armed without automatic installs');
});

test('install: a download that fails its SHA-256 check is tried again, then fails the install; nothing is staged', async () => {
  const world = installWorld({ failures: { [IMAGE_NAME]: ['Downloads.enqueue: SHA-256 mismatch', 'Downloads.enqueue: SHA-256 mismatch', 'Downloads.enqueue: SHA-256 mismatch', 'Downloads.enqueue: SHA-256 mismatch'] } });
  world.updater.download(world.release);
  const state = await world.until((s) => ['ready', 'failed'].includes(s.phase));
  assert.equal(state.phase, 'failed');
  assert.match(state.error, /SHA-256 mismatch/);
  assert.equal(world.requests.filter((r) => r.destination.endsWith(IMAGE_NAME)).length, 4);
  assert.ok(!world.fs.exists(`${STAGED}/${IMAGE_NAME}`));
  assert.equal(world.borrower, null);
});

test('install: one failed try is retried and the install goes on', async () => {
  const world = installWorld({ failures: { [IMAGE_NAME]: ['connection reset'] } });
  world.updater.download(world.release);
  assert.equal((await world.until((s) => ['ready', 'failed'].includes(s.phase))).phase, 'ready');
});

for (const [name, fields, eboot, reason] of [
  ['another title', { titleId: 'PPSA12345' }, 2000, /is for PPSA12345, not PPSA99471/],
  ['another version', { contentVersion: '01.002.000' }, 2000, /is version 01\.002\.000, not 01.005.001/],
  ['no eboot.bin', {}, 0, /has no eboot\.bin/],
]) {
  test(`install: an update.zip for ${name} fails the check, and the image is never downloaded`, async () => {
    const world = installWorld({ param: fields, eboot });
    world.updater.download(world.release);
    const state = await world.until((s) => ['ready', 'failed'].includes(s.phase));
    assert.equal(state.phase, 'failed');
    assert.match(state.error, reason);
    assert.equal(world.requests.length, 1, 'only update.zip');
    assert.ok(!world.fs.exists(`${STAGED}/update`), 'its unpacked copy is removed');
  });
}

test('install: it waits while the queue needs the network, and steps aside when a game download is queued', async () => {
  let free = false;
  const world = installWorld({ lendable: () => free });
  world.updater.download(world.release);
  await world.until((s) => s.phase === 'waiting');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(world.requests.length, 0);
  free = true;
  await world.until(() => world.requests.length === 2);
  // The image is downloading: a game download is queued, the borrower is asked to yield.
  world.borrower.onYield();
  await world.until(() => world.requests.length === 3, 50);
  const state = await world.until((s) => ['ready', 'failed'].includes(s.phase));
  assert.equal(state.phase, 'ready', 'the yield is not counted as a failure');
  assert.equal(world.requests.filter((r) => r.destination.endsWith(IMAGE_NAME)).length, 2, 'the image download started again after the yield');
});

test('install: not enough space on the drive fails before anything downloads, with the shortfall', async () => {
  const world = installWorld({ free: 1000 });
  world.updater.download(world.release);
  const state = await world.until((s) => s.phase === 'failed');
  assert.match(state.error, /needs \d+ bytes free on \/mnt\/usb0/);
  assert.equal(world.requests.length, 0);
});

test('install: an app not installed from a managed .exfat image is not replaced', async () => {
  for (const located of ['/mnt/usb0/homebrew/PPSA99058', '/user/app/PPSA99058/app.pkg', '']) {
    const world = installWorld({ located });
    world.updater.download(world.release);
    const state = await world.until((s) => s.phase === 'failed');
    assert.match(state.error, /not installed from an \.exfat image/);
  }
});

test('install: Restart to apply writes apply.txt for the updater and arms it; a failed arm withdraws it', async () => {
  const world = installWorld();
  world.updater.download(world.release);
  await world.until((s) => s.phase === 'ready');
  assert.deepEqual(world.updater.applyNow(), { ok: true });
  assert.deepEqual(world.arms, ['/data/JobeesLair/update']);
  assert.equal(world.fs.readFile('/data/JobeesLair/update/apply.txt'),
    `UPD1\nversion=0.5.1\ntarget=/mnt/usb0/homebrew/JobeesLair.exfat\nstaged=${STAGED}/${IMAGE_NAME}\nsize=5000\nrelaunch=1\n`);
  assert.equal(world.updater.state().phase, 'armed');
  const failing = installWorld({ armed: () => 'payload loader: connection refused' });
  failing.updater.download(failing.release);
  await failing.until((s) => s.phase === 'ready');
  assert.deepEqual(failing.updater.applyNow(), { ok: false, reason: 'payload loader: connection refused' });
  assert.ok(!failing.fs.exists('/data/JobeesLair/update/apply.txt'));
  assert.equal(failing.updater.state().phase, 'ready');
  assert.equal(failing.updater.state().error, 'payload loader: connection refused');
});

test('install: with automatic installs on, a found release downloads by itself and the updater is armed for the next close', async () => {
  const world = installWorld({ automatic: true });
  world.updater.offer(world.release);
  const state = await world.until((s) => s.phase === 'armed');
  assert.equal(state.phase, 'armed');
  assert.match(world.fs.readFile('/data/JobeesLair/update/apply.txt'), /relaunch=0\n$/);
  world.updater.disarm();
  assert.equal(world.updater.state().phase, 'ready');
  assert.ok(!world.fs.exists('/data/JobeesLair/update/apply.txt'), 'turned off: the request is withdrawn');
});

test('install: without automatic installs a found release only shows; cancel removes what was staged', async () => {
  const world = installWorld();
  world.updater.offer(world.release);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(world.requests.length, 0);
  world.updater.download(world.release);
  await world.until((s) => s.phase === 'ready');
  world.updater.cancel();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(world.updater.state().phase, 'idle');
  assert.ok(!world.fs.exists(STAGED));
  assert.deepEqual(world.saved.value, {});
});

test('install: the new build at launch says it started, cleans up its staging and reports the update', async () => {
  const world = installWorld({ version: '0.5.1' });
  world.saved.value = { phase: 'armed', version: '0.5.1', staging: STAGED, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: { size: 5000 } };
  world.fs.file(`${STAGED}/leftover`, 1);
  world.fs.file('/data/JobeesLair/update/result.txt', 0, 'outcome=swapped\nversion=0.5.1\nreason=\n');
  world.updater.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(world.fs.readFile('/data/JobeesLair/update/booted.txt'), '0.5.1\n', 'the updater waits for this');
  assert.ok(world.fs.exists('/data/JobeesLair/update/result.txt'), 'the updater still watches: its result stays');
  assert.ok(!world.fs.exists(STAGED));
  assert.deepEqual(world.saved.value, {});
  assert.equal(world.updater.state().outcome.outcome, 'applied');
});

test('install: after a rollback the old build reports why; after a refusal the update stays ready (and is armed again when automatic)', async () => {
  const rolled = installWorld();
  rolled.saved.value = { phase: 'armed', version: '0.5.1', staging: STAGED, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: { size: 5000 } };
  rolled.fs.file('/data/JobeesLair/update/result.txt', 0, 'outcome=rolledback\nversion=0.5.1\nreason=the new version closed before it finished starting\n');
  rolled.updater.start();
  assert.equal(rolled.updater.state().phase, 'failed');
  assert.equal(rolled.updater.state().outcome.reason, 'the new version closed before it finished starting');
  assert.ok(!rolled.fs.exists('/data/JobeesLair/update/result.txt'), 'read once');
  assert.equal(rolled.fs.readFile('/data/JobeesLair/update/booted.txt'), `${VERSION}\n`);

  const refused = installWorld({ automatic: true });
  refused.saved.value = { phase: 'armed', version: '0.5.1', staging: STAGED, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: { size: 5000 } };
  refused.fs.file(`${STAGED}/${IMAGE_NAME}`, 5000);
  refused.fs.file('/data/JobeesLair/update/result.txt', 0, 'outcome=refused\nversion=0.5.1\nreason=ShadowMount+ keeps the image mounted (persistent image mounts?)\n');
  refused.updater.start();
  assert.equal(refused.updater.state().phase, 'armed', 'automatic: armed again for the next close');
  assert.deepEqual(refused.arms, ['/data/JobeesLair/update']);

  const rebooted = installWorld();
  rebooted.saved.value = { phase: 'armed', version: '0.5.1', staging: STAGED, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: { size: 5000 } };
  rebooted.fs.file(`${STAGED}/${IMAGE_NAME}`, 5000);
  rebooted.updater.start();
  assert.equal(rebooted.updater.state().phase, 'ready', 'armed, but the updater never ran (the console restarted): ready again');
  assert.equal(rebooted.updater.state().error, '');

  const gone = installWorld();
  gone.saved.value = { phase: 'ready', version: '0.5.1', staging: STAGED, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: { size: 5000 } };
  gone.updater.start();
  assert.equal(gone.updater.state().phase, 'failed', 'the staged image was deleted: download it again');
});

test('install: a download cut off by closing the app resumes when the release is offered again', async () => {
  const world = installWorld();
  world.saved.value = { phase: 'downloading', version: '0.5.1', staging: STAGED, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: world.release.assets.image, zip: world.release.assets.zip, checked: true };
  world.updater.start();
  assert.equal(world.updater.state().phase, 'paused');
  world.updater.offer(world.release);
  const state = await world.until((s) => ['ready', 'failed'].includes(s.phase));
  assert.equal(state.phase, 'ready');
  assert.deepEqual(world.requests.map((r) => r.destination), [`${STAGED}/${IMAGE_NAME}`], 'update.zip was already checked');
});

test('install: a newer release drops the files of the one before', async () => {
  const world = installWorld();
  world.saved.value = { phase: 'ready', version: '0.2.1-beta.1x', staging: `/mnt/usb0/${STAGING}/old`, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: { size: 1 } };
  world.fs.file(`/mnt/usb0/${STAGING}/old/${IMAGE_NAME}`, 1);
  world.fs.file('/data/JobeesLair/update/apply.txt', 0, 'old');
  world.updater.download(world.release);
  await world.until((s) => s.phase === 'ready');
  assert.ok(!world.fs.exists(`/mnt/usb0/${STAGING}/old`));
  assert.ok(!world.fs.exists('/data/JobeesLair/update/apply.txt'));
});


// ---- 0.2.1 beta 1: the Settings freeze (feed refreshes in slices, no re-render without a change) ----
const feedFormat = await load('app/state/feed-format.js');
const sampleFeed = (count) => ({
  version: 1, name: 'Sample feed', mirrors: ['https://mirror.example.com/feed.json'],
  games: Array.from({ length: count }, (_, i) => ({
    id: `PPSA${String(10000 + i).padStart(5, '0')}`, title: `Sample Game ${i}`, description: 'A game. '.repeat(20),
    releases: [{ name: `Sample Game ${i} v1.00`, url: `https://example.com/files/${i}/game.exfat`, size: '42 GB' }],
  })),
});

test('feeds: the paced check gives exactly what the one-shot check gives, a frame at a time', async () => {
  const document = sampleFeed(1600);
  const once = feedFormat.parseFeed(document, 'https://example.com/feed.json');
  let pauses = 0;
  const paced = await feedFormat.parseFeedAsync(document, 'https://example.com/feed.json', async () => { pauses++; });
  assert.deepEqual(paced, once);
  assert.equal(once.games.length, 1500, 'the 1500-game cap holds');
  assert.equal(pauses, Math.floor(1500 / 40), 'one frame per 40 of the 1500 games checked');
  await assert.rejects(feedFormat.parseFeedAsync({ version: 2 }, 'https://example.com/feed.json', async () => {}), /Not a catalog feed/);
});

test('feeds: the paced hash is the same key, in 32 KiB slices', async () => {
  const text = JSON.stringify(feedFormat.feedDocument(feedFormat.parseFeed(sampleFeed(1500), 'https://example.com/feed.json')));
  let pauses = 0;
  const key = await feedFormat.stableKeyAsync(text, async () => { pauses++; });
  assert.equal(key, feedFormat.stableKey(text));
  assert.equal(pauses, Math.floor(text.length / 32768));
  // The hash before it came in steps (0.2.0): cache file names and release ids must stay the same.
  function before(value) {
    let first = 2166136261, second = 5381;
    for (let index = 0; index < value.length; index++) {
      first = Math.imul(first ^ value.charCodeAt(index), 16777619);
      second = Math.imul(second, 33) ^ value.charCodeAt(index);
    }
    return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
  }
  for (const value of ['', 'https://example.com/feed.json', 'é漢字🎮', text]) assert.equal(feedFormat.stableKey(value), before(value));
});

test("feeds: a refresh writes the cache whole, readable as before, without stringifying the document twice", async () => {
  const src = readFileSync(path.join(repo, 'app/state/feeds.js'), 'utf8');
  assert.match(src, /await parseFeedAsync\(document2, url, nextFrame\)/);
  assert.match(src, /await stableKeyAsync\(text, nextFrame\)/);
  const cache = { url: 'u', from: 'u', hash: 'h', fetchedAt: 't', name: 'n', games: 1, skipped: 0, mirrors: [] };
  const text = JSON.stringify({ version: 1, games: [] });
  const written = `${JSON.stringify(cache).slice(0, -1)},"document":${text}}`;
  assert.deepEqual(JSON.parse(written), { ...cache, document: JSON.parse(text) });
});

test('settings: the companion card reads the server once a second for all its viewers and draws only on a change', () => {
  const src = readFileSync(path.join(repo, 'app/companion/service.js'), 'utf8');
  assert.match(src, /if \(sameState\(shown, next\)\) return;/);
  assert.match(src, /if \(!reading\) reading = setInterval\(readState, 1e3\)/);
  assert.doesNotMatch(src, /const id = setInterval\(update, 1e3\)/, 'no timer per card');
});

test('settings: nothing in a render asks the console for its device info or user', () => {
  for (const file of ['app/ui/Settings.jsx', 'app/i18n/index.js', 'app/game/SourcePicker.jsx', 'app/state/downloads.js'])
    assert.doesNotMatch(readFileSync(path.join(repo, file), 'utf8'), /DeviceInfo\.get\(\)/, file);
  const themes = readFileSync(path.join(repo, 'app/ui/themes.js'), 'utf8');
  assert.match(themes, /var userName = \(\) => name;/);
});

test('settings: the support panel is opt-in, says nothing is locked, and its QR code reads as the page', () => {
  const settings = readFileSync(path.join(repo, 'app/ui/Settings.jsx'), 'utf8');
  assert.match(settings, /support \? \/\* @__PURE__ \*\/ \(0, jsx\)\(SupportPanel, \{ onClose:/, 'shown only once its row is opened');
  // Opening it gives it focus, so the whole code scrolls into view and stays there to be scanned.
  assert.match(settings, /if \(!support\) focusLater\("settings:support:qr"\)/);
  assert.match(settings, /focusKey: "settings:support:qr"/);
  assert.match(settings, /https:\/\/buymeacoffee\.com\/jvk3r/);
  assert.match(en['settings.support.free'], /Nothing in Jobee'sLair is locked/);
  assert.match(en['settings.support.detail'], /Optional/);
  const png = readFileSync(path.join(repo, 'app/assets/support-qr.png'));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [222, 222], 'exactly its on-screen size: 37 modules of 6 px, no scaling');
  assert.match(settings, /style: \{ width: 222, height: 222 \}/);
  const funding = readFileSync(path.join(repo, '.github/FUNDING.yml'), 'utf8');
  assert.match(funding, /^buy_me_a_coffee: jvk3r$/m);
});

// ---- link health: a download's own 404 (download-queue.js reportLink → state/link-health.js) ----
const { createLinkHealth, onLinkReport } = await load('app/state/link-health.js');

test("links: a download that fails with 404 reports its link, falls over to the mirror, and the dead link is ranked last (still listed) on the next pick", async () => {
  const fs = memoryFs();
  const reports = [];
  const off = onLinkReport((url, message) => reports.push([url, message]));
  const base = engine(fs);
  const downloads = {
    requests: base.requests,
    enqueue(options) {
      if (options.url.includes('gone.example.com')) {
        base.requests.push(options);
        return task(() => { throw new Error(`Downloads.enqueue ${options.destination}: HTTP 404`); });
      }
      return base.enqueue(options);
    },
  };
  try {
    const queue = queueWith({ fs, downloads });
    const dead = image('Game.exfat');
    dead.url = 'https://gone.example.com/Game.exfat';
    const mirror = { ...image('Game.exfat'), id: 'mirror', provider: 'mirror', url: 'https://mirror.example.com/Game.exfat' };
    const id = queue.enqueue(game, dead, '/data', [mirror]);
    const job = await settle(queue, id);
    assert.equal(job.release.url, mirror.url, 'the mirror took over');
    assert.deepEqual(reports, [['https://gone.example.com/Game.exfat', 'HTTP 404']]);
    const health = createLinkHealth({ http: { request: async () => ({ status: 200 }) }, store: { get: () => null, set() {} }, wait: async () => {} });
    for (const [url, message] of reports) health.report(url, message);
    const shown = health.overlay([dead, mirror]);
    assert.equal(describeSource(shown[0]).group, 'direct', 'still listed, as 0.1.0 listed every link');
    assert.equal(shown[0].linkHealth.status, 'dead');
    assert.equal(preferredRelease(shown), 1);
  } finally {
    off();
  }
});

// ---- a release that does not say its size: the room is checked once the server does ----
function sizedLater(fs, total) {
  // An engine that reports the file's size on its first progress, then runs until cancelled or `finish()`.
  const state = { cancelled: false, requests: [] };
  state.enqueue = (options) => {
    state.requests.push(options);
    let finish, fail;
    const done = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    state.finish = () => {
      fs.remove(`${options.destination}.part`);
      fs.file(options.destination, total);
      fs.file(`${options.destination}.complete`, 0, 'receipt');
      finish({ written: total, total });
    };
    return {
      done,
      cancel: () => { state.cancelled = true; fail(Object.assign(new Error('cancelled'), { name: 'AbortError' })); },
      subscribe: (listener) => { setImmediate(() => listener({ state: 'downloading', written: 0, total, received: 0, connections: 8, bytesPerSecond: 0 })); return () => {}; },
    };
  };
  return state;
}

test('unknown size: once the server reports 50 GB and the drive has 20 GB, the download stops with "Not enough space" (no failover, partial kept)', async () => {
  const fs = memoryFs();
  fs.diskUsage = () => ({ total: 1e12, free: 20e9 });
  const downloads = sizedLater(fs, 50e9);
  const queue = queueWith({ fs, downloads });
  const sizeless = { ...image('Big.exfat'), sizeBytes: null };
  const mirror = { ...image('Big.exfat'), id: 'mirror', provider: 'mirror', url: 'https://mirror.example.com/Big.exfat', sizeBytes: null };
  const id = queue.enqueue(game, sizeless, '/data', [mirror]);
  const job = await settle(queue, id);
  assert.equal(job.state, 'failed');
  assert.match(job.error, /^Not enough space on the selected drive/);
  assert.equal(downloads.cancelled, true, 'stopped before the drive filled');
  assert.equal(downloads.requests.length, 1, 'no failover: another host would need the same room');
  assert.equal(job.release.url, sizeless.url);
});

test('unknown size: when the reported size fits, the download carries on', async () => {
  const fs = memoryFs();
  fs.diskUsage = () => ({ total: 1e12, free: 80e9 });
  const downloads = sizedLater(fs, 50e9);
  const queue = queueWith({ fs, downloads });
  const id = queue.enqueue(game, { ...image('Big.exfat'), sizeBytes: null }, '/data', []);
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(downloads.cancelled, false);
  assert.equal(queue.snapshot().find((item) => item.id === id).total, 50e9);
  downloads.finish();
  const job = await settle(queue, id);
  assert.notEqual(job.state, 'failed', job.error);
});

// ---- the updater loop: a release whose build is not the version its tag says ----
test('install: a swapped-in release that starts as another version fails once with why, and is never fetched by itself again', async () => {
  // The swap happened (result says 0.5.1 swapped/applied), but the build that started reports this VERSION.
  for (const outcome of ['swapped', 'applied']) {
    const world = installWorld({ automatic: true });
    world.saved.value = { phase: 'armed', version: '0.5.1', staging: STAGED, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: { size: 5000 } };
    world.fs.file('/data/JobeesLair/update/result.txt', 0, `outcome=${outcome}\nversion=0.5.1\nreason=\n`);
    world.fs.file('/data/JobeesLair/update/apply.txt', 0, 'UPD1\n');
    world.updater.start();
    const state = world.updater.state();
    assert.equal(state.phase, 'failed', outcome);
    assert.match(state.error, new RegExp(`^The 0.5.1 update started as version ${VERSION.replace(/\./g, '\.')}: the release's files are not the version it says`));
    assert.equal(world.saved.value.mismatched, '0.5.1');
    assert.ok(!world.fs.exists('/data/JobeesLair/update/apply.txt'), 'nothing left armed');
    assert.deepEqual(world.arms, [], 'not armed again');
    // The daily check finds the same release: with automatic installs on, it is shown, not downloaded.
    world.updater.offer(world.release);
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(world.requests, [], `${outcome}: no download loop`);
    // The gamer can still ask for it.
    assert.equal(world.updater.download(world.release), true);
    const asked = await world.until((s) => ['ready', 'armed', 'failed'].includes(s.phase));
    assert.equal(asked.phase, 'armed', asked.error || 'automatic: armed for the next close');
  }
});

test('install: the set-aside version does not hold back the next release', async () => {
  const world = installWorld({ automatic: true, param: { contentVersion: '01.005.002' } });
  world.saved.value = { phase: 'failed', version: '0.5.1', mismatched: '0.5.1', error: 'x' };
  const next = { ...world.release, version: '0.5.2', assets: {
    image: { ...world.release.assets.image, url: world.release.assets.image.url.replace('v0.5.1', 'v0.5.2') },
    zip: { ...world.release.assets.zip, url: world.release.assets.zip.url.replace('v0.5.1', 'v0.5.2') } } };
  world.updater.offer(next);
  const done = await world.until((s) => ['ready', 'armed', 'failed'].includes(s.phase) && s.version === '0.5.2');
  assert.equal(done.phase, 'armed', done.error);
  assert.equal(world.requests.length, 2, 'the newer release downloaded by itself');
});

test('boot confirmation: the installer starts once, from Boot, before the startup notice; App remounts do not redo it', () => {
  const index = readFileSync(path.join(repo, 'app/index.jsx'), 'utf8');
  const update = readFileSync(path.join(repo, 'app/state/update.js'), 'utf8');
  const boot = index.slice(index.indexOf('function Boot()'));
  assert.match(boot, /useEffect\)\(\(\) => startInstaller\(\), \[\]\)/, 'Boot starts the installer on its first render');
  assert.ok(boot.indexOf('startInstaller()') < boot.indexOf('Disclaimer'), 'before the startup notice is involved');
  assert.match(update, /if \(installerStarted\) return;\s*installerStarted = true;/, 'once per launch');
  assert.match(update, /function startUpdateChecks\(\) \{\s*startInstaller\(\);/, 'the update checks rely on it, not repeat it');
});

// ---- 0.3.0 beta 1: what a release is for a 13.60 console (release-sets.js releaseType) ----
const { releaseType, withReleaseTypes } = await load('app/state/release-sets.js');
const { createReleaseCache } = await load('app/state/release-cache.js');
const { ps5FakePackagesLaunch } = await load('app/state/firmware.js');

test('release types: images, folder dumps and backports are 13.60 ready; a PS5 FPKG is not; FFPKG is never mistaken for FPKG', () => {
  const type = (release, platform = 'ps5') => { const t = releaseType(release, platform); return [t.dumpType, t.imageFormat, t.compatible1360]; };
  assert.deepEqual(type({ format: 'exfat', filename: 'Game.exfat' }), ['image', 'exfat', true]);
  assert.deepEqual(type({ format: 'ffpkg', filename: 'Game.ffpkg' }), ['image', 'ffpkg', true]);
  assert.deepEqual(type({ format: 'ffpfsc', filename: 'Game.ffpfsc' }), ['image', 'ffpfs', true]);
  assert.deepEqual(type({ format: 'pkg', filename: 'PPSA01234-game.pkg' }), ['fpkg', null, false], 'PS5: installs, does not launch above 11.60');
  assert.deepEqual(type({ format: 'pkg', filename: 'CUSA01234-game.pkg' }, 'ps4'), ['fpkg', null, null], 'PS4: not confirmed either way');
  assert.deepEqual(type({ format: 'rar', label: 'USA Folder Dump - Direct', filename: 'Game.rar' }), ['folder', null, true]);
  assert.deepEqual(type({ format: 'rar', label: 'USA Base - Direct', url: 'https://h.example/Game_ShadowMount.rar', filename: 'x.rar' }), ['folder', null, true]);
  assert.deepEqual(type({ format: 'zip', filename: 'Game.exfat.zip' }), ['image', 'exfat', true], 'an archive of an image');
  assert.deepEqual(type({ format: 'rar', label: 'USA FFPKG - Direct', filename: 'Game.rar' }), ['image', 'ffpkg', true], 'FFPKG is an image');
  assert.deepEqual(type({ format: 'rar', filename: 'Game.ffpkg.rar' }), ['image', 'ffpkg', true]);
  assert.deepEqual(type({ format: 'rar', label: 'USA Base FPKG - Direct', filename: 'Game.rar' }), ['fpkg', null, false]);
  assert.deepEqual(type({ format: 'rar', filename: 'Game.pkg.rar' }), ['fpkg', null, false]);
  assert.deepEqual(type({ format: 'zip', label: 'USA Backport (v01.10) - Direct', filename: 'Game-Backport.zip' }, 'ps4'), ['backport', null, true]);
  assert.equal(releaseType({ format: 'zip', label: 'USA Backport (v01.10)' }, 'ps4').platform, 'ps4');
  assert.deepEqual(type({ format: 'rar', filename: 'Game.rar' }), ['unknown', null, null], 'nothing says: nothing claimed');
  assert.deepEqual(type({ format: 'binary', filename: 'download' }), ['unknown', null, null]);
  assert.deepEqual(type({ format: 'archive-set', label: 'USA Base · 3 parts', parts: [{ number: 1, sources: [{ filename: 'Game.ShadowMount.part1.rar' }] }] }), ['folder', null, true], "a set, by its parts' names");
  assert.deepEqual(type({ format: 'exfat', filename: 'Game%20exFAT.exfat' }), ['image', 'exfat', true]);
});

test('firmware: PS5 fake packages launch up to 11.60 only', () => {
  assert.equal(ps5FakePackagesLaunch('13.60'), false);
  assert.equal(ps5FakePackagesLaunch('12.00'), false);
  assert.equal(ps5FakePackagesLaunch('11.60'), true);
  assert.equal(ps5FakePackagesLaunch('11.0'), true);
  assert.equal(ps5FakePackagesLaunch('4.03'), true);
  assert.equal(ps5FakePackagesLaunch(null), null, 'unknown firmware: not claimed');
});

test('ranking: a source that runs on 13.60 is recommended over a PS5 FPKG, even from a faster host', () => {
  const fpkg = { id: 'f', provider: 'archive.org', url: 'https://archive.org/download/x/PPSA01234-game.pkg', format: 'pkg', filename: 'PPSA01234-game.pkg', label: 'USA Base (v01.00) - Direct' };
  const dump = { id: 'd', provider: 'mirror.example', url: 'https://mirror.example/Game.rar', format: 'rar', filename: 'Game.rar', label: 'USA Folder Dump (v01.00) - Direct' };
  const typed = withReleaseTypes([fpkg, dump], 'ps5');
  assert.equal(preferredRelease([fpkg, dump]), 0, 'without types Archive.org would come first');
  assert.equal(preferredRelease(typed), 1);
  assert.equal(preferredRelease(withReleaseTypes([fpkg], 'ps5')), 0, 'the only source is still offered');
});

test('release cache: every release carries its type, the platform from the title ID', () => {
  const files = {
    'data/releases/PPSA01234.json': [{ id: 'a', provider: 'h', url: 'https://h.example/PPSA01234.pkg', format: 'pkg', filename: 'PPSA01234.pkg', label: 'Base' }],
    'data/releases/CUSA01234.json': [{ id: 'b', provider: 'h', url: 'https://h.example/CUSA01234.pkg', format: 'pkg', filename: 'CUSA01234.pkg', label: 'Base' }],
  };
  const cache = createReleaseCache((file) => JSON.stringify(files[file]));
  const [ps5] = cache('data/releases/PPSA01234.json');
  const [ps4] = cache('data/releases/CUSA01234.json');
  assert.deepEqual([ps5.dumpType, ps5.compatible1360, ps5.platform], ['fpkg', false, 'ps5']);
  assert.deepEqual([ps4.dumpType, ps4.compatible1360, ps4.platform], ['fpkg', null, 'ps4']);
});

test('release types: words joined by underscores count (Game_ShadowMount, Folder_Dump, exFAT_v1)', () => {
  const type = (release) => releaseType(release, 'ps5').dumpType;
  assert.equal(type({ format: 'rar', filename: 'Game_Folder_Dump.rar' }), 'folder');
  assert.equal(type({ format: 'zip', filename: 'Game_exFAT_v1.zip' }), 'image');
  assert.equal(type({ format: 'rar', filename: 'Game_FPKG_v1.rar' }), 'fpkg');
  assert.equal(type({ format: 'rar', filename: 'Game_FFPKG_v1.rar' }), 'image');
  assert.equal(type({ format: 'rar', filename: 'Packages.rar' }), 'unknown', '"pkg" inside a word is not a package');
  assert.equal(type({ format: 'rar', label: 'Exfatigue Edition', filename: 'Game.rar' }), 'unknown', '"exfat" inside a word is not an image');
});

// ---- files of no stated format (from Overdrive 1.0.6): routed by their name, a web page refused ----
const unknownHeaders = (title = '') => ({ streams: false, inspect: () => ({ kind: null, title }) });
const binary = (url) => ({ id: 'bin', provider: 'host', url, filename: 'PPSA01234-game.binary', format: 'binary', sizeBytes: null });

test('a ".binary" whose headers say nothing goes by its link\'s name: an .ffpfsc lands in homebrew for ShadowMount+', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs, { 'PPSA01234-game.binary': 5e9 }), archives: unknownHeaders() });
  const id = queue.enqueue(game, binary('https://example.com/files/Game%20Name.ffpfsc'), '/data');
  const job = await settle(queue, id);
  assert.equal(job.state, 'downloaded');
  assert.equal(job.artifact.nextAction, 'shadowmount');
  assert.match(job.artifact.destination, /^\/data\/homebrew\/PPSA01234-game\.ffpfsc$/);
});

test('a small ".binary" nothing names is the host\'s web page: it fails as "not a game file"', async () => {
  const fs = memoryFs();
  const queue = queueWith({ fs, downloads: engine(fs, { 'PPSA01234-game.binary': 30_000 }), archives: unknownHeaders() });
  const job = await settle(queue, queue.enqueue(game, binary('https://example.com/d/abc'), '/data'));
  assert.equal(job.state, 'failed');
  assert.match(job.error, /^Not a game file/);
});

test('a PKG whose header names another game is flagged, not refused', async () => {
  const fs = memoryFs();
  const archives = { streams: false, inspect: () => ({ kind: 'pkg', title: 'CUSA99999' }) };
  const queue = queueWith({ fs, downloads: engine(fs, { 'PPSA01234-game.binary': 5e9 }), archives });
  const job = await settle(queue, queue.enqueue(game, binary('https://example.com/d/abc'), '/data'));
  assert.equal(job.titleMismatch, 'CUSA99999');
  assert.notEqual(job.state, 'failed');
});

test('launch: a finished ".binary" an earlier build left is routed once its name tells what it is', () => {
  const fs = memoryFs();
  const release = binary('https://example.com/files/Game.exfat');
  const artifact = DownloadFormats.artifact(release, '/data');
  fs.file(artifact.destination, 5e9);
  fs.file('/data/app/JobeesLair/downloads.json', 0, JSON.stringify({ version: 1, jobs: [{
    id: 'PPSA01234/bin', gameId: 'PPSA01234', titleId: 'PPSA01234', title: 'Test Game', release, root: '/data', artifact,
    downloadDestination: artifact.destination, state: 'file-downloaded', error: '', message: '', written: 5e9, total: 5e9 }] }));
  const queue = queueWith({ fs, downloads: engine(fs), archives: unknownHeaders() });
  const [job] = queue.snapshot();
  assert.equal(job.state, 'downloaded');
  assert.equal(job.artifact.destination, '/data/homebrew/PPSA01234-game.exfat');
  assert.ok(fs.exists('/data/homebrew/PPSA01234-game.exfat') && !fs.exists(artifact.destination));
});

test('sets: a numbered "backport files" download is its own file, never a part of a set', async () => {
  const { releaseSets, isPatchOnly } = await load('app/state/release-sets.js');
  const patch = (n) => ({ id: `p${n}`, record: 'r', provider: 'host', label: `USA BackPort Files part ${n}`, url: `https://example.com/Game_Backport_Files.part${n}.rar` });
  assert.ok(isPatchOnly(patch(1)));
  assert.deepEqual(releaseSets([patch(1), patch(2)]).map(({ id, parts }) => [id, Boolean(parts)]), [['p1', false], ['p2', false]]);
  const full = (n) => ({ ...patch(n), id: `f${n}`, label: `USA Base part ${n}`, url: `https://example.com/Game.part${n}.rar` });
  assert.equal(releaseSets([full(1), full(2)]).length, 1, 'a real set still joins');
});

// ---- browser capture (from Overdrive 1.0.6): the file link read out of the console's browser ----
const { BrowserRequired } = await load('app/state/download-sources.js');
const PAGE = 'https://1fichier.com/?abc123def456';
// A fake BrowserCapture: each capture() answers the next link in `links` (armed at once), and records its options.
function capturer(links) {
  const asked = [];
  return {
    asked,
    capture(options) {
      asked.push(options);
      const url = links.shift();
      return { subscribe: (fn) => (fn({ state: 'capturing' }), () => {}), done: url ? Promise.resolve({ url }) : new Promise(() => {}), cancel() {} };
    },
  };
}
// The one-byte range probe each captured link gets: 206 and its length, or a page.
const probe = (sizes) => ({ async request(url, options = {}) {
  const size = sizes[url];
  if (options.headers?.Range && size) return { status: 206, ok: true, url, headers: { 'content-range': `bytes 0-0/${size}`, 'content-length': '1', 'content-type': 'application/octet-stream' }, text: async () => 'x' };
  return { status: 200, ok: true, url, headers: { 'content-type': 'text/html' }, text: async () => '<html></html>', json: async () => ({}) };
} });
function captureQueue({ fs, downloads, http, browserCapture, opened, outcomes = [] }) {
  return createDownloadQueue({
    fs, downloads, http, formats: DownloadFormats, dataDir: '/data/app', platform: 'desktop',
    notifications: { show() {} }, power: { keepAwake() {} }, linking: { openURL: (url) => (opened.push(url), true) }, browserCapture, onCapture: (source, ok) => outcomes.push([source.id, ok]),
    // A host page needs the browser; a link the gamer typed in is the file (as download-sources.js has it).
    sources: { resolve: async (release, { directURL } = {}) => {
      if (directURL) return { url: directURL, rejectHtml: true };
      throw new BrowserRequired(release.browserUrl || release.url);
    } }, archives: null, packages: null, wait: async () => {},
  });
}
const hosted = { id: 'h', provider: '1fichier.com', url: PAGE, browserUrl: PAGE, requiresBrowser: true, format: 'exfat', filename: 'Game.exfat', sizeBytes: 5e9 };
async function until(queue, id, check) {
  for (let i = 0; i < 300; i++) {
    const job = queue.snapshot().find((item) => item.id === id);
    if (job && check(job)) return job;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`never: ${JSON.stringify(queue.snapshot().find((item) => item.id === id))}`);
}

// 0.5.0 Pre Release 3: a download in parts opens the browser for its next part by itself, after a countdown.
function partsQueue({ fs, browserCapture, notices, autoContinue = () => true }) {
  return createDownloadQueue({
    fs, downloads: engine(fs), http: probe({}), formats: DownloadFormats, dataDir: '/data/app', platform: 'desktop',
    notifications: { show: (title) => notices.push(title) }, power: { keepAwake() {} }, linking: { openURL: () => true }, browserCapture,
    sources: { resolve: async (release) => {
      if (release.requiresBrowser) throw new BrowserRequired(release.browserUrl);
      return { url: release.url };
    } }, archives: null, packages: null, wait: async () => {}, autoContinue, autoOpenMs: 20,
  });
}
const browserParts = { id: 'set', provider: 'host', filename: 'Game', parts: [
  { number: 1, sources: [{ url: 'https://example.com/Game.part1.rar', sizeBytes: 100 }] },
  { number: 2, sources: [{ url: PAGE, browserUrl: PAGE, requiresBrowser: true, sizeBytes: 100 }] },
] };

test('parts: after a part finishes, the next part that needs the browser opens it by itself after a countdown', async () => {
  const fs = memoryFs();
  const notices = [];
  const browserCapture = capturer([]);
  const queue = partsQueue({ fs, browserCapture, notices });
  const id = queue.enqueue(game, browserParts, '/data');
  const waiting = await until(queue, id, (job) => job.state === 'awaiting-browser');
  assert.ok(waiting.autoOpenAt > 0, 'it counts down');
  assert.equal(waiting.partIndex, 1);
  assert.equal(notices.length, 1, 'and says so');
  await new Promise((resolve) => setTimeout(resolve, 60));
  await until(queue, id, (job) => !job.autoOpenAt);
  assert.equal(browserCapture.asked.length, 1, 'the capture for part 2 started without a press');
});

test('parts: a captured file named for another part is refused, and the capture scans on to this part', async () => {
  const fs = memoryFs();
  const notices = [];
  const WRONG = 'https://cdn.example.com/f/PPSA01234.Game.part1.rar', RIGHT = 'https://cdn.example.com/f/PPSA01234.Game.part2.rar';
  const browserCapture = capturer([WRONG, RIGHT]);
  const downloads = engine(fs);
  const queue = createDownloadQueue({
    fs, downloads, http: probe({ [WRONG]: 100, [RIGHT]: 100 }), formats: DownloadFormats, dataDir: '/data/app', platform: 'desktop',
    notifications: { show: (title) => notices.push(title) }, power: { keepAwake() {} }, linking: { openURL: () => true }, browserCapture,
    sources: { resolve: async (release, { directURL } = {}) => {
      if (directURL) return { url: directURL };
      if (release.requiresBrowser) throw new BrowserRequired(release.browserUrl);
      return { url: release.url };
    } }, archives: null, packages: null, wait: async () => {}, autoContinue: () => true, autoOpenMs: 5,
  });
  const id = queue.enqueue(game, browserParts, '/data');
  await until(queue, id, (job) => job.state === 'awaiting-browser');
  for (let i = 0; i < 40 && !downloads.requests.some((request) => request.url === RIGHT); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  const urls = downloads.requests.map((request) => request.url);
  assert.ok(urls.includes(RIGHT), urls.join(' '));
  assert.ok(!urls.includes(WRONG), 'part 1 was not downloaded again as part 2');
});

test('errors: a set volume that is a copy of another part is named, to download that part again', async () => {
  const { explainError } = await load('app/downloads/errors.js');
  const copied = explainError('Incomplete RAR archive or missing volume. Volume 4 of 10 is a copy of part 3.', true);
  assert.equal(copied.title, 'Part 4 is a copy of part 3');
  assert.equal(copied.action, en['errors.action.retryPart']);
  const { INCOMPLETE_PART } = await load('app/downloads/errors.js');
  assert.equal(INCOMPLETE_PART.exec('Incomplete RAR archive or missing volume. Volume 4 of 10 is a copy of part 3.')[1], '4', 'the queue deletes volume 4');
});

test('parts: "Wait" stops the countdown, and with the setting off nothing opens by itself', async () => {
  for (const [autoContinue, wait] of [[() => true, true], [() => false, false]]) {
    const fs = memoryFs();
    const notices = [];
    const browserCapture = capturer([]);
    const queue = partsQueue({ fs, browserCapture, notices, autoContinue });
    const id = queue.enqueue(game, browserParts, '/data');
    await until(queue, id, (job) => job.state === 'awaiting-browser');
    if (wait) queue.waitForPart(id);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const job = queue.snapshot().find((item) => item.id === id);
    assert.equal(job.autoOpenAt, undefined);
    assert.equal(browserCapture.asked.length, 0);
    assert.equal(job.state, 'awaiting-browser', 'it waits for the player');
  }
});

test('capture: a host only the browser passes; the file link naming the title id is caught, checked and downloaded', async () => {
  const fs = memoryFs();
  const downloads = engine(fs);
  const opened = [];
  const FILE = 'https://storage.example.bhs.io.cloud.ovh.net/PPSA01234-Game.exfat?sig=abc';
  const browserCapture = capturer([FILE]);
  const outcomes = [];
  const queue = captureQueue({ fs, downloads, http: probe({ [FILE]: 5e9 }), browserCapture, opened, outcomes });
  const id = queue.enqueue(game, hosted, '/data');
  await until(queue, id, (job) => job.state === 'awaiting-browser');
  queue.openBrowser(id);
  const job = await until(queue, id, (item) => item.state === 'downloaded');
  assert.deepEqual(opened, [PAGE], 'the page opened once the capture was armed');
  assert.equal(browserCapture.asked[0].prefix, 'https://');
  assert.equal(browserCapture.asked[0].suffix, '/PPSA01234', 'any https file link naming the title id');
  assert.equal(downloads.requests[0].url, FILE);
  assert.equal(downloads.requests[0].expectedBytes, 5e9, 'the length the probe gave');
  assert.equal(job.captureState, undefined, 'the capture is over');
  assert.deepEqual(outcomes, [['h', true]], 'the host learns it works');
});

test('capture: a file that names no game waits for the gamer; refused, the capture scans on to the next link', async () => {
  const fs = memoryFs();
  const downloads = engine(fs);
  const opened = [];
  const UNNAMED = 'https://abc.r2.cloudflarestorage.com/f/x9.rar', NAMED = 'https://abc.r2.cloudflarestorage.com/f/PPSA01234.exfat';
  const browserCapture = capturer([UNNAMED, NAMED]);
  const queue = captureQueue({ fs, downloads, http: probe({ [UNNAMED]: 7e9, [NAMED]: 6e9 }), browserCapture, opened });
  const id = queue.enqueue(game, { ...hosted, sizeBytes: null }, '/data');
  await until(queue, id, (job) => job.state === 'awaiting-browser');
  queue.openBrowser(id);
  const asking = await until(queue, id, (job) => job.captureState === 'confirm');
  assert.deepEqual(asking.captureFile, { name: 'x9.rar', bytes: 7e9 });
  queue.confirmCapturedFile(id, false);
  await until(queue, id, (job) => job.state === 'downloaded');
  assert.deepEqual(browserCapture.asked[1].rejected, [UNNAMED], 'the refused link is scanned past');
  assert.equal(browserCapture.asked[1].resume, true);
  assert.equal(downloads.requests[0].url, NAMED);
});

test("capture: Vikingfile by its file's exact name; a failed capture leaves the link to be typed in", async () => {
  const fs = memoryFs();
  const downloads = engine(fs);
  const opened = [];
  const VPAGE = 'https://vikingfile.com/f/abcdefghij';
  const FILE = 'https://vikingfile.com/d/abcdefghij/Game%20Name.exfat';
  const http = { async request(url, options = {}) {
    if (url === VPAGE) return { status: 200, ok: true, url, headers: {}, text: async () => '<div id="filename">Game Name.exfat</div><div id="size">4.66 GB</div>' };
    if (url === FILE && options.headers?.Range) return { status: 206, ok: true, url, headers: { 'content-range': 'bytes 0-0/5000000000', 'content-length': '1', 'content-type': 'application/octet-stream', etag: '"v1"' }, text: async () => 'x' };
    return { status: 404, ok: false, url, headers: {}, text: async () => '' };
  } };
  const viking = { ...hosted, id: 'v', provider: 'VikingFile', url: VPAGE, browserUrl: VPAGE };
  const browserCapture = capturer([FILE]);
  const queue = captureQueue({ fs, downloads, http, browserCapture, opened });
  const id = queue.enqueue(game, viking, '/data');
  await until(queue, id, (job) => job.state === 'awaiting-browser');
  queue.openBrowser(id);
  await until(queue, id, (job) => job.state === 'downloaded');
  assert.deepEqual(browserCapture.asked[0], { prefix: 'https://vikingfile.com/d/', suffix: '/Game Name.exfat', timeoutSeconds: 180 });
  // The same source again, its capture catching nothing that checks out: it waits for the link, typed in.
  const fs2 = memoryFs();
  const outcomes2 = [];
  const queue2 = captureQueue({ fs: fs2, downloads: engine(fs2), http, browserCapture: capturer(['https://vikingfile.com/d/abcdefghij/Other.exfat']), opened: [], outcomes: outcomes2 });
  const id2 = queue2.enqueue(game, viking, '/data');
  await until(queue2, id2, (job) => job.state === 'awaiting-browser');
  queue2.openBrowser(id2);
  const failed = await until(queue2, id2, (job) => job.captureState === 'failed');
  assert.equal(failed.state, 'awaiting-browser');
  assert.match(failed.captureError, /does not match the selected file/);
  assert.deepEqual(outcomes2, [['v', false]], 'and that it failed');
  queue2.continueWithURL(id2, FILE);
  await until(queue2, id2, (job) => job.state === 'downloaded');
});

test("capture: without the runtime's capture (the desktop preview), the browser opens as before", async () => {
  const fs = memoryFs();
  const opened = [];
  const queue = captureQueue({ fs, downloads: engine(fs), http: probe({}), browserCapture: null, opened });
  const id = queue.enqueue(game, hosted, '/data');
  await until(queue, id, (job) => job.state === 'awaiting-browser');
  queue.openBrowser(id);
  const job = queue.snapshot().find((item) => item.id === id);
  assert.deepEqual(opened, [PAGE]);
  assert.equal(job.captureState, undefined);
});

test('a download card names the file format, and says nothing of an unknown one once finished', async () => {
  const { formatOf } = await load('app/downloads/labels.js');
  assert.equal(formatOf({ state: 'downloading', fileName: 'Game.part03.rar' }), 'RAR');
  assert.equal(formatOf({ state: 'downloading', inspected: 'exfat' }), 'EXFAT');
  assert.notEqual(formatOf({ state: 'downloading', artifact: { format: 'binary' } }), '', 'still to be checked');
  assert.equal(formatOf({ state: 'installed', artifact: { format: 'binary' } }), '');
  assert.equal(formatOf({ state: 'failed' }), '');
});

// ---- the Format filter (0.5.0 Pre Release 3): state/formats.js, data/formats.js ----
test('formats: data/formats.js is current with the bundled releases (run tools/catalog/formats.mjs)', async () => {
  const { buildFormats, formatsModule } = await load('tools/catalog/formats.mjs');
  const shipped = readFileSync(path.join(repo, 'app/data/formats.js'), 'utf8');
  assert.equal(shipped, formatsModule(buildFormats()));
});

test('formats: a game is 13.60 ready with a folder dump or any disk image, not with an FPKG or backport alone', async () => {
  const { gameFormats, ready1360 } = await load('app/state/formats.js');
  const kinds = gameFormats([
    { id: 'a', format: 'pkg', label: 'EUR Base', url: 'https://example.com/a.pkg' },
    { id: 'b', format: 'binary', label: 'USA BackPort 4.03 - Vikingfile', url: 'https://example.com/b' },
    { id: 'c', format: 'ffpfsc', label: 'Release', url: 'https://example.com/c.ffpfsc' },
  ], 'ps5');
  assert.deepEqual(kinds, ['ffpfs', 'backport', 'fpkg']);
  assert.equal(ready1360(kinds), true);
  assert.equal(ready1360(['backport', 'fpkg']), false);
  assert.deepEqual(gameFormats([{ id: 'd', format: 'binary', label: 'Folder Dump - Gofile', url: 'https://example.com/d.rar' }], 'ps5'), ['folder']);
});

// A slower until, for flows that wait on timers (the capture-ahead countdown).
async function untilTimed(queue, id, check, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const job = queue.snapshot().find((item) => item.id === id);
    if (job && check(job)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('never: ' + JSON.stringify(queue.snapshot().find((item) => item.id === id)));
}

// 0.5.0 Pre Release 4: while one part downloads, the next part's link is captured ahead, so the set never stops.
test('parts: the next part\'s link is captured while the part before downloads, and the set goes straight on', async () => {
  const fs = memoryFs();
  const notices = [];
  const RIGHT = 'https://cdn.example.com/f/PPSA01234.Game.part2.rar';
  const browserCapture = capturer([RIGHT]);
  let release1;
  const gate = new Promise((resolve) => { release1 = resolve; });
  const requests = [];
  const downloads = { requests, enqueue(options) {
    requests.push(options);
    const finish = () => {
      fs.remove(`${options.destination}.part`);
      fs.file(options.destination, options.expectedBytes ?? 100);
      fs.file(`${options.destination}.complete`, 0, 'receipt');
      return { written: options.expectedBytes ?? 100, total: options.expectedBytes ?? 100 };
    };
    // Part 1 holds until the test lets it end; any other part ends at once.
    const done = /part-1\.bin$/.test(options.destination) ? gate.then(finish) : new Promise((resolve) => setImmediate(() => resolve(finish())));
    return { subscribe: () => () => {}, done, cancel() {} };
  } };
  const states = new Set();
  const queue = createDownloadQueue({
    fs, downloads, http: probe({ [RIGHT]: 100 }), formats: DownloadFormats, dataDir: '/data/app', platform: 'desktop',
    notifications: { show: (title) => notices.push(title) }, power: { keepAwake() {} }, linking: { openURL: () => true }, browserCapture,
    sources: { resolve: async (release) => {
      if (release.requiresBrowser) throw new BrowserRequired(release.browserUrl);
      return { url: release.url };
    } }, archives: null, packages: null, wait: async () => {}, autoContinue: () => true, autoOpenMs: 5,
  });
  queue.subscribe((jobs) => jobs.forEach((job) => states.add(job.state)));
  const id = queue.enqueue(game, browserParts, '/data');
  const counting = await untilTimed(queue, id, (job) => Boolean(job.aheadAt));
  assert.equal(counting.aheadPart, 1, 'part 2 counts down while part 1 downloads');
  for (let i = 0; i < 100 && queue.snapshot().find((job) => job.id === id).aheadState !== 'ready'; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(queue.snapshot().find((job) => job.id === id).aheadState, 'ready', 'its link was captured ahead');
  assert.equal(browserCapture.asked.length, 1);
  release1();
  await untilTimed(queue, id, (job) => !['queued', 'resolving', 'connecting', 'downloading'].includes(job.state));
  assert.ok(requests.some((request) => request.url === RIGHT), 'part 2 downloaded from the captured link');
  assert.ok(!states.has('awaiting-browser'), 'the set never stopped for the browser');
});

test('parts: "Wait" stops a capture ahead before its browser opens', async () => {
  const fs = memoryFs();
  const browserCapture = capturer([]);
  let release1;
  const gate = new Promise((resolve) => { release1 = resolve; });
  const downloads = { requests: [], enqueue(options) {
    const finish = () => { fs.file(options.destination, 100); fs.file(`${options.destination}.complete`, 0, 'receipt'); return { written: 100, total: 100 }; };
    return { subscribe: () => () => {}, done: /part-1\.bin$/.test(options.destination) ? gate.then(finish) : Promise.resolve(finish()), cancel() {} };
  } };
  const queue = createDownloadQueue({
    fs, downloads, http: probe({}), formats: DownloadFormats, dataDir: '/data/app', platform: 'desktop',
    notifications: { show() {} }, power: { keepAwake() {} }, linking: { openURL: () => true }, browserCapture,
    sources: { resolve: async (release) => { if (release.requiresBrowser) throw new BrowserRequired(release.browserUrl); return { url: release.url }; } },
    archives: null, packages: null, wait: async () => {}, autoContinue: () => true, autoOpenMs: 40,
  });
  const id = queue.enqueue(game, browserParts, '/data');
  await untilTimed(queue, id, (job) => Boolean(job.aheadAt));
  queue.waitForPart(id);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(browserCapture.asked.length, 0, 'no browser opened');
  assert.equal(queue.snapshot().find((job) => job.id === id).aheadState, undefined);
  release1();
  await untilTimed(queue, id, (job) => job.state === 'awaiting-browser');
});

// ---- 0.5.0 Pre Release 4: the companion's QR code, the screen saver, What's new ----
test('qr: the companion address encodes as the code zbar read back (version 2, finders in place)', async () => {
  const { qrMatrix } = await load('app/ui/qr.js');
  const { createHash } = await import('node:crypto');
  const m = qrMatrix('http://192.168.1.13:34177');
  assert.deepEqual([m.size, m.version], [25, 2]);
  for (const [x, y] of [[0, 0], [24, 0], [0, 24]]) {
    const cx = x ? x - 3 : 3, cy = y ? y - 3 : 3;
    assert.ok(m.dark(x, y) && m.dark(cx, cy) && !m.dark(cx - 2, cy - 2), `finder at ${x},${y}`);
  }
  const rows = Array.from({ length: m.size }, (_, y) => Array.from({ length: m.size }, (_, x) => m.dark(x, y) ? '1' : '0').join(''));
  // The matrix scanned with zbarimg when this encoder was written (13 texts, versions 1 to 10, all read back).
  assert.equal(createHash('sha256').update(rows.join('\n')).digest('hex'), '83888caee8255ac7272432e21a3c585e70a23d88259aaa8f64141622f41b3762');
  assert.equal(qrMatrix('x'.repeat(210)).version, 10);
  assert.throws(() => qrMatrix('x'.repeat(300)));
});

test('screen saver: its slides are full-screen links to popular games\' own store art, and the clock needs no Date', async () => {
  const { slides } = await load('app/data/screensaver.js');
  assert.ok(slides.length >= 40, `${slides.length} slides`);
  for (const slide of slides) {
    assert.match(slide.url, /^https:\/\/(shared\.akamai\.steamstatic\.com|image\.api\.playstation\.com)\//, slide.url);
    assert.ok(slide.title && slide.id);
  }
  const source = readFileSync(path.join(repo, 'app/ui/ScreenSaver.jsx'), 'utf8');
  assert.match(readFileSync(path.join(repo, 'app/state/screen-saver.js'), 'utf8'), /var IDLE_MS = 10 \* 60 \* 1e3;/, 'ten minutes');
  assert.doesNotMatch(source, /new Date\b/);
});

test('what\'s new: shown until seen once for 0.5.0', async () => {
  const { WHATS_NEW } = await load('app/state/whats-new.js');
  assert.equal(WHATS_NEW, '0.5.0');
  for (const key of ['whatsNew.title', 'whatsNew.homebrew', 'whatsNew.done', 'saver.wake', 'settings.screenSaver', 'downloads.aheadReady']) assert.ok(en[key], key);
});

// ---- the ✕ on a finished download card (0.5.0 Pre Release 4): it clears the card, it never deletes the game ----
test('a finished card\'s ✕ only clears it from Downloads; the game stays in the library; an unfinished one cancels', async () => {
  const { clearAction } = await load('app/downloads/labels.js');
  for (const state of ['installed', 'downloaded', 'attention', 'extracted', 'file-downloaded']) assert.equal(clearAction(state), 'clear', state);
  for (const state of ['downloading', 'paused', 'failed', 'queued']) assert.equal(clearAction(state), 'cancel', state);
  const job = { id: 'g/1', gameId: 'g', title: 'G', state: 'installed', cleared: true, root: '/data', artifact: { nextAction: 'shadowmount', destination: '/data/homebrew/G.ffpfsc' } };
  const entries = shelfEntries({ jobs: [job], files: [], gameOf: () => undefined });
  assert.equal(entries.length, 1, 'a cleared job is still a game in the library');
});

// ---- Homebrew apps in the library (0.5.0 Pre Release 4): their name and picture, not a file name ----
test('library: a homebrew app shows as itself (name, art), and Jobee\'sLair\'s own image is not listed', () => {
  const hb = { id: 'swordpdf/ps5sx2', name: 'PS5SX2', category: 'emulators', icon: 'https://example.com/i.png', files: [] };
  const files = [
    { kind: 'images', path: '/data/homebrew/PPSA99203', name: 'PPSA99203', titleId: 'PPSA99203', isDirectory: true, size: 40e6, root: '/data', installed: true },
    { kind: 'images', path: '/data/homebrew/JobeesLair.exfat', name: 'JobeesLair.exfat', titleId: null, size: 470e6, root: '/data' },
    { kind: 'images', path: '/data/homebrew/Other.exfat', name: 'Other.exfat', titleId: null, size: 1e6, root: '/data' },
  ];
  const homebrewOf = (file) => file.name === 'JobeesLair.exfat' ? { id: 'jobeeslair', name: 'Jobee\'sLair', self: true } : file.name === 'PPSA99203' ? hb : null;
  const entries = shelfEntries({ jobs: [], files, gameOf: () => undefined, homebrewOf });
  assert.deepEqual(entries.map((e) => e.game.title).sort(), ['Other.exfat', 'PS5SX2']);
  assert.equal(entries.find((e) => e.game.title === 'PS5SX2').game.homebrewApp, hb);
});
