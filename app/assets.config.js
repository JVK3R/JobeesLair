// Baked fonts cover printable ASCII by default, and every codepoint outside it
// draws as `?`. The store separates genres and sources with U+00B7 and writes
// em dashes, curly quotes and ellipses, and the shipped locales add accented
// Latin and Cyrillic, so both faces bake the whole European set.
export default {
  fonts: {
    'Exo2': { glyphs: 'european' },
    'JetBrainsMono-Regular': { glyphs: 'european' },
  },
};
