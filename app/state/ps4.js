// Whether the app runs on the PS4: the same app as the PS5's, built by ps5-react's tools/build_ps4.py. There it
// lists the PS4's games only (catalog.js) and keeps its animations light (ui/light-motion.js).

import { Platform } from '@ps5-react/core';

  var PS4 = (() => {
    try {
      return Platform.OS === "ps4";
    } catch {
      return false;
    }
  })();

export { PS4 };
