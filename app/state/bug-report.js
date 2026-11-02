// "Report a bug" (0.5.1): one press in Settings sends this console's logs to the Jobee'sLair Discord:
// Jobee'sLair's own log (the logger has already blanked keys, tokens, e-mail addresses and link queries out of
// every line) and the tail of ShadowMount's, with the app's version and the firmware.
//
// They go to the relay (tools/report-relay, a Cloudflare Worker), which holds the Discord webhook as its secret
// and writes the channel message itself; no build carries the webhook, and the relay is what a stranger with
// the image can reach. The relay's address comes from data/private/report.json ({ "reportUrl": "https://…" }),
// never committed (.gitignore): a build without it has no button, and a Discord webhook there is refused, so the
// secret cannot ship by mistake. One report per REPORT_GAP_MS, so a stuck button cannot flood the channel.
//
// 0.5.5: the engine's own log goes too (app.log: where a freeze or a crash shows; the relay takes an engine's log
// as host.log), blanked like the app's. Once the player says yes (asked at the first failure, changed in
// Settings), the logs also go by themselves when a download, an unpack or an install fails, and after a crash
// (startAutoReports). Each report names the console by a code made on it (reportCode, shown in Settings), so a
// player's reports can be told apart in the channel and matched to their post.

import { FileSystem, Http } from '@ps5-react/core';
import { logger, log } from '../services/logger.js';
import { shadowRequest } from './shadowmount.js';
import { deviceFacts } from './device.js';
import { loadList, saveList } from './saved.js';
import { VERSION_LABEL } from '../version.js';

  var DISCORD = /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\//i;
  var RELAY = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~\/-]*)?$/;
  var REPORT_GAP_MS = 10 * 6e4, AUTO_GAP_MS = 5 * 6e4;
  // Together under the relay's 1 MiB: Jobee'sLair's log, ShadowMount's, the engine's, and after a crash the
  // engine's log of the run that crashed (app.prev.log, which the engine keeps from the launch before).
  var APP_LOG_BYTES = 448 * 1024, SHADOW_LOG_BYTES = 128 * 1024;
  var ENGINE_LOG = { name: "host.log", file: "app.log", bytes: 192 * 1024 };
  var PREVIOUS = { name: "host.prev.log", file: "app.prev.log", bytes: 160 * 1024 };
  // What the engine writes when the app faults (native/ps5 crash handler).
  var CRASH = /\[PS5-REACT\] fatal signal/;
  var SETTINGS = "settings.json";
  var lastSent = 0, lastAuto = 0;
  var engineLog = (file) => `${FileSystem.dataDir}/${file}`;
  /** The relay this build reports to, or null when it has none (or names Discord itself). */
  function reportRelay(read = (path) => FileSystem.readFile(path)) {
    try {
      const url = String(JSON.parse(read("/app0/data/private/report.json"))?.reportUrl ?? "").trim();
      return RELAY.test(url) && !DISCORD.test(url) ? url.replace(/\/+$/, "") : null;
    } catch {
      return null;
    }
  }
  /** Milliseconds until another report may go (0: now). */
  var reportWait = (now = Date.now()) => Math.max(0, lastSent + REPORT_GAP_MS - now);
  // Six letters and digits, made once on this console and kept in settings.json (no 0/O or 1/I to misread).
  var code = null;
  function reportCode() {
    if (code) return code;
    try {
      code = String(loadList(SETTINGS, "settings").reportCode ?? "");
      if (/^[A-Z2-9]{6}$/.test(code)) return code;
    } catch {
    }
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    code = Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
    try {
      saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), reportCode: code });
    } catch {
    }
    return code;
  }
  // A multipart/form-data body: each field as text, each log as a text file.
  function multipart(boundary, fields, files) {
    const parts = Object.entries(fields).map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    files.forEach(({ name, text }, index) => {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="files[${index}]"; filename="${name}"\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n`);
    });
    return `${parts.join("")}--${boundary}--\r\n`;
  }
  // The last `bytes` of a file, or "" when it can't be read.
  function readTail(read, path, bytes) {
    try {
      const all = String(read(path) ?? "");
      return all.length > bytes ? all.slice(all.length - bytes) : all;
    } catch {
      return "";
    }
  }
  /**
   * Sends the report. `queue`: the download queue (ShadowMount's log is asked for with its quietNetwork, the
   * download in progress paused for that moment). `reason`: why it went by itself (startAutoReports), `previous`:
   * with the engine's log of the run that crashed. Resolves when the relay has passed it on; throws with a sentence
   * otherwise.
   */
  async function sendReport({ queue, http = Http, relay = reportRelay(), appLog = () => logger().tail(APP_LOG_BYTES), now = Date.now(), reason = "", previous = false, auto = false, read = (path) => FileSystem.readFile(path), redact = (text) => logger().redact(text), console: consoleCode = reportCode() } = {}) {
    if (!relay) throw new Error("Bug reports aren't set up in this build. Post in the Jobee'sLair Discord instead.");
    const wait = auto ? 0 : reportWait(now);
    if (wait) throw new Error(`A report was sent a moment ago. You can send another in ${Math.ceil(wait / 6e4)} min.`);
    let shadow = null;
    try {
      const ask = () => shadowRequest(http, "debug-log", { max_bytes: SHADOW_LOG_BYTES });
      shadow = String((await (queue?.quietNetwork ? queue.quietNetwork("bug report: ShadowMount's log", ask) : ask()))?.content ?? "");
    } catch (error) {
      log("report", `ShadowMount's log not read: ${error.message}`);
    }
    const engine = ({ name, file, bytes }) => {
      const text = readTail(read, engineLog(file), bytes);
      return text ? [{ name, text: redact(text) }] : [];
    };
    const firmware = deviceFacts().firmware || "?";
    const files = [
      { name: "jobeeslair.log", text: appLog() || "(empty)" },
      ...shadow ? [{ name: "shadowmount.log", text: shadow }] : [],
      ...[ENGINE_LOG, ...previous ? [PREVIOUS] : []].flatMap(engine)
    ];
    const fields = { version: VERSION_LABEL, firmware, console: consoleCode, ...reason ? { reason: redact(reason).slice(0, 200) } : {} };
    const boundary = `----JobeesLairReport${now.toString(16)}`;
    const response = await http.request(relay, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: multipart(boundary, fields, files),
      maxBytes: 64 * 1024
    });
    if (!response.ok) {
      log("report", `relay answered HTTP ${response.status}`);
      throw new Error(response.status === 429 ? "Too many reports for now. Try again in a minute." : `The report didn't go through (HTTP ${response.status}). Post in the Jobee'sLair Discord instead.`);
    }
    if (!auto) lastSent = now;
    log("report", `sent${reason ? ` by itself (${reason})` : ""}: ${files.map((file) => `${file.name} ${file.text.length} chars`).join(", ")}`);
  }

  // Whether the logs go by themselves when something fails: null until the player answers (they are asked at the
  // first failure: askingAutoReports), then their answer; Settings changes it.
  var choice;
  var listeners = /* @__PURE__ */ new Set();
  function autoReportsChoice() {
    if (choice === void 0) {
      try {
        const saved = loadList(SETTINGS, "settings").autoReports;
        choice = typeof saved === "boolean" ? saved : null;
      } catch {
        choice = null;
      }
    }
    return choice;
  }
  var autoReports = () => autoReportsChoice() === true;
  var asking = false;
  var notify = () => {
    for (const listener of listeners) listener();
  };
  function setAutoReports(on) {
    choice = Boolean(on);
    asking = false;
    try {
      saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), autoReports: choice });
    } catch {
    }
    notify();
  }
  /** Whether the question (Send the logs by themselves?) is up: the first failure asks it, the answer closes it. */
  var askingAutoReports = () => asking;
  function askAutoReports() {
    if (asking || autoReportsChoice() !== null) return;
    asking = true;
    notify();
  }
  function subscribeAutoReports(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * Sends the logs by itself when a task fails: a download or an unpack ("failed"), or an install (back to
   * "installer-required" with an error), each failure once; and, `delay` after the app opens, when the run before
   * ended in a crash (app.prev.log has the crash's lines). Until the player has answered, the first failure asks
   * (askAutoReports) and what failed waits for the answer: yes sends it, no drops it. At most one report each
   * AUTO_GAP_MS: what fails in between goes in the next. Failures already there when the app opens were reported (or
   * not) then; one about to be tried again by itself (download-queue.js retryLater) waits for that try. Returns the
   * stop.
   */
  // A debrid service still fetching the file (TorBox's or AllDebrid's PENDING) is a download to resume later, not a
  // failure to report.
  var STILL_FETCHING = /is still fetching this/;
  function startAutoReports(queue, { send = sendReport, choose = autoReportsChoice, ask = askAutoReports, subscribe = subscribeAutoReports, relay = reportRelay, read = (path) => FileSystem.readFile(path), delay = 20e3, now = () => Date.now(), timer = setTimeout, cancel = clearTimeout } = {}) {
    if (!relay()) return () => {
    };
    const seen = /* @__PURE__ */ new Set();
    let first = true, waiting = [], waitTimer = null, previous = false, stopped = false;
    const flush = () => {
      waitTimer = null;
      if (stopped || !waiting.length || choose() !== true) return;
      const reason = waiting.join(" | "), withPrevious = previous;
      waiting = [];
      previous = false;
      lastAuto = now();
      send({ queue, reason, previous: withPrevious, auto: true, now: lastAuto }).catch((error) => log("report", `not sent by itself: ${error.message}`));
    };
    const schedule = () => {
      if (waitTimer !== null || !waiting.length) return;
      waitTimer = timer(flush, Math.max(0, lastAuto + AUTO_GAP_MS - now()));
    };
    const report = (reason, crashed = false) => {
      const said = choose();
      if (said === false) return;
      waiting.push(reason);
      previous ||= crashed;
      if (said === null) ask();
      else schedule();
    };
    // The player's answer: yes sends what waited, no drops it.
    const offChoice = subscribe(() => {
      const said = choose();
      if (said === true) schedule();
      else if (said === false) {
        waiting = [];
        previous = false;
      }
    });
    const off = queue.subscribe((jobs) => {
      for (const job of jobs) {
        if (!job.error || job.retryAt || (job.state !== "failed" && job.state !== "installer-required") || STILL_FETCHING.test(job.error)) continue;
        const key = `${job.id}|${job.state}|${job.error}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!first) report(`${job.state === "failed" ? "Download failed" : "Install failed"}: ${job.title}: ${job.error}`);
      }
      first = false;
    });
    const crashCheck = timer(() => {
      if (CRASH.test(readTail(read, engineLog(PREVIOUS.file), 8 * 1024 * 1024))) report("Jobee'sLair closed unexpectedly last time (a crash)", true);
    }, delay);
    return () => {
      stopped = true;
      off();
      offChoice();
      cancel(crashCheck);
      if (waitTimer !== null) cancel(waitTimer);
    };
  }

export { AUTO_GAP_MS, REPORT_GAP_MS, askAutoReports, askingAutoReports, autoReports, autoReportsChoice, multipart, reportCode, reportRelay, reportWait, sendReport, setAutoReports, startAutoReports, subscribeAutoReports };
