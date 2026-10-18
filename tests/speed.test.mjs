// The download speed limit (state/speed-limit.js): saved in settings.json, handed to the engine in bytes per
// second, and the app's own update exempt. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const core = await import('@ps5-react/core');
const applied = [];
core.Downloads.setRateLimit = (bytes) => applied.push(bytes);
// settings.json in memory, where the stub's FileSystem keeps nothing.
const files = new Map();
Object.assign(core.FileSystem, {
  exists: (p) => files.has(p), readFile: (p) => files.get(p), writeFile: (p, text) => files.set(p, text),
  rename: (a, b) => { files.set(b, files.get(a)); files.delete(a); }, mkdir() {},
});
const SETTINGS = '/download0/JobeesLair/settings.json';

test('a saved limit no longer offered becomes the nearest one; setting one saves and applies it in bytes', async () => {
  files.set(SETTINGS, JSON.stringify({ vibration: true, speedLimit: 50 }));
  const { LIMITS, applySpeedLimit, setSpeedLimit } = await load('app/state/speed-limit.js');
  assert.deepEqual(LIMITS, [0, 25, 10, 5]);
  applySpeedLimit();
  assert.deepEqual(applied, [25 * 1024 ** 2], '50 MB/s is no longer offered: 25');
  setSpeedLimit(10);
  assert.equal(applied.at(-1), 10 * 1024 ** 2);
  assert.deepEqual(JSON.parse(files.get(SETTINGS)), { vibration: true, speedLimit: 10 }, 'the other settings kept');
  setSpeedLimit(7);
  assert.equal(applied.length, 2, 'a value not offered is ignored');
  setSpeedLimit(0);
  assert.equal(applied.at(-1), 0);
  assert.deepEqual(JSON.parse(files.get(SETTINGS)), { vibration: true }, 'no limit: nothing saved');
});

test("the app's own update downloads unlimited", () => {
  const source = readFileSync(path.join(repo, 'app/state/auto-update.js'), 'utf8');
  assert.match(source, /downloads\.enqueue\(\{[^}]*unlimited: true/);
});
