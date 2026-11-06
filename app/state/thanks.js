// The one thank-you (0.5.6): after a player's fifth download to finish, a toast says once that Jobee'sLair is free
// and made by one person, and where Support development is (ui/DownloadToast.jsx). The count and that it was shown
// are kept in settings.json; it never comes again, and nothing else in the app asks for anything.

import { loadList, saveList } from './saved.js';

  var SETTINGS = "settings.json";
  var THANKS_AFTER = 5;
  // One more download finished: true when it is the fifth, so the thank-you shows now (and is marked shown).
  function countFinished() {
    const settings = loadList(SETTINGS, "settings");
    if (settings.thanked === true) return false;
    const finished = (Number.isSafeInteger(settings.finished) && settings.finished > 0 ? settings.finished : 0) + 1;
    const now = finished >= THANKS_AFTER;
    const rest = { ...settings };
    delete rest.finished;
    saveList(SETTINGS, "settings", now ? { ...rest, thanked: true } : { ...rest, finished });
    return now;
  }

export { THANKS_AFTER, countFinished };
