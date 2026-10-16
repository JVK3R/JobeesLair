// Jobee'sLair theme profiles: accent presets over the fixed stealth-black foundation, one per console user.
// The canvas, graphite panels, edges and text never change; a preset only shifts the accent family
// (focus borders, active marks, glows, primary buttons and the idle light bar).
// The choice is kept in themes.json by the PS5 user's id ({ "<user id>": "<preset id>" }), so each
// profile that opens the store gets its own colors. A user the console cannot name shares "default".

import { useEffect, useState } from 'react';
import { loadList, saveList } from '../state/saved.js';
import { Users } from '@ps5-react/core';

  // accent: fills and bars; hi: focus borders, glows and focused fills; deep: pressed and dark fills;
  // fg: text drawn on an accent fill (dark on the light amber).
  var PRESETS = [
    { id: "electric", name: "theme.electric", accent: "#3a86ff", hi: "#4cc9f0", deep: "#2563eb", fg: "#ffffff" },
    { id: "crimson", name: "theme.crimson", accent: "#e63946", hi: "#ff6b81", deep: "#a4161a", fg: "#ffffff" },
    { id: "emerald", name: "theme.emerald", accent: "#12a150", hi: "#4ade80", deep: "#0b7a3b", fg: "#ffffff" },
    { id: "amber", name: "theme.amber", accent: "#d97706", hi: "#fbbf24", deep: "#b45309", fg: "#050811" },
    { id: "violet", name: "theme.violet", accent: "#7c3aed", hi: "#a78bfa", deep: "#5b21b6", fg: "#ffffff" },
    { id: "graphite", name: "theme.graphite", accent: "#64748b", hi: "#cbd5e1", deep: "#475569", fg: "#ffffff" }
  ];
  var DEFAULT_THEME = "electric";
  var FILE = "themes.json";
  var presetOf = (id) => PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
  // The foreground user: the one who launched the store. Asked once; a console that cannot say shares
  // the "default" profile.
  function userKey() {
    try {
      const user = Users.getForeground();
      return user && user.id != null ? String(user.id) : "default";
    } catch {
      return "default";
    }
  }
  var user = userKey();
  // Asked once too: Settings' theme card names the user on every draw, and each focus move along its
  // swatches draws it again (a user-service call on the render thread each time).
  var name = (() => {
    try {
      return Users.getForeground()?.name || null;
    } catch {
      return null;
    }
  })();
  var userName = () => name;
  var profiles = loadList(FILE, "themes");
  var active = presetOf(profiles[user]).id;
  var listeners = /* @__PURE__ */ new Set();
  var activeTheme = () => active;
  // Saves the user's choice and tells the listeners (colors.js retints the shared tokens).
  function saveTheme(id) {
    const next = presetOf(id).id;
    if (next === active) return false;
    active = next;
    profiles = { ...loadList(FILE, "themes"), [user]: next };
    saveList(FILE, "themes", profiles);
    for (const listener of listeners) listener(next);
    return true;
  }
  function onTheme(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function useActiveTheme() {
    const [id, setId] = (0, useState)(active);
    (0, useEffect)(() => onTheme(setId), []);
    return id;
  }

export { DEFAULT_THEME, PRESETS, activeTheme, onTheme, presetOf, saveTheme, useActiveTheme, userName };
