// A paragraph that may be longer than the engine keeps in one Text node (255 bytes, ps5-react docs/TEXT.md: it cuts
// the rest without a word, which took the ends off Settings' "What it sends", the legal notice and "Why won't it
// start?", in Bengali and Hindi most of all). It is split into pieces that each fit (i18n/fit.js splitBytes: whole
// sentences where it can) and stacked, so it reads as one paragraph whose lines sometimes end early. `box` styles the
// column holding them (its flex or width in a row); text that fits is one Text, as before.

import { jsx } from 'react/jsx-runtime';
import { Text, View } from '@ps5-react/core';
import { splitBytes } from '../i18n/fit.js';

  function LongText({ style, box = null, children }) {
    const pieces = typeof children === "string" ? splitBytes(children) : [children];
    if (pieces.length === 1 && !box) return /* @__PURE__ */ (0, jsx)(Text, { style, children: pieces[0] });
    return /* @__PURE__ */ (0, jsx)(View, { style: box, children: pieces.map((piece, index) => /* @__PURE__ */ (0, jsx)(Text, { style, children: piece }, index)) });
  }

export { LongText };
