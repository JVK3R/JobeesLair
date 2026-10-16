// ../pub-game-store/native/ui/sounds.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: a sound the host cannot play is logged, never thrown into navigation.

import back from '../assets/sounds/back.wav';
import confirm from '../assets/sounds/confirm.wav';
import error from '../assets/sounds/error.wav';
import focus from '../assets/sounds/focus.wav';
import notify from '../assets/sounds/notify.wav';
import page from '../assets/sounds/page.wav';
import { Sound, useNavigationEvents } from '@ps5-react/core';

  var PAGE_PAN = { l1: -0.4, l2: -0.4, r1: 0.4, r2: 0.4 };
  function play(sound, options) {
    try {
      Sound.play(sound, options);
    } catch (problem) {
      console.log(`sounds: ${problem?.message ?? problem}`);
    }
  }
  function useInterfaceSounds() {
    useNavigationEvents((event) => {
      if (event.type === "move") play(focus);
      else if (event.type === "blocked") play(error);
      else if (event.type === "press") play(event.handled ? confirm : error);
      else if (event.handled && event.type === "back") play(back);
      else if (event.handled && event.action in PAGE_PAN) play(page, { pan: PAGE_PAN[event.action] });
      else if (event.handled) play(confirm);
    });
  }
  var playNotify = () => play(notify);

export { playNotify, useInterfaceSounds };
