// A QR code for a short text (0.5.0 Pre Release 4: the phone companion's address in Settings, so a phone camera
// opens it instead of someone typing an IP). Byte mode, error correction M (a code on a TV, photographed from
// a couch, loses a corner now and then), versions 1 to 10, the mask with the lowest penalty: the encoder of
// the QR specification (ISO/IEC 18004), as the reference implementations write it.
//
//   qrMatrix(text) -> { size, dark(x, y) }   (throws past 213 bytes, which version 10-M holds)

  // Per version 1..10, error correction M: [EC codewords per block, blocks in group 1, data per block 1,
  // blocks in group 2, data per block 2].
  var BLOCKS_M = [
    null,
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]
  ];
  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  var EC_M = 0; // format bits for M are 00
  // GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 256) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  var mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
  function generator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }
  function remainder(data, degree) {
    const gen = generator(degree);
    const out = new Array(degree).fill(0);
    for (const byte of data) {
      const factor = byte ^ out.shift();
      out.push(0);
      for (let i = 0; i < degree; i++) out[i] ^= mul(gen[i + 1], factor);
    }
    return out;
  }
  function utf8(text) {
    const bytes = [];
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) bytes.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else bytes.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return bytes;
  }
  var capacity = (version) => {
    const [, b1, d1, b2, d2] = BLOCKS_M[version];
    return b1 * d1 + b2 * d2;
  };
  // The data codewords: mode, count, bytes, terminator, padding.
  function codewords(bytes, version) {
    const bits = [];
    const put = (value, length) => {
      for (let i = length - 1; i >= 0; i--) bits.push(value >>> i & 1);
    };
    put(4, 4);
    put(bytes.length, version < 10 ? 8 : 16);
    for (const byte of bytes) put(byte, 8);
    const total = capacity(version) * 8;
    put(0, Math.min(4, total - bits.length));
    while (bits.length % 8) bits.push(0);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => a << 1 | b, 0));
    for (let pad = 0xec; out.length < capacity(version); pad ^= 0xec ^ 0x11) out.push(pad);
    return out;
  }
  // Split into blocks, add each block's error correction, interleave.
  function interleave(data, version) {
    const [ec, b1, d1, b2, d2] = BLOCKS_M[version];
    const blocks = [];
    let at = 0;
    for (let i = 0; i < b1 + b2; i++) {
      const length = i < b1 ? d1 : d2;
      const block = data.slice(at, at + length);
      at += length;
      blocks.push({ data: block, ec: remainder(block, ec) });
    }
    const out = [];
    for (let i = 0; i < Math.max(d1, d2); i++) for (const block of blocks) if (i < block.data.length) out.push(block.data[i]);
    for (let i = 0; i < ec; i++) for (const block of blocks) out.push(block.ec[i]);
    return out;
  }
  function bch(value, poly, length) {
    let rem = value << length;
    const top = 31 - Math.clz32(poly);
    while (31 - Math.clz32(rem) >= top && rem) rem ^= poly << 31 - Math.clz32(rem) - top;
    return value << length | rem;
  }
  var MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
    (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
  ];
  function build(version, data, mask) {
    const size = version * 4 + 17;
    const dark = Array.from({ length: size }, () => new Array(size).fill(false));
    const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, on) => {
      dark[y][x] = on;
      fixed[y][x] = true;
    };
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    for (let i = 0; i < size; i++) {
      if (!fixed[6][i]) set(i, 6, i % 2 === 0);
      if (!fixed[i][6]) set(6, i, i % 2 === 0);
    }
    const centers = ALIGN[version];
    const last = centers.length - 1;
    centers.forEach((cy, j) => centers.forEach((cx, i) => {
      // Every crossing but the three under the finders.
      if (i === 0 && j === 0 || i === 0 && j === last || i === last && j === 0) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    // Format information: error correction level and mask, BCH-protected, XORed with 0x5412.
    const format = bch(EC_M << 3 | mask, 0x537, 10) ^ 0x5412;
    const bit = (i) => (format >>> i & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
    if (version >= 7) {
      const info = bch(version, 0x1f25, 12);
      for (let i = 0; i < 18; i++) {
        const on = (info >>> i & 1) === 1;
        const a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, on);
        set(b, a, on);
      }
    }
    // The data, in the zigzag from the bottom right, two columns at a time.
    let index = 0;
    const total = data.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = (right + 1 & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (fixed[y][x]) continue;
          let on = index < total && (data[index >>> 3] >>> 7 - (index & 7) & 1) === 1;
          index++;
          if (MASKS[mask](x, y)) on = !on;
          dark[y][x] = on;
        }
      }
    }
    return { size, dark };
  }
  // The specification's penalty: runs, 2x2 blocks, finder-like patterns, and dark/light balance.
  function penalty({ size, dark }) {
    let score = 0;
    const line = (get) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b <= size; b++) {
          if (b < size && get(a, b) === get(a, b - 1)) run++;
          else {
            if (run >= 5) score += run - 2;
            run = 1;
          }
        }
        for (let b = 0; b + 10 < size; b++) {
          const s = Array.from({ length: 11 }, (_, k) => get(a, b + k) ? 1 : 0).join("");
          if (s === "10111010000" || s === "00001011101") score += 40;
        }
      }
    };
    line((a, b) => dark[a][b]);
    line((a, b) => dark[b][a]);
    for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
      const c = dark[y][x];
      if (c === dark[y][x + 1] && c === dark[y + 1][x] && c === dark[y + 1][x + 1]) score += 3;
    }
    let count = 0;
    for (const row of dark) for (const cell of row) if (cell) count++;
    score += Math.floor(Math.abs(count * 20 - size * size * 10) / (size * size)) * 10;
    return score;
  }
  function qrMatrix(text) {
    const bytes = utf8(text);
    let version = 1;
    while (version <= 10 && capacity(version) < bytes.length + (version < 10 ? 2 : 3)) version++;
    if (version > 10) throw new Error("Too long for a QR code here.");
    const data = interleave(codewords(bytes, version), version);
    let best = null, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const matrix = build(version, data, mask);
      const score = penalty(matrix);
      if (score < bestScore) {
        best = matrix;
        bestScore = score;
      }
    }
    return { size: best.size, version, dark: (x, y) => best.dark[y][x] };
  }

export { qrMatrix };
