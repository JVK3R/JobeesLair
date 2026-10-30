// The console's JS engine is built with only Date.now(): constructing a Date, or Date.parse / Date.UTC /
// toISOString and the like, throws "Date objects need ER_JS_INTRINSIC_DATE". Node has all of it, so no
// other test would notice; 0.4.0 pre-release 1 crashed at boot on a Date in the logger. App code works dates
// out from epoch milliseconds (app/state/clock.js). This reads the app's sources for what the engine lacks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url)), 'app');
function* sources(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'data') yield* sources(full); }
    else if (/\.(js|jsx)$/.test(name)) yield full;
  }
}
// Code without its comments (a line comment, a block comment) so a comment may say what not to do.
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const FORBIDDEN = [
  [/\bnew\s+Date\b/, 'new Date'],
  [/\bDate\s*\.\s*(?!now\b)[A-Za-z]+/, 'Date.<anything but now>'],
  [/\.(toISOString|toLocale\w*String|getTimezoneOffset|getTime|getFullYear|getMonth|getDate|getDay|getHours|getMinutes|getSeconds|getUTC\w+)\s*\(/, 'a Date method'],
  [/\bIntl\s*\./, 'Intl'],
];

// The phone companion's page (companion/page.js TEMPLATE) is text the console serves; its script runs in the phone's
// browser, which has Intl (plurals, numbers in the phone's language). The code around it runs on the console.
const consoleSide = (file, text) => file.endsWith(path.join('companion', 'page.js')) ? text.replace(/String\.raw`[\s\S]*?`;/, 'String.raw``;') : text;

test('app code uses no Date beyond Date.now(), and no Intl', () => {
  const problems = [];
  for (const file of sources(root)) {
    const text = code(consoleSide(file, readFileSync(file, 'utf8')));
    for (const [pattern, what] of FORBIDDEN) {
      const found = pattern.exec(text);
      if (found) problems.push(`${path.relative(root, file)}: ${what} (${found[0]})`);
    }
  }
  assert.deepEqual(problems, [], 'the console engine has only Date.now()');
});

test('the guard itself sees what it should', () => {
  const page = path.join(root, 'companion', 'page.js');
  assert.doesNotMatch(consoleSide(page, 'var T = String.raw`<script>new Intl.PluralRules(LANG)</script>`;\nvar x = 1;'), /Intl/, "the phone's script is skipped");
  assert.match(consoleSide(page, 'var T = String.raw`<p>`;\nvar d = new Date();'), /new Date/, 'the code around it is not');
  assert.match(code('const a = new Date(x); // fine'), /new Date/);
  assert.doesNotMatch(code('// new Date() in a comment\nconst b = Date.now();'), /new Date/);
  assert.doesNotMatch(code('/* Date.parse is out */ const c = 1;'), /Date\.parse/);
});
