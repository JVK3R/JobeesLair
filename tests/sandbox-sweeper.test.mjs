import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { startSandboxSweeper } = await import('../app/state/sandbox-sweeper.js');

test('the sandbox sweeper is sent once, on the console only, with its request', async () => {
  const sent = [];
  const send = (path, options) => { sent.push([path, options]); return { ok: true }; };
  startSandboxSweeper({ send, platform: 'desktop', delayMs: 0, log: () => {} });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(sent, [], 'not on the desktop');
  startSandboxSweeper({ send, platform: 'ps5', delayMs: 0, log: () => {} });
  startSandboxSweeper({ send, platform: 'ps5', delayMs: 0, log: () => {} });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(sent.length, 1, 'once per launch');
  assert.equal(sent[0][0], '/app0/sandbox-sweeper.elf');
  assert.match(sent[0][1].request, /^SWP1\nPPSA\d{5}\n$/);
});

test('the sweeper only unmounts aliases, only removes empty folders, and stops if the app opens again', () => {
  const source = readFileSync(new URL('../app/native/sandbox_sweeper.c', import.meta.url), 'utf8');
  assert.match(source, /strcmp\(type, "nullfs"\) && strcmp\(type, "unionfs"\)/);
  assert.doesNotMatch(source, /\bunlink\(|\bremove\(/, 'never deletes a file');
  assert.match(source, /if \(running\(\)\)/);
  const app = JSON.parse(readFileSync(new URL('../app/app.json', import.meta.url), 'utf8'));
  assert.ok(app.payloads.some((p) => p.name === 'sandbox-sweeper.elf' && p.source === 'native/sandbox_sweeper.c'));
});
