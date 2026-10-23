// TorBox (torbox.app), a debrid service: it fetches a file from a file host or a torrent onto its own
// servers, then hands out a fast direct link to it. This module is its API and nothing else; the app's
// wiring (the saved key, when to ask, the download queue) is state/debrid.js.
//
// Endpoints (https://api.torbox.app/v1/api, docs: api-docs.torbox.app):
//   GET  /user/me                    the account: plan (0 Free, 1 Essential, 2 Pro, 3 Standard) and expiry
//   GET  /webdl/hosters              the file hosts it supports, each with a regex and whether it works now
//   GET  /webdl/checkcached?hash=    which links it already holds (instant); a link's hash is its MD5
//   GET  /torrents/checkcached?hash= which torrents it already holds; a torrent's hash is its info hash
//   POST /webdl/createwebdownload    link=… (form)             -> { webdownload_id, hash }
//   POST /torrents/createtorrent     magnet=… (multipart form) -> { torrent_id, hash }
//   GET  /webdl/mylist?id=, /torrents/mylist?id=   an item's state: progress, download_finished, files
//   GET  /webdl/requestdl, /torrents/requestdl     a direct link to one of its files, open for 3 hours
//                                                  (zip_link=true: a torrent's files as one zip)
// Every call answers { success, error, detail, data }. The key goes in an Authorization header, except
// on requestdl, which only takes it as a `token` query parameter: those URLs are built here, used once and
// never returned, logged or saved, and no error message carries the key.
//
// The runtime's Http (ps5-react docs/NETWORKING.md): string bodies only, 30 s per request, custom headers
// turn off automatic redirects (none of these endpoints redirect). No Date objects anywhere: the console's JS
// engine has only Date.now() (state/clock.js parseStamp reads TorBox's ISO times).

import { parseStamp } from '../state/clock.js';

  var BASE = "https://api.torbox.app/v1/api";
  var PLANS = ["free", "essential", "pro", "standard"];
  var HOSTERS_MS = 6 * 36e5;
  // How long a resolve waits for TorBox to finish fetching a file it did not hold, asking every POLL_MS.
  // A held (cached) file is ready at once; one it has to fetch can take longer than anyone should wait on a
  // console, so past this the resolve stops and says how far TorBox got (resuming asks again).
  var WAIT_MS = 3 * 6e4;
  var POLL_MS = 5e3;
  // TorBox's error codes the gamer can act on, in the words the app shows (everything else: its `detail`).
  var MESSAGES = {
    NO_AUTH: "TorBox needs an API key. Add it in Settings.",
    BAD_TOKEN: "TorBox didn't accept the API key. Check it in Settings.",
    AUTH_ERROR: "TorBox couldn't check the API key. Try again in a moment.",
    UNSUPPORTED_SITE: "TorBox doesn't support this host.",
    INVALID_LINK: "TorBox couldn't read this link.",
    DOWNLOAD_TOO_LARGE: "This file is larger than your TorBox plan allows.",
    ACTIVE_LIMIT: "Your TorBox plan has no free download slot right now.",
    MONTHLY_LIMIT: "Your TorBox plan's monthly limit is used up.",
    COOLDOWN_LIMIT: "Your TorBox plan is in a cooldown. Try again later.",
    TEMPORARILY_DISABLED: "TorBox has this host turned off for now.",
    RATE_LIMITED: "TorBox asked to slow down. Try again in a minute."
  };
  // An error from TorBox: `code` is its error code (or HTTP_<status>, NETWORK, PENDING, NO_FILE).
  var TorBoxError = class extends Error {
    constructor(code, message, extra = {}) {
      super(message);
      this.name = "TorBoxError";
      this.code = code;
      Object.assign(this, extra);
    }
  };
  // The key's shape (TorBox hands out UUIDs); anything else is a typing slip, caught before it is sent.
  var validKey = (key) => typeof key === "string" && /^[A-Za-z0-9-]{20,64}$/.test(key);
  var isMagnet = (link) => /^magnet:\?/i.test(link || "");
  // A magnet link's info hash (40 hex, or 32 base32 turned to hex), lower case; null when it has none.
  function magnetHash(magnet) {
    const value = /[?&]xt=urn:btih:([a-z0-9]+)/i.exec(magnet || "")?.[1];
    if (!value) return null;
    if (/^[0-9a-f]{40}$/i.test(value)) return value.toLowerCase();
    if (!/^[a-z2-7]{32}$/i.test(value)) return null;
    let bits = "";
    for (const char of value.toUpperCase()) bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char).toString(2).padStart(5, "0");
    return bits.match(/.{4}/g).map((nibble) => parseInt(nibble, 2).toString(16)).join("");
  }

  // MD5 of a UTF-8 string, lower-case hex (RFC 1321): a web download's hash on TorBox.
  var SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  var SINES = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  function utf8(text) {
    const bytes = [];
    for (const char of String(text)) {
      const code = char.codePointAt(0);
      if (code < 128) bytes.push(code);
      else if (code < 2048) bytes.push(192 | code >> 6, 128 | code & 63);
      else if (code < 65536) bytes.push(224 | code >> 12, 128 | code >> 6 & 63, 128 | code & 63);
      else bytes.push(240 | code >> 18, 128 | code >> 12 & 63, 128 | code >> 6 & 63, 128 | code & 63);
    }
    return bytes;
  }
  function md5(text) {
    const bytes = utf8(text);
    const bitLength = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 0; i < 8; i++) bytes.push(i < 4 ? bitLength >>> 8 * i & 255 : Math.floor(bitLength / 2 ** (8 * i)) & 255);
    let [a0, b0, c0, d0] = [1732584193, 4023233417, 2562383102, 271733878];
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = Array.from({ length: 16 }, (_, i) => bytes[offset + i * 4] | bytes[offset + i * 4 + 1] << 8 | bytes[offset + i * 4 + 2] << 16 | bytes[offset + i * 4 + 3] << 24);
      let [a, b, c, d] = [a0, b0, c0, d0];
      for (let i = 0; i < 64; i++) {
        const round = i >> 4;
        const f = round === 0 ? b & c | ~b & d : round === 1 ? d & b | ~d & c : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
        const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : 7 * i % 16;
        const sum = a + f + SINES[i] + words[g] | 0;
        const shift = SHIFTS[round * 4 + i % 4];
        [a, d, c] = [d, c, b];
        b = b + (sum << shift | sum >>> 32 - shift) | 0;
      }
      [a0, b0, c0, d0] = [a0 + a | 0, b0 + b | 0, c0 + c | 0, d0 + d | 0];
    }
    return [a0, b0, c0, d0].map((word) => Array.from({ length: 4 }, (_, i) => (word >>> 8 * i & 255).toString(16).padStart(2, "0")).join("")).join("");
  }
  // The hashes TorBox may know a link by: the link as it is, and without its query (its own normalization).
  var linkHashes = (link) => [...new Set([md5(link), md5(link.split(/[?#]/)[0])])];
  var query = (params) => Object.entries(params).filter(([, value]) => value !== void 0 && value !== null).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");
  var sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error("Stopped."), { name: "AbortError" }));
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", stop);
    };
    const stop = () => {
      done();
      reject(Object.assign(new Error("Stopped."), { name: "AbortError" }));
    };
    const timer = setTimeout(() => {
      done();
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", stop);
  });
  // The file of an item to download: the one named like the release's file, else the largest.
  function pickFile(files, wanted) {
    const list = (files || []).filter((file) => file && file.id !== void 0);
    if (!list.length) return null;
    const stem = (name) => String(name || "").toLowerCase().replace(/^.*\//, "");
    return list.find((file) => wanted && [file.name, file.short_name].map(stem).includes(stem(wanted))) ?? list.reduce((best, file) => (file.size || 0) > (best.size || 0) ? file : best);
  }
  // Which of a torrent's files to download (0.5.1): the one named like the release's file; a lone file; the
  // largest when the rest is small change beside it (a game image with its text files); otherwise all of
  // them as one zip (a folder dump of many files: the queue extracts it like any archive).
  var ZIP_BELOW = 0.9;
  function chooseFiles(files, wanted) {
    const list = (files || []).filter((file) => file && file.id !== void 0);
    if (!list.length) return null;
    const stem = (name) => String(name || "").toLowerCase().replace(/^.*\//, "");
    const named = wanted ? list.find((file) => [file.name, file.short_name].map(stem).includes(stem(wanted))) : null;
    if (named) return { file: named };
    if (list.length === 1) return { file: list[0] };
    const total = list.reduce((sum, file) => sum + (file.size || 0), 0);
    const largest = list.reduce((best, file) => (file.size || 0) > (best.size || 0) ? file : best);
    return total > 0 && (largest.size || 0) >= total * ZIP_BELOW ? { file: largest } : { zip: true };
  }
  var finished = (item) => Boolean(item?.download_finished && item.download_present !== false);
  var failed = (item) => /error|fail|stalled|dead/i.test(item?.download_state || "") && !finished(item);

  /**
   * TorBox's API for one account. `key()` reads the API key (empty: not set up); `http` is the runtime's
   * Http (request(url, options) -> { status, ok, json() }); `wait(ms, signal)` pauses between polls.
   */
  function createTorBox({ http, key, wait = sleep, now = Date.now, log = () => {} }) {
    let hosterList = null;
    const secret = () => {
      const value = String(key() || "").trim();
      if (!value) throw new TorBoxError("NO_AUTH", MESSAGES.NO_AUTH);
      if (!validKey(value)) throw new TorBoxError("BAD_TOKEN", MESSAGES.BAD_TOKEN);
      return value;
    };
    // Whatever a failure says, never the key (a transport error can quote the URL it was asked for).
    const scrub = (message, value) => value ? String(message).split(value).join("…") : String(message);
    async function call(path, { method = "GET", params, form, multipart, signal, token = false, auth = true } = {}) {
      const value = auth || token ? secret() : null;
      const url = `${BASE}${path}${params || token ? `?${query({ ...token ? { token: value } : {}, ...params })}` : ""}`;
      const headers = {};
      if (auth && !token) headers.Authorization = `Bearer ${value}`;
      let body;
      if (form) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = query(form);
      } else if (multipart) {
        const boundary = `----JobeesLair${now().toString(16)}`;
        headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
        body = Object.entries(multipart).filter(([, field]) => field !== void 0 && field !== null).map(([name, field]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${field}\r\n`).join("") + `--${boundary}--\r\n`;
      }
      let response;
      const started = now();
      try {
        response = await http.request(url, { method, headers, body, signal, maxBytes: 4 * 1024 * 1024 });
      } catch (error) {
        if (error?.name === "AbortError" || signal?.aborted) throw error;
        log(`${method} ${path} failed after ${now() - started} ms: ${scrub(error?.message || error, value)}`);
        throw new TorBoxError("NETWORK", `TorBox didn't answer: ${scrub(error?.message || error, value)}`);
      }
      log(`${method} ${path} -> HTTP ${response.status} in ${now() - started} ms`);
      if (response.status === 429) throw new TorBoxError("RATE_LIMITED", MESSAGES.RATE_LIMITED);
      let answer = null;
      try {
        answer = await response.json();
      } catch {
      }
      if (!answer || typeof answer !== "object") throw new TorBoxError(`HTTP_${response.status}`, `TorBox answered HTTP ${response.status}.`);
      if (!answer.success) {
        const code = answer.error || `HTTP_${response.status}`;
        log(`${method} ${path} refused: ${code}`);
        throw new TorBoxError(code, MESSAGES[code] || scrub(answer.detail || `TorBox: ${code}.`, value), { data: answer.data ?? null });
      }
      return answer.data;
    }
    const api = {
      /** The account, without anything personal: { plan, planName, premium, expiresAt, cooldownUntil }. */
      async me({ signal } = {}) {
        const data = await call("/user/me", { signal });
        const plan = Number(data?.plan) || 0;
        const expiresAt = data?.premium_expires_at || null;
        return {
          plan,
          planName: PLANS[plan] ?? "unknown",
          premium: plan > 0 && (!expiresAt || (parseStamp(expiresAt) ?? Infinity) > now()),
          expiresAt,
          cooldownUntil: data?.cooldown_until || null
        };
      },
      /** The hosts TorBox can fetch from: [{ name, domains, working, regex }], kept for six hours. */
      async hosters({ signal, fresh = false } = {}) {
        if (!fresh && hosterList && now() - hosterList.at < HOSTERS_MS) return hosterList.list;
        const data = await call("/webdl/hosters", { signal });
        const list = (Array.isArray(data) ? data : []).map((host) => ({ name: host.name, domains: host.domains || [], working: host.status !== false, regex: host.regex || null }));
        hosterList = { at: now(), list };
        return list;
      },
      /** Which of `hashes` (torrent info hashes) TorBox holds: a Set of them, lower case. */
      async checkCached(hashes, { signal } = {}) {
        const wanted = [...new Set(hashes.map((hash) => String(hash).toLowerCase()))].filter(Boolean);
        const held = /* @__PURE__ */ new Set();
        for (let i = 0; i < wanted.length; i += 100) {
          const data = await call("/torrents/checkcached", { params: { hash: wanted.slice(i, i + 100).join(","), format: "object" }, signal });
          for (const hash of Object.keys(data || {})) held.add(hash.toLowerCase());
        }
        return held;
      },
      /** Which of `links` (file host URLs, or magnets) TorBox holds already: a Set of those links. */
      async checkCachedLinks(links, { signal } = {}) {
        const magnets = links.filter(isMagnet);
        const web = links.filter((link) => !isMagnet(link));
        const held = /* @__PURE__ */ new Set();
        const byHash = new Map(web.flatMap((link) => linkHashes(link).map((hash) => [hash, link])));
        const hashes = [...byHash.keys()];
        for (let i = 0; i < hashes.length; i += 100) {
          const data = await call("/webdl/checkcached", { params: { hash: hashes.slice(i, i + 100).join(","), format: "object" }, signal });
          for (const hash of Object.keys(data || {})) if (byHash.has(hash.toLowerCase())) held.add(byHash.get(hash.toLowerCase()));
        }
        if (magnets.length) {
          const torrents = await api.checkCached(magnets.map(magnetHash).filter(Boolean), { signal });
          for (const magnet of magnets) if (torrents.has(magnetHash(magnet))) held.add(magnet);
        }
        return held;
      },
      /** Adds `link` (a file host URL or a magnet) to the account: { kind: "webdl" | "torrent", id, hash }. */
      async createDownload(link, { password, signal } = {}) {
        if (isMagnet(link)) {
          const data = await call("/torrents/createtorrent", { method: "POST", multipart: { magnet: link }, signal });
          return { kind: "torrent", id: data?.torrent_id, hash: data?.hash ?? magnetHash(link) };
        }
        const data = await call("/webdl/createwebdownload", { method: "POST", form: { link, password }, signal });
        return { kind: "webdl", id: data?.webdownload_id, hash: data?.hash ?? md5(link) };
      },
      /** One item of the account (mylist?id=), or null when it is not there (any more). */
      async item(kind, id, { signal } = {}) {
        try {
          const data = await call(kind === "torrent" ? "/torrents/mylist" : "/webdl/mylist", { params: { id, bypass_cache: true }, signal });
          return (Array.isArray(data) ? data.find((entry) => String(entry.id) === String(id)) : data) ?? null;
        } catch (error) {
          if (["ITEM_NOT_FOUND", "HTTP_404"].includes(error.code)) return null;
          throw error;
        }
      },
      /**
       * A direct link to file `fileId` of item `id` (or, `zip`, to all of a torrent's files as one zip), open
       * for three hours; the key stays out of it.
       */
      async getUnrestrictedLink(kind, id, fileId, { signal, zip = false } = {}) {
        const params = kind === "torrent" ? zip ? { torrent_id: id, zip_link: true } : { torrent_id: id, file_id: fileId, zip_link: false } : { web_id: id, file_id: fileId, zip_link: false };
        const data = await call(kind === "torrent" ? "/torrents/requestdl" : "/webdl/requestdl", { params, signal, token: true, auth: false });
        if (typeof data !== "string" || !/^https:\/\//i.test(data)) throw new TorBoxError("NO_LINK", "TorBox gave no download link. Try again in a moment.");
        return data;
      },
      /**
       * `link` as a direct link: added to the account if `known` (a { kind, id } from before) is not there,
       * waited for while TorBox fetches it (up to `maxWaitMs`, telling `onProgress(fraction)`), then its file
       * (`filename`'s, else the largest) asked for. -> { url, kind, id, fileId, name, size }. A torrent of many
       * files (chooseFiles) comes as one zip: { url, kind, id, fileId: null, name: null, size: null, repacked: true }.
       * Past the wait it throws PENDING with `progress`; asking again later picks up the same item.
       */
      async resolve(link, { known, filename, password, signal, onProgress, onItem, maxWaitMs = WAIT_MS, pollMs = POLL_MS } = {}) {
        let entry = known?.id !== void 0 && known?.id !== null ? { kind: known.kind || (isMagnet(link) ? "torrent" : "webdl"), id: known.id } : null;
        let item = entry ? await api.item(entry.kind, entry.id, { signal }) : null;
        if (!item) {
          entry = await api.createDownload(link, { password, signal });
          if (entry.id === void 0 || entry.id === null) throw new TorBoxError("NO_ITEM", "TorBox didn't say where it put the file. Try again in a moment.");
          onItem?.(entry);
          item = await api.item(entry.kind, entry.id, { signal });
        }
        const started = now();
        while (!finished(item)) {
          if (failed(item)) throw new TorBoxError("FAILED", `TorBox couldn't fetch the file${item.download_state ? ` (${item.download_state})` : ""}. Choose another source.`);
          const progress = Math.max(0, Math.min(1, Number(item?.progress) || 0));
          onProgress?.(progress);
          if (now() - started >= maxWaitMs) throw new TorBoxError("PENDING", `TorBox is still fetching this file (${Math.floor(progress * 100)}%). Resume the download in a while.`, { progress, item: entry });
          await wait(pollMs, signal);
          item = await api.item(entry.kind, entry.id, { signal });
        }
        const choice = entry.kind === "torrent" ? chooseFiles(item.files, filename) : { file: pickFile(item.files, filename) };
        if (!choice || !choice.file && !choice.zip) throw new TorBoxError("NO_FILE", "TorBox fetched the link but found no file in it. Choose another source.");
        if (choice.zip) {
          const url2 = await api.getUnrestrictedLink(entry.kind, entry.id, null, { signal, zip: true });
          return { url: url2, kind: entry.kind, id: entry.id, fileId: null, name: null, size: null, repacked: true };
        }
        const file = choice.file;
        const url = await api.getUnrestrictedLink(entry.kind, entry.id, file.id, { signal });
        return { url, kind: entry.kind, id: entry.id, fileId: file.id, name: file.name || null, size: file.size || null };
      }
    };
    return api;
  }
  // Each hoster's pattern compiled once (null when TorBox sent one that does not compile), not on every check.
  var patterns = /* @__PURE__ */ new Map();
  function patternOf(source) {
    if (!patterns.has(source)) {
      try {
        patterns.set(source, new RegExp(source, "i"));
      } catch {
        patterns.set(source, null);
      }
    }
    return patterns.get(source);
  }
  // Whether TorBox lists `url`'s host and has it working: true, false, or null when its list is not known.
  function hostSupported(hosters, url) {
    if (!hosters) return null;
    if (isMagnet(url)) return true;
    const host = /^https?:\/\/([^/?#:]+)/i.exec(url || "")?.[1]?.toLowerCase();
    if (!host) return false;
    return hosters.some((hoster) => {
      if (!hoster.working) return false;
      if (hoster.domains.some((domain) => host === domain.toLowerCase() || host.endsWith(`.${domain.toLowerCase()}`))) return true;
      return Boolean(hoster.regex) && patternOf(hoster.regex)?.test(url) === true;
    });
  }

export { MESSAGES, PLANS, TorBoxError, chooseFiles, createTorBox, hostSupported, isMagnet, linkHashes, magnetHash, md5, pickFile, validKey };
