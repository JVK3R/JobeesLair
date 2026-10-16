// The live game counter (state/library-count.js): in the dock, two small monospace lines (titles indexed, and
// how many of them download directly); on the downloads dashboard, a band reading
// "TOTAL INDEXED TITLES  n  |  DIRECT DOWNLOADS ACTIVE  n". Both follow the count as feeds refresh.

import '../assets/Exo2.ttf';
import '../assets/JetBrainsMono-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { Text, View } from '@ps5-react/core';
import { formatNumber2 } from '../i18n/core.js';
import { useT } from '../i18n/index.js';
import { useLibraryCount } from '../state/library-count.js';
import { colors, radius } from './colors.js';

  var GREEN = "#4ade80";
  var mono = (size, color, extra) => ({ fontFamily: "JetBrainsMono-Regular", fontSize: size, lineHeight: Math.round(size * 1.25), color, ...extra });
  // The dock's two lines, beside the logo.
  function DockCount() {
    const t2 = useT();
    const { titles, direct } = useLibraryCount();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { justifyContent: "center" }, children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: mono(17, colors.muted, { letterSpacing: 1 }), children: t2("library.dock.titles", { count: formatNumber2(titles) }) }),
      /* @__PURE__ */ (0, jsx)(Text, { style: mono(17, GREEN, { letterSpacing: 1 }), children: t2("library.dock.direct", { count: formatNumber2(direct) }) })
    ] });
  }
  function Figure({ label, value, tone }) {
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 18 }, children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: mono(17, colors.subtle, { letterSpacing: 2 }), children: label }),
      /* @__PURE__ */ (0, jsx)(Text, { style: mono(34, tone, { numberOfLines: 1 }), children: formatNumber2(value) })
    ] });
  }
  // The dashboard's band across the page.
  function CountBand() {
    const t2 = useT();
    const { titles, direct, feeds } = useLibraryCount();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { height: 72, flexDirection: "row", alignItems: "center", gap: 30, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 30 }, children: [
      /* @__PURE__ */ (0, jsx)(Figure, { label: t2("library.titles"), value: titles, tone: colors.fg }),
      /* @__PURE__ */ (0, jsx)(View, { style: { width: 1, height: 36, backgroundColor: colors.line } }),
      /* @__PURE__ */ (0, jsx)(Figure, { label: t2("library.direct"), value: direct, tone: GREEN }),
      /* @__PURE__ */ (0, jsx)(Text, { style: mono(17, colors.subtle, { flex: 1, textAlign: "end", numberOfLines: 1, ellipsizeMode: "tail" }), children: feeds ? t2("library.sources", { count: feeds }) : t2("library.sourcesNone") })
    ] });
  }

export { CountBand, DockCount };
