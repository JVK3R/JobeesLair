// "Remove {name}?" (0.5.2): asked before an app that saved things in its own folder is removed (state/homebrew.js
// savedData): keep them, to come back when it is installed again, or delete them with it. The Homebrew page's
// Remove and the Library's delete both ask here. `saved` is savedData's answer; `onChoose(keep)`.

import '../assets/Exo2.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useT } from '../i18n/index.js';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { SideSheet } from '../ui/SideSheet.jsx';
import { colors, radius } from '../ui/colors.js';
import { hb } from './palette.js';
import { Text, View } from '@ps5-react/core';

  var RED = "#f87171";
  function Choice({ focusKey, autoFocus, icon, label, detail, tone, onPress }) {
    return jsxs(View, { focusKey, autoFocus, onPress, style: { marginBottom: 12, borderRadius: radius.md, backgroundColor: colors.surface2, paddingHorizontal: 24, paddingVertical: 18, gap: 6 }, children: [
      jsx(FocusRing, { color: hb().hi }),
      jsxs(View, { style: { flexDirection: "row", alignItems: "center", gap: 12 }, children: [
        jsx(Icon, { name: icon, size: 20, color: tone ?? colors.fg }),
        jsx(Text, { style: { fontFamily: "Exo2", fontSize: 22, fontWeight: 600, lineHeight: 30, color: tone ?? colors.fg }, children: label })
      ] }),
      jsx(Text, { style: { width: 640, fontFamily: "Exo2", fontSize: 19, lineHeight: 28, color: colors.subtle }, children: detail })
    ] });
  }
  function RemoveSheet({ name, saved, onClose, onChoose }) {
    const t2 = useT();
    return jsx(SideSheet, { title: t2("homebrew.removeTitle", { name }), subtitle: t2("homebrew.removeAsk", { name }), onClose, children: [
      jsx(Choice, { focusKey: "hb:remove:keep", autoFocus: true, icon: "folder", label: t2("homebrew.keepSaved"), detail: t2(saved.whole ? "homebrew.keepFolderDetail" : "homebrew.keepSavedDetail", { name, path: saved.keptAt }), onPress: () => onChoose(true) }, "keep"),
      jsx(Choice, { focusKey: "hb:remove:all", icon: "trash", tone: RED, label: t2("homebrew.deleteAll"), detail: t2("homebrew.deleteAllDetail", { name }), onPress: () => onChoose(false) }, "all")
    ] });
  }

export { RemoveSheet };
