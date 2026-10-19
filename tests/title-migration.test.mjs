// Carrying a player's files over to the new title ID (state/title-migration.js). Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { migrateFromOldTitle, OLD_TITLE_ID, ATTEMPTS } = await load('app/state/title-migration.js');

// A small in-memory FileSystem: files by path, folders implied by them.
function memory(files = {}, { mtimes = {}, failWrite = false } = {}) {
  const map = new Map(Object.entries(files));
  const folders = new Set();
  for (const file of map.keys()) for (let at = file.lastIndexOf('/'); at > 0; at = file.lastIndexOf('/', at - 1)) folders.add(file.slice(0, at));
  const children = (dir) => {
    const seen = new Map();
    for (const file of map.keys()) if (file.startsWith(`${dir}/`)) {
      const rest = file.slice(dir.length + 1), name = rest.split('/')[0];
      seen.set(name, { name, isDirectory: rest.includes('/'), size: rest.includes('/') ? 0 : map.get(file).length });
    }
    for (const folder of folders) if (folder.startsWith(`${dir}/`) && !folder.slice(dir.length + 1).includes('/')) seen.set(folder.slice(dir.length + 1), { name: folder.slice(dir.length + 1), isDirectory: true, size: 0 });
    return [...seen.values()];
  };
  return {
    map,
    exists: (p) => map.has(p) || folders.has(p),
    readFile: (p) => { if (!map.has(p)) throw new Error(`ENOENT ${p}`); return map.get(p); },
    writeFile: (p, text) => { if (failWrite) throw new Error('disk full'); map.set(p, text); },
    rename: (a, b) => { map.set(b, map.get(a)); map.delete(a); },
    mkdir: (p) => { folders.add(p); },
    readDir: (p) => { if (!map.size || (!folders.has(p) && !children(p).length)) throw new Error(`ENOENT ${p}`); return children(p); },
    stat: (p) => ({ modified: mtimes[p] ?? 1, size: map.get(p)?.length ?? 0 }),
  };
}

const NEW = 'PPSA99471';
const DATA = '/download0/JobeesLair';
const QUEUE = `/data/ps5-react/${NEW}/queue`;
const OLD = '/mnt/sandbox/PPSA99058_000/download0/JobeesLair';
const OLD_QUEUE = '/data/ps5-react/PPSA99058/queue';
const world = (extra = {}, options) => memory({
  [`${OLD}/settings.json`]: '{"vibration":false,"speedLimit":10,"language":"de"}',
  [`${OLD}/wishlist.json`]: '["PPSA01234"]',
  [`${OLD}/debrid.json`]: '{"key":"k"}',
  [`${OLD}/feeds.json`]: '["https://example.com/feed.json"]',
  [`${OLD}/update-check.json`]: '{"checkedAt":1}',
  [`${OLD}/auto-update.json`]: '{"phase":"failed"}',
  [`${OLD}/link-health.json`]: '{"x":1}',
  [`${OLD}/logs/jobeeslair.log`]: 'a log',
  [`${OLD}/settings.json.unreadable-5`]: 'junk',
  [`${OLD_QUEUE}/downloads.json`]: '{"version":1,"jobs":[]}',
  [`${OLD_QUEUE}/launches.json`]: '{"version":1,"titles":{}}',
  [`${OLD_QUEUE}/playtime.json`]: '{"version":1,"titles":{}}',
  ...extra,
}, options);
const run = (fs, extra = {}) => {
  const lines = [];
  const result = migrateFromOldTitle({ fs, log: (line) => lines.push(line), dataDir: DATA, queueDir: QUEUE, ...extra });
  return { ...result, lines };
};

test('the old title ID is the one 0.4.0 and Overdrive share, and the new one is not', async () => {
  const { TITLE_ID } = await load('app/version.js');
  assert.equal(OLD_TITLE_ID, 'PPSA99058');
  assert.equal(TITLE_ID, NEW);
  assert.notEqual(TITLE_ID, OLD_TITLE_ID);
  const app = JSON.parse(readFileSync(path.join(repo, 'app/app.json'), 'utf8'));
  assert.equal(app.titleId, TITLE_ID);
  assert.ok(app.contentId.includes(`-${TITLE_ID}_00-`), 'the content ID names the same title');
});

test('the saved files and the queue are copied to the new places', () => {
  const fs = world();
  const result = run(fs);
  assert.equal(result.state, 'migrated');
  assert.equal(fs.map.get(`${DATA}/settings.json`), '{"vibration":false,"speedLimit":10,"language":"de"}');
  assert.equal(fs.map.get(`${DATA}/wishlist.json`), '["PPSA01234"]');
  assert.equal(fs.map.get(`${DATA}/debrid.json`), '{"key":"k"}', 'the TorBox key comes along');
  assert.equal(fs.map.get(`${DATA}/feeds.json`), '["https://example.com/feed.json"]');
  assert.equal(fs.map.get(`${QUEUE}/downloads.json`), '{"version":1,"jobs":[]}');
  assert.ok(fs.map.has(`${QUEUE}/launches.json`) && fs.map.has(`${QUEUE}/playtime.json`));
  assert.ok(result.lines.some((line) => /carried over 7 files/.test(line)), result.lines.join('|'));
});

test('state tied to the earlier build, logs and unreadable leftovers stay behind; the earlier files are untouched', () => {
  const fs = world();
  const before = [...fs.map.entries()].filter(([p]) => p.startsWith('/mnt/') || p.startsWith('/data/ps5-react/PPSA99058'));
  run(fs);
  for (const name of ['update-check.json', 'auto-update.json', 'link-health.json']) assert.equal(fs.map.has(`${DATA}/${name}`), false, name);
  assert.equal(fs.map.has(`${DATA}/logs/jobeeslair.log`), false);
  assert.equal(fs.map.has(`${DATA}/settings.json.unreadable-5`), false);
  assert.deepEqual([...fs.map.entries()].filter(([p]) => p.startsWith('/mnt/') || p.startsWith('/data/ps5-react/PPSA99058')), before, 'nothing of the earlier version changed or deleted');
});

test('a file already in the new place is kept, never overwritten', () => {
  const fs = world({ [`${DATA}/settings.json`]: '{"language":"fr"}' });
  run(fs);
  assert.equal(fs.map.get(`${DATA}/settings.json`), '{"language":"fr"}');
  assert.equal(fs.map.get(`${DATA}/wishlist.json`), '["PPSA01234"]', 'the others still come over');
});

test('it runs once: a second launch finds the marker and does nothing', () => {
  const fs = world();
  run(fs);
  fs.map.delete(`${DATA}/wishlist.json`);
  const again = run(fs);
  assert.equal(again.state, 'done');
  assert.equal(fs.map.has(`${DATA}/wishlist.json`), false, 'not copied a second time');
  assert.equal(JSON.parse(fs.map.get(`${DATA}/.migrated-from-PPSA99058`)).found, true);
});

test('with nothing to find it tries again on the next launches, then stops', () => {
  const fs = memory({});
  for (let launch = 1; launch <= ATTEMPTS; launch++) {
    const result = run(fs);
    assert.equal(result.state, 'nothing', `launch ${launch}`);
    assert.equal(JSON.parse(fs.map.get(`${DATA}/.migrated-from-PPSA99058`)).attempts, launch);
  }
  assert.equal(run(fs).state, 'done', 'three tries are enough');
  // The earlier version ran again (its files are mounted): a try still left would pick them up.
  const late = memory({ [`${OLD}/settings.json`]: '{"x":1}', [`${DATA}/.migrated-from-PPSA99058`]: JSON.stringify({ found: false, attempts: 1 }) });
  assert.equal(run(late).state, 'migrated');
});

test('the console numbers a sandbox _000, _001...: the one with the newest files wins', () => {
  const fs = memory({
    '/mnt/sandbox/PPSA99058_000/download0/JobeesLair/settings.json': '{"from":"000"}',
    '/mnt/sandbox/PPSA99058_001/download0/JobeesLair/settings.json': '{"from":"001"}',
  }, { mtimes: { '/mnt/sandbox/PPSA99058_000/download0/JobeesLair/settings.json': 100, '/mnt/sandbox/PPSA99058_001/download0/JobeesLair/settings.json': 900 } });
  const result = run(fs);
  assert.equal(fs.map.get(`${DATA}/settings.json`), '{"from":"001"}');
  assert.match(result.from, /PPSA99058_001/);
});

test('Overdrive\'s own folder in the same image is not read', () => {
  const fs = memory({ '/mnt/sandbox/PPSA99058_000/download0/overdrive/settings.json': '{"overdrive":true}' });
  const result = run(fs);
  assert.equal(result.state, 'nothing');
  assert.equal(fs.map.has(`${DATA}/settings.json`), false);
});

test('a file that is not valid JSON or is too big is not carried; a failing disk does not stop the app', () => {
  const big = `{"a":"${'x'.repeat(2 * 1024 * 1024)}"}`;
  const fs = world({ [`${OLD}/themes.json`]: 'not json', [`${OLD}/recent.json`]: big });
  const result = run(fs);
  assert.equal(fs.map.has(`${DATA}/themes.json`), false);
  assert.equal(fs.map.has(`${DATA}/recent.json`), false);
  assert.equal(result.state, 'migrated');
  const broken = world({}, { failWrite: true });
  const failed = run(broken);
  assert.equal(failed.state, 'nothing');
  assert.ok(failed.lines.some((line) => /not carried over: disk full/.test(line)), failed.lines.join('|'));
});

test('the migration runs before anything reads a saved file, and only on the console', () => {
  const index = readFileSync(path.join(repo, 'app/index.jsx'), 'utf8');
  const imports = [...index.matchAll(/^import .*from '(\.[^']+)'/gm)].map((match) => match[1]);
  assert.equal(imports[0], './state/title-migration-run.js', 'the first of the app\'s own imports');
  const run = readFileSync(path.join(repo, 'app/state/title-migration-run.js'), 'utf8');
  assert.match(run, /Platform\.OS === "ps5"/);
  assert.doesNotMatch([...run.matchAll(/^import .*$/gm)].join('\n'), /saved\.js|i18n|read-json/, 'it imports nothing that reads a saved file');
});
