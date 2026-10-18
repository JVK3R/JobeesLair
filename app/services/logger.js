// The app's own debug log, for finding out what happened on a real console. On the PS5 console.log goes to
// the console's kernel log through a background writer, with no file to read afterwards; this keeps a file
// of its own in the app's data folder (on the console /data/ps5-react/PPSA99058/logs/jobeeslair.log, beside the
// download queue, where FTP reaches it; elsewhere <data>/JobeesLair/logs), and tees everything the app already writes with console.log / warn / error
// into it, so the 100-odd existing log lines (the download queue, browser capture, link health, the
// updater) are captured without touching each one. New events use log(category, message).
//
// What it keeps, and what it never does:
//   - a line is "[HH:MM:SS.mmm] LEVEL category message", written in batches (every FLUSH_MS, or when
//     BATCH_BYTES have piled up, or at once for an error), so logging never waits on the disk in a frame
//   - the file is capped: past MAX_BYTES it moves to jobeeslair.1.log (one older file kept), so the two
//     never hold more than twice that
//   - the same line repeated is written once with a count
//   - nothing secret is written: URL query strings, bearer tokens, API keys named in a line, e-mail
//     addresses, and any value registered with addSecret (the TorBox key) are replaced before a line is
//     kept; a write that fails drops the batch and says so once, it never throws into the app

import { DeviceInfo, FileSystem, Platform } from '@ps5-react/core';
import { DATA_DIR } from '../state/data-dir.js';
import { TITLE_ID } from '../version.js';

  var MAX_BYTES = 512 * 1024;
  var FLUSH_MS = 1500;
  var BATCH_BYTES = 8 * 1024;
  var MAX_LINE = 700;
  var pad = (value, size = 2) => String(value).padStart(size, "0");
  var UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
  // What a line must not carry. Order matters: a URL's query goes before anything inside it is looked at.
  function redact(text, secrets = []) {
    let out = String(text);
    for (const secret of secrets) if (secret && secret.length >= 8) out = out.split(secret).join("…key…");
    return out.replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>#]*/gi, "$1?…").replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 …").replace(/\b(token|api[_-]?key|apikey|key|password|passwd|secret|signature|sig|auth)(["']?\s*[:=]\s*["']?)[^\s"',;&]{4,}/gi, "$1$2…").replace(UUID, "…uuid…").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "…@…");
  }
  var text = (value) => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack ? `${value.message} (${String(value.stack).split("\n")[1]?.trim() ?? ""})` : value.message;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  /**
   * A logger writing to `<dir>/jobeeslair.log`. `fs` is the runtime's FileSystem (exists, mkdir, appendFile,
   * stat, rename, remove); `now` the clock; `timer`/`clear` setTimeout and clearTimeout (tests pass their own).
   */
  function createLogger({ fs, dir, now = Date.now, offsetMinutes = () => 0, timer = setTimeout, clear = clearTimeout, maxBytes = MAX_BYTES, sink = null }) {
    const file = `${dir}/jobeeslair.log`;
    const older = `${dir}/jobeeslair.1.log`;
    const secrets = /* @__PURE__ */ new Set();
    let batch = [];
    let batchBytes = 0;
    let size = null;
    let pending = null;
    let last = null;
    let repeats = 0;
    let broken = false;
    // HH:MM:SS.mmm local time, from the epoch milliseconds. No Date objects: the console's JS engine has only
    // Date.now() (state/clock.js), and building one throws.
    const stamp = () => {
      const inDay = ((now() + offsetMinutes() * 6e4) % 864e5 + 864e5) % 864e5;
      return `${pad(Math.floor(inDay / 36e5))}:${pad(Math.floor(inDay % 36e5 / 6e4))}:${pad(Math.floor(inDay % 6e4 / 1e3))}.${pad(inDay % 1e3, 3)}`;
    };
    function write(lines) {
      if (broken || !lines.length) return;
      try {
        fs.mkdir(dir, { recursive: true });
        if (size === null) size = fs.exists(file) ? fs.stat(file)?.size || 0 : 0;
        if (size >= maxBytes) {
          if (fs.exists(older)) fs.remove(older);
          fs.rename(file, older);
          size = 0;
        }
        const chunk = lines.join("");
        fs.appendFile(file, chunk);
        size += chunk.length;
      } catch (error) {
        // Not retried: a drive that refuses writes would otherwise be asked again for every line.
        broken = true;
        sink?.(`[logger] stopped, the log file could not be written: ${error.message}`);
      }
    }
    function flush() {
      if (pending !== null) {
        clear(pending);
        pending = null;
      }
      closeRepeat();
      const lines = batch;
      batch = [];
      batchBytes = 0;
      write(lines);
    }
    function closeRepeat() {
      if (repeats > 0) {
        const line = `[${stamp()}] ...      the line above, ${repeats} more time${repeats === 1 ? "" : "s"}\n`;
        batch.push(line);
        batchBytes += line.length;
      }
      repeats = 0;
      last = null;
    }
    function add(level, category, message) {
      if (broken) return;
      const body = redact(message, [...secrets]).slice(0, MAX_LINE).replace(/\r?\n/g, " ↵ ");
      const key = `${level}|${category}|${body}`;
      if (key === last) {
        repeats++;
        return;
      }
      closeRepeat();
      last = key;
      const line = `[${stamp()}] ${level.padEnd(5)} ${category} ${body}\n`;
      batch.push(line);
      batchBytes += line.length;
      if (level === "ERROR" || batchBytes >= BATCH_BYTES) flush();
      else if (pending === null) pending = timer(flush, FLUSH_MS);
    }
    const api = {
      file,
      /** Writes one event: `category` names the part of the app ("capture", "torbox", "speed", "queue", "ftp"). */
      log: (category, message, level = "INFO") => add(level, category, text(message)),
      warn: (category, message) => add("WARN", category, text(message)),
      error: (category, message) => add("ERROR", category, text(message)),
      /** A value never to be written, whatever line it turns up in (the TorBox key). */
      addSecret(value) {
        if (typeof value === "string" && value.length >= 8) secrets.add(value);
      },
      removeSecret: (value) => secrets.delete(value),
      flush,
      redact: (value) => redact(value, [...secrets]),
      /** The last `bytes` of the log, for showing or copying; "" when there is none. */
      tail(bytes = 16 * 1024) {
        flush();
        try {
          const all = fs.exists(file) ? fs.readFile(file) : "";
          return all.length > bytes ? all.slice(all.length - bytes) : all;
        } catch {
          return "";
        }
      },
      /** Whether the log file stopped being written (a drive that refused it). */
      get stopped() {
        return broken;
      }
    };
    return api;
  }
  var instance = null;
  // Minutes east of UTC at this moment, from the console's own time zone (DeviceInfo, as state/downloads.js).
  var offset = () => {
    try {
      return Number(DeviceInfo.utcOffset(Date.now())) || 0;
    } catch {
      return 0;
    }
  };
  /** The app's logger (created on first use, in the app's data folder). */
  var logger = () => instance ?? (instance = createLogger({ fs: FileSystem, dir: Platform.OS === "ps5" ? `/data/ps5-react/${TITLE_ID}/logs` : `${DATA_DIR}/logs`, offsetMinutes: offset, sink: (message) => console.warn?.(message) }));
  var installed = false;
  /**
   * Starts logging: a header line (what build, what console), then console.log / warn / error are copied into
   * the file as well as going where they went before. Once only; `facts` is what the header says.
   */
  function installLogger(facts = {}) {
    if (installed) return logger();
    installed = true;
    const out = logger();
    out.log("app", `log opened ${Object.entries(facts).map(([name, value]) => `${name}=${value}`).join(" ")}`);
    for (const [method, level] of [["log", "INFO"], ["warn", "WARN"], ["error", "ERROR"]]) {
      const original = console[method]?.bind(console);
      if (!original) continue;
      console[method] = (...args) => {
        original(...args);
        try {
          const line = args.map(text).join(" ");
          // "[browser-capture] link captured" -> category "browser-capture"; anything else is "app".
          const match = /^\[([a-z][a-z0-9-]{1,24})\]\s*(.*)$/is.exec(line);
          out.log(match ? match[1].toLowerCase() : "app", match ? match[2] : line, level);
        } catch {
        }
      };
    }
    return out;
  }
  var log = (category, message, level) => logger().log(category, message, level);

export { createLogger, installLogger, log, logger, redact };
