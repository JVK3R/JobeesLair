// 0.5.2: how pages move when the announcement bar comes or goes (ui/AnnouncementBar.jsx usePageGlide). They used to
// jump the 66 px at once, wherever the gamer was. Now they glide, the whole page as one piece, drawn moved (y, a
// translate). LayoutAnimation, tried first, moved each node on its own, and buttons came apart from their labels on
// the way. Both ways pass through laid out as without the bar but drawn under it: coming, the page glides down into
// that and then takes its new layout; going, it takes the old layout drawn where it was, then glides up. A layout
// change is only ever made where it looks the same, and the engine sets a zero-length y before the next frame. What
// is laid out past the bottom for that moment slides under the button bar.

import { EASE_OUT } from './ease.js';

  var GLIDE = { type: "tween", duration: 0.32, ease: EASE_OUT };
  var SNAP = { type: "tween", duration: 0 };
  // Once a glide has had its time, the step after it.
  var GLIDE_MS = 360;
  // After a step made at once, a moment before a glide: the engine sets the zero-length y in the microtask after
  // React's commit, and a glide asked for before that started from where the page was, so it jumped there.
  var SETTLE_MS = 50;
  /**
   * `place`: { top (the layout's offset), y (the drawing's), glide (whether y glides there) }, both in screen px; `up`:
   * whether the bar is up; `space`: how far it moves pages. Returns the next place on the way and how long to wait
   * before taking it ({ place, after }), or null when the page is where it belongs.
   */
  function nextPlace(place, up, space) {
    if (up) {
      if (place.top === space) return null;
      if (place.y !== space) return { place: { top: 0, y: space, glide: true }, after: 0 };
      return { place: { top: space, y: 0, glide: false }, after: place.glide ? GLIDE_MS : 0 };
    }
    if (place.top === space) return { place: { top: 0, y: space, glide: false }, after: 0 };
    if (place.y !== 0) return { place: { top: 0, y: 0, glide: true }, after: place.glide ? 0 : SETTLE_MS };
    return null;
  }

export { GLIDE, GLIDE_MS, SETTLE_MS, SNAP, nextPlace };
