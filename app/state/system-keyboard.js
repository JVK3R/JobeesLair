// The PS5's own keyboard for typing (0.5.4): searches, links and keys are typed on the console's system keyboard
// (ps5-react Keyboard), in the player's language and input method, wherever it opens. The store's own keys
// (search/DockKeyboard.jsx, search/Keyboard.jsx) stay for when it cannot: a console where it is not there or
// refuses, or a player who picks them in Settings (live results while typing).
// It has not run on a console before 0.5.4, so it guards itself: the app notes in settings.json that it is opening
// one and clears the note once it closes. A note still there at the next launch means the app stopped while the
// keyboard was up. Once can be the player closing the app with it open; twice in a row (no keyboard closing in
// between), the store's keys are used from then on (Settings can turn the PS5 keyboard back on).

import { useEffect, useState } from 'react';
import { Keyboard } from '@ps5-react/core';
import { loadList, saveList } from './saved.js';
import { log } from '../services/logger.js';

  var SETTINGS = "settings.json";
  // settings.json typing: "system" (the default: the PS5 keyboard where it opens) or "keys" (the store's own).
  var choice = null;
  var listeners = /* @__PURE__ */ new Set();
  // Refused once this launch (it threw, or the system said no): the store's keys until the app is opened again.
  var refused = false;
  // Keyboards the system closed with no answer (not the player backing out of one) this launch: at the second, the
  // store's keys until the app is opened again, so a keyboard that never stays up can't keep the player from typing.
  var MAX_ABORTED = 2;
  var aborted = 0;
  // Closed because the phone answered the box it was up for (closeForPhone): its "aborted" is the phone's doing, not
  // the system's, and reads "phone". Closed from the phone with no answer (cancelForPhone: its Close, or Back on its
  // remote): reads "cancelled", as backing out with Circle does, and is not counted either.
  var phoneClosed = false;
  var phoneCancelled = false;
  function settings() {
    return loadList(SETTINGS, "settings");
  }
  function save(change) {
    saveList(SETTINGS, "settings", { ...settings(), ...change });
  }
  function typingChoice() {
    if (choice !== null) return choice;
    const saved = settings();
    choice = saved.typing === "keys" ? "keys" : "system";
    // The note a keyboard leaves while it is up: still there, the app stopped with it open. `keyboardStopped`: it
    // did the time before as well, with no keyboard closing since.
    if (saved.keyboardOpen && saved.keyboardStopped) {
      log("keyboard", "the app stopped while the PS5 keyboard was open, twice in a row; typing with the store's keys");
      choice = "keys";
      save({ typing: "keys", keyboardOpen: void 0, keyboardStopped: saved.keyboardOpen });
    } else if (saved.keyboardOpen) {
      log("keyboard", "the app stopped while the PS5 keyboard was open last time; keeping it (twice in a row switches to the store's keys)");
      save({ keyboardOpen: void 0, keyboardStopped: saved.keyboardOpen });
    }
    return choice;
  }
  function setTypingChoice(next) {
    choice = next === "keys" ? "keys" : "system";
    refused = false;
    aborted = 0;
    save({ typing: choice, keyboardOpen: void 0, keyboardStopped: void 0 });
    for (const listener of listeners) listener(choice);
  }
  function useTypingChoice() {
    const [value, setValue] = useState(typingChoice);
    useEffect(() => {
      listeners.add(setValue);
      return () => {
        listeners.delete(setValue);
      };
    }, []);
    return value;
  }
  // Whether typing opens the PS5 keyboard now.
  function systemKeyboardOn() {
    if (refused || typingChoice() !== "system") return false;
    try {
      return Keyboard.available;
    } catch {
      return false;
    }
  }
  // Opens the PS5 keyboard: resolves {status: "done" | "cancelled" | "aborted", text}, or null when it could not open
  // (then type with the store's keys). `options` are Keyboard.open's (title, text, placeholder, maxLength, type, enter).
  function typeOnSystemKeyboard(options) {
    if (!systemKeyboardOn()) return Promise.resolve(null);
    let opened;
    phoneClosed = phoneCancelled = false;
    save({ keyboardOpen: Date.now() });
    try {
      opened = Keyboard.open(options);
    } catch (error) {
      refused = true;
      save({ keyboardOpen: void 0 });
      log("keyboard", `the PS5 keyboard did not open: ${error?.message}; typing with the store's keys`);
      return Promise.resolve(null);
    }
    return opened.then((result) => {
      // It closed with the app running: a stop with it open before no longer counts toward twice in a row.
      save({ keyboardOpen: void 0, keyboardStopped: void 0 });
      if (result?.status === "aborted" && phoneClosed) {
        phoneClosed = false;
        return { status: "phone", text: "" };
      }
      if (result?.status === "aborted" && phoneCancelled) {
        phoneCancelled = false;
        return { status: "cancelled", text: "" };
      }
      if (result?.status === "aborted" && ++aborted >= MAX_ABORTED) {
        refused = true;
        log("keyboard", "the system closed the PS5 keyboard with no answer again; typing with the store's keys until the next launch");
        return null;
      }
      return result;
    }, (error) => {
      refused = true;
      save({ keyboardOpen: void 0 });
      log("keyboard", `the PS5 keyboard failed: ${error?.message}; typing with the store's keys`);
      return null;
    });
  }
  // 0.5.4: the phone answered the box the PS5 keyboard is up for (state/phone-typing.js): it closes, and its promise
  // resolves {status: "phone"}, which the box takes as "already answered".
  function closeForPhone() {
    try {
      if (!Keyboard.isOpen) return;
      phoneClosed = true;
      Keyboard.close();
    } catch (error) {
      phoneClosed = false;
      log("keyboard", `the PS5 keyboard did not close for the phone: ${error?.message}`);
    }
  }
  // 0.5.4: the phone closed the box without answering it (its Close, or Back on its remote): the PS5 keyboard closes
  // as if backed out of with Circle. False when it wasn't up.
  function cancelForPhone() {
    try {
      if (!Keyboard.isOpen) return false;
      phoneCancelled = true;
      Keyboard.close();
      return true;
    } catch (error) {
      phoneCancelled = false;
      log("keyboard", `the PS5 keyboard did not close for the phone: ${error?.message}`);
      return false;
    }
  }

export { cancelForPhone, closeForPhone, setTypingChoice, systemKeyboardOn, typeOnSystemKeyboard, typingChoice, useTypingChoice };
