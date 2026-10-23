// Runs the title-ID migration (title-migration.js) as the app loads: imported first by index.jsx, so it has
// finished before anything reads a saved file (some modules, i18n's language among them, read theirs as they
// are imported). Only on the console; the preview has no earlier title. What it did is kept in `migrationLog`,
// which the boot writes to the debug log once that is open.

import { FileSystem, Platform } from '@ps5-react/core';
import { TITLE_ID } from '../version.js';
import { HOMEBREW_ONLY } from '../edition.js';
import { DATA_DIR } from './data-dir.js';
import { OLD_TITLE_ID, migrateFromOldTitle } from './title-migration.js';

  var migrationLog = [];
  if (Platform.OS === "ps5" && TITLE_ID !== OLD_TITLE_ID && !HOMEBREW_ONLY) {
    const log = (line) => {
      migrationLog.push(line);
      console.log(line);
    };
    try {
      migrateFromOldTitle({ fs: FileSystem, log, dataDir: DATA_DIR, queueDir: `/data/ps5-react/${TITLE_ID}/queue` });
    } catch (error) {
      log(`[migrate] failed: ${error.message}`);
    }
  }

export { migrationLog };
