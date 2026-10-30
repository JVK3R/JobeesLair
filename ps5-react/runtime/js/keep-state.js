// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// npm run dev keeps the app's state when a file is saved: the preview restarts with the new code, and every
// useState the app declared (tools/keep-state.mjs rewrites it into useKeptState) starts from the value it last
// held, as does focus. Values live in the preview's temporary folder as JSON; only plain data is kept (numbers,
// strings, booleans, null, and arrays and plain objects of them), anything else starts from its initial value.
// Each value is keyed by its call site and the instance's useId, so the rows of a list keep their own. Outside
// npm run dev (the PS5 build, npm test) the transform does not run, nothing here is called, and focus is not kept.
import {useCallback, useId, useState} from 'react';
import {FileSystem} from './native.js';
import {onFrame} from './frame.js';
import {manager} from './focus/runtime.js';
import {subscribeInput} from './input.js';

const FILE = '/temp0/.ps5-react-keep-state.json';
const FOCUS = 'focus';
const SAVE_MS = 200;
// Long enough for a screen's elements to mount and lay out; an input before it ends the wait.
const RESTORE_MS = 3000;

let kept = null;
let saving = null;

function store() {
  if (kept) return kept;
  kept = new Map();
  try {
    for (const [key, value] of Object.entries(JSON.parse(FileSystem.readFile(FILE)))) kept.set(key, value);
  } catch {
    // No file yet (the first start of npm run dev), or one the last session left half written: start afresh.
  }
  return kept;
}

function save() {
  saving = null;
  try {
    FileSystem.writeFile(FILE, JSON.stringify(Object.fromEntries(store())));
  } catch (error) {
    console.error(`keep-state: not saved: ${error?.message ?? error}`);
  }
}

function keep(key, value) {
  store().set(key, value);
  saving ??= setTimeout(save, SAVE_MS);
}

/** Plain data only: what comes back from JSON as it went in. */
function plain(value, depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth > 16 || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.every(item => plain(item, depth + 1));
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) &&
    Object.values(value).every(item => plain(item, depth + 1));
}

/**
 * useState that npm run dev keeps across a restart on save; the app never calls it itself.
 * @template T
 * @param {string} site  The call site: file, component and the order of its useState calls.
 * @param {T | (() => T)} initial
 * @returns {[T, (next: T | ((previous: T) => T)) => void]}
 */
export function useKeptState(site, initial) {
  const key = `${site}@${useId()}`;
  const [value, setValue] = useState(() => {
    const saved = store().get(key);
    if (saved !== undefined) return saved;
    const first = typeof initial === 'function' ? initial() : initial;
    if (plain(first)) keep(key, first);
    return first;
  });
  const set = useCallback(next => {
    setValue(previous => {
      const value = typeof next === 'function' ? next(previous) : next;
      if (plain(value)) keep(key, value);
      else if (store().delete(key)) saving ??= setTimeout(save, SAVE_MS);
      return value;
    });
  }, [key]);
  return [value, set];
}

// Focus: the focused element's focusKey is kept as it moves; after a restart it is focused again once it has
// mounted, unless the player moved first.
if (globalThis.__PS5_REACT_KEEP_STATE__) {
  const wanted = store().get(FOCUS);
  let waited = 0;
  let restoring = typeof wanted === 'string';
  const stop = restoring ? onFrame(elapsed => {
    waited += elapsed;
    if (restoring && manager.focused?.props.focusKey !== wanted && manager.focus(wanted)) restoring = false;
    if (!restoring || waited > RESTORE_MS) {
      restoring = false;
      stop();
    }
  }) : null;
  // A press before the element is back means the player has moved on.
  if (restoring) subscribeInput(() => { restoring = false; });
  manager.subscribe(() => {
    const key = manager.focused?.props.focusKey;
    // While restoring, the screen's own first focus is not what to keep.
    if (restoring && key !== wanted) return;
    restoring = false;
    if (typeof key === 'string' && store().get(FOCUS) !== key) keep(FOCUS, key);
  });
}
