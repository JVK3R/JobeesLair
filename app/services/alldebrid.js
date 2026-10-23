// AllDebrid (0.5.1), the second debrid provider beside TorBox (services/torbox.js). Its API (docs.alldebrid.com,
// v4) unlocks a file host's link into a direct one at once: POST /v4/link/unlock with the link; a link it needs
// time for answers `delayed`, an id to ask /v4/link/delayed about every five seconds until it is ready. The key
// goes in an Authorization: Bearer header only, never in a URL or a log line.
//
// Magnets (0.5.1): POST /v4/magnet/upload adds the torrent to the account; /v4/magnet/status says how far it
// is (statusCode 4: ready, with a link per file) and the file's link unlocks like any other. AllDebrid hands
// out no zip of a torrent, so one of many files is refused unless one of them is nearly all of it.
//
// Answers are { status: "success", data } or { status: "error", error: { code, message } }.

import { isoDate } from '../state/clock.js';

  var BASE = "https://api.alldebrid.com";
  var POLL_MS = 5e3;
  var WAIT_MS = 3 * 6e4;
  // A key as AllDebrid hands them out: letters and digits, about 20 of them.
  var validKey = (key) => /^[A-Za-z0-9]{12,64}$/.test(String(key || ""));
  var MESSAGES = {
    AUTH_BAD_APIKEY: "AllDebrid refused the API key. Check it in Settings.",
    AUTH_MISSING_APIKEY: "AllDebrid needs an API key. Add it in Settings.",
    AUTH_BLOCKED: "AllDebrid blocked this connection (geo-blocked or a VPN). Check your AllDebrid account.",
    AUTH_USER_BANNED: "This AllDebrid account is banned.",
    MUST_BE_PREMIUM: "AllDebrid unlocks links only for premium accounts.",
    LINK_HOST_NOT_SUPPORTED: "AllDebrid doesn't support this file host. Choose another source.",
    LINK_DOWN: "The file is gone from its host. Choose another source.",
    LINK_PASS_PROTECTED: "This link has a password AllDebrid wasn't given. Choose another source.",
    LINK_HOST_UNAVAILABLE: "AllDebrid can't reach this host right now. Try again later, or choose another source.",
    LINK_TOO_MANY_DOWNLOADS: "AllDebrid's limit for this host is reached for now. Try again later, or choose another source.",
    LINK_HOST_FULL: "AllDebrid's servers for this host are full right now. Try again in a while.",
    LINK_HOST_LIMIT_REACHED: "You've reached AllDebrid's daily limit for this host. Try again tomorrow, or choose another source.",
    DELAYED_INVALID_ID: "AllDebrid lost track of this file. Try again.",
    MAGNET_INVALID_URI: "AllDebrid couldn't read this magnet link. Choose another source.",
    MAGNET_MUST_BE_PREMIUM: "AllDebrid fetches torrents only for premium accounts.",
    MAGNET_NO_SERVER: "AllDebrid has no server free for torrents right now. Try again later.",
    MAGNET_TOO_MANY_ACTIVE: "Your AllDebrid account has too many torrents going. Try again later.",
    MAGNET_PROCESSING: "AllDebrid is still fetching this torrent. Resume the download in a while.",
    MAGNET_INVALID_ID: "AllDebrid lost track of this torrent. Try again."
  };
  // The share of a torrent one file must be to download it alone, AllDebrid giving no zip of the rest.
  var ALONE_ABOVE = 0.9;
  var AllDebridError = class extends Error {
    constructor(code, message) {
      super(message);
      this.name = "AllDebridError";
      this.code = code;
    }
  };
  var scrub = (text, key) => key ? String(text).split(key).join("••••") : String(text);
  var wait = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("Cancelled."), { name: "AbortError" }));
    });
  });
  /** `http`: the runtime's Http (or a stand-in); `key()`: the API key now; `log(message)`: one line, no secrets. */
  function createAllDebrid({ http, key, log = () => {}, now = () => Date.now() }) {
    async function call(path, { form, signal } = {}) {
      const secret = key();
      if (!secret) throw new AllDebridError("AUTH_MISSING_APIKEY", MESSAGES.AUTH_MISSING_APIKEY);
      const headers = { Authorization: `Bearer ${secret}` };
      let body;
      if (form) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = Object.entries(form).map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("&");
      }
      const started = now();
      let response;
      try {
        response = await http.request(`${BASE}${path}`, { method: form ? "POST" : "GET", headers, body, signal, maxBytes: 4 * 1024 * 1024 });
      } catch (error) {
        if (error?.name === "AbortError" || signal?.aborted) throw error;
        throw new AllDebridError("NETWORK", `AllDebrid didn't answer: ${scrub(error?.message || error, secret)}`);
      }
      log(`${form ? "POST" : "GET"} ${path} -> HTTP ${response.status} in ${now() - started} ms`);
      const reply = await response.json().catch(() => null);
      if (reply?.status === "success") return reply.data ?? {};
      const code = reply?.error?.code || `HTTP_${response.status}`;
      throw new AllDebridError(code, MESSAGES[code] ?? `AllDebrid: ${scrub(reply?.error?.message || `HTTP ${response.status}`, secret)}`);
    }
    const api = {
      /** { premium, expiresAt (ISO or null), username }. */
      async me({ signal } = {}) {
        const user = (await call("/v4/user", { signal })).user ?? {};
        const until = Number(user.premiumUntil) || 0;
        return { premium: user.isPremium === true, expiresAt: until ? isoDate(until * 1e3) : null, username: typeof user.username === "string" ? user.username : "" };
      },
      /** The hosts this account can use: [{ name, domains, regexps, working }]. */
      async hosters({ signal } = {}) {
        const hosts = (await call("/v4.1/user/hosts", { signal })).hosts ?? {};
        return Object.values(hosts).filter((host) => host && Array.isArray(host.domains)).map((host) => ({
          name: String(host.name || ""),
          domains: host.domains.map(String),
          regexps: Array.isArray(host.regexps) ? host.regexps.map(String) : host.regexp ? [String(host.regexp)] : [],
          working: host.status !== false
        }));
      },
      /** `link` unlocked: { url, name, size }; waits out a delayed one, up to `maxWaitMs`. */
      async resolve(link, { password, signal, maxWaitMs = WAIT_MS, pollMs = POLL_MS } = {}) {
        const data = await call("/v4/link/unlock", { form: password ? { link, password } : { link }, signal });
        let url = typeof data.link === "string" && data.link ? data.link : null;
        if (!url && data.delayed) {
          const started = now();
          for (;;) {
            if (now() - started >= maxWaitMs) throw new AllDebridError("PENDING", "AllDebrid is still preparing this file. Resume the download in a while.");
            await wait(pollMs, signal);
            const state = await call("/v4/link/delayed", { form: { id: String(data.delayed) }, signal });
            if (Number(state.status) === 2 && state.link) {
              url = state.link;
              break;
            }
            if (Number(state.status) === 3) throw new AllDebridError("DELAYED_FAILED", "AllDebrid couldn't prepare this file. Choose another source.");
          }
        }
        if (!url) throw new AllDebridError("NO_LINK", "AllDebrid didn't give a download link. Choose another source.");
        return { url, name: typeof data.filename === "string" ? data.filename : null, size: Number(data.filesize) || null };
      },
      /**
       * `magnet` as a direct link: the torrent added to the account, waited for while AllDebrid fetches it (up to
       * `maxWaitMs`), then its file (`filename`'s, a lone one, or one that is nearly all of it) unlocked.
       * -> { url, name, size }. Past the wait it throws PENDING; asking again later finds the same torrent.
       */
      async resolveMagnet(magnet, { filename, signal, maxWaitMs = WAIT_MS, pollMs = POLL_MS } = {}) {
        const upload = await call("/v4/magnet/upload", { form: { "magnets[]": magnet }, signal });
        const added = Array.isArray(upload.magnets) ? upload.magnets[0] : null;
        if (!added) throw new AllDebridError("NO_MAGNET", "AllDebrid didn't take this magnet link. Choose another source.");
        if (added.error) throw new AllDebridError(added.error.code || "MAGNET_ERROR", MESSAGES[added.error.code] ?? `AllDebrid: ${scrub(added.error.message || added.error.code, key())}`);
        const started = now();
        let state;
        for (;;) {
          const status = await call("/v4/magnet/status", { form: { id: String(added.id) }, signal });
          state = Array.isArray(status.magnets) ? status.magnets[0] : status.magnets;
          const code = Number(state?.statusCode);
          if (code === 4) break;
          if (code >= 5) throw new AllDebridError("MAGNET_FAILED", `AllDebrid couldn't fetch this torrent${state?.status ? ` (${state.status})` : ""}. Choose another source.`);
          if (now() - started >= maxWaitMs) throw new AllDebridError("PENDING", `AllDebrid is still fetching this torrent${state?.status ? ` (${state.status})` : ""}. Resume the download in a while.`);
          await wait(pollMs, signal);
        }
        const links = (Array.isArray(state.links) ? state.links : []).filter((item) => item && typeof item.link === "string" && item.link);
        if (!links.length) throw new AllDebridError("NO_FILE", "AllDebrid fetched the torrent but found no file in it. Choose another source.");
        const stem = (name) => String(name || "").toLowerCase().replace(/^.*\//, "");
        const total = links.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
        const largest = links.reduce((best, item) => (Number(item.size) || 0) > (Number(best.size) || 0) ? item : best);
        const pick = (filename && links.find((item) => stem(item.filename) === stem(filename))) ?? (links.length === 1 ? links[0] : total > 0 && (Number(largest.size) || 0) >= total * ALONE_ABOVE ? largest : null);
        if (!pick) throw new AllDebridError("MANY_FILES", "This torrent holds several files, and AllDebrid can't pack them into one download. TorBox can, or choose another source.");
        const unlocked = await api.resolve(pick.link, { signal, maxWaitMs, pollMs });
        return { url: unlocked.url, name: typeof pick.filename === "string" ? pick.filename : unlocked.name, size: Number(pick.size) || unlocked.size };
      }
    };
    return api;
  }
  // Each host's pattern compiled once (null when one does not compile).
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
  /** Whether AllDebrid takes `url` (true/false), or null while its host list is not known. */
  function hostSupported(hosters, url) {
    if (!hosters) return null;
    const host = /^https?:\/\/([^/?#:]+)/i.exec(url || "")?.[1]?.toLowerCase();
    if (!host) return false;
    return hosters.some((hoster) => hoster.working && (hoster.domains.some((domain) => host === domain.toLowerCase() || host.endsWith(`.${domain.toLowerCase()}`)) || hoster.regexps.some((source) => patternOf(source)?.test(url) === true)));
  }

export { AllDebridError, MESSAGES, createAllDebrid, hostSupported, validKey };
