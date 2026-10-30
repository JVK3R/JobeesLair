// ../pub-game-store/native/i18n/fit.js
// reconstructed from the esbuild bundle in eboot.bin


  var TEXT_MAX = 255;
  var SPAN_MAX = 63;
  var ELLIPSIS = "\u2026";
  var ELLIPSIS_BYTES = 3;
  var utf8Length = (codePoint) => codePoint < 128 ? 1 : codePoint < 2048 ? 2 : codePoint < 65536 ? 3 : 4;
  function fitBytes(text, max = TEXT_MAX) {
    if (text.length * 3 <= max) return text;
    let bytes = 0;
    let at = 0;
    let cut = 0;
    for (const char of text) {
      bytes += utf8Length(char.codePointAt(0));
      if (bytes > max) return `${text.slice(0, cut).trimEnd()}${ELLIPSIS}`;
      at += char.length;
      if (bytes <= max - ELLIPSIS_BYTES) cut = at;
    }
    return text;
  }
  // 0.5.4: text longer than the engine keeps in one Text node (TEXT_MAX bytes; it cuts the rest without a word) as
  // pieces that each fit, for ui/LongText.jsx to stack: whole sentences where they fit, else clauses, else words, else
  // characters (whole code points). A sentence ends at . ! ? and the Devanagari, Urdu and Arabic stops before a space,
  // or at a CJK full stop; a clause at a comma, semicolon or colon (theirs too).
  var LEVELS = [
    /[\s\S]*?(?:[.!?।۔؟]+\s+|[。！？]+\s*|$)/gu,
    /[\s\S]*?(?:[,;:،]+\s+|[、，；：]+\s*|$)/gu,
    /[\s\S]*?(?:\s+|$)/gu
  ];
  function byteLength(text) {
    let bytes = 0;
    for (const char of text) bytes += utf8Length(char.codePointAt(0));
    return bytes;
  }
  function splitBytes(text, max = TEXT_MAX, level = 0) {
    if (text.length * 3 <= max || byteLength(text) <= max) return [text];
    const pieces = level < LEVELS.length ? (text.match(LEVELS[level]) ?? []).filter(Boolean) : Array.from(text);
    if (pieces.length <= 1) return splitBytes(text, max, level + 1);
    const out = [];
    let current = "";
    for (const piece of pieces) {
      if (byteLength(current + piece) <= max) {
        current += piece;
        continue;
      }
      if (current.trim()) out.push(current.trimEnd());
      if (byteLength(piece) <= max) {
        current = piece;
        continue;
      }
      const inner = splitBytes(piece.trimEnd(), max, level + 1);
      out.push(...inner.slice(0, -1));
      current = `${inner.at(-1)}${/\s+$/.exec(piece)?.[0] ?? ""}`;
    }
    if (current.trim()) out.push(current.trimEnd());
    return out;
  }

export { SPAN_MAX, TEXT_MAX, byteLength, fitBytes, splitBytes };
