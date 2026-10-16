// ../pub-game-store/native/browse/useSlides.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: one deadline-based timer (pausing keeps the exact time left, without drift or extra renders),
// and focus that settles before it takes the hero over: a held d-pad passing over the thumbnails does
// not swap the 1824×600 hero image and restart its blurb on every step, which stuttered and let
// presses pile up behind the decode.

import { useEffect, useRef, useState } from 'react';

  var SLIDE_MS = 7e3;
  // A focused thumbnail takes the hero over once focus has rested on it this long.
  var SETTLE_MS = 160;
  function useSlides(count, enabled) {
    const [active, setActive] = (0, useState)(0);
    const [held, setHeld] = (0, useState)(false);
    // Time left on the shown slide when its timer last stopped: the timer and the progress bar resume from it.
    const [left, setLeft] = (0, useState)(SLIDE_MS);
    const deadline = (0, useRef)(0);
    const remaining = (0, useRef)(SLIDE_MS);
    const current = (0, useRef)(active);
    current.current = active;
    const settling = (0, useRef)(null);
    const running = enabled && !held && count > 1;
    (0, useEffect)(() => {
      if (!running) return void 0;
      deadline.current = Date.now() + left;
      const id = setTimeout(() => {
        setActive((index) => (index + 1) % count);
        setLeft(SLIDE_MS);
      }, left);
      return () => {
        clearTimeout(id);
        remaining.current = Math.max(0, deadline.current - Date.now());
      };
    }, [running, active, left, count]);
    // Stopped (held by focus, or the page hidden): the bar stays where the time stood.
    (0, useEffect)(() => {
      if (!running) setLeft(remaining.current);
    }, [running]);
    (0, useEffect)(() => () => clearTimeout(settling.current), []);
    const [actions] = (0, useState)(() => {
      const select = (index) => {
        clearTimeout(settling.current);
        settling.current = null;
        if (index === current.current) return;
        remaining.current = SLIDE_MS;
        setActive(index);
        setLeft(SLIDE_MS);
      };
      return {
        select,
        // A thumbnail took focus: the timer holds now; the slide follows once focus rests there.
        focus(index) {
          setHeld(true);
          clearTimeout(settling.current);
          settling.current = setTimeout(() => select(index), SETTLE_MS);
        },
        // Focus left the thumbnails (or moves to the next, whose focus comes right after).
        blur() {
          clearTimeout(settling.current);
          settling.current = null;
          setHeld(false);
        }
      };
    });
    return { active, left, paused: !running, ...actions };
  }

export { SETTLE_MS, SLIDE_MS, useSlides };
