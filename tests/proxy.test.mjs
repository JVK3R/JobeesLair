// The proxy setting (state/proxy.js): what the dialog accepts, what it refuses, and that one address goes
// to settings.json and to the native transport (Http.setProxy, ps5-react ABI v25). Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
globalThis.__stubFiles = new Map();
const { normalizeProxy, proxyHost, proxyNow, setProxy } = await load('app/state/proxy.js');

const SETTINGS = '/download0/JobeesLair/settings.json';
const saved = () => JSON.parse(globalThis.__stubFiles.get(SETTINGS) ?? '{}');

test('a proxy address is accepted as typed, and a bare host:port reads as http', () => {
  assert.equal(normalizeProxy('http://192.168.1.20:7890'), 'http://192.168.1.20:7890');
  assert.equal(normalizeProxy('192.168.1.20:7890'), 'http://192.168.1.20:7890');
  assert.equal(normalizeProxy('HTTPS://Proxy.LAN:8443'), 'https://proxy.lan:8443');
  assert.equal(normalizeProxy('socks5h://10.0.0.2:1080'), 'socks5h://10.0.0.2:1080');
  assert.equal(normalizeProxy('http://[::1]:7890'), 'http://[::1]:7890');
  assert.equal(normalizeProxy('  http://proxy.lan  '), 'http://proxy.lan');
  assert.equal(normalizeProxy(''), '');
  assert.equal(normalizeProxy(null), '');
});

test('basic authentication stays in the address, and only the host:port is shown', () => {
  assert.equal(normalizeProxy('http://me:se%20cret@proxy.lan:3128'), 'http://me:se%20cret@proxy.lan:3128');
  assert.equal(proxyHost('http://me:se%20cret@proxy.lan:3128'), 'proxy.lan:3128');
  assert.equal(proxyHost('socks5h://10.0.0.2:1080'), '10.0.0.2:1080');
  assert.equal(proxyHost('http://[::1]:7890'), '[::1]:7890');
});

test('anything that is not a proxy address is refused with a sentence', () => {
  for (const bad of ['ftp://proxy.lan:21', 'http://', 'http://proxy.lan:70000', 'http://proxy.lan/path', 'http://a b:1', 'socks4://proxy.lan:1080', '@@@'])
    assert.throws(() => normalizeProxy(bad), /proxy address|port must be between/, bad);
});

test('the saved address goes to settings.json and to the native transport; empty turns both off', () => {
  assert.equal(setProxy('192.168.1.20:7890'), 'http://192.168.1.20:7890');
  assert.equal(saved().proxy, 'http://192.168.1.20:7890');
  assert.equal(globalThis.__stubProxy, 'http://192.168.1.20:7890');
  assert.equal(proxyNow(), 'http://192.168.1.20:7890');
  // Everything else the app keeps in settings.json is left alone.
  assert.equal(setProxy(''), '');
  assert.equal('proxy' in saved(), false);
  assert.equal(globalThis.__stubProxy, '');
  assert.equal(proxyNow(), '');
});

test('a stored address the app no longer accepts counts as off', async () => {
  globalThis.__stubFiles.set(SETTINGS, JSON.stringify({ theme: 'dark', proxy: 'ftp://old' }));
  globalThis.__stubFiles.set('/download0/JobeesLair/settings.json.tmp', '');
  const fresh = await import(pathToFileURL(path.join(repo, 'app/state/proxy.js')).href + '?fresh=1');
  assert.equal(fresh.proxyNow(), '');
});
