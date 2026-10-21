// The screen saver (0.5.0 Pre Release 4): on or off (on by default), kept in settings.json beside the other
// settings, and a way for Settings to show it at once. ui/ScreenSaver.jsx watches both.

import { useEffect, useState } from 'react';
import { loadList, saveList } from './saved.js';

  var SETTINGS = "settings.json";
  var IDLE_MS = 10 * 60 * 1e3;
  var value = null;
  var listeners = /* @__PURE__ */ new Set();
  var showers = /* @__PURE__ */ new Set();
  function screenSaverOn() {
    if (value === null) value = loadList(SETTINGS, "settings").screenSaver !== false;
    return value;
  }
  function setScreenSaver(on) {
    value = Boolean(on);
    saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), screenSaver: value });
    for (const listener of listeners) listener(value);
  }
  function useScreenSaverOn() {
    const [on, setOn] = useState(screenSaverOn);
    useEffect(() => {
      listeners.add(setOn);
      return () => {
        listeners.delete(setOn);
      };
    }, []);
    return on;
  }
  // Settings' "Show it now".
  function showScreenSaver() {
    for (const show of showers) show();
  }
  function onShowScreenSaver(show) {
    showers.add(show);
    return () => showers.delete(show);
  }

export { IDLE_MS, onShowScreenSaver, screenSaverOn, setScreenSaver, showScreenSaver, useScreenSaverOn };
