// The phone companion, brought up to date in 0.5.4 (app/companion): the routes added for the Library, removing a
// Homebrew app and running its helper, Clear finished and Cancel all, a game's own source and the new remote buttons;
// the live events the console pushes (api.js companionEvents); what it counts for the stats ping (usage.js); and the
// page in every language, with its message reader checked against the console's. The homebrew list and install routes
// are in tests/homebrew.test.mjs; the stats ping itself in tests/online.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { companionEvents, createCompanionApi } = await load('app/companion/api.js');
const { PAGE, TEMPLATE, pageFor } = await load('app/companion/page.js');
const { compile, format } = await load('app/i18n/icu.js');
const liveModule = await load('app/companion/live.js');
let fresh = 0;
// usage.js keeps its counts in the module: a new copy for each test.
const loadUsage = () => import(`${pathToFileURL(path.join(repo, 'app/companion/usage.js')).href}?copy=${fresh++}`);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// A Homebrew section with two apps: Emu, installed from here at v1 with v2 out (and a helper); Pay, not installed.
function fakeHomebrew() {
  const release = (tag) => ({ tag, title: tag, date: '2026-10-20', prerelease: false, notes: '', downloads: 0 });
  const apps = [
    { id: 'a/emu', name: 'Emu', author: 'a', category: 'emulator', description: '', stars: 9, icon: null, release: release('v2'), files: [{ name: 'Emu.zip', kind: 'app', size: 10 }], repo: 'a/emu', about: '', license: 'MIT', hero: null, shots: [] },
    { id: 'b/pay', name: 'Pay', author: 'b', category: 'tool', description: '', stars: 3, icon: null, release: release('v1'), files: [{ name: 'pay.elf', kind: 'payload', size: 1 }], repo: 'b/pay', about: '', license: 'MIT', hero: null, shots: [] }
  ];
  const status = {
    'a/emu': { installed: true, record: { tag: 'v1', file: 'Emu.zip', run: null, helper: '/data/homebrew-payloads/emu/helper.elf' }, outside: null, update: true, task: null, failed: '' },
    'b/pay': { installed: false, record: null, outside: null, update: false, task: null, failed: '' }
  };
  const calls = [];
  const hb = {
    calls, status,
    removing: (id, options) => Promise.resolve(options.keep ? '/data/homebrew-kept/emu' : null),
    helping: async () => ({ ok: true }),
    index: { apps },
    app: (id) => apps.find((app) => app.id === id) ?? null,
    statusOf: (id) => status[id],
    updates: () => apps.filter((app) => status[app.id].update),
    installedApps: () => apps.filter((app) => status[app.id].installed),
    install: () => {}, run: () => ({ ok: true }), cancel: () => {},
    remove: (id, options) => (calls.push(['remove', id, options.keep]), hb.removing(id, options)),
    savedData: (id) => (calls.push(['savedData', id]), { folder: '/data/homebrew/EMU', paths: ['saves'] }),
    runHelper: (id) => (calls.push(['helper', id]), hb.helping(id))
  };
  return hb;
}

function world(extra = {}) {
  const notices = [], downloads = [], pressed = [];
  const jobs = [
    { id: 'done', gameId: 'g', title: 'Done', state: 'installed', written: 10, total: 10 },
    { id: 'run', gameId: 'g', title: 'Running', state: 'downloading', written: 5, total: 10, bytesPerSecond: 1000 },
    { id: 'wait', gameId: 'h', title: 'Waiting', state: 'queued' }
  ];
  const game = { id: 'g', title: 'Game', platform: 'PS5', releases: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }] };
  const deps = {
    catalog: { search: () => [game], getGame: (id) => (id === 'g' ? game : null) },
    describe: (release) => ({ name: release.name, detail: '', size: null, group: 'direct' }),
    download: (picked, source) => (downloads.push([picked.id, source]), { id: 'new', source: 'host' }),
    queue: () => jobs,
    control: {},
    storage: () => [],
    feeds: { list: () => [] },
    remote: (action) => pressed.push(action),
    quick: () => {},
    info: () => ({ app: "Jobee'sLair", version: '0.5.4', language: 'de' }),
    notify: (payload) => notices.push(payload),
    ...extra
  };
  const handle = createCompanionApi(deps);
  const call = (method, route, body) => {
    const [p, query = ''] = route.split('?');
    const answer = handle({ method, path: p, query, body: body === undefined ? '' : JSON.stringify(body) });
    return { status: answer.status, body: JSON.parse(answer.body) };
  };
  return { call, deps, jobs, notices, downloads, pressed };
}

// ---- The routes ----------------------------------------------------------------------------------------------

test('companion: a game lists each source with its place, and a download may name the one to use', () => {
  const { call, downloads } = world();
  assert.deepEqual(call('GET', '/api/game?id=g').body.sources.map((source) => [source.index, source.name]), [[0, 'One'], [1, 'Two'], [2, 'Three']]);
  assert.equal(call('POST', '/api/download', { id: 'g', source: 1 }).status, 200);
  call('POST', '/api/download', { id: 'g' });
  call('POST', '/api/download', { id: 'g', source: '2' });
  assert.deepEqual(downloads, [['g', 1], ['g', null], ['g', null]], 'only a whole number names a source; otherwise the best one');
});

test('companion: a download refused for good is only cancelled from the phone, as on the console (0.5.4)', () => {
  const resumed = [];
  const { call, jobs } = world({ control: { resume: (id) => resumed.push(id) } });
  jobs.push({ id: 'big', gameId: 'g', title: 'Big', state: 'failed', error: 'This archive needs more memory to extract than the console app can use.', release: {} },
    { id: 'lost', gameId: 'g', title: 'Lost', state: 'failed', error: 'HTTP 503', release: {} });
  const actions = Object.fromEntries(call('GET', '/api/queue').body.jobs.map((job) => [job.id, job.actions]));
  assert.deepEqual(actions.big, ['cancel']);
  assert.deepEqual(actions.lost, ['resume', 'cancel']);
  assert.equal(call('POST', '/api/queue/resume', { id: 'big' }).status, 409);
  assert.deepEqual(resumed, []);
});

test('companion: Clear finished and Cancel all answer at once, and a Cancel all that fails says so later', async () => {
  let cleared = 0;
  const { call, notices } = world({ control: { clearFinished: () => ++cleared, cancelAll: () => Promise.reject(new Error('The drive went away.')) } });
  const clear = call('POST', '/api/queue/clear-finished');
  assert.equal(clear.status, 200);
  assert.equal(clear.body.cleared, 1);
  assert.equal(clear.body.jobs.length, 3);
  const cancel = call('POST', '/api/queue/cancel-all');
  assert.deepEqual(cancel.body, { cancelling: 2 }, 'the running and the queued one; the finished one stays');
  await settle();
  assert.deepEqual(notices, [{ event: 'failed', text: 'The drive went away.', bad: true }]);
  const without = world();
  assert.equal(without.call('POST', '/api/queue/clear-finished').status, 404);
  assert.equal(without.call('POST', '/api/queue/cancel-all').status, 404);
});

test('companion: the Library, and Fix it saying how it went once it has', async () => {
  const fixed = [];
  const library = {
    list: () => [{ key: 'game:g', title: 'Game', state: 'Ready', tone: 'good', fix: { needed: true, text: "It hasn't started yet." } }],
    fix: (key, done) => {
      if (key !== 'game:g') return false;
      fixed.push(key);
      setTimeout(() => done({ text: 'Game is set to start again.', bad: false }), 0);
      return true;
    }
  };
  const { call, notices } = world({ library });
  assert.equal(call('GET', '/api/library').body.entries[0].key, 'game:g');
  assert.equal(call('POST', '/api/library/fix', {}).status, 400);
  assert.equal(call('POST', '/api/library/fix', { key: 'game:nope' }).status, 409);
  assert.deepEqual(call('POST', '/api/library/fix', { key: 'game:g' }).body, { started: true });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(fixed, ['game:g']);
  assert.deepEqual(notices, [{ text: 'Game is set to start again.', bad: false }]);
  assert.equal(world().call('GET', '/api/library').status, 404, 'no Library handed over, no route');
});

test("companion: an app's page says whether it saved anything (never asked mid-install) and whether it has a helper", () => {
  const homebrew = fakeHomebrew();
  const { call } = world({ homebrew });
  const emu = call('GET', '/api/homebrew/app?id=a%2Femu').body;
  assert.deepEqual([emu.saves, emu.helper, emu.state], [true, true, 'update']);
  assert.equal(call('GET', '/api/homebrew/app?id=b%2Fpay').body.saves, false);
  homebrew.calls.length = 0;
  homebrew.status['a/emu'] = { ...homebrew.status['a/emu'], task: { phase: 'downloading', written: 1, total: 4 } };
  const busy = call('GET', '/api/homebrew/app?id=a%2Femu').body;
  assert.deepEqual([busy.saves, busy.state, busy.percent], [false, 'downloading', 25]);
  assert.deepEqual(homebrew.calls, [], "the app's folder is not read while it installs");
});

test('companion: removing an app, keeping what it saved or not, and running its helper; each says how it went', async () => {
  const homebrew = fakeHomebrew();
  const { call, notices } = world({ homebrew });
  assert.equal(call('POST', '/api/homebrew/remove', { id: 'b/pay' }).status, 409, 'not installed from here');
  assert.equal(call('POST', '/api/homebrew/remove', { id: 'x/none' }).status, 404);
  assert.deepEqual(call('POST', '/api/homebrew/remove', { id: 'a/emu', keep: true }).body, { started: true });
  await settle();
  homebrew.removing = () => Promise.reject(new Error('Could not remove Emu: busy'));
  call('POST', '/api/homebrew/remove', { id: 'a/emu', keep: 'yes' });
  await settle();
  assert.deepEqual(homebrew.calls.filter((c) => c[0] === 'remove'), [['remove', 'a/emu', true], ['remove', 'a/emu', false]], 'keep only when it is true');
  call('POST', '/api/homebrew/helper', { id: 'a/emu' });
  await settle();
  homebrew.helping = async () => ({ ok: false, error: 'notMounted', reason: 'notMounted' });
  call('POST', '/api/homebrew/helper', { id: 'a/emu' });
  await settle(); await settle();
  assert.deepEqual(notices, [
    { event: 'removed', id: 'a/emu', name: 'Emu', kept: '/data/homebrew-kept/emu' },
    { event: 'failed', id: 'a/emu', name: 'Emu', text: 'Could not remove Emu: busy', bad: true },
    { event: 'helper', id: 'a/emu', name: 'Emu' },
    { event: 'failed', id: 'a/emu', name: 'Emu', text: 'notMounted', bad: true }
  ]);
});

test('companion: the remote has Triangle, Square, L2 and R2 too, and the dashboard carries the announcements', () => {
  const { call, pressed } = world({ notes: () => [{ id: 1, text: 'Out now', level: 'info', until: null }] });
  for (const action of ['triangle', 'square', 'l2', 'r2', 'confirm']) assert.equal(call('POST', '/api/remote', { action }).status, 200, action);
  assert.equal(call('POST', '/api/remote', { action: 'ps' }).status, 400, 'never the PS button');
  assert.deepEqual(pressed, ['triangle', 'square', 'l2', 'r2', 'confirm']);
  const dashboard = call('GET', '/api/dashboard').body;
  assert.deepEqual(dashboard.notes, [{ id: 1, text: 'Out now', level: 'info', until: null }]);
  assert.deepEqual([dashboard.active?.id, dashboard.counts, dashboard.speed], ['run', { active: 2, done: 1, failed: 0, total: 3 }, 1000]);
  assert.equal(call('GET', '/api/info').body.language, 'de');
});

// ---- Live events ---------------------------------------------------------------------------------------------

test('companion events: the queue as the dashboard sums it up, and only the apps whose state or progress changed', () => {
  const homebrew = fakeHomebrew();
  const { deps, call } = world({ homebrew });
  const events = companionEvents(deps);
  const queue = events.queue();
  const dashboard = call('GET', '/api/dashboard').body;
  assert.deepEqual({ active: queue.active, counts: queue.counts, speed: queue.speed }, { active: dashboard.active, counts: dashboard.counts, speed: dashboard.speed });
  assert.deepEqual(queue.jobs, call('GET', '/api/queue').body.jobs);
  const seen = new Map();
  assert.deepEqual(events.homebrew(seen).changes, [{ id: 'a/emu', state: 'update', percent: null }], 'an app with nothing going on is not news');
  assert.deepEqual(events.homebrew(seen).changes, [], 'and nothing twice');
  homebrew.status['b/pay'] = { ...homebrew.status['b/pay'], task: { phase: 'downloading', written: 5, total: 10 } };
  assert.deepEqual(events.homebrew(seen).changes, [{ id: 'b/pay', state: 'downloading', percent: 50 }]);
  homebrew.status['b/pay'].task = { phase: 'downloading', written: 6, total: 10 };
  assert.deepEqual(events.homebrew(seen).changes, [{ id: 'b/pay', state: 'downloading', percent: 60 }]);
  homebrew.status['b/pay'] = { installed: true, record: { tag: 'v1', file: 'pay.elf', run: '/data/p.elf' }, outside: null, update: false, task: null, failed: '' };
  const done = events.homebrew(seen);
  assert.deepEqual(done.changes, [{ id: 'b/pay', state: 'installed', percent: null }]);
  assert.deepEqual(done.updates.map((app) => app.id), ['a/emu']);
  assert.equal(companionEvents({ queue: () => [] }).homebrew(new Map()), null, 'no Homebrew section, no event');
});

test('companion live: with no phone listening nothing is built or sent; with one, what changed goes out at most twice a second', () => {
  const { createLive, LOOK_MS, PUSH_MS } = liveModule;
  assert.deepEqual([LOOK_MS, PUSH_MS], [1000, 500]);
  const homebrew = fakeHomebrew();
  const { deps } = world({ homebrew });
  const real = companionEvents(deps), built = { queue: 0, homebrew: 0 };
  const events = { queue: () => (built.queue++, real.queue()), homebrew: (seen) => (built.homebrew++, real.homebrew(seen)) };
  const pushed = [], minutes = [], said = [];
  let streams = 0, notes = [{ id: 1, text: 'Up', level: 'info', until: null }], refuse = false;
  const server = { status: () => ({ streams }), push: (name, value) => { if (refuse) throw new Error('too large'); pushed.push([name, value]); } };
  const live = createLive({ server, events, notes: () => notes, onMinute: (at) => minutes.push(at), log: (message) => said.push(message) });
  const t = 1e6;
  live.mark('queue');
  live.notesChanged([{ id: 2, text: 'New' }]);
  live.tick(t);
  assert.deepEqual([pushed, built, minutes], [[], { queue: 0, homebrew: 0 }, []], 'nobody listening: nothing built, nothing kept for later');
  streams = 1;
  live.tick(t + 500);
  assert.equal(built.homebrew, 0, 'a phone is looked for once a second, not every pump');
  live.tick(t + LOOK_MS);
  assert.deepEqual([pushed, built.homebrew, minutes], [[], 1, [t + LOOK_MS]], 'the first phone: the Homebrew states afresh, and its minute counted');
  live.mark('queue');
  live.tick(t + LOOK_MS + 100);
  live.mark('queue');
  live.tick(t + LOOK_MS + 200);
  assert.deepEqual(pushed.map(([name]) => name), ['queue'], 'a second change within half a second waits');
  live.tick(t + LOOK_MS + 100 + PUSH_MS);
  assert.deepEqual(pushed.map(([name]) => name), ['queue', 'queue']);
  assert.deepEqual(Object.keys(pushed[0][1]), ['jobs', 'active', 'counts', 'speed']);
  // Homebrew: only a real change (or a different list of updates) is sent.
  live.mark('homebrew');
  live.tick(t + 3000);
  assert.equal(pushed.length, 2, 'marked, but nothing changed since the phone came');
  homebrew.status['b/pay'] = { ...homebrew.status['b/pay'], task: { phase: 'downloading', written: 1, total: 2 } };
  live.mark('homebrew');
  live.tick(t + 3600);
  assert.deepEqual(pushed.at(-1), ['homebrew', { changes: [{ id: 'b/pay', state: 'downloading', percent: 50 }], updates: real.homebrew(new Map()).updates }]);
  // Announcements: the same ones again are not news; new ones are.
  live.notesChanged(notes);
  live.tick(t + 4200);
  assert.equal(pushed.length, 3);
  notes = [{ id: 3, text: 'Maintenance tonight', level: 'warning', until: null }];
  live.notesChanged(notes);
  live.tick(t + 4800);
  assert.deepEqual(pushed.at(-1), ['notes', { notes }]);
  // A push the server refuses is logged; the pump goes on.
  refuse = true;
  live.push('notice', { text: 'x'.repeat(10) });
  assert.deepEqual(said, ['notice not pushed: too large']);
  refuse = false;
  // The phone goes: the look that finds none drops what was marked, so the next phone is not sent it.
  live.mark('queue');
  streams = 0;
  live.tick(t + 6000);
  streams = 1;
  live.tick(t + 7000);
  assert.equal(pushed.length, 4, 'nothing marked before the look that found no phone');
  assert.equal(built.homebrew, 4, 'and the Homebrew states afresh for the new phone');
});

test('companion service: it runs live.js from its pump, counts each request, and swaps the page in place for a new language', () => {
  const src = readFileSync(path.join(repo, 'app/companion/service.js'), 'utf8');
  assert.match(src, /if \(live\) live\.tick\(Date\.now\(\)\);/);
  assert.match(src, /countRequest\(request\.method, request\.path\);/);
  assert.match(src, /LocalServer\.setPage\(pageNow\(\)\);[\s\S]{0,200}push\("app", \{ language: code \}\);/, 'the page first, then the open pages are told');
  assert.match(src, /listen\(\);[\s\S]{0,120}console\.log\(`companion: starting/, 'listening from the start');
  assert.match(src, /timer = null;\s+unlistenAll\(\);/, 'and no longer once stopped');
  assert.doesNotMatch(src, /\bPAGE\b/, 'the page is built in the console language, never the English one');
});

// ---- What is counted for the stats ping ------------------------------------------------------------------------

test('companion usage: minutes with a phone on the page, what it did by kind, and nothing about what', async () => {
  const usage = await loadUsage();
  const t = Date.parse('2026-10-30T18:00:10Z');
  usage.countRequest('GET', '/api/info', t);
  usage.countRequest('POST', '/api/download', t + 1e3);
  usage.countRequest('GET', '/api/games', t + 2e3);
  usage.countMinute(t + 30e3);
  usage.countRequest('POST', '/api/remote', t + 61e3);
  usage.countRequest('POST', '/api/quick', t + 62e3);
  for (const [method, p] of [['POST', '/api/homebrew/install'], ['POST', '/api/homebrew/update-all'], ['POST', '/api/queue/cancel-all'], ['POST', '/api/queue/pause'], ['POST', '/api/library/fix'], ['DELETE', '/api/feeds'], ['POST', '/api/feeds/mirrors'], ['GET', '/api/library'], ['GET', '/api/homebrew']]) usage.countRequest(method, p, t + 63e3);
  usage.countMinute(t + 125e3);
  assert.deepEqual(usage.companionFacts(), { on: false, away: false, minutes: 3, opens: 1, games: 1, homebrew: 2, downloads: 2, library: 1, remote: 2, feeds: 2 });
  usage.trackCompanion(() => ({ on: true, away: true }));
  assert.deepEqual([usage.companionFacts().on, usage.companionFacts().away], [true, true]);
  usage.trackCompanion(() => { throw new Error('settings unreadable'); });
  assert.deepEqual([usage.companionFacts().on, usage.companionFacts().away], [false, false], 'a switch that cannot be read counts as off');
});

test('companion usage: a ping that went through takes off what it said, and what came after waits for the next', async () => {
  const usage = await loadUsage();
  const t = Date.parse('2026-10-30T18:00:00Z');
  usage.countRequest('POST', '/api/download', t);
  usage.countRequest('POST', '/api/download', t + 1e3);
  const said = usage.companionFacts();
  usage.countRequest('POST', '/api/download', t + 70e3);
  usage.companionSent(said);
  assert.deepEqual(usage.companionFacts(), { on: false, away: false, minutes: 1, opens: 0, games: 1, homebrew: 0, downloads: 0, library: 0, remote: 0, feeds: 0 });
  usage.companionSent(null);
  usage.companionSent({ games: 99, minutes: 'x' });
  assert.deepEqual([usage.companionFacts().games, usage.companionFacts().minutes], [0, 1], 'never below nothing; junk takes nothing off');
});

// ---- The page -------------------------------------------------------------------------------------------------

const LOCALES = readdirSync(path.join(repo, 'app/i18n/locales')).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5));
const catalog = (code) => JSON.parse(readFileSync(path.join(repo, 'app/i18n/locales', `${code}.json`), 'utf8'));
const english = catalog('en');
// What app/i18n/core.js catalogFor('phone.') hands the page: the language's phone.* messages over English's.
const phoneStrings = (code) => Object.fromEntries(Object.entries({ ...english, ...catalog(code) }).filter(([key]) => key.startsWith('phone.')));
const scriptOf = (html) => /<script>([\s\S]*?)<\/script>/.exec(html)[1];

test('companion page: built in the language asked for, its direction and messages, with nothing left to fill in', () => {
  const page = pageFor({ strings: { 'phone.tab.home': 'الرئيسية', 'phone.x': '</script><b>' }, language: 'ar', rtl: true });
  assert.match(page, /<html lang="ar" dir="rtl">/);
  assert.ok(!/__[A-Z0-9_]+__/.test(page), 'every placeholder filled');
  assert.ok(page.includes('"phone.x":"\\u003c/script>\\u003cb>"'), 'a message cannot end the script');
  assert.match(pageFor({ language: 'de"><img src=x>' }), /<html lang="deimgsrcx" dir="ltr">/, 'the language is letters and hyphens only');
  assert.ok(pageFor({ strings: { 'phone.x': "costs $& and $' and $1" } }).includes('"phone.x":"costs $& and $\' and $1"'), 'a $ in a message is only text');
  assert.match(PAGE, /<html lang="en" dir="ltr">/, 'the English page, for tests and the helper');
  assert.ok(TEMPLATE.includes('__STRINGS__') && TEMPLATE.includes('__LANG__') && TEMPLATE.includes('__DIR__'));
  for (const code of LOCALES) {
    const built = pageFor({ strings: phoneStrings(code), language: code, rtl: code === 'ar' || code === 'ur' });
    assert.doesNotThrow(() => new Function(scriptOf(built)), `${code}: the page script parses`);
    assert.ok(Buffer.byteLength(built) < 512 * 1024, `${code}: under the server's 512 KiB`);
  }
});

test('companion page: every message it asks for is in English, and every phone message is used', () => {
  const asked = new Set([...TEMPLATE.matchAll(/["'](phone\.[A-Za-z0-9.]+)["']/g)].map((m) => m[1]).filter((key) => !key.endsWith('.')));
  const prefixes = [...TEMPLATE.matchAll(/"(phone\.[A-Za-z]+\.)" \+/g)].map((m) => m[1]);
  assert.deepEqual(prefixes.sort(), ['phone.error.', 'phone.error.', 'phone.hbstate.', 'phone.hbstate.', 'phone.state.', 'phone.state.']);
  const missing = [...asked].filter((key) => !(key in english));
  assert.deepEqual(missing, [], 'asked for but not in en.json');
  const unused = Object.keys(english).filter((key) => key.startsWith('phone.') && !asked.has(key) && !prefixes.some((prefix) => key.startsWith(prefix)));
  assert.deepEqual(unused, [], 'in en.json but never shown');
});

// The page's own message reader (it runs in the phone's browser), taken out of its script as written.
function pageMessages(code) {
  const script = scriptOf(pageFor({ strings: phoneStrings(code), language: code, rtl: false }));
  const from = script.indexOf('"use strict";'), to = script.indexOf('document.querySelectorAll("[data-s]")');
  assert.ok(from > 0 && to > from, 'the reader is where it was');
  return new Function('document', `${script.slice(from, to)}return s;`)({ documentElement: { lang: code } });
}
// The console's own digits are Latin; a phone may show its language's (Arabic, Persian-style, Devanagari, Bengali).
const ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6];
const latin = (text) => text.replace(/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF]/g, (digit) => {
  const at = digit.charCodeAt(0);
  return String(at - ZEROS.find((zero) => at >= zero && at <= zero + 9));
});

test("companion page: its messages read as the console's own would, in every language and plural form", () => {
  const names = (parts, out = new Set()) => {
    for (const part of parts) {
      if (typeof part === 'string' || part.type === 'pound') continue;
      out.add(part.name);
      for (const cases of Object.values(part.cases ?? {})) names(cases, out);
    }
    return out;
  };
  let checked = 0;
  for (const code of LOCALES) {
    const s = pageMessages(code);
    for (const [key, text] of Object.entries(phoneStrings(code))) {
      const parts = compile(text);
      for (const n of [0, 1, 2, 3, 5, 11, 21, 22, 101]) {
        const params = Object.fromEntries([...names(parts)].map((name) => [name, n]));
        assert.equal(latin(s(key, params)), latin(format(parts, params, code)), `${code} ${key} with ${n}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 2000, `${checked} checked`);
});

// ---- Later in 0.5.4: what typing on a controller made slow ---------------------------------------------------------

test('phone typing: the newest box open is the one asked, its answer comes back refused or taken, and a closed one is gone', async () => {
  const typing = await import(`${pathToFileURL(path.join(repo, 'app/state/phone-typing.js')).href}?copy=${fresh++}`);
  const heard = [];
  typing.onPhoneAsking((asking) => heard.push(asking && asking.title));
  const searched = [];
  const closeSearch = typing.askPhone({ title: 'Search games', kind: 'search', answer: (text) => (searched.push(text), '') });
  const closeKey = typing.askPhone({ title: 'TorBox API key', detail: 'From torbox.app', kind: 'key', answer: (text) => (text.length === 36 ? '' : "That doesn't look like a TorBox API key") });
  const key = typing.phoneAsking();
  assert.deepEqual({ ...key, id: undefined }, { id: undefined, title: 'TorBox API key', detail: 'From torbox.app', kind: 'key' });
  assert.equal(typing.answerFromPhone(key.id, 'short'), "That doesn't look like a TorBox API key");
  assert.equal(typing.answerFromPhone(key.id, 'x'.repeat(36)), '');
  closeKey();
  assert.equal(typing.phoneAsking().title, 'Search games', 'the box under it is asked again');
  assert.throws(() => typing.answerFromPhone(key.id, 'x'), /isn't asking for that any more/);
  assert.equal(typing.answerFromPhone(typing.phoneAsking().id, 'y'.repeat(5000)), '');
  assert.equal(searched[0].length, typing.MAX_TEXT, 'never more than a box takes');
  closeSearch();
  closeSearch();
  assert.equal(typing.phoneAsking(), null);
  assert.deepEqual(heard, ['Search games', 'TorBox API key', 'Search games', null]);
});

test('companion: /api/typing shows the box asking and answers it; refused, gone or malformed each say so', () => {
  let asking = { id: 't1', title: 'Add a catalog feed', detail: '', kind: 'url' };
  const answers = [];
  const { call } = world({ typing: { asking: () => asking, answer: (id, text) => {
    if (!asking || id !== asking.id) throw new Error("The console isn't asking for that any more.");
    answers.push(text);
    return /^https:/.test(text) ? '' : 'That is not a link.';
  } } });
  assert.deepEqual(call('GET', '/api/typing').body, { asking });
  assert.deepEqual(call('GET', '/api/dashboard').body.asking, asking, 'the dashboard carries it too');
  assert.deepEqual(call('POST', '/api/typing', { id: 't1', text: 'https://example.com/feed.json' }), { status: 200, body: { done: true } });
  assert.deepEqual(call('POST', '/api/typing', { id: 't1', text: 'nope' }), { status: 409, body: { error: 'That is not a link.' } });
  asking = null;
  assert.deepEqual(call('POST', '/api/typing', { id: 't1', text: 'https://x' }).body, { error: "The console isn't asking for that any more.", code: 'typingGone' });
  assert.equal(call('POST', '/api/typing', { id: 't1' }).status, 400);
  assert.deepEqual(answers, ['https://example.com/feed.json', 'nope']);
  assert.equal(world().call('GET', '/api/typing').status, 404, 'a console without it');
});

function fakeSettings() {
  const calls = [];
  const state = { debrid: { active: null, torbox: { set: false, masked: '', status: '' }, alldebrid: { set: false, masked: '', status: '' } }, speed: { limit: 0, choices: [0, 25, 10, 5].map((value) => ({ value, label: value ? `${value} MB/s` : 'No limit' })) }, parts: true, update: { version: '0.5.4', status: 'Up to date', latest: null, checking: false, canInstall: true, phase: 'idle', auto: false }, labels: {} };
  return {
    calls, state,
    read: () => JSON.parse(JSON.stringify(state)),
    debridKey(service, key) {
      calls.push(['key', service, key]);
      if (key && key.length !== 36) throw new Error("That doesn't look like a TorBox API key");
      state.debrid[service] = key ? { set: true, masked: `•••• ${key.slice(-4)}`, status: '' } : { set: false, masked: '', status: '' };
    },
    debridTest: async (service) => (calls.push(['test', service]), 'TorBox: Pro, until 2027-01-01'),
    speed: (limit) => { state.speed.limit = limit; },
    parts: (on) => { state.parts = on; },
    checkUpdate: async () => { throw new Error('GitHub did not answer'); },
    installUpdate: () => false,
    restart: () => 'Updates install on the PS5 only.',
    autoUpdate: (on) => { state.update.auto = on; }
  };
}

test('companion settings: a debrid key set from the phone never comes back but as its last four, and bad asks say why', async () => {
  const settings = fakeSettings();
  const { call, notices } = world({ settings });
  const key = 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6';
  const saved = call('POST', '/api/settings/debrid', { service: 'torbox', key });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.debrid.torbox, { set: true, masked: '•••• c5d6', status: '' });
  assert.ok(!JSON.stringify(saved.body).includes(key), 'the key itself is never in an answer');
  assert.deepEqual(call('POST', '/api/settings/debrid', { service: 'torbox', key: 'short' }), { status: 409, body: { error: "That doesn't look like a TorBox API key" } });
  assert.equal(call('POST', '/api/settings/debrid', { service: 'realdebrid', key }).status, 400, 'only the two the console knows');
  assert.equal(call('POST', '/api/settings/debrid', { service: 'alldebrid', key: 'x'.repeat(201) }).status, 400);
  assert.equal(call('POST', '/api/settings/debrid', { service: 'torbox', key: '' }).body.debrid.torbox.set, false, 'an empty key removes it');
  assert.deepEqual(call('POST', '/api/settings/debrid/test', { service: 'torbox' }).body, { started: true });
  call('POST', '/api/settings/update/check');
  await settle(); await settle(); await settle();
  assert.deepEqual(notices, [{ event: 'settings', text: 'TorBox: Pro, until 2027-01-01' }, { event: 'settings', text: 'GitHub did not answer', bad: true }]);
  assert.deepEqual(settings.calls.map((entry) => entry.slice(0, 2)), [['key', 'torbox'], ['key', 'torbox'], ['key', 'torbox'], ['test', 'torbox']]);
});

test('companion settings: the speed limit takes only a listed one, parts and auto-update a yes or no, the update what it can', () => {
  const { call } = world({ settings: fakeSettings() });
  assert.equal(call('POST', '/api/settings/speed', { limit: 10 }).body.speed.limit, 10);
  assert.equal(call('POST', '/api/settings/speed', { limit: 7 }).status, 400);
  assert.equal(call('POST', '/api/settings/parts', { on: false }).body.parts, false);
  assert.equal(call('POST', '/api/settings/parts', { on: 'no' }).status, 400);
  assert.equal(call('POST', '/api/settings/update/auto', { on: true }).body.update.auto, true);
  assert.deepEqual(call('POST', '/api/settings/update/install'), { status: 409, body: { error: 'There is no update this console can install.' } });
  assert.deepEqual(call('POST', '/api/settings/update/restart'), { status: 409, body: { error: 'Updates install on the PS5 only.' } });
  assert.equal(world().call('GET', '/api/settings').status, 404, 'a console without it');
});

test('companion: a download waiting on the browser gives its page and takes the file link the phone found', () => {
  const linked = [];
  const { call, jobs } = world({ control: { link: (id, url) => linked.push([id, url]) } });
  jobs.push({ id: 'viking', gameId: 'g', title: 'DREDGE', state: 'awaiting-browser', browserUrl: 'https://vikingfile.com/f/abc' },
    { id: 'plain', gameId: 'g', title: 'Plain', state: 'awaiting-browser', browserUrl: 'http://example.com/page' });
  const shown = call('GET', '/api/queue').body.jobs;
  const viking = shown.find((item) => item.id === 'viking');
  assert.deepEqual(viking.actions, ['browser', 'link', 'cancel']);
  assert.equal(viking.page, 'https://vikingfile.com/f/abc');
  assert.equal(shown.find((item) => item.id === 'plain').page, null, 'only an https page goes to the phone');
  assert.equal(shown.find((item) => item.id === 'run').page, null);
  assert.equal(call('POST', '/api/queue/link', { id: 'viking', url: ' https://cdn.example.com/f/PPSA09076.exfat ' }).status, 200);
  assert.deepEqual(linked, [['viking', 'https://cdn.example.com/f/PPSA09076.exfat']]);
  assert.equal(call('POST', '/api/queue/link', { id: 'viking', url: 'javascript:alert(1)' }).status, 400);
  assert.equal(call('POST', '/api/queue/link', { id: 'viking', url: 'vikingfile.com/f/abc' }).status, 400, 'a whole address only');
  assert.equal(call('POST', '/api/queue/link', { id: 'run', url: 'https://x.example/f' }).status, 409, 'only one waiting on the browser takes a link');
  assert.equal(call('POST', '/api/queue/link', { id: 'gone', url: 'https://x.example/f' }).status, 404);
});

test('companion: a source a debrid service takes says so, and a download may ask to go through it or not', () => {
  const asked = [];
  const { call } = world({ debridOf: (release) => (release.name === 'Two' ? 'TorBox' : null), download: (picked, source, options) => (asked.push([picked.id, source, options]), { id: 'new', source: 'VikingFile', debrid: options.debrid ? 'TorBox' : null }) });
  assert.deepEqual(call('GET', '/api/game?id=g').body.sources.map((source) => source.debrid), [null, 'TorBox', null]);
  assert.equal(call('POST', '/api/download', { id: 'g', source: 1, debrid: true }).body.debrid, 'TorBox');
  call('POST', '/api/download', { id: 'g', source: 1, debrid: false });
  call('POST', '/api/download', { id: 'g', debrid: 'yes' });
  assert.deepEqual(asked, [['g', 1, { debrid: true }], ['g', 1, { debrid: false }], ['g', null, {}]], 'only a true or false is passed on');
});

test('companion: /api/typing/close closes the box asking unanswered; gone or malformed each say so', () => {
  let asking = { id: 't2', title: 'Search', detail: '', kind: 'search' };
  const closed = [];
  const { call } = world({ typing: { asking: () => asking, answer: () => '', close: (id) => {
    if (!asking || id !== asking.id) throw new Error("The console isn't asking for that any more.");
    closed.push(id);
    asking = null;
  } } });
  assert.deepEqual(call('POST', '/api/typing/close', { id: 't2' }), { status: 200, body: { done: true } });
  assert.deepEqual(call('POST', '/api/typing/close', { id: 't2' }).body, { error: "The console isn't asking for that any more.", code: 'typingGone' });
  assert.equal(call('POST', '/api/typing/close', {}).status, 400);
  assert.deepEqual(closed, ['t2']);
  assert.equal(world().call('POST', '/api/typing/close', { id: 't2' }).status, 404, 'a console without it');
});
