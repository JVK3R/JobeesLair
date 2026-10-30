// The one-time "What's new" panel (0.5.0 Pre Release 4): shown once per release that has one, after the store
// comes up; the release it was last shown for is kept in settings.json.

import { loadList, saveList } from './saved.js';

  var SETTINGS = "settings.json";
  // Raised when a release has a new panel to show (ui/WhatsNew.jsx). 0.5.2: its online card is where players
  // learn the anonymous stats are on, and where to turn them off. 0.5.3: PS5 packages, Homebrew search, Discover's
  // top games, "Device busy". 0.5.4: the PS5 keyboard, the phone companion live, focus, symbols and emoji.
  var WHATS_NEW = "0.5.4";
  var shouldShowWhatsNew = () => loadList(SETTINGS, "settings").whatsNewSeen !== WHATS_NEW;
  // The release whose panel was shown last ("" for none: a new install).
  var lastWhatsNewSeen = () => {
    const seen = loadList(SETTINGS, "settings").whatsNewSeen;
    return typeof seen === "string" ? seen : "";
  };
  function markWhatsNewSeen() {
    saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), whatsNewSeen: WHATS_NEW });
  }

export { WHATS_NEW, lastWhatsNewSeen, markWhatsNewSeen, shouldShowWhatsNew };
