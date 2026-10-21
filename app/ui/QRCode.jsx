// A QR code drawn with plain Views (0.5.0 Pre Release 4): each row's runs of dark modules are one box each, on
// white with the four-module quiet zone the specification asks for. Whole pixels per module, so no edge blurs.

import { jsx } from 'react/jsx-runtime';
import { memo, useMemo } from 'react';
import { View } from '@ps5-react/core';
import { qrMatrix } from './qr.js';

  var QUIET = 4;
  var QRCode = memo(function QRCode2({ text, size = 240 }) {
    const shape = useMemo(() => {
      try {
        const matrix = qrMatrix(text);
        const runs = [];
        for (let y = 0; y < matrix.size; y++) {
          let start = -1;
          for (let x = 0; x <= matrix.size; x++) {
            const dark = x < matrix.size && matrix.dark(x, y);
            if (dark && start < 0) start = x;
            else if (!dark && start >= 0) {
              runs.push([start, y, x - start]);
              start = -1;
            }
          }
        }
        return { modules: matrix.size, runs };
      } catch {
        return null;
      }
    }, [text]);
    if (!shape) return null;
    const unit = Math.max(2, Math.floor(size / (shape.modules + QUIET * 2)));
    const side = unit * (shape.modules + QUIET * 2);
    return jsx(View, { style: { position: "relative", width: side, height: side, borderRadius: 8, backgroundColor: "#ffffff" }, children: shape.runs.map(([x, y, length], index) => jsx(View, { style: { position: "absolute", left: (x + QUIET) * unit, top: (y + QUIET) * unit, width: length * unit, height: unit, backgroundColor: "#000000" } }, index)) });
  });

export { QRCode };
