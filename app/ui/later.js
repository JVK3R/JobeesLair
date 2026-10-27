// 0.5.3: what a page holds below its first screenful is built after that screenful, one part every STEP_MS, so
// the frame that first draws the page holds only what shows. The store is built as the startup reveal begins
// (index.jsx): Discover whole, about a hundred cards, held the console for almost a second there, and the reveal
// stood still for it. Its parts below wait for the reveal to end (laterReady), then come in their turn order.
// A part that is never let through by laterReady comes on its own after FALLBACK_MS.

import { useEffect, useState } from 'react';

  var STEP_MS = 30;
  var FALLBACK_MS = 6e3;
  var ready = false;
  var waiting = [];
  var timer = 0;
  function pump() {
    timer = 0;
    if (!ready || !waiting.length) return;
    waiting.sort((a, b) => a.turn - b.turn);
    waiting.shift().release();
    if (waiting.length) timer = setTimeout(pump, STEP_MS);
  }
  function schedule() {
    if (ready && !timer && waiting.length) timer = setTimeout(pump, 0);
  }
  // From now on the waiting parts come, and parts mounted later (the store built again for a theme) come at once
  // in their turn.
  function laterReady() {
    ready = true;
    schedule();
  }
  function Later({ turn, children }) {
    const [shown, setShown] = useState(false);
    useEffect(() => {
      if (shown) return void 0;
      const entry = { turn, release: () => setShown(true) };
      waiting.push(entry);
      schedule();
      const fallback = setTimeout(entry.release, FALLBACK_MS);
      return () => {
        clearTimeout(fallback);
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
      };
    }, [shown]);
    return shown ? children : null;
  }

export { Later, laterReady };
