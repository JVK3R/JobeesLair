// Renders the beta 4 screens once each, every function component and style function called, against a
// library with games in every state (moving, a stopped move, won't start, kept, on USB, untracked), play
// time, ShadowMount's health and a Make Room run. Fails on any exception and prints what the screens say.
// Run: npm run test:render
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.screen = { width: 1920, height: 1080 };
const repo = process.env.JL_REPO || fileURLToPath(new URL('../..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const en = (await load('app/i18n/locales/en.json')).default;
(await load('app/i18n/core.js')).configure(() => en, en);
const { games } = await load('app/data/catalog.js');
const { getGame } = await load('app/state/catalog.js');
const picks = games.slice(0, 60).map((game) => getGame(game.id)).filter(Boolean).slice(0, 6);
assert.equal(picks.length, 6, 'six catalog games');
const GB = 1e9;
const now = Date.now();

const nodes = new Map();
const file = (p, size) => nodes.set(p, { size });
const dir = (p) => nodes.set(p, { dir: true });
for (const p of ['/data', '/data/homebrew', '/data/homebrew/backports', '/data/downloads', '/data/downloads/images', '/mnt/usb0', '/mnt/usb0/homebrew']) dir(p);
file('/data/homebrew/FTP Game PPSA05555.exfat', 12 * GB);
dir('/data/homebrew/backports/PPSA07777');
file('/data/downloads/images/Old.exfat.part', 3 * GB);
const fs = {
  exists: (p) => nodes.has(p),
  stat: (p) => nodes.has(p) ? { name: p.slice(p.lastIndexOf('/') + 1), isDirectory: !!nodes.get(p).dir, isFile: !nodes.get(p).dir, size: nodes.get(p).size ?? 0, modified: now - 40 * 864e5, device: '1', inode: '2' } : null,
  readDir: (p) => {
    if (!nodes.get(p)?.dir) throw new Error(`ENOENT ${p}`);
    return [...nodes.keys()].filter((k) => k !== p && k.slice(0, k.lastIndexOf('/')) === p).map(fs.stat);
  },
  readFile: () => { throw new Error('ENOENT'); },
  writeFile() {}, mkdir() {}, rename() {}, remove() {},
  removeAsync: async () => {},
  diskUsage: () => ({ total: 667 * GB, free: 40 * GB }),
  diskUsageAsync: async () => ({ total: 667 * GB, free: 40 * GB }),
};
const artifact = (root, name) => ({ destination: `${root}/homebrew/${name}.exfat`, images: [`${root}/homebrew/${name}.exfat`], nextAction: 'shadowmount' });
const job = (game, state, extra = {}) => ({ id: `${game.id}/r`, gameId: game.id, titleId: game.titleId || game.id, title: game.title, role: 'game', release: { id: 'r', url: 'https://example.com' }, root: '/data', artifact: artifact(extra.root ?? '/data', game.id), state, written: 20 * GB, total: 20 * GB, error: '', message: '', launch: null, ...extra });
const [a, b, c, d, e, f] = picks;
const jobs = [
  job(a, 'installed', { launch: { outcome: 'played', verdict: 'ran' } }),
  job(b, 'installed', { moving: { to: '/mnt/usb0', total: 20 * GB, written: 9 * GB, at: now } }),
  job(c, 'installed', { moving: { to: '/mnt/usb0', total: 20 * GB, written: 0, interrupted: true, error: 'write the copy: Input/output error' } }),
  job(d, 'downloaded', { root: '/mnt/usb0' }),
  job(e, 'installed', { launch: { outcome: 'wontStart', verdict: 'notStarted' } }),
  job(f, 'downloading', { written: 3 * GB }),
];
const calls = [];
const queue = new Proxy({ snapshot: () => jobs, subscribe: () => () => {}, quietNetwork: (reason, work) => work(), transferring: () => false }, {
  get: (target, key) => key in target ? target[key] : (...args) => (calls.push([key, ...args]), Promise.resolve({ note: null })),
});
globalThis.__fake = { jobs, fs, queue, focused: true, drives: { roots: ['/data', '/mnt/usb0'], ready: true, usage: { '/data': { total: 667 * GB, free: 40 * GB }, '/mnt/usb0': { total: 2000 * GB, free: 900 * GB } } } };

const { createPlaytime, playtimeStore } = await load('app/state/playtime.js');
const memory = { ...fs, exists: () => false };
const store = playtimeStore(() => createPlaytime({ fs: memory, file: '/x/playtime.json', log: () => {} }));
const title = a.titleId || a.id;
store.learn(`[10:00:00]   [GAME] started: ${title} pid=5 app_id=0x1\n[12:00:00]   [GAME] process exited, awaiting same-app handoff: ${title} pid=5 app_id=0x1\n`);
const { createMountMonitor, mountMonitor } = await load('app/state/mount-monitor.js');
const monitor = mountMonitor(() => createMountMonitor({ fs, log: () => {}, client: { background: async (route) => route === 'images' ? { images: [] } : { games: [{ title_id: e.titleId || e.id, path: '/data/homebrew/missing.exfat', source_type: 'image', managed: true }] } } }));
await monitor.refresh();

const texts = [];
let rendered = 0;
function walk(node) {
  if (node == null || typeof node !== 'object') {
    if (typeof node === 'string' && node.trim()) texts.push(node);
    return;
  }
  if (Array.isArray(node)) return node.forEach(walk);
  const { type, props = {} } = node;
  if (typeof props.style === 'function') props.style({ focused: true, pressed: false });
  if (typeof type === 'function') {
    rendered++;
    return walk(type(props));
  }
  if (type === 'Text') {
    const children = [props.children].flat().filter((child) => typeof child === 'string' || typeof child === 'number');
    if (children.length) texts.push(children.join(''));
    return;
  }
  walk(props.children);
}
const screen = async (name, element) => {
  texts.length = 0;
  walk(element);
  console.log(`--- ${name} (${rendered} components so far)\n${[...new Set(texts)].join('\n')}`);
  return [...texts];
};

const { LibraryScreen } = await load('app/library/LibraryScreen.jsx');
const library = await screen('Library', { type: LibraryScreen, props: { onBack() {}, onOpenGame() {} } });
assert.ok(library.some((text) => /Moving to USB drive 1 · 45/.test(text)), 'a moving game shows its progress');
assert.ok(library.some((text) => /Move to USB drive 1 stopped/.test(text)), 'a stopped move says so');
assert.ok(library.some((text) => /2 hours played · Last played (today|yesterday)/.test(text)), 'play time on the tile');
assert.ok(library.some((text) => /ShadowMount can't find its file/.test(text)), "the health check's finding");

const { MakeRoomSheet } = await load('app/library/MakeRoomSheet.jsx');
const sheet = await screen('Make Room (library)', { type: MakeRoomSheet, props: { onClose() {} } });
assert.ok(sheet.includes('Reclaim') && sheet.includes('Move to another drive') && sheet.includes('Delete'));
assert.ok(sheet.some((text) => /Leftover download file/.test(text)));
const asked = await screen('Make Room (for a download)', { type: MakeRoomSheet, props: { target: '/data', need: 120 * GB, then: { game: f, release: { id: 'r', sizeBytes: 80 * GB }, root: '/data' }, onClose() {} } });
assert.ok(asked.some((text) => /needs 80 GB more on Internal storage/.test(text)), asked.join('|'));

const { runner } = await load('app/library/services.js');
const { planRoom, ticked0 } = await load('app/library/make-room.js');
const plan = planRoom({ target: '/data', need: 60 * GB, drives: globalThis.__fake.drives.usage, leftovers: [{ id: 'orphan:x', kind: 'orphan', root: '/data', path: '/data/downloads/images/Old.exfat.part', bytes: 3 * GB, title: 'Old.exfat', action: { type: 'path', path: '/data/downloads/images/Old.exfat.part' } }] });
await runner().run({ plan, ticked: ticked0(plan), entries: new Map() });
const done = await screen('Make Room (finished)', { type: MakeRoomSheet, props: { onClose() {} } });
assert.ok(done.some((text) => /^Freed .* on Internal storage\.$/.test(text)), done.join('|'));
runner().dismiss();

const { GameFacts } = await load('app/game/GameFacts.jsx');
const facts = await screen('Game facts', { type: GameFacts, props: { game: a } });
assert.ok(facts.includes('Play time') && facts.includes('2 hours played') && (facts.includes('Today') || facts.includes('Yesterday')));
const { Settings } = await load('app/ui/Settings.jsx');
const settings = await screen('Settings', { type: Settings, props: { onClose() {} } });
assert.ok(settings.includes('Support development') && settings.includes('Optional. Every feature stays free either way.'), settings.join('|'));
assert.ok(!settings.some((text) => /buymeacoffee/.test(text)), 'the QR code and address show only once the row is opened');
console.log(`\nOK: ${rendered} components rendered without an exception`);
