// ../pub-game-store/native/state/downloads.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: the queue gets no browser capture; it only served Vikingfile.
// MODIFIED: storageRoots and freeBytes read state/drives.js, which keeps the drives and their space off the
// render thread (a drive waking up froze the screen when they were asked for synchronously).

import { t } from '../i18n/core.js';
import { getGame } from './catalog.js';
import { DATA_DIR } from './data-dir.js';
import { createDownloadQueue } from './download-queue.js';
import { createSourceResolver } from './download-sources.js';
import { createMockDownloadQueue } from './mock-download-queue.js';
import { freeBytes, storageRoots } from './drives.js';
import { createShadowMountProbe } from './shadowmount.js';
import { Archives, DownloadFormats, Downloads, FileSystem, Http, Linking, Notifications, Packages, Platform, Power } from '@ps5-react/core';

  var instance;
  var mocked = () => Platform.OS !== "ps5" && FileSystem.exists(`${DATA_DIR}/mock-downloads`);
  var stateDir = Platform.OS === "ps5" ? "/data/ps5-react/PPSA99058/queue" : void 0;
  var downloadQueue = () => instance ?? (instance = mocked() ? createMockDownloadQueue() : createDownloadQueue({
    fs: FileSystem,
    archives: Archives,
    downloads: Downloads,
    http: Http,
    formats: DownloadFormats,
    dataDir: FileSystem.dataDir,
    stateDir,
    platform: Platform.OS,
    notifications: Notifications,
    power: Power,
    linking: Linking,
    sources: createSourceResolver({ http: Http }),
    packages: Packages,
    releasesOf: (id) => getGame(id)?.releases || []
  }));
  var shadowMountUp = Platform.OS === "ps5" ? createShadowMountProbe({ http: Http, now: Date.now }) : async () => true;
  function driveName(root2) {
    if (root2 === "/data") return t("drives.internal");
    const mount = /^\/mnt\/(usb|ext)(\d+)$/.exec(root2);
    if (!mount) return t("drives.thisDevice");
    return t(mount[1] === "usb" ? "drives.usb" : "drives.extended", { number: String(Number(mount[2]) + 1) });
  }

export { downloadQueue, driveName, freeBytes, shadowMountUp, storageRoots };
