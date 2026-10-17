// ../pub-game-store/native/state/download-queue.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: an Archive.org refusal fails over or fails as a dead link instead of asking for the browser.
// MODIFIED: an archive the catalog's password doesn't open is tried with the known release passwords.
// MODIFIED: the Vikingfile browser capture is gone; every browser source opens the browser as is.
// MODIFIED: every image of a set is tracked, payloads are checked before ShadowMount can see them, and a
// title counts as installed once ShadowMount reports it installed and managed from files it can reach.

import { INCOMPLETE_PART, STALE_PARTIAL, cause } from '../downloads/errors.js';
import { t } from '../i18n/core.js';
import { archivePassword } from './archive-password.js';
import { consoleFirmware, firmwareText, newerFirmware, requiredFirmware } from './firmware.js';
import { diagnoseLaunch, launchOutcomes } from './launch-diagnosis.js';
import { reportLink } from './link-health.js';
import { BrowserRequired, archiveRefusal, cancellation, createSourceResolver, sourceKind, webURL } from './download-sources.js';
import { readJSON } from './read-json.js';
import { busyWhileOpen, mountedImages, reregister, shadowRequest, within2 } from './shadowmount.js';
import { formatBytes } from './size.js';
import { MARGIN2, spaceShortfall, stillNeeded } from './space.js';

  var ACTIVE = ["resolving", "connecting", "downloading", "verifying", "extracting", "installing", "pausing"];
  var BUSY = ["queued", ...ACTIVE];
  // "attention": ShadowMount installed the title but reports a real problem with it: it cannot reach the
  // files (a drive gone) or does not manage them. Checking again moves it on once that is fixed.
  var COMPLETE = ["downloaded", "file-downloaded", "installer-required", "installed", "extraction-required", "extracted", "attention"];
  // What "Delete from disk" takes: a finished job, or one stopped part-way that still holds files.
  var DELETABLE = [...COMPLETE, "paused", "failed", "awaiting-browser"];
  // The states that wait on ShadowMount's word before they can be "installed".
  var AWAITING_INSTALL = ["downloaded", "attention"];
  // Disk images ShadowMount mounts. An archive can hold several (a base game and its update, say).
  var IMAGE = /\.(ffpfsc|ffpfs|ffpkg|exfat)$/i;
  // An image named as an update, patch or add-on rather than the base game: the base goes first.
  var ADDON = /(?:^|[^a-z])(?:update|patch|dlc)(?:[^a-z]|$)/i;
  // The engine's completion receipt in an extraction's root: "P5AR001:<identity>", then "<sha256>|<path>"
  // for every file, written only after the whole archive was read and every file hashed.
  var RECEIPT = ".ps5-react-extraction";
  var baseName = (path) => path.slice(path.lastIndexOf("/") + 1);
  // What a release is for the game, by its catalog label: the game itself, an add-on, or a backport (files
  // ShadowMount lays over the game from homebrew/backports/<TITLE_ID>/ when it starts). The same tests as
  // the source picker's sections (game/sources.js).
  var BACKPORT = /\bback\s*port\b/i;
  var DLC = /\bDLCs?\b/i;
  var DLC_WITH_GAME = /\b(?:game|full)\b|\+\s*(?:all\s+)?DLCs?\b|\bwith\s+(?:all\s+)?DLCs?\b|\bincl/i;
  function roleOf(release) {
    const label = release?.label || "";
    if (BACKPORT.test(label)) return "backport";
    if (DLC.test(label) && !DLC_WITH_GAME.test(label)) return "dlc";
    return "game";
  }
  var ADOPTED = "A partial download from another source holds this name. Resume it from its original source, or delete it in Files.";
  var DELETED = "Its partial files were deleted. Restart to download it again, or remove it.";
  var REMOVAL_CUT = "The app closed while deleting its files. Delete it again.";
  // The passwords the catalog's archives are published with. Some entries name none or the wrong one,
  // so after the catalog's own (or none) these are tried in turn. A wrong or missing password is caught
  // on the archive's headers before anything is written ("RAR archive password is missing.",
  // "Incorrect RAR archive password.", "Incorrect RAR5 archive password."), and a failed attempt leaves
  // no staging behind, so each one costs a moment. They are checked on the console: nothing counts them.
  var KNOWN_PASSWORDS = ["DLPSGAME.COM", "[DLPSGAME.COM]", "www.DLPSGAME.COM", "SuperPSX", "downloadgameps3.com", "hako"];
  var PASSWORD_FAILURE = /archive password|passphrase/i;
  function durable(fs, stateDir2) {
    try {
      fs.mkdir(stateDir2, { recursive: true });
      fs.exists(`${stateDir2}/downloads.json`);
      return true;
    } catch (error2) {
      console.log(`[download-queue] ${stateDir2} unavailable, queue kept in the app data: ${error2.message}`);
      return false;
    }
  }
  function restore(saved) {
    return saved.jobs.slice(0, 32).filter((job2) => {
      const valid = job2?.release?.id && job2.root && job2.artifact?.destination;
      if (!valid) console.log(`[download-queue] dropped an invalid queue entry ${job2?.id ?? ""}`);
      return valid;
    }).map((job2) => {
      delete job2.captureState;
      delete job2.captureError;
      if (job2.state === "installing") return { ...job2, state: "installer-required" };
      // An earlier build counted a title at rest (whose runtime ShadowMount mounts only at launch) as not
      // mounted; it is checked again.
      if (job2.state === "unmounted") return { ...job2, state: "downloaded", error: "", message: "" };
      if (job2.state === "extracting") job2.written = job2.total;
      if (job2.state === "removing") {
        job2.state = job2.removingFrom ?? "failed";
        job2.error = REMOVAL_CUT;
      }
      delete job2.phase;
      delete job2.removingFrom;
      // A move the app closed in the middle of: its copy so far stays (<path>.partial) and the game stays
      // where it was; moving it again carries on from there.
      if (job2.moving) job2.moving = { ...job2.moving, interrupted: true, written: 0 };
      const interrupted = BUSY.includes(job2.state);
      return {
        ...job2,
        state: interrupted ? "paused" : job2.state,
        error: interrupted ? "Interrupted. Resume to continue." : job2.error,
        ...interrupted && job2.state !== "pausing" && { restore: job2.state === "queued" ? "queued" : "running" }
      };
    });
  }
  function createDownloadQueue({
    fs,
    downloads,
    http,
    formats,
    dataDir,
    stateDir: stateDir2 = `${dataDir}/JobeesLair`,
    platform,
    notifications,
    power,
    linking,
    sources,
    archives,
    packages,
    releasesOf,
    // The console's system software version ("13.60"), or null when it is unknown.
    firmware = () => null,
    // The play-time store (state/playtime.js): it reads the sessions out of ShadowMount's log each time the
    // queue reads that log for launches.
    playtime = null,
    wait = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms))
  }) {
    // Builds before the rename kept the queue in "overdrive"; it is read from there until the first save here.
    const legacy = `${dataDir}/overdrive/downloads.json`;
    const directory = stateDir2 === `${dataDir}/JobeesLair` || durable(fs, stateDir2) ? stateDir2 : `${dataDir}/JobeesLair`;
    const file = `${directory}/downloads.json`;
    const listeners4 = /* @__PURE__ */ new Set();
    sources ?? (sources = createSourceResolver({ http }));
    let jobs = [];
    let active2 = null;
    // Work that is asking ShadowMount and cannot wait for a download (quietNetwork); no job starts meanwhile.
    let holds = 0;
    // Who borrowed the network while the queue had nothing to do (lendNetwork): the app's own update
    // download. { yield }: asked to stop and give it back when a job is queued or ShadowMount must be asked.
    let borrower = null;
    // Whether a download holds the runtime's one network task now (ps5-react docs/NETWORKING.md).
    // A job reads "resolving" from when its file is handed to the engine until the engine's first report.
    const jobTransferring = () => Boolean(active2?.task && active2.transferring && ["resolving", "connecting", "downloading"].includes(active2.job.state));
    const transferring = () => jobTransferring() || Boolean(borrower);
    let ticks = 0;
    let awake2 = false;
    const modified = (path) => {
      try {
        return fs.stat(path)?.modified ?? 0;
      } catch {
        return 0;
      }
    };
    const candidates = [.../* @__PURE__ */ new Set([file, `${file}.tmp`, legacy])].filter((path) => {
      try {
        return fs.exists(path);
      } catch {
        return false;
      }
    }).sort((a, b) => modified(b) - modified(a));
    let stored = null;
    for (const path of candidates) {
      const saved = readJSON(
        fs,
        path,
        null,
        (value) => value?.version === 1 && Array.isArray(value.jobs),
        (message) => console.log(`[download-queue] ${message}`)
      );
      if (saved) {
        jobs = restore(saved);
        stored = path;
        break;
      }
    }
    // What ShadowMount's log said about each title's last launch ({ TITLE: { outcome, verdict, at } }),
    // kept beside the queue so it outlives the log's rotation. A finished job's snapshot carries its title's.
    const launchFile = `${directory}/launches.json`;
    let launches = readJSON(fs, launchFile, null, (value) => value?.version === 1 && value.titles && typeof value.titles === "object", (message) => console.log(`[download-queue] ${message}`))?.titles ?? {};
    const titleOf = (job2) => job2.installedTitleId ?? job2.consoleTitleId ?? job2.titleId;
    const launchOf = (job2) => job2.artifact?.nextAction === "shadowmount" && ["installed", "attention"].includes(job2.state) && launches[titleOf(job2)]?.outcome ? launches[titleOf(job2)] : null;
    const snapshot = () => jobs.map((job2) => ({ ...job2, launch: launchOf(job2) }));
    const emit2 = () => {
      const busy = jobs.some((job2) => BUSY.includes(job2.state));
      if (busy !== awake2) {
        awake2 = busy;
        power.keepAwake(busy);
      }
      const value = snapshot();
      for (const listener of listeners4) listener(value);
    };
    const save = ({ sync = true } = {}) => {
      fs.mkdir(directory, { recursive: true });
      fs.writeFile(`${file}.tmp`, JSON.stringify({ version: 1, jobs }), { sync });
      fs.rename(`${file}.tmp`, file);
    };
    const change = () => {
      save();
      emit2();
    };
    if (legacy !== file && fs.exists(legacy)) {
      try {
        if (stored === legacy) save();
        fs.rename(legacy, `${legacy}.moved`);
      } catch (error2) {
        console.log(`[download-queue] queue not moved to ${file}: ${error2.message}`);
      }
    }
    if (stored === `${file}.tmp`) {
      try {
        save();
      } catch (error2) {
        console.log(`[download-queue] queue not saved to ${file}: ${error2.message}`);
      }
    }
    const find = (id) => {
      const job2 = jobs.find((item) => item.id === id);
      if (!job2) throw new Error("Download is no longer in the queue.");
      return job2;
    };
    const artifactFor = (release, root2) => release.parts ? {
      directory: `${root2}/downloads/sets/${release.filename}`,
      destination: `${root2}/downloads/extracted/${release.filename}`,
      nextAction: "extracted"
    } : formats.artifact(release, root2);
    // Where a download is written. ShadowMount scans homebrew/ and mounts what it finds there, so an image
    // downloads to downloads/images/ and moves into homebrew/ only once it passed its check (publishImage).
    const stagedPath = (artifact2, root2) => artifact2.nextAction === "shadowmount" ? `${root2}/downloads/images/${baseName(artifact2.destination)}` : artifact2.destination;
    // What is wrong with a finished transfer, or null: the file must be there, not empty, with no partial
    // beside it, and hold exactly the bytes its source declared (or the server reported).
    function transferProblem(path, expected, result) {
      const name = baseName(path);
      const info = fs.stat(path);
      if (!info?.isFile) return `${name} is missing after its download`;
      if (!info.size) return `${name} is empty`;
      if (fs.exists(`${path}.part`)) return `${name} still has an unfinished partial file beside it`;
      const reported = Number.isSafeInteger(result?.total) && result.total > 0 ? result.total : null;
      const want = expected || reported;
      if (want && info.size !== want) return `${name} holds ${info.size} of ${want} bytes`;
      return null;
    }
    // Throws when a transfer fails its check. A staged image was never where ShadowMount looks, so it is
    // deleted and a retry downloads it again; a file already in place is kept for inspection.
    async function checkTransfer(job2, result) {
      const path = job2.downloadDestination;
      const problem = transferProblem(path, job2.options?.expectedBytes, result);
      if (!problem) return;
      console.log(`[download-queue] ${job2.id} failed its check before mounting: ${problem}`);
      let message = t("downloads.invalid", { problem });
      if (path !== job2.artifact.destination) {
        try {
          await Promise.all(["", ".complete", ".resume"].map((suffix) => fs.removeAsync(path + suffix)));
          job2.written = 0;
          message = `${message} ${t("downloads.discarded")}`;
        } catch (error2) {
          console.log(`[download-queue] ${path} not deleted:`, error2.message);
        }
      }
      throw new Error(message);
    }
    // Moves a checked image from downloads/images/ into homebrew/, where ShadowMount finds it.
    function publishImage(job2) {
      if (job2.downloadDestination === job2.artifact.destination) return;
      if (fs.exists(job2.artifact.destination)) throw new Error("Destination already exists. Choose another release or inspect the existing file.");
      fs.mkdir(job2.artifact.directory, { recursive: true });
      job2.routing = { ...job2.artifact };
      change();
      finishRouting(job2);
    }
    function invalid(job2, problem) {
      console.log(`[download-queue] ${job2.id} failed its check before mounting: ${problem}`);
      throw new Error(t("downloads.invalid", { problem }));
    }
    // The paths an extraction's completion receipt lists, or null when it has none the queue can read.
    function receiptPaths(directory3) {
      let text;
      try {
        text = fs.readFile(`${directory3}/${RECEIPT}`);
      } catch {
        return null;
      }
      const lines = text.split("\n");
      if (!lines[0]?.startsWith("P5AR001:")) return null;
      return new Set(lines.slice(1).filter((line) => line[64] === "|").map((line) => line.slice(65)));
    }
    // Checks the images of an extraction before they go where ShadowMount scans: each is a non-empty
    // regular file and, when the receipt is there, listed in it. Returns each one's path and size.
    function verifyImages(job2, paths) {
      const listed = receiptPaths(job2.output);
      if (!listed) console.log(`[download-queue] ${job2.id}: no extraction receipt, checking the images' files only`);
      return paths.map((path) => {
        const info = fs.stat(`${job2.output}/${path}`);
        if (!info?.isFile) invalid(job2, `${path} is missing from the extraction`);
        if (!info.size) invalid(job2, `${path} is empty`);
        if (listed && !listed.has(path)) invalid(job2, `${path} is not in the extraction receipt`);
        return { path, size: info.size };
      });
    }
    // The console's system software as [13, 60], or null when it is unknown.
    function thisConsole() {
      try {
        return consoleFirmware(firmware());
      } catch {
        return null;
      }
    }
    // What a game folder that passed its check may still trip over, as sentences for its message: system
    // software newer than the console's (a backport can still make it run, so it is not refused), and no
    // sce_module folder, which most PS5 games carry.
    function folderWarnings(job2, folder, param) {
      const warnings = [];
      const required = requiredFirmware(param.requiredSystemSoftwareVersion);
      const current = thisConsole();
      if (required && current && newerFirmware(required, current))
        warnings.push(t("downloads.warning.firmware", { required: firmwareText(required), current: firmwareText(current) }));
      if (!fs.stat(`${folder}/sce_module`)?.isDirectory) warnings.push(t("downloads.warning.noModules"));
      console.log(`[download-queue] ${job2.id}: ${param.titleId} ${param.contentVersion ?? ""} needs system software ${required ? firmwareText(required) : "(not stated)"}, console ${current ? firmwareText(current) : "unknown"}, sce_module ${warnings.includes(t("downloads.warning.noModules")) ? "missing" : "present"}`);
      return warnings;
    }
    // Whether an extraction root still holds files of its own once its game folder moved out (notes,
    // readmes, tools), not counting the engine's .ps5-react-* metadata.
    function holdsExtras(directory3, depth = 0, budget = { left: 2e3 }) {
      let entries2;
      try {
        entries2 = fs.readDir(directory3);
      } catch {
        return false;
      }
      for (const entry2 of entries2) {
        if (--budget.left < 0) return true;
        if (entry2.name.startsWith(".ps5-react-")) continue;
        if (!entry2.isDirectory) return true;
        if (depth < 16 && holdsExtras(`${directory3}/${entry2.name}`, depth + 1, budget)) return true;
      }
      return false;
    }
    // What an extraction root still holds once the folder that matters moved out of it (notes that may say a
    // backport is needed, say): kept as <name>-extras in downloads/extracted, outside ShadowMount's scan, and
    // deleted with the job. Returns where, or null when nothing was left (the root is deleted then).
    async function keepExtras(job2) {
      if (!holdsExtras(job2.output)) {
        await fs.removeAsync(job2.output);
        return null;
      }
      const kept = `${job2.output}-extras`;
      if (fs.exists(`${job2.output}/${RECEIPT}`)) fs.remove(`${job2.output}/${RECEIPT}`);
      if (!fs.exists(kept)) fs.rename(job2.output, kept);
      job2.extras = fs.exists(kept) ? kept : job2.output;
      console.log(`[download-queue] ${job2.id}: the archive's other files kept in ${job2.extras}`);
      return job2.extras;
    }
    // A backport archive's files go to homebrew/backports/<TITLE_ID>/, where ShadowMount lays them over the
    // game when it starts (it skips that folder when it scans for games). The folder taken is one named for
    // the title, or the archive's only top folder (followed down), or else everything the archive holds.
    async function placeBackport(job2) {
      const title = job2.titleId;
      const destination = `${job2.root}/homebrew/backports/${title}`;
      if (fs.exists(destination)) {
        console.log(`[download-queue] ${job2.id}: ${destination} already exists, the backport was kept in ${job2.output}`);
        throw new Error(t("downloads.backport.exists", { title, path: destination }));
      }
      let folder = job2.output;
      for (let depth = 0; depth < 8; depth++) {
        let entries2;
        try {
          entries2 = fs.readDir(folder).filter((entry2) => !entry2.name.startsWith(".ps5-react-"));
        } catch {
          break;
        }
        const named = entries2.find((entry2) => entry2.isDirectory && entry2.name.toUpperCase() === title);
        if (named) {
          folder = `${folder}/${named.name}`;
          break;
        }
        if (entries2.length !== 1 || !entries2[0].isDirectory) break;
        folder = `${folder}/${entries2[0].name}`;
      }
      fs.mkdir(`${job2.root}/homebrew/backports`, { recursive: true });
      storageIdentity(job2);
      fs.rename(folder, destination);
      if (folder === job2.output) {
        for (const name of [RECEIPT, ".ps5-react-stage"]) if (fs.exists(`${destination}/${name}`)) fs.remove(`${destination}/${name}`);
      }
      const extras = folder !== job2.output ? await keepExtras(job2) : null;
      console.log(`[download-queue] ${job2.id}: backport for ${title} placed in ${destination}`);
      job2.output = destination;
      job2.publishTo = destination;
      job2.backportPath = destination;
      job2.artifact.nextAction = "backport";
      job2.artifact.destination = destination;
      job2.state = "installed";
      job2.message = [t("downloads.backport.placed", { title }), extras ? t("downloads.extrasKept", { path: extras }) : ""].filter(Boolean).join(" ");
    }
    // Checks an extracted game folder: a non-empty eboot.bin and a sce_sys/param.json that parses and
    // names a title ID. Returns the two files' paths (inside the folder) and sizes, and its warnings.
    function verifyGameFolder(job2, folder) {
      const eboot = fs.stat(`${folder}/eboot.bin`);
      if (!eboot?.isFile || !eboot.size) invalid(job2, "eboot.bin is missing or empty");
      const paramPath = `${folder}/sce_sys/param.json`;
      let param;
      try {
        param = JSON.parse(fs.readFile(paramPath));
      } catch (error2) {
        invalid(job2, `sce_sys/param.json cannot be read: ${error2.message}`);
      }
      const titleId = typeof param?.titleId === "string" ? param.titleId : "";
      if (!/^[A-Z]{4}\d{5}$/.test(titleId)) invalid(job2, `sce_sys/param.json names no valid title ID (${titleId || "none"})`);
      if (titleId !== job2.titleId) {
        console.log(`[download-queue] ${job2.id}: param.json names ${titleId}, the catalog ${job2.titleId}`);
        job2.consoleTitleId = titleId;
      }
      const listed = receiptPaths(job2.output);
      const inside = folder === job2.output ? "" : `${folder.slice(job2.output.length + 1)}/`;
      for (const path of ["eboot.bin", "sce_sys/param.json"]) {
        if (listed && !listed.has(`${inside}${path}`)) invalid(job2, `${path} is not in the extraction receipt`);
      }
      return {
        files: [{ path: "eboot.bin", size: eboot.size }, { path: "sce_sys/param.json", size: fs.stat(paramPath)?.size ?? 0 }],
        warnings: folderWarnings(job2, folder, param)
      };
    }
    // A set's images, the base game first: names that read as an update, patch or add-on go last, and
    // otherwise the largest first.
    function orderImages(directory3, paths) {
      const size = (path) => fs.stat(`${directory3}/${path}`)?.size || 0;
      return [...paths].sort((a, b) => Number(ADDON.test(a)) - Number(ADDON.test(b)) || size(b) - size(a) || a.localeCompare(b));
    }
    // A payload file that is gone or changed size since its check, or null: such a job is not installed.
    function changedPayload(job2) {
      for (const { path, size } of job2.payload ?? []) {
        let info;
        try {
          info = fs.stat(path);
        } catch {
          info = null;
        }
        if (!info) return `${baseName(path)} is gone`;
        if (info.size !== size) return `${baseName(path)} is now ${info.size} bytes, it was ${size} when checked`;
      }
      return null;
    }
    function failOver(job2, error2) {
      if (job2.written || job2.parts?.some((part) => part.written) || /space|storage|drive|disconnected/i.test(cause(error2.message))) return false;
      while (job2.fallbacks?.length) {
        const next = job2.fallbacks.shift();
        const artifact2 = artifactFor(next, job2.root);
        const staged = stagedPath(artifact2, job2.root);
        if (fs.exists(artifact2.destination) || fs.exists(`${artifact2.destination}.part`) || staged !== artifact2.destination && (fs.exists(staged) || fs.exists(`${staged}.part`)) || jobs.some((other) => other !== job2 && other.artifact.destination === artifact2.destination)) continue;
        job2.message = t("downloads.switchedSource", { failed: job2.release.provider, next: next.provider });
        job2.release = { ...next };
        job2.artifact = artifact2;
        job2.total = next.sizeBytes || null;
        for (const key of ["options", "browserUrl", "directURL", "parts", "partIndex", "currentSource", "downloadDestination", "inspected", "adopted"]) delete job2[key];
        job2.error = "";
        job2.state = "queued";
        return true;
      }
      return false;
    }
    function reresolve(job2) {
      const source2 = job2.parts ? job2.currentSource : job2.release;
      if ((job2.reresolved || 0) >= 2 || ["direct", "browser", "datanodes", "manifest", "unavailable"].includes(sourceKind(source2))) return false;
      job2.reresolved = (job2.reresolved || 0) + 1;
      delete job2.options;
      if (job2.parts) delete job2.parts[job2.partIndex].options;
      job2.error = "";
      job2.state = "queued";
      return true;
    }
    async function install(job2) {
      const paths = job2.packages ?? [job2.downloadDestination || job2.artifact.destination];
      const backport = (path) => /backport/i.test(path);
      try {
        for (const path of [...paths.filter((path2) => !backport(path2)), ...paths.filter(backport)]) {
          job2.state = "installing";
          job2.written = 0;
          job2.total = null;
          job2.error = "";
          job2.message = "";
          change();
          const task = packages.install({ path, name: job2.title });
          active2.task = task;
          const off = task.subscribe((progress) => {
            job2.written = progress.written || 0;
            job2.total = progress.total ?? null;
            emit2();
          });
          try {
            await task.done;
          } catch (error2) {
            console.log(`[download-queue] install refused ${path}:`, error2.message);
            if (!backport(path) || paths.every(backport)) throw error2;
          } finally {
            off();
          }
        }
        job2.state = "installed";
        job2.message = t("downloads.installed");
        notifications.show(t("downloads.notice.installed"), job2.title);
      } catch (error2) {
        job2.state = "installer-required";
        job2.error = error2.message;
        job2.message = t("downloads.installFailed");
      }
      job2.bytesPerSecond = 0;
      delete job2.install;
      change();
    }
    const canInstall = () => Boolean(packages) && platform === "ps5";
    async function execute(job2) {
      let task;
      let unsubscribe;
      // Set when the download is stopped for want of room (see the size check in the progress handler).
      let noRoom = null;
      if (job2.install) {
        try {
          await install(job2);
        } finally {
          active2 = null;
          pump();
        }
        return;
      }
      try {
        active2.cancel = cancellation();
        const signal = active2.cancel.signal;
        job2.state = "resolving";
        job2.error = "";
        change();
        if (job2.release.parts) {
          await executeSet(job2, signal);
          return;
        }
        // A partial an older build started in place keeps downloading there; new images are staged.
        job2.downloadDestination || (job2.downloadDestination = fs.exists(`${job2.artifact.destination}.part`) ? job2.artifact.destination : stagedPath(job2.artifact, job2.root));
        // The app closed after a checked image moved into homebrew/ but before the queue was saved.
        if (job2.downloadDestination !== job2.artifact.destination && !fs.exists(job2.downloadDestination) && !fs.exists(`${job2.downloadDestination}.part`) && fs.exists(job2.artifact.destination) && fs.exists(`${job2.artifact.destination}.complete`))
          job2.downloadDestination = job2.artifact.destination;
        if (job2.routing) finishRouting(job2);
        if (!job2.options) {
          if (job2.release.manifestUrl) {
            const response = await http.request(job2.release.manifestUrl, { maxBytes: 4 * 1024 * 1024, signal });
            if (!response.ok) throw new Error(`Manifest HTTP ${response.status}. Choose another source or retry.`);
            job2.options = formats.manifest(await response.json());
          } else {
            if (!job2.release.url && !job2.release.browserUrl) throw new Error("This release has no download URL.");
            const resolved = job2.directURL || sourceKind(job2.release) !== "direct" ? await sources.resolve(job2.release, { signal, directURL: job2.directURL }) : { url: webURL(job2.release.url).url };
            job2.options = {
              ...resolved,
              rejectHtml: true,
              expectedBytes: job2.release.sizeBytes || void 0,
              sha256: job2.release.sha256 || void 0
            };
            delete job2.directURL;
          }
          job2.total = job2.options.expectedBytes || null;
          change();
        }
        if (job2.state === "pausing") return;
        const root2 = storageIdentity(job2);
        if (!job2.rootIdentity) {
          job2.rootIdentity = root2;
          change();
        }
        const held = Math.max(job2.written, fs.stat(`${job2.downloadDestination}.part`)?.size || 0);
        if (!fs.exists(job2.downloadDestination) && fs.diskUsage(job2.root).free < stillNeeded({ ...job2, written: held }) + MARGIN2)
          throw new Error("Not enough space on the selected drive. Free space and retry.");
        fs.mkdir(job2.artifact.directory, { recursive: true });
        fs.mkdir(job2.downloadDestination.slice(0, job2.downloadDestination.lastIndexOf("/")), { recursive: true });
        active2.transferring = true;
        task = downloads.enqueue({ ...job2.options, rejectHtml: true, mirrors: void 0, connections: 64, adaptive: true, rangeBytes: 16 * 1024 * 1024, destination: job2.downloadDestination, storageRoot: job2.root, recoverCompleted: true });
        active2.task = task;
        // Most catalog releases do not say their size, so the check above had nothing to go on: once the
        // server does, the rest is checked against the drive once, before it fills (the partial file counts
        // what is written out of order, as above).
        let sized = Boolean(job2.total);
        unsubscribe = task.subscribe((progress) => {
          if (job2.state === "pausing") return;
          if (ACTIVE.includes(progress.state)) job2.state = progress.state;
          job2.written = progress.written || 0;
          job2.total = progress.total ?? job2.total;
          if (!sized && job2.total && !noRoom) {
            sized = true;
            const held2 = Math.max(job2.written, fs.stat(`${job2.downloadDestination}.part`)?.size || 0);
            if (fs.diskUsage(job2.root).free < stillNeeded({ ...job2, written: held2 }) + MARGIN2) {
              noRoom = new Error("Not enough space on the selected drive. Free space and retry.");
              task.cancel();
              return;
            }
          }
          job2.received = progress.received || 0;
          job2.connections = progress.connections || 0;
          job2.bytesPerSecond = progress.bytesPerSecond || 0;
          if (job2.written > 0) delete job2.adopted;
          if (++ticks % 20 === 0) {
            delete job2.launches;
            try {
              save({ sync: false });
            } catch (error2) {
              job2.error = `Queue save failed: ${error2.message}`;
              task.cancel();
            }
            if (["extraction-required", "downloaded"].includes(job2.artifact.nextAction)) checkHeaders(job2, `${job2.downloadDestination}.part`, task);
          }
          emit2();
        });
        const transferred = await task.done;
        await checkTransfer(job2, transferred);
        if (job2.artifact.nextAction === "downloaded") route(job2);
        // ShadowMount lays backports over a game only from a folder; a backport that came as a disk image
        // stays out of homebrew/, where it would register as a second copy of the game.
        if (job2.artifact.nextAction === "shadowmount" && job2.role === "backport") {
          job2.artifact.nextAction = "downloaded";
          job2.message = t("downloads.backport.image");
        } else if (job2.artifact.nextAction === "shadowmount") {
          publishImage(job2);
          job2.artifact.images = [job2.artifact.destination];
          job2.payload = [{ path: job2.artifact.destination, size: fs.stat(job2.artifact.destination)?.size ?? 0 }];
        }
        job2.state = job2.artifact.nextAction === "shadowmount" ? "downloaded" : job2.artifact.nextAction === "downloaded" ? "file-downloaded" : job2.artifact.nextAction;
        job2.written = job2.total || job2.written;
        job2.bytesPerSecond = 0;
        if ((job2.artifact.nextAction === "extraction-required" || job2.output) && archives) await extract(job2, [job2.downloadDestination]);
        delete job2.reresolved;
        notifications.show(t("downloads.notice.complete"), job2.title);
        if (job2.state === "installer-required" && canInstall()) await install(job2);
      } catch (error2) {
        if (noRoom) error2 = noRoom;
        console.log("[download-queue] transfer stopped:", error2.message);
        // The engine words every 401/403 as a possible browser check; from Archive.org it is a
        // restricted or removed item, so it fails over like a dead link and reads as one.
        const refused = archiveRefusal(job2.parts ? job2.currentSource : job2.release, cause(error2.message));
        if (refused) error2 = new Error(`Source unavailable: HTTP ${refused}. Choose another source.`);
        // A file link that is gone shows as unavailable on the game's page from now on (state/link-health.js).
        // Only a direct one: a host page's 404 may be the file link read from it, and a link the gamer
        // typed in is not the catalog's.
        const failedSource = job2.parts ? job2.currentSource : job2.release;
        try {
          if (!job2.directURL && failedSource && sourceKind(failedSource) === "direct") reportLink(failedSource.browserUrl || failedSource.url, cause(error2.message));
        } catch {
        }
        const browser =!refused && (error2 instanceof BrowserRequired || /browser verification required/i.test(cause(error2.message)));
        const retried = job2.state !== "pausing" && !job2.cancelling && browser && active2.transferring && reresolve(job2);
        const switched = !retried && job2.state !== "pausing" && !job2.cancelling && failOver(job2, error2);
        if (!retried && !switched && job2.state !== "pausing") {
          job2.state = browser ? "awaiting-browser" : "failed";
          job2.error || (job2.error = job2.adopted && STALE_PARTIAL.test(cause(error2.message)) ? ADOPTED : error2.message);
          if (browser) {
            job2.browserUrl = error2.url || job2.currentSource?.browserUrl || job2.currentSource?.url || job2.release.browserUrl || job2.release.url;
            delete job2.options;
            if (job2.parts) delete job2.parts[job2.partIndex].options;
          } else if (!job2.cancelling) notifications.show(t("downloads.notice.failed"), job2.title);
        }
      } finally {
        unsubscribe?.();
        if (job2.state === "pausing") job2.state = "paused";
        if (COMPLETE.includes(job2.state)) delete job2.launches;
        if (job2.cancelling) {
          try {
            await forget(job2);
          } catch (error2) {
            delete job2.cancelling;
            job2.error = error2.message;
          }
        }
        active2 = null;
        try {
          change();
        } catch (error2) {
          job2.error = `Queue save failed: ${error2.message}`;
          emit2();
        }
        pump();
      }
    }
    const inspections = /* @__PURE__ */ new WeakMap();
    function checkHeaders(job2, path, task) {
      const tries = inspections.get(job2) || 0;
      if (job2.inspected || tries >= 3 || !archives?.inspect || !fs.exists(path)) return;
      inspections.set(job2, tries + 1);
      const started = Date.now();
      const { kind, refusal } = archives.inspect([path]);
      if (Date.now() - started > 250) console.log(`[download-queue] header check took ${Date.now() - started} ms`);
      if (!kind) return;
      job2.inspected = kind;
      if (refusal) {
        job2.error = refusal;
        task.cancel();
      }
    }
    function route(job2) {
      if (!archives?.inspect) return;
      const { kind, refusal } = archives.inspect([job2.downloadDestination]);
      if (refusal) throw new Error(refusal);
      if (!kind) return;
      const artifact2 = formats.detected(job2.release, job2.root, kind);
      if (artifact2.nextAction === "shadowmount" && job2.role === "backport") {
        job2.artifact = { ...job2.artifact, format: kind };
        job2.message = t("downloads.backport.image");
        return;
      }
      if (artifact2.nextAction === "extraction-required") {
        job2.artifact = { ...job2.artifact, format: kind, nextAction: artifact2.nextAction };
        return;
      }
      if (fs.exists(artifact2.destination)) throw new Error("Destination already exists. Choose another release or inspect the existing file.");
      fs.mkdir(artifact2.directory, { recursive: true });
      job2.routing = artifact2;
      change();
      finishRouting(job2);
    }
    function finishRouting(job2) {
      const from = job2.downloadDestination, to = job2.routing.destination;
      if (fs.exists(from)) fs.rename(from, to);
      if (fs.exists(`${from}.complete`)) fs.rename(`${from}.complete`, `${to}.complete`);
      job2.artifact = job2.routing;
      job2.downloadDestination = to;
      delete job2.routing;
      change();
    }
    function gameFolder(output) {
      for (let depth = 0; depth <= 16; depth++) {
        if (fs.exists(`${output}/eboot.bin`) && fs.exists(`${output}/sce_sys/param.json`)) return output;
        let children;
        try {
          children = fs.readDir(output).filter((entry2) => entry2.isDirectory && !entry2.name.startsWith(".ps5-react"));
        } catch {
          return null;
        }
        if (children.length !== 1) return null;
        output = `${output}/${children[0].name}`;
      }
      return null;
    }
    function extraction(job2, files) {
      if (!archives) throw new Error("Archive extraction requires the updated PS5 React runtime.");
      if (releasesOf) {
        const stored2 = job2.release.parts ? job2.release.parts.flatMap((part) => part.sources) : [job2.release];
        const current = releasesOf(job2.gameId).flatMap((release) => release.parts ? release.parts.flatMap((part) => part.sources) : [release]);
        for (const source2 of stored2) {
          const match = current.find((item) => item.url && item.url === source2.url && item.browserUrl === source2.browserUrl);
          if (source2.archivePassword == null && match?.archivePassword) source2.archivePassword = match.archivePassword;
        }
      }
      const password = archivePassword(job2.release);
      storageIdentity(job2);
      const directory2 = `${job2.root}/downloads/extracted`;
      fs.mkdir(directory2, { recursive: true });
      job2.output || (job2.output = `${directory2}/${job2.release.filename.replace(/[^a-z0-9_.-]/gi, "_")}`);
      if (job2.publishTo && fs.exists(job2.publishTo)) job2.output = job2.publishTo;
      return {
        sources: files,
        destination: job2.output,
        ...password !== void 0 ? { password } : {},
        maxBytes: fs.exists(job2.output) ? 1024 ** 4 : Math.min(1024 ** 4, Math.max(1, fs.diskUsage(job2.root).free - MARGIN2))
      };
    }
    const STREAM_FAILURE = /RAR worker|Only a RAR set|extraction thread|archive task is already running|^RAR extraction failed|^Extraction cancelled/;
    async function forgetPart(job2, error2) {
      const part = job2.parts?.[Number(INCOMPLETE_PART.exec(error2.message)?.[1]) - 1];
      if (!part) return false;
      try {
        await Promise.all(["", ".complete"].map((suffix) => fs.removeAsync(part.destination + suffix)));
      } catch (failure) {
        console.log("[download-queue] incomplete volume not deleted:", failure.message);
        return false;
      }
      part.completed = false;
      part.written = 0;
      delete part.options;
      return true;
    }
    async function extract(job2, files, streamed) {
      const options = extraction(job2, files);
      const downloaded = { written: job2.written, total: job2.total };
      let estimate = files.reduce((sum, path) => sum + (fs.stat(path)?.size || 0), 0) || null;
      job2.state = "extracting";
      job2.written = 0;
      job2.total = estimate;
      job2.bytesPerSecond = 0;
      change();
      let sample = { at: Date.now(), bytes: 0 };
      const report = (bytes) => {
        const now = Date.now();
        job2.written = estimate ? Math.min(bytes, estimate * 0.99) : bytes;
        if (now - sample.at >= 1e3) {
          const speed = (bytes - sample.bytes) * 1e3 / (now - sample.at);
          job2.bytesPerSecond = job2.bytesPerSecond ? job2.bytesPerSecond * 0.7 + speed * 0.3 : speed;
          sample = { at: now, bytes };
        }
        emit2();
      };
      const follow = (progress) => {
        if (progress.total && progress.total !== estimate) job2.total = estimate = progress.total;
        if (progress.phase !== "finishing") {
          report(progress.written || 0);
          return;
        }
        if (job2.phase === "finishing") return;
        job2.phase = "finishing";
        job2.bytesPerSecond = 0;
        if (job2.total) job2.written = job2.total;
        emit2();
      };
      let result;
      try {
        if (streamed) {
          active2.task = streamed.task;
          sample = { at: Date.now(), bytes: streamed.written };
          report(streamed.written);
          const off = streamed.task.subscribe(follow);
          const outcome = await streamed.done;
          off();
          if (outcome.error && (job2.state === "pausing" || job2.cancelling)) throw outcome.error;
          // A password the stream couldn't use gets the known ones below, once every volume is here.
          if (outcome.error && !STREAM_FAILURE.test(cause(outcome.error.message)) && !PASSWORD_FAILURE.test(cause(outcome.error.message))) throw outcome.error;
          if (outcome.error) {
            console.log("[download-queue] extraction during download stopped, extracting again:", outcome.error.message);
            job2.written = 0;
            delete job2.phase;
            sample = { at: Date.now(), bytes: 0 };
            emit2();
          }
          result = outcome.result;
        }
        if (!result) {
          if (!fs.exists(job2.output) && fs.diskUsage(job2.root).free < (estimate || 0) + MARGIN2)
            throw new Error("Not enough space to extract this download. Free space and retry.");
          const { password: listed, ...unlocked } = options;
          const passwords = [listed, ...KNOWN_PASSWORDS.filter((password) => password !== listed)];
          for (let index = 0; !result; index++) {
            const task = archives.extract(passwords[index] === void 0 ? unlocked : { ...unlocked, password: passwords[index] });
            active2.task = task;
            const off = task.subscribe(follow);
            try {
              result = await task.done;
            } catch (error2) {
              const last = index + 1 >= passwords.length;
              if (last || job2.state === "pausing" || job2.cancelling || !PASSWORD_FAILURE.test(cause(error2.message))) throw error2;
              console.log(`[download-queue] archive password ${index + 1} of ${passwords.length} did not open it, trying the next`);
              job2.written = 0;
              sample = { at: Date.now(), bytes: 0 };
              emit2();
            } finally {
              off();
            }
          }
        }
      } catch (error2) {
        if (await forgetPart(job2, error2)) downloaded.written = job2.parts.reduce((sum, part) => sum + part.written, 0);
        throw error2;
      } finally {
        Object.assign(job2, downloaded, { bytesPerSecond: 0 });
        delete job2.phase;
      }
      const images = orderImages(job2.output, (result.artifacts || []).filter((path) => IMAGE.test(path)));
      // A backport is checked for nothing a game needs, and none of it goes where games are scanned: even
      // one carrying an eboot.bin and a param.json would otherwise register as a second copy of the game.
      if (job2.role === "backport") await placeBackport(job2);
      else if (images.length) {
        // Every image is checked here, before the folder moves where ShadowMount scans, and every one is
        // tracked: a set's update or add-on image mounts with its base, and both must be up to count.
        const checked = verifyImages(job2, images);
        if (images.length > 1) console.log(`[download-queue] ${job2.id}: ${images.length} images, base first: ${images.join(", ")}`);
        const destination = `${job2.root}/homebrew/${job2.release.filename.replace(/[^a-z0-9_.-]/gi, "_")}-extracted`;
        fs.mkdir(`${job2.root}/homebrew`, { recursive: true });
        job2.publishTo = destination;
        change();
        if (job2.output !== destination) {
          if (fs.exists(destination)) throw new Error("Extracted destination already exists; preserve it and inspect before retrying.");
          storageIdentity(job2);
          fs.rename(job2.output, destination);
          job2.output = destination;
        }
        job2.artifact.nextAction = "shadowmount";
        job2.artifact.images = images.map((path) => `${job2.output}/${path}`);
        job2.artifact.destination = job2.artifact.images[0];
        job2.payload = checked.map(({ path, size }) => ({ path: `${job2.output}/${path}`, size }));
        job2.state = "downloaded";
        job2.message = t("downloads.extractedReady", { parts: job2.parts ? "all" : "one" });
      } else {
        job2.state = "extracted";
        job2.message = t("downloads.extractedTo", { path: job2.output });
        const packaged = (result.artifacts || []).filter((path) => /\.(pkg|fpkg)$/i.test(path));
        const folder = packaged.length ? null : gameFolder(job2.output);
        if (packaged.length) {
          job2.packages = packaged.map((path) => `${job2.output}/${path}`);
          job2.state = "installer-required";
          job2.message = t("downloads.packagesExtracted", { path: job2.output });
        } else if (folder) {
          const checked = verifyGameFolder(job2, folder);
          const destination = `${job2.root}/homebrew/${job2.release.filename.replace(/[^a-z0-9_.-]/gi, "_")}-app`;
          fs.mkdir(`${job2.root}/homebrew`, { recursive: true });
          if (fs.exists(destination)) throw new Error("Extracted destination already exists; preserve it and inspect before retrying.");
          storageIdentity(job2);
          fs.rename(folder, destination);
          // What the archive held beside the game folder (notes that may say a backport is needed, say) is
          // kept as <name>-extras in downloads/extracted, outside ShadowMount's scan, and deleted with the job.
          const extras = folder !== job2.output ? await keepExtras(job2) : null;
          job2.output = destination;
          job2.publishTo = destination;
          job2.artifact.nextAction = "shadowmount";
          job2.artifact.destination = destination;
          job2.payload = checked.files.map(({ path, size }) => ({ path: `${destination}/${path}`, size }));
          job2.state = "downloaded";
          // Warnings first: the game page shows only the start of a message.
          job2.warnings = checked.warnings;
          job2.message = [
            checked.warnings.length ? t("downloads.folderWarnings", { warnings: checked.warnings.join("; ") }) : "",
            t("downloads.extractedReady", { parts: job2.parts ? "all" : "one" }),
            extras ? t("downloads.extrasKept", { path: extras }) : ""
          ].filter(Boolean).join(" ");
        }
      }
      change();
      try {
        await Promise.all(files.flatMap((path) => [path, `${path}.complete`]).map((path) => fs.removeAsync(path)));
        if (job2.release.parts) await fs.removeAsync(setDirectory(job2));
      } catch (error2) {
        console.log("[download-queue] archive not deleted:", error2.message);
        job2.message = `${job2.message} ${t("downloads.archiveNotDeleted", { error: error2.message })}`;
      }
    }
    function streamSet(job2) {
      const first = job2.parts[0].destination;
      if (!archives?.streams || job2.parts.length < 2 || archives.inspect([first]).kind !== "rar") return null;
      let task;
      try {
        const options = extraction(job2, job2.parts.map((part) => part.destination));
        if (fs.exists(options.destination)) return null;
        change();
        task = archives.extract({ ...options, stream: true });
      } catch (error2) {
        console.log("[download-queue] extraction during download not started:", error2.message);
        return null;
      }
      const streamed = { task, written: 0 };
      const off = task.subscribe((progress) => {
        streamed.written = progress.written || 0;
      });
      streamed.done = task.done.then((result) => ({ result }), (error2) => ({ error: error2 })).finally(off);
      return streamed;
    }
    const setDirectory = (job2) => `${job2.root}/downloads/sets/${job2.release.filename}`;
    function setNeed(job2, extracted = 0) {
      const sizes = job2.parts.map((item) => item.total ?? item.options?.expectedBytes ?? null);
      const largest = Math.max(0, ...sizes.filter(Boolean));
      const size = (index) => sizes[index] ?? largest;
      return Math.max(0, job2.parts.reduce((sum, item, index) => sum + size(index) + (item.completed ? 0 : Math.max(0, size(index) - item.written)), 0) - extracted);
    }
    function ownedPaths(job2) {
      const managed = (path) => {
        // A moved game's backport stays on the drive it was installed to (see relocate).
        if (path === job2.backportPath && /^(?:\/data|\/mnt\/(?:usb|ext)\d+)\/homebrew\/backports\/[^/]+$/.test(path)) return true;
        const parts = path.startsWith(`${job2.root}/`) ? path.slice(job2.root.length + 1).split("/") : [];
        return !parts.some((part) => ["", ".", ".."].includes(part)) && (parts[0] === "homebrew" && parts.length >= 2 || parts[0] === "downloads" && parts.length >= 3);
      };
      const extracted = job2.output && `${job2.root}/downloads/extracted/${job2.release.filename.replace(/[^a-z0-9_.-]/gi, "_")}`;
      // Everything the job may have put on the drive: every image of a set, the backport folder, and the
      // archive's notes kept beside the extraction (<name>-extras), recorded or not.
      // A job stopped before it published anything owns no file in homebrew/ yet: one there by that name
      // came from elsewhere.
      const published = COMPLETE.includes(job2.removingFrom ?? job2.state) || Boolean(job2.payload);
      const paths = [
        published || job2.artifact.destination === job2.downloadDestination ? job2.artifact.destination : null,
        ...published ? job2.artifact.images ?? [] : [],
        job2.downloadDestination,
        job2.output,
        job2.publishTo,
        job2.backportPath,
        job2.extras,
        extracted,
        extracted && `${extracted}-extras`,
        job2.release.parts && setDirectory(job2)
      ].filter(Boolean).flatMap((path) => [path, ...[".complete", ".complete.tmp", ".part", ".resume", ".resume.tmp"].map((suffix) => path + suffix)]);
      return [...new Set(paths)].filter((path) => managed(path) && !jobs.some((other) => other !== job2 && [other.artifact.destination, other.downloadDestination, other.output, other.publishTo].some((owned2) => owned2 && (owned2 === path || owned2.startsWith(`${path}/`)))));
    }
    async function executeSet(job2, signal) {
      if (job2.release.unavailableReason) throw new Error(job2.release.unavailableReason);
      const root2 = storageIdentity(job2);
      if (!job2.rootIdentity) job2.rootIdentity = root2;
      fs.mkdir(job2.artifact.directory, { recursive: true });
      job2.parts || (job2.parts = job2.release.parts.map((part) => ({
        number: part.number,
        destination: `${job2.artifact.directory}/part-${part.number}.bin`,
        written: 0,
        completed: false
      })));
      let streamed = null;
      try {
        for (let index = 0; index < job2.parts.length; index++) {
          if (!streamed && index > 0 && job2.parts[0].completed && fs.exists(job2.parts[0].destination)) streamed = active2.streamed = streamSet(job2);
          job2.partIndex = index;
          const part = job2.parts[index];
          if (job2.state === "pausing") return;
          if (part.completed && fs.exists(part.destination)) continue;
          if (part.completed) {
            part.completed = false;
            part.written = 0;
            delete part.options;
          }
          job2.state = "resolving";
          job2.message = t("downloads.part", { part: index + 1, parts: job2.parts.length });
          active2.transferring = false;
          change();
          const source2 = job2.release.parts[index].sources[part.sourceIndex || 0];
          job2.currentSource = source2;
          if (!part.options) {
            const resolved = await sources.resolve(source2, { signal, directURL: job2.directURL });
            part.options = { ...resolved, expectedBytes: source2.sizeBytes || void 0, sha256: source2.sha256 || void 0 };
            delete job2.directURL;
            change();
          }
          if (job2.state === "pausing") return;
          storageIdentity(job2);
          if (!fs.exists(part.destination) && fs.diskUsage(job2.root).free < setNeed(job2, streamed?.written) + MARGIN2)
            throw new Error("Not enough space for the remaining volumes and their extraction. Free space and resume.");
          active2.transferring = true;
          const task = downloads.enqueue({
            ...part.options,
            rejectHtml: true,
            connections: 64,
            adaptive: true,
            destination: part.destination,
            storageRoot: job2.root,
            recoverCompleted: true
          });
          active2.task = task;
          const off = task.subscribe((progress) => {
            if (job2.state === "pausing") return;
            if (ACTIVE.includes(progress.state)) job2.state = progress.state;
            part.written = progress.written || 0;
            part.total = progress.total;
            job2.written = job2.parts.reduce((sum, item) => sum + item.written, 0);
            job2.total = job2.parts.every((item) => item.total != null) ? job2.parts.reduce((sum, item) => sum + item.total, 0) : null;
            job2.received = progress.received || 0;
            job2.connections = progress.connections || 0;
            job2.bytesPerSecond = progress.bytesPerSecond || 0;
            if (++ticks % 20 === 0) {
              delete job2.launches;
              try {
                save({ sync: false });
              } catch (error2) {
                job2.error = `Queue save failed: ${error2.message}`;
                task.cancel();
              }
              if (index === 0) checkHeaders(job2, `${part.destination}.part`, task);
            }
            emit2();
          });
          let result;
          try {
            result = await task.done;
          } finally {
            off();
          }
          // A volume cut short is deleted and fails the set now, before its extraction can publish anything.
          const problem = transferProblem(part.destination, part.options?.expectedBytes, result);
          if (problem) {
            console.log(`[download-queue] ${job2.id} volume ${index + 1} failed its check: ${problem}`);
            await Promise.all(["", ".complete", ".resume"].map((suffix) => fs.removeAsync(part.destination + suffix))).catch((error2) => console.log("[download-queue] volume not deleted:", error2.message));
            part.completed = false;
            part.written = 0;
            delete part.options;
            job2.written = job2.parts.reduce((sum, item) => sum + item.written, 0);
            throw new Error(`${t("downloads.invalid", { problem: t("downloads.part", { part: index + 1, parts: job2.parts.length }) + ": " + problem })} ${t("downloads.discarded")}`);
          }
          part.written = result.written ?? part.total ?? part.written;
          job2.written = job2.parts.reduce((sum, item) => sum + item.written, 0);
          part.completed = true;
          change();
          const refusal = index === 0 && archives?.inspect([part.destination]).refusal;
          if (refusal) throw new Error(refusal);
        }
      } finally {
        delete active2.streamed;
        if (streamed && (job2.state === "pausing" || job2.parts.some((part) => !part.completed))) {
          streamed.task.cancel();
          await streamed.done;
          streamed = null;
        }
      }
      if (job2.state === "pausing") return;
      await extract(job2, job2.parts.map((part) => part.destination), streamed);
      notifications.show(t("downloads.notice.complete"), job2.title);
      if (job2.state === "installer-required" && canInstall()) await install(job2);
    }
    function lostPartial(job2) {
      const kept = (path) => fs.exists(path) || fs.exists(`${path}.part`);
      if (job2.parts) return job2.parts.some((part) => (part.written || part.completed) && !kept(part.destination));
      return job2.written > 0 && !kept(job2.downloadDestination || job2.artifact.destination);
    }
    function holding(root2) {
      const lost = jobs.filter((job2) => job2.root === root2 && ["paused", "failed"].includes(job2.state) && lostPartial(job2));
      const unmarked = lost.filter((job2) => job2.error !== DELETED);
      for (const job2 of unmarked) job2.error = DELETED;
      if (unmarked.length) change();
      return jobs.filter((job2) => job2.root === root2 && (BUSY.includes(job2.state) || job2.state === "paused") && !lost.includes(job2));
    }
    function pump(first) {
      // `holds`: ShadowMount is being asked something that cannot wait for a download (quietNetwork).
      if (active2 || holds) return;
      const job2 = first?.state === "queued" ? first : jobs.find((item) => item.state === "queued");
      if (!job2) return;
      // The gamer's download goes first: the borrower stops, and this runs again once it gave the network back.
      if (borrower) {
        borrower.yield();
        return;
      }
      active2 = { job: job2, task: null };
      void execute(job2);
    }
    function storageIdentity(job2) {
      const info = fs.stat(job2.root);
      if (!info?.isDirectory) throw new Error("Storage disconnected. Reconnect the selected drive.");
      if (typeof info.device !== "string" || typeof info.inode !== "string") throw new Error("Storage identity is unavailable. Update the runtime.");
      const identity = `${info.device}:${info.inode}`;
      if (job2.rootIdentity && job2.rootIdentity !== identity) {
        if (job2.root !== "/data") throw new Error("Storage changed. Reconnect the original drive.");
        job2.rootIdentity = identity;
      }
      return identity;
    }
    function partialFiles(job2) {
      storageIdentity(job2);
      if (!job2.rootIdentity) throw new Error("This older task has no storage identity. Preserve and inspect its partial files.");
      if (fs.exists(job2.parts?.[job2.partIndex]?.destination || job2.downloadDestination || job2.artifact.destination)) throw new Error("A final file exists. Retry to verify and recover it.");
      const destination = job2.parts?.[job2.partIndex]?.destination || job2.downloadDestination || job2.artifact.destination;
      const paths = [".part", ".resume", ".resume.tmp", ".complete", ".complete.tmp"].map((suffix) => destination + suffix);
      for (const path of paths) {
        const info = fs.stat(path);
        if (info && !info.isFile) throw new Error(`Cannot discard a non-file: ${path}`);
      }
      return paths;
    }
    function setFiles(job2) {
      storageIdentity(job2);
      if (!job2.rootIdentity) throw new Error("This older task has no storage identity. Preserve and inspect its partial files.");
      const extracted = job2.output?.startsWith(`${job2.root}/downloads/extracted/`) && !job2.publishTo ? [job2.output] : [];
      return [setDirectory(job2), ...extracted].filter((path) => !jobs.some((other) => other !== job2 && [other.release.parts && setDirectory(other), other.output, other.publishTo, other.artifact.destination, other.downloadDestination].some((owned2) => owned2 && (owned2 === path || owned2.startsWith(`${path}/`)))));
    }
    const removePath = (path) => fs.removeAsync(path).catch((error2) => {
      throw new Error(`Its files were not deleted: ${error2.message}`);
    });
    const removeAll = (paths) => Promise.all(paths.map(removePath));
    async function removing(job2, work) {
      const state = job2.state;
      job2.state = "removing";
      job2.removingFrom = state;
      try {
        change();
      } catch {
        emit2();
      }
      let result;
      try {
        result = await work();
      } catch (error2) {
        console.log(`[download-queue] ${job2.id} not deleted:`, error2.message);
        job2.state = state;
        delete job2.removingFrom;
        job2.error = error2.message;
        try {
          change();
        } catch {
          emit2();
        }
        throw error2;
      }
      job2.state = state;
      delete job2.removingFrom;
      return result;
    }
    const onOriginalStorage = (job2) => {
      try {
        storageIdentity(job2);
        return true;
      } catch {
        return false;
      }
    };
    async function forget(job2) {
      if ((job2.rootIdentity || job2.written) && !job2.adopted && onOriginalStorage(job2)) {
        const paths = job2.release.parts ? setFiles(job2) : partialFiles(job2);
        if (job2.state === "queued") job2.state = "paused";
        await removing(job2, () => removeAll(paths));
      }
      const previous = jobs;
      jobs = jobs.filter((item) => item !== job2);
      try {
        save();
      } catch (error2) {
        jobs = previous;
        throw error2;
      }
    }
    async function shadowRequest2(route2, body = {}) {
      if (platform !== "ps5") throw new Error("ShadowMount registration requires a PS5.");
      return shadowRequest(http, route2, body);
    }
    // ShadowMount's record of a title (POST /api/v1/games/info), or null when it has none.
    const gameInfo = (title) => shadowRequest2("games/info", { title_id: title }).catch((error2) => {
      if (/HTTP 404/.test(error2.message)) return null;
      throw error2;
    });
    async function registered3(job2) {
      const paths = [job2.artifact.destination, ...job2.artifact.images ?? [], job2.output, job2.publishTo].filter(Boolean);
      const listed2 = await gameInfo(job2.consoleTitleId ?? job2.titleId);
      if (within2(listed2?.path, paths, job2.root)) return listed2;
      for (const image of await mountedImages(shadowRequest2, paths, job2.root).catch(() => null) ?? []) {
        const title = mountedTitle(image);
        if (!title || title === listed2?.title_id) continue;
        const game = await gameInfo(title);
        if (within2(game?.path, paths, job2.root)) {
          job2.consoleTitleId = title;
          return game;
        }
      }
      return !fs.exists(job2.artifact.destination) && listed2?.managed ? listed2 : null;
    }
    function mountedTitle(image) {
      const titleIn = (folder) => {
        try {
          return JSON.parse(fs.readFile(`${folder}/sce_sys/param.json`)).titleId || null;
        } catch {
          return null;
        }
      };
      let folders = [];
      try {
        folders = fs.readDir(image.mount_point).filter((entry2) => entry2.isDirectory).map((entry2) => `${image.mount_point}/${entry2.name}`);
      } catch {
      }
      for (const folder of [image.mount_point, ...folders]) {
        const title = titleIn(folder);
        if (title) return title;
      }
      return null;
    }
    async function logStorage(log2) {
      try {
        const { mounts = [] } = await shadowRequest2("storage");
        for (const mount of mounts) {
          log2(`statfs ${mount.mount_point} (${mount.source}, ${mount.filesystem}): total ${mount.total_bytes}, free ${mount.free_bytes}, available ${mount.available_bytes}, used ${mount.used_bytes}`);
        }
      } catch (error2) {
        log2(`storage not read: ${error2.message}`);
      }
    }
    const deletions = /* @__PURE__ */ new WeakMap();
    /**
     * Deletes everything the task put on its drive and forgets it; returns a note for the gamer, or null.
     * For a title ShadowMount installs, in this order (each step logged):
     *  1. ShadowMount is asked whether any of its images is mounted; one that is gets unmounted, and while
     *     one stays mounted nothing is deleted. A ShadowMount that does not answer mounts nothing.
     *  2. The files go: ShadowMount installs a source still on disk again at its next scan, so the source
     *     goes first (ShadowMount's API notes), and it cannot be held back by step 3.
     *  3. ShadowMount is asked to uninstall the title. It refuses while a game runs (HTTP 409, EBUSY), and
     *     Jobee'sLair is that game whenever it asks: then the note says what happens after it closes
     *     (ShadowMount drops a title whose source is gone at its next scan).
     * The download in progress, if any, is paused for the whole time (quietNetwork): the runtime would
     * otherwise hold every request to ShadowMount until that file finished.
     */
    async function deleteJob(job2) {
      const log2 = (message) => console.log(`[download-queue] delete ${job2.id}: ${message}`);
      const paths = ownedPaths(job2);
      const managed = job2.artifact.nextAction === "shadowmount" && platform === "ps5";
      log2(`${paths.filter((path) => fs.exists(path)).length} of ${paths.length} paths on disk: ${paths.filter((path) => fs.exists(path)).join(", ") || "none"}`);
      let game, reachable = false;
      if (managed) {
        const check = () => mountedImages(shadowRequest2, paths, job2.root).catch((error2) => {
          throw new Error(`ShadowMount could not say whether the image is mounted, so its files were kept: ${error2.message}`);
        });
        let mounted = await check();
        reachable = mounted !== null;
        if (!reachable) log2("ShadowMount is not running, so none of its files is mounted");
        else {
          game = await registered3(job2).catch((error2) => {
            log2(`game info failed: ${error2.message}`);
            return void 0;
          });
          log2(game ? `ShadowMount game ${game.title_id} at ${game.path}, runtime ${game.runtime_path || "none"}, installed ${game.installed}, managed ${game.managed}, mounted ${game.mounted}` : `ShadowMount ${game === null ? "has no game" : "was not asked about the game"} of ${job2.titleId}`);
          log2(mounted.length ? `mounted: ${mounted.map((image) => image.path).join(", ")}` : "none of its files is mounted");
          if (mounted.length) {
            const titles = new Set(mounted.map((image) => game && within2(game.path, [image.path], job2.root) ? game.title_id : mountedTitle(image)));
            titles.delete(null);
            let released = false;
            for (const title of titles) {
              await shadowRequest2("games/unmount", { title_id: title }).then(() => {
                log2(`unmounted ${title}`);
                released = true;
              }, (error2) => log2(`unmount of ${title} failed: ${error2.message}`));
            }
            for (let attempt = 0; mounted.length && released && attempt < 5; attempt++) {
              if (attempt) await wait(1e3);
              mounted = await check() ?? [];
            }
          }
          if (mounted.length) {
            log2(`still mounted: ${mounted.map((image) => image.path).join(", ")}`);
            throw new Error(t("downloads.delete.mounted", { path: mounted[0].path }));
          }
        }
      }
      const before = fs.diskUsage(job2.root).free;
      for (const path of paths) {
        if (!fs.exists(path)) continue;
        const info = fs.stat(path);
        await removePath(path);
        log2(`deleted ${path}${info?.isDirectory ? " (folder)" : `, ${info?.size || 0} bytes`}`);
      }
      const after = fs.diskUsage(job2.root).free;
      log2(`${job2.root} free went from ${before} to ${after} bytes (${after - before} freed)`);
      const previous = jobs;
      jobs = jobs.filter((item) => item !== job2);
      try {
        save();
      } catch (error2) {
        jobs = previous;
        throw error2;
      }
      forgetLaunches(job2, log2);
      emit2();
      // Its files are gone and so is the task, whatever ShadowMount answers now.
      let note = null;
      if (managed && reachable && game !== null) {
        const main = game?.title_id ?? job2.installedTitleId ?? titleOf(job2);
        for (const title of new Set([main, ...job2.installedTitles ?? []])) {
          try {
            await shadowRequest2("games/uninstall", { title_id: title });
            log2(`uninstalled ${title}`);
          } catch (error2) {
            if (error2.httpStatus === 404 || /HTTP 404/.test(error2.message)) {
              log2(`ShadowMount has no install of ${title}`);
            } else if (busyWhileOpen(error2)) {
              log2(`uninstall of ${title} refused while Jobee'sLair runs (${error2.message}); ShadowMount drops it at its next scan once the app is closed, its source being gone`);
              note = t("downloads.delete.afterClose");
            } else {
              log2(`uninstall of ${title} failed: ${error2.message}`);
              note || (note = t("downloads.delete.notUninstalled", { error: error2.message }));
            }
          }
        }
      }
      if (platform === "ps5") void logStorage(log2);
      return note;
    }
    // The runtime runs one network task at a time, and a download holds it until its whole file is in
    // (ps5-react docs/NETWORKING.md): a request to ShadowMount made meanwhile waits that long. Work that
    // must hear from ShadowMount now (a delete, "See why") pauses the download in progress first, holds the
    // queue so no other starts, and resumes it after, whatever the work did.
    function pauseJob(job2) {
      if (job2.state === "queued") job2.state = "paused";
      else if (active2?.job === job2 && ACTIVE.includes(job2.state)) {
        job2.state = "pausing";
        active2.cancel?.cancel();
        active2.task?.cancel();
      }
      change();
    }
    async function quietNetwork(reason, work) {
      holds++;
      const held = jobTransferring() ? active2.job : null;
      try {
        if (held) {
          console.log(`[download-queue] ${held.id}: paused while ShadowMount is asked (${reason}); it resumes after`);
          pauseJob(held);
          for (let tries = 0; tries < 100 && active2?.job === held; tries++) await wait(100);
        }
        if (borrower) {
          console.log(`[download-queue] the network's borrower stops while ShadowMount is asked (${reason})`);
          borrower.yield();
          for (let tries = 0; tries < 100 && borrower; tries++) await wait(100);
        }
        return await work();
      } finally {
        holds--;
        if (held && held.state === "paused" && jobs.includes(held)) {
          console.log(`[download-queue] ${held.id}: resumed`);
          held.state = "queued";
          held.error = "";
          try {
            change();
          } catch {
            emit2();
          }
        }
        pump();
      }
    }
    // A deleted game's launch history goes with it, so downloading it again starts at "Not played yet":
    // the last launch the log still holds is remembered as forgotten and not learned again; a new one is.
    function forgetLaunches(job2, log2) {
      if (job2.artifact.nextAction !== "shadowmount") return;
      for (const title of new Set([titleOf(job2), job2.titleId, ...job2.installedTitles ?? []])) {
        if (!launches[title] || jobs.some((other) => other.artifact.nextAction === "shadowmount" && titleOf(other) === title)) continue;
        launches = { ...launches, [title]: { forgotten: launches[title].mark ?? launches[title].forgotten ?? null } };
        log2(`launch history of ${title} cleared`);
      }
      saveLaunches();
    }
    // ShadowMount's version and capabilities (POST /api/v1/version), asked once per session; forgotten
    // when ShadowMount does not answer, so a restarted one is asked again.
    let shadowMount = null;
    async function shadowMountInfo() {
      if (shadowMount) return shadowMount;
      const reply = await shadowRequest2("version");
      shadowMount = { version: String(reply.shadowmount_version ?? ""), capabilities: Array.isArray(reply.capabilities) ? reply.capabilities : [] };
      console.log(`[download-queue] ShadowMount ${shadowMount.version || "(version not reported)"}, API ${reply.api_version ?? "?"}, capabilities ${shadowMount.capabilities.join(" ")}`);
      return shadowMount;
    }
    // What stops ShadowMount's record of a title from counting as installed: a `problem` (a real fault,
    // shown in red) or `pending` (not finished yet), or null. `mounted` is not part of it: ShadowMount 1.7
    // mounts a title's runtime (its /system_ex/app layer and any image) when the game starts and releases
    // it when the game exits, so a title at rest reads `mounted: false`. A field an older ShadowMount does
    // not send is not held against it.
    function problemOf(title, game) {
      if (!game) return { pending: `${title} is not registered with ShadowMount yet` };
      if (game.source_available === false) return { problem: `ShadowMount cannot reach the files of ${title}; check that its drive is connected` };
      if (game.managed === false) return { problem: `ShadowMount does not manage ${title} from these files` };
      if (!game.installed) return { pending: `${title} is not installed yet` };
      return null;
    }
    // A set of several images, each matched to the title ShadowMount registered from it (by path, through
    // /api/v1/games). An image's `source_available` and `complete` say whether ShadowMount can use it; an
    // image it scanned (`mapped`) but registered no title from is `skipped`: ShadowMount keeps one source per
    // title ID, so an image sharing one with another is not registered.
    async function setStatus(job2, game) {
      const images = job2.artifact.images ?? [];
      const result = { problems: [], pending: [], skipped: [], titles: [game.title_id] };
      if (images.length < 2) return result;
      const { capabilities } = await shadowMountInfo();
      if (!capabilities.includes("list_games")) {
        console.log(`[download-queue] ${job2.id}: this ShadowMount cannot list games, so only ${game.title_id} is checked`);
        return result;
      }
      const [{ images: listed2 = [] }, { games = [] }] = await Promise.all([shadowRequest2("images"), shadowRequest2("games", { include_size: false })]);
      for (const path of images) {
        const name = baseName(path);
        const image = listed2.find((item) => within2(item.path, [path], job2.root));
        if (!image) {
          result.pending.push(`${name} is not scanned yet`);
          continue;
        }
        if (image.source_available === false) {
          result.problems.push(`ShadowMount cannot reach ${name}`);
          continue;
        }
        if (image.complete === false) {
          result.pending.push(`${name} is still being checked by ShadowMount`);
          continue;
        }
        const owner = games.find((item) => within2(item.path, [path], job2.root));
        if (!owner) {
          if (image.mapped) result.skipped.push(name);
          else result.pending.push(`${name} is not registered yet`);
          continue;
        }
        const issue = problemOf(owner.title_id, owner);
        if (issue?.problem) result.problems.push(issue.problem);
        else if (issue?.pending) result.pending.push(issue.pending);
        if (!result.titles.includes(owner.title_id)) result.titles.push(owner.title_id);
      }
      return result;
    }
    async function markInstalled(candidates2) {
      let found = false;
      let learned = false;
      let updated = false;
      for (const job2 of candidates2) {
        const known = job2.consoleTitleId;
        const game = await registered3(job2);
        learned || (learned = job2.consoleTitleId !== known);
        if (!game?.installed || !jobs.includes(job2) || !AWAITING_INSTALL.includes(job2.state)) continue;
        const log2 = (message) => console.log(`[download-queue] install check ${job2.id}: ${message}`);
        const { version: version3 } = await shadowMountInfo().catch(() => ({ version: "" }));
        log2(`ShadowMount ${version3 || "?"}: ${game.source_type || "game"} ${game.title_id} at ${game.path}, installed ${game.installed}, managed ${game.managed}, source available ${game.source_available ?? "not reported"}, runtime mounted ${game.mounted} (mounted only while it runs)`);
        // Files that changed after their check (a drive swapped, a copy cut short) never count as installed.
        const changed = changedPayload(job2);
        if (changed) {
          log2(`payload changed: ${changed}`);
          job2.error = t("downloads.payloadChanged", { problem: changed });
          updated = true;
          continue;
        }
        const set = await setStatus(job2, game);
        const own = problemOf(game.title_id, game);
        const problems = [...own?.problem ? [own.problem] : [], ...set.problems];
        job2.installedTitleId = game.title_id;
        job2.installedTitles = set.titles;
        if (problems.length) {
          log2(`problem: ${problems.join("; ")}`);
          job2.state = "attention";
          job2.message = t("downloads.attention");
          job2.error = problems.join("; ");
          updated = true;
          continue;
        }
        if (set.pending.length) {
          log2(`waiting: ${set.pending.join("; ")}`);
          job2.state = "downloaded";
          job2.message = t("downloads.waitingForImages", { count: set.pending.length });
          job2.error = "";
          updated = true;
          continue;
        }
        log2(`installed: ${set.titles.join(", ")}${set.skipped.length ? `; not registered (shares a title ID): ${set.skipped.join(", ")}` : ""}`);
        job2.state = "installed";
        job2.message = [
          job2.warnings?.length ? t("downloads.folderWarnings", { warnings: job2.warnings.join("; ") }) : "",
          set.skipped.length ? t("downloads.imagesSkipped", { names: set.skipped.join(", ") }) : t("downloads.installed")
        ].filter(Boolean).join(" ");
        job2.error = "";
        found = true;
      }
      if (found || learned || updated) change();
      return found;
    }
    async function checkInstalls(id) {
      const candidates2 = jobs.filter((job2) => AWAITING_INSTALL.includes(job2.state) && job2.artifact.nextAction === "shadowmount" && (id === void 0 || job2.id === id));
      if (platform !== "ps5" || !candidates2.length) return false;
      try {
        return await markInstalled(candidates2);
      } catch (error2) {
        console.log("[download-queue] ShadowMount install check failed:", error2.message);
        return false;
      }
    }
    function saveLaunches() {
      try {
        fs.mkdir(directory, { recursive: true });
        fs.writeFile(`${launchFile}.tmp`, JSON.stringify({ version: 1, titles: launches }), { sync: true });
        fs.rename(`${launchFile}.tmp`, launchFile);
      } catch (error2) {
        console.log(`[download-queue] launch history not saved: ${error2.message}`);
      }
    }
    // Takes what ShadowMount's log says about launches into the history; true when something changed.
    function learnLaunches(outcomes) {
      let learned = false;
      for (const [title, { outcome, verdict, mark = null }] of Object.entries(outcomes)) {
        const known = launches[title];
        if (known?.outcome === outcome && known.verdict === verdict && (known.mark ?? null) === mark) continue;
        // The launch the game had before it was deleted: still in the log, no longer about this copy.
        if (known && "forgotten" in known && (known.forgotten === mark || mark === null)) continue;
        launches = { ...launches, [title]: { outcome, verdict, mark, at: Date.now() } };
        learned = true;
        console.log(`[download-queue] last launch of ${title}: ${outcome} (${verdict})`);
      }
      if (learned) {
        saveLaunches();
        emit2();
      }
      return learned;
    }
    // Reads ShadowMount's debug log (read-only, its last 256 KiB) for the latest launches; quiet when it
    // cannot, so a missing ShadowMount only means nothing new is learned.
    let reading = null;
    const refreshLaunches = () => reading ?? (reading = (async () => {
      if (platform !== "ps5" || transferring()) return false;
      try {
        const { capabilities } = await shadowMountInfo();
        if (!capabilities.includes("read_debug_log")) return false;
        const reply = await shadowRequest2("debug-log", { max_bytes: 262144 });
        const content = String(reply.content ?? "");
        try {
          playtime?.learn(content);
        } catch (error2) {
          console.log(`[download-queue] play time not read: ${error2.message}`);
        }
        return learnLaunches(launchOutcomes(content));
      } catch (error2) {
        console.log(`[download-queue] launches not read: ${error2.message}`);
        return false;
      }
    })().finally(() => {
      reading = null;
    }));
    let syncing = null;
    // These background checks wait while a download holds the runtime's one network task (they would sit
    // behind its whole file); they run again when the gamer next opens a page, or when it finishes.
    const syncInstalls = (id) => transferring() ? Promise.resolve(false) : syncing ?? (syncing = (platform === "ps5" ? adoptMoved().catch((error2) => {
      console.log(`[download-queue] moved games not checked: ${error2.message}`);
    }) : Promise.resolve()).then(() => checkInstalls(id)).then((found) => refreshLaunches().then(() => found)).finally(() => {
      syncing = null;
    }));
    let running;
    for (const job2 of jobs.filter((item) => item.restore)) {
      const was = job2.restore;
      delete job2.restore;
      try {
        storageIdentity(job2);
        fs.diskUsage(job2.root);
      } catch {
        continue;
      }
      if (was === "running" && (job2.launches || 0) >= 2) continue;
      if (was === "running") {
        job2.launches = (job2.launches || 0) + 1;
        running = job2;
      }
      job2.state = "queued";
      job2.error = "";
    }
    if (jobs.some((job2) => job2.state === "queued")) {
      change();
      pump(running);
    }
    function continueJob(job2, url, verifiedOptions) {
      if (job2.state !== "awaiting-browser" || active2?.job === job2) return;
      webURL(url);
      if (!(job2.parts?.[job2.partIndex]?.written ?? job2.written) && job2.rootIdentity && !job2.adopted) {
        for (const path of partialFiles(job2)) if (fs.exists(path)) fs.remove(path);
      }
      if (job2.parts) job2.parts[job2.partIndex].options = verifiedOptions;
      job2.options = job2.parts ? void 0 : verifiedOptions;
      job2.directURL = verifiedOptions ? void 0 : url;
      delete job2.reresolved;
      job2.message = "";
      job2.error = "";
      job2.state = "queued";
      change();
      pump(job2);
    }
    // ---- Moving a finished game to another drive (Make Room, the library's Options) ----
    // The sidecar files a download leaves beside its file: its receipt ties it to that file's inode, so
    // they are not copied; they go with the original.
    const SIDECAR2 = /\.(?:complete|complete\.tmp|part|resume|resume\.tmp)$/;
    const moves = /* @__PURE__ */ new Map();
    // A file's bytes, or a folder's (its files, as far as `budget` entries go).
    function treeSize(path, budget = { left: 2e4 }) {
      const info = fs.stat(path);
      if (!info) return 0;
      if (!info.isDirectory) return info.size || 0;
      let total = 0;
      for (const entry2 of fs.readDir(path)) {
        if (--budget.left < 0) break;
        total += entry2.isDirectory ? treeSize(`${path}/${entry2.name}`, budget) : entry2.size || 0;
      }
      return total;
    }
    // What a move of `job2` copies: the files and folders it put on its drive that are still there, without
    // the sidecars and without what lies inside another of them; and the sidecars, which only go. A backport
    // (homebrew/backports/<TITLE>) stays where ShadowMount was given it: where ShadowMount looks for the
    // backport of a game on another drive is not established.
    function movable(job2) {
      const owned2 = ownedPaths(job2).filter((path) => fs.exists(path) && path !== job2.backportPath);
      const copies2 = owned2.filter((path) => !SIDECAR2.test(path)).filter((path, _, all) => !all.some((other) => other !== path && path.startsWith(`${other}/`)));
      return { copies: copies2, sidecars: owned2.filter((path) => SIDECAR2.test(path) && !copies2.some((other) => path.startsWith(`${other}/`))) };
    }
    const onRoot = (path, from, to) => path === from ? to : path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path;
    // Every path in the job (its artifact, payload, outputs...) under `from` now under `to`. The release
    // and its fallbacks are where it came from, not where it is, and stay.
    function rehome(value, from, to, depth = 0) {
      if (typeof value === "string") return onRoot(value, from, to);
      if (depth > 6 || value === null || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map((item) => rehome(item, from, to, depth + 1));
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, depth === 0 && ["release", "fallbacks", "currentSource", "options", "backportPath"].includes(key) ? item : rehome(item, from, to, depth + 1)]));
    }
    function rootIdentityOf(root2) {
      const info = fs.stat(root2);
      if (!info?.isDirectory) throw new Error(t("move.driveGone"));
      return `${info.device}:${info.inode}`;
    }
    // Points the job at its files' new drive, and saves that: from here on the copy is the game.
    function rehomeJob(job2, to) {
      const from = job2.root;
      const moved = rehome(job2, from, to);
      for (const key of Object.keys(job2)) if (!(key in moved)) delete job2[key];
      Object.assign(job2, moved, { root: to, rootIdentity: rootIdentityOf(to) });
    }
    async function mountedOf(job2, paths, log2) {
      if (job2.artifact.nextAction !== "shadowmount" || platform !== "ps5") return [];
      const mounted = await quietNetwork(`move ${job2.id}`, () => mountedImages(shadowRequest2, paths, job2.root)).catch((error2) => {
        throw new Error(t("move.mountUnknown", { error: error2.message }));
      });
      if (mounted === null) log2("ShadowMount is not running, so none of its files is mounted");
      return mounted ?? [];
    }
    /**
     * Moves a finished game (everything its download put on its drive) to `to` (a storage root), in this
     * order, each step logged:
     *  1. checks: the job is finished and still, the other drive has room for it, nothing is in the way
     *     there, and ShadowMount has none of its images mounted;
     *  2. each file or folder is copied with FileSystem.copyAsync, read back against the original (and its
     *     download receipt, when it has one); the copy is `<path>.partial` until then;
     *  3. checked unmounted again, the job is pointed at the copy and saved: the copy is the game now;
     *  4. the originals and their sidecars are deleted;
     *  5. ShadowMount is told (shadowmount.js reregister): its scan finds the new place, or a manual entry
     *     names it, and a rescan is asked for (held until Jobee'sLair closes, being a game itself).
     * A move cut off before step 3 (a failure, a cancel, the app closing) leaves the game where it was and
     * the copy so far in place; moving again resumes it, cancelling deletes it. `onProgress(fraction)`.
     * Resolves with { note }.
     */
    function relocate(id, to, { onProgress = () => {
    } } = {}) {
      const job2 = find(id);
      if (moves.has(job2)) return moves.get(job2).done;
      const log2 = (message) => console.log(`[download-queue] move ${job2.id}: ${message}`);
      const control = { task: null, cancelled: false };
      const done = (async () => {
        if (!COMPLETE.includes(job2.state) || deletions.has(job2) || active2?.job === job2) throw new Error(t("move.notReady"));
        if (job2.root === to) throw new Error(t("move.sameDrive"));
        const from = job2.root;
        storageIdentity(job2);
        rootIdentityOf(to);
        const { copies: copies2, sidecars } = movable(job2);
        if (!copies2.length) throw new Error(t("move.nothing"));
        const sizes = copies2.map((path) => treeSize(path));
        const total = sizes.reduce((sum, size) => sum + size, 0);
        const staged = (path) => {
          try {
            return treeSize(`${onRoot(path, from, to)}.partial`);
          } catch {
            return 0;
          }
        };
        const room = fs.diskUsage(to).free + copies2.reduce((sum, path) => sum + staged(path), 0);
        log2(`${copies2.length} paths, ${total} bytes, to ${to} (${room} bytes there)`);
        if (room < total + MARGIN2) throw new Error(t("move.noRoom", { size: formatBytes(total + MARGIN2 - room) }));
        for (const path of copies2) if (fs.exists(onRoot(path, from, to))) throw new Error(t("move.inTheWay", { path: onRoot(path, from, to) }));
        const mounted = await mountedOf(job2, copies2, log2);
        if (mounted.length) throw new Error(t("move.mounted", { path: mounted[0].path }));
        job2.moving = { to, total, written: 0, at: Date.now() };
        change();
        let copied = 0;
        try {
          for (const [index, path] of copies2.entries()) {
            if (control.cancelled) throw Object.assign(new Error(t("move.cancelled")), { name: "AbortError" });
            const target = onRoot(path, from, to);
            fs.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
            const task = control.task = fs.copyAsync(path, target, { verify: true, resume: true, receipt: true });
            task.subscribe((progress) => {
              // Copying, then reading back: each half of the work.
              job2.moving.written = copied + ((progress.written || 0) + (progress.verified || 0)) / 2;
              onProgress(total ? job2.moving.written / total : 0);
              emit2();
            });
            const result = await task.done;
            copied += sizes[index];
            log2(`copied ${path} to ${target}${result.receipt ? ` (download receipt: ${result.receipt})` : ""}, read back and matched`);
          }
          control.task = null;
          const still = await mountedOf(job2, copies2, log2);
          if (still.length) throw new Error(t("move.mounted", { path: still[0].path }));
        } catch (error2) {
          job2.moving = { ...job2.moving, interrupted: true, error: error2.name === "AbortError" ? "" : error2.message };
          log2(`stopped: ${error2.message}`);
          change();
          throw error2;
        }
        const previous = JSON.parse(JSON.stringify(job2));
        delete job2.moving;
        rehomeJob(job2, to);
        try {
          change();
        } catch (error2) {
          for (const key of Object.keys(job2)) delete job2[key];
          Object.assign(job2, previous);
          throw error2;
        }
        log2(`the game now lives on ${to}`);
        let note = null;
        for (const path of [...copies2, ...sidecars]) {
          try {
            await fs.removeAsync(path);
            log2(`deleted the original ${path}`);
          } catch (error2) {
            log2(`original ${path} not deleted: ${error2.message}`);
            note = t("move.leftBehind", { path });
          }
        }
        // The folder an archive's images were unpacked into, empty now, goes too (homebrew/ itself stays).
        for (const folder of new Set(copies2.map((path) => path.slice(0, path.lastIndexOf("/"))))) {
          try {
            if (folder.startsWith(`${from}/homebrew/`) && fs.exists(folder) && !fs.readDir(folder).length) fs.remove(folder);
          } catch {
          }
        }
        if (job2.artifact.nextAction === "shadowmount" && platform === "ps5") {
          // ShadowMount's sources are each image (or the game's folder), not the folder holding a set of
          // images: those are what its scan and manual.lst name.
          const sources = job2.artifact.images?.length ? job2.artifact.images : [job2.artifact.destination];
          for (const path of sources.filter((item) => item.startsWith(`${to}/homebrew/`))) {
            const { steps, failed } = await quietNetwork(`move ${job2.id}`, () => reregister(shadowRequest2, { from: onRoot(path, to, from), to: path }));
            log2(`ShadowMount: ${steps.join("; ")}`);
            note || (note = failed ? t("move.tellShadowMount") : t("move.afterClose"));
          }
        }
        emit2();
        return { note };
      })().finally(() => moves.delete(job2));
      moves.set(job2, { done, control });
      done.catch(() => {
      });
      return done;
    }
    // Stops a move and deletes its copy so far: the game stays where it was, untouched.
    async function cancelMove(id) {
      const job2 = find(id);
      const running = moves.get(job2);
      if (running) {
        running.control.cancelled = true;
        running.control.task?.cancel();
        await running.done.catch(() => {
        });
      }
      if (!job2.moving) return;
      const { copies: copies2 } = movable(job2);
      for (const path of copies2) {
        const partial = `${onRoot(path, job2.root, job2.moving.to)}.partial`;
        if (fs.exists(partial)) await removePath(partial);
      }
      console.log(`[download-queue] move ${job2.id}: cancelled, its copy deleted`);
      delete job2.moving;
      change();
    }
    // A game moved outside the app (another tool, FTP): when its file is gone from where the job left it,
    // and ShadowMount's record of the title points at that file's name on another drive, the job follows it.
    async function adoptMoved() {
      const lost = jobs.filter((job2) => job2.state === "installed" && job2.artifact.nextAction === "shadowmount" && !job2.moving && !fs.exists(job2.artifact.destination));
      let adopted = false;
      for (const job2 of lost) {
        const game = await gameInfo(job2.installedTitleId ?? job2.consoleTitleId ?? job2.titleId).catch(() => null);
        const root2 = /^(\/data|\/mnt\/(?:usb|ext)\d+)\//.exec(game?.path ?? "")?.[1];
        if (!root2 || root2 === job2.root || onRoot(job2.artifact.destination, job2.root, root2) !== game.path || !fs.exists(game.path)) continue;
        console.log(`[download-queue] ${job2.id}: its files moved to ${root2} (ShadowMount has ${game.path}); the task follows them`);
        rehomeJob(job2, root2);
        adopted = true;
      }
      if (adopted) change();
      return adopted;
    }
    // Coming back to Jobee'sLair is when a game was just tried: what its launch did is read now.
    if (platform === "ps5") void refreshLaunches();
    return {
      snapshot,
      subscribe(listener) {
        listeners4.add(listener);
        listener(snapshot());
        return () => listeners4.delete(listener);
      },
      /** `alternatives`: other sources of the game, best first, tried in order if this one can't start. */
      enqueue(game, release, root2, alternatives = []) {
        const id = `${game.id}/${release.id}`;
        const existing = jobs.find((job2) => job2.id === id);
        if (existing) return existing.id;
        if (release.unavailableReason) throw new Error(release.unavailableReason);
        const artifact2 = artifactFor(release, root2);
        if (fs.exists(artifact2.destination)) throw new Error("Destination already exists. Choose another release or inspect the existing file.");
        if (jobs.some((job2) => job2.artifact.destination === artifact2.destination)) throw new Error("Another queued release owns this filename.");
        const staged = stagedPath(artifact2, root2);
        if (staged !== artifact2.destination && fs.exists(staged)) throw new Error("Destination already exists. Choose another release or inspect the existing file.");
        const partial = [artifact2.destination, staged].map((path) => `${path}.part`).find((path) => fs.exists(path));
        const orphan = Boolean(partial);
        if (jobs.length === 32) jobs = jobs.filter((job2) => !COMPLETE.includes(job2.state));
        if (jobs.length === 32) throw new Error("Queue has 32 unfinished downloads. Finish or remove one first.");
        if (release.sizeBytes) {
          const pending2 = holding(root2);
          const held = orphan ? Math.min(fs.stat(partial)?.size || 0, release.sizeBytes) : 0;
          const need = stillNeeded({ release, artifact: artifact2, total: release.sizeBytes, written: held });
          const free = fs.diskUsage(root2).free;
          const shortfall = spaceShortfall(root2, need, free, pending2);
          // `shortfall` on the error says how much more the drive needs, for Make Room to free it.
          if (shortfall) throw Object.assign(new Error(shortfall), { shortfall: { root: root2, need: need + MARGIN2, free: Math.max(0, free - pending2.reduce((sum, job2) => sum + stillNeeded(job2), 0)) } });
        }
        jobs.push({
          id,
          gameId: game.id,
          titleId: game.titleId || game.id,
          title: game.title,
          role: roleOf(release),
          release: { ...release },
          requestedId: release.id,
          fallbacks: alternatives.slice(0, 4).map((item) => ({ ...item })),
          root: root2,
          artifact: artifact2,
          state: "queued",
          written: 0,
          total: release.sizeBytes || null,
          error: ""
        });
        try {
          if (orphan) Object.assign(jobs.at(-1), { rootIdentity: storageIdentity(jobs.at(-1)), adopted: true });
          change();
        } catch (error2) {
          jobs.pop();
          throw error2;
        }
        pump();
        return id;
      },
      pause(id) {
        pauseJob(find(id));
      },
      /** Installs a downloaded PKG again, after the console refused it or the app closed while installing. */
      install(id) {
        const job2 = find(id);
        if (job2.state !== "installer-required" || !canInstall()) return;
        job2.install = true;
        job2.state = "queued";
        job2.error = "";
        change();
        pump();
      },
      get installs() {
        return canInstall();
      },
      resume(id) {
        const job2 = find(id);
        if (job2.state !== "paused" && job2.state !== "failed") return;
        delete job2.reresolved;
        job2.state = "queued";
        job2.error = "";
        change();
        pump();
      },
      async restart(id) {
        const job2 = find(id);
        if (!["paused", "failed", "awaiting-browser"].includes(job2.state) || active2?.job === job2) return;
        if (job2.adopted) throw new Error(ADOPTED);
        const paths = !job2.parts?.[job2.partIndex]?.completed && (job2.options || job2.rootIdentity || job2.written || fs.exists(job2.artifact.destination + ".part") || fs.exists(job2.artifact.destination + ".resume")) ? partialFiles(job2) : [];
        if (paths.length) await removing(job2, () => removeAll(paths));
        delete job2.directURL;
        delete job2.reresolved;
        if (job2.parts?.[job2.partIndex] && !job2.parts[job2.partIndex].completed) {
          job2.parts[job2.partIndex].written = 0;
          delete job2.parts[job2.partIndex].options;
        }
        job2.written = job2.parts ? job2.parts.reduce((sum, part) => sum + part.written, 0) : 0;
        job2.bytesPerSecond = 0;
        delete job2.options;
        delete job2.inspected;
        job2.state = "queued";
        job2.error = "";
        change();
        pump();
      },
      remove(id) {
        const job2 = find(id);
        if (!["paused", "failed", "awaiting-browser", ...COMPLETE].includes(job2.state) || active2?.job === job2) return;
        const previous = jobs;
        jobs = jobs.filter((item) => item !== job2);
        try {
          save();
        } catch (error2) {
          jobs = previous;
          throw error2;
        }
        emit2();
        pump();
      },
      /**
       * Uninstalls a finished game from ShadowMount and, once ShadowMount's image list shows none of the
       * task's paths mounted, deletes everything the task put on its drive and forgets it. A ShadowMount
       * that does not answer mounts nothing, so the files go. Each step is logged.
       */
      async deleteFromDisk(id) {
        const job2 = find(id);
        if (deletions.has(job2)) return deletions.get(job2);
        // A finished job, or one stopped part-way (paused, failed, waiting on a browser) whose partial and
        // extracted files would otherwise stay behind; one that is running is cancelled instead.
        if (active2?.job === job2) throw new Error(t("downloads.deleteRunning"));
        if (!DELETABLE.includes(job2.state)) throw new Error(t("downloads.deleteBusy"));
        if (moves.has(job2)) throw new Error(t("move.busy"));
        // Resolves with { note } (what the gamer should know, or null) once the files are gone and the task
        // forgotten; rejects, files kept, when they could not safely go. Every step is logged.
        const deletion = (async () => {
          console.log(`[download-queue] delete ${job2.id}: requested (${job2.state})`);
          storageIdentity(job2);
          // A move stopped part-way left a copy on the other drive: it goes first.
          if (job2.moving) await cancelMove(job2.id);
          const managed = job2.artifact.nextAction === "shadowmount" && platform === "ps5";
          const note = await removing(job2, () => managed ? quietNetwork(`delete ${job2.id}`, () => deleteJob(job2)) : deleteJob(job2));
          console.log(`[download-queue] delete ${job2.id}: done${note ? ` (${note})` : ""}`);
          return { note };
        })().catch((error2) => {
          console.log(`[download-queue] delete ${job2.id}: stopped: ${error2.message}`);
          throw error2;
        }).finally(() => deletions.delete(job2));
        deletions.set(job2, deletion);
        return deletion;
      },
      /** Runs `work` (which asks ShadowMount something now) with the download in progress paused; see quietNetwork. */
      quietNetwork,
      /** Moves a finished game to another drive (copied, read back, then the original deleted); see relocate. */
      relocate,
      /** Stops a game's move and deletes its copy so far; the game stays where it was. */
      cancelMove,
      /** Whether a move of job `id` is running now. */
      isMoving: (id) => [...moves.keys()].some((job2) => job2.id === id),
      /** Whether a download holds the runtime's one network task now (state/shadowmount.js createShadowClient). */
      transferring,
      /**
       * Lends the runtime's one network task while the queue has nothing to do: no job running or queued, and
       * nothing asking ShadowMount. Returns the function that gives it back, or null when the queue needs it.
       * `onYield` is called when a job is queued (or ShadowMount must be asked): stop the transfer, then give
       * the network back; the queue starts nothing until then.
       */
      lendNetwork(onYield) {
        if (borrower || active2 || holds || jobs.some((job2) => job2.state === "queued")) return null;
        const lease = { yield: () => {
          try {
            onYield();
          } catch (error2) {
            console.log(`[download-queue] the network's borrower did not stop: ${error2.message}`);
          }
        } };
        borrower = lease;
        return () => {
          if (borrower !== lease) return;
          borrower = null;
          pump();
        };
      },
      /** Deletes only the archive's notes kept beside a finished job (<name>-extras); the game stays. */
      async deleteExtras(id) {
        const job2 = find(id);
        const path = job2.extras;
        if (!path || path === job2.artifact.destination || path === job2.output) return;
        storageIdentity(job2);
        if (fs.exists(path)) await removePath(path);
        console.log(`[download-queue] ${job2.id}: deleted ${path}`);
        delete job2.extras;
        change();
      },
      openBrowser(id) {
        const job2 = find(id);
        if (job2.state !== "awaiting-browser") return;
        if (!linking?.openURL(webURL(job2.browserUrl).url)) throw new Error("The browser could not open. Open this source on another device.");
        job2.message = t("downloads.afterVerification");
        change();
      },
      continueWithURL(id, url) {
        continueJob(find(id), url);
      },
      /** Marks finished images (all, or job `id`'s) ShadowMount has installed since as installed; false when none or it can't be asked. */
      syncInstalls,
      /** Learns from ShadowMount's log which titles' last launches started ("Played") or not ("Won't start"). */
      refreshLaunches,
      /** Frees the engine's one archive task, for the updater: a set extracting while it downloads extracts after its download instead. */
      async yieldArchives() {
        const streamed = active2?.streamed;
        if (streamed) {
          streamed.task.cancel();
          await streamed.done;
        }
      },
      /** Whether the queue keeps the console awake: some download is queued or running. */
      get awake() {
        return awake2;
      },
      /** Discards the partial file and forgets the task; an active one is paused first. */
      async cancel(id) {
        const job2 = find(id);
        if (COMPLETE.includes(job2.state) || job2.state === "removing") return;
        if (active2?.job === job2) {
          job2.cancelling = true;
          this.pause(id);
          return;
        }
        // Stopped after its download finished (an extraction that failed, say): everything it put on the
        // drive goes, archive and extracted files included, where forgetting it would refuse ("A final
        // file exists") and keep them all.
        if (["paused", "failed", "awaiting-browser"].includes(job2.state) && !job2.adopted && job2.rootIdentity && onOriginalStorage(job2) && (job2.payload || job2.output || fs.exists(job2.downloadDestination || job2.artifact.destination))) {
          return await this.deleteFromDisk(id);
        }
        await forget(job2);
        emit2();
        pump();
      },
      /**
       * "Why won't it start?": reads ShadowMount's debug log and the system's SDK log through its API
       * (read-only, 128 KiB tails) and says what the title's last launch got to. Throws when ShadowMount
       * does not answer.
       */
      async diagnose(id) {
        const job2 = find(id);
        const title = job2.installedTitleId ?? job2.consoleTitleId ?? job2.titleId;
        const read = (route2, capability, capabilities) => capabilities.includes(capability) ? shadowRequest2(route2, { max_bytes: 131072 }).then((reply) => String(reply.content ?? ""), (error2) => {
          console.log(`[download-queue] ${route2} not read: ${error2.message}`);
          return null;
        }) : Promise.resolve(null);
        // The gamer is waiting on the answer: a download in progress is paused for it (quietNetwork).
        const { version: version3, debug, kernel } = await quietNetwork(`see why ${job2.id}`, async () => {
          const { version: version4, capabilities } = await shadowMountInfo();
          const [debug2, kernel2] = await Promise.all([read("debug-log", "read_debug_log", capabilities), read("kernel-log", "read_kernel_log", capabilities)]);
          return { version: version4, debug: debug2, kernel: kernel2 };
        });
        const result = diagnoseLaunch({ title, debug, kernel, version: version3 });
        if (debug !== null) {
          try {
            playtime?.learn(debug);
          } catch {
          }
          learnLaunches(launchOutcomes(debug));
        }
        console.log(`[download-queue] diagnosis ${job2.id}: ${result.verdict.key}, ${result.launches} launches in ShadowMount's log\n${result.lines.join("\n")}`);
        return result;
      },
      async register(id) {
        const job2 = find(id);
        if (job2.artifact.nextAction !== "shadowmount" || !COMPLETE.includes(job2.state)) return;
        try {
          if (await markInstalled([job2]).catch(() => false)) return;
          const { capabilities } = await shadowMountInfo();
          if (!capabilities.includes("rescan")) throw new Error("This ShadowMount version has no rescan API. Use its automatic scan.");
          await shadowRequest2("scan", { reset_attempts: false });
          job2.message = t("downloads.installRequested");
          job2.error = "";
        } catch (error2) {
          job2.error = error2.message;
        }
        change();
      }
    };
  }

export { BUSY, COMPLETE, DELETABLE, createDownloadQueue };
