// "Report a bug" (0.5.1, app/state/bug-report.js): the relay's address from the build's private file (never a
// Discord webhook), one report per ten minutes, the logs as files with the version and firmware as fields, and a
// sentence when the relay refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { REPORT_GAP_MS, reportRelay, reportWait, sendReport } = await load('app/state/bug-report.js');
const { VERSION_LABEL } = await load('app/version.js');

const RELAY = 'https://jobeeslair-report.example.workers.dev';

test('the relay comes only from the private file, and never a Discord webhook', () => {
  assert.equal(reportRelay(() => JSON.stringify({ reportUrl: RELAY })), RELAY);
  assert.equal(reportRelay(() => JSON.stringify({ reportUrl: RELAY + '/report/' })), RELAY + '/report');
  assert.equal(reportRelay(() => JSON.stringify({ reportUrl: 'https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-abcdefgh' })), null, 'a webhook must not ship');
  assert.equal(reportRelay(() => JSON.stringify({ reportUrl: 'https://ptb.discord.com/api/webhooks/1/x' })), null);
  assert.equal(reportRelay(() => JSON.stringify({ reportUrl: 'http://relay.example/report' })), null, 'https only');
  assert.equal(reportRelay(() => JSON.stringify({ discordWebhook: 'https://discord.com/api/webhooks/1/x' })), null, 'the old key means no button');
  assert.equal(reportRelay(() => { throw new Error('ENOENT'); }), null, 'no file: no button');
});

test('a report carries the logs as files and the facts as fields, and the next waits ten minutes', async () => {
  const sent = [];
  const http = {
    async request(url, options) {
      if (url.includes('127.0.0.1:10101')) return { ok: true, status: 200, json: async () => ({ content: 'SM line 1\nSM line 2' }) };
      sent.push({ url, options });
      return { ok: true, status: 204 };
    },
  };
  await sendReport({ http, relay: RELAY, appLog: () => 'app line', now: 1e12 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, RELAY);
  const body = sent[0].options.body;
  assert.match(sent[0].options.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  assert.ok(body.includes(`name="version"\r\n\r\n${VERSION_LABEL}\r\n`), 'the version as the screens write it');
  assert.match(body, /name="firmware"\r\n\r\n\S+\r\n/);
  assert.match(body, /filename="jobeeslair\.log"[\s\S]*app line/);
  assert.match(body, /filename="shadowmount\.log"[\s\S]*SM line 2/);
  assert.doesNotMatch(body, /payload_json|discord/i, 'the app writes no Discord message of its own');
  assert.equal(reportWait(1e12 + 1000), REPORT_GAP_MS - 1000);
  await assert.rejects(sendReport({ http, relay: RELAY, appLog: () => 'again', now: 1e12 + 1000 }), /another in 10 min/);
  assert.equal(sent.length, 1);
});

test('the relay refusing reads as a sentence; a build without it says where to go instead', async () => {
  const http = { request: async (url) => (url.includes('127.0.0.1') ? { ok: false, status: 404, json: async () => null } : { ok: false, status: 429 }) };
  await assert.rejects(sendReport({ http, relay: RELAY, appLog: () => 'x', now: 5e12 }), /Too many reports/);
  const down = { request: async (url) => (url.includes('127.0.0.1') ? { ok: false, status: 404, json: async () => null } : { ok: false, status: 502 }) };
  await assert.rejects(sendReport({ http: down, relay: RELAY, appLog: () => 'x', now: 7e12 }), /didn't go through \(HTTP 502\)/);
  await assert.rejects(sendReport({ http, relay: null, now: 6e12 }), /aren't set up in this build/);
});

// ---- 0.5.5: the engine's log, a code for the console, and the logs by themselves once the player says yes ----
const { reportCode, startAutoReports } = await load('app/state/bug-report.js');

test("a report carries the engine's log as host.log, blanked, and the console's code; after a crash, the run before's", async () => {
  const sent = [];
  const http = {
    async request(url, options) {
      if (url.includes('127.0.0.1:10101')) return { ok: true, status: 200, json: async () => ({ content: 'SM' }) };
      sent.push(options.body);
      return { ok: true, status: 204 };
    },
  };
  const read = (file) => (file.endsWith('/app.log') ? 'engine line token=SECRET' : file.endsWith('/app.prev.log') ? 'before\n[PS5-REACT] fatal signal 11' : null);
  await sendReport({ http, relay: RELAY, appLog: () => 'app', now: 2e12, read, redact: (text) => text.replace('SECRET', '***'), console: 'ABC234', reason: 'Download failed: X', previous: true, auto: true });
  assert.match(sent[0], /filename="host\.log"[\s\S]*engine line token=\*\*\*/);
  assert.match(sent[0], /filename="host\.prev\.log"[\s\S]*fatal signal/);
  assert.ok(sent[0].includes('name="console"\r\n\r\nABC234\r\n'), 'the code made on this console');
  assert.ok(sent[0].includes('name="reason"\r\n\r\nDownload failed: X\r\n'), 'why it went by itself');
  assert.doesNotMatch(sent[0], /SECRET/);
  assert.equal(reportWait(2e12), 0, 'one that went by itself leaves Report a bug free');
});

test('the report code is six letters and digits, the same each time', () => {
  const code = reportCode();
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.equal(reportCode(), code);
});

// A queue to push snapshots through, and the timers startAutoReports sets, run by hand.
function autoWorld(start) {
  const queueListeners = new Set();
  const choiceListeners = new Set();
  const world = { choice: start, asked: 0, sent: [], timers: [] };
  world.queue = { subscribe: (listener) => (queueListeners.add(listener), () => queueListeners.delete(listener)) };
  world.push = (jobs) => { for (const listener of queueListeners) listener(jobs); };
  world.answer = (yes) => { world.choice = yes; for (const listener of choiceListeners) listener(); };
  world.run = () => { for (const fn of world.timers.splice(0)) fn(); };
  world.stop = startAutoReports(world.queue, {
    send: async (report) => world.sent.push(report),
    choose: () => world.choice,
    ask: () => world.asked++,
    subscribe: (listener) => (choiceListeners.add(listener), () => choiceListeners.delete(listener)),
    relay: () => RELAY,
    read: () => '',
    timer: (fn) => world.timers.push(fn),
    cancel: () => {},
    now: () => 1e13,
  });
  return world;
}

test('the first failure asks before any log goes; yes sends what failed, and a busy server about to retry waits', () => {
  const world = autoWorld(null);
  world.push([]);
  world.push([{ id: 'a', title: 'Game A', state: 'failed', error: 'HTTP 503', retryAt: 1 }]);
  assert.equal(world.asked, 0, 'a download that tries again by itself is not a failure yet');
  world.push([{ id: 'a', title: 'Game A', state: 'failed', error: 'Source unavailable: HTTP 404. Choose another source.' }]);
  assert.equal(world.asked, 1, 'asked at the first failure');
  world.run();
  assert.equal(world.sent.length, 0, 'nothing goes before the answer');
  world.answer(true);
  world.run();
  assert.equal(world.sent.length, 1);
  assert.match(world.sent[0].reason, /^Download failed: Game A: Source unavailable: HTTP 404/);
  assert.equal(world.sent[0].auto, true);
  world.stop();
});

test('no drops what waited and sends nothing after; failures there at launch were reported then', () => {
  const world = autoWorld(null);
  world.push([{ id: 'old', title: 'Old', state: 'failed', error: 'HTTP 404' }]);
  world.push([{ id: 'old', title: 'Old', state: 'failed', error: 'HTTP 404' }, { id: 'b', title: 'Game B', state: 'installer-required', error: 'Packages.install: 0x80990085' }]);
  assert.equal(world.asked, 1);
  world.answer(false);
  world.run();
  world.push([{ id: 'c', title: 'Game C', state: 'failed', error: 'HTTP 410' }]);
  world.run();
  assert.equal(world.sent.length, 0);
  world.stop();
});
