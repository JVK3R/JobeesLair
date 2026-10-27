// Installing a newer Jobee'sLair from its GitHub release (the checker is state/updater.js, the schedule
// state/update.js). The app runs from its own disk image (homebrew/JobeesLair.exfat, mounted by ShadowMount+
// while it is open), so it can download and check a new one but cannot put it in place: updater.elf does
// that once the app has closed (SelfUpdate.arm, ps5-react native/ps5/payloads/updater.c).
//
//   1. Where: ShadowMount+'s record of this title (games/info) names the installed image. Everything is
//      staged on that image's drive, in <drive>/JobeesLair/update_staging/<version>/ (on internal storage,
//      /data/JobeesLair/update_staging/), so the final swap is a rename, never a 0.5 GB copy.
//   2. Download: update.zip, then the image as JobeesLair.exfat.staged (ShadowMount+ takes only names ending
//      in .exfat, so a staged image is never installed as a second copy of the title). Each is checked
//      against the size and SHA-256 GitHub gives for it before it is published under its name; the
//      runtime's one network task is borrowed only while the download queue has nothing to do, and given
//      back the moment a game download is queued (download-queue.js lendNetwork). A cut download resumes.
//   3. Check: update.zip is extracted and its sce_sys/param.json must name this title and the release's
//      package version, beside a non-empty eboot.bin. The extracted copy and the zip are then deleted.
//   4. Ready: "Restart to apply" writes <control>/apply.txt and arms the updater, which swaps the image in
//      after the app closes and opens it again; with automatic installs on, the updater is armed as soon as
//      the image is ready and swaps it in whenever the app is next closed. The new build confirms that it
//      started (booted.txt); one that does not is replaced by the old image again.
//
// The state lives in auto-update.json (phase, version, where), so a restart resumes a download or keeps a
// ready update. Phases: idle, waiting (for the network), downloading, checking, ready, armed, failed.

import { extractInTurn } from './archive-turn.js';
import { stagingOf } from './extraction-staging.js';
import { contentVersionOf, newer } from './updater.js';
import { IMAGE_NAME as IMAGE } from '../version.js';

  var STAGING = "JobeesLair/update_staging";
  var IMAGE_NAME = `${IMAGE}.staged`;
  var ROOT_OF = /^(\/data|\/mnt\/(?:usb|ext)\d+)\//;
  // A path the updater takes as one line of apply.txt, and as JSON to ShadowMount+.
  var PLAIN_PATH = /^\/[^\0\r\n"\\]+$/;
  var MARGIN = 256 * 1024 ** 2;
  // update.zip unpacked takes at most this many times its size while it is checked.
  var UNPACKED = 3;
  var RETRY_MS = 15e3;
  var TRIES = 4;
  function stopped() {
    return Object.assign(new Error("The update was cancelled."), { name: "AbortError" });
  }
  function createAutoUpdater({
    fs,
    downloads,
    archives,
    // (onYield) => release | null: download-queue.js lendNetwork.
    lend,
    // async () => the installed image's path, from ShadowMount+ (games/info).
    locate,
    // (controlDir) => true | the reason the updater could not be armed (SelfUpdate.arm).
    arm,
    // async (root) => free bytes on that drive.
    freeBytes,
    store,
    controlDir,
    version: running,
    titleId,
    // Whether the gamer turned automatic installs on (Settings).
    automatic = () => false,
    notify = () => {
    },
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = (line) => console.log(`[auto-update] ${line}`)
  }) {
    const listeners = /* @__PURE__ */ new Set();
    let view = { phase: "idle", version: null, written: 0, total: 0, file: "", error: "", outcome: null };
    // The pipeline running now: { version, cancelled, task, release }.
    let run = null;
    const saved = () => store.get() ?? {};
    const save = (fields) => store.set({ ...saved(), ...fields });
    function publish(fields) {
      view = { ...view, ...fields };
      for (const listener of [...listeners]) listener(view);
    }
    function settle(fields) {
      save(fields);
      publish(fields);
    }
    const stagedImage = (staging) => `${staging}/${IMAGE_NAME}`;
    const control = (name) => `${controlDir}/${name}`;
    function readControl(name) {
      try {
        return fs.exists(control(name)) ? fs.readFile(control(name)) : null;
      } catch {
        return null;
      }
    }
    function writeControl(name, text) {
      fs.mkdir(controlDir, { recursive: true });
      fs.writeFile(control(`${name}.tmp`), text, { sync: true });
      fs.rename(control(`${name}.tmp`), control(name));
    }
    function removeControl(name) {
      try {
        if (fs.exists(control(name))) fs.remove(control(name));
      } catch (error) {
        log(`could not delete ${name}: ${error.message}`);
      }
    }
    const removeQuietly = (path) => fs.exists(path) ? fs.removeAsync(path).catch((error) => log(`could not delete ${path}: ${error.message}`)) : Promise.resolve();
    // The staging folders of other versions (a newer release came out, an update was applied).
    async function clearStaging(root, keep) {
      const base = `${root}/${STAGING}`;
      let entries = [];
      try {
        entries = fs.exists(base) ? fs.readDir(base) : [];
      } catch {
      }
      await Promise.all(entries.filter((entry) => entry.name !== keep).map((entry) => removeQuietly(`${base}/${entry.name}`)));
    }
    // The result updater.elf left: { outcome, version, reason }.
    function payloadResult() {
      const text = readControl("result.txt");
      if (!text) return null;
      const fields = Object.fromEntries(text.split("\n").filter(Boolean).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
      return fields.outcome ? { outcome: fields.outcome, version: fields.version ?? "", reason: fields.reason ?? "" } : null;
    }
    /**
     * At launch: says that this build started (the updater waits for it after a swap), reads what the
     * updater did, and puts the saved state right: an applied update is cleaned up, a refused one stays
     * ready, a rolled-back one failed, a download that was cut off waits to resume.
     */
    function start() {
      try {
        writeControl("booted.txt", `${running}\n`);
      } catch (error) {
        log(`could not write booted.txt: ${error.message}`);
      }
      const state = saved();
      const result = payloadResult();
      if (result && result.outcome !== "swapped") removeControl("result.txt");
      if (result) log(`the updater reported ${result.outcome} ${result.version}${result.reason ? `: ${result.reason}` : ""}`);
      if (state.version && state.version === running) {
        // This is the build the update installed.
        log(`${running} is installed`);
        if (state.staging) void removeQuietly(state.staging);
        store.set({});
        publish({ phase: "idle", version: null, outcome: { outcome: "applied", version: running, reason: result?.reason ?? "" } });
        return;
      }
      if (!state.version || !newer(state.version, running)) {
        if (state.staging) void removeQuietly(state.staging);
        if (state.version) store.set({});
        publish({ phase: "idle", version: null, outcome: null });
        return;
      }
      const outcome = result?.version === state.version ? result : null;
      // The updater put that version's image in place, yet the build that started is not it: the release's
      // files are not the version its tag says (a build made before its version was raised). Offering it
      // again would loop (download, swap, the same build, the same offer), so it is set aside: never
      // downloaded automatically again, only when the gamer asks, until another release comes out.
      if (outcome?.outcome === "swapped" || outcome?.outcome === "applied") {
        const reason = `The ${state.version} update started as version ${running}: the release's files are not the version it says, so it won't be installed automatically again.`;
        log(reason);
        if (state.staging) void removeQuietly(state.staging);
        removeControl("apply.txt");
        store.set({ version: state.version, phase: "failed", error: reason, mismatched: state.version });
        publish({ phase: "failed", version: state.version, error: reason, outcome: { ...outcome, reason } });
        return;
      }
      if (outcome?.outcome === "rolledback" || outcome?.outcome === "failed") {
        settle({ phase: "failed", error: outcome.reason });
        publish({ version: state.version, outcome });
        return;
      }
      if (["ready", "armed"].includes(state.phase)) {
        const staged = fs.stat(stagedImage(state.staging));
        if (staged?.size !== state.image?.size) {
          log(`the staged image of ${state.version} is gone`);
          settle({ phase: "failed", error: "The downloaded update is gone. Download it again." });
          publish({ version: state.version });
          return;
        }
        // Armed but never carried out: the console restarted and the updater with it.
        settle({ phase: "ready", error: outcome?.outcome === "refused" ? outcome.reason : "" });
        publish({ version: state.version, outcome });
        if (automatic()) armOnClose();
        return;
      }
      // A download or check that was cut off resumes when the release is offered again.
      settle({ phase: "paused" });
      publish({ version: state.version, error: state.error ?? "" });
    }
    // Waits until the queue lends the network; `onYield` stops whatever uses it.
    async function borrow(current, onYield) {
      for (; ; ) {
        if (current.cancelled) throw stopped();
        const release = lend(() => onYield());
        if (release) return release;
        if (view.phase !== "waiting") publish({ phase: "waiting" });
        await wait(RETRY_MS);
      }
    }
    // Downloads one asset to `destination`, checked against its size and SHA-256 before it is published.
    async function fetch(current, file, asset, destination, offset, total) {
      for (let tries = 0; ; ) {
        let yielded = false;
        let task = null;
        let retry = false;
        const release = await borrow(current, () => {
          yielded = true;
          task?.cancel();
        });
        try {
          if (current.cancelled) throw stopped();
          publish({ phase: "downloading", file, written: offset, total });
          // Unlimited: the update never waits on the download speed limit (state/speed-limit.js).
          task = downloads.enqueue({ url: asset.url, destination, sha256: asset.sha256, expectedBytes: asset.size, recoverCompleted: true, unlimited: true });
          current.task = task;
          const unsubscribe = task.subscribe((snapshot) => publish({ written: offset + (snapshot.written || 0) }));
          try {
            await task.done;
          } finally {
            unsubscribe();
            current.task = null;
          }
          publish({ written: offset + asset.size });
          return;
        } catch (error) {
          if (current.cancelled) throw stopped();
          if (yielded) {
            log(`${file}: paused for a game download; it resumes after`);
            continue;
          }
          if (++tries >= TRIES) throw error;
          log(`${file}: ${error.message}; trying again`);
          retry = true;
        } finally {
          release();
        }
        // The network is given back while it waits to try again.
        if (retry) await wait(RETRY_MS);
      }
    }
    // update.zip's title folder must name this title and the release's package version.
    async function checkZip(current, staging, release) {
      publish({ phase: "checking", file: "zip" });
      const unpacked = `${staging}/update`;
      // What an earlier, cut-off check left. 0.5.3: the extractor's staging too (extraction-staging.js), which
      // refuses an update.zip downloaded again ("Staging belongs to another extraction").
      await Promise.all([unpacked, ...stagingOf(unpacked)].map(removeQuietly));
      // After a game download's extraction, when one is under way: one archive at a time (archive-turn.js).
      const task = await extractInTurn(archives, { sources: [`${staging}/update.zip`], destination: unpacked, maxBytes: Math.max(release.assets.zip.size * UNPACKED, 64 * 1024 ** 2) }, { stopped: () => current.cancelled, pause: wait }).catch((error) => {
        throw current.cancelled ? stopped() : error;
      });
      current.task = task;
      try {
        await task.done;
      } finally {
        current.task = null;
      }
      if (current.cancelled) throw stopped();
      let param = null;
      try {
        param = JSON.parse(fs.readFile(`${unpacked}/${titleId}/sce_sys/param.json`));
      } catch {
      }
      const expected = contentVersionOf(release.version);
      const problem = !param ? `update.zip has no ${titleId}/sce_sys/param.json` : param.titleId !== titleId ? `update.zip is for ${param.titleId}, not ${titleId}` : param.contentVersion !== expected ? `update.zip is version ${param.contentVersion}, not ${expected}` : !(fs.stat(`${unpacked}/${titleId}/eboot.bin`)?.size > 0) ? "update.zip has no eboot.bin" : "";
      await Promise.all([removeQuietly(unpacked), removeQuietly(`${staging}/update.zip`), removeQuietly(`${staging}/update.zip.complete`)]);
      if (problem) throw new Error(problem);
      log(`update.zip names ${titleId} ${param.contentVersion}`);
    }
    async function pipeline(current, release) {
      const { image, zip } = release.assets;
      const lent = await borrow(current, () => {
      });
      let target;
      try {
        target = await locate();
      } finally {
        lent();
      }
      const root = ROOT_OF.exec(target ?? "")?.[1];
      if (!root || !/\.exfat$/.test(target) || !PLAIN_PATH.test(target) || !fs.exists(target))
        throw new Error(`Jobee'sLair is not installed from an .exfat image ShadowMount+ manages (${target || "no record"}).`);
      const staging = `${root}/${STAGING}/${release.version}`;
      const contentVersion = contentVersionOf(release.version);
      settle({ phase: "downloading", version: release.version, target, staging, image, zip, contentVersion, error: "", checked: saved().version === release.version && saved().checked });
      await clearStaging(root, release.version);
      fs.mkdir(staging, { recursive: true });
      const have = (path) => fs.stat(path)?.size ?? fs.stat(`${path}.part`)?.size ?? 0;
      const checked = saved().checked === true;
      const need = image.size - have(stagedImage(staging)) + (checked ? 0 : zip.size * (1 + UNPACKED) - have(`${staging}/update.zip`)) + MARGIN;
      const free = await freeBytes(root);
      if (free < need) throw Object.assign(new Error(`The update needs ${need} bytes free on ${root}; ${free} are.`), { shortfall: { root, need, free } });
      const total = (checked ? 0 : zip.size) + image.size;
      if (!checked) {
        await fetch(current, "zip", zip, `${staging}/update.zip`, 0, total);
        await checkZip(current, staging, release);
        save({ checked: true });
      }
      await fetch(current, "image", image, stagedImage(staging), checked ? 0 : zip.size, total);
      settle({ phase: "ready", error: "" });
      log(`${release.version} is ready: ${stagedImage(staging)}`);
      notify(release.version);
      if (automatic()) armOnClose();
    }
    /**
     * Downloads and checks `release` (a describe() result with assets) unless that is already under way or
     * done; a different version's files are dropped first. Never throws: a failure is the `failed` phase.
     */
    function download(release) {
      if (!release?.assets || !newer(release.version, running)) return false;
      const state = saved();
      if (run?.version === release.version) return true;
      if (state.version === release.version && ["ready", "armed"].includes(state.phase)) return true;
      if (run) cancel();
      if (state.version && state.version !== release.version) {
        if (state.staging) void removeQuietly(state.staging);
        removeControl("apply.txt");
        store.set({});
      }
      const current = run = { version: release.version, cancelled: false, task: null };
      publish({ phase: "waiting", version: release.version, written: 0, total: release.assets.zip.size + release.assets.image.size, file: "", error: "", outcome: null });
      void pipeline(current, release).catch((error) => {
        if (error.name === "AbortError" || current.cancelled) return;
        log(`${release.version}: ${error.message}`);
        settle({ phase: "failed", error: error.message });
      }).finally(() => {
        if (run === current) run = null;
      });
      return true;
    }
    // A release seen by the check: downloaded right away when automatic installs are on, or when a download
    // of it was cut off (paused) and the gamer had started it.
    function offer(release) {
      if (!release?.assets || !newer(release.version, running)) return;
      const state = saved();
      // A release whose build turned out to be another version (start): shown, never fetched by itself.
      if (state.mismatched === release.version) {
        if (!run) publish({ version: release.version });
        return;
      }
      if (automatic() || state.version === release.version && state.phase === "paused") download(release);
      else if (state.version === release.version && !run) publish({ version: release.version });
    }
    /** Stops a download or check and deletes what it staged; a request to the updater is withdrawn. */
    function cancel() {
      const state = saved();
      if (run) {
        run.cancelled = true;
        try {
          run.task?.cancel();
        } catch {
        }
        run = null;
      }
      removeControl("apply.txt");
      if (state.staging) void removeQuietly(state.staging);
      store.set({});
      publish({ phase: "idle", version: null, written: 0, total: 0, file: "", error: "" });
    }
    // Writes apply.txt and arms the updater: { ok } or { ok: false, reason }.
    function apply({ relaunch }) {
      const state = saved();
      if (!["ready", "armed"].includes(state.phase)) return { ok: false, reason: "No update is ready." };
      const staged = stagedImage(state.staging);
      if (fs.stat(staged)?.size !== state.image?.size) {
        settle({ phase: "failed", error: "The downloaded update is gone. Download it again." });
        return { ok: false, reason: view.error };
      }
      if (!PLAIN_PATH.test(state.target) || !PLAIN_PATH.test(staged) || !fs.exists(state.target))
        return { ok: false, reason: `The installed image is not at ${state.target} any more.` };
      try {
        writeControl("apply.txt", `UPD1\nversion=${state.version}\ntarget=${state.target}\nstaged=${staged}\nsize=${state.image.size}\nrelaunch=${relaunch ? 1 : 0}\n`);
        removeControl("result.txt");
      } catch (error) {
        return { ok: false, reason: error.message };
      }
      let armed;
      try {
        armed = arm(controlDir);
      } catch (error) {
        armed = error.message;
      }
      if (armed !== true) {
        removeControl("apply.txt");
        const reason = typeof armed === "string" && armed ? armed : "The updater could not be started.";
        log(`not armed: ${reason}`);
        settle({ phase: "ready", error: reason });
        return { ok: false, reason };
      }
      log(`armed: ${state.version}${relaunch ? ", reopening now" : ", when the app closes"}`);
      settle({ phase: "armed", relaunch: Boolean(relaunch), error: "" });
      return { ok: true };
    }
    /** With automatic installs: the update goes in whenever the app is next closed. */
    const armOnClose = () => apply({ relaunch: false });
    /** "Restart to apply": the caller closes the app once this says ok; the updater opens it again. */
    const applyNow = () => apply({ relaunch: true });
    /** Automatic installs turned off: an update armed to go in on close waits for "Restart to apply". */
    function disarm() {
      if (saved().phase !== "armed") return;
      removeControl("apply.txt");
      settle({ phase: "ready" });
    }
    return {
      start,
      offer,
      download,
      cancel,
      applyNow,
      armOnClose,
      disarm,
      state: () => view,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

export { IMAGE_NAME, STAGING, createAutoUpdater };
