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
import { createShadowClient, createShadowMountProbe } from './shadowmount.js';
import { createMountMonitor, mountMonitor } from './mount-monitor.js';
import { createPlaytime, playtimeStore } from './playtime.js';
import { parseStamp } from './clock.js';
import { deviceFacts } from './device.js';
import { Archives, DeviceInfo, DownloadFormats, Downloads, FileSystem, Http, Linking, Notifications, Packages, Platform, Power } from '@ps5-react/core';

  var instance;
  var mocked = () => Platform.OS !== "ps5" && FileSystem.exists(`${DATA_DIR}/mock-downloads`);
  var stateDir = Platform.OS === "ps5" ? "/data/ps5-react/PPSA99058/queue" : void 0;
  var utcOffset = (ms) => {
    try {
      return DeviceInfo.utcOffset(ms);
    } catch {
      return 0;
    }
  };
  // Hours played per title, beside the queue (whose ShadowMount log reads feed it).
  var playtime = playtimeStore(() => createPlaytime({ fs: FileSystem, file: `${stateDir ?? DATA_DIR}/playtime.json`, offsetMinutes: utcOffset }));
  // ShadowMount's mounts and each game's health, asked in the background (never behind a download).
  if (Platform.OS === "ps5") mountMonitor(() => createMountMonitor({
    client: createShadowClient({ http: Http, transferring: () => downloadQueue().transferring?.() ?? false, quiet: (reason, work) => downloadQueue().quietNetwork(reason, work) }),
    fs: FileSystem,
    parse: (value) => parseStamp(value, utcOffset(Date.now())),
    onLaunch: (title, at) => title !== "PPSA99058" && playtime.played(title, at)
  }));
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
    releasesOf: (id) => getGame(id)?.releases || [],
    firmware: () => deviceFacts().firmware,
    playtime
  }));
  var shadowMountUp = Platform.OS === "ps5" ? createShadowMountProbe({ http: Http, now: Date.now }) : async () => true;
  function driveName(root2) {
    if (root2 === "/data") return t("drives.internal");
    const mount = /^\/mnt\/(usb|ext)(\d+)$/.exec(root2);
    if (!mount) return t("drives.thisDevice");
    return t(mount[1] === "usb" ? "drives.usb" : "drives.extended", { number: String(Number(mount[2]) + 1) });
  }

export { downloadQueue, driveName, freeBytes, shadowMountUp, storageRoots };
