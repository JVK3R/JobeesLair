// JLX1, the catalog file format (0.5.7): the JSON, with every character outside printable ASCII written as a \u escape,
// has each character moved within printable ASCII by a pseudo-random step (xorshift32 from a fixed seed), behind the
// "JLX1:" mark. The result is printable ASCII again and the same length, so it travels and is stored like any text.
//
//   encodeJlx(value)                 any JSON value (or a JSON text) -> "JLX1:..."
//   decodeJlx(text)                  "JLX1:..." -> the JSON text
//   readJlx(text)                    the JSON text of either form: an encoded file is decoded, a plain one passed through
//   readJlxAsync(text, pause)        the same for a big text, awaiting pause() between slices so the screen keeps going

var MARK = "JLX1:";
var SEED = 0x4a4c5831;
var SPAN = 95;  // printable ASCII, 0x20 to 0x7e
var CHUNK = 8192;
var SLICE = 65536;

// A pass over text[from, to) with the step stream at `state`: +1 encodes, -1 decodes. Returns the next state.
// Codes are built in chunks and joined (fast in QuickJS).
function shift(text, from, to, sign, state, out) {
  const codes = new Array(Math.min(CHUNK, Math.max(0, to - from)));
  let n = 0;
  let s = state;
  for (let i = from; i < to; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const c = text.charCodeAt(i) - 32;
    if (c < 0 || c >= SPAN) throw new Error(`JLX: character ${i} is outside printable ASCII`);
    codes[n++] = ((c + sign * ((s >>> 0) % SPAN)) % SPAN + SPAN) % SPAN + 32;
    if (n === CHUNK) {
      out.push(String.fromCharCode.apply(null, codes));
      n = 0;
    }
  }
  if (n) out.push(String.fromCharCode.apply(null, codes.slice(0, n)));
  return s;
}

// JSON with every character outside printable ASCII escaped, so the whole text is printable ASCII.
function asciiJson(value) {
  return JSON.stringify(value).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function encodeJlx(value) {
  const json = asciiJson(typeof value === "string" ? JSON.parse(value) : value);
  const out = [MARK];
  shift(json, 0, json.length, 1, SEED | 0, out);
  return out.join("");
}

var isJlx = (text) => typeof text === "string" && text.startsWith(MARK);
// A file ends in one line break; a space before it is content (a space is a code like any other).
var bodyEnd = (text) => text.endsWith("\r\n") ? text.length - 2 : text.endsWith("\n") ? text.length - 1 : text.length;

function decodeJlx(text) {
  if (!isJlx(text)) throw new Error("not a JLX1 text");
  const out = [];
  shift(text, MARK.length, bodyEnd(text), -1, SEED | 0, out);
  return out.join("");
}

var readJlx = (text) => (isJlx(text) ? decodeJlx(text) : text);

async function readJlxAsync(text, pause) {
  if (!isJlx(text)) return text;
  const out = [];
  const end = bodyEnd(text);
  let state = SEED | 0;
  for (let from = MARK.length; from < end; from += SLICE) {
    state = shift(text, from, Math.min(end, from + SLICE), -1, state, out);
    if (pause && from + SLICE < end) await pause();
  }
  return out.join("");
}

export { MARK as JLX_MARK, decodeJlx, encodeJlx, isJlx, readJlx, readJlxAsync };
