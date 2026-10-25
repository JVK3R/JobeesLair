// Renders the update dialog and the header badge as the PS5 shows them for one install state
// (UPDATE_STATE: ready | paused | failed | none | desktop), with auto-update.json and update-check.json as a
// console would have them. Run: npm run test:render
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.screen = { width: 1920, height: 1080 };
const repo = process.env.JL_REPO || fileURLToPath(new URL('../..', import.meta.url));
const which = process.env.UPDATE_STATE ?? 'ready';
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const en = (await load('app/i18n/locales/en.json')).default;
(await load('app/i18n/core.js')).configure(() => en, en);
const { VERSION } = await load('app/version.js');
// The fake release is 0.5.3, past this build's 0.5.2, so it counts as an update.

const staging = '/mnt/usb0/JobeesLair/update_staging/0.5.3';
const asset = (name, size) => ({ url: `https://github.com/JVK3R/JobeesLair/releases/download/v0.5.3/${name}`, size, sha256: 'a'.repeat(64) });
const latest = { version: '0.5.3', url: 'https://github.com/JVK3R/JobeesLair/releases/tag/v0.5.3', notes: 'Fixes.', published: '', assets: which === 'none' ? null : { image: asset('JobeesLair.exfat', 466616320), zip: asset('update.zip', 21421243) } };
const saved = {
  ready: { phase: 'ready', version: '0.5.3', staging, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: latest.assets?.image },
  paused: { phase: 'downloading', version: '0.5.3', staging, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: latest.assets?.image },
  failed: { phase: 'armed', version: '0.5.3', staging, target: '/mnt/usb0/homebrew/JobeesLair.exfat', image: latest.assets?.image },
}[which] ?? {};
const files = new Map([
  ['/download0/JobeesLair/update-check.json', JSON.stringify({ checkedAt: Date.now(), latest })],
  ['/download0/JobeesLair/auto-update.json', JSON.stringify(saved)],
  ['/data/JobeesLair/update/result.txt', which === 'failed' ? 'outcome=rolledback\nversion=0.5.3\nreason=the new version closed before it finished starting\n' : null],
]);
const sizes = new Map([[`${staging}/JobeesLair.exfat.staged`, 466616320]]);
const writes = [];
const fs = {
  exists: (p) => files.get(p) != null || sizes.has(p),
  stat: (p) => sizes.has(p) ? { isFile: true, size: sizes.get(p) } : files.get(p) != null ? { isFile: true, size: files.get(p).length } : null,
  readFile: (p) => { if (files.get(p) == null) throw new Error(`ENOENT ${p}`); return files.get(p); },
  readDir: () => [], writeFile: (p, text) => writes.push([p, text]), mkdir() {}, rename() {}, remove: (p) => files.delete(p), removeAsync: async () => {},
};
globalThis.__fake = { os: which === 'desktop' ? 'desktop' : 'ps5', fs, arms: [], exits: [], jobs: [], focused: false,
  queue: { snapshot: () => [], subscribe: () => () => {}, lendNetwork: () => null, transferring: () => false },
  drives: { roots: ['/data'], ready: true, usage: {} } };

const update = await load('app/state/update.js');
const stop = update.startUpdateChecks();
stop();
update.openUpdateDialog();

const texts = [];
let rendered = 0;
function walk(node) {
  if (node == null || typeof node !== 'object') return;
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
  if (props.label) texts.push(`[${props.label}]`);
  walk(props.children);
}
const { UpdateDialog } = await load('app/ui/UpdateDialog.jsx');
walk({ type: UpdateDialog, props: {} });
console.log(`--- update dialog (${which})\n${texts.join('\n')}`);
const has = (pattern) => texts.some((text) => pattern.test(text));
if (which === 'ready') {
  assert.ok(has(/^Update ready – Restart app to apply$/), 'the ready badge');
  assert.ok(has(/^Restart to apply$/) && has(/^View release$/));
  assert.ok(has(/the new version takes this one's place/));
  assert.ok(writes.some(([p, text]) => p === '/data/JobeesLair/update/booted.txt.tmp' && text === `${VERSION}\n`), 'this build said it started');
} else if (which === 'paused') {
  assert.ok(has(/^Download and install$/) && has(/download stopped when Jobee'sLair closed/));
} else if (which === 'failed') {
  assert.ok(has(/^Try again$/) && has(/did not start, so the previous version was put back: the new version closed before it finished starting/));
} else if (which === 'none') {
  assert.ok(!has(/^Download and install$/), 'a release without checkable files installs by hand only');
  assert.ok(has(/^Copy the new JobeesLair\.exfat over the old one/));
} else {
  assert.ok(!has(/^Download and install$/) && has(/^Copy the new JobeesLair\.exfat over the old one/), 'not on a PS5: by hand');
}
console.log(`\nOK: ${rendered} components rendered (${which})`);
