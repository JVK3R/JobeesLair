// Renders the source list and the download button as a 13.60 console shows them: link-health.json after a
// check (Archive.org's link gone, a mirror offline, one answering), and release types from the release cache
// (an exFAT image, a folder dump, a PS5 FPKG, a PS4 backport). Run: npm run test:render
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.screen = { width: 1920, height: 1080 };
const repo = process.env.JL_REPO || fileURLToPath(new URL('../..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const en = (await load('app/i18n/locales/en.json')).default;
(await load('app/i18n/core.js')).configure(() => en, en);

const ARCHIVE = 'https://archive.org/download/item/Game.exfat';
const SLOW = 'https://slow.example.org/Game.exfat';
const GOOD = 'https://cdn.example.com/Game.exfat';
const now = Date.now();
const files = new Map([
  ['/download0/JobeesLair/link-health.json', JSON.stringify({ version: 1, links: {
    [ARCHIVE]: { s: 'dead', c: 404, at: now }, [SLOW]: { s: 'unreachable', c: 'timeout', at: now }, [GOOD]: { s: 'active', c: 200, at: now },
  } })],
]);
const fs = {
  exists: (p) => files.has(p), stat: (p) => files.has(p) ? { isFile: true, size: files.get(p).length } : null,
  readFile: (p) => { if (!files.has(p)) throw new Error(`ENOENT ${p}`); return files.get(p); },
  readDir: () => [], writeFile() {}, mkdir() {}, rename() {}, remove() {}, diskUsage: () => ({ free: 1e12, total: 2e12 }),
};
globalThis.__fake = { os: 'ps5', fs, arms: [], exits: [], jobs: [], focused: false,
  queue: { snapshot: () => [], subscribe: () => () => {}, lendNetwork: () => null, transferring: () => false, quietNetwork: (r, work) => work() },
  drives: { roots: ['/data'], ready: true, usage: { '/data': { free: 1e12, total: 2e12 } } } };

const { withReleaseTypes } = await load('app/state/release-sets.js');
const source = (id, provider, url, format, label) => ({ id, provider, url, format, filename: `${id}.${format}`, sizeBytes: 30e9, label });
const catalog = withReleaseTypes([
  source('a', 'archive.org', ARCHIVE, 'exfat', 'USA Base (v01.00) - Direct'),
  source('s', 'slow.example.org', SLOW, 'exfat', 'USA Base (v01.00) - Direct'),
  source('g', 'cdn.example.com', GOOD, 'exfat', 'USA Base (v01.00) - Direct'),
  source('f', 'mirror.example', 'https://mirror.example/Game_Folder_Dump.rar', 'rar', 'USA Folder Dump (v01.00) - Direct'),
  source('p', 'pkg.example', 'https://pkg.example/PPSA01234-game.pkg', 'pkg', 'USA Base (v01.00) - Direct'),
  source('b', 'mirror.example', 'https://mirror.example/Game-Backport.zip', 'zip', 'USA Backport (v01.10) - Direct'),
], 'ps5');

function texts(element) {
  const out = [];
  let rendered = 0;
  (function walk(node) {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const { type, props = {} } = node;
    if (typeof props.style === 'function') props.style({ focused: false, pressed: false });
    if (typeof type === 'function') {
      rendered++;
      return walk(type(props));
    }
    if (type === 'Text') {
      const children = [props.children].flat().filter((child) => typeof child === 'string' || typeof child === 'number');
      if (children.length) out.push(children.join(''));
      return;
    }
    walk(props.children);
  })(element);
  return { out, rendered };
}
const has = (list, pattern) => list.some((text) => pattern.test(text));
// The badges of the row whose host line is `host`: the pills between its name and its detail.
function rowBadges(list, host) {
  const at = list.findIndex((text, i) => text === host || (i > 0 && text.startsWith(`${host} `)));
  const start = list.slice(0, at).findLastIndex((text) => /^(Disk image|Archive|Package|Format unknown)/.test(text));
  return list.slice(start + 1, at).filter((text) => text !== 'Recommended');
}

const { SourcePicker } = await load('app/game/SourcePicker.jsx');
const describeSourceOf = (release) => describe(release).detail;
const { describeSource: describe } = await load('app/game/sources.js');
const picker = texts({ type: SourcePicker, props: { title: 'Test Game', releases: catalog, selected: 0, submit() {}, current: 'PPSA01234', onClose() {}, checkLinks: async () => {} } });
console.log(`--- source list (${picker.rendered} components)\n${picker.out.join('\n')}`);
assert.deepEqual(rowBadges(picker.out, 'cdn.example.com'), ['.exfat Image', '13.60 Ready']);
assert.deepEqual(rowBadges(picker.out, 'slow.example.org'), ['.exfat Image', '13.60 Ready', 'Offline'], 'the silent mirror is tagged');
assert.ok(has(picker.out, /^slow\.example\.org didn't answer\. It may be down for a while\.$/));
assert.deepEqual(rowBadges(picker.out, 'pkg.example'), ['FPKG (<=11.60)'], 'one badge, not FPKG twice');
assert.ok(has(picker.out, /^pkg\.example · Needs firmware 11\.60 or lower\. On 13\.60, use a folder dump or ShadowMount\+ image$/), 'why, in place of a tooltip');
assert.ok(has(picker.out, /^Folder Dump$/) && has(picker.out, /^Backport$/));
assert.equal(picker.out[picker.out.indexOf('Recommended') + 1], '.exfat Image', 'Recommended sits on a working image');
// The link the check found gone stays listed, as in 0.1.0: tagged, last of its section, never "Recommended".
assert.deepEqual(rowBadges(picker.out, 'archive.org'), ['.exfat Image', '13.60 Ready', 'Broken link']);
assert.ok(has(picker.out, /^archive\.org · the file is gone \(HTTP 404\)$/));
assert.ok(!has(picker.out, /unavailable link/), 'nothing hidden');
assert.ok(has(picker.out, /^Check link health$/));

// A PS4 game's backport: the pill stays, the green badge does not; a PS5 backport keeps both.
const ps4Backport = withReleaseTypes([source('b4', 'mirror.example', 'https://mirror.example/Game-Backport.zip', 'zip', 'USA Backport (v01.10) - Direct'), source('g4', 'cdn.example.com', 'https://cdn.example.com/CUSA.exfat', 'exfat', 'USA Base (v01.00) - Direct')], 'ps4');
const ps4 = texts({ type: SourcePicker, props: { title: 'PS4 Game', releases: ps4Backport, selected: 1, submit() {}, current: 'CUSA01234', onClose() {}, checkLinks: async () => {} } });
const backportRow = ps4.out.slice(ps4.out.indexOf('Archive · USA v1.10') + 1, ps4.out.indexOf('mirror.example · Backport'));
assert.deepEqual(backportRow, ['PS4 Backport'], 'PS4 backport: the pill, no "13.60 Ready"');
assert.deepEqual(rowBadges(picker.out, 'mirror.example · Backport'), ['Backport', '13.60 Ready'], 'PS5 backport: unchanged');

const { linkHealth } = await load('app/state/links.js');
const shown = linkHealth().overlay(catalog);
assert.equal(shown[0].unavailableReason, undefined);
assert.equal(shown[0].health, 'dead');
assert.equal(shown[1].health, 'flaky');

// The download button with the PS5 FPKG picked (the only source): the line under it and the note say why.
const { DownloadButton } = await load('app/game/DownloadButton.jsx');
const fpkgGame = { id: 'PPSA01234', titleId: 'PPSA01234', title: 'Test Game', platform: 'ps5', releases: [catalog[4]] };
const button = texts({ type: DownloadButton, props: { game: fpkgGame, onDownloaded() {}, onRequestDialog() {} } });
console.log(`--- download button, PS5 FPKG (${button.rendered} components)\n${button.out.join('\n')}`);
assert.ok(has(button.out, /^Package · USA v1 · FPKG \(<=11\.60\) · pkg\.example/), 'right after the name, before the line is cut');
assert.ok(has(button.out, /^This PS5 fake package won't launch on this console$/));
const imageGame = { ...fpkgGame, releases: [catalog[2]] };
const fine = texts({ type: DownloadButton, props: { game: imageGame, onDownloaded() {}, onRequestDialog() {} } });
assert.ok(!has(fine.out, /won't launch|isn't answering/), 'nothing to warn about for a working image');
assert.ok(has(fine.out, /^13\.60 Ready · Disk image · USA v1 · /), 'the chosen image leads with its 13.60 Ready tag');
const offlineGame = { ...fpkgGame, releases: [catalog[1]] };
const offline = texts({ type: DownloadButton, props: { game: offlineGame, onDownloaded() {}, onRequestDialog() {} } });
assert.ok(has(offline.out, /^slow\.example\.org isn't answering right now$/) && has(offline.out, /^13\.60 Ready · Disk image · USA v1 · Offline · slow\.example\.org/));
// Every link of a game refused (Archive.org's 403 "Item not available"): the sheet still lists both, tagged,
// and the button says what the check found while the download can still be tried.
const GONE1 = 'https://archive.org/download/item-a/Game.ffpfsc', GONE2 = 'https://archive.org/download/item-b/Game.ffpfsc';
files.set('/download0/JobeesLair/link-health.json', JSON.stringify({ version: 1, links: { ...JSON.parse(files.get('/download0/JobeesLair/link-health.json')).links, [GONE1]: { s: 'dead', c: 403, at: now }, [GONE2]: { s: 'dead', c: 401, at: now } } }));
const goneCatalog = withReleaseTypes([source('x1', 'archive.org', GONE1, 'ffpfsc', 'EUR'), source('x2', 'archive.org', GONE2, 'ffpfsc', 'USA')], 'ps5');
// A fresh link-health instance would read the file; this one learns the same two verdicts through report().
linkHealth().report(GONE1, 'Source unavailable: HTTP 403. Choose another source.');
linkHealth().report(GONE2, 'Source unavailable: HTTP 401. Choose another source.');
const goneSheet = texts({ type: SourcePicker, props: { title: 'Gone Game', releases: goneCatalog, selected: 0, submit() {}, current: 'PPSA09999', onClose() {}, checkLinks: async () => {} } });
console.log(`--- source list, every link gone\n${goneSheet.out.join('\n')}`);
assert.ok(!has(goneSheet.out, /unavailable link/i), 'both offered, none hidden');
assert.equal(goneSheet.out.filter((text) => text === 'Broken link').length, 2);
assert.ok(has(goneSheet.out, /^archive\.org · the file is gone \(HTTP 403\)$/) && has(goneSheet.out, /^archive\.org · the file is gone \(HTTP 401\)$/));
assert.ok(!goneSheet.out.includes('Recommended'), 'a broken link is not recommended');
assert.ok(has(goneSheet.out, /^Check link health$/), 'and a way to ask again');
const goneButton = texts({ type: DownloadButton, props: { game: { ...fpkgGame, id: 'PPSA09999', releases: goneCatalog }, onDownloaded() {}, onRequestDialog() {} } });
assert.ok(has(goneButton.out, /^The link check couldn't find this game's files$/), goneButton.out.join(' | '));
assert.ok(has(goneButton.out, /^Download$/) && has(goneButton.out, /You can still try the download/), 'and it can still be tried');
// TorBox: no key, the sheet is as before; with one, a TorBox button beside each source it can take (not the
// Archive.org file link the app downloads itself), the web browser list open at once, and "TorBox Instant"
// on a link TorBox holds already.
const debrid = await load('app/state/debrid.js');
const FICHIER = 'https://1fichier.com/?abc123def456';
const browserSources = withReleaseTypes([
  source('w', 'archive.org', 'https://archive.org/download/item/Other.exfat', 'exfat', 'USA Base (v01.00) - Direct'),
  { ...source('h', '1fichier.com', FICHIER, 'binary', 'USA 10.xx Base - 1fichier'), browserUrl: FICHIER, requiresBrowser: true, sizeBytes: null },
  { ...source('r', 'rapidgator.net', 'https://rapidgator.net/file/abc', 'binary', 'USA 10.xx Base - Rapidgator'), browserUrl: 'https://rapidgator.net/file/abc', requiresBrowser: true, sizeBytes: null },
], 'ps5');
const sheet = (onDebrid) => texts({ type: SourcePicker, props: { title: 'Hosted Game', releases: browserSources, selected: 0, submit() {}, onDebrid, current: 'PPSA05555', onClose() {}, checkLinks: async () => {} } }).out;
debrid.setTorBoxKey('');
const plainSheet = sheet(() => {});
assert.ok(!plainSheet.includes('TorBox'), 'no key, no TorBox');
assert.ok(has(plainSheet, /^Show 2 web browser sources$/), 'browser sources folded as before');
debrid.setTorBoxKey('0123abcd-4567-89ef-0123-456789abcdef');
debrid.setTorBoxClient({ hosters: async () => [{ name: '1Fichier', domains: ['1fichier.com'], working: true }, { name: 'Rapidgator', domains: ['rapidgator.net'], working: true }], checkCachedLinks: async () => new Set([FICHIER]) });
await debrid.askTorBoxInstant([FICHIER, 'https://rapidgator.net/file/abc'], () => () => {});
const torSheet = sheet(() => {});
console.log(`--- source list with TorBox\n${torSheet.join('\n')}`);
assert.equal(torSheet.filter((text) => text === 'TorBox').length, 2, 'one per browser-only source, none on the file link');
assert.ok(!has(torSheet, /^Show \d+ web browser source/), 'shown at once');
assert.deepEqual(rowBadges(torSheet, '1fichier.com'), ['Rarely works here', 'TorBox Instant'], 'its captures fail on the console; TorBox holds it');
assert.deepEqual(rowBadges(torSheet, 'rapidgator.net'), ['Rarely works here'], 'not held: no Instant badge');
// 0.5.1: a magnet link has a Torrents section of its own. With a TorBox key the row is the debrid download itself
// (no button beside it) and "TorBox Instant" marks a torrent TorBox holds; without a key it is greyed, the note
// says what to add, and the download button says why.
const MAGNET = 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=Game.exfat';
const torrentSources = withReleaseTypes([
  source('w2', 'archive.org', 'https://archive.org/download/item/Other.exfat', 'exfat', 'USA Base (v01.00) - Direct'),
  { ...source('m', 'Torrent', MAGNET, 'exfat', 'USA'), filename: 'Game.exfat', sizeBytes: 50e9 },
], 'ps5');
const torrentSheet = (onDebrid) => texts({ type: SourcePicker, props: { title: 'Seeded Game', releases: torrentSources, selected: 0, submit() {}, onDebrid, current: 'PPSA06666', onClose() {}, checkLinks: async () => {} } }).out;
debrid.setTorBoxClient({ hosters: async () => [], checkCachedLinks: async () => new Set([MAGNET]) });
await debrid.askTorBoxInstant([MAGNET], () => () => {});
const keyedTorrent = torrentSheet(() => {});
console.log(`--- source list with a torrent (TorBox key set)\n${keyedTorrent.join('\n')}`);
assert.ok(has(keyedTorrent, /^Torrents · 1$/), 'its own section');
assert.ok(has(keyedTorrent, /^Through your debrid service/), 'what happens');
assert.deepEqual(rowBadges(keyedTorrent, 'Torrent'), ['.exfat Image', '13.60 Ready', 'TorBox Instant']);
assert.equal(keyedTorrent.filter((text) => text === 'TorBox').length, 0, 'no button beside a torrent: the row is the debrid download');
debrid.setTorBoxKey('');
const plainTorrent = torrentSheet(() => {});
assert.ok(has(plainTorrent, /^Torrents · 1$/) && has(plainTorrent, /^Needs TorBox or AllDebrid/), 'listed, with what to add');
assert.ok(!plainTorrent.includes('TorBox Instant'));
const torrentButton = texts({ type: DownloadButton, props: { game: { id: 'PPSA06666', titleId: 'PPSA06666', title: 'Seeded Game', platform: 'ps5', releases: [torrentSources[1]] }, onDownloaded() {}, onRequestDialog() {} } }).out;
assert.ok(has(torrentButton, /^This source is a torrent$/) && has(torrentButton, /^Add a TorBox or AllDebrid API key/), torrentButton.join(' | '));
debrid.setTorBoxKey('0123abcd-4567-89ef-0123-456789abcdef');
// The download button on a TorBox download: its line says so, and it is the game's own job on reopening.
const variant = debrid.debridSource(browserSources[1]);
__fake.jobs = [];
const torButton = texts({ type: DownloadButton, props: { game: { id: 'PPSA05555', titleId: 'PPSA05555', title: 'Hosted Game', platform: 'ps5', releases: browserSources }, onDownloaded() {}, onRequestDialog() {} } });
assert.ok(torButton.rendered > 0);
assert.match(describeSourceOf(variant), /^1fichier\.com · via TorBox/);
debrid.setTorBoxKey('');
debrid.setTorBoxClient(null);
// Tips under the button, only when they matter: backport files, a DLC, a browser host's page.
const tipFor = (release) => texts({ type: DownloadButton, props: { game: { id: 'PPSA07777', titleId: 'PPSA07777', title: 'Tip Game', platform: 'ps5', releases: [release] }, onDownloaded() {}, onRequestDialog() {} } }).out;
const tipBase = { id: 't', provider: 'cdn.example.com', url: 'https://cdn.example.com/Game.exfat', format: 'exfat', filename: 'Game.exfat', sizeBytes: 30e9 };
assert.ok(tipFor({ ...tipBase, label: 'USA BackPort Files', url: 'https://cdn.example.com/Game_BackPort_Files.rar', format: 'rar' }).includes('Backport files only, not the full game'));
assert.ok(tipFor({ ...tipBase, label: 'USA DLC Pack' }).includes('This is a DLC, not the game'));
const vikingTip = tipFor({ ...tipBase, provider: 'VikingFile', url: 'https://vikingfile.com/f/abcdefghij', browserUrl: 'https://vikingfile.com/f/abcdefghij', requiresBrowser: true, format: 'binary' });
assert.ok(vikingTip.includes("VikingFile opens in the console's browser") && vikingTip.some((text) => /catches the file link and starts the download/.test(text)), vikingTip.join(' | '));
assert.ok(!tipFor(tipBase).some((text) => /^(Backport files only|This is a DLC|Labelled for firmware)|opens in the console's browser/.test(text)), 'a plain file link: no tip');
const hardTip = tipFor({ ...tipBase, provider: 'datavaults.co', url: 'https://datavaults.co/abc123def456', browserUrl: 'https://datavaults.co/abc123def456', requiresBrowser: true, format: 'binary' });
assert.ok(hardTip.includes('datavaults.co rarely works on the console'), 'a host that fails here: the warning, not the tip');
// The browser capture's dialog in each state: what to do on the page, a file that names no game, and the
// fallback to typing the link once a capture failed.
const { BrowserCaptureDialog } = await load('app/downloads/BrowserCaptureDialog.jsx');
const capture = (fields) => texts({ type: BrowserCaptureDialog, props: { job: { id: 'j', title: 'Hosted Game', ...fields } } }).out;
assert.ok(capture({ captureState: 'capturing', captureMode: 'link' }).includes("Pass the page's check, then wait"));
assert.ok(capture({ captureState: 'capturing' }).includes('VikingFile check'));
const confirmText = capture({ captureState: 'confirm', captureFile: { name: 'x9.rar', bytes: 7e9 } });
assert.ok(confirmText.includes('Is this the right file?') && confirmText.some((text) => text.startsWith('x9.rar · ')));
assert.ok(capture({ captureState: 'failed', captureError: 'Captured link does not match the selected file.' }).some((text) => /^The link wasn't caught: Captured link does not match/.test(text)));
console.log('OK: source list and download button with release types and link health');
