// Torrents through debrid (0.5.1): a feed's magnet link is a source of kind "torrent" (download-sources.js),
// downloadable through TorBox or AllDebrid only; TorBox hands one file or all of them as a zip (services/torbox.js
// chooseFiles), AllDebrid one file (services/alldebrid.js resolveMagnet); the queue takes the bytes' own size.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const en = JSON.parse((await import('node:fs')).readFileSync(path.join(repo, 'app/i18n/locales/en.json'), 'utf8'));
(await load('app/i18n/core.js')).configure(() => en, en);
const { createSourceResolver, isMagnetLink, sourceKind } = await load('app/state/download-sources.js');
const { chooseFiles, createTorBox } = await load('app/services/torbox.js');
const { createAllDebrid } = await load('app/services/alldebrid.js');
const debrid = await load('app/state/debrid.js');
const { describeSource, fallbacks, preferredRelease, runsHere, sourceOrder, sourceSections } = await load('app/game/sources.js');
const { parseFeed } = await load('app/state/feed-format.js');

const HASH = 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a';
const MAGNET = `magnet:?xt=urn:btih:${HASH}&dn=Game.Name.PS5.exfat&tr=udp%3A%2F%2Ftracker.example%3A1337`;
const TORBOX_KEY = '0123abcd-4567-89ef-0123-456789abcdef';
const ALL_KEY = 'AbCdEf0123456789XyZw';
const torrent = { id: 't', provider: 'Torrent', url: MAGNET, format: 'exfat', label: 'USA', filename: 'Game.Name.PS5.exfat', dumpType: 'image', compatible1360: true, sizeBytes: 50e9 };
const direct = { id: 'd', provider: 'archive.org', url: 'https://archive.org/download/x/Game.exfat', format: 'exfat', label: 'EUR', dumpType: 'image', compatible1360: true };
const browser = { id: 'b', provider: '1fichier.com', url: 'https://1fichier.com/?abc', browserUrl: 'https://1fichier.com/?abc', requiresBrowser: true, format: 'binary', label: 'USA' };

test('a magnet link is a torrent source: recognised by its info hash, never a plain download', async () => {
  assert.ok(isMagnetLink(MAGNET));
  assert.ok(isMagnetLink('magnet:?xt=urn:btih:YNCKHTQCWBTRNJIV4WNAE52SJUQCZO5C'), 'base32 hash');
  assert.ok(!isMagnetLink('magnet:?dn=no-hash') && !isMagnetLink('https://example.com/magnet:?xt=urn:btih:' + HASH) && !isMagnetLink(MAGNET + ' x'));
  assert.equal(sourceKind(torrent), 'torrent');
  assert.equal(sourceKind({ ...torrent, debrid: { service: 'torbox' } }), 'debrid');
  const plain = createSourceResolver({ http: { request: async () => { throw new Error('no request'); } } });
  await assert.rejects(plain.resolve(torrent), /This source is a torrent\. Add a TorBox or AllDebrid API key/);
  // Through debrid, the answer's own size (or none, for a repack) rides along for the queue.
  const viaZip = createSourceResolver({ http: {}, debrid: { resolve: async () => ({ url: 'https://cdn.example/all.zip', expectedBytes: null, repacked: true }) } });
  assert.deepEqual(await viaZip.resolve({ ...torrent, debrid: { service: 'torbox' } }), { url: 'https://cdn.example/all.zip', rejectHtml: true, expectedBytes: null, repacked: true });
  const viaFile = createSourceResolver({ http: {}, debrid: { resolve: async () => ({ url: 'https://cdn.example/Game.exfat', expectedBytes: 49e9 }) } });
  assert.deepEqual(await viaFile.resolve({ ...torrent, debrid: { service: 'alldebrid' } }), { url: 'https://cdn.example/Game.exfat', rejectHtml: true, expectedBytes: 49e9 });
});

test('TorBox: the named file, a lone file, the big one beside small change, else everything as one zip', async () => {
  const image = [{ id: 1, name: 'Game.exfat', size: 50e9 }, { id: 2, name: 'readme.nfo', size: 4000 }];
  const dump = [{ id: 1, name: 'PPSA01234/eboot.bin', size: 30e6 }, { id: 2, name: 'PPSA01234/data0.pak', size: 20e9 }, { id: 3, name: 'PPSA01234/data1.pak', size: 25e9 }];
  assert.deepEqual(chooseFiles(image, 'game.EXFAT'), { file: image[0] }, 'named, whatever the case');
  assert.deepEqual(chooseFiles(dump, 'data1.pak'), { file: dump[2] });
  assert.deepEqual(chooseFiles([image[1]]), { file: image[1] }, 'a lone file');
  assert.deepEqual(chooseFiles(image, 'something-else'), { file: image[0] }, 'the image is nearly all of it');
  assert.deepEqual(chooseFiles(dump), { zip: true }, 'a folder dump: every file matters');
  assert.equal(chooseFiles([]), null);
  // The whole flow for a folder dump: the torrent added, waited for, then its zip link asked for.
  const calls = [];
  const http = {
    async request(url, options = {}) {
      const { pathname, searchParams } = new URL(url);
      calls.push({ path: pathname.replace('/v1/api', ''), method: options.method || 'GET', params: Object.fromEntries(searchParams), body: options.body });
      const route = calls.at(-1).path;
      const ok = (data) => ({ status: 200, ok: true, json: async () => ({ success: true, error: null, detail: 'ok', data }) });
      if (route === '/torrents/createtorrent') return ok({ torrent_id: 9, hash: HASH });
      if (route === '/torrents/mylist') return ok([{ id: 9, download_finished: calls.filter((c) => c.path === route).length > 1, download_present: true, progress: 0.5, files: dump }]);
      if (route === '/torrents/requestdl') return ok('https://store.torbox.app/zip/9.zip');
      return { status: 404, ok: false, json: async () => ({ success: false, error: 'HTTP_404' }) };
    },
  };
  const api = createTorBox({ http, key: () => TORBOX_KEY, wait: async () => {} });
  const result = await api.resolve(MAGNET, { filename: 'Game.Name.PS5.exfat', pollMs: 1 });
  assert.deepEqual(result, { url: 'https://store.torbox.app/zip/9.zip', kind: 'torrent', id: 9, fileId: null, name: null, size: null, repacked: true });
  const create = calls.find((c) => c.path === '/torrents/createtorrent');
  assert.ok(create.method === 'POST' && create.body.includes(MAGNET), 'the magnet posted as multipart');
  const link = calls.find((c) => c.path === '/torrents/requestdl');
  assert.deepEqual(link.params, { token: TORBOX_KEY, torrent_id: '9', zip_link: 'true' }, 'the zip of all files, no file_id');
});

test('AllDebrid: a magnet is uploaded, waited for, and its one file unlocked; many files are refused', async () => {
  let polls = 0;
  const asked = [];
  const reply = (data) => ({ status: 200, ok: true, json: async () => ({ status: 'success', data }) });
  const http = {
    async request(url, options) {
      const route = new URL(url).pathname;
      asked.push({ route, body: options.body ?? '' });
      if (route === '/v4/magnet/upload') return reply({ magnets: [{ magnet: MAGNET, id: 123, name: 'Game.Name.PS5', size: 50e9, ready: false }] });
      if (route === '/v4/magnet/status') return reply({ magnets: ++polls < 2 ? { id: 123, status: 'Downloading', statusCode: 1 } : { id: 123, status: 'Ready', statusCode: 4, links: options.body.includes('123') && many ? dumpLinks : imageLinks } });
      if (route === '/v4/link/unlock') return reply({ link: 'https://dl.alldebrid.com/z/Game.exfat', filename: 'Game.exfat', filesize: 50e9 });
      return { status: 404, ok: false, json: async () => ({ status: 'error', error: { code: 'NOT_FOUND', message: 'nope' } }) };
    },
  };
  const imageLinks = [{ link: 'https://alldebrid.example/a', filename: 'Game.exfat', size: 50e9 }, { link: 'https://alldebrid.example/b', filename: 'readme.nfo', size: 4000 }];
  const dumpLinks = [{ link: 'https://alldebrid.example/1', filename: 'eboot.bin', size: 30e6 }, { link: 'https://alldebrid.example/2', filename: 'data0.pak', size: 20e9 }, { link: 'https://alldebrid.example/3', filename: 'data1.pak', size: 25e9 }];
  let many = false;
  const api = createAllDebrid({ http, key: () => ALL_KEY });
  const result = await api.resolveMagnet(MAGNET, { filename: 'nothing-like-it', pollMs: 1 });
  assert.deepEqual(result, { url: 'https://dl.alldebrid.com/z/Game.exfat', name: 'Game.exfat', size: 50e9 });
  assert.ok(asked[0].route === '/v4/magnet/upload' && asked[0].body.includes(encodeURIComponent(MAGNET)));
  assert.equal(asked.filter((call) => call.route === '/v4/magnet/status').length, 2, 'polled until ready');
  assert.ok(asked.at(-1).route === '/v4/link/unlock' && asked.at(-1).body.includes(encodeURIComponent('https://alldebrid.example/a')), 'the big file unlocked');
  many = true;
  polls = 0;
  await assert.rejects(api.resolveMagnet(MAGNET, { pollMs: 1 }), /several files, and AllDebrid can't pack them/);
});

test('debrid state: both services take magnets; the resolver passes the file size or marks a repack', async () => {
  debrid.setAllDebridKey('');
  debrid.setTorBoxKey('');
  assert.equal(debrid.debridSupports(torrent), false, 'no key');
  debrid.setTorBoxKey(TORBOX_KEY);
  assert.equal(debrid.debridSupports(torrent), true);
  const viaTorBox = debrid.debridSource(torrent);
  assert.equal(viaTorBox.id, 't~torbox');
  const seen = [];
  debrid.setTorBoxClient({ resolve: async (link, options) => (seen.push({ link, filename: options.filename }), { url: 'https://store.torbox.app/zip/9.zip', kind: 'torrent', id: 9, fileId: null, name: null, size: null, repacked: true }) });
  assert.deepEqual(await debrid.debridResolver.resolve(viaTorBox), { url: 'https://store.torbox.app/zip/9.zip', expectedBytes: null, repacked: true });
  assert.deepEqual(seen, [{ link: MAGNET, filename: 'Game.Name.PS5.exfat' }], 'the release\'s file name, so TorBox picks that file when it is there');
  debrid.setTorBoxClient({ resolve: async () => ({ url: 'https://store.torbox.app/f/Game.exfat', kind: 'torrent', id: 9, fileId: 1, name: 'Game.exfat', size: 49e9 }) });
  assert.deepEqual(await debrid.debridResolver.resolve(viaTorBox), { url: 'https://store.torbox.app/f/Game.exfat', expectedBytes: 49e9, repacked: false });
  debrid.setTorBoxClient(null);
  debrid.setTorBoxKey('');
  debrid.setAllDebridKey(ALL_KEY);
  assert.equal(debrid.debridSupports(torrent), true, 'AllDebrid takes magnets too');
  const viaAll = debrid.debridSource(torrent);
  assert.equal(viaAll.id, 't~alldebrid');
  debrid.setAllDebridClient({ resolveMagnet: async (link, options) => ({ url: `https://dl.alldebrid.com/${options.filename}`, name: 'Game.exfat', size: 48e9 }), resolve: async () => { throw new Error('a magnet is not a link to unlock'); } });
  assert.deepEqual(await debrid.debridResolver.resolve(viaAll), { url: 'https://dl.alldebrid.com/Game.Name.PS5.exfat', expectedBytes: 48e9 });
  debrid.setAllDebridClient(null);
  debrid.setAllDebridKey('');
});

test('the source list: a Torrents section after host pages, greyed and last without a key, ready with one', () => {
  debrid.setAllDebridKey('');
  debrid.setTorBoxKey('');
  const releases = [browser, torrent, direct];
  const described = describeSource(torrent);
  assert.equal(described.group, 'torrent');
  assert.equal(described.host, 'Torrent');
  assert.deepEqual(sourceSections(releases).map(({ group, items }) => [group, items.map(({ release }) => release.id)]), [['direct', ['d']], ['torrent', ['t']], ['browser', ['b']]]);
  assert.equal(preferredRelease(releases), 2, 'the direct file first');
  assert.deepEqual(sourceOrder(releases), [2, 0, 1], 'without a key a torrent ranks after the browser');
  assert.equal(runsHere(torrent, '13.60'), false, 'not a link anyone here can use yet');
  assert.deepEqual(fallbacks(releases, 2).map((release) => release.id), [], 'never a fallback for a plain download');
  debrid.setTorBoxKey(TORBOX_KEY);
  assert.deepEqual(sourceOrder(releases), [2, 1, 0], 'with a key, before the browser');
  assert.equal(runsHere(torrent, '13.60'), true);
  assert.deepEqual(fallbacks(releases, 2).map((release) => release.id), []);
  debrid.setTorBoxKey('');
});

test('a feed lists a magnet as a release: kept with its name from dn, provider Torrent, the game\'s providers say torrent', () => {
  const feed = { version: 1, name: 'Torrents', games: [{ id: 'PPSA01234', title: 'Game Name', releases: [
    { url: MAGNET, sizeBytes: 50e9, label: 'USA' },
    { url: 'magnet:?dn=no-hash-here', label: 'bad' },
    { url: `magnet:?xt=urn:btih:${HASH.replace(/^c/, 'd')}&dn=dump`, filename: 'Game.Name.PS5.zip', provider: 'Scene' },
    { url: 'https://archive.org/download/x/Game.exfat' },
  ] }] };
  const parsed = parseFeed(feed, 'https://example.com/torrents.json');
  const game = parsed.games[0];
  const releases = game.releases.filter((release) => release.url.startsWith('magnet:'));
  assert.equal(releases.length, 2, 'the magnet without a hash is dropped');
  assert.equal(releases[0].filename, 'Game.Name.PS5.exfat');
  assert.equal(releases[0].format, 'exfat');
  assert.equal(releases[0].provider, 'Torrent');
  assert.equal(releases[0].sizeBytes, 50e9);
  assert.equal(releases[1].provider, 'Scene');
  assert.equal(releases[1].format, 'zip');
  assert.deepEqual(game.game.providers.sort(), ['archive.org', 'torrent']);
  assert.equal(sourceKind(releases[0]), 'torrent');
});
