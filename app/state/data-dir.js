// Where Jobee'sLair keeps its files (settings, PIN, feeds, theme, download queue) in the console's data
// storage. Early builds kept them in a folder named "overdrive"; those files are still read until the
// first save into the current folder, so renaming the folder loses nothing.

import { FileSystem } from '@ps5-react/core';

  var DATA_DIR = `${FileSystem.dataDir}/JobeesLair`;
  var LEGACY_DATA_DIR = `${FileSystem.dataDir}/overdrive`;
  var exists = (path) => {
    try {
      return FileSystem.exists(path);
    } catch {
      return false;
    }
  };
  // The path to read a file from: the current folder's, else an older build's, else the current one.
  function readPath(name) {
    const current = `${DATA_DIR}/${name}`;
    if (exists(current)) return current;
    const legacy = `${LEGACY_DATA_DIR}/${name}`;
    return exists(legacy) ? legacy : current;
  }

export { DATA_DIR, LEGACY_DATA_DIR, readPath };
