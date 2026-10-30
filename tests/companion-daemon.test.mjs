// The companion's helper for while the app is closed (app/native/companion_daemon.c), built for the desktop
// with -DCOMPANION_HOST_TEST and run for real: the PIN, the port it lets go while the app runs, a launch, a
// payload sent to a stand-in loader, new settings handed to the running one, and switching it off.
// Needs a C compiler (cc); skipped where there is none (Windows without one). Run: npm test
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const compiler = process.platform === 'win32' ? null : ['cc', 'gcc', 'clang'].find((name) => spawnSync(name, ['--version']).status === 0);
const skip = compiler ? false : 'no C compiler';

const dir = mkdtempSync(path.join(os.tmpdir(), 'jl-companion-'));
const binary = path.join(dir, 'companion-daemon');
const running = path.join(dir, 'running');
const payloads = path.join(dir, 'payloads');
const queue = path.join(dir, 'downloads.json');
// A test gives up after this rather than wait forever on a helper or a connection.
const timeout = 30000;
// Every helper started here, killed when the file ends whatever happened: one left running keeps node from exiting
// and the runner waits on it for good (the v0.5.3 tag's CI run, cancelled after 15 minutes).
const children = new Set();
after(() => {
  for (const child of children) child.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
});
// A port for the helper to take. Another test file can take it first; the test's own servers use listening().
const freePort = () => new Promise((resolve) => {
  const server = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});
// Starts one of the test's own servers on a port the system picks; resolves with the port.
const listening = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Starts one with the request lines; resolves with its first answer line and the process.
function start(env, lines) {
  const child = spawn(binary, [], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'inherit'] });
  children.add(child);
  child.on('exit', () => children.delete(child));
  child.stdin.end(`${lines.join('\n')}\n`);
  return new Promise((resolve) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('\n')) resolve({ answer: out.split('\n')[0], child });
    });
    child.on('exit', () => resolve({ answer: out.split('\n')[0], child }));
    child.on('error', () => resolve({ answer: '', child }));
  });
}
// Built once for both tests; each asserts it built.
let built = null;
const build = () => built ??= spawnSync(compiler, ['-std=gnu11', '-O2', '-Wall', '-Wextra', '-Werror', '-DCOMPANION_HOST_TEST', '-o', binary, path.join(repo, 'app/native/companion_daemon.c')], { encoding: 'utf8' });
async function http(port, method, route, { body, cookie, jbh = true } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: { ...(jbh && { 'X-JBH': '1' }), ...(cookie && { cookie }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, cookie: response.headers.get('set-cookie'), text: await response.text() };
}
const refused = (port) => fetch(`http://127.0.0.1:${port}/`).then(() => false, () => true);

test('the closed-app companion signs phones in, launches the app, gives the port up while it runs and runs payloads', { skip, timeout }, async (t) => {
  assert.equal(build().status, 0, build().stderr);
  mkdirSync(path.join(payloads, 'owner__tool'), { recursive: true });
  writeFileSync(path.join(payloads, 'owner__tool', 'tool.elf'), '\x7fELF-payload-bytes');
  writeFileSync(path.join(payloads, 'index.json'), JSON.stringify({ apps: [{ name: 'Tool', run: path.join(payloads, 'owner__tool', 'tool.elf') }] }));
  writeFileSync(queue, JSON.stringify({ version: 1, jobs: [{ id: 'g/1', title: 'A Game', state: 'paused', written: 5, total: 10 }] }));
  const [web, control] = [await freePort(), await freePort()];
  const received = [];
  const loader = net.createServer((socket) => {
    const chunks = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => received.push(Buffer.concat(chunks).toString()));
  });
  const loaderPort = await listening(loader);
  t.after(() => loader.close());
  const env = { COMPANION_TEST_RUNNING: running, COMPANION_TEST_CONTROL: String(control), COMPANION_TEST_LOADER: String(loaderPort) };
  const SESSION = 'abcdefghijklmnopqrstuvwxyz';
  const lines = (pin, session = SESSION) => ['CMP2', 'PPSA99471', String(web), pin, payloads, queue, session];
  const { answer, child } = await start(env, lines('482913'));
  t.after(() => child.kill());
  assert.equal(answer, 'ready');
  assert.equal(readFileSync(path.join(payloads, 'helper.txt'), 'utf8'), 'ready\n', 'the answer is also in helper.txt, which the app reads');
  await wait(300);

  const page = await http(web, 'GET', '/', { jbh: false });
  assert.equal(page.status, 200);
  assert.match(page.text, /Jobee'sLair is closed/);
  const refusal = await http(web, 'GET', '/api/queue');
  assert.equal(refusal.status, 401, 'nothing without a session');
  assert.equal(JSON.parse(refusal.text).app, 'closed', 'every refusal says the app is closed, so the app page reloads');
  assert.equal((await http(web, 'GET', '/api/queue', { cookie: 'jbh=zyxwvutsrqponmlkjihgfedcba' })).status, 401, 'another cookie is refused');
  assert.equal((await http(web, 'POST', '/auth', { body: { pin: '482913' }, jbh: false })).status, 403, 'X-JBH is required');
  const wrong = await http(web, 'POST', '/auth', { body: { pin: '111112' } });
  assert.equal(wrong.status, 401);
  const signedIn = await http(web, 'POST', '/auth', { body: { pin: '482913' } });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.cookie, `jbh=${SESSION}; Path=/; HttpOnly; SameSite=Strict`, 'the app\'s own cookie, so the app takes it too');
  // A phone signed in on the app's page carries that cookie already: no PIN when the helper takes over.
  const cookie = `other=1; jbh=${SESSION}`;
  assert.deepEqual(JSON.parse((await http(web, 'GET', '/api/status', { cookie })).text), { app: 'closed', title: 'PPSA99471' });
  const unknown = await http(web, 'GET', '/api/dashboard', { cookie });
  assert.equal(unknown.status, 404);
  assert.equal(JSON.parse(unknown.text).app, 'closed', 'the app page\'s own requests learn the app is closed');
  assert.equal(JSON.parse((await http(web, 'GET', '/api/queue', { cookie })).text).jobs[0].title, 'A Game');
  assert.equal(JSON.parse((await http(web, 'GET', '/api/payloads', { cookie })).text).apps[0].name, 'Tool');

  // Only a payload inside the payload folder runs.
  assert.equal((await http(web, 'POST', '/api/run', { cookie, body: { path: '/etc/passwd' } })).status, 400);
  assert.equal((await http(web, 'POST', '/api/run', { cookie, body: { path: `${payloads}/../x.elf` } })).status, 400);
  assert.equal((await http(web, 'POST', '/api/run', { cookie, body: { path: path.join(payloads, 'owner__tool', 'tool.elf') } })).status, 200);
  await wait(200);
  assert.deepEqual(received, ['\x7fELF-payload-bytes']);

  // Launching starts the app, and the port is let go while it runs, then taken again once it closes.
  assert.equal((await http(web, 'POST', '/api/launch', { cookie })).status, 200);
  assert.ok(existsSync(running));
  await wait(1200);
  assert.ok(await refused(web), 'the app has the port while it runs');
  rmSync(running);
  await wait(2800);
  assert.equal((await http(web, 'GET', '/', { jbh: false })).status, 200, 'back once the app closed');

  // Wrong PINs: three free, then refused for a moment without stalling anything else.
  for (let i = 0; i < 3; i++) assert.equal((await http(web, 'POST', '/auth', { body: { pin: '111112' } })).status, 401);
  assert.equal((await http(web, 'POST', '/auth', { body: { pin: '111112' } })).status, 401);
  const throttled = await http(web, 'POST', '/auth', { body: { pin: '482913' } });
  assert.equal(throttled.status, 429);
  assert.ok(JSON.parse(throttled.text).retryAfter >= 1);
  assert.equal((await http(web, 'GET', '/api/status', { cookie })).status, 200, 'signed-in phones carry on');

  // A second one hands its settings over: a new PIN and session sign the old session out, and clear the wait.
  const second = await start(env, lines('630417', 'newsessionnewsession2345'));
  assert.equal(second.answer, 'updated');
  await wait(200);
  assert.equal((await http(web, 'GET', '/api/status', { cookie })).status, 401);
  assert.equal((await http(web, 'GET', '/api/status', { cookie: 'jbh=newsessionnewsession2345' })).status, 200);
  assert.equal((await http(web, 'POST', '/auth', { body: { pin: '630417' } })).status, 200);

  // Switching it off stops the one running.
  const off = await start(env, lines('-'));
  assert.equal(off.answer, 'stopped');
  await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.on('exit', resolve)));
  assert.ok(await refused(web));
});

test('a helper from 0.5.0 Pre Release 1 is told to stop, and the new one takes its place', { skip, timeout }, async (t) => {
  // The old one reads only CMP1: it answers nothing to CMP2, and stops on a CMP1 with the PIN "-".
  assert.equal(build().status, 0, build().stderr);
  const web = await freePort();
  const heard = [];
  const old = net.createServer((socket) => {
    let text = '';
    socket.on('data', (chunk) => {
      text += chunk;
      if (text.startsWith('CMP2')) return socket.end();
      if (text.split('\n').length > 6) {
        heard.push(text);
        socket.end('stopped\n');
        old.close();
      }
    });
  });
  const control = await listening(old);
  t.after(() => { if (old.listening) old.close(); });
  const env = { COMPANION_TEST_RUNNING: path.join(dir, 'never'), COMPANION_TEST_CONTROL: String(control) };
  const { answer, child } = await start(env, ['CMP2', 'PPSA99471', String(web), '482913', payloads, queue, '-']);
  t.after(() => child.kill());
  assert.equal(answer, 'ready');
  assert.equal(heard.length, 1);
  assert.equal(heard[0].split('\n')[0], 'CMP1');
  assert.equal(heard[0].split('\n')[3], '-', 'told to stop');
});

// 0.5.2: what the app's own server already did. Sends `text` on a raw connection, or `trickle` one byte every `every`
// ms, and resolves with what came back and how long the connection stayed open.
function raw(port, { text = '', trickle = '', every = 0 } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect(port, '127.0.0.1');
    let answer = '', timer = null;
    socket.on('data', (chunk) => { answer += chunk; });
    socket.on('error', () => {});
    socket.setTimeout(10000, () => socket.destroy());
    socket.on('close', () => { clearInterval(timer); resolve({ answer, open: Date.now() - started }); });
    socket.on('connect', () => {
      if (text) socket.write(text);
      let at = 0;
      if (trickle) timer = setInterval(() => { if (at < trickle.length && !socket.destroyed) socket.write(trickle[at++]); }, every);
    });
  });
}

test('the helper answers only to the console by its IP address, and cuts off a request that trickles in', { skip, timeout }, async (t) => {
  assert.equal(build().status, 0, build().stderr);
  const [web, control] = [await freePort(), await freePort()];
  const env = { COMPANION_TEST_RUNNING: running, COMPANION_TEST_CONTROL: String(control), COMPANION_TEST_LOADER: '1', COMPANION_TEST_REQUEST_S: '2' };
  const { answer, child } = await start(env, ['CMP2', 'PPSA99471', String(web), '482913', payloads, queue, '-']);
  t.after(() => child.kill());
  assert.equal(answer, 'ready');
  await wait(300);
  const get = (host) => raw(web, { text: `GET / HTTP/1.1\r\nHost: ${host}\r\n\r\n` }).then((reply) => reply.answer);
  const named = await get('jobees.example:80');
  assert.match(named, /^HTTP\/1\.1 403 /, 'a domain name is refused: a web page could reach the helper through DNS rebinding');
  assert.match(named, /by its IP address/);
  for (const host of ['127.0.0.1', `127.0.0.1:${web}`, 'localhost', `LOCALHOST:${web}`]) assert.match(await get(host), /^HTTP\/1\.1 200 /, host);
  for (const host of ['127.0.0.1.5', '256.1.1.1', '1.2.3', '127.0.0.1:', '127.0.0.1:123456', '[::1]']) assert.match(await get(host), /^HTTP\/1\.1 403 /, host);
  const slow = await raw(web, { trickle: `GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Pad: ${'x'.repeat(40)}\r\n\r\n`, every: 250 });
  assert.match(slow.answer, /^HTTP\/1\.1 400 /, 'cut off');
  assert.ok(slow.open < 4500, `cut off after ${slow.open} ms, not once the client was done`);
  assert.match(await get('127.0.0.1'), /^HTTP\/1\.1 200 /, 'and the next phone is served at once');
});
