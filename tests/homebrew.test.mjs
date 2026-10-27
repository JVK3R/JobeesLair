// The Homebrew section (0.5.0): the index as the app reads it (app/state/homebrew-index.js), installing from
// it against an in-memory console (app/state/homebrew.js), and the phone companion's homebrew routes
// (app/companion/api.js). Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { normalizeIndex, searchApps, roleOf } = await load('app/state/homebrew-index.js');
const { createHomebrew, variantOf } = await load('app/state/homebrew.js');
const { createCompanionApi } = await load('app/companion/api.js');

const shipped = JSON.parse(readFileSync(path.join(repo, 'app/data/homebrew.json'), 'utf8'));
const release = (repo2, name) => `https://github.com/${repo2}/releases/download/v1/${name}`;
const doc = (apps, generated = 1000) => ({ version: 1, generated, categories: [{ id: 'emulators', name: 'Emulators' }, { id: 'system', name: 'System tools' }], apps });
const app = (repo2, files, extra = {}) => ({ repo: repo2, name: repo2.split('/')[1], author: repo2.split('/')[0], category: 'emulators', stars: 10, release: { tag: 'v1', date: 1 }, files, ...extra });

test('the shipped index: 150+ apps, every file from its own release, every app with a picture or a tile', () => {
  const index = normalizeIndex(shipped);
  assert.ok(index.apps.length >= 150, `${index.apps.length} apps`);
  assert.equal(index.apps.length, shipped.apps.length, 'the app drops nothing the builder wrote');
  assert.ok(!index.apps.some((a) => a.id === 'jvk3r/jobeeslair'), 'Jobee\'sLair does not list itself');
  for (const a of index.apps) {
    for (const file of a.files) assert.ok(file.url.toLowerCase().startsWith(`https://github.com/${a.id}/releases/download/`), file.url);
    for (const image of [a.icon, a.logo, a.hero, ...a.shots].filter(Boolean)) assert.match(image, /^https:\/\//);
  }
  const pictured = index.apps.filter((a) => (a.icon && !a.iconFromAvatar) || a.logo).length;
  assert.ok(pictured / index.apps.length > 0.6, `${pictured} of ${index.apps.length} have their own art`);
  assert.ok(index.categories.length >= 10);
});

test('the index: a file from anywhere but the app\'s own release is dropped, and an app with none goes', () => {
  const index = normalizeIndex(doc([
    app('a/one', [{ name: 'one.elf', kind: 'payload', url: release('a/one', 'one.elf'), size: 2048 }, { name: 'evil.elf', kind: 'payload', url: 'https://example.com/evil.elf' }]),
    app('b/two', [{ name: 'two.elf', kind: 'payload', url: release('a/one', 'two.elf') }]),
    app('c/three', [{ name: '../x.elf', kind: 'payload', url: release('c/three', 'x.elf') }]),
    app('d/four', [{ name: 'four.zip', kind: 'app', folder: 'PPSA00001', url: release('d/four', 'four.zip') }], { icon: 'javascript:alert(1)', category: 'nope' }),
  ]));
  assert.deepEqual(index.apps.map((a) => a.id), ['a/one', 'd/four']);
  assert.deepEqual(index.apps[0].files.map((f) => f.name), ['one.elf']);
  assert.equal(index.apps[1].icon, null, 'only https art');
  assert.equal(index.apps[1].category, 'system', 'an unknown category falls back');
  assert.equal(normalizeIndex({ version: 2, apps: [] }), null);
  assert.equal(roleOf({ kind: 'archive-payload' }), 'payload');
  assert.equal(roleOf({ kind: 'app' }), 'app');
  assert.deepEqual(searchApps(index.apps, 'FOUR').map((a) => a.id), ['d/four']);
});

// ---- Installing ---------------------------------------------------------------------------------------

function memoryFs(seed = {}) {
  const files = new Map(Object.entries(seed));
  const dirs = new Set(['/']);
  const parent = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
  const addDirs = (p) => { for (let d = parent(p); d && !dirs.has(d); d = parent(d)) dirs.add(d); };
  for (const p of files.keys()) addDirs(p);
  const under = (p) => [...files.keys(), ...dirs].filter((q) => q.startsWith(`${p}/`));
  const modes = new Map();
  // Paths a delete cannot get through (a folder an app made that only it may enter): removeTree of anything
  // holding one fails with Permission denied and deletes nothing.
  const stuck = new Set();
  // Folders an app made that only it may enter or move (PS5X360's phone-camera, drwx------).
  const closed = new Set();
  return {
    files, dirs, modes, stuck, closed,
    chmod: (p, mode) => { modes.set(p, mode); },
    exists: (p) => files.has(p) || dirs.has(p),
    stat: (p) => files.has(p) ? { isFile: true, isDirectory: false } : dirs.has(p) ? { isFile: false, isDirectory: true } : null,
    readFile: (p) => { if (!files.has(p)) throw new Error(`ENOENT ${p}`); return files.get(p); },
    writeFile: (p, text) => { addDirs(p); files.set(p, text); },
    mkdir: (p) => { dirs.add(p); addDirs(p); },
    remove: (p) => { files.delete(p); dirs.delete(p); },
    removeTree: (p) => {
      if ([...stuck].some((q) => q === p || q.startsWith(`${p}/`))) throw new Error(`fs.removeTree ${p}: Permission denied`);
      for (const q of under(p)) { files.delete(q); dirs.delete(q); } files.delete(p); dirs.delete(p);
    },
    removeAsync: async (p) => { for (const q of under(p)) { files.delete(q); dirs.delete(q); } files.delete(p); dirs.delete(p); },
    rename: (from, to) => {
      if (closed.has(from)) throw new Error(`fs.rename ${from}: Permission denied`);
      if (!files.has(from) && !dirs.has(from)) throw new Error(`ENOENT ${from}`);
      if (files.has(from)) { files.set(to, files.get(from)); files.delete(from); addDirs(to); return; }
      for (const q of under(from)) {
        const moved = to + q.slice(from.length);
        if (files.has(q)) { files.set(moved, files.get(q)); files.delete(q); } else { dirs.delete(q); dirs.add(moved); }
      }
      dirs.delete(from); dirs.add(to); addDirs(to);
    },
    readDir: (p) => {
      if (closed.has(p)) throw new Error(`fs.readDir ${p}: Permission denied`);
      return [...new Set([...files.keys(), ...dirs].filter((q) => parent(q) === p && q !== p))].map((q) => ({ name: q.slice(p.length + 1), isDirectory: dirs.has(q), isFile: files.has(q) }));
    },
  };
}
// Downloads write the release file's text; archives unpack the file list each fake zip names.
function console2({ seed, archivesHold = {} } = {}) {
  const fs = memoryFs(seed);
  const enqueued = [], sent = [];
  const downloads = {
    enqueue({ url, destination }) {
      enqueued.push({ url, destination });
      fs.writeFile(destination, `bytes of ${url.slice(url.lastIndexOf('/') + 1)}`);
      return { done: Promise.resolve({}), cancel() {}, subscribe: (listener) => (listener({ state: 'completed', written: 10, total: 10 }), () => {}) };
    },
  };
  const archives = {
    extract({ sources, destination }) {
      // The console's extractor keeps a folder it did not finish rather than writing over it.
      if (fs.exists(destination) && fs.readDir(destination).length) throw new Error(`Archives.extract ${destination}: Existing extraction has no matching, valid completion receipt; files preserved.`);
      for (const [rel, text] of Object.entries(archivesHold[sources[0].slice(sources[0].lastIndexOf('/') + 1)] ?? {})) fs.writeFile(`${destination}/${rel}`, text);
      return { done: Promise.resolve({}), cancel() {} };
    },
  };
  const payloads = { send: (p, options) => (sent.push([p, options.port]), { ok: true, answer: '' }) };
  return { fs, downloads, archives, payloads, enqueued, sent };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
function store(world, apps, extra = {}) {
  return createHomebrew({
    fs: world.fs, http: { request: async () => ({ ok: false, status: 404 }) }, downloads: world.downloads, archives: world.archives, payloads: world.payloads,
    dataDir: '/download0/JobeesLair', payloadDir: '/data/JobeesLair/payloads', roots: () => ['/data', '/mnt/usb0'], freeBytes: () => 1e12,
    readBundled: () => JSON.stringify(doc(apps)), now: () => 5, log: () => {}, defer: (work) => work(), ...extra,
  });
}

test('install: a disk image goes into homebrew/ through a staging download, and its release is recorded', async () => {
  const world = console2();
  const hb = store(world, [app('a/img', [{ name: 'Tool.exfat', kind: 'image', url: release('a/img', 'Tool.exfat'), size: 2048 }])]);
  hb.install('a/img');
  await settle();
  assert.equal(world.enqueued[0].destination, '/data/downloads/homebrew/a__img/Tool.exfat');
  assert.equal(world.fs.readFile('/data/homebrew/Tool.exfat'), 'bytes of Tool.exfat');
  assert.ok(!world.fs.exists('/data/downloads/homebrew/a__img'), 'its staging is tidied');
  const status = hb.statusOf('a/img');
  assert.equal(status.installed, true);
  assert.equal(status.record.tag, 'v1');
  assert.equal(JSON.parse(world.fs.readFile('/download0/JobeesLair/homebrew-installed.json')).apps['a/img'].paths[0], '/data/homebrew/Tool.exfat');
});

test('install: an app folder from a zip is placed under its title ID, replacing the older one', async () => {
  const world = console2({
    seed: { '/data/homebrew/PPSA99001/eboot.bin': 'old', '/data/homebrew/PPSA99001/sce_sys/param.json': '{}' },
    archivesHold: { 'Emu.zip': { 'Emu/eboot.bin': 'new', 'Emu/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA99001' }) } },
  });
  const hb = store(world, [app('a/emu', [{ name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 2048 }])]);
  assert.equal(hb.statusOf('a/emu').outside === null, true, 'not found before the folder name is known');
  hb.install('a/emu');
  await settle();
  assert.equal(world.fs.readFile('/data/homebrew/PPSA99001/eboot.bin'), 'new');
  assert.equal(hb.statusOf('a/emu').record.titleId, 'PPSA99001');
  for (const p of ['/data/homebrew/PPSA99001/eboot.bin', '/data/homebrew/PPSA99001/sce_sys/param.json', '/data/homebrew/PPSA99001/sce_sys', '/data/homebrew/PPSA99001']) assert.equal(world.fs.modes.get(p), 0o777, `${p} is open to everyone, as an FTP copy is: the console cannot start an app it can't execute`);
});

// 0.5.2, from PS5X360 on Jake's console: its 1.0.0 update swapped the folder and deleted the old one, saves and
// all, but for a folder the emulator made that the app could not enter; what that left in the staging then
// stopped every later update ("Existing extraction has no matching, valid completion receipt").
const X360 = '/data/homebrew/PPSA50011';
const X360_WORK = '/data/downloads/homebrew/brinootk__ps5x360';
const LEFT = `${X360_WORK}/unpacked/.replaced-1792647011300-PPSA50011`;
function x360World(extra = {}) {
  const world = console2({
    seed: {
      [`${X360}/eboot.bin`]: 'v1.0.0', [`${X360}/sce_sys/param.json`]: JSON.stringify({ titleId: 'PPSA50011' }), [`${X360}/assets/ui.bin`]: 'old ui',
      [`${X360}/saves/E000FE8300000000/Account`]: 'current profile', [`${X360}/assets/user.cfg`]: 'my settings', [`${X360}/web-settings.key`]: 'key',
      [`${LEFT}/saves/E03000005387BA79/Account`]: 'v0.6.0 profile',
      ...extra,
    },
    archivesHold: { 'PPSA50011.zip': { 'PPSA50011/eboot.bin': 'v1.0.2', 'PPSA50011/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA50011' }), 'PPSA50011/assets/ui.bin': 'new ui', 'PPSA50011/dlc/readme.txt': 'new' } },
  });
  world.fs.writeFile('/download0/JobeesLair/homebrew-installed.json', JSON.stringify({ version: 1, apps: { 'brinootk/ps5x360': { tag: 'v1.0.0', file: 'PPSA50011.zip', kind: 'app', paths: [X360], root: '/data', titleId: 'PPSA50011', opened: true } } }));
  const hb = store(world, [app('brinootk/ps5x360', [{ name: 'PPSA50011.zip', kind: 'app', folder: 'PPSA50011', url: release('brinootk/PS5X360', 'PPSA50011.zip'), size: 2048 }], { release: { tag: 'v1.0.2', date: 2 } })]);
  return { world, hb };
}

test("update: an app's new files go into its folder, and what it keeps there (saves, settings) stays", async () => {
  const { world, hb } = x360World();
  assert.equal(hb.statusOf('brinootk/ps5x360').update, true);
  hb.install('brinootk/ps5x360');
  await settle();
  const { fs } = world;
  assert.equal(hb.statusOf('brinootk/ps5x360').failed, '');
  assert.equal(fs.readFile(`${X360}/eboot.bin`), 'v1.0.2');
  assert.equal(fs.readFile(`${X360}/assets/ui.bin`), 'new ui', 'a file the new version has replaces the old one');
  assert.equal(fs.readFile(`${X360}/dlc/readme.txt`), 'new', 'a folder only the new version has comes in');
  assert.equal(fs.readFile(`${X360}/saves/E000FE8300000000/Account`), 'current profile', 'its saves stay');
  assert.equal(fs.readFile(`${X360}/assets/user.cfg`), 'my settings', 'what it keeps inside its own folders stays');
  assert.equal(fs.readFile(`${X360}/web-settings.key`), 'key');
  assert.equal(hb.statusOf('brinootk/ps5x360').record.tag, 'v1.0.2');
  // What the 1.0.0 update left in the staging is moved out of the way and kept, never cleared with it.
  assert.equal(fs.readFile('/data/downloads/homebrew/kept/brinootk__ps5x360/replaced-1792647011300-PPSA50011/saves/E03000005387BA79/Account'), 'v0.6.0 profile');
  assert.ok(!fs.exists(X360_WORK), 'the staging is tidied');
});

test('update: a staging folder that will not clear no longer stops the install', async () => {
  const stray = `${X360_WORK}/unpacked/PPSA50011/phone-camera/shot.jpg`;
  const { world, hb } = x360World({ [stray]: 'x' });
  world.fs.stuck.add(stray);
  hb.install('brinootk/ps5x360');
  await settle();
  assert.equal(hb.statusOf('brinootk/ps5x360').failed, '', 'installed beside it');
  assert.equal(world.fs.readFile(`${X360}/eboot.bin`), 'v1.0.2');
  assert.ok(world.fs.exists(stray), 'what would not clear is left alone');
});

test('update: an earlier leftover that cannot be moved out of the way stops the install before anything is cleared', async () => {
  const { world, hb } = x360World();
  const rename = world.fs.rename;
  world.fs.rename = (from, to) => {
    if (from === LEFT) throw new Error('Permission denied');
    return rename(from, to);
  };
  hb.install('brinootk/ps5x360');
  await settle();
  assert.match(hb.statusOf('brinootk/ps5x360').failed, /could not be moved out of the way \(Permission denied\)\. Nothing was changed\./);
  assert.equal(world.fs.readFile(`${LEFT}/saves/E03000005387BA79/Account`), 'v0.6.0 profile');
  assert.equal(world.fs.readFile(`${X360}/eboot.bin`), 'v1.0.0', 'the installed version is untouched');
  assert.equal(world.enqueued.length, 0, 'nothing was downloaded');
});

test("update: a payload's folder keeps the data files beside it", async () => {
  const world = console2({
    seed: { '/data/JobeesLair/payloads/a__tool/tool.elf': 'old', '/data/JobeesLair/payloads/a__tool/config.ini': 'mine' },
    archivesHold: { 'Tool.zip': { 'Tool/tool.elf': 'new', 'Tool/readme.txt': 'r' } },
  });
  world.fs.writeFile('/download0/JobeesLair/homebrew-installed.json', JSON.stringify({ version: 1, apps: { 'a/tool': { tag: 'v0', file: 'Tool.zip', kind: 'archive-payload', paths: ['/data/JobeesLair/payloads/a__tool'], run: '/data/JobeesLair/payloads/a__tool/tool.elf' } } }));
  const hb = store(world, [app('a/tool', [{ name: 'Tool.zip', kind: 'archive-payload', inner: 'Tool/tool.elf', url: release('a/tool', 'Tool.zip'), size: 2048 }])]);
  hb.install('a/tool');
  await settle();
  assert.equal(world.fs.readFile('/data/JobeesLair/payloads/a__tool/tool.elf'), 'new');
  assert.equal(world.fs.readFile('/data/JobeesLair/payloads/a__tool/config.ini'), 'mine');
});

// 0.5.2: an update stays on the app's own drive. Files only move within a drive: anywhere else it was a second
// copy without the saves, which stayed in the old one (found in the review of 0.5.2 Pre Release 1).
const MiB = 1024 ** 2;
function usbWorld({ seedRoot = '/mnt/usb0', recorded = true, free = () => 1e12, roots } = {}) {
  const folder = `${seedRoot}/homebrew/PPSA50011`;
  const world = console2({
    seed: { [`${folder}/eboot.bin`]: 'v1.0.0', [`${folder}/sce_sys/param.json`]: JSON.stringify({ titleId: 'PPSA50011' }), [`${folder}/saves/E000FE8300000000/Account`]: 'current profile' },
    archivesHold: { 'PPSA50011.zip': { 'PPSA50011/eboot.bin': 'v1.0.2', 'PPSA50011/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA50011' }) } },
  });
  if (recorded) world.fs.writeFile('/download0/JobeesLair/homebrew-installed.json', JSON.stringify({ version: 1, apps: { 'brinootk/ps5x360': { tag: 'v1.0.0', file: 'PPSA50011.zip', kind: 'app', paths: [folder], root: seedRoot, titleId: 'PPSA50011', opened: true } } }));
  const hb = store(world, [app('brinootk/ps5x360', [{ name: 'PPSA50011.zip', kind: 'app', folder: 'PPSA50011', url: release('brinootk/PS5X360', 'PPSA50011.zip'), size: 150 * MiB }], { release: { tag: 'v1.0.2', date: 2 } })], { freeBytes: free, ...(roots ? { roots } : {}) });
  return { world, hb, folder };
}

test('update: an app on another drive is updated there, even with room on the internal one', async () => {
  const { world, hb, folder } = usbWorld();
  hb.install('brinootk/ps5x360');
  await settle();
  const { fs } = world;
  assert.equal(hb.statusOf('brinootk/ps5x360').failed, '');
  assert.equal(fs.readFile(`${folder}/eboot.bin`), 'v1.0.2');
  assert.equal(fs.readFile(`${folder}/saves/E000FE8300000000/Account`), 'current profile', 'its saves are where it runs');
  assert.ok(!fs.exists('/data/homebrew/PPSA50011'), 'no second copy on the internal drive');
  assert.equal(hb.statusOf('brinootk/ps5x360').record.paths[0], folder);
});

test('update: an app found installed by hand is updated on its own drive too', async () => {
  const { world, hb, folder } = usbWorld({ recorded: false });
  assert.equal(hb.statusOf('brinootk/ps5x360').outside?.path, folder);
  hb.install('brinootk/ps5x360');
  await settle();
  assert.equal(world.fs.readFile(`${folder}/eboot.bin`), 'v1.0.2');
  assert.equal(world.fs.readFile(`${folder}/saves/E000FE8300000000/Account`), 'current profile');
  assert.ok(!world.fs.exists('/data/homebrew/PPSA50011'));
});

test('update: with no room on its own drive it stops and says so, with no second copy on another', async () => {
  const { world, hb, folder } = usbWorld({ seedRoot: '/data', free: (root) => root === '/data' ? 100 * MiB : 1e12 });
  hb.install('brinootk/ps5x360');
  await settle();
  const { fs } = world;
  assert.match(hb.statusOf('brinootk/ps5x360').failed, /^Not enough free space to update ps5x360: \/data, where it's installed, needs about 414 MB free\.$/);
  assert.deepEqual(world.enqueued, [], 'nothing is downloaded');
  assert.ok(!fs.exists('/mnt/usb0/homebrew/PPSA50011'));
  assert.equal(fs.readFile(`${folder}/eboot.bin`), 'v1.0.0', 'the version it has stays');
  assert.equal(fs.readFile(`${folder}/saves/E000FE8300000000/Account`), 'current profile');
  assert.equal(hb.statusOf('brinootk/ps5x360').record.tag, 'v1.0.0');
});

test("update: an app on a drive that isn't plugged in is not installed again somewhere else", async () => {
  const { world, hb } = usbWorld({ seedRoot: '/mnt/ext0' });
  assert.equal(hb.statusOf('brinootk/ps5x360').installed, true, 'its record stays while the drive is out');
  hb.install('brinootk/ps5x360');
  await settle();
  assert.match(hb.statusOf('brinootk/ps5x360').failed, /ps5x360 is on a drive that isn't plugged in\. Plug it in to update it, or remove ps5x360 and install it again\./);
  assert.deepEqual(world.enqueued, []);
  assert.ok(!world.fs.exists('/data/homebrew/PPSA50011') && !world.fs.exists('/mnt/usb0/homebrew/PPSA50011'));
});

test('update: a merge that fails partway moves everything back, so the version it had still runs; a retry works', async () => {
  const { world, hb } = x360World();
  const { fs } = world;
  const rename = fs.rename;
  fs.rename = (from, to) => {
    if (from === `${X360_WORK}/unpacked/PPSA50011/dlc`) throw new Error('Input/output error');
    return rename(from, to);
  };
  hb.install('brinootk/ps5x360');
  await settle();
  fs.rename = rename;
  assert.match(hb.statusOf('brinootk/ps5x360').failed, /The new version could not be put in place, so the one you had was left as it was \(Input\/output error\)\./);
  assert.equal(fs.readFile(`${X360}/eboot.bin`), 'v1.0.0', 'the files it had replaced are back');
  assert.equal(fs.readFile(`${X360}/assets/ui.bin`), 'old ui');
  assert.ok(!fs.exists(`${X360}/dlc`));
  assert.equal(fs.readFile(`${X360}/saves/E000FE8300000000/Account`), 'current profile');
  assert.equal(fs.readFile(`${X360}/assets/user.cfg`), 'my settings');
  assert.equal(hb.statusOf('brinootk/ps5x360').record.tag, 'v1.0.0');
  hb.install('brinootk/ps5x360');
  await settle();
  assert.equal(hb.statusOf('brinootk/ps5x360').failed, '');
  assert.equal(fs.readFile(`${X360}/eboot.bin`), 'v1.0.2');
  assert.equal(fs.readFile(`${X360}/dlc/readme.txt`), 'new');
  assert.equal(fs.readFile(`${X360}/saves/E000FE8300000000/Account`), 'current profile');
  assert.ok(!fs.exists(X360_WORK), 'the staging, with the replaced files, is tidied');
});

// 0.5.2: removing an app asks first when it saved things in its folder (Jake: "Ask first"); kept, they come back.
const EMU = '/data/homebrew/PPSA99001';
function emuWorld() {
  const world = console2({ archivesHold: { 'Emu.zip': { 'Emu/eboot.bin': 'e', 'Emu/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA99001' }), 'Emu/assets/ui.bin': 'ui' } } });
  const hb = store(world, [app('a/emu', [{ name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 2048 }])]);
  return { world, hb };
}

test('remove: an app with nothing saved in its folder is not asked about', async () => {
  const { world, hb } = emuWorld();
  hb.install('a/emu');
  await settle();
  assert.deepEqual(JSON.parse(world.fs.readFile('/download0/JobeesLair/homebrew-files/a__emu.json')).files.sort(), ['assets/ui.bin', 'eboot.bin', 'sce_sys/param.json'], "its package's files are listed");
  assert.equal(hb.savedData('a/emu'), null);
  assert.equal(await hb.remove('a/emu'), null);
  assert.ok(!world.fs.exists(EMU) && !world.fs.exists('/download0/JobeesLair/homebrew-files/a__emu.json'));
});

test('remove: what an app saved in its folder is kept when asked, and goes back in when it is installed again', async () => {
  const { world, hb } = emuWorld();
  hb.install('a/emu');
  await settle();
  const { fs } = world;
  fs.writeFile(`${EMU}/saves/profile/Account`, 'my profile');
  fs.writeFile(`${EMU}/assets/content/dlc.bin`, 'dlc');
  fs.writeFile(`${EMU}/web-settings.key`, 'key');
  fs.mkdir(`${EMU}/phone-camera`);
  fs.closed.add(`${EMU}/phone-camera`);
  const saved = hb.savedData('a/emu');
  assert.deepEqual(saved.paths.sort(), ['assets/content', 'phone-camera', 'saves', 'web-settings.key'], 'its own folders whole, never a file of its package');
  assert.deepEqual([saved.whole, saved.keptAt], [false, '/data/homebrew-saves/a__emu']);
  const kept = await hb.remove('a/emu', { keep: true });
  assert.equal(kept, '/data/homebrew-saves/a__emu');
  assert.equal(fs.readFile('/data/homebrew-saves/a__emu/saves/profile/Account'), 'my profile');
  assert.equal(fs.readFile('/data/homebrew-saves/a__emu/assets/content/dlc.bin'), 'dlc');
  assert.ok(!fs.exists('/data/homebrew-saves/a__emu/eboot.bin'), 'its own files are not kept');
  assert.equal(hb.statusOf('a/emu').installed, false);
  fs.closed.clear();
  hb.install('a/emu');
  await settle();
  assert.equal(fs.readFile(`${EMU}/saves/profile/Account`), 'my profile', 'back in its folder');
  assert.equal(fs.readFile(`${EMU}/assets/content/dlc.bin`), 'dlc');
  assert.equal(fs.readFile(`${EMU}/eboot.bin`), 'e');
  assert.ok(!fs.exists('/data/homebrew-saves/a__emu'), 'and nothing is left waiting');
});

test('remove: deleting everything keeps nothing', async () => {
  const { world, hb } = emuWorld();
  hb.install('a/emu');
  await settle();
  world.fs.writeFile(`${EMU}/saves/s`, 'x');
  assert.ok(hb.savedData('a/emu'));
  assert.equal(await hb.remove('a/emu', { keep: false }), null);
  assert.ok(!world.fs.exists('/data/homebrew-saves/a__emu'));
});

test('remove: an app installed before its files were listed is kept whole, and only its saves come back', async () => {
  const { world, hb } = emuWorld();
  hb.install('a/emu');
  await settle();
  const { fs } = world;
  fs.remove('/download0/JobeesLair/homebrew-files/a__emu.json');
  fs.writeFile(`${EMU}/saves/s`, 'mine');
  fs.writeFile(`${EMU}/old-module.prx`, 'from an older version');
  const saved = hb.savedData('a/emu');
  assert.equal(saved.whole, true, 'nothing tells its files from its saves');
  await hb.remove('a/emu', { keep: true });
  assert.equal(fs.readFile('/data/homebrew-saves/a__emu/eboot.bin'), 'e', 'its whole folder is kept');
  hb.install('a/emu');
  await settle();
  assert.equal(fs.readFile(`${EMU}/saves/s`), 'mine');
  assert.equal(fs.readFile(`${EMU}/eboot.bin`), 'e', 'the new package wins over the kept copy of its own files');
  assert.equal(fs.readFile(`${EMU}/old-module.prx`), 'from an older version', 'what the new package does not ship comes back');
  assert.ok(!fs.exists('/data/homebrew-saves/a__emu'), 'what was its own old files goes');
});

test('remove: kept whole, what will not go back in when it is installed again is set aside, never deleted', async () => {
  const { world, hb } = emuWorld();
  hb.install('a/emu');
  await settle();
  const { fs } = world;
  fs.remove('/download0/JobeesLair/homebrew-files/a__emu.json');
  fs.writeFile(`${EMU}/saves/s`, 'mine');
  await hb.remove('a/emu', { keep: true });
  const rename = fs.rename;
  fs.rename = (from, to) => {
    if (from === '/data/homebrew-saves/a__emu/saves') throw new Error('Input/output error');
    return rename(from, to);
  };
  hb.install('a/emu');
  await settle();
  fs.rename = rename;
  assert.equal(fs.readFile(`${EMU}/eboot.bin`), 'e');
  assert.equal(fs.readFile('/data/homebrew-saves/a__emu-5/saves/s'), 'mine');
  assert.ok(!fs.exists('/data/homebrew-saves/a__emu'));
});

test('remove: if the app itself cannot be removed, what was kept goes back in with it', async () => {
  const { world, hb } = emuWorld();
  hb.install('a/emu');
  await settle();
  const { fs } = world;
  fs.writeFile(`${EMU}/saves/s`, 'mine');
  const rename = fs.rename;
  fs.rename = (from, to) => {
    if (from === EMU) throw new Error('Device busy');
    return rename(from, to);
  };
  await assert.rejects(hb.remove('a/emu', { keep: true }), /Could not remove PPSA99001: Device busy/);
  fs.rename = rename;
  assert.equal(fs.readFile(`${EMU}/saves/s`), 'mine', 'its saves are back in its folder');
  assert.ok(!fs.exists('/data/homebrew-saves/a__emu'));
  assert.equal(hb.statusOf('a/emu').installed, true);
});

test('remove: if what it saved cannot be kept, it is put back and the app stays', async () => {
  const { world, hb } = emuWorld();
  hb.install('a/emu');
  await settle();
  const { fs } = world;
  fs.writeFile(`${EMU}/saves/s`, 'mine');
  fs.writeFile(`${EMU}/web-settings.key`, 'key');
  const rename = fs.rename;
  fs.rename = (from, to) => {
    if (from === `${EMU}/web-settings.key`) throw new Error('Input/output error');
    return rename(from, to);
  };
  await assert.rejects(hb.remove('a/emu', { keep: true }), /Could not keep what emu saved, so nothing was removed: web-settings.key: Input\/output error/);
  fs.rename = rename;
  assert.equal(fs.readFile(`${EMU}/saves/s`), 'mine', 'what was moved is put back');
  assert.equal(hb.statusOf('a/emu').installed, true);
});

test('remove: installed again, an app goes back to the drive its saves wait on; with no room there it stops', async () => {
  const world = console2({ archivesHold: { 'Emu.zip': { 'Emu/eboot.bin': 'e', 'Emu/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA99001' }) } } });
  let internal = 1e12;
  const hb = store(world, [app('a/emu', [{ name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 2048 }])], { freeBytes: (root) => root === '/data' ? internal : 1e12 });
  const { fs } = world;
  hb.install('a/emu');
  await settle();
  fs.writeFile(`${EMU}/saves/s`, 'mine');
  assert.equal(await hb.remove('a/emu', { keep: true }), '/data/homebrew-saves/a__emu');
  internal = 1;
  hb.install('a/emu');
  await settle();
  assert.match(hb.statusOf('a/emu').failed, /Not enough free space to install emu again: \/data, where what it saved is kept \(\/data\/homebrew-saves\/a__emu\), needs about 68 MB free\. Free up some room there, or delete that folder to install it on another drive\./);
  assert.ok(!fs.exists('/mnt/usb0/homebrew/PPSA99001'), 'not installed on another drive without its saves');
  assert.equal(fs.readFile('/data/homebrew-saves/a__emu/saves/s'), 'mine', 'they wait where they were');
  internal = 1e12;
  hb.install('a/emu');
  await settle();
  assert.equal(fs.readFile(`${EMU}/saves/s`), 'mine', 'back in its folder');
  assert.ok(!fs.exists('/data/homebrew-saves/a__emu'));
});

test('remove: saves kept on an external drive bring the app back there, not to the internal one', async () => {
  const world = console2({ seed: { '/mnt/usb0/homebrew-saves/a__emu/saves/s': 'mine' }, archivesHold: { 'Emu.zip': { 'Emu/eboot.bin': 'e', 'Emu/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA99001' }) } } });
  const hb = store(world, [app('a/emu', [{ name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 2048 }])]);
  hb.install('a/emu');
  await settle();
  assert.equal(world.fs.readFile('/mnt/usb0/homebrew/PPSA99001/saves/s'), 'mine');
  assert.ok(!world.fs.exists('/data/homebrew/PPSA99001'));
  assert.ok(!world.fs.exists('/mnt/usb0/homebrew-saves/a__emu'));
  assert.equal(hb.statusOf('a/emu').record.root, '/mnt/usb0');
});

test('install: an app\'s helper payload comes with it, runs from the app, and goes when the app does', async () => {
  const world = console2({ archivesHold: { 'Emu.zip': { 'Emu/eboot.bin': 'e', 'Emu/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA99203' }) } } });
  const files = [
    { name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 2048 },
    { name: 'Helper.elf', kind: 'payload', url: release('a/emu', 'Helper.elf'), size: 2048 },
    { name: 'Other.elf', kind: 'payload', url: release('a/emu', 'Other.elf'), size: 2048 },
  ];
  const hb = store(world, [app('a/emu', files, { with: ['Helper.elf', 'Missing.elf'] })]);
  assert.deepEqual(hb.app('a/emu').with, ['Helper.elf'], 'only a file the release has');
  hb.install('a/emu');
  await settle();
  await settle();
  assert.equal(world.fs.readFile('/data/homebrew/PPSA99203/eboot.bin'), 'e');
  assert.equal(world.fs.readFile('/data/JobeesLair/payloads/a__emu/Helper.elf'), 'bytes of Helper.elf');
  assert.ok(!world.fs.exists('/data/JobeesLair/payloads/a__emu/Other.elf'), 'only the named helper');
  assert.ok(!world.fs.exists('/data/JobeesLair/payloads/.incoming/a__emu'), 'its staging is tidied');
  assert.throws(() => hb.run('a/emu'), /no payload to run/, 'a plain run never sends a helper');
  assert.deepEqual(await hb.runHelper('a/emu'), { ok: true, answer: '' });
  assert.deepEqual(world.sent, [['/data/JobeesLair/payloads/a__emu/Helper.elf', 9021]]);
  assert.ok(hb.statusOf('a/emu').record.helperRunAt, 'when it was last run is kept');
  const list = JSON.parse(world.fs.readFile('/data/JobeesLair/payloads/index.json'));
  assert.equal(list.apps.length, 0, 'a helper is not a payload of its own for the closed-app list');
  assert.equal(hb.ownerOf('/data/homebrew/PPSA99203', 'PPSA99203').id, 'a/emu', 'the library names it');
  hb.remove('a/emu');
  assert.ok(!world.fs.exists('/data/JobeesLair/payloads/a__emu'));
  assert.ok(!world.fs.exists('/data/homebrew/PPSA99203'));
});

test('a helper runs only once ShadowMount has the app; it can be taken off; an app deleted by hand stops being listed', async () => {
  const world = console2({ archivesHold: { 'Emu.zip': { 'Emu/eboot.bin': 'e', 'Emu/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA99203' }) } } });
  const files = [
    { name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 2048 },
    { name: 'Helper.elf', kind: 'payload', url: release('a/emu', 'Helper.elf'), size: 2048 },
  ];
  let answer = () => { const e = new Error('HTTP 404'); throw e; };
  const asked = [];
  const hb = createHomebrew({
    fs: world.fs, http: { request: async () => ({ ok: false, status: 404 }) }, downloads: world.downloads, archives: world.archives, payloads: world.payloads,
    shadow: async (route, body) => { asked.push([route, body.title_id]); return answer(); },
    dataDir: '/download0/JobeesLair', payloadDir: '/data/JobeesLair/payloads', roots: () => ['/data'], freeBytes: () => 1e12,
    readBundled: () => JSON.stringify(doc([app('a/emu', files, { with: ['Helper.elf'] })])), now: () => 5, log: () => {}, defer: (work) => work(),
  });
  hb.install('a/emu');
  await settle();
  await settle();
  const refused = await hb.runHelper('a/emu');
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'notMounted', 'ShadowMount has no such game yet');
  assert.deepEqual(world.sent, [], 'nothing was sent');
  assert.deepEqual(asked.find((a) => a[0] === 'games/info'), ['games/info', 'PPSA99203']);
  answer = () => ({ title_id: 'PPSA99203', installed: true });
  assert.equal((await hb.runHelper('a/emu')).ok, true);
  assert.equal(world.sent.length, 1);
  hb.removeHelper('a/emu');
  assert.ok(!world.fs.exists('/data/JobeesLair/payloads/a__emu'));
  assert.equal(hb.statusOf('a/emu').record.helper, undefined);
  assert.equal(hb.statusOf('a/emu').installed, true, 'the app stays');
  hb.installHelper('a/emu');
  await settle();
  await settle();
  assert.ok(world.fs.exists('/data/JobeesLair/payloads/a__emu/Helper.elf'), 'Install helper fetches it again');
  assert.ok(hb.statusOf('a/emu').record.helper, 'and Run helper is back');
  assert.equal(hb.statusOf('a/emu').installed, true);
  world.fs.removeTree('/data/homebrew/PPSA99203');
  hb.rescan();
  assert.equal(hb.statusOf('a/emu').installed, false, 'deleted by hand: no longer listed');
});

test('install: a payload is kept under /data and runs through the loader; a .bin tries 9021', async () => {
  const world = console2({ archivesHold: { 'kit.zip': { 'kit/kit.elf': 'elf', 'kit/kit.json': 'config' } } });
  const hb = store(world, [
    app('a/pay', [{ name: 'pay.elf', kind: 'payload', url: release('a/pay', 'pay.elf'), size: 2048 }]),
    app('b/kit', [{ name: 'kit.zip', kind: 'archive-payload', inner: 'kit/kit.elf', url: release('b/kit', 'kit.zip'), size: 2048 }]),
  ]);
  hb.install('a/pay');
  hb.install('b/kit');
  await settle();
  await settle();
  assert.equal(world.fs.readFile('/data/JobeesLair/payloads/a__pay/pay.elf'), 'bytes of pay.elf');
  assert.equal(world.fs.readFile('/data/JobeesLair/payloads/b__kit/kit.json'), 'config', 'its data comes with it');
  assert.deepEqual(hb.run('a/pay'), { ok: true, answer: '' });
  assert.deepEqual(world.sent, [['/data/JobeesLair/payloads/a__pay/pay.elf', 9021]]);
  const list = JSON.parse(world.fs.readFile('/data/JobeesLair/payloads/index.json'));
  assert.deepEqual(list.apps.map((a) => a.run), ['/data/JobeesLair/payloads/a__pay/pay.elf', '/data/JobeesLair/payloads/b__kit/kit.elf'], 'the closed-app helper can list them');
  hb.remove('a/pay');
  assert.ok(!world.fs.exists('/data/JobeesLair/payloads/a__pay'));
  assert.equal(hb.statusOf('a/pay').installed, false);
});

test('updates: a newer tag in the index is an update; an app installed by hand is found by its folder name', async () => {
  const world = console2({ seed: { '/mnt/usb0/homebrew/PPSA99002/eboot.bin': 'x' } });
  world.fs.writeFile('/download0/JobeesLair/homebrew-installed.json', JSON.stringify({ version: 1, apps: { 'a/pay': { tag: 'v0', file: 'pay.elf', kind: 'payload', paths: [], run: '/x.elf' } } }));
  const hb = store(world, [
    app('a/pay', [{ name: 'pay.elf', kind: 'payload', url: release('a/pay', 'pay.elf') }]),
    app('c/hand', [{ name: 'Hand.zip', kind: 'app', folder: 'PPSA99002', url: release('c/hand', 'Hand.zip') }]),
  ]);
  assert.equal(hb.statusOf('a/pay').update, true);
  assert.deepEqual(hb.updates().map((a) => a.id), ['a/pay']);
  assert.equal(hb.statusOf('c/hand').installed, true);
  assert.equal(hb.statusOf('c/hand').outside.path, '/mnt/usb0/homebrew/PPSA99002');
  assert.equal(hb.statusOf('c/hand').update, false, 'its version is unknown, so no update is claimed');
});

test('a failed install says why and can be tried again', async () => {
  const world = console2();
  world.downloads.enqueue = () => ({ done: Promise.reject(new Error('HTTP 404')), cancel() {}, subscribe: () => () => {} });
  const hb = store(world, [app('a/img', [{ name: 'Tool.exfat', kind: 'image', url: release('a/img', 'Tool.exfat') }])]);
  hb.install('a/img');
  await settle();
  assert.equal(hb.statusOf('a/img').failed, 'HTTP 404');
  assert.equal(hb.statusOf('a/img').installed, false);
});

test("install: a package goes to the console's installer from its staging, unpacked first when it comes zipped; the staging goes once it is in", async () => {
  // The zip holds another package before the app's own: the one the index names (`inner`) is installed.
  const world = console2({ archivesHold: { 'Tool.zip': { 'Patch/Tool-patch.pkg': 'patch bytes', 'Tool/Tool-1.0.pkg': 'pkg bytes' } } });
  const installs = [];
  // Packages.install resolves once the console has the app installed (pkg_installer.c: "playable" or "completed").
  const packages = { install: ({ path, name }) => (installs.push({ path, name, there: world.fs.exists(path) }), { done: Promise.resolve({}), cancel() {} }) };
  const hb = store(world, [
    app('a/pkg', [{ name: 'Tool.pkg', kind: 'pkg', url: release('a/pkg', 'Tool.pkg'), size: 2048 }]),
    app('b/zip', [{ name: 'Tool.zip', kind: 'archive-pkg', inner: 'Tool/Tool-1.0.pkg', url: release('b/zip', 'Tool.zip'), size: 2048 }]),
  ], { packages });
  hb.install('a/pkg');
  await settle();
  hb.install('b/zip');
  await settle();
  assert.deepEqual(installs, [
    { path: '/data/downloads/homebrew/a__pkg/Tool.pkg', name: 'pkg', there: true },
    { path: '/data/downloads/homebrew/b__zip/unpacked/Tool/Tool-1.0.pkg', name: 'zip', there: true },
  ]);
  assert.ok(!world.fs.exists('/data/downloads/homebrew/a__pkg') && !world.fs.exists('/data/downloads/homebrew/b__zip'), 'the staging goes once the install is done');
  assert.equal(hb.statusOf('a/pkg').record.package, true);
  assert.equal(hb.statusOf('b/zip').installed, true);
  // Refused by the console, it says why and stays not installed; without the installer (the desktop), it says so.
  const refusing = store(console2(), [app('c/pkg', [{ name: 'Other.pkg', kind: 'pkg', url: release('c/pkg', 'Other.pkg') }])], { packages: { install: () => ({ done: Promise.reject(new Error('The console refused the package.')), cancel() {} }) } });
  refusing.install('c/pkg');
  await settle();
  assert.equal(refusing.statusOf('c/pkg').failed, 'The console refused the package.');
  assert.equal(refusing.statusOf('c/pkg').installed, false);
  const desktop = store(console2(), [app('c/pkg', [{ name: 'Other.pkg', kind: 'pkg', url: release('c/pkg', 'Other.pkg') }])]);
  desktop.install('c/pkg');
  await settle();
  assert.match(desktop.statusOf('c/pkg').failed, /cannot install packages/);
});

test('0.5.2: every install that finishes or fails is told to onInstalled (the online stats), a cancelled one is not', async () => {
  const told = [];
  const world = console2();
  const hb = store(world, [app('a/img', [{ name: 'Tool.exfat', kind: 'image', url: release('a/img', 'Tool.exfat') }])], { onInstalled: (result) => told.push(result) });
  hb.install('a/img');
  await settle();
  world.downloads.enqueue = () => ({ done: Promise.reject(new Error('HTTP 404')), cancel() {}, subscribe: () => () => {} });
  hb.install('a/img');
  await settle();
  world.downloads.enqueue = () => ({ done: Promise.reject(Object.assign(new Error('stopped'), { name: 'AbortError' })), cancel() {}, subscribe: () => () => {} });
  hb.install('a/img');
  await settle();
  assert.deepEqual(told, [{ app: 'a/img', ok: true }, { app: 'a/img', ok: false, error: 'HTTP 404' }]);
});

test('0.5.3: a release file too small to be the app is not downloaded, and says so', async () => {
  const told = [];
  const world = console2();
  // Spectrum Library 1.4.9's one file: a 4-byte Void.pkg reading "soon".
  const hb = store(world, [app('p/spectrum', [{ name: 'Void.pkg', kind: 'pkg', url: release('p/spectrum', 'Void.pkg'), size: 4 }])], {
    packages: { install: () => assert.fail('a stand-in never reaches the installer') }, onInstalled: (result) => told.push(result),
  });
  hb.install('p/spectrum');
  await settle();
  assert.equal(world.enqueued.length, 0, 'nothing is downloaded');
  assert.equal(hb.statusOf('p/spectrum').failed, "This release's Void.pkg is only 4 bytes, so it isn't spectrum itself. Its author may not have uploaded it yet.");
  assert.deepEqual(told, [{ app: 'p/spectrum', ok: false, error: hb.statusOf('p/spectrum').failed }]);
});

test('0.5.3: a failed install is over: no task under way (the page said "Installing" for good, its Cancel stopping nothing), and it can be tried again', async () => {
  const world = console2();
  world.downloads.enqueue = () => ({ done: Promise.reject(new Error('HTTP 404')), cancel() {}, subscribe: () => () => {} });
  const hb = store(world, [app('a/img', [{ name: 'Tool.exfat', kind: 'image', url: release('a/img', 'Tool.exfat'), size: 2048 }])]);
  hb.install('a/img');
  assert.ok(hb.statusOf('a/img').task, 'under way while it runs');
  await settle();
  assert.equal(hb.statusOf('a/img').task, null);
  assert.equal(hb.statusOf('a/img').failed, 'HTTP 404');
  world.downloads.enqueue = (job) => (world.fs.writeFile(job.destination, 'bytes'), { done: Promise.resolve({}), cancel() {}, subscribe: () => () => {} });
  hb.install('a/img');
  await settle();
  assert.equal(hb.statusOf('a/img').failed, '');
  assert.equal(hb.statusOf('a/img').installed, true, 'Try again installs it');
});

test('0.5.3: what an install cut off while it unpacked left (the extractor\'s staging) no longer refuses every later try', async () => {
  // From players' consoles: RPCS3 and RetroArch failed with "Staging belongs to another extraction; files preserved."
  // The extractor keeps its work in <destination>.extracting with the archive it was for; each try downloads anew.
  const staging = '/data/downloads/homebrew/a__emu/unpacked.extracting';
  const world = console2({
    seed: { [`${staging}/.p5-stage`]: 'P5ST001:an earlier download', [`${staging}/Emu/eboot.bin`]: 'half', '/data/downloads/homebrew/a__emu/unpacked.extracting-1.discard/x': 'x' },
    archivesHold: { 'Emu.zip': { 'Emu/eboot.bin': 'new', 'Emu/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA99001' }) } },
  });
  const extract = world.archives.extract;
  world.archives.extract = (request) => {
    if (world.fs.exists(`${request.destination}.extracting`)) return { done: Promise.reject(new Error(`Archives.extract ${request.destination}: Staging belongs to another extraction; files preserved.`)), cancel() {} };
    return extract(request);
  };
  const hb = store(world, [app('a/emu', [{ name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 2048 }])]);
  hb.install('a/emu');
  await settle();
  assert.equal(hb.statusOf('a/emu').failed, '');
  assert.equal(world.fs.readFile('/data/homebrew/PPSA99001/eboot.bin'), 'new');
  assert.ok(![...world.fs.files.keys(), ...world.fs.dirs].some((p) => p.includes('.extracting')), 'no staging left');
});

test('0.5.3: what a removal set aside and the app was closed before it was deleted goes at the next launch; kept saves stay', async () => {
  const world = console2({
    seed: {
      // PS5X360 on Jake's console: removed, its folder moved aside, the app closed while it was being deleted.
      '/data/downloads/homebrew/.removed-1792989529034-PPSA50011/eboot.bin': 'x',
      '/data/downloads/homebrew/.removed-1792989529034-PPSA50011/saves/E000FE8300000000/Account': 'p',
      '/mnt/usb0/downloads/homebrew/.removed-5-Lineup-1.4.1.exfat': 'old image',
      '/data/downloads/homebrew/kept/brinootk__ps5x360/replaced-1/saves/Account': 'kept',
      '/data/downloads/homebrew/a__emu/unpacked/.replaced-7-PPSA99001/saves/Account': 'kept too',
    },
  });
  // On the console's background worker, so a deletion somebody waits on (a cancelled download) never queues behind it.
  const removeAsync = world.fs.removeAsync;
  const lanes = [];
  world.fs.removeAsync = (p, options) => (lanes.push(options?.background === true), removeAsync(p));
  const hb = store(world, [app('a/img', [{ name: 'Tool.exfat', kind: 'image', url: release('a/img', 'Tool.exfat'), size: 2048 }])]);
  hb.load();
  await settle();
  assert.deepEqual(lanes, [true, true]);
  assert.ok(!world.fs.exists('/data/downloads/homebrew/.removed-1792989529034-PPSA50011'));
  assert.ok(!world.fs.exists('/mnt/usb0/downloads/homebrew/.removed-5-Lineup-1.4.1.exfat'), 'on every drive');
  assert.equal(world.fs.readFile('/data/downloads/homebrew/kept/brinootk__ps5x360/replaced-1/saves/Account'), 'kept');
  assert.equal(world.fs.readFile('/data/downloads/homebrew/a__emu/unpacked/.replaced-7-PPSA99001/saves/Account'), 'kept too');
});

test("0.5.3: an index whose newest release of an app is only a stand-in keeps the release before it, which installs", async () => {
  const world = console2();
  const real = [{ name: 'SpectrumLibrary_1.4.8.elf', kind: 'payload', url: release('p/spectrum', 'SpectrumLibrary_1.4.8.elf'), size: 15538472 }];
  const voidPkg = [{ name: 'Void.pkg', kind: 'pkg', url: release('p/spectrum', 'Void.pkg'), size: 4 }];
  // The app's own copy lists 1.4.8; the one fetched since (newer) lists 1.4.9, whose one file is 4 bytes.
  world.fs.writeFile('/download0/JobeesLair/homebrew-index.json', JSON.stringify(doc([
    app('p/spectrum', voidPkg, { release: { tag: '1.4.9', date: 2 }, stars: 600 }),
    app('a/other', voidPkg.map((file) => ({ ...file, url: release('a/other', 'Void.pkg') })), { release: { tag: 'v2', date: 2 } }),
  ], 2000)));
  const hb = store(world, [app('p/spectrum', real, { release: { tag: '1.4.8', date: 1 } })]);
  const spectrum = hb.app('p/spectrum');
  assert.equal(spectrum.release.tag, '1.4.8');
  assert.deepEqual(spectrum.files.map((file) => file.name), ['SpectrumLibrary_1.4.8.elf']);
  assert.equal(spectrum.stars, 600, 'the rest is the newer index\'s');
  assert.equal(hb.app('a/other').release.tag, 'v2', 'with no earlier release to keep, the stand-in stays (and says so when installed)');
  hb.install('p/spectrum');
  await settle();
  assert.equal(hb.statusOf('p/spectrum').record.tag, '1.4.8');
  assert.equal(hb.statusOf('p/spectrum').update, false, 'no update to nothing');
});

test('0.5.3: a package the installer refuses says why in plain words; the stats get the reason without the path', async () => {
  const told = [];
  const refusing = (reason) => ({ install: ({ path }) => ({ done: Promise.reject(new Error(`Packages.install ${path}: ${reason}`)), cancel() {} }) });
  for (const [reason, said] of [
    ['The file is not a PS4 or PS5 package. (0x00000000)', /^This file isn't a package the console can install: it doesn't start like a PS4 or PS5 package\.$/],
    // As a 0.5.2 engine put it, the call and the path twice.
    ['Packages.install /data/downloads/homebrew/a__pkg/Tool.pkg: The file is not a PKG. (0x00000000)', /^This file isn't a package the console can install/],
    ['the payload loader on port 9021 did not answer; load an ELF loader and retry', /^Installing a package needs an ELF loader on port 9021/],
    ['The console refused the package. (0x80b2116f)', /^The console refused the package\. \(0x80b2116f\)$/],
  ]) {
    const hb = store(console2(), [app('a/pkg', [{ name: 'Tool.pkg', kind: 'pkg', url: release('a/pkg', 'Tool.pkg'), size: 2048 }])], { packages: refusing(reason), onInstalled: (result) => told.push(result) });
    hb.install('a/pkg');
    await settle();
    assert.match(hb.statusOf('a/pkg').failed, said, reason);
    assert.equal(told.at(-1).error, hb.statusOf('a/pkg').failed);
  }
  // Another task's message loses its call and path for the stats as well; the page keeps it whole.
  const world = console2();
  world.downloads.enqueue = ({ destination }) => ({ done: Promise.reject(new Error(`Downloads.enqueue ${destination}: HTTP 404`)), cancel() {}, subscribe: () => () => {} });
  const hb = store(world, [app('a/img', [{ name: 'Tool.exfat', kind: 'image', url: release('a/img', 'Tool.exfat'), size: 2048 }])], { onInstalled: (result) => told.push(result) });
  hb.install('a/img');
  await settle();
  assert.equal(told.at(-1).error, 'HTTP 404');
  assert.ok(told.every((result) => !result.error.includes('/data/')), 'no paths in the stats');
});

test("0.5.3: a package's helper payload comes with it and runs from its page (PS5Library's agent)", async () => {
  const world = console2();
  const installs = [];
  const files = [
    { name: 'PS5Library-0.2.91.pkg', kind: 'pkg', url: release('r/ps5library', 'PS5Library-0.2.91.pkg'), size: 2048 },
    { name: 'ps5library-agent.elf', kind: 'payload', url: release('r/ps5library', 'ps5library-agent.elf'), size: 2048 },
  ];
  const hb = store(world, [app('r/ps5library', files, { with: ['ps5library-agent.elf'] })], {
    packages: { install: ({ path }) => (installs.push(path), { done: Promise.resolve({}), cancel() {} }) },
  });
  hb.install('r/ps5library');
  await settle();
  await settle();
  assert.deepEqual(installs, ['/data/downloads/homebrew/r__ps5library/PS5Library-0.2.91.pkg'], 'the package is what installs');
  const record = hb.statusOf('r/ps5library').record;
  assert.equal(record.package, true);
  assert.equal(record.helper, '/data/JobeesLair/payloads/r__ps5library/ps5library-agent.elf');
  assert.equal(world.fs.readFile(record.helper), 'bytes of ps5library-agent.elf');
  assert.ok(!world.fs.exists('/data/JobeesLair/payloads/.incoming/r__ps5library'), 'its staging is tidied');
  assert.deepEqual(await hb.runHelper('r/ps5library'), { ok: true, answer: '' });
  assert.deepEqual(world.sent, [[record.helper, 9021]]);
  // Removing it takes the helper with it; the package itself is the console's, deleted from the home screen.
  await hb.remove('r/ps5library');
  assert.ok(!world.fs.exists('/data/JobeesLair/payloads/r__ps5library'));
  assert.equal(hb.statusOf('r/ps5library').installed, false);
});

const BUSY = 'archives.extract: An archive task is already running; poll its completion first.';
const emu = () => app('a/emu', [{ name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 2048 }]);

test('0.5.3: while a game download is being extracted, an install waits for the extractor, then installs', async () => {
  // From the stats: one player's fifteen installs failed in a minute with "An archive task is already running"
  // while a game was being extracted (the console extracts one archive at a time).
  const world = console2({ archivesHold: { 'Emu.zip': { 'Emu/eboot.bin': 'new', 'Emu/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA99001' }) } } });
  const extract = world.archives.extract;
  let busy = true;
  world.archives.extract = (request) => {
    if (busy) throw new Error(BUSY);
    return extract(request);
  };
  const told = [];
  const hb = store(world, [emu()], { onInstalled: (result) => told.push(result) });
  hb.install('a/emu');
  await settle();
  const waiting = hb.statusOf('a/emu');
  assert.equal(waiting.failed, '');
  assert.equal(waiting.task.phase, 'waiting');
  assert.equal(waiting.task.waitFor, 'unpack', 'its page says what it waits for');
  busy = false;
  await new Promise((resolve) => setTimeout(resolve, 2200));
  assert.equal(hb.statusOf('a/emu').installed, true);
  assert.equal(world.fs.readFile('/data/homebrew/PPSA99001/eboot.bin'), 'new');
  assert.deepEqual(told, [{ app: 'a/emu', ok: true }]);
});

test('0.5.3: Cancel stops an install that waits for the extractor at once, and it is not counted as failed', async () => {
  const world = console2();
  world.archives.extract = () => {
    throw new Error(BUSY);
  };
  const told = [];
  const hb = store(world, [emu()], { onInstalled: (result) => told.push(result) });
  hb.install('a/emu');
  await settle();
  assert.equal(hb.statusOf('a/emu').task.phase, 'waiting');
  hb.cancel('a/emu');
  await settle();
  const status = hb.statusOf('a/emu');
  assert.equal(status.task, null);
  assert.equal(status.failed, '');
  assert.deepEqual(told, []);
});

test("0.5.3: installing an app's package after its payload deletes the payload, which Remove would never find again", async () => {
  // Jake's console: Spectrum Library's payload, then its Native package; removing it then left the payload behind.
  const dir = '/data/JobeesLair/payloads/p__spectrum';
  const files = [
    { name: 'SpectrumLibrary_1.4.8.elf', kind: 'payload', url: release('p/spectrum', 'SpectrumLibrary_1.4.8.elf'), size: 4096 },
    { name: 'Spectrum_Library_1.4.8_Native.pkg', kind: 'pkg', url: release('p/spectrum', 'Spectrum_Library_1.4.8_Native.pkg'), size: 4096 },
  ];
  const twice = async (saved) => {
    const world = console2();
    const hb = store(world, [app('p/spectrum', files)], { packages: { install: () => ({ done: Promise.resolve({}), cancel() {} }) } });
    hb.install('p/spectrum', 'SpectrumLibrary_1.4.8.elf');
    await settle();
    assert.equal(world.fs.readFile(`${dir}/SpectrumLibrary_1.4.8.elf`), 'bytes of SpectrumLibrary_1.4.8.elf');
    if (saved) world.fs.writeFile(`${dir}/library.db`, 'what it saved');
    hb.install('p/spectrum', 'Spectrum_Library_1.4.8_Native.pkg');
    await settle();
    await settle();
    assert.equal(hb.statusOf('p/spectrum').record.package, true);
    assert.ok(!world.fs.exists(`${dir}/SpectrumLibrary_1.4.8.elf`), 'the payload is gone');
    return world;
  };
  assert.ok(!(await twice(false)).fs.exists(dir), 'and its folder, empty');
  assert.equal((await twice(true)).fs.readFile(`${dir}/library.db`), 'what it saved', 'what it saved stays');
});

// ---- The companion's routes ----------------------------------------------------------------------------

test('companion: the homebrew list, an app, installing it and the dashboard', async () => {
  const world = console2();
  const hb = store(world, [
    app('a/pay', [{ name: 'pay.elf', kind: 'payload', url: release('a/pay', 'pay.elf'), size: 2048 }], { stars: 50, icon: 'https://raw.githubusercontent.com/a/pay/main/icon0.png' }),
    app('b/emu', [{ name: 'Emu.exfat', kind: 'image', url: release('b/emu', 'Emu.exfat') }], { stars: 90 }),
  ]);
  const handle = createCompanionApi({
    catalog: { search: () => [], getGame: () => null }, describe: () => ({}), download: () => ({}), queue: () => [], control: {},
    storage: () => [{ root: '/data', name: 'Internal', free: 1, total: 2 }], feeds: { list: () => [] }, info: () => ({ app: "Jobee'sLair", version: '0.5.0' }), homebrew: hb,
  });
  const call = (method, route, body) => {
    const [p, query = ''] = route.split('?');
    const answer = handle({ method, path: p, query, body: body ? JSON.stringify(body) : '' });
    return { status: answer.status, body: JSON.parse(answer.body) };
  };
  const list = call('GET', '/api/homebrew?q=&limit=10');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.apps.map((a) => a.id), ['b/emu', 'a/pay'], 'most starred first');
  assert.equal(list.body.apps[1].icon, 'https://raw.githubusercontent.com/a/pay/main/icon0.png');
  assert.equal(call('GET', '/api/homebrew?category=nope').body.total, 0);
  assert.equal(call('GET', '/api/homebrew/app?id=a%2Fpay').body.files[0].name, 'pay.elf');
  assert.equal(call('POST', '/api/homebrew/install', { id: 'nope/x' }).status, 404);
  assert.equal(call('POST', '/api/homebrew/install', { id: 'a/pay' }).status, 200);
  await settle();
  assert.equal(call('GET', '/api/homebrew/app?id=a%2Fpay').body.installed.runnable, true);
  assert.equal(call('POST', '/api/homebrew/run', { id: 'a/pay' }).status, 200);
  const dashboard = call('GET', '/api/dashboard').body;
  assert.equal(dashboard.homebrew.installed, 1);
  assert.equal(dashboard.active, null);
  assert.equal(dashboard.drives[0].name, 'Internal');
});

// 0.5.1: the list (sources.json) and its builder live in JVK3R/JobeesLair-Homebrew, with their own test.

// 0.5.0 Pre Release 4: "Report a problem" on the phone fetches the debug log as text.
test('companion: the debug log comes as plain text, and only when the app hands one over', async () => {
  const base = { catalog: { search: () => [], getGame: () => null }, describe: () => ({}), download: () => ({}), queue: () => [], control: {}, storage: () => [], feeds: { list: () => [] }, info: () => ({}) };
  const withLogs = createCompanionApi({ ...base, logs: () => '[10:00:00.000] INFO  app log opened\n' });
  const answer = withLogs({ method: 'GET', path: '/api/logs', query: '', body: '' });
  assert.equal(answer.status, 200);
  assert.match(answer.type, /^text\/plain/);
  assert.equal(answer.body, '[10:00:00.000] INFO  app log opened\n');
  assert.equal(createCompanionApi({ ...base, logs: () => '' })({ method: 'GET', path: '/api/logs', query: '', body: '' }).body, '(the log is empty)');
  assert.equal(createCompanionApi(base)({ method: 'GET', path: '/api/logs', query: '', body: '' }).status, 404);
  const { PAGE } = await load('app/companion/page.js');
  for (const id of ['shareLog', 'saveLog', 'copyLog']) assert.ok(PAGE.includes(`id="${id}"`), id);
  const script = /<script>([\s\S]*?)<\/script>/.exec(PAGE)[1];
  assert.doesNotThrow(() => new Function(script), 'the page script parses');
});

test('an app folder installed by an earlier build is opened to everyone once, so the console can start it', () => {
  const world = console2({ seed: {
    '/data/homebrew/PPSA99203/eboot.bin': 'e', '/data/homebrew/PPSA99203/sce_sys/param.json': '{}',
    '/download0/JobeesLair/homebrew-installed.json': JSON.stringify({ version: 1, apps: { 'a/emu': { tag: 'v1', file: 'Emu.zip', kind: 'app', paths: ['/data/homebrew/PPSA99203'], root: '/data', titleId: 'PPSA99203' } } }),
  } });
  const hb = store(world, [app('a/emu', [{ name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 2048 }])]);
  hb.load();
  assert.equal(world.fs.modes.get('/data/homebrew/PPSA99203/eboot.bin'), 0o777);
  assert.equal(JSON.parse(world.fs.readFile('/download0/JobeesLair/homebrew-installed.json')).apps['a/emu'].opened, true);
  world.fs.modes.clear();
  hb.rescan();
  assert.equal(world.fs.modes.size, 0, 'and not again');
});

// 0.5.3: releases that name their files after their version (EVO Player, PS5MC, Lineup, Nuvio Max'd).
const evoFile = (version, pro) => `EVOPlayer-v${version}-PPSA99039${pro ? '-pro' : ''}.ffpfsc`;
const evo = (version, extra = {}) => app('s/evo', [false, true].map((pro) => ({ name: evoFile(version, pro), kind: 'image', url: release('s/evo', evoFile(version, pro)), size: 4096 })), { release: { tag: `v${version}`, date: 2 }, ...extra });
function evoWorld(installedFile, seed = {}) {
  const world = console2({ seed: { [`/data/homebrew/${installedFile}`]: 'old image', ...seed } });
  world.fs.writeFile('/download0/JobeesLair/homebrew-installed.json', JSON.stringify({ version: 1, apps: { 's/evo': { tag: 'v0.13.0', file: installedFile, kind: 'image', paths: [`/data/homebrew/${installedFile}`], root: '/data' } } }));
  return world;
}

test('0.5.3: an update keeps the variant installed when its file is named after the version, and the older image goes', async () => {
  const world = evoWorld(evoFile('0.13.0', true), { [`/data/homebrew/${evoFile('0.13.0', false)}`]: 'the plain build, put there by hand' });
  const hb = store(world, [evo('0.14.0')]);
  const status = hb.statusOf('s/evo');
  assert.equal(status.update, true);
  // The page's Update button: the installed file's name when the release still has it, else none.
  hb.install('s/evo', status.record.file && hb.app('s/evo').files.some((file) => file.name === status.record.file) ? status.record.file : void 0);
  await settle();
  await settle();
  assert.equal(world.enqueued[0].destination, `/data/downloads/homebrew/s__evo/${evoFile('0.14.0', true)}`, 'the -pro build again, not the release\'s first file');
  assert.equal(world.fs.readFile(`/data/homebrew/${evoFile('0.14.0', true)}`), `bytes of ${evoFile('0.14.0', true)}`);
  assert.ok(!world.fs.exists(`/data/homebrew/${evoFile('0.13.0', true)}`), 'the older image of it is gone');
  assert.equal(world.fs.readFile(`/data/homebrew/${evoFile('0.13.0', false)}`), 'the plain build, put there by hand', 'another variant stays');
  assert.equal(hb.statusOf('s/evo').record.file, evoFile('0.14.0', true));
  assert.equal(hb.statusOf('s/evo').update, false);
});

test('0.5.3: picking another variant leaves the installed one; a variant is its name without the version', async () => {
  const world = evoWorld(evoFile('0.13.0', true));
  const hb = store(world, [evo('0.14.0')]);
  hb.install('s/evo', evoFile('0.14.0', false));
  await settle();
  await settle();
  assert.ok(world.fs.exists(`/data/homebrew/${evoFile('0.14.0', false)}`));
  assert.equal(world.fs.readFile(`/data/homebrew/${evoFile('0.13.0', true)}`), 'old image', 'the -pro build is another app to the player: it stays');
  const kodi = (version, kodi2, id) => `PS5MC-${version}-kodi${kodi2}-PPSA${id}.exfat`;
  assert.equal(variantOf(kodi('1.2', 21, 99421)), variantOf(kodi('1.3', 21, 99421)), 'a new version of one build');
  assert.notEqual(variantOf(kodi('1.3', 21, 99421)), variantOf(kodi('1.3', 22, 99420)), 'not the other Kodi build');
  assert.equal(variantOf('Lineup-1.4.1.exfat'), variantOf('Lineup-1.4.2.exfat'));
});

test('0.5.3: a payload named after its version is replaced by the new one, not kept beside it', async () => {
  const dir = '/data/JobeesLair/payloads/p__tool';
  const world = console2({ seed: { [`${dir}/tool-v1.2.elf`]: 'old', [`${dir}/tool.cfg`]: 'settings' } });
  world.fs.writeFile('/download0/JobeesLair/homebrew-installed.json', JSON.stringify({ version: 1, apps: { 'p/tool': { tag: 'v1.2', file: 'tool-v1.2.elf', kind: 'payload', paths: [dir], run: `${dir}/tool-v1.2.elf` } } }));
  const hb = store(world, [app('p/tool', [{ name: 'tool-v1.3.elf', kind: 'payload', url: release('p/tool', 'tool-v1.3.elf'), size: 4096 }], { release: { tag: 'v1.3', date: 2 } })]);
  hb.install('p/tool');
  await settle();
  await settle();
  assert.equal(world.fs.readFile(`${dir}/tool-v1.3.elf`), 'bytes of tool-v1.3.elf');
  assert.ok(!world.fs.exists(`${dir}/tool-v1.2.elf`), 'the old payload is gone');
  assert.equal(world.fs.readFile(`${dir}/tool.cfg`), 'settings', 'what sits beside it stays');
  assert.equal(hb.statusOf('p/tool').record.run, `${dir}/tool-v1.3.elf`);
});

test("0.5.3: search finds an app by its maker and its category (its name in the player's language too)", () => {
  const index = normalizeIndex(doc([
    app('swordpdf/ps5sx2', [{ name: 'a.exfat', kind: 'image', url: release('swordpdf/ps5sx2', 'a.exfat') }], { description: 'A port of PCSX2' }),
    app('other/tool', [{ name: 'b.elf', kind: 'payload', url: release('other/tool', 'b.elf') }], { category: 'system', description: 'Does things' }),
  ]));
  assert.deepEqual(searchApps(index.apps, 'swordpdf').map((a) => a.id), ['swordpdf/ps5sx2'], 'by its maker');
  assert.deepEqual(searchApps(index.apps, 'emulators').map((a) => a.id), ['swordpdf/ps5sx2'], 'by its category');
  assert.deepEqual(searchApps(index.apps, 'emulatoren', (a) => (a.category === 'emulators' ? 'Emulatoren' : 'Systemwerkzeuge')).map((a) => a.id), ['swordpdf/ps5sx2'], 'by its category in German');
  assert.deepEqual(searchApps(index.apps, 'system tools').map((a) => a.id), ['other/tool']);
});
