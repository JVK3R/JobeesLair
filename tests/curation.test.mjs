// Which browser-only hosts finish on this console (state/capture-hosts.js) and how the source list ranks
// by it (game/sources.js). Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const en = JSON.parse(readFileSync(path.join(repo, 'app/i18n/locales/en.json'), 'utf8'));
(await load('app/i18n/core.js')).configure(() => en, en);
const { hostKey, hostStanding, recordCapture } = await load('app/state/capture-hosts.js');
const { captureStanding, preferredRelease, describeSource } = await load('app/game/sources.js');
const { sourceKind } = await load('app/state/download-sources.js');

const browser = (id, url, extra = {}) => ({ id, provider: new URL(url).host, url, browserUrl: url, requiresBrowser: true, format: 'binary', filename: `${id}.binary`, label: 'USA Base', ...extra });

test('host keys: one word per host, a LinkVault vault by the mirror it opens', () => {
  assert.equal(hostKey(browser('a', 'https://1fichier.com/?abc')), '1fichier');
  assert.equal(hostKey(browser('a', 'https://www.datanodes.to/abc123def456')), 'datanodes');
  assert.equal(hostKey(browser('a', 'https://vik1ngfile.site/f/abcdefghij')), 'vikingfile');
  assert.equal(hostKey(browser('a', 'https://link-vault.org/c/x#DataNodes')), 'datanodes');
  assert.equal(hostKey(browser('a', 'https://link-vault.org/c/x', { label: 'Dump - Filek' })), 'filekeeper');
});

test("standing: Overdrive's console results to start with, then what happens here", () => {
  const viking = browser('v', 'https://vikingfile.com/f/abcdefghij');
  const fichier = browser('f', 'https://1fichier.com/?abc');
  const fresh = browser('n', 'https://newhost.example/f/1');
  assert.equal(hostStanding(viking), 'works');
  assert.equal(hostStanding(fichier), 'hard');
  assert.equal(hostStanding(fresh), 'unknown');
  recordCapture(fichier, true);
  assert.equal(hostStanding(fichier), 'works', 'a capture finished here outweighs the list');
  for (let i = 0; i < 2; i++) recordCapture(fresh, false);
  assert.equal(hostStanding(fresh), 'unknown', 'two failures: still worth a try');
  recordCapture(fresh, false);
  assert.equal(hostStanding(fresh), 'hard', 'three in a row and none finished');
  recordCapture(fresh, true);
  assert.equal(hostStanding(fresh), 'works', 'one that finishes clears them');
});

test('ranking: a host that fails ranks with broken links, one that works before one untried; other sources are untouched', () => {
  const datavaults = browser('dv', 'https://datavaults.co/abc123def456');
  const untried = browser('ut', 'https://otherhost.example/f/2');
  const datanodes = browser('dn', 'https://datanodes.to/abc123def456');
  const direct = { id: 'ar', provider: 'archive.org', url: 'https://archive.org/download/x/Game.exfat', format: 'exfat', filename: 'Game.exfat' };
  assert.equal(sourceKind(datavaults), 'browser');
  assert.deepEqual([datavaults, untried, datanodes, direct].map(captureStanding), ['hard', 'unknown', 'works', null]);
  const releases = [datavaults, untried, datanodes];
  assert.equal(releases[preferredRelease(releases)].id, 'dn', 'the host whose captures work');
  assert.equal(preferredRelease([datavaults, untried]), 1, 'untried before known to fail');
  assert.equal([direct, datanodes][preferredRelease([direct, datanodes])].id, 'ar', 'a file link still first');
  assert.equal(describeSource(datavaults).group, 'browser', 'still listed, never hidden');
});
