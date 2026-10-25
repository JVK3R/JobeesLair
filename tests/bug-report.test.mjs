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
