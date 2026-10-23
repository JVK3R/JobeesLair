// AllDebrid (0.5.1): its API client (app/services/alldebrid.js) and the provider switch in state/debrid.js:
// TorBox while its key is set, else AllDebrid, and a download resolved by the provider it went through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const en = JSON.parse((await import('node:fs')).readFileSync(path.join(repo, 'app/i18n/locales/en.json'), 'utf8'));
(await load('app/i18n/core.js')).configure(() => en, en);
const { createAllDebrid, hostSupported, validKey } = await load('app/services/alldebrid.js');
const debrid = await load('app/state/debrid.js');
const { describeSource } = await load('app/game/sources.js');

const KEY = 'AbCdEf0123456789XyZw';
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
// A fake AllDebrid: answers by path; records what was asked.
function fakeHttp(routes) {
  const asked = [];
  return {
    asked,
    async request(url, options) {
      const route = new URL(url).pathname;
      asked.push({ route, auth: options.headers?.Authorization, body: options.body ?? '', url });
      const answer = routes[route];
      return typeof answer === 'function' ? answer(options) : answer ?? reply(404, { status: 'error', error: { code: 'NOT_FOUND', message: 'nope' } });
    },
  };
}

test('AllDebrid: the key goes in a Bearer header only; a link unlocks at once or after its delay', async () => {
  let polls = 0;
  const http = fakeHttp({
    '/v4/user': reply(200, { status: 'success', data: { user: { username: 'jake', isPremium: true, premiumUntil: 1798761600 } } }),
    '/v4/link/unlock': (options) => options.body.includes('slow')
      ? reply(200, { status: 'success', data: { delayed: 42, filename: 'Game.rar' } })
      : reply(200, { status: 'success', data: { link: 'https://dl.alldebrid.com/x/Game.rar', filename: 'Game.rar', filesize: 1234 } }),
    '/v4/link/delayed': () => reply(200, { status: 'success', data: ++polls < 2 ? { status: 1, time_left: 5 } : { status: 2, link: 'https://dl.alldebrid.com/y/Game.rar' } }),
    '/v4.1/user/hosts': reply(200, { status: 'success', data: { hosts: { rapidgator: { name: 'rapidgator', domains: ['rapidgator.net', 'rg.to'], regexps: [], status: true }, dead: { name: 'dead', domains: ['dead.example'], regexps: [], status: false } } } }),
  });
  const api = createAllDebrid({ http, key: () => KEY });
  assert.deepEqual(await api.me(), { premium: true, expiresAt: '2027-01-01', username: 'jake' });
  assert.deepEqual(await api.resolve('https://rapidgator.net/file/1'), { url: 'https://dl.alldebrid.com/x/Game.rar', name: 'Game.rar', size: 1234 });
  assert.equal((await api.resolve('https://rapidgator.net/file/slow', { pollMs: 1 })).url, 'https://dl.alldebrid.com/y/Game.rar');
  assert.equal(polls, 2);
  assert.ok(http.asked.every((call) => call.auth === `Bearer ${KEY}` && !call.url.includes(KEY)), 'never in a URL');
  const hosts = await api.hosters();
  assert.equal(hostSupported(hosts, 'https://rg.to/file/abc'), true);
  assert.equal(hostSupported(hosts, 'https://dead.example/file'), false, 'a host it lists as down');
  assert.equal(hostSupported(hosts, 'https://gofile.io/d/x'), false);
  assert.equal(hostSupported(null, 'https://gofile.io/d/x'), null, 'unknown while the list is not read');
  assert.equal(validKey(KEY), true);
  assert.equal(validKey('has spaces in it'), false);
});

test("AllDebrid's errors read as a sentence the gamer can act on", async () => {
  const down = createAllDebrid({ http: fakeHttp({ '/v4/link/unlock': reply(200, { status: 'error', error: { code: 'LINK_DOWN', message: 'gone' } }) }), key: () => KEY });
  await assert.rejects(down.resolve('https://rapidgator.net/file/1'), /gone from its host/);
  const bad = createAllDebrid({ http: fakeHttp({ '/v4/user': reply(401, { status: 'error', error: { code: 'AUTH_BAD_APIKEY', message: 'bad' } }) }), key: () => KEY });
  await assert.rejects(bad.me(), /refused the API key/);
  const failed = createAllDebrid({ http: fakeHttp({ '/v4/link/unlock': reply(200, { status: 'success', data: { delayed: 7 } }), '/v4/link/delayed': reply(200, { status: 'success', data: { status: 3 } }) }), key: () => KEY });
  await assert.rejects(failed.resolve('https://rapidgator.net/file/1', { pollMs: 1 }), /couldn't prepare/);
  await assert.rejects(createAllDebrid({ http: fakeHttp({}), key: () => '' }).me(), /needs an API key/);
});

test('one provider at a time: TorBox while its key is set, else AllDebrid; a download keeps the one it went through', async () => {
  const FICHIER = 'https://1fichier.com/?abc';
  const browser = { id: 'b', provider: '1fichier.com', url: FICHIER, browserUrl: FICHIER, requiresBrowser: true, format: 'binary', label: 'USA' };
  debrid.setTorBoxKey('');
  debrid.setAllDebridKey('');
  assert.equal(debrid.activeService(), null);
  assert.throws(() => debrid.setAllDebridKey('not a key!'), /doesn't look like an AllDebrid API key/);
  debrid.setAllDebridKey(KEY);
  assert.equal(debrid.activeService(), 'alldebrid');
  assert.equal(debrid.debridSupports(browser), true);
  const variant = debrid.debridSource(browser);
  assert.equal(variant.id, 'b~alldebrid');
  assert.equal(variant.debrid.service, 'alldebrid');
  assert.match(describeSource(variant).detail, /via AllDebrid/);
  assert.equal(debrid.heldByTorBox(browser), null, 'no TorBox Instant badge with AllDebrid');
  debrid.setAllDebridClient({ resolve: async (link) => ({ url: `https://dl.alldebrid.com/${encodeURIComponent(link)}` }) });
  assert.match((await debrid.debridResolver.resolve(variant)).url, /^https:\/\/dl\.alldebrid\.com\//);
  // TorBox set as well: new downloads go through TorBox; the AllDebrid one still resumes through AllDebrid.
  debrid.setTorBoxKey('0123abcd-0123-abcd-0123-0123456789ab');
  assert.equal(debrid.activeService(), 'torbox');
  assert.equal(debrid.debridSource(browser).id, 'b~torbox');
  assert.match((await debrid.debridResolver.resolve(variant)).url, /alldebrid/);
  debrid.setTorBoxKey('');
  debrid.setAllDebridKey('');
  await assert.rejects(debrid.debridResolver.resolve(variant), /AllDebrid isn't set up any more/);
  debrid.setAllDebridClient(null);
});
