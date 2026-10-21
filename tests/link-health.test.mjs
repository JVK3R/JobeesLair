// app/state/link-health.js: verdicts from scripted HTTP answers (200, 404, timeouts, 429, 5xx), the retry
// and backoff rules, sharing the network with the download queue, the source list it shapes, and a run
// against a real local HTTP server. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { BACKGROUND_LINKS, TTL, classify, createLinkHealth, judge, linksOf, withVerdict } = await load('app/state/link-health.js');
const { describeSource, fallbacks, preferredRelease, sourceSections } = await load('app/game/sources.js');
const { configure } = await load('app/i18n/core.js');
const en = JSON.parse(readFileSync(path.join(repo, 'app/i18n/locales/en.json'), 'utf8'));
configure(() => en, en);

const MIN = 60e3, HOUR = 60 * MIN;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const direct = (id, url, extra = {}) => ({ id, provider: new URL(url).hostname.replace(/^www\./, ''), url, format: 'pkg', filename: `${id}.pkg`, label: 'USA Base (v01.00) - Direct', ...extra });
const ARCHIVE = 'https://archive.org/download/item/Game.pkg';
const MIRROR = 'https://cdn.example.com/Game.pkg';
const OTHER = 'https://files.example.net/Game.pkg';

// Answers per URL, in order (the last repeats): a status, { status, url, headers }, 'timeout' (no answer
// until the request is aborted) or 'reset' (the connection fails).
function scripted(table) {
  const calls = [];
  return {
    calls,
    async request(url, options) {
      calls.push({ url, method: options.method, maxBytes: options.maxBytes });
      const answers = table[url] ?? [200];
      const answer = answers.length > 1 ? answers.shift() : answers[0];
      if (answer === 'timeout') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }))));
      if (answer === 'reset') throw new Error('Http.request: Connection reset by peer');
      const response = typeof answer === 'number' ? { status: answer } : answer;
      return { ok: response.status < 300, url: response.url ?? url, headers: response.headers ?? {}, status: response.status };
    },
    count: (url) => calls.filter((call) => call.url === url).length,
  };
}

// A checker on a clock that only moves when it waits; `waits` lists each pause it took.
function world({ table = {}, saved = null, lend, quiet } = {}) {
  const state = { clock: 1e9, waits: [], saved, leases: 0, logs: [] };
  const http = scripted(table);
  const health = createLinkHealth({
    http,
    store: { get: () => state.saved, set: (value) => { state.saved = JSON.parse(JSON.stringify(value)); } },
    lend: lend ?? (() => { state.leases++; return () => { state.leases--; }; }),
    quiet: quiet ?? ((reason, work) => work()),
    now: () => state.clock,
    wait: async (ms) => { state.waits.push(ms); state.clock += ms; await tick(); },
    timeout: (fn) => { const id = setTimeout(fn, 2); return () => clearTimeout(id); },
    random: () => 0.5,
    log: (line) => state.logs.push(line),
  });
  const done = async (key) => {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      if (health.progressOf(key)?.state === 'done') return health.progressOf(key);
      await tick();
    }
    throw new Error(`${key} never finished: ${JSON.stringify(health.progressOf(key))}`);
  };
  return { state, http, health, done };
}

test('classify: what one answer says about a link', () => {
  const file = { kind: 'direct', host: 'cdn.example.com' };
  const archive = { kind: 'direct', host: 'archive.org' };
  const page = { kind: 'mediafire', host: 'www.mediafire.com' };
  const verdict = (link, response) => classify(link, response).verdict;
  assert.equal(verdict(file, { status: 200 }), 'active');
  assert.equal(verdict(file, { status: 206 }), 'active');
  assert.equal(verdict(file, { status: 404 }), 'dead');
  assert.equal(verdict(file, { status: 410 }), 'dead');
  assert.equal(verdict(archive, { status: 401 }), 'dead', "Archive.org's restricted item");
  assert.equal(verdict(archive, { status: 403 }), 'dead', "Archive.org's taken-down item");
  assert.equal(verdict(file, { status: 403 }), 'unknown', "elsewhere a 403 is a browser check, not a dead link");
  assert.equal(verdict(file, { status: 405 }), 'unknown', 'a host that refuses HEAD says nothing');
  assert.deepEqual(classify(file, { status: 429, headers: { 'retry-after': '120' } }), { verdict: 'limited', code: 429, wait: 60e3 }, 'Retry-After, at most a minute');
  assert.equal(verdict(file, { status: 503 }), 'transient');
  assert.equal(verdict(file, { status: 408 }), 'transient');
  assert.equal(classify(file, { status: 502, headers: { 'retry-after': '3' } }).wait, 3000);
  assert.equal(verdict(page, { status: 200, url: 'https://www.mediafire.com/error.php?errno=320' }), 'dead', "MediaFire's error page");
  assert.equal(verdict(page, { status: 200, url: 'https://www.mediafire.com/file/abc/Game.rar/file' }), 'active');
  assert.equal(verdict(file, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }), 'unknown', 'a web page where a file should be');
});

test('linksOf: files, manifests and host pages are checked; browser-only hosts and unavailable sources are not', () => {
  assert.deepEqual(linksOf(direct('a', ARCHIVE)), [{ url: ARCHIVE, host: 'archive.org', kind: 'direct' }]);
  assert.deepEqual(linksOf({ id: 'm', provider: 'cdn', manifestUrl: 'https://cdn.example.com/game.json' }).map((link) => link.kind), ['manifest']);
  assert.deepEqual(linksOf({ id: 'f', provider: 'mediafire', url: 'https://www.mediafire.com/file/abc/Game.rar/file' }).map((link) => link.kind), ['mediafire']);
  assert.deepEqual(linksOf({ id: 'd', provider: 'datanodes', url: 'https://datanodes.to/abc/Game.rar' }), [], 'a check our request cannot pass');
  assert.deepEqual(linksOf({ ...direct('a', ARCHIVE), unavailableReason: 'Invalid volume number.' }), []);
  const set = { id: 'set', provider: 'cdn', format: 'archive-set', parts: [1, 2, 3].map((n) => ({ number: n, sources: [direct(`p${n}`, `https://cdn.example.com/Game.part${n}.rar`)] })) };
  assert.deepEqual(linksOf(set).map((link) => link.url), [1, 2, 3].map((n) => `https://cdn.example.com/Game.part${n}.rar`), "each part's link");
});

test('200 OK: one HEAD request, the link is active, and the source ranks ahead of the unchecked', async () => {
  const { http, health, done, state } = world();
  const releases = [direct('b', MIRROR), direct('a', ARCHIVE)];
  health.want('game', releases);
  const progress = await done('game');
  assert.deepEqual(progress.summary, { active: 2, unreachable: 0, dead: 0, unknown: 0, skipped: 0 });
  assert.deepEqual(http.calls.map(({ method, maxBytes }) => ({ method, maxBytes })), [{ method: 'HEAD', maxBytes: 4096 }, { method: 'HEAD', maxBytes: 4096 }], 'no file is downloaded');
  assert.equal(health.recordOf(MIRROR).s, 'active');
  const shown = health.overlay(releases);
  assert.equal(shown[0].health, 'ok');
  assert.equal(shown[0].linkHealth.status, 'active');
  assert.equal(state.leases, 0, 'the network was given back');
});

test('404 Not Found: asked again a moment later, then the source is labelled, ranked last, and the backup mirror takes over', async () => {
  const { http, health, done, state } = world({ table: { [ARCHIVE]: [404] } });
  const releases = [direct('a', ARCHIVE), direct('b', MIRROR)];
  assert.equal(preferredRelease(releases), 0, 'Archive.org is preferred while nothing is known');
  health.want('game', releases);
  await done('game');
  assert.equal(http.count(ARCHIVE), 2, 'a second request confirms it');
  assert.ok(state.waits.includes(1500), 'after a pause');
  assert.deepEqual(health.recordOf(ARCHIVE), { s: 'dead', c: 404, at: health.recordOf(ARCHIVE).at });
  const shown = health.overlay(releases);
  assert.equal(shown[0].unavailableReason, undefined, 'never hidden: the check is a HEAD, the download may still work');
  assert.equal(shown[0].health, 'dead');
  assert.equal(describeSource(shown[0]).group, 'direct');
  assert.equal(preferredRelease(shown), 1, 'the healthy mirror is the one picked now');
  assert.deepEqual(sourceSections(shown).map(({ group, items }) => [group, items.map(({ release }) => release.id)]), [['direct', ['a', 'b']]]);
});

test('a 404 that the second request does not repeat is a blip: the link stays active', async () => {
  const { http, health, done } = world({ table: { [MIRROR]: [404, 200] } });
  health.want('game', [direct('b', MIRROR)]);
  await done('game');
  assert.equal(http.count(MIRROR), 2);
  assert.equal(health.recordOf(MIRROR).s, 'active');
});

test('timeouts: tried three times with growing pauses, then unreachable; it ranks after a host that answers', async () => {
  const { http, health, done, state } = world({ table: { [ARCHIVE]: ['timeout'] } });
  const releases = [direct('a', ARCHIVE), direct('b', MIRROR)];
  health.want('game', releases);
  const progress = await done('game');
  assert.equal(http.count(ARCHIVE), 3);
  assert.deepEqual(state.waits.slice(0, 2), [2000, 4000], 'backoff: 2 s, then 4 s');
  assert.deepEqual(health.recordOf(ARCHIVE), { s: 'unreachable', c: 'timeout', at: health.recordOf(ARCHIVE).at });
  assert.equal(progress.summary.unreachable, 1);
  const shown = health.overlay(releases);
  assert.equal(shown[0].health, 'flaky');
  assert.equal(describeSource(shown[0]).group, 'direct', 'still offered: a host that is down now may answer later');
  assert.equal(preferredRelease(shown), 1, 'but the one that answers comes first');
  assert.deepEqual(judge(linksOf(releases[0]), health.recordOf).status, 'unreachable');
});

test('a timeout, a reset connection, then 200: no false alarm', async () => {
  const { http, health, done } = world({ table: { [MIRROR]: ['timeout', 'reset', 200] } });
  health.want('game', [direct('b', MIRROR)]);
  await done('game');
  assert.equal(http.count(MIRROR), 3);
  assert.equal(health.recordOf(MIRROR).s, 'active');
});

test('503 with Retry-After: the server is waited for as long as it asks, then the answer counts', async () => {
  const { health, done, state } = world({ table: { [MIRROR]: [{ status: 503, headers: { 'retry-after': '7' } }, 200] } });
  health.want('game', [direct('b', MIRROR)]);
  await done('game');
  assert.ok(state.waits.includes(7000));
  assert.equal(health.recordOf(MIRROR).s, 'active');
});

test('429 Rate Limited: nothing is concluded, the host is left alone (longer each time), its other links are not asked', async () => {
  const second = 'https://cdn.example.com/Game-Update.pkg';
  const { http, health, done, state } = world({ table: { [MIRROR]: [{ status: 429, headers: { 'retry-after': '30' } }], [second]: [200], [OTHER]: [200] } });
  const releases = [direct('b', MIRROR), direct('u', second), direct('o', OTHER)];
  health.want('game', releases);
  const first = await done('game');
  assert.equal(http.count(MIRROR), 1, 'no retries into a rate limit');
  assert.equal(http.count(second), 0, 'its host is cooling down');
  assert.equal(http.count(OTHER), 1, 'other hosts are asked as usual');
  assert.equal(health.recordOf(MIRROR), undefined, 'not marked: being told to slow down says nothing of the link');
  assert.deepEqual(first.summary, { active: 1, unreachable: 0, dead: 0, unknown: 0, skipped: 2 });
  assert.ok(state.logs.some((line) => /cdn\.example\.com asked us to slow down: no checks there for 300 s/.test(line)));
  // Within the cool-down nothing is asked there; after it, the host is asked again.
  health.want('game', releases);
  await done('game');
  assert.equal(http.count(MIRROR), 1);
  state.clock += 6 * MIN;
  http.calls.length = 0;
  health.want('game', releases);
  await done('game');
  assert.equal(http.count(MIRROR), 1, 'asked again once the host has rested');
  assert.ok(state.logs.some((line) => /no checks there for 600 s/.test(line)), 'a second limit doubles the rest');
});

test("a background check waits while the queue needs the network, and gives it back the moment a download is queued", async () => {
  let lendable = false;
  let yieldNow = null;
  const lent = [];
  const slow = 'https://slow.example.org/Game.pkg';
  const { http, health, done, state } = world({
    table: { [slow]: ['timeout'] },
    lend: (onYield) => {
      if (!lendable) return null;
      yieldNow = onYield;
      lent.push('lent');
      return () => lent.push('returned');
    },
  });
  const releases = [direct('s', slow), direct('b', MIRROR)];
  health.want('game', releases);
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(health.progressOf('game').state, 'waiting');
  assert.equal(http.calls.length, 0, 'nothing asked while a download holds the network');
  lendable = true;
  for (let i = 0; i < 50 && !http.calls.length; i++) await tick();
  assert.equal(http.count(slow), 1, 'asked once the queue lent the network');
  yieldNow();   // A game download was queued.
  for (let i = 0; i < 50 && lent.at(-1) !== 'returned'; i++) await tick();
  assert.deepEqual(lent, ['lent', 'returned'], 'the request was cut short and the network given back');
  assert.equal(health.progressOf('game').state, 'waiting', 'the rest waits for the next idle moment');
  assert.equal(health.recordOf(slow), undefined, 'and a cut-off request concludes nothing');
  await done('game');
  assert.equal(health.recordOf(MIRROR).s, 'active', 'finished on a later loan');
  assert.ok(state.waits.some((ms) => ms === 60e3), 'after asking again a minute later');
});

test('verdicts stand for their time: an active link is not asked again for 12 hours, an unreachable one after 30 minutes', async () => {
  const flaky = 'https://flaky.example.org/Game.pkg';
  const { http, health, done, state } = world({ table: { [flaky]: ['reset'] } });
  const releases = [direct('b', MIRROR), direct('f', flaky)];
  health.want('game', releases);
  await done('game');
  http.calls.length = 0;
  state.clock += 31 * MIN;
  health.want('game', releases);
  await done('game');
  assert.deepEqual([http.count(MIRROR), http.count(flaky)], [0, 3], 'only the unreachable one is due again');
  http.calls.length = 0;
  state.clock += TTL.active;
  health.want('game', releases);
  await done('game');
  assert.equal(http.count(MIRROR), 1);
});

test('Check link health: every link asked now, the dead and the fresh too, with the download in progress paused meanwhile', async () => {
  const quieted = [];
  const { http, health } = world({
    table: { [ARCHIVE]: [404] },
    quiet: async (reason, work) => { quieted.push(reason); return work(); },
  });
  const releases = [direct('a', ARCHIVE), direct('b', MIRROR)];
  const first = await health.checkNow('game', releases);
  assert.deepEqual(first, { active: 1, unreachable: 0, dead: 1, unknown: 0, skipped: 0 });
  assert.deepEqual(quieted, ['check links game']);
  http.calls.length = 0;
  const again = await health.checkNow('game', releases);
  assert.deepEqual([http.count(ARCHIVE), http.count(MIRROR)], [2, 1], 'nothing skipped for being recent');
  assert.equal(again.dead, 1);
  assert.equal(health.progressOf('game').state, 'done');
  assert.equal(health.progressOf('game').manual, true);
});

test('a check the gamer asks for goes before background ones; a background run of another game resumes after', async () => {
  let release = null;
  const slow = 'https://slow.example.org/Game.pkg';
  const { http, health, done } = world({ table: { [slow]: ['timeout'] }, lend: () => (release = () => { release = null; }) });
  health.want('other', [direct('s', slow), direct('o', OTHER)]);
  for (let i = 0; i < 50 && !http.calls.length; i++) await tick();
  const summary = await health.checkNow('game', [direct('b', MIRROR)]);
  assert.equal(summary.active, 1);
  const other = await done('other');
  assert.ok(other.summary, 'the interrupted one ran again');
  assert.equal(health.recordOf(OTHER).s, 'active');
});

test('a page that closes drops its background check', async () => {
  const { http, health } = world({ lend: () => null });
  health.want('game', [direct('b', MIRROR)]);
  health.drop('game');
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(http.calls.length, 0);
  assert.equal(health.progressOf('game').state, 'waiting');
});

test("a download's own 404 marks its link dead; other failures do not", () => {
  const { health } = world();
  health.report(MIRROR, 'Downloads.enqueue /data/downloads/x.pkg: HTTP 404');
  assert.equal(health.recordOf(MIRROR).s, 'dead');
  health.report(OTHER, 'Downloads.enqueue /data/downloads/y.pkg: HTTP 403');
  health.report(OTHER, 'Not enough space on the drive.');
  health.report(OTHER, 'Connection timed out');
  assert.equal(health.recordOf(OTHER), undefined);
  health.report(ARCHIVE, 'Source unavailable: HTTP 401. Choose another source.');
  assert.equal(health.recordOf(ARCHIVE).s, 'dead', "Archive.org's refusal");
});

test('a set is labelled dead (part named) when one of its parts is gone, and active only when every part answers', async () => {
  const part = (n) => `https://cdn.example.com/Game.part${n}.rar`;
  const set = { id: 'set', provider: 'cdn.example.com', format: 'archive-set', label: 'USA Base · 3 parts', parts: [1, 2, 3].map((n) => ({ number: n, sources: [direct(`p${n}`, part(n), { format: 'rar' })] })) };
  const { health, done } = world({ table: { [part(2)]: [410] } });
  health.want('game', [set]);
  await done('game');
  const [shown] = health.overlay([set]);
  assert.equal(shown.linkHealth.status, 'dead');
  assert.deepEqual([shown.linkHealth.part, shown.linkHealth.code, shown.unavailableReason], [2, 410, undefined]);
  assert.equal(withVerdict(set, { status: 'active' }).health, 'ok');
});

test('overlay: the same array while nothing changed, new objects only for what is known', async () => {
  const { health, done } = world();
  const releases = [direct('b', MIRROR), { id: 'd', provider: 'datanodes', url: 'https://datanodes.to/abc/Game.rar' }];
  assert.equal(health.overlay(releases), releases, 'nothing known: the very same array');
  health.want('game', releases);
  await done('game');
  const shown = health.overlay(releases);
  assert.notEqual(shown, releases);
  assert.equal(health.overlay(releases), shown, 'memoised until the next change');
  assert.equal(shown[1], releases[1], 'an unchecked source is passed through untouched');
  assert.equal(releases[0].health, undefined, "the catalog's own objects are never changed");
});

test('saved: link-health.json keeps the verdicts across launches, and the oldest go past 800', async () => {
  const first = world({ table: { [ARCHIVE]: [404] } });
  first.health.want('game', [direct('a', ARCHIVE), direct('b', MIRROR)]);
  await first.done('game');
  first.health.flush();
  assert.equal(first.state.saved.version, 1);
  assert.deepEqual(Object.keys(first.state.saved.links).sort(), [ARCHIVE, MIRROR].sort());
  const next = world({ saved: first.state.saved });
  assert.equal(next.health.overlay([direct('a', ARCHIVE)])[0].linkHealth.status, 'dead', 'known before any request');
  const many = { version: 1, links: Object.fromEntries(Array.from({ length: 805 }, (_, i) => [`https://cdn.example.com/${i}.pkg`, { s: 'active', c: 200, at: i }])) };
  const full = world({ saved: many });
  full.health.report('https://cdn.example.com/new.pkg', 'HTTP 404');
  full.health.flush();
  const kept = Object.keys(full.state.saved.links);
  assert.equal(kept.length, 800);
  assert.ok(kept.includes('https://cdn.example.com/new.pkg') && !kept.includes('https://cdn.example.com/0.pkg'), 'the oldest went first');
});

test(`a background run asks at most ${BACKGROUND_LINKS} links`, async () => {
  const { http, health, done } = world();
  const releases = Array.from({ length: 40 }, (_, i) => direct(`r${i}`, `https://cdn${i}.example.com/Game.pkg`));
  health.want('game', releases);
  const progress = await done('game');
  assert.equal(http.calls.length, BACKGROUND_LINKS);
  assert.equal(progress.summary.skipped, 40 - BACKGROUND_LINKS);
});

// ---- against a real HTTP server on this machine: real sockets, redirects, statuses and a deadline ----
function nodeHttp() {
  // The runtime's Http.request contract (ps5-react docs/NETWORKING.md) over Node's fetch: redirects
  // followed, non-2xx resolved, lowercase headers, a signal with addEventListener.
  return {
    async request(url, { method = 'GET', signal } = {}) {
      const controller = new AbortController();
      signal?.addEventListener('abort', () => controller.abort());
      const response = await fetch(url, { method, redirect: 'follow', signal: controller.signal });
      return { status: response.status, ok: response.ok, url: response.url, headers: Object.fromEntries([...response.headers].map(([k, v]) => [k.toLowerCase(), v])) };
    },
  };
}

test('integration: a local server answering 200, 302, 404, 410, 503-then-200, 429, a page and silence', async (t) => {
  const hits = {};
  const server = createServer((request, response) => {
    const route = request.url;
    hits[route] = (hits[route] ?? 0) + 1;
    if (request.method !== 'HEAD') { response.writeHead(405).end(); return; }
    if (route === '/ok.pkg') response.writeHead(200, { 'Content-Length': '4000000000', 'Content-Type': 'application/octet-stream' }).end();
    else if (route === '/moved.pkg') response.writeHead(302, { Location: '/ok.pkg' }).end();
    else if (route === '/gone.pkg') response.writeHead(404).end();
    else if (route === '/removed.pkg') response.writeHead(410).end();
    else if (route === '/busy.pkg') response.writeHead(hits[route] < 3 ? 503 : 200).end();
    else if (route === '/limited.pkg') response.writeHead(429, { 'Retry-After': '1' }).end();
    else if (route === '/landing.pkg') response.writeHead(200, { 'Content-Type': 'text/html' }).end();
    else if (route === '/silent.pkg') { /* never answers */ }
    else response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  // The rate-limited link last: after its 429 the whole host (this server) is left alone.
  const names = ['ok', 'moved', 'gone', 'removed', 'busy', 'landing', 'silent', 'limited'];
  const releases = names.map((name) => direct(name, `${base}/${name}.pkg`));
  let saved = null;
  // Real time, a hundred times faster: a 10 s deadline is 100 ms, the 2 s and 4 s backoffs 20 and 40 ms.
  const health = createLinkHealth({
    http: nodeHttp(),
    store: { get: () => saved, set: (value) => { saved = value; } },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms / 100)),
    timeout: (fn, ms) => { const id = setTimeout(fn, ms / 100); return () => clearTimeout(id); },
    log: () => {},
  });
  const summary = await health.checkNow('game', releases);
  const status = Object.fromEntries(names.map((name) => [name, health.recordOf(`${base}/${name}.pkg`)?.s ?? 'not marked']));
  assert.deepEqual(status, { ok: 'active', moved: 'active', gone: 'dead', removed: 'dead', busy: 'active', limited: 'not marked', landing: 'unknown', silent: 'unreachable' });
  assert.deepEqual(summary, { active: 3, unreachable: 1, dead: 2, unknown: 1, skipped: 1 });
  assert.deepEqual([hits['/gone.pkg'], hits['/busy.pkg'], hits['/limited.pkg'], hits['/silent.pkg']], [2, 3, 1, 3], 'confirmed, retried, left alone, tried three times');
  assert.equal(hits['/ok.pkg'], 2, 'the 4 GB file was asked about (directly and through the redirect), never downloaded');
  const shown = health.overlay(releases);
  assert.deepEqual(sourceSections(shown).map(({ group, items }) => [group, items.length]), [['direct', 8]]);
  assert.equal(shown[preferredRelease(shown)].id, 'ok', 'a link that answered is picked first');
});

// 0.5.0 Pre Release 4: a source listed without a size shows the one its file link answered with.
test('a file link answering with its size gives the source that size; a web page, a small answer or a set does not', async () => {
  const PAGE = 'https://files.example.net/landing';
  const { health, done } = world({ table: {
    [ARCHIVE]: [{ status: 200, headers: { 'content-length': String(42 * 1024 ** 3), 'content-type': 'application/octet-stream' } }],
    [MIRROR]: [{ status: 200, headers: { 'content-length': '512', 'content-type': 'application/octet-stream' } }],
    [PAGE]: [{ status: 200, headers: { 'content-length': String(5 * 1024 ** 2), 'content-type': 'text/html' } }],
  } });
  const releases = [direct('a', ARCHIVE, { sizeBytes: null }), direct('b', MIRROR, { sizeBytes: null }), direct('c', PAGE, { sizeBytes: null }), direct('d', ARCHIVE, { sizeBytes: 7 })];
  health.want('game', releases);
  await done('game');
  const shown = health.overlay(releases);
  assert.equal(shown[0].sizeBytes, 42 * 1024 ** 3);
  assert.equal(shown[0].sizeFromCheck, true);
  assert.equal(shown[1].sizeBytes, null, 'a 512-byte answer is not a game');
  assert.equal(shown[2].sizeBytes, null, 'a web page says nothing of the file');
  assert.equal(shown[3].sizeBytes, 7, 'a size the catalog lists stays');
  assert.equal(health.recordOf(ARCHIVE).b, 42 * 1024 ** 3, 'kept with the link, so it shows next time without asking');
});
