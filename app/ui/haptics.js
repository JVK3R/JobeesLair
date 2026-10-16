// ../pub-game-store/native/ui/haptics.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: navigation haptics are a setting, on unless the player turns them off (Jobee'sLair).

import { useEffect, useState } from 'react';
import { loadList, saveList } from '../state/saved.js';
import { Controller, useNavigationEvents } from '@ps5-react/core';

  var TICK = [0.09, 35];
  var PRESS = [0.15, 30];
  var BACK = [0.11, 20];
  var PAGE = [0.18, 35];
  var EDGE = [0.18, 25];
  var NOTICE = [0.25, 140];
  var PAGE_ACTIONS = /* @__PURE__ */ new Set(["l1", "r1", "l2", "r2"]);
  var EDGE_GAP_MS = 70;
  // A pulse never throws into navigation: a pad that refuses it (disconnected, asleep) just stays still.
  var pulse2 = ([strength, ms]) => {
    try {
      Controller.vibrate(strength, ms);
    } catch (error) {
      console.log(`haptics: ${error?.message ?? error}`);
    }
  };
  // A light tick on every focus move, press and page change, on from the start; turning it off is
  // kept in settings.json (vibration: false) beside the language. Each pulse only sets the motors
  // (Controller.vibrate posts to the pad, which stops them itself), so scrolling never waits on it.
  // The finished-download pulse is a notice, not navigation, and stays on either way.
  var SETTINGS = "settings.json";
  var navigationHaptics = loadList(SETTINGS, "settings").vibration !== false;
  var listeners = /* @__PURE__ */ new Set();
  function setNavigationHaptics(on) {
    navigationHaptics = on;
    saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), vibration: on });
    for (const listener of listeners) listener(on);
  }
  function useNavigationHaptics() {
    const [on, setOn] = (0, useState)(navigationHaptics);
    (0, useEffect)(() => {
      listeners.add(setOn);
      return () => {
        listeners.delete(setOn);
      };
    }, []);
    return on;
  }
  function useInterfaceHaptics() {
    useNavigationEvents((event) => {
      if (!navigationHaptics) return;
      if (event.type === "move") pulse2(TICK);
      else if (event.type === "blocked") {
        pulse2(EDGE);
        setTimeout(() => navigationHaptics && pulse2(EDGE), EDGE_GAP_MS);
      } else if (event.type === "press") pulse2(event.handled ? PRESS : EDGE);
      else if (event.handled && event.type === "back") pulse2(BACK);
      else if (event.handled && PAGE_ACTIONS.has(event.action)) pulse2(PAGE);
      else if (event.handled) pulse2(PRESS);
    });
  }
  var pulseNotice = () => pulse2(NOTICE);

export { pulseNotice, setNavigationHaptics, useInterfaceHaptics, useNavigationHaptics };
