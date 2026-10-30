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
function world({ saved = {}, answer = { online: 42, announcements: [] }, status = 200, busy = false, facts = () => FACTS, heard = [] } = {}) {
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
    facts,
    sent: (said) => heard.push(['sent', said]),
    quiet: () => heard.push(['quiet']),
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
  return { online, sent, timers, tick, heard, record: () => record, setBusy: (value) => { busy = value; }, setStatus: (value) => { status = value; }, setAnswer: (value) => { answer = value; } };
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

// 0.5.4: the phone companion's part (companion/usage.js) rides on the ping, and only a ping that went through takes
// its counts off; with stats off, what was counted is dropped, so nothing from then is ever sent.
test('the companion part rides on a ping and is taken off only once the ping went through', async () => {
  const phone = { on: true, away: false, minutes: 4, opens: 1, games: 2, homebrew: 0, downloads: 0, library: 0, remote: 7, feeds: 0 };
  const { online, sent, tick, heard, setStatus } = world({ status: 503, facts: () => ({ ...FACTS, companion: phone }) });
  online.start();
  await tick();
  assert.deepEqual(sent[0].body.companion, phone);
  assert.deepEqual(heard, [], 'refused: kept for the next ping');
  setStatus(200);
  await tick();
  assert.equal(sent[1].url, `${ONLINE_URL}/v1/ping`, 'the next look pings again');
  assert.deepEqual(heard, [['sent', sent[1].body]], 'what went through, as sent');
  await tick();
  assert.equal(sent[2].url, `${ONLINE_URL}/v1/status`);
  assert.equal(heard.length, 1, 'a look takes nothing off');
});

test('with stats off, what the companion counted is dropped at every look and when the switch moves', async () => {
  const { online, sent, tick, heard } = world({ saved: { enabled: false }, busy: true, facts: () => ({ ...FACTS, companion: { on: true, minutes: 3 } }) });
  online.start();
  await tick();
  await tick();
  assert.deepEqual(heard, [['quiet'], ['quiet']], 'even while a download holds the network');
  assert.equal(sent.length, 0);
  online.setEnabled(true);
  assert.deepEqual(heard.at(-1), ['quiet'], 'switched on: what came in while off is dropped first');
  online.setEnabled(false);
  assert.equal(heard.filter(([what]) => what === 'quiet').length, 4);
});

// ---- Game launches and the players' numbers (0.5.4) --------------------------------------------------------------
const { md5 } = await load('app/services/torbox.js');
const { compatOf } = await load('app/state/compat.js');
const report = (title, outcome = 'played', extra = {}) => ({ title, outcome, verdict: outcome === 'played' ? 'ran' : 'notStarted', format: 'exfat', fixed: false, backport: false, ...extra });
// A server that answers each address on its own: `answers[path]` is {status, body} or an Error.
function launchWorld({ saved = {}, answers = {}, busy = false, secret = () => 'abcdefghijklmnop0123456789' } = {}) {
  let record = { ...saved }, compat = {}, clock = NOW;
  const sent = [], timers = [];
  const http = {
    async request(url, options = {}) {
      const path = url.slice(ONLINE_URL.length);
      sent.push({ path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null });
      const answer = answers[path] ?? { status: 200, body: path === '/v1/launches' ? null : { online: 1, announcements: [] } };
      if (answer instanceof Error) throw answer;
      return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
    }
  };
  const online = createOnline({
    http, facts: () => FACTS, busy: () => busy, now: () => clock, secret,
    store: { get: () => record, set: (next) => { record = next; } },
    compatStore: { get: () => compat, set: (next) => { compat = next; } },
    setTimer: (run, delay) => (timers.push({ run, delay }), timers.length), clearTimer: () => {}
  });
  return {
    online, sent, record: () => record, compat: () => compat,
    look: async (ms = 6e4) => { clock += ms; await online.refresh(); },
    setBusy: (value) => { busy = value; }, answers
  };
}

test('launches: kept to send only with stats on, one a game, the newest last', () => {
  const off = launchWorld({ saved: { enabled: false } });
  off.online.launched(report('PPSA09076'));
  off.online.launchedBefore([report('PPSA01748')]);
  assert.equal(off.record().launches, undefined, 'stats off: nothing kept');
  const { online, record } = launchWorld();
  online.launched(report('PPSA09076', 'wontStart'));
  online.launched(report('PPSA01748'));
  online.launched(report('PPSA09076', 'played', { fixed: true }));
  online.launched({ title: 'nope', outcome: 'played', verdict: 'ran' });
  online.launched(report('PPSA00001', 'played', { verdict: 'crashed' }));
  assert.deepEqual(Object.keys(record().launches), ['PPSA01748', 'PPSA09076'], 'one a game, the newest last; junk left out');
  assert.equal(record().launches.PPSA09076.fixed, true);
});

test('launches: the ones known from before go once, the first time stats are on', () => {
  const { online, record } = launchWorld();
  online.launchedBefore([report('PPSA09076'), report('PPSA01748', 'wontStart')]);
  online.launchedBefore([report('PPSA00002')]);
  assert.deepEqual(Object.keys(record().launches), ['PPSA09076', 'PPSA01748']);
  assert.equal(record().launchesKnown, true);
});

test("launches: sent after a look, twenty at a time, under tokens from a secret that's never sent, and gone once they went", async () => {
  const { online, sent, record, look } = launchWorld();
  online.launchedBefore(Array.from({ length: 25 }, (_, i) => report(`PPSA${String(i).padStart(5, '0')}`)));
  await look();
  assert.deepEqual(sent.map((s) => s.path), ['/v1/ping', '/v1/compat'], 'never with a ping (its look carries the console ID); the numbers, which say nothing about it, may');
  await look();
  assert.deepEqual(sent.map((s) => s.path).slice(2), ['/v1/status', '/v1/launches'], 'the next look, with nothing about the console');
  const first = sent.find((s) => s.path === '/v1/launches');
  assert.equal(first.method, 'POST');
  assert.equal(first.body.reports.length, 20);
  assert.deepEqual({ firmware: first.body.firmware, version: first.body.version }, { firmware: FACTS.firmware, version: FACTS.version });
  const secret = record().launchSecret;
  assert.equal(secret, 'abcdefghijklmnop0123456789', "the runtime's random token");
  assert.equal(first.body.reports[0].token, md5(`${secret}:PPSA00000`));
  assert.ok(first.body.reports.every((r) => /^[0-9a-f]{32}$/.test(r.token)) && new Set(first.body.reports.map((r) => r.token)).size === 20, 'a token a game');
  assert.ok(!JSON.stringify(sent).includes(secret), 'the secret never goes, in anything');
  const launchesSaid = JSON.stringify(sent.filter((s) => s.path === '/v1/launches'));
  assert.ok(record().id && !launchesSaid.includes(record().id), "nor the console ID with a launch (the ping beside it has it, as always)");
  assert.equal(Object.keys(record().launches).length, 5);
  await look();
  assert.equal(sent.filter((s) => s.path === '/v1/launches').at(-1).body.reports.length, 5);
  assert.deepEqual(record().launches, {});
  await look();
  assert.equal(sent.filter((s) => s.path === '/v1/launches').length, 2, 'nothing left: nothing sent');
});

test('launches: kept when the server fails, let go when it refuses them all, never sent behind a download or with stats off', async () => {
  const world2 = launchWorld({ answers: { '/v1/launches': { status: 503 } } });
  world2.online.launched(report('PPSA09076'));
  await world2.look();
  assert.ok(world2.record().launches.PPSA09076, 'kept for the next look');
  world2.answers['/v1/launches'] = { status: 400 };
  await world2.look();
  assert.deepEqual(world2.record().launches, {}, 'refused as a whole: sending it again would change nothing');
  const busy = launchWorld({ busy: true });
  busy.online.launched(report('PPSA09076'));
  await busy.look();
  assert.deepEqual(busy.sent, [], 'a download holds the network: nothing');
  busy.setBusy(false);
  busy.online.setEnabled(false);
  assert.deepEqual(busy.record().launches, {}, 'switched off: the ones waiting go');
  await busy.look();
  assert.ok(!busy.sent.some((s) => s.path === '/v1/launches'));
});

test("the players' numbers: asked for after a look, kept, and not again for six hours (half an hour after a failure)", async () => {
  const titles = { PPSA09076: { s: 3, f: 1, fw: { '13.59': [2, 1] } } };
  const world2 = launchWorld({ saved: { enabled: false }, answers: { '/v1/compat': new Error('timed out') } });
  await world2.look();
  assert.deepEqual(world2.compat(), {}, 'a failure keeps nothing');
  await world2.look();
  assert.equal(world2.sent.filter((s) => s.path === '/v1/compat').length, 1, 'not asked again a minute later');
  world2.answers['/v1/compat'] = { status: 200, body: { at: 1, titles } };
  await world2.look(30 * 6e4);
  assert.deepEqual(world2.compat().titles, titles, 'stats off too: asking sends nothing about the console');
  assert.ok(world2.sent.filter((s) => s.path === '/v1/compat').every((s) => s.method === 'GET' && s.body === null));
  await world2.look(5 * 36e5);
  assert.equal(world2.sent.filter((s) => s.path === '/v1/compat').length, 2);
  await world2.look(36e5);
  assert.equal(world2.sent.filter((s) => s.path === '/v1/compat').length, 3, 'six hours on, again');
  world2.answers['/v1/compat'] = { status: 200, body: { titles: [] } };
  await world2.look(6 * 36e5);
  world2.answers['/v1/compat'] = { status: 200, body: { titles: null } };
  await world2.look(36e5);
  assert.deepEqual(world2.compat().titles, titles, 'junk keeps what was there');
});

test("the players' numbers for a game: all of them, and this console's firmware's, or nothing when no one said", () => {
  const data = { titles: { PPSA09076: { s: 31, f: 2, fw: { '13.59': [12, 1], '12.09': [19, 1] } }, PPSA00001: { s: 0, f: 0, fw: {} }, PPSA00002: { s: -1, f: 'x' } } };
  assert.deepEqual(compatOf(data, 'PPSA09076', '13.590.001'), { started: 31, failed: 2, here: { firmware: '13.59', started: 12, failed: 1 } });
  assert.deepEqual(compatOf(data, 'PPSA09076', '11.590.001'), { started: 31, failed: 2, here: null }, 'no one on this firmware');
  assert.deepEqual(compatOf(data, 'PPSA09076', null), { started: 31, failed: 2, here: null }, 'firmware not known');
  assert.equal(compatOf(data, 'PPSA00001', '13.60'), null);
  assert.equal(compatOf(data, 'PPSA00002', '13.60'), null, 'junk is no one');
  assert.equal(compatOf(data, 'CUSA00001', '13.60'), null);
  assert.equal(compatOf(null, 'PPSA09076', '13.60'), null);
});
