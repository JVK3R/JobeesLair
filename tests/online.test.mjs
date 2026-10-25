// Jobee'sLair online, the app's side (0.5.2, app/state/online.js): what a ping sends and when, that stats off sends
// nothing about the console, install events, announcements kept up until they're down, and quiet failures. The
// server's side is tests/online-worker.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { ONLINE_URL, createOnline } = await load('app/state/online.js');

const FACTS = { version: '0.5.2-pre.1', edition: 'store', firmware: '13.60', language: 'en' };
const NOW = Date.parse('2026-10-23T12:00:00Z');
function world({ saved = {}, answer = { online: 42, announcements: [] }, status = 200, busy = false } = {}) {
  let record = { ...saved };
  let clock = NOW;
  const sent = [], timers = [];
  const http = {
    async request(url, options = {}) {
      sent.push({ url, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null });
      if (answer instanceof Error) throw answer;
      return { ok: status < 400, status, json: async () => answer };
    }
  };
  const online = createOnline({
    http,
    store: { get: () => record, set: (next) => { record = next; } },
    facts: () => FACTS,
    busy: () => busy,
    now: () => clock,
    random: (() => { let n = 0; return () => (n++ % 16) / 16; })(),
    setTimer: (run, delay) => (timers.push({ run, delay }), timers.length),
    clearTimer: () => {}
  });
  // The next timer goes off, its delay later.
  const tick = async () => {
    const timer = timers.shift();
    clock += timer.delay;
    timer.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return timer.delay;
  };
  return { online, sent, timers, tick, record: () => record, setBusy: (value) => { busy = value; }, setAnswer: (value) => { answer = value; } };
}

test('stats on: a ping a moment after launch, a look every minute, and every fifth a ping with the same random ID', async () => {
  const { online, sent, timers, tick, record } = world();
  online.start();
  assert.equal(sent.length, 0, 'nothing at launch itself');
  assert.equal(await tick(), 15e3);
  assert.equal(sent[0].url, `${ONLINE_URL}/v1/ping`);
  assert.equal(sent[0].method, 'POST');
  assert.match(sent[0].body.id, /^[0-9a-f]{32}$/);
  assert.deepEqual({ ...sent[0].body, id: undefined }, { ...FACTS, id: undefined }, 'the ID, version, edition, firmware and language: nothing else');
  assert.equal(record().id, sent[0].body.id, 'kept in online.json');
  assert.equal(timers[0].delay, 6e4, 'a minute later');
  for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual(sent.map((s) => s.url.slice(ONLINE_URL.length)), ['/v1/ping', '/v1/status', '/v1/status', '/v1/status', '/v1/status', '/v1/ping', '/v1/status', '/v1/status', '/v1/status', '/v1/status', '/v1/ping']);
  assert.equal(sent[5].body.id, sent[0].body.id);
  assert.ok(sent.filter((s) => s.method === 'GET').every((s) => s.body === null), 'a look sends nothing');
  assert.equal(online.snapshot().online, 42);
});

test('stats off: only the status is asked for, every minute, with no ID made or sent', async () => {
  const { online, sent, timers, tick, record } = world({ saved: { enabled: false } });
  online.start();
  await tick();
  assert.deepEqual(sent, [{ url: `${ONLINE_URL}/v1/status`, method: 'GET', body: null }]);
  assert.equal(record().id, undefined);
  assert.equal(timers[0].delay, 6e4, 'every minute');
  for (let i = 0; i < 6; i++) await tick();
  assert.ok(sent.every((s) => s.url === `${ONLINE_URL}/v1/status` && s.body === null));
  assert.equal(online.snapshot().online, 42, 'the count still shows');
});

test('the switch is kept, and turning it on pings straight away', async () => {
  const { online, sent, timers, tick, record } = world({ saved: { enabled: false } });
  online.start();
  online.setEnabled(true);
  assert.equal(record().enabled, true);
  assert.equal(timers.at(-1).delay, 0);
  timers.splice(0, timers.length - 1);
  await tick();
  assert.equal(sent.at(-1).url, `${ONLINE_URL}/v1/ping`);
  online.setEnabled(false);
  assert.equal(record().enabled, false);
  assert.equal(online.snapshot().enabled, false);
});

test('nothing is sent while a download holds the network', async () => {
  const { online, sent, tick, setBusy } = world({ busy: true });
  online.start();
  await tick();
  assert.equal(sent.length, 0);
  setBusy(false);
  await tick();
  assert.equal(sent.length, 1, 'the next turn goes once the download is done');
});

test('an install is reported without the ID, its error without link queries, and not at all with stats off', async () => {
  const on = world();
  on.online.installed({ app: 'brinootk/ps5x360', ok: false, error: 'HTTP 404 for https://github.com/x/y.zip?token=abc def' });
  on.online.installed({ app: 'a/emu', ok: true, error: 'ignored' });
  assert.deepEqual(on.sent.map((s) => s.body), [
    { type: 'homebrew-install', app: 'brinootk/ps5x360', ok: false, error: 'HTTP 404 for https://github.com/x/y.zip def', version: '0.5.2-pre.1', firmware: '13.60' },
    { type: 'homebrew-install', app: 'a/emu', ok: true, error: '', version: '0.5.2-pre.1', firmware: '13.60' }
  ]);
  assert.ok(on.sent.every((s) => s.url === `${ONLINE_URL}/v1/event` && !('id' in s.body)));
  const off = world({ saved: { enabled: false } });
  off.online.installed({ app: 'a/emu', ok: true });
  assert.equal(off.sent.length, 0);
});

test('the announcements stay up until the server drops them, and are there from the next launch', async () => {
  const up = [
    { id: 2, text: 'Do not update ShadowMount yet', level: 'warning', until: null },
    { id: 1, text: '0.5.2 is out', level: 'info', until: NOW + 36e5 }
  ];
  const { online, tick, record, setAnswer } = world({ answer: { online: 3, announcements: up } });
  const heard = [];
  online.subscribe((snapshot) => heard.push(snapshot));
  online.start();
  await tick();
  assert.deepEqual(online.snapshot().announcements, up, 'in the order the server gave');
  assert.deepEqual(heard.at(-1).announcements, up);
  assert.deepEqual(record().notes, up, 'kept in online.json');
  const kept = record();
  await tick();
  assert.equal(record(), kept, 'not written again while they are the same');
  // The next launch shows them before the server is asked, less any whose time ran out meanwhile.
  const next = world({ saved: { ...kept, notes: [...up, { id: 0, text: 'old news', level: 'info', until: NOW - 1 }] } });
  assert.deepEqual(next.online.snapshot().announcements, up);
  // Taken down on the dashboard: gone at the next answer, and from online.json.
  setAnswer({ online: 3, announcements: [up[0]] });
  await tick();
  assert.deepEqual(online.snapshot().announcements, [up[0]]);
  setAnswer({ online: 3, announcements: [] });
  await tick();
  assert.deepEqual([online.snapshot().announcements, record().notes], [[], []]);
});

test('while a download skips the looks, an announcement comes down at its time and an old count stops showing', async () => {
  const up = [
    { id: 2, text: 'Maintenance tonight', level: 'warning', until: NOW + 15e3 + 3 * 6e4 },
    { id: 1, text: '0.5.2 is out', level: 'info', until: null }
  ];
  const { online, tick, setBusy } = world({ answer: { online: 7, announcements: up } });
  const heard = [];
  online.subscribe((snapshot) => heard.push(snapshot));
  online.start();
  await tick();
  setBusy(true);
  await tick();
  await tick();
  assert.equal(online.snapshot().announcements.length, 2, 'still up before its time');
  await tick();
  assert.deepEqual(online.snapshot().announcements.map((note) => note.id), [1], 'down at its time, with no answer');
  assert.equal(online.snapshot().online, 7, 'a count three minutes old still shows');
  for (let i = 0; i < 8; i++) await tick();
  assert.equal(online.snapshot().online, null, 'one older than ten minutes does not');
  assert.deepEqual(heard.at(-1), { enabled: true, online: null, announcements: [up[1]] }, 'and the screens are told');
  setBusy(false);
  await tick();
  assert.equal(online.snapshot().online, 7, 'back with the next answer');
});

test('a server that stops answering: the last count shows for ten minutes, then goes', async () => {
  const { online, tick, setAnswer } = world({ answer: { online: 5, announcements: [] } });
  online.start();
  await tick();
  setAnswer(new Error('connect failed'));
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(online.snapshot().online, 5);
  await tick();
  assert.equal(online.snapshot().online, null);
});

test('a server that is down, answers badly or sends junk changes nothing', async () => {
  const down = world({ answer: new Error('connect failed') });
  down.online.start();
  await down.tick();
  assert.deepEqual([down.online.snapshot().online, down.timers[0].delay], [null, 6e4], 'and it tries again a minute later');
  const refused = world({ status: 503 });
  refused.online.start();
  await refused.tick();
  assert.equal(refused.online.snapshot().online, null);
  const junk = world({ answer: { online: 'many', announcements: [{ text: 'no id' }, { id: 3, text: '' }, 'words', null] } });
  junk.online.start();
  await junk.tick();
  assert.deepEqual([junk.online.snapshot().online, junk.online.snapshot().announcements], [null, []]);
  const many = world({ answer: { online: 1, announcements: Array.from({ length: 9 }, (_, i) => ({ id: i, text: `note ${i}`, level: 'loud' })) } });
  many.online.start();
  await many.tick();
  assert.equal(many.online.snapshot().announcements.length, 5, 'five at most');
  assert.ok(many.online.snapshot().announcements.every((note) => note.level === 'info' && note.until === null));
  const broken = world({ saved: { notes: 'not a list' } });
  assert.deepEqual(broken.online.snapshot().announcements, []);
});
