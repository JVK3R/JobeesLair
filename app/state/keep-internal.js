// The games the gamer pinned to internal storage ("Keep on internal storage" in a library tile's Options):
// Make Room never offers to move them off it. Kept as their library keys (the game's ID) in the app's
// data folder.

import { useEffect, useState } from 'react';
import { DATA_DIR, readPath } from './data-dir.js';
import { isStringList, readJSON } from './read-json.js';
import { FileSystem } from '@ps5-react/core';

  var NAME = "keep-internal.json";
  var pins = null;
  var listeners = /* @__PURE__ */ new Set();
  function load() {
    if (pins) return pins;
    try {
      pins = new Set(readJSON(FileSystem, readPath(NAME), [], isStringList));
    } catch {
      pins = /* @__PURE__ */ new Set();
    }
    return pins;
  }
  var keptInternal = () => load();
  function setKeptInternal(key, keep) {
    const next = new Set(load());
    if (keep) next.add(key);
    else next.delete(key);
    pins = next;
    try {
      FileSystem.mkdir(DATA_DIR, { recursive: true });
      FileSystem.writeFile(`${DATA_DIR}/${NAME}.tmp`, JSON.stringify([...next]), { sync: true });
      FileSystem.rename(`${DATA_DIR}/${NAME}.tmp`, `${DATA_DIR}/${NAME}`);
    } catch (error) {
      console.log(`[keep-internal] not saved: ${error.message}`);
    }
    for (const listener of [...listeners]) listener(next);
  }
  function useKeptInternal() {
    const [value, setValue] = (0, useState)(load);
    (0, useEffect)(() => {
      listeners.add(setValue);
      setValue(load());
      return () => listeners.delete(setValue);
    }, []);
    return value;
  }

export { keptInternal, setKeptInternal, useKeptInternal };
