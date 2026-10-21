// The one-time "What's new" panel (0.5.0 Pre Release 4): shown once per release that has one, after the store
// comes up; the release it was last shown for is kept in settings.json.

import { loadList, saveList } from './saved.js';

  var SETTINGS = "settings.json";
  // Raised when a release has a new panel to show (ui/WhatsNew.jsx).
  var WHATS_NEW = "0.5.0";
  var shouldShowWhatsNew = () => loadList(SETTINGS, "settings").whatsNewSeen !== WHATS_NEW;
  function markWhatsNewSeen() {
    saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), whatsNewSeen: WHATS_NEW });
  }

export { WHATS_NEW, markWhatsNewSeen, shouldShowWhatsNew };
