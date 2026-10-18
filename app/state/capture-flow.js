// The browser capture of a file link (from Overdrive 1.0.6, MyLuxy; adapted from Orbit Store, GPL-3.0): the
// console's browser is opened on the source's page and the file link read out of it, Vikingfile by its
// file's name, any other host by a link that names the game's title id (browser-links.js, viking-capture.js).
// Split out of download-queue.js; the queue hands it what it shares (its jobs, the capture sessions, the
// queue's own change/pump/continueJob) and keeps who starts a capture and who may continue a job.

import { t } from '../i18n/core.js';
import { sourceKind, webURL } from './download-sources.js';
import { LINK_PREFIX, captureAnchor, linkForLog, otherSourceLink, validateCapturedLink } from './browser-links.js';
import { VIKING_PAGE_PREFIX, VIKING_PREFIX, describeVikingCapture, linkPageMetadata, requirePart, validateVikingCapture, vikingLinkPage } from './viking-capture.js';

  // A LinkVault page adds its own check and a mirror page before the host's, so a link capture gets
  // the payload's longest window.
  var LINK_CAPTURE_SECONDS = 300;
  // The payload's first pass, before the page opens, fingerprints the links the browser already holds;
  // the task turns "capturing" when it ends (or settles if it fails), and only then may the page open,
  // so no link the page makes is counted as old.
  function armedCapture(task) {
    return new Promise((resolve) => {
      let off = null, settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        off?.();
        resolve();
      };
      off = task.subscribe((snapshot) => {
        if (snapshot.state !== "queued") finish();
      });
      if (settled) off();
      task.done.then(finish, finish);
    });
  }
  // Which source opened the browser, for the log: its provider, and the vault or host it opens.
  function sourceForLog(source2, browserUrl) {
    let host = "?";
    try {
      host = webURL(browserUrl).host;
    } catch {
    }
    return `${source2.provider || sourceKind(source2) || "?"} at ${host}${host.endsWith("link-vault.org") ? " (LinkVault)" : ""}`;
  }
  /**
   * The capture flows over a queue's shared state. `jobs` and `active` are read each time (the queue replaces
   * them); `change`, `pump` and `continueJob` are the queue's own.
   */
  function createCaptureFlow({ captures, jobs, active, change, pump, continueJob, http, linking, browserCapture, notifications, onCapture }) {
    function stopCapture(job2) {
      const session = captures.get(job2.id);
      if (session) {
        captures.delete(job2.id);
        session.cancel.cancel();
        session.task?.cancel();
      }
      delete job2.captureState;
      delete job2.captureError;
      delete job2.captureMode;
      delete job2.captureFile;
    }
    // A capture that failed: the job waits for the browser again, saying why; typing the link stays open.
    function captureFailed(job2, source2, session, error2) {
      console.log("[browser-capture] failed:", error2.message);
      onCapture(source2, false);
      session.cancel.cancel();
      session.task?.cancel();
      captures.delete(job2.id);
      job2.state = "awaiting-browser";
      job2.captureState = "failed";
      job2.captureError = error2.message;
      change();
      pump();
    }
    // The validated link handed to the queue, with the file's real length in place of the catalog's.
    function handOff(job2, source2, validated) {
      if (validated.filename) job2.fileName = validated.filename;
      source2.sizeBytes = validated.expectedBytes;
      if (!job2.parts) job2.total = validated.expectedBytes;
      notifications.show(t("downloads.notice.captured"), job2.title);
      console.log("[browser-capture] file validated; handing off to queue");
      onCapture(source2, true);
      continueJob(job2, validated.url, { url: validated.url, expectedBytes: validated.expectedBytes, sha256: source2.sha256 || void 0, rejectHtml: true });
    }
    // Vikingfile: its public page names the file, and only a link to that exact file is taken.
    async function captureVikingfile(job2, source2, session) {
      const current = () => captures.get(job2.id) === session && jobs().includes(job2) && job2.state === "awaiting-browser";
      let handingOff = false;
      try {
        const linkPage = vikingLinkPage(source2);
        console.log("[browser-capture] source:", sourceForLog(source2, job2.browserUrl));
        const deadline = Date.now() + (linkPage ? LINK_CAPTURE_SECONDS : 180) * 1e3;
        let metadata = null;
        if (linkPage) {
          // A vault hides which Vikingfile page it opens, so the capture first takes that page; its public
          // metadata then names the file exactly, as a direct Vikingfile source's does.
          session.task = browserCapture.capture({ prefix: VIKING_PAGE_PREFIX, suffix: "/", timeoutSeconds: LINK_CAPTURE_SECONDS });
        } else {
          metadata = await describeVikingCapture(http, source2, session.cancel.signal);
          if (!current()) return;
          session.task = browserCapture.capture({ prefix: VIKING_PREFIX, suffix: `/${metadata.filename}`, timeoutSeconds: 180 });
        }
        await armedCapture(session.task);
        if (!current()) return;
        job2.captureState = "capturing";
        change();
        if (!linking?.openURL(webURL(job2.browserUrl).url)) throw new Error("The browser could not open. Retry or enter the final file link.");
        if (linkPage) {
          const page = await session.task.done;
          if (!current()) return;
          metadata = await describeVikingCapture(http, { ...source2, url: page.url, browserUrl: page.url }, session.cancel.signal);
          if (!current()) return;
          requirePart(linkPageMetadata(source2).part, metadata.filename);
          const seconds = Math.floor((deadline - Date.now()) / 1e3);
          if (seconds < 5) throw new Error("The verification ran out of time. Reopen the page and retry.");
          session.task = browserCapture.capture({ prefix: VIKING_PREFIX, suffix: `/${metadata.filename}`, timeoutSeconds: seconds, resume: true });
        }
        const result = await session.task.done;
        if (!current()) return;
        job2.captureState = "validating";
        change();
        console.log("[browser-capture] link captured:", linkForLog(result.url), "- validating one-byte range");
        const validated = await validateVikingCapture(http, result.url, metadata, session.cancel.signal);
        if (!current()) return;
        handingOff = true;
        handOff(job2, source2, { ...validated, filename: metadata.filename });
      } catch (error2) {
        if (!current() && !(handingOff && jobs().includes(job2) && job2.state === "queued" && active()?.job !== job2)) return;
        captureFailed(job2, source2, session, error2);
      }
    }
    // A file that names no game waits for the gamer's word, shown under the download button.
    function confirmCapturedFile(job2, session, found) {
      return new Promise((resolve) => {
        session.decide = (accepted) => {
          delete session.decide;
          delete job2.captureFile;
          resolve(accepted);
        };
        session.cancel.signal.addEventListener("abort", () => session.decide?.(false));
        job2.captureState = "confirm";
        job2.captureFile = { name: found.filename, bytes: found.expectedBytes };
        change();
      });
    }
    // Any other host whose check only the browser passes (LinkVault's mirrors, AkiraBox, Datanodes,
    // Buzzheavier, 1fichier): the file link appears on the page, or when its download starts, and the
    // browser's memory is read for one that names the game's title id. A refused link (a page, an expired
    // route, another source's file) does not end the session: it scans on past it, up to six.
    async function captureBrowserLink(job2, source2, session) {
      const current = () => captures.get(job2.id) === session && jobs().includes(job2) && job2.state === "awaiting-browser";
      let handingOff = false;
      try {
        const anchor = captureAnchor(job2.titleId);
        console.log("[browser-capture] source:", sourceForLog(source2, job2.browserUrl), "- watching any file link carrying", anchor);
        // A LinkVault record's catalog size is the whole vault's, not the file's: only a direct host's
        // size is evidence.
        const vaulted = webURL(job2.browserUrl).host === "link-vault.org";
        const catalogBytes = vaulted ? null : source2.sizeBytes || null;
        const akiraBox = /(?:^|\.)akirabox\.(?:com|to)$/.test(webURL(job2.browserUrl).host) || vaulted && /#AkiraBox$/.test(job2.browserUrl);
        const akiraPart = akiraBox ? linkPageMetadata(source2).part : null;
        const deadline = Date.now() + LINK_CAPTURE_SECONDS * 1e3;
        const rejected = [];
        let validated = null;
        while (!validated) {
          const seconds = Math.floor((deadline - Date.now()) / 1e3);
          if (seconds < 5) throw new Error("Captured file failed validation or expired. Reopen the page and retry.");
          const resume = rejected.length > 0;
          session.task = browserCapture.capture({ prefix: LINK_PREFIX, suffix: `/${anchor}`, timeoutSeconds: seconds, rejected, resume });
          if (!resume) {
            await armedCapture(session.task);
            if (!current()) return;
            if (!linking?.openURL(webURL(job2.browserUrl).url)) throw new Error("The browser could not open. Retry or enter the final file link.");
          }
          job2.captureState = "capturing";
          change();
          const result = await session.task.done;
          if (!current()) return;
          job2.captureState = "validating";
          change();
          if (otherSourceLink(result.url, source2)) {
            if (rejected.length >= 6) throw new Error("Captured link belongs to another source. Reopen the page and retry.");
            console.log("[browser-capture] passed over", linkForLog(result.url), "- another source's link, scanning on");
            rejected.push(result.url);
            continue;
          }
          console.log("[browser-capture] link captured:", linkForLog(result.url), "- validating one-byte range");
          let found;
          try {
            found = await validateCapturedLink(http, result.url, { anchor, sizeBytes: catalogBytes }, session.cancel.signal);
            // An AkiraBox set's parts are captured one by one, and the part before is still in the
            // browser's memory, on the same host and named for the same game: the file has to be this part.
            if (akiraPart) requirePart(akiraPart, found.filename);
          } catch (error2) {
            if (!current() || rejected.length >= 6) throw error2;
            console.log("[browser-capture] refused", linkForLog(result.url), "and scanning on:", error2.message);
            rejected.push(result.url);
            continue;
          }
          if (found.unbound) {
            const accepted = await confirmCapturedFile(job2, session, found);
            if (!current()) return;
            console.log("[browser-capture] gamer", accepted ? "accepted" : "refused", linkForLog(result.url));
            if (!accepted) {
              if (rejected.length >= 6) throw new Error("None of the captured files was this game's. Reopen the page and retry.");
              rejected.push(result.url);
              continue;
            }
          }
          validated = found;
        }
        if (!current()) return;
        handingOff = true;
        handOff(job2, source2, validated);
      } catch (error2) {
        if (!current() && !(handingOff && jobs().includes(job2) && job2.state === "queued" && active()?.job !== job2)) return;
        captureFailed(job2, source2, session, error2);
      }
    }
    return { stopCapture, captureVikingfile, captureBrowserLink };
  }

export { LINK_CAPTURE_SECONDS, createCaptureFlow };
