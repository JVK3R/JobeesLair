// ../pub-game-store/native/files/FilesScreen.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useMemo, useState } from 'react';
import { FileRow } from './FileRow.jsx';
import { StorageBar } from './StorageBar.jsx';
import { KINDS, isPackage, totals } from './scan.js';
import { useFiles } from './useFiles.js';
import { useT } from '../i18n/index.js';
import { driveName } from '../state/downloads.js';
import { refreshDrives, useDrives } from '../state/drives.js';
import { useNavActions } from '../state/nav.jsx';
import { formatBytes } from '../state/size.js';
import { ButtonHints } from '../ui/ButtonHints.jsx';
import { FocusRing } from '../ui/FocusRing.jsx';
import { Icon } from '../ui/Icon.jsx';
import { HINT } from '../ui/Legend.jsx';
import { colors, radius } from '../ui/colors.js';
import { FocusScope, ScrollView, Text, View, useIsFocused } from '@ps5-react/core';

  var LIST_WIDTH = 904;
  var ARM_MS2 = 4e3;
  var RAIL_HINTS = [HINT.select, HINT.back];
  var PACKAGE_HINTS = [{ button: "cross", label: "hints.install" }, { button: "square", label: "hints.delete" }, HINT.back];
  var FILE_HINTS = [{ button: "square", label: "hints.delete" }, HINT.back];
  var ARMED_HINTS = [{ button: "square", label: "hints.confirmDelete" }, HINT.back];
  var fileKey = (path) => `files:${path}`;
  function RailFace({ icon, label, detail: detail2, current }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(Icon, { name: icon, size: 18, color: current || focused ? colors.fg : colors.subtle }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: current ? { fontFamily: "Exo2", fontSize: 23, fontWeight: 600, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" } : { fontFamily: "Exo2", fontSize: 23, color: colors.muted, numberOfLines: 1, ellipsizeMode: "tail" }, children: label }),
        detail2 ? /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 20, color: colors.subtle, numberOfLines: 1, ellipsizeMode: "tail" }, children: detail2 }) : null
      ] }),
      current ? /* @__PURE__ */ (0, jsx)(View, { style: { height: 9, width: 9, borderRadius: radius.pill, backgroundColor: colors.accent } }) : null
    ] });
  }
  function RailItem({ onPress, focusKey, autoFocus, onFocus, ...face }) {
    return /* @__PURE__ */ (0, jsx)(View, { focusKey, autoFocus, onPress, onFocus, style: (_state) => face.current ? { height: 84, flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 18 } : [{ height: 84, flexDirection: "row", alignItems: "center", gap: 18, borderRadius: radius.md, paddingHorizontal: 18 }, _state.focused ? { backgroundColor: colors.surface2 } : null], children: /* @__PURE__ */ (0, jsx)(RailFace, { ...face }) });
  }
  function Label({ children }) {
    return /* @__PURE__ */ (0, jsx)(Text, { style: { paddingHorizontal: 18, paddingBottom: 6, fontFamily: "Exo2", fontSize: 20, fontWeight: 600, color: colors.subtle, letterSpacing: 1 }, children });
  }
  function ShadowMountStatus({ up }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 18, paddingHorizontal: 18, paddingTop: 6 }, children: [
      /* @__PURE__ */ (0, jsx)(View, { style: up ? { marginTop: 9, height: 12, width: 12, borderRadius: radius.pill, backgroundColor: colors.accent } : { marginTop: 9, height: 12, width: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.subtle } }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 20, color: colors.muted }, children: t2(up ? "files.shadowMountOn" : "files.shadowMountOff") }),
        up ? null : /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Exo2", fontSize: 20, color: colors.subtle, numberOfLines: 3, ellipsizeMode: "tail" }, children: t2("shadowMount.offAction") })
      ] })
    ] });
  }
  function Empty2() {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 96 }, children: [
      /* @__PURE__ */ (0, jsx)(Icon, { name: "folder", size: 32, color: colors.subtle }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { marginTop: 24, fontFamily: "Exo2", fontSize: 27, fontWeight: 600, color: colors.fg, lineHeight: 42 }, children: t2("files.empty") }),
      /* @__PURE__ */ (0, jsx)(Text, { style: { marginTop: 6, width: 660, textAlign: "center", fontFamily: "Exo2", fontSize: 24, color: colors.muted, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 36 }, children: t2("files.emptyDetail") })
    ] });
  }
  function FilesScreen({ onBack }) {
    const t2 = useT();
    const drives = useDrives();
    const roots = drives.roots;
    const [drive, setDrive] = (0, useState)(0);
    const [kind, setKind] = (0, useState)("all");
    const root2 = roots[drive];
    const { files, installing, install, remove, shadowMount } = useFiles(root2);
    const sums = (0, useMemo)(() => totals(files), [files]);
    const shown = kind === "all" ? files : files.filter((file) => file.kind === kind);
    // Free space from the cache; a change to the files (an install, a delete) asks for a fresh reading.
    const usage = drives.usage[root2] ?? null;
    (0, useEffect)(() => {
      void refreshDrives();
    }, [root2, files]);
    const [focused, setFocused] = (0, useState)(null);
    const [armed, setArmed] = (0, useState)(null);
    const [notice, setNotice] = (0, useState)("");
    const { focusLater } = useNavActions();
    (0, useEffect)(() => {
      if (!armed) return void 0;
      const timer = setTimeout(() => setArmed(null), ARM_MS2);
      return () => clearTimeout(timer);
    }, [armed]);
    const focusFile = (file) => {
      setFocused(file);
      if (armed && armed !== file.path) setArmed(null);
    };
    const onAction = (action) => {
      if (action !== "square" || !focused) return false;
      if (armed !== focused.path) {
        setArmed(focused.path);
        return true;
      }
      setArmed(null);
      const index = shown.indexOf(focused);
      const next = shown[index + 1] ?? shown[index - 1];
      const file = focused;
      remove(file).then((result) => {
        focusLater(next ? fileKey(next.path) : `files-kind:${kind}`);
        setNotice([t2("files.deleted", { name: file.game?.title ?? file.name }), result?.note].filter(Boolean).join(". "));
      }, (error2) => setNotice(/ShadowMount|download/i.test(error2.message) ? error2.message : t2("files.deleteFailed")));
      return true;
    };
    const back2 = () => {
      if (armed) setArmed(null);
      else onBack();
      return true;
    };
    const hints = !focused ? RAIL_HINTS : armed === focused.path ? ARMED_HINTS : isPackage(focused.name) ? PACKAGE_HINTS : FILE_HINTS;
    const free = usage ? t2("files.free", { free: formatBytes(usage.free), total: formatBytes(usage.total) }) : "";
    return /* @__PURE__ */ (0, jsx)(FocusScope, { autoFocus: true, onBack: back2, onAction, children: /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 48, paddingTop: 48, paddingBottom: 36 }, children: [
        /* @__PURE__ */ (0, jsxs)(Text, { style: { width: 1140, fontFamily: "Exo2", fontSize: 30, fontWeight: 600, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail", lineHeight: 42, letterSpacing: 0.4 }, children: [
          t2("files.title"),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontWeight: 400, color: colors.subtle }, children: `  ${t2("files.summary", { count: sums.all.count, size: formatBytes(sums.all.size) })}` })
        ] }),
        /* @__PURE__ */ (0, jsx)(Text, { style: { width: 600, textAlign: "end", fontFamily: "Exo2", fontSize: 21, color: colors.muted, numberOfLines: 2, ellipsizeMode: "tail", lineHeight: 30 }, children: notice })
      ] }),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, flexDirection: "row", gap: 48, paddingHorizontal: 48 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { width: 372, gap: 6 }, children: [
          /* @__PURE__ */ (0, jsx)(Label, { children: t2("files.drives") }),
          roots.map(
            (path, index) => /* @__PURE__ */ (0, jsx)(
              RailItem,
              {
                icon: "hardDrive",
                label: driveName(path),
                current: index === drive,
                detail: index === drive ? free : null,
                focusKey: `files-drive:${path}`,
                onFocus: () => setFocused(null),
                onPress: () => {
                  setDrive(index);
                  setArmed(null);
                }
              },
              path
            )
          ),
          /* @__PURE__ */ (0, jsx)(ShadowMountStatus, { up: shadowMount }),
          /* @__PURE__ */ (0, jsx)(View, { style: { height: 30 } }),
          /* @__PURE__ */ (0, jsx)(Label, { children: t2("files.kinds") }),
          [{ key: "all", icon: "layers" }, ...KINDS].map(
            (item) => /* @__PURE__ */ (0, jsx)(
              RailItem,
              {
                icon: item.icon,
                label: t2(`files.kind.${item.key}`),
                current: kind === item.key,
                detail: sums[item.key].count ? formatBytes(sums[item.key].size) : null,
                focusKey: `files-kind:${item.key}`,
                onFocus: () => setFocused(null),
                onPress: () => setKind(item.key),
                autoFocus: !files.length && item.key === "all"
              },
              item.key
            )
          )
        ] }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 36 }, children: [
          /* @__PURE__ */ (0, jsx)(StorageBar, { usage, sums, focus: focused?.kind ?? (kind === "all" ? null : kind), width: LIST_WIDTH }),
          shown.length ? /* @__PURE__ */ (0, jsx)(ScrollView, { style: { flex: 1 }, children: /* @__PURE__ */ (0, jsx)(View, { style: { gap: 6, paddingBottom: 48 }, children: shown.map(
            (file, index) => /* @__PURE__ */ (0, jsx)(
              FileRow,
              {
                file,
                focusKey: fileKey(file.path),
                autoFocus: index === 0,
                armed: armed === file.path,
                installing: installing?.path === file.path ? installing : null,
                shadowMount,
                onFocus: () => focusFile(file),
                onPress: isPackage(file.name) ? () => install(file) : void 0
              },
              file.path
            )
          ) }) }) : /* @__PURE__ */ (0, jsx)(Empty2, {})
        ] })
      ] }),
      /* @__PURE__ */ (0, jsx)(ButtonHints, { hints })
    ] }) });
  }

export { FilesScreen };
