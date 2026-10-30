// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// npm run dev's keep-state transform (tools/keep-state.mjs), through the same Babel pass as className.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createCompiler} from './compile.mjs';
import {transform} from './esbuild-plugin.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const er = process.env.PS5_REACT_ER ?? resolve(root, '.deps/embeddedReact');
const require = createRequire(resolve(er, 'bridges/quickjs/js/package.json'));
const babel = {core: require('@babel/core'), syntaxJsx: require('@babel/plugin-syntax-jsx').default};
const compiler = createCompiler({renderWidth: 1280, renderHeight: 720, appDir: '/app', config: {}});

const keep = (source, file = 'ui/Card.jsx') =>
  transform(babel, compiler, source, `/app/${file}`, file).replace(/\s+/g, ' ').trim();

test("React's useState becomes useKeptState keyed by file, component and order", () => {
  const out = keep(`import {useState} from 'react';
    function Card() { const [a] = useState(1); const [b] = useState(() => 2); return null; }
    const Row = () => { const [c] = useState('x'); return null; };`);
  assert.match(out, /^import \{ useKeptState as __ps5KeepState \} from "@ps5-react\/core";/);
  assert.match(out, /__ps5KeepState\("ui\/Card\.jsx::Card#0", 1\)/);
  assert.match(out, /__ps5KeepState\("ui\/Card\.jsx::Card#1", \(\) => 2\)/);
  assert.match(out, /__ps5KeepState\("ui\/Card\.jsx::Row#0", 'x'\)/);
  assert.doesNotMatch(out, /[^.]useState\(/);
});

test('React.useState from a default or namespace import is kept too', () => {
  assert.match(keep(`import React from 'react'; function A() { React.useState(0); }`),
    /__ps5KeepState\("ui\/Card\.jsx::A#0", 0\)/);
  assert.match(keep(`import * as R from 'react'; function B() { R.useState(0); }`),
    /__ps5KeepState\("ui\/Card\.jsx::B#0", 0\)/);
});

test('a useState that is not React\'s is left alone', () => {
  const local = keep(`function useState(x) { return [x]; } function C() { useState(1); }`);
  assert.doesNotMatch(local, /__ps5KeepState/);
  const other = keep(`import {useState} from './store.js'; function D() { useState(1); }`);
  assert.doesNotMatch(other, /__ps5KeepState/);
});

test('without keep-state the transform leaves useState as it is', () => {
  const out = transform(babel, compiler, `import {useState} from 'react'; function E() { useState(1); }`, '/app/e.jsx')
    .replace(/\s+/g, ' ');
  assert.doesNotMatch(out, /__ps5KeepState/);
});
