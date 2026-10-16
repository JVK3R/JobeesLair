// ../pub-game-store/native/state/download-queue.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: an Archive.org refusal fails over or fails as a dead link instead of asking for the browser.
// MODIFIED: an archive the catalog's password doesn't open is tried with the known release passwords.
// MODIFIED: the Vikingfile browser capture is gone; every browser source opens the browser as is.

import { INCOMPLETE_PART, STALE_PARTIAL, cause } from '../downloads/errors.js';
import { t } from '../i18n/core.js';
import { archivePassword } from './archive-password.js';
import { BrowserRequired, archiveRefusal, cancellation, createSourceResolver, sourceKind, webURL } from './download-sources.js';
import { readJSON } from './read-json.js';
import { mountedImages, shadowRequest, within2 } from './shadowmount.js';
import { MARGIN2, spaceShortfall, stillNeeded } from './space.js';

  var ACTIVE = ["resolving", "connecting", "downloading", "verifying", "extracting", "installing", "pausing"];
  var BUSY = ["queued", ...ACTIVE];
  var COMPLETE = ["downloaded", "file-downloaded", "installer-required", "installed", "extraction-required", "extracted"];
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
      if (job2.state === "extracting") job2.written = job2.total;
      if (job2.state === "removing") {
        job2.state = job2.removingFrom ?? "failed";
        job2.error = REMOVAL_CUT;
      }
      delete job2.phase;
      delete job2.removingFrom;
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
    const snapshot = () => jobs.map((job2) => ({ ...job2 }));
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
    function failOver(job2, error2) {
      if (job2.written || job2.parts?.some((part) => part.written) || /space|storage|drive|disconnected/i.test(cause(error2.message))) return false;
      while (job2.fallbacks?.length) {
        const next = job2.fallbacks.shift();
        const artifact2 = artifactFor(next, job2.root);
        if (fs.exists(artifact2.destination) || fs.exists(`${artifact2.destination}.part`) || jobs.some((other) => other !== job2 && other.artifact.destination === artifact2.destination)) continue;
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
        job2.downloadDestination || (job2.downloadDestination = job2.artifact.destination);
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
        active2.transferring = true;
        task = downloads.enqueue({ ...job2.options, rejectHtml: true, mirrors: void 0, connections: 64, adaptive: true, rangeBytes: 16 * 1024 * 1024, destination: job2.downloadDestination, storageRoot: job2.root, recoverCompleted: true });
        active2.task = task;
        unsubscribe = task.subscribe((progress) => {
          if (job2.state === "pausing") return;
          if (ACTIVE.includes(progress.state)) job2.state = progress.state;
          job2.written = progress.written || 0;
          job2.total = progress.total ?? job2.total;
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
        await task.done;
        if (job2.artifact.nextAction === "downloaded") route(job2);
        job2.state = job2.artifact.nextAction === "shadowmount" ? "downloaded" : job2.artifact.nextAction === "downloaded" ? "file-downloaded" : job2.artifact.nextAction;
        job2.written = job2.total || job2.written;
        job2.bytesPerSecond = 0;
        if ((job2.artifact.nextAction === "extraction-required" || job2.output) && archives) await extract(job2, [job2.downloadDestination]);
        delete job2.reresolved;
        notifications.show(t("downloads.notice.complete"), job2.title);
        if (job2.state === "installer-required" && canInstall()) await install(job2);
      } catch (error2) {
        console.log("[download-queue] transfer stopped:", error2.message);
        // The engine words every 401/403 as a possible browser check; from Archive.org it is a
        // restricted or removed item, so it fails over like a dead link and reads as one.
        const refused = archiveRefusal(job2.parts ? job2.currentSource : job2.release, cause(error2.message));
        if (refused) error2 = new Error(`Source unavailable: HTTP ${refused}. Choose another source.`);
        const browser = !refused && (error2 instanceof BrowserRequired || /browser verification required/i.test(cause(error2.message)));
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
      const images = (result.artifacts || []).filter((path) => /\.(ffpfsc|ffpfs|ffpkg|exfat)$/i.test(path));
      if (images.length) {
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
        job2.artifact.destination = `${job2.output}/${images[0]}`;
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
          const destination = `${job2.root}/homebrew/${job2.release.filename.replace(/[^a-z0-9_.-]/gi, "_")}-app`;
          fs.mkdir(`${job2.root}/homebrew`, { recursive: true });
          if (fs.exists(destination)) throw new Error("Extracted destination already exists; preserve it and inspect before retrying.");
          storageIdentity(job2);
          fs.rename(folder, destination);
          if (folder !== job2.output) await fs.removeAsync(job2.output);
          job2.output = destination;
          job2.publishTo = destination;
          job2.artifact.nextAction = "shadowmount";
          job2.artifact.destination = destination;
          job2.state = "downloaded";
          job2.message = t("downloads.extractedReady", { parts: job2.parts ? "all" : "one" });
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
        const parts = path.startsWith(`${job2.root}/`) ? path.slice(job2.root.length + 1).split("/") : [];
        return !parts.some((part) => ["", ".", ".."].includes(part)) && (parts[0] === "homebrew" && parts.length >= 2 || parts[0] === "downloads" && parts.length >= 3);
      };
      const extracted = job2.output && `${job2.root}/downloads/extracted/${job2.release.filename.replace(/[^a-z0-9_.-]/gi, "_")}`;
      const paths = [
        job2.artifact.destination,
        job2.downloadDestination,
        job2.output,
        job2.publishTo,
        extracted,
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
      if (active2) return;
      const job2 = first?.state === "queued" ? first : jobs.find((item) => item.state === "queued");
      if (!job2) return;
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
    async function registered3(job2) {
      const paths = [job2.artifact.destination, job2.output, job2.publishTo].filter(Boolean);
      const info = (title) => shadowRequest2("games/info", { title_id: title }).catch((error2) => {
        if (/HTTP 404/.test(error2.message)) return null;
        throw error2;
      });
      const listed2 = await info(job2.consoleTitleId ?? job2.titleId);
      if (within2(listed2?.path, paths, job2.root)) return listed2;
      for (const image of await mountedImages(shadowRequest2, paths, job2.root).catch(() => null) ?? []) {
        const title = mountedTitle(image);
        if (!title || title === listed2?.title_id) continue;
        const game = await info(title);
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
    async function deleteJob(job2) {
      const log2 = (message) => console.log(`[download-queue] delete ${job2.id}: ${message}`);
      const paths = ownedPaths(job2);
      let uninstall = null;
      if (job2.artifact.nextAction === "shadowmount" && platform === "ps5") {
        const check = () => mountedImages(shadowRequest2, paths, job2.root).catch((error2) => {
          throw new Error(`ShadowMount could not say whether the image is mounted, so its files were kept: ${error2.message}`);
        });
        let mounted = await check();
        if (mounted === null) log2("ShadowMount is not running, so none of its files is mounted");
        else {
          let released = false;
          const game = await registered3(job2).catch((error2) => {
            log2(`game info failed: ${error2.message}`);
            return void 0;
          });
          log2(game ? `ShadowMount game ${game.title_id} at ${game.path}, runtime ${game.runtime_path || "none"}, installed ${game.installed}, managed ${game.managed}, mounted ${game.mounted}` : `ShadowMount ${game === null ? "has no game" : "was not asked about the game"} of ${job2.titleId}`);
          log2(mounted.length ? `mounted: ${mounted.map((image) => image.path).join(", ")}` : "none of its files is mounted");
          if (game !== null) {
            try {
              await shadowRequest2("games/uninstall", { title_id: game?.title_id ?? job2.installedTitleId ?? job2.titleId });
              log2("uninstalled");
              released = true;
            } catch (error2) {
              log2(`uninstall failed: ${error2.message}`);
              const unknown = /HTTP 404/.test(error2.message);
              if (game?.installed || game === void 0 && !unknown) throw new Error(`ShadowMount did not uninstall it, so its files were kept: ${error2.message}`);
              if (!unknown) uninstall = error2;
            }
          }
          const titles = new Set(mounted.map((image) => game && within2(game.path, [image.path], job2.root) ? game.title_id : mountedTitle(image)));
          if (game?.mounted) titles.add(game.title_id);
          titles.delete(null);
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
          if (mounted.length) {
            log2(`still mounted: ${mounted.map((image) => image.path).join(", ")}`);
            throw new Error(`ShadowMount still has ${mounted[0].path} mounted, so its files were kept. Close any game and try again; if it stays mounted, delete the game from ShadowMount's web page (port 10101), which unmounts it first.`);
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
      if (platform === "ps5") void logStorage(log2);
      const previous = jobs;
      jobs = jobs.filter((item) => item !== job2);
      try {
        save();
      } catch (error2) {
        jobs = previous;
        throw error2;
      }
      emit2();
      return uninstall;
    }
    async function markInstalled(candidates2) {
      let found = false;
      let learned = false;
      for (const job2 of candidates2) {
        const known = job2.consoleTitleId;
        const game = await registered3(job2);
        learned || (learned = job2.consoleTitleId !== known);
        if (!game?.installed || !jobs.includes(job2) || job2.state !== "downloaded") continue;
        job2.state = "installed";
        job2.message = t("downloads.installed");
        job2.error = "";
        job2.installedTitleId = game.title_id;
        found = true;
      }
      if (found || learned) change();
      return found;
    }
    async function checkInstalls(id) {
      const candidates2 = jobs.filter((job2) => job2.state === "downloaded" && job2.artifact.nextAction === "shadowmount" && (id === void 0 || job2.id === id));
      if (platform !== "ps5" || !candidates2.length) return false;
      try {
        return await markInstalled(candidates2);
      } catch (error2) {
        console.log("[download-queue] ShadowMount install check failed:", error2.message);
        return false;
      }
    }
    let syncing = null;
    const syncInstalls = (id) => syncing ?? (syncing = checkInstalls(id).finally(() => {
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
        const orphan = fs.exists(`${artifact2.destination}.part`);
        if (jobs.length === 32) jobs = jobs.filter((job2) => !COMPLETE.includes(job2.state));
        if (jobs.length === 32) throw new Error("Queue has 32 unfinished downloads. Finish or remove one first.");
        if (release.sizeBytes) {
          const pending2 = holding(root2);
          const held = orphan ? Math.min(fs.stat(`${artifact2.destination}.part`)?.size || 0, release.sizeBytes) : 0;
          const need = stillNeeded({ release, artifact: artifact2, total: release.sizeBytes, written: held });
          const shortfall = spaceShortfall(root2, need, fs.diskUsage(root2).free, pending2);
          if (shortfall) throw new Error(shortfall);
        }
        jobs.push({
          id,
          gameId: game.id,
          titleId: game.titleId || game.id,
          title: game.title,
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
        const job2 = find(id);
        if (job2.state === "queued") job2.state = "paused";
        else if (active2?.job === job2 && ACTIVE.includes(job2.state)) {
          job2.state = "pausing";
          active2.cancel?.cancel();
          active2.task?.cancel();
        }
        change();
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
        if (!COMPLETE.includes(job2.state)) return;
        const deletion = (async () => {
          storageIdentity(job2);
          const uninstall = await removing(job2, () => deleteJob(job2));
          if (uninstall) throw new Error(`Deleted from disk, but ShadowMount did not uninstall it: ${uninstall.message}`);
        })().finally(() => deletions.delete(job2));
        deletions.set(job2, deletion);
        return deletion;
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
        await forget(job2);
        emit2();
        pump();
      },
      async register(id) {
        const job2 = find(id);
        if (job2.artifact.nextAction !== "shadowmount" || !COMPLETE.includes(job2.state)) return;
        try {
          if (await markInstalled([job2]).catch(() => false)) return;
          const version2 = await shadowRequest2("version");
          if (!version2.capabilities?.includes("rescan")) throw new Error("This ShadowMount version has no rescan API. Use its automatic scan.");
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

export { BUSY, COMPLETE, createDownloadQueue };
