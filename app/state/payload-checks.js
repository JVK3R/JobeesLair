// A download's payload checked before ShadowMount can see it, and set in place: a transfer holds exactly the
// bytes declared, an extraction's images and game folder are real and listed in its receipt, a backport goes to
// homebrew/backports/<TITLE_ID>, what else an archive held is kept beside it. Split out of download-queue.js:
// it works on a job's files only, and the queue decides what happens to the job.

import { t } from '../i18n/core.js';
import { consoleFirmware, firmwareText, newerFirmware, requiredFirmware } from './firmware.js';

  // An image named as an update, patch or add-on rather than the base game: the base goes first.
  var ADDON = /(?:^|[^a-z])(?:update|patch|dlc)(?:[^a-z]|$)/i;
  // The engine's completion receipt in an extraction's root: "P5AR001:<identity>", then "<sha256>|<path>"
  // for every file, written only after the whole archive was read and every file hashed.
  var RECEIPT = ".ps5-react-extraction";
  var baseName = (path) => path.slice(path.lastIndexOf("/") + 1);
  /** `firmware`: the console's system software ("13.60") or null; `storageIdentity`: the queue's drive check. */
  function createPayloadChecks({ fs, firmware, storageIdentity, openFiles = () => 0 }) {
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
      // 0.5.2: its files opened to every user, as a game folder's are: ShadowMount lays its eboot.bin and libraries
      // over the game, and the console runs none of them while they are rw-rw-rw- (download-queue.js openGameFiles).
      openFiles(destination);
      job2.opened = true;
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
    return { transferProblem, checkTransfer, verifyImages, verifyGameFolder, keepExtras, placeBackport, orderImages, changedPayload };
  }

export { RECEIPT, createPayloadChecks };
