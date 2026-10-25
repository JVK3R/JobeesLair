// The store's sections (0.5.2, from ui/useSections.js, so the render tests can load them): which one the store's
// filters and sort make current, and the order L1 and R1 step through. Browse ("catalog") is a section of its own
// between Discover and Top rated: the whole catalog A to Z, or with a filter, or in an order no other section has.
// It used to be only its menu, so L1 and R1 stepped from Discover to Top rated past it.

import { activeCount } from '../state/catalog.js';
import { HOMEBREW_ONLY } from '../edition.js';

  // 0.5.1: the homebrew-only edition steps between the Homebrew section and Settings.
  var TABS = HOMEBREW_ONLY ? ["homebrew", "settings"] : ["search", "discover", "catalog", "top", "new", "homebrew", "favorites", "downloads", "files", "settings"];
  // Browse as R1 and its menu's "All games" open it.
  var BROWSE_SORT = "title";
  function sectionOf({ filters, sort }, query) {
    if (filters.wishlist) return "favorites";
    if (sort === "rating") return "top";
    if (sort === "newest") return "new";
    if (activeCount(filters) > 0 || query || sort === "title" || sort === "size") return "catalog";
    return "discover";
  }
  // The section L1 (back) or R1 (forward) goes to from `current`, or null at the ends.
  function stepFrom(current, forward) {
    const at = TABS.indexOf(current);
    return TABS[forward ? at + 1 : at - 1] ?? null;
  }

export { BROWSE_SORT, TABS, sectionOf, stepFrom };
