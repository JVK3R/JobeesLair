// Whether a download in parts opens the browser for its next part by itself (0.5.0 Pre Release 3; on by
// default). Kept in settings.json beside the other settings; the download queue asks each time a part needs
// the browser, so a change applies to the next part.

import { useEffect, useState } from 'react';
import { loadList, saveList } from './saved.js';

  var SETTINGS = "settings.json";
  var value = null;
  var listeners = /* @__PURE__ */ new Set();
  function autoContinueParts() {
    if (value === null) value = loadList(SETTINGS, "settings").autoContinueParts !== false;
    return value;
  }
  function setAutoContinueParts(on) {
    value = Boolean(on);
    saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), autoContinueParts: value });
    for (const listener of listeners) listener(value);
  }
  function useAutoContinueParts() {
    const [on, setOn] = useState(autoContinueParts);
    useEffect(() => {
      listeners.add(setOn);
      return () => {
        listeners.delete(setOn);
      };
    }, []);
    return on;
  }

export { autoContinueParts, setAutoContinueParts, useAutoContinueParts };
