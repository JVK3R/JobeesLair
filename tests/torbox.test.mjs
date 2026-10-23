// TorBox: services/torbox.js against a fake API (requests recorded, answers from a table), state/debrid.js
// (the key, which sources it takes, the queue's resolver), and download-sources.js's "debrid" kind.
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { createTorBox, hostSupported, md5, magnetHash, pickFile, validKey, linkHashes } = await load('app/services/torbox.js');
const { createSourceResolver, sourceKind } = await load('app/state/download-sources.js');
const debrid = await load('app/state/debrid.js');
const { sameRelease } = await load('app/state/release-sets.js');
const en = JSON.parse((await import('node:fs')).readFileSync(path.join(repo, 'app/i18n/locales/en.json'), 'utf8'));
(await load('app/i18n/core.js')).configure(() => en, en);
const { describeSource, fallbacks } = await load('app/game/sources.js');

const KEY = '0123abcd-4567-89ef-0123-456789abcdef';
const FICHIER = 'https://1fichier.com/?abc123def456';
const BASE = 'https://api.torbox.app/v1/api';
// A fake TorBox: `routes` maps "METHOD /path" to a function (url, options) -> body | { status, body }.
function fakeApi(routes) {
  const calls = [];
  const http = {
    async request(url, options = {}) {
      calls.push({ url, ...options });
      const { pathname } = new URL(url);
      const route = routes[`${options.method || 'GET'} ${pathname.replace('/v1/api', '')}`];
      if (!route) return { status: 404, ok: false, json: async () => ({ success: false, error: 'HTTP_404', detail: 'no route' }) };
      const answer = await route(new URL(url), options);
      const { status = 200, body } = answer && 'body' in answer ? answer : { body: answer };
      return { status, ok: status < 300, json: async () => body };
    }
  };
  return { http, calls };
}
const ok = (data) => ({ success: true, error: null, detail: 'ok', data });
const fail = (error, status = 200) => ({ status, body: { success: false, error, detail: `TorBox says ${error}`, data: null } });
const files = [{ id: 0, name: 'readme.txt', size: 1200 }, { id: 3, name: 'Game.part1.rar', size: 30e9 }];

test('md5 is RFC 1321 (a web download\'s hash), magnets give their info hash, keys are checked for shape', () => {
  for (const text of ['', FICHIER, `${FICHIER}&af=1`, 'x'.repeat(119), 'é ✓ 𝄞']) assert.equal(md5(text), createHash('md5').update(text).digest('hex'));
  assert.deepEqual(linkHashes(`${FICHIER}&af=9`), [md5(`${FICHIER}&af=9`), md5('https://1fichier.com/')]);
  assert.equal(magnetHash('magnet:?xt=urn:btih:C12FE1C06BBA254A9DC9F519B335AA7C1367A88A&dn=x'), 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a');
  assert.ok(validKey(KEY) && !validKey('my key') && !validKey(''));
  assert.equal(pickFile(files).id, 3, 'the largest');
  assert.equal(pickFile(files, 'readme.txt').id, 0, 'the one named');
});

test('me: plan and expiry only (no email), the key in an Authorization header', async () => {
  const { http, calls } = fakeApi({ 'GET /user/me': () => ok({ plan: 2, premium_expires_at: '2099-01-01T00:00:00Z', email: 'someone@example.com', cooldown_until: null }) });
  const account = await createTorBox({ http, key: () => KEY }).me();
  assert.deepEqual(account, { plan: 2, planName: 'pro', premium: true, expiresAt: '2099-01-01T00:00:00Z', cooldownUntil: null });
  assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
  assert.ok(!calls[0].url.includes(KEY));
  const free = await createTorBox({ http: fakeApi({ 'GET /user/me': () => ok({ plan: 0 }) }).http, key: () => KEY }).me();
  assert.equal(free.premium, false);
});

test('no key, or one that cannot be a key: refused before anything is sent', async () => {
  const { http, calls } = fakeApi({});
  await assert.rejects(createTorBox({ http, key: () => '' }).me(), { code: 'NO_AUTH' });
  await assert.rejects(createTorBox({ http, key: () => 'not a key' }).me(), { code: 'BAD_TOKEN' });
  assert.equal(calls.length, 0);
});

test('errors: TorBox\'s codes in plain words, 429, and a transport failure never quotes the key', async () => {
  const api = (routes) => createTorBox({ http: fakeApi(routes).http, key: () => KEY });
  await assert.rejects(api({ 'GET /user/me': () => fail('BAD_TOKEN', 403) }).me(), { code: 'BAD_TOKEN', message: /didn't accept the API key/ });
  await assert.rejects(api({ 'GET /user/me': () => ({ status: 429, body: null }) }).me(), { code: 'RATE_LIMITED' });
  await assert.rejects(api({ 'POST /webdl/createwebdownload': () => fail('UNSUPPORTED_SITE') }).createDownload(FICHIER), { code: 'UNSUPPORTED_SITE', message: "TorBox doesn't support this host." });
  const broken = createTorBox({ key: () => KEY, http: { request: async (url) => { throw new Error(`could not connect to ${url}`); } } });
  await assert.rejects(broken.getUnrestrictedLink('webdl', 7, 3), (error) => error.code === 'NETWORK' && !error.message.includes(KEY));
});

test('checkCachedLinks: each link asked by its MD5 (and its MD5 without the query), the held ones returned', async () => {
  const held = 'https://rapidgator.net/file/abc/Game.rar.html';
  const { http, calls } = fakeApi({ 'GET /webdl/checkcached': (url) => ok(Object.fromEntries(url.searchParams.get('hash').split(',').filter((hash) => hash === md5(held)).map((hash) => [hash, { name: 'Game.rar', size: 1, hash }]))) });
  const found = await createTorBox({ http, key: () => KEY }).checkCachedLinks([FICHIER, held]);
  assert.deepEqual([...found], [held]);
  assert.ok(calls[0].url.includes(md5(FICHIER)) && calls[0].url.includes('format=object'));
});

test('createDownload: a link as a form post to webdl, a magnet as a multipart post to torrents', async () => {
  const { http, calls } = fakeApi({
    'POST /webdl/createwebdownload': () => ok({ webdownload_id: 41, hash: 'h' }),
    'POST /torrents/createtorrent': () => ok({ torrent_id: 9, hash: 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a' })
  });
  const api = createTorBox({ http, key: () => KEY });
  assert.deepEqual(await api.createDownload(FICHIER), { kind: 'webdl', id: 41, hash: 'h' });
  assert.equal(calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(calls[0].body, `link=${encodeURIComponent(FICHIER)}`);
  const magnet = 'magnet:?xt=urn:btih:C12FE1C06BBA254A9DC9F519B335AA7C1367A88A';
  assert.equal((await api.createDownload(magnet)).kind, 'torrent');
  assert.match(calls[1].headers['Content-Type'], /^multipart\/form-data; boundary=/);
  assert.match(calls[1].body, /name="magnet"\r\n\r\nmagnet:\?xt=urn:btih:C12FE/);
});

test('resolve, held by TorBox: added, already finished, its largest file asked for; the key only in requestdl\'s query', async () => {
  const { http, calls } = fakeApi({
    'POST /webdl/createwebdownload': () => ok({ webdownload_id: 41, hash: md5(FICHIER) }),
    'GET /webdl/mylist': () => ok({ id: 41, download_finished: true, download_present: true, progress: 1, files }),
    'GET /webdl/requestdl': (url) => ok(`https://store-031.weur.tb-cdn.st/zip/${url.searchParams.get('web_id')}-${url.searchParams.get('file_id')}?token=cdn`)
  });
  const items = [];
  const result = await createTorBox({ http, key: () => KEY }).resolve(FICHIER, { onItem: (item) => items.push(item) });
  assert.deepEqual(result, { url: 'https://store-031.weur.tb-cdn.st/zip/41-3?token=cdn', kind: 'webdl', id: 41, fileId: 3, name: 'Game.part1.rar', size: 30e9 });
  assert.deepEqual(items, [{ kind: 'webdl', id: 41, hash: md5(FICHIER) }]);
  const request = calls.find((call) => call.url.includes('/requestdl'));
  assert.equal(new URL(request.url).searchParams.get('token'), KEY);
  assert.equal(request.headers.Authorization, undefined);
  assert.ok(!result.url.includes(KEY), 'the link handed on is the CDN\'s');
});

test('resolve, not held: polled while TorBox fetches, then PENDING with how far it got; asked again, the same item finishes', async () => {
  let progress = 0, clock = 0, created = 0;
  const { http } = fakeApi({
    'POST /webdl/createwebdownload': () => (created++, ok({ webdownload_id: 52 })),
    'GET /webdl/mylist': () => ok([{ id: 52, download_state: 'downloading', download_finished: progress >= 1, progress, files }]),
    'GET /webdl/requestdl': () => ok('https://cdn.example/52')
  });
  const api = createTorBox({ http, key: () => KEY, now: () => clock, wait: async (ms) => { clock += ms; progress += 0.1; } });
  const seen = [];
  await assert.rejects(api.resolve(FICHIER, { maxWaitMs: 30e3, pollMs: 10e3, onProgress: (value) => seen.push(Math.round(value * 10)) }), (error) => error.code === 'PENDING' && /still fetching this file \(30%\)/.test(error.message) && error.item.id === 52);
  assert.deepEqual(seen, [0, 1, 2, 3]);
  progress = 1;
  assert.equal((await api.resolve(FICHIER, { known: { kind: 'webdl', id: 52 } })).url, 'https://cdn.example/52');
  assert.equal(created, 1, 'the second ask found the item it had');
});

test('resolve: a failed fetch on TorBox says so; an item TorBox dropped is added again', async () => {
  const failing = createTorBox({ key: () => KEY, http: fakeApi({ 'POST /webdl/createwebdownload': () => ok({ webdownload_id: 3 }), 'GET /webdl/mylist': () => ok({ id: 3, download_state: 'failed (host error)', download_finished: false }) }).http });
  await assert.rejects(failing.resolve(FICHIER), { code: 'FAILED' });
  let created = 0;
  const gone = createTorBox({ key: () => KEY, http: fakeApi({
    'POST /webdl/createwebdownload': () => (created++, ok({ webdownload_id: 8 })),
    'GET /webdl/mylist': (url) => url.searchParams.get('id') === '8' ? ok({ id: 8, download_finished: true, files }) : fail('ITEM_NOT_FOUND', 404),
    'GET /webdl/requestdl': () => ok('https://cdn.example/8')
  }).http });
  assert.equal((await gone.resolve(FICHIER, { known: { kind: 'webdl', id: 5 } })).id, 8);
  assert.equal(created, 1);
});

test('hosters: a link\'s host by domain or regex, working ones only; unknown while the list is not read', () => {
  const list = [{ name: '1Fichier', domains: ['1fichier.com'], working: true, regex: null }, { name: 'Rapidgator', domains: ['rapidgator.net', 'rg.to'], working: false, regex: '^https?://(?:[^./]+\\.)*(rapidgator\\.net|rg\\.to)(/|$)' }, { name: 'Gofile', domains: [], working: true, regex: '^https?://(?:[^./]+\\.)*(gofile\\.io)(/|$)' }];
  assert.equal(hostSupported(list, FICHIER), true);
  assert.equal(hostSupported(list, 'https://rapidgator.net/file/x'), false, 'listed, but down');
  assert.equal(hostSupported(list, 'https://gofile.io/d/abc'), true, 'by its regex');
  assert.equal(hostSupported(list, 'https://unknown.example/x'), false);
  assert.equal(hostSupported(null, FICHIER), null);
});

test('download-sources: a source marked debrid is resolved by the debrid provider, or refused when there is none', async () => {
  const source = { id: 'r1', provider: '1fichier.com', url: FICHIER, browserUrl: FICHIER, requiresBrowser: true, debrid: { service: 'torbox' } };
  assert.equal(sourceKind(source), 'debrid');
  assert.equal(sourceKind({ ...source, debrid: undefined }), 'browser');
  const asked = [];
  const resolver = createSourceResolver({ http: { request: async () => { throw new Error('no plain request'); } }, debrid: { resolve: async (release) => (asked.push(release.id), { url: 'https://cdn.example/f' }) } });
  assert.deepEqual(await resolver.resolve(source), { url: 'https://cdn.example/f', rejectHtml: true });
  assert.deepEqual(asked, ['r1']);
  await assert.rejects(createSourceResolver({ http: {} }).resolve(source), /Add a TorBox or AllDebrid API key in Settings/);
});

test('debrid state: the key, which sources TorBox takes, their TorBox form, and the queue\'s resolver', async () => {
  const browser = { id: 'b', provider: '1fichier.com', url: FICHIER, browserUrl: FICHIER, requiresBrowser: true, format: 'binary', label: 'USA', linkHealth: { status: 'unreachable' }, health: 'flaky' };
  const archive = { id: 'a', provider: 'archive.org', url: 'https://archive.org/download/x/Game.exfat', format: 'exfat' };
  const set = { id: 'set', provider: 'rapidgator.net', format: 'archive-set', label: 'USA · 2 parts', parts: [1, 2].map((n) => ({ number: n, sources: [{ id: `p${n}`, provider: 'rapidgator.net', url: `https://rapidgator.net/file/${n}`, requiresBrowser: true }] })) };
  debrid.setTorBoxKey('');
  assert.equal(debrid.debridSupports(browser), false, 'no key: nothing changes');
  assert.throws(() => debrid.setTorBoxKey('hello'), /doesn't look like a TorBox API key/);
  debrid.setTorBoxKey(`  ${KEY} `);
  assert.equal(debrid.masked(KEY), '•••• cdef');
  assert.equal(debrid.debridSupports(browser), true, 'a browser-only host, while the hosts list is unknown');
  assert.equal(debrid.debridSupports(set), true);
  assert.equal(debrid.debridSupports(archive), false, 'a file link the app downloads itself');
  assert.equal(debrid.debridSupports({ ...browser, unavailableReason: 'Invalid volume number.' }), false);
  const variant = debrid.debridSource(browser);
  assert.equal(variant, debrid.debridSource(browser), 'the same object each time');
  assert.equal(variant.id, 'b~torbox');
  assert.equal(variant.linkHealth, undefined, 'the host\'s link check says nothing about TorBox');
  assert.equal(sourceKind(variant), 'debrid');
  assert.equal(describeSource(variant).group, 'direct');
  assert.match(describeSource(variant).detail, /^1fichier\.com · via TorBox/);
  assert.ok(debrid.debridSource(set).parts.every((part) => part.sources[0].debrid));
  assert.equal(sameRelease(browser, variant), false, 'the TorBox download is its own');
  assert.equal(sameRelease(variant, debrid.debridSource({ ...browser })), true);
  // The queue's resolver: TorBox's item for the link is remembered, so a resume asks for the same one.
  const seen = [];
  debrid.setTorBoxClient({ resolve: async (link, options) => (seen.push(options.known), options.onItem({ kind: 'webdl', id: 77 }), { url: 'https://cdn.example/77', kind: 'webdl', id: 77, fileId: 1 }) });
  assert.deepEqual(await debrid.debridResolver.resolve(variant), { url: 'https://cdn.example/77' });
  await debrid.debridResolver.resolve(variant);
  assert.equal(seen[0], undefined);
  assert.equal(seen[1].id, 77);
  // The Instant check: asked only when the queue lends the network, and given back after.
  let returned = 0;
  debrid.setTorBoxClient({ hosters: async () => [], checkCachedLinks: async (links) => new Set(links.filter((link) => link.includes('rapidgator.net/file/1') || link === FICHIER)) });
  assert.equal(await debrid.askTorBoxInstant([FICHIER], () => null), false, 'a download holds the network: not asked');
  assert.equal(debrid.heldByTorBox(browser), null);
  assert.equal(await debrid.askTorBoxInstant([FICHIER, 'https://rapidgator.net/file/1', 'https://rapidgator.net/file/2'], () => () => returned++), true);
  assert.equal(returned, 1);
  assert.equal(debrid.heldByTorBox(browser), true);
  assert.equal(debrid.heldByTorBox(set), false, 'part 2 is not held');
  debrid.setTorBoxKey('');
  assert.equal(debrid.debridSupports(browser), false, 'the key removed: back to the plain sources');
  await assert.rejects(debrid.debridResolver.resolve(variant), /TorBox isn't set up any more/);
  debrid.setTorBoxClient(null);
  assert.deepEqual(fallbacks([browser, { ...browser, id: 'b2', provider: 'gofile.io', url: 'https://gofile.io/d/x', browserUrl: 'https://gofile.io/d/x' }], 0).map(({ id }) => id), [], 'mirrors are the catalog\'s, unchanged');
});
