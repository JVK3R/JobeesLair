// 0.5.7: where the published lists live (state/lists-home.js). github.com/JVK3R/JobeesLair-Lists until a list's address
// answers that the file is not there; then api.jobees.org is asked once a launch for their home, the answer is kept,
// and the lists are read from there. Any other answer leaves everything as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const home = await load('app/state/lists-home.js');
const { DATA_DIR } = await load('app/state/data-dir.js');
const { encodeJlx } = await load('app/state/jlx.js');

const GITHUB = 'https://raw.githubusercontent.com/JVK3R/JobeesLair-Lists/main/';
const WHERE = 'https://api.jobees.org/v1/lists/home';
const SAVED = `${DATA_DIR}/lists-home.json`;
const MOVED = 'https://lists.example.org/jl/';

const memFs = (files = new Map()) => ({
  files, exists: (p) => files.has(p), readFile: (p) => files.get(p), writeFile: (p, text) => files.set(p, String(text)),
  rename: (from, to) => { files.set(to, files.get(from)); files.delete(from); }
});
// answer(url) -> { status, body } or an Error (no connection).
const server = (answer) => {
  const asked = [];
  return { asked, async request(url) {
    asked.push(url);
    const reply = answer(url);
    if (reply instanceof Error) throw reply;
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, headers: {}, text: async () => reply.body ?? '' };
  } };
};

test('the lists home: JobeesLair-Lists on GitHub until told otherwise', () => {
  home.forgetListsHome();
  const fs = memFs();
  assert.equal(home.LISTS_HOME, GITHUB);
  assert.equal(home.listsAddress('ps4/store.jlx', fs), `${GITHUB}ps4/store.jlx`);
  for (const status of [404, 410, 451]) assert.equal(home.listsGone(status), true, `${status}: not there`);
  for (const status of [200, 304, 403, 408, 429, 500, 502, 503, 0, undefined]) assert.equal(home.listsGone(status), false, `${status}: not a move`);
});

test('the lists home: a new home named by api.jobees.org is kept, asked once a launch, and read at the next launch', async () => {
  home.forgetListsHome();
  const fs = memFs();
  const api = server((url) => url === WHERE ? { status: 200, body: JSON.stringify({ base: MOVED }) } : { status: 404 });
  assert.equal(await home.askListsHome(api, fs), MOVED);
  assert.deepEqual(api.asked, [WHERE]);
  assert.equal(home.listsAddress('ps4/more.jlx', fs), `${MOVED}ps4/more.jlx`, 'this launch reads from the new home');
  assert.equal(JSON.parse(fs.files.get(SAVED)).base, MOVED, 'kept in the data folder');
  assert.equal(await home.askListsHome(api, fs), MOVED);
  assert.equal(api.asked.length, 1, 'once a launch');
  home.forgetListsHome();
  assert.equal(home.listsBase(fs), MOVED, 'the next launch starts at the new home');
  // Named the home it already has: nothing to retry.
  assert.equal(await home.askListsHome(api, fs), null);
});

test('the lists home: no answer, a refusal or a bad address leaves the lists where they were', async () => {
  const bad = ['http://lists.example.org/', 'https://lists.example.org/no-slash', 'https://lists.example.org/a b/', 'https://x.example/"/',
    'javascript:alert(1)/', '', 123, null, `https://${'x'.repeat(300)}.example/`];
  const answers = [new Error('could not connect'), { status: 404, body: '{"error":"not found"}' }, { status: 500 }, { status: 200, body: 'not json' },
    ...bad.map((base) => ({ status: 200, body: JSON.stringify({ base }) }))];
  for (const reply of answers) {
    home.forgetListsHome();
    const fs = memFs();
    assert.equal(await home.askListsHome(server(() => reply), fs), null, JSON.stringify(reply?.body ?? reply?.message));
    assert.equal(home.listsBase(fs), GITHUB);
    assert.equal(fs.files.has(SAVED), false, 'nothing kept');
  }
  // A kept file that is not a home is passed over.
  for (const text of ['{', JSON.stringify({ base: 'http://lists.example.org/' }), '']) {
    home.forgetListsHome();
    assert.equal(home.listsBase(memFs(new Map([[SAVED, text]]))), GITHUB);
  }
});

test('the live catalog: GitHub answers 404, api.jobees.org names the new home, and the catalog is read from there', async () => {
  const core = await import('@ps5-react/core');
  const feeds = await load('app/state/feeds.js');
  const keptFiles = globalThis.__stubFiles, keptRequest = core.Http.request;
  globalThis.__stubFiles = new Map();
  home.forgetListsHome();
  const feed = encodeJlx(JSON.stringify({ version: 1, name: 'Live', games: [
    { id: 'PPSA10000', title: 'Sample Game', releases: [{ name: 'Sample Game v1.00', url: 'https://example.com/files/0/game.exfat' }] }] }));
  let githubAnswers = 404;
  const asked = [];
  core.Http.request = async (url) => {
    asked.push(url);
    if (url === `${GITHUB}ps5/live.jlx`) return { ok: false, status: githubAnswers, headers: {}, text: async () => '' };
    if (url === WHERE) return { ok: true, status: 200, headers: {}, text: async () => JSON.stringify({ base: MOVED }) };
    if (url === `${MOVED}ps5/live.jlx`) return { ok: true, status: 200, headers: { etag: '"m1"' }, text: async () => feed };
    return { ok: false, status: 404, headers: {}, text: async () => '' };
  };
  try {
    await feeds.refreshFeeds();
    assert.deepEqual(asked, [`${GITHUB}ps5/live.jlx`, WHERE, `${MOVED}ps5/live.jlx`]);
    assert.equal(feeds.feedsSnapshot([feeds.LIVE_FEED])[0].state, 'ok');
    assert.equal(JSON.parse(globalThis.__stubFiles.get(SAVED)).base, MOVED);
    // The next refresh goes straight to the new home.
    asked.length = 0;
    await feeds.refreshFeeds();
    assert.deepEqual(asked, [`${MOVED}ps5/live.jlx`]);
    // GitHub having trouble (500) is not a move: api.jobees.org is not asked.
    globalThis.__stubFiles = new Map();
    home.forgetListsHome();
    githubAnswers = 500;
    asked.length = 0;
    await feeds.refreshFeeds();
    assert.deepEqual(asked, [`${GITHUB}ps5/live.jlx`]);
    assert.equal(feeds.feedsSnapshot([feeds.LIVE_FEED])[0].state, 'failed');
  } finally {
    globalThis.__stubFiles = keptFiles;
    core.Http.request = keptRequest;
    home.forgetListsHome();
  }
});
