// The sandbox sweeper: how the app sends it (app/state/sandbox-sweeper.js), and the payload itself
// (app/native/sandbox_sweeper.c) built for the desktop with -DSWEEPER_HOST_TEST and run for real against a
// stand-in /mnt/sandbox and mount table, in the situations the console showed: folders a crash or a reopen left,
// a close followed by a reopen, an alias that will not unmount. The C tests need a C compiler (cc); they are
// skipped where there is none (Windows without one). Run: npm test
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { startSandboxSweeper } = await import('../app/state/sandbox-sweeper.js');

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const compiler = process.platform === 'win32' ? null : ['cc', 'gcc', 'clang'].find((name) => spawnSync(name, ['--version']).status === 0);
const skip = compiler ? false : 'no C compiler';
const work = mkdtempSync(path.join(os.tmpdir(), 'jl-sweeper-'));
const binary = path.join(work, 'sandbox-sweeper');
after(() => rmSync(work, { recursive: true, force: true }));

let built = null;
const build = () => built ??= spawnSync(compiler, ['-std=gnu11', '-O2', '-Wall', '-Wextra', '-Werror', '-DSWEEPER_HOST_TEST', '-o', binary, path.join(repo, 'app/native/sandbox_sweeper.c')], { encoding: 'utf8' });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, what, ms = 4000) {
  for (const start = Date.now(); Date.now() - start < ms; await wait(10)) if (check()) return;
  assert.fail(`timed out waiting for ${what}`);
}

// A stand-in console: sandbox folders under root, the mount table and "running" under state.
function console_(name) {
  const dir = path.join(work, name);
  const root = path.join(dir, 'sandbox');
  const state = path.join(dir, 'state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  const at = (...parts) => path.join(root, ...parts);
  const table = path.join(state, 'mounts');
  const mounts = () => (existsSync(table) ? readFileSync(table, 'utf8').split('\n').filter(Boolean) : []);
  const setMounts = (lines) => writeFileSync(table, lines.map((line) => `${line}\n`).join(''));
  const mount = (from, on, stuck = false) => setMounts([...mounts(), `nullfs\t${from}\t${on}${stuck ? '\tstuck' : ''}`]);
  const unmountAll = (on) => setMounts(mounts().filter((line) => line.split('\t')[2] !== on));
  // A launch: the folder, its app0 and the console's /data alias.
  const launch = (folder) => {
    mkdirSync(at(folder, 'app0'), { recursive: true });
    mkdirSync(at(folder, 'data'), { recursive: true });
    mount(`/system_ex/app/${folder.split('_')[0]}`, at(folder, 'app0'));
    mount('/user/data', at(folder, 'data'));
    writeFileSync(path.join(state, 'running'), '');
  };
  // A close as the console does it for Jobee'sLair: app0 goes, the /data alias stays behind.
  const close = (folder) => {
    rmSync(path.join(state, 'running'), { force: true });
    unmountAll(at(folder, 'app0'));
    rmdirSync(at(folder, 'app0'));
  };
  const log = () => (existsSync(path.join(state, 'sandbox.log')) ? readFileSync(path.join(state, 'sandbox.log'), 'utf8') : '');
  const start = () => {
    const child = spawn(binary, [], {
      env: { ...process.env, SWEEPER_TEST_ROOT: root, SWEEPER_TEST_STATE: state, SWEEPER_TIME_SCALE: '20' },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    child.stdin.end('SWP1\nPPSA99471\n');
    const exited = new Promise((resolve) => child.on('exit', resolve));
    const answer = new Promise((resolve) => {
      let out = '';
      child.stdout.on('data', (chunk) => {
        out += chunk;
        if (out.includes('\n')) resolve(out.split('\n')[0]);
      });
      child.on('exit', () => resolve(out.split('\n')[0]));
    });
    return { child, answer, exited };
  };
  return { root, at, mounts, mount, launch, close, log, start };
}

test('the sandbox sweeper is sent once, on the console only, with its request', async () => {
  const sent = [];
  const send = (file, options) => { sent.push([file, options]); return { ok: true }; };
  startSandboxSweeper({ send, platform: 'desktop', delayMs: 0, log: () => {} });
  await wait(5);
  assert.deepEqual(sent, [], 'not on the desktop');
  const stop = startSandboxSweeper({ send, platform: 'ps5', delayMs: 0, log: () => {} });
  startSandboxSweeper({ send, platform: 'ps5', delayMs: 0, log: () => {} });
  await wait(5);
  assert.equal(sent.length, 1, 'once per launch');
  assert.equal(sent[0][0], '/app0/sandbox-sweeper.elf');
  assert.match(sent[0][1].request, /^SWP1\nPPSA\d{5}\n$/);
  const app = JSON.parse(readFileSync(new URL('../app/app.json', import.meta.url), 'utf8'));
  assert.ok(app.payloads.some((p) => p.name === 'sandbox-sweeper.elf' && p.source === 'native/sandbox_sweeper.c'));
  stop();
});

// 0.5.3: it went 8 s after the store showed, and three launches closed before that left their folders on the
// console; the quick reopens after them locked the image in ShadowMount+.
test('the sandbox sweeper is sent as the app starts, not from the store', async () => {
  const lines = [];
  const stop = startSandboxSweeper({ send: () => ({ ok: true }), platform: 'ps5', log: (line) => lines.push(line) });
  await wait(20);
  assert.match(lines[0] ?? '', /^sandbox sweeper: waiting for the app to close \(sent in \d+ ms\)$/, 'sent at once');
  stop();
  const source = readFileSync(new URL('../app/index.jsx', import.meta.url), 'utf8');
  const boot = source.indexOf('function Boot()');
  assert.ok(boot > 0 && source.indexOf('startSandboxSweeper()', boot) > boot, 'started by Boot, under the intro');
  assert.equal(source.slice(source.indexOf('function App()'), boot).indexOf('startSandboxSweeper'), -1, 'not by the store');
});

test('the sweeper only unmounts aliases and never deletes a file', () => {
  const source = readFileSync(new URL('../app/native/sandbox_sweeper.c', import.meta.url), 'utf8');
  assert.match(source, /strcmp\(type, "nullfs"\) && strcmp\(type, "unionfs"\)/);
  assert.doesNotMatch(source, /\bunlink(at)?\(|\bremove\(/, 'never deletes a file');
});

test('clears what an earlier launch left as it starts, never the running app\'s folder, then its own as the app closes', { skip }, async (t) => {
  assert.equal(build().status, 0, build().stderr);
  const ps5 = console_('starts');
  // A launch ShadowMount+ lost track of left _005 with the /data alias stacked five times over and an empty font
  // folder; the app runs from _000.
  ps5.launch('PPSA99471_000');
  mkdirSync(ps5.at('PPSA99471_005', 'preinst', 'common', 'font'), { recursive: true });
  mkdirSync(ps5.at('PPSA99471_005', 'data'), { recursive: true });
  for (let i = 0; i < 5; ++i) ps5.mount('/user/data', ps5.at('PPSA99471_005', 'data'));
  // Another title's folder is never looked at.
  mkdirSync(ps5.at('PPSA12345_000', 'data'), { recursive: true });
  ps5.mount('/user/data', ps5.at('PPSA12345_000', 'data'));

  const sweeper = ps5.start();
  t.after(() => sweeper.child.kill());
  assert.equal(await sweeper.answer, 'ready');
  await until(() => !existsSync(ps5.at('PPSA99471_005')), 'the leftover folder to go');
  assert.ok(existsSync(ps5.at('PPSA99471_000', 'app0')), 'the running app\'s folder stays');
  assert.deepEqual(ps5.mounts().map((line) => path.relative(ps5.root, line.split('\t')[2])).sort(),
    ['PPSA12345_000/data', 'PPSA99471_000/app0', 'PPSA99471_000/data'].map((p) => p.split('/').join(path.sep)));

  ps5.close('PPSA99471_000');
  await until(() => !existsSync(ps5.at('PPSA99471_000')), 'the closed app\'s folder to go');
  await sweeper.exited;
  assert.ok(existsSync(ps5.at('PPSA12345_000', 'data')));
  assert.equal(ps5.mounts().length, 1);
  assert.match(ps5.log(), /PPSA99471_005\/data \(nullfs from \/user\/data\): done, 5 stacked/);
  assert.match(ps5.log(), /removed .*PPSA99471_005/);
  assert.match(ps5.log(), /cleared what earlier launches left/);
  assert.match(ps5.log(), /all clear/);
});

test('keeps clearing the closed app\'s folder when the app opens again, and never touches the new launch\'s', { skip }, async (t) => {
  assert.equal(build().status, 0, build().stderr);
  const ps5 = console_('reopen');
  ps5.launch('PPSA99471_001');
  const sweeper = ps5.start();
  t.after(() => sweeper.child.kill());
  assert.equal(await sweeper.answer, 'ready');
  await until(() => ps5.log().includes('waiting for PPSA99471 to close'), 'the sweeper to wait');

  // Closed and opened again a moment later (3 s apart on the console): the new launch gets a new folder.
  ps5.close('PPSA99471_001');
  await wait(60);
  ps5.launch('PPSA99471_002');
  await until(() => !existsSync(ps5.at('PPSA99471_001')), 'the closed app\'s folder to go');
  await sweeper.exited;
  assert.ok(existsSync(ps5.at('PPSA99471_002', 'app0')) && existsSync(ps5.at('PPSA99471_002', 'data')));
  assert.equal(ps5.mounts().filter((line) => line.includes('PPSA99471_002')).length, 2, 'the new launch\'s mounts stay');
  assert.match(ps5.log(), /all clear/);
});

test('never goes into an alias it cannot unmount, never deletes a file, and touches nothing when it cannot tell which folder is the app\'s', { skip }, async (t) => {
  assert.equal(build().status, 0, build().stderr);
  const stuck = console_('stuck');
  stuck.launch('PPSA99471_004');
  // The alias shows /data's own folders; one of them happens to be empty.
  mkdirSync(stuck.at('PPSA99471_003', 'data', 'homebrew'), { recursive: true });
  stuck.mount('/user/data', stuck.at('PPSA99471_003', 'data'), true);
  mkdirSync(stuck.at('PPSA99471_003', 'keep'), { recursive: true });
  writeFileSync(stuck.at('PPSA99471_003', 'keep', 'notes.txt'), 'a file');
  const first = stuck.start();
  t.after(() => first.child.kill());
  assert.equal(await first.answer, 'ready');
  await until(() => stuck.log().includes('could not clear all that earlier launches left'), 'the leftover pass to end');
  assert.ok(existsSync(stuck.at('PPSA99471_003', 'data', 'homebrew')), 'nothing inside the alias is removed');
  assert.ok(existsSync(stuck.at('PPSA99471_003', 'keep', 'notes.txt')), 'files stay');
  assert.ok(existsSync(stuck.at('PPSA99471_004', 'app0')));
  assert.match(stuck.log(), /kept .*PPSA99471_003: .*still mounted/);

  // Two folders and neither has app0 mounted while the app runs: which one is the app's is unclear.
  const unclear = console_('unclear');
  for (const folder of ['PPSA99471_006', 'PPSA99471_007']) {
    mkdirSync(unclear.at(folder, 'data'), { recursive: true });
    unclear.mount('/user/data', unclear.at(folder, 'data'));
  }
  writeFileSync(path.join(path.dirname(unclear.root), 'state', 'running'), '');
  const second = unclear.start();
  t.after(() => second.child.kill());
  assert.equal(await second.answer, 'ready');
  await until(() => unclear.log().includes('in use: left alone'), 'the sweeper to decide');
  assert.equal(unclear.mounts().length, 2);
  assert.ok(existsSync(unclear.at('PPSA99471_006', 'data')) && existsSync(unclear.at('PPSA99471_007', 'data')));
});
