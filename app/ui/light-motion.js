// Light motion on the PS4: its CPU draws every frame slower than the PS5's, so there every animation is a short
// ease-out (the runtime's setLightMotion), and the launch screen and the game page drop their longer moves.
// Importing this turns it on; index.jsx does that before anything animates.

import { setLightMotion } from '@ps5-react/core';
import { PS4 } from '../state/ps4.js';

  var LIGHT = PS4;
  setLightMotion(LIGHT);

export { LIGHT };
