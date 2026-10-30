// 0.5.4: on the PS4, pictures from Sony's servers come through Jobee'sLair online's /v1/picture (tools/online): a
// jailbroken PS4's network usually blocks Sony so that it cannot update, and most covers and screenshots live there.

import { Image } from '@ps5-react/core';
import { ONLINE_URL } from './online.js';
import { PS4 } from './ps4.js';

  var SONY = /^https:\/\/(?:image\.api\.playstation\.com|poseidon\.dl\.playstation\.net)\//;
  var pictureRoute = (uri) => SONY.test(uri) ? `${ONLINE_URL}/v1/picture?u=${encodeURIComponent(uri)}` : null;
  if (PS4) Image.setRouter?.(pictureRoute);

export { pictureRoute };
