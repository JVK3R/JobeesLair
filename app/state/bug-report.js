// "Report a bug" (0.5.1): one press in Settings sends this console's logs to the Jobee'sLair Discord:
// Jobee'sLair's own log (the logger has already blanked keys, tokens, e-mail addresses and link queries out of
// every line) and the tail of ShadowMount's, with the app's version and the firmware.
//
// They go to the relay (tools/report-relay, a Cloudflare Worker), which holds the Discord webhook as its secret
// and writes the channel message itself; no build carries the webhook, and the relay is what a stranger with
// the image can reach. The relay's address comes from data/private/report.json ({ "reportUrl": "https://…" }),
// never committed (.gitignore): a build without it has no button, and a Discord webhook there is refused, so the
// secret cannot ship by mistake. One report per REPORT_GAP_MS, so a stuck button cannot flood the channel.

import { FileSystem, Http } from '@ps5-react/core';
import { logger, log } from '../services/logger.js';
import { shadowRequest } from './shadowmount.js';
import { deviceFacts } from './device.js';
import { VERSION_LABEL } from '../version.js';

  var DISCORD = /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\//i;
  var RELAY = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~\/-]*)?$/;
  var REPORT_GAP_MS = 10 * 6e4;
  var APP_LOG_BYTES = 512 * 1024, SHADOW_LOG_BYTES = 128 * 1024;
  var lastSent = 0;
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
  // A multipart/form-data body: each field as text, each log as a text file.
  function multipart(boundary, fields, files) {
    const parts = Object.entries(fields).map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    files.forEach(({ name, text }, index) => {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="files[${index}]"; filename="${name}"\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n`);
    });
    return `${parts.join("")}--${boundary}--\r\n`;
  }
  /**
   * Sends the report. `queue`: the download queue (ShadowMount's log is asked for with its quietNetwork, the
   * download in progress paused for that moment). Resolves when the relay has passed it on; throws with a
   * sentence otherwise.
   */
  async function sendReport({ queue, http = Http, relay = reportRelay(), appLog = () => logger().tail(APP_LOG_BYTES), now = Date.now() } = {}) {
    if (!relay) throw new Error("Bug reports aren't set up in this build. Post in the Jobee'sLair Discord instead.");
    const wait = reportWait(now);
    if (wait) throw new Error(`A report was sent a moment ago. You can send another in ${Math.ceil(wait / 6e4)} min.`);
    let shadow = null;
    try {
      const ask = () => shadowRequest(http, "debug-log", { max_bytes: SHADOW_LOG_BYTES });
      shadow = String((await (queue?.quietNetwork ? queue.quietNetwork("bug report: ShadowMount's log", ask) : ask()))?.content ?? "");
    } catch (error) {
      log("report", `ShadowMount's log not read: ${error.message}`);
    }
    const firmware = deviceFacts().firmware || "?";
    const files = [{ name: "jobeeslair.log", text: appLog() || "(empty)" }, ...shadow ? [{ name: "shadowmount.log", text: shadow }] : []];
    const boundary = `----JobeesLairReport${now.toString(16)}`;
    const response = await http.request(relay, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: multipart(boundary, { version: VERSION_LABEL, firmware }, files),
      maxBytes: 64 * 1024
    });
    if (!response.ok) {
      log("report", `relay answered HTTP ${response.status}`);
      throw new Error(response.status === 429 ? "Too many reports for now. Try again in a minute." : `The report didn't go through (HTTP ${response.status}). Post in the Jobee'sLair Discord instead.`);
    }
    lastSent = now;
    log("report", `sent: ${files.map((file) => `${file.name} ${file.text.length} chars`).join(", ")}`);
  }

export { REPORT_GAP_MS, multipart, reportRelay, reportWait, sendReport };
