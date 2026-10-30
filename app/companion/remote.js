// The phone's virtual remote and shortcuts, on the console side. A remote press goes in exactly as a
// controller button does (the host's input protocol, __ps5ReactDispatch): focus moves, sounds and
// vibration follow, and Back closes what it would close. Shortcuts that open a part of the store are
// handed to the navigation (Header.jsx, useRemoteShortcuts), which owns the sections and Settings.

import { useEffect, useRef } from 'react';
import { cancelForPhone } from '../state/system-keyboard.js';

  var listeners = /* @__PURE__ */ new Set();
  function pressRemote(action) {
    // 0.5.4: the PS5 keyboard takes the controller's buttons, but the remote's reach the app beneath it: Back closes
    // the keyboard, as Circle does on the controller.
    if (action === "back" && cancelForPhone()) return;
    const dispatch = globalThis.__ps5ReactDispatch;
    if (typeof dispatch !== "function") throw new Error("This console build takes no remote input.");
    dispatch(action);
  }
  // Runs on the companion's timer: a shortcut nobody listens for (the store not mounted yet) is dropped.
  function runShortcut(action) {
    for (const listener of listeners) {
      try {
        listener(action);
      } catch (error) {
        console.log(`companion: shortcut ${action} failed: ${error?.message}`);
      }
    }
  }
  // `handler(action)`: "home" | "downloads" | "search" | "settings" | "homebrew" (the latest handler is called).
  function useRemoteShortcuts(handler) {
    const latest = (0, useRef)(handler);
    latest.current = handler;
    (0, useEffect)(() => {
      const listener = (action) => latest.current(action);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }, []);
  }

export { pressRemote, runShortcut, useRemoteShortcuts };
