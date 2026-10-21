// The Homebrew section's own color (0.5.0 Pre Release 2), so it never looks like the game store: its island
// item, the pill under it, its header, chips, rows, buttons, focus frames and the legend's "where you are"
// mark. Green, or amber when the store itself is green (the emerald theme). Read as it renders, like colors.js.

import { colors } from '../ui/colors.js';

  var GREEN = { accent: "#16a34a", hi: "#4ade80", deep: "#14532d", fg: "#ffffff", fgHi: "#052e16", glow: "#86efac", soft: "#16a34a2e" };
  var AMBER = { accent: "#d97706", hi: "#fbbf24", deep: "#78350f", fg: "#050811", fgHi: "#050811", glow: "#fcd34d", soft: "#d977062e" };
  var hb = () => colors.accent === "#12a150" ? AMBER : GREEN;
  // The tint Button2 takes, so a primary button in the section is filled in the section's color.
  var hbTint = () => {
    const tone = hb();
    return { accent: tone.accent, hi: tone.hi, fg: tone.fg, fgHi: tone.fgHi };
  };
  var isHomebrewSection = (section) => section === "homebrew" || section === "homebrew-app";

export { hb, hbTint, isHomebrewSection };
