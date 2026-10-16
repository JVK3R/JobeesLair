// The console's facts that do not change while the app runs (system language, firmware, model), read once.
// DeviceInfo.get() also reads both temperature sensors, the CPU clock, free memory and process time on
// every call: on the PS5 those are kernel and sensor calls on the render thread. Settings asked for it
// on each draw of its language card, the source picker on each of its draws; nothing in a render does
// now.

import { DeviceInfo } from '@ps5-react/core';

  var EMPTY = { language: null, firmware: null, model: null };
  var known = null;
  function deviceFacts() {
    if (known) return known;
    try {
      const info = DeviceInfo.get();
      known = { language: info?.language || null, firmware: info?.firmware || null, model: info?.model || null };
    } catch {
      return EMPTY;
    }
    return known;
  }

export { deviceFacts };
