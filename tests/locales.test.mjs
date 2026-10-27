// Every language carries every string of the English file, each with the same {placeholders} and valid plural
// syntax, so a new English string cannot ship untranslated by accident. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(repo, 'app/i18n/locales');
const read = (file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
const { compile } = await import(pathToFileURL(path.join(repo, 'app/i18n/icu.js')).href);
const english = read('en.json');
// A plural case's one-word body ({one {Archive}}) is text, not a placeholder.
const names = (text) => [...new Set([...text.matchAll(/(?<!(?:\b(?:zero|one|two|few|many|other)|=\d+)\s*)\{(\w+)\s*[,}]/g)].map((match) => match[1]))].sort().join(',');
const others = readdirSync(dir).filter((file) => file.endsWith('.json') && file !== 'en.json');

test('there are 13 translations next to the English file', () => {
  assert.equal(others.length, 13);
});

// 0.5.3: "✕ on a picture opens it" drew "?": Exo2 has no dingbats, and the fallback fonts (tools/text_fonts.py) are cut
// to their scripts' character sets, which have none either (arrows and ○ □ △ are in them). Emoji neither.
test('no message uses a symbol none of the app\'s fonts can draw (dingbats like ✕ ✓, emoji)', () => {
  const undrawable = /[✀-➿\u{1F300}-\u{1FAFF}]/u;
  const found = [];
  for (const file of ['en.json', ...others]) for (const [key, text] of Object.entries(read(file))) if (undrawable.test(text)) found.push(`${file} ${key}: ${text.match(undrawable)[0]}`);
  assert.deepEqual(found, []);
});

for (const file of others) {
  test(`${file}: every English key is translated, none is left over`, () => {
    const messages = read(file);
    assert.deepEqual(Object.keys(english).filter((key) => !(key in messages)), [], 'missing');
    assert.deepEqual(Object.keys(messages).filter((key) => !(key in english)), [], 'no longer in English');
  });
  test(`${file}: placeholders match English and every message compiles`, () => {
    const messages = read(file);
    const wrong = [];
    for (const [key, text] of Object.entries(messages)) {
      if (!(key in english)) continue;
      try {
        compile(text);
      } catch (error) {
        wrong.push(`${key}: ${error.message}`);
        continue;
      }
      if (names(text) !== names(english[key])) wrong.push(`${key}: [${names(text)}] is not [${names(english[key])}]`);
    }
    assert.deepEqual(wrong, []);
  });
}
