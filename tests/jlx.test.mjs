// 0.5.7: the JLX1 catalog file format (app/state/jlx.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { encodeJlx, decodeJlx, isJlx, readJlx, readJlxAsync, JLX_MARK } = await import('../app/state/jlx.js');

test('JLX1: any JSON comes back exactly, as printable ASCII with nothing readable left', async () => {
  const value = {
    url: 'https://vikingfile.com/f/abcdefghij', title: 'Pokémon “Café” 日本語 😀', quote: 'a "b" \\ c', tab: 'x\ty\n',
    nums: [0, -1.5, 1e21, null, true], end: 'ends in spaces   ',
  };
  const text = encodeJlx(value);
  assert.ok(text.startsWith(JLX_MARK));
  assert.match(text, /^[\x20-\x7e]*$/, 'printable ASCII only');
  assert.doesNotMatch(text, /vikingfile|https?:\/\/|Pok/i);
  assert.deepEqual(JSON.parse(decodeJlx(text)), value);
  assert.deepEqual(JSON.parse(decodeJlx(`${text}\n`)), value, 'a file ends in a line break');
  assert.deepEqual(JSON.parse(decodeJlx(`${text}\r\n`)), value);
  assert.equal(encodeJlx(JSON.stringify(value)), text, 'a JSON text encodes like its value');
  let pauses = 0;
  const big = encodeJlx({ games: Array.from({ length: 3000 }, (_, i) => ({ id: `PPSA${String(i).padStart(5, '0')}`, url: `https://h.example/${i}` })) });
  assert.equal(await readJlxAsync(big, async () => { pauses++; }), decodeJlx(big));
  assert.ok(pauses > 1, 'a big text is decoded in slices');
  assert.equal(readJlx('{"plain":1}'), '{"plain":1}', 'a plain file is read as it is');
  assert.equal(await readJlxAsync('[1]'), '[1]');
  assert.equal(isJlx('[]'), false);
  assert.throws(() => decodeJlx('[]'));
});

test('the bundled releases and the live catalog are JLX1, and the data folders hold no plain host link', () => {
  const dir = new URL('../app/data/releases/', import.meta.url);
  const names = readdirSync(dir).filter((name) => name.endsWith('.json'));
  assert.ok(names.length > 2000);
  for (const name of names) {
    const text = readFileSync(new URL(name, dir), 'utf8');
    assert.ok(isJlx(text), `${name} is encoded`);
    assert.ok(Array.isArray(JSON.parse(readJlx(text))), `${name} decodes to its releases`);
  }
  for (const name of ['live.jlx', 'names.jlx']) assert.ok(isJlx(readFileSync(new URL(`../catalog/${name}`, import.meta.url), 'utf8')), name);
  // Every file git tracks under the data folders and catalog/ (cover pictures are fine).
  const HOST_LINK = /https?:\/\/[^"\s]*(vikingfile|akirabox|1fichier|rootz|datanodes|mediafire|gofile|pixeldrain|filekeeper|link-vault)\./i;
  const GAME_FILE = /https?:\/\/archive\.org\/download\/[^"\s]+\.(pkg|ffpfsc|ffpfs|ffpkg|exfat|rar|7z|zip)\b/i;
  const tracked = execFileSync('git', ['ls-files', 'app/data', 'catalog', 'tests/fixtures'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).split('\n').filter(Boolean);
  const plain = tracked.filter((file) => {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    return HOST_LINK.test(text) || GAME_FILE.test(text);
  });
  assert.deepEqual(plain, []);
});
