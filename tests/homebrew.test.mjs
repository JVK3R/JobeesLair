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
const { createHomebrew } = await load('app/state/homebrew.js');
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
    app('a/one', [{ name: 'one.elf', kind: 'payload', url: release('a/one', 'one.elf'), size: 10 }, { name: 'evil.elf', kind: 'payload', url: 'https://example.com/evil.elf' }]),
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
  return {
    files, dirs, modes,
    chmod: (p, mode) => { modes.set(p, mode); },
    exists: (p) => files.has(p) || dirs.has(p),
    readFile: (p) => { if (!files.has(p)) throw new Error(`ENOENT ${p}`); return files.get(p); },
    writeFile: (p, text) => { addDirs(p); files.set(p, text); },
    mkdir: (p) => { dirs.add(p); addDirs(p); },
    remove: (p) => { files.delete(p); dirs.delete(p); },
    removeTree: (p) => { for (const q of under(p)) { files.delete(q); dirs.delete(q); } files.delete(p); dirs.delete(p); },
    removeAsync: async (p) => { for (const q of under(p)) { files.delete(q); dirs.delete(q); } files.delete(p); dirs.delete(p); },
    rename: (from, to) => {
      if (!files.has(from) && !dirs.has(from)) throw new Error(`ENOENT ${from}`);
      if (files.has(from)) { files.set(to, files.get(from)); files.delete(from); addDirs(to); return; }
      for (const q of under(from)) {
        const moved = to + q.slice(from.length);
        if (files.has(q)) { files.set(moved, files.get(q)); files.delete(q); } else { dirs.delete(q); dirs.add(moved); }
      }
      dirs.delete(from); dirs.add(to); addDirs(to);
    },
    readDir: (p) => [...new Set([...files.keys(), ...dirs].filter((q) => parent(q) === p && q !== p))].map((q) => ({ name: q.slice(p.length + 1), isDirectory: dirs.has(q), isFile: files.has(q) })),
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
      for (const [rel, text] of Object.entries(archivesHold[sources[0].slice(sources[0].lastIndexOf('/') + 1)] ?? {})) fs.writeFile(`${destination}/${rel}`, text);
      return { done: Promise.resolve({}), cancel() {} };
    },
  };
  const payloads = { send: (p, options) => (sent.push([p, options.port]), { ok: true, answer: '' }) };
  return { fs, downloads, archives, payloads, enqueued, sent };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
function store(world, apps) {
  return createHomebrew({
    fs: world.fs, http: { request: async () => ({ ok: false, status: 404 }) }, downloads: world.downloads, archives: world.archives, payloads: world.payloads,
    dataDir: '/download0/JobeesLair', payloadDir: '/data/JobeesLair/payloads', roots: () => ['/data', '/mnt/usb0'], freeBytes: () => 1e12,
    readBundled: () => JSON.stringify(doc(apps)), now: () => 5, log: () => {}, defer: (work) => work(),
  });
}

test('install: a disk image goes into homebrew/ through a staging download, and its release is recorded', async () => {
  const world = console2();
  const hb = store(world, [app('a/img', [{ name: 'Tool.exfat', kind: 'image', url: release('a/img', 'Tool.exfat'), size: 10 }])]);
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
  const hb = store(world, [app('a/emu', [{ name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 10 }])]);
  assert.equal(hb.statusOf('a/emu').outside === null, true, 'not found before the folder name is known');
  hb.install('a/emu');
  await settle();
  assert.equal(world.fs.readFile('/data/homebrew/PPSA99001/eboot.bin'), 'new');
  assert.equal(hb.statusOf('a/emu').record.titleId, 'PPSA99001');
  for (const p of ['/data/homebrew/PPSA99001/eboot.bin', '/data/homebrew/PPSA99001/sce_sys/param.json', '/data/homebrew/PPSA99001/sce_sys', '/data/homebrew/PPSA99001']) assert.equal(world.fs.modes.get(p), 0o777, `${p} is open to everyone, as an FTP copy is: the console cannot start an app it can't execute`);
});

test('install: an app\'s helper payload comes with it, runs from the app, and goes when the app does', async () => {
  const world = console2({ archivesHold: { 'Emu.zip': { 'Emu/eboot.bin': 'e', 'Emu/sce_sys/param.json': JSON.stringify({ titleId: 'PPSA99203' }) } } });
  const files = [
    { name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 10 },
    { name: 'Helper.elf', kind: 'payload', url: release('a/emu', 'Helper.elf'), size: 10 },
    { name: 'Other.elf', kind: 'payload', url: release('a/emu', 'Other.elf'), size: 10 },
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
    { name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 10 },
    { name: 'Helper.elf', kind: 'payload', url: release('a/emu', 'Helper.elf'), size: 10 },
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
    app('a/pay', [{ name: 'pay.elf', kind: 'payload', url: release('a/pay', 'pay.elf'), size: 10 }]),
    app('b/kit', [{ name: 'kit.zip', kind: 'archive-payload', inner: 'kit/kit.elf', url: release('b/kit', 'kit.zip'), size: 10 }]),
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

// ---- The companion's routes ----------------------------------------------------------------------------

test('companion: the homebrew list, an app, installing it and the dashboard', async () => {
  const world = console2();
  const hb = store(world, [
    app('a/pay', [{ name: 'pay.elf', kind: 'payload', url: release('a/pay', 'pay.elf'), size: 10 }], { stars: 50, icon: 'https://raw.githubusercontent.com/a/pay/main/icon0.png' }),
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

// 0.5.0 Pre Release 3: the list grows with nexgen999's PS5 Repository List (tools/homebrew/build-index.mjs).
test('sources: every PS5 Repository List category maps to one of ours or to nothing; exclusions stay out', () => {
  const sources = JSON.parse(readFileSync(path.join(repo, 'homebrew/sources.json'), 'utf8'));
  const ours = new Set(sources.categories.map((category) => category.id));
  assert.match(sources.upstream.config, /^https:\/\/raw\.githubusercontent\.com\/nexgen999\/PS5-Repository-List\//);
  for (const [name, category] of Object.entries(sources.upstream.categories)) assert.ok(category === null || ours.has(category), `${name} -> ${category}`);
  assert.equal(sources.upstream.categories.pc_apps, null, 'PC tools are not listed');
  for (const repo2 of ['JVK3R/JobeesLair', 'axotk1k1/hdrezka-ps5']) assert.ok(sources.exclude.includes(repo2), repo2);
  const listed = new Set(sources.apps.map((entry) => entry.repo.toLowerCase()));
  for (const repo2 of sources.exclude) assert.ok(!listed.has(repo2.toLowerCase()), `${repo2} is excluded but listed`);
  const builder = readFileSync(path.join(repo, 'tools/homebrew/build-index.mjs'), 'utf8');
  assert.match(builder, /if \(excluded\.has\(lower\(full\)\)\) return \{ skip: 'excluded' \}/, 'a moved repository is excluded by its current name too');
});

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
  const hb = store(world, [app('a/emu', [{ name: 'Emu.zip', kind: 'app', folder: 'Emu', url: release('a/emu', 'Emu.zip'), size: 10 }])]);
  hb.load();
  assert.equal(world.fs.modes.get('/data/homebrew/PPSA99203/eboot.bin'), 0o777);
  assert.equal(JSON.parse(world.fs.readFile('/download0/JobeesLair/homebrew-installed.json')).apps['a/emu'].opened, true);
  world.fs.modes.clear();
  hb.rescan();
  assert.equal(world.fs.modes.size, 0, 'and not again');
});
