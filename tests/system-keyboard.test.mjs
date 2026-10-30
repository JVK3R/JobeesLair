// The PS5's own keyboard for typing (0.5.4, app/state/system-keyboard.js), against a stand-in console keyboard and an
// in-memory settings.json (tests/stub-loader.mjs): where it is used, and how it steps aside so a player can always
// type: when it can't open, when it fails, when the system keeps closing it, and after the app stopped with it up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const SETTINGS = '/download0/JobeesLair/settings.json';
let fresh = 0;
// A new launch: the module keeps its choice for the launch.
const launch = () => import(`${pathToFileURL(path.join(repo, 'app/state/system-keyboard.js')).href}?launch=${fresh++}`);
const settings = () => JSON.parse(globalThis.__stubFiles.get(SETTINGS) ?? '{}');
function consoleWith(answers, { available = true } = {}) {
  const opened = [];
  globalThis.__stubFiles = new Map();
  globalThis.__stubKeyboard = {
    available,
    open(options) {
      opened.push({ options, noted: settings().keyboardOpen });
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next === 'reject' ? Promise.reject(new Error('poll failed')) : Promise.resolve(next);
    }
  };
  return opened;
}
test.afterEach(() => {
  delete globalThis.__stubFiles;
  delete globalThis.__stubKeyboard;
});

test('the PS5 keyboard is used where the console has one, and its answer comes back with the note cleared', async () => {
  const opened = consoleWith([{ status: 'done', text: 'spider' }]);
  const keyboard = await launch();
  assert.equal(keyboard.typingChoice(), 'system', 'the default');
  assert.equal(keyboard.systemKeyboardOn(), true);
  assert.deepEqual(await keyboard.typeOnSystemKeyboard({ title: 'Search games', maxLength: 40 }), { status: 'done', text: 'spider' });
  assert.equal(opened[0].options.title, 'Search games');
  assert.ok(opened[0].noted > 0, 'a note in settings.json while it is up');
  assert.equal(settings().keyboardOpen, undefined, 'and gone once it closed');
  consoleWith([], { available: false });
  const none = await launch();
  assert.equal(none.systemKeyboardOn(), false, "no keyboard on this console: the store's keys");
  assert.equal(await none.typeOnSystemKeyboard({}), null);
});

test("one that can't open, or fails, gives way to the store's keys for the rest of the launch", async () => {
  consoleWith([new Error('sceImeDialogInit 0x80bc0003')]);
  const keyboard = await launch();
  assert.equal(await keyboard.typeOnSystemKeyboard({}), null);
  assert.equal(keyboard.systemKeyboardOn(), false);
  assert.equal(settings().keyboardOpen, undefined);
  consoleWith(['reject']);
  const failing = await launch();
  assert.equal(await failing.typeOnSystemKeyboard({}), null);
  assert.equal(failing.systemKeyboardOn(), false);
  assert.equal(settings().keyboardOpen, undefined);
  assert.equal((await launch()).systemKeyboardOn(), true, 'the next launch tries it again');
});

test('the system closing it twice with no answer gives way to the store\'s keys; backing out never does', async () => {
  consoleWith([{ status: 'cancelled', text: '' }, { status: 'cancelled', text: '' }, { status: 'cancelled', text: '' }]);
  const backing = await launch();
  for (let i = 0; i < 3; i++) assert.equal((await backing.typeOnSystemKeyboard({})).status, 'cancelled');
  assert.equal(backing.systemKeyboardOn(), true, 'the player backed out: nothing wrong with it');
  consoleWith([{ status: 'aborted', text: '' }, { status: 'aborted', text: '' }, { status: 'done', text: 'x' }]);
  const closing = await launch();
  assert.equal((await closing.typeOnSystemKeyboard({})).status, 'aborted', 'once: the caller just goes back');
  assert.equal(await closing.typeOnSystemKeyboard({}), null, 'twice: the store\'s keys');
  assert.equal(closing.systemKeyboardOn(), false);
  closing.setTypingChoice('system');
  assert.equal(closing.systemKeyboardOn(), true, 'Settings turns it back on');
  assert.equal(settings().typing, 'system');
});

test('the app stopping with it up twice in a row switches typing to the store\'s keys, until Settings turns it back on', async () => {
  consoleWith([]);
  globalThis.__stubFiles.set(SETTINGS, JSON.stringify({ language: 'de', keyboardOpen: 1793083101236 }));
  let keyboard = await launch();
  assert.equal(keyboard.typingChoice(), 'system', 'once (the player closing the app with it up): still the PS5 keyboard');
  assert.deepEqual(settings(), { language: 'de', keyboardStopped: 1793083101236 }, 'the other settings stay');
  globalThis.__stubFiles.set(SETTINGS, JSON.stringify({ ...settings(), keyboardOpen: 1793083109999 }));
  keyboard = await launch();
  assert.equal(keyboard.typingChoice(), 'keys', 'twice in a row: the store\'s keys');
  assert.equal(keyboard.systemKeyboardOn(), false);
  assert.deepEqual(settings(), { language: 'de', typing: 'keys', keyboardStopped: 1793083109999 });
  assert.equal((await launch()).typingChoice(), 'keys', 'and at the launch after');
  keyboard.setTypingChoice('system');
  assert.equal((await launch()).systemKeyboardOn(), true);
});

test('the phone answering closes it, and that close reads "phone", never counted as the system taking it away', async () => {
  consoleWith([]);
  let close = null;
  globalThis.__stubKeyboard.open = () => new Promise((resolve) => { close = () => resolve({ status: 'aborted', text: '' }); });
  Object.defineProperty(globalThis.__stubKeyboard, 'isOpen', { get: () => close !== null, configurable: true });
  globalThis.__stubKeyboard.close = () => { const done = close; close = null; done(); };
  const keyboard = await launch();
  for (let i = 0; i < 3; i++) {
    const typing = keyboard.typeOnSystemKeyboard({ title: 'TorBox API key' });
    keyboard.closeForPhone();
    assert.deepEqual(await typing, { status: 'phone', text: '' });
  }
  assert.equal(keyboard.systemKeyboardOn(), true, 'three phone answers in a row: still the PS5 keyboard');
  keyboard.closeForPhone();
  assert.equal(close, null, 'with none up, nothing to close');
});

test('the phone closing it unanswered reads "cancelled", as Circle does, and is never counted as the system taking it away', async () => {
  consoleWith([]);
  let close = null;
  globalThis.__stubKeyboard.open = () => new Promise((resolve) => { close = () => resolve({ status: 'aborted', text: '' }); });
  Object.defineProperty(globalThis.__stubKeyboard, 'isOpen', { get: () => close !== null, configurable: true });
  globalThis.__stubKeyboard.close = () => { const done = close; close = null; done(); };
  const keyboard = await launch();
  for (let i = 0; i < 3; i++) {
    const typing = keyboard.typeOnSystemKeyboard({ title: 'Search' });
    assert.equal(keyboard.cancelForPhone(), true);
    assert.deepEqual(await typing, { status: 'cancelled', text: '' });
  }
  assert.equal(keyboard.systemKeyboardOn(), true, 'three closes from the phone: still the PS5 keyboard');
  assert.equal(keyboard.cancelForPhone(), false, 'with none up, nothing to close');
});

test('the PS5 keyboard closing while the app runs ends the streak: the next stop with it up counts as the first', async () => {
  consoleWith([{ status: 'done', text: 'x' }]);
  globalThis.__stubFiles.set(SETTINGS, JSON.stringify({ keyboardOpen: 1793083101236 }));
  const keyboard = await launch();
  assert.equal((await keyboard.typeOnSystemKeyboard({})).status, 'done');
  assert.equal(settings().keyboardStopped, undefined);
  globalThis.__stubFiles.set(SETTINGS, JSON.stringify({ ...settings(), keyboardOpen: 1793083109999 }));
  assert.equal((await launch()).typingChoice(), 'system');
});
