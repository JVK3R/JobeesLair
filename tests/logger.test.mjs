// The debug log (services/logger.js): batched writes, size cap with one older file, repeats collapsed, nothing
// secret written, the console.log tee, and a failing drive never reaching the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { createLogger, redact } = await load('app/services/logger.js');

// A file system that keeps appended text, and a clock and timer the test drives.
function world({ maxBytes = 200, failWrites = false } = {}) {
  const files = new Map();
  const timers = [];
  const sink = [];
  let clock = Date.UTC(2026, 9, 17, 22, 5, 9, 42);
  const fs = {
    exists: (p) => files.has(p), mkdir() {}, stat: (p) => files.has(p) ? { size: files.get(p).length } : null,
    readFile: (p) => files.get(p), remove: (p) => files.delete(p),
    rename: (a, b) => { files.set(b, files.get(a)); files.delete(a); },
    appendFile: (p, text) => { if (failWrites) throw new Error('read-only drive'); files.set(p, (files.get(p) ?? '') + text); },
  };
  const logger = createLogger({ fs, dir: '/data/JobeesLair/logs', now: () => clock, timer: (fn) => timers.push(fn) && timers.length, clear() {}, maxBytes, sink: (m) => sink.push(m) });
  return { files, timers, sink, logger, advance: (ms) => { clock += ms; } };
}
const FILE = '/data/JobeesLair/logs/jobeeslair.log';

test('lines are timed, levelled and batched: nothing is written until the flush, an error at once', () => {
  const { files, logger, timers } = world({ maxBytes: 1e6 });
  logger.log('capture', 'armed');
  logger.log('torbox', 'GET /user/me -> HTTP 200 in 120 ms');
  assert.equal(files.has(FILE), false, 'batched, not written line by line');
  assert.equal(timers.length, 1, 'one flush scheduled for the batch');
  logger.flush();
  assert.equal(files.get(FILE), '[22:05:09.042] INFO  capture armed\n[22:05:09.042] INFO  torbox GET /user/me -> HTTP 200 in 120 ms\n');
  logger.error('queue', 'disk full');
  assert.match(files.get(FILE), /ERROR queue disk full\n$/, 'an error does not wait');
});

test('the same line repeated is written once with a count', () => {
  const { files, logger } = world({ maxBytes: 1e6 });
  for (let i = 0; i < 5; i++) logger.log('queue', 'tick');
  logger.log('queue', 'done');
  logger.flush();
  assert.equal(files.get(FILE).split('\n').filter(Boolean).length, 3);
  assert.match(files.get(FILE), /the line above, 4 more times/);
});

test('past the cap the file becomes jobeeslair.1.log and one older file is kept', () => {
  const { files, logger } = world({ maxBytes: 120 });
  for (let i = 0; i < 12; i++) { logger.log('queue', `line number ${i} padded padded padded`); logger.flush(); }
  assert.ok(files.has('/data/JobeesLair/logs/jobeeslair.1.log'));
  assert.ok(files.get(FILE).length < 240 && files.get('/data/JobeesLair/logs/jobeeslair.1.log').length < 240, 'neither grows without end');
  assert.match(files.get(FILE), /line number 11/, 'the newest is in the current file');
  assert.equal([...files.keys()].length, 2);
});

test('nothing secret reaches the file: query strings, tokens, keys, e-mail, and registered values', () => {
  const { files, logger } = world({ maxBytes: 1e6 });
  logger.addSecret('my-torbox-key-0123456789abcdef');
  logger.log('torbox', 'GET https://api.torbox.app/v1/api/torrents/requestdl?token=SECRETTOKEN123&torrent_id=4 failed');
  logger.log('torbox', 'sent Authorization: Bearer abcDEF123456789xyz');
  logger.log('torbox', 'the key my-torbox-key-0123456789abcdef was refused');
  logger.log('capture', 'link captured https://cdn.example.com/f/Game.exfat?sig=abcdef0123456789&exp=99');
  logger.log('app', 'owner someone@example.com apikey=0123456789abcdef password: hunter2hunter2');
  logger.log('queue', 'job 123e4567-e89b-12d3-a456-426614174000 started');
  logger.flush();
  const written = files.get(FILE);
  for (const leak of ['SECRETTOKEN123', 'abcDEF123456789xyz', 'my-torbox-key', 'sig=abcdef', 'someone@example.com', '0123456789abcdef', 'hunter2', '123e4567']) assert.ok(!written.includes(leak), `${leak} written`);
  assert.match(written, /api\.torbox\.app\/v1\/api\/torrents\/requestdl\?…/, 'the path stays, the query goes');
  assert.match(written, /cdn\.example\.com\/f\/Game\.exfat\?…/);
});

test('a drive that refuses the write stops the log, says so once and never throws into the app', () => {
  const { logger, sink } = world({ failWrites: true });
  assert.doesNotThrow(() => { logger.log('queue', 'a'); logger.flush(); logger.log('queue', 'b'); logger.flush(); });
  assert.equal(logger.stopped, true);
  assert.equal(sink.length, 1);
  assert.match(sink[0], /the log file could not be written: read-only drive/);
});

test('long lines are cut, line breaks flattened, errors told by their message', () => {
  const { files, logger } = world({ maxBytes: 1e6 });
  logger.log('app', `first\nsecond ${'x'.repeat(2000)}`);
  logger.log('app', new Error('boom'));
  logger.flush();
  const lines = files.get(FILE).split('\n').filter(Boolean);
  assert.ok(lines[0].length < 800 && lines[0].includes('first ↵ second'));
  assert.match(lines[1], /boom/);
  assert.equal(redact('plain text'), 'plain text');
});
