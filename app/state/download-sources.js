// ../pub-game-store/native/state/download-sources.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: archiveRefusal, so an Archive.org 401/403 is a dead link, not a browser check.
// MODIFIED (from Overdrive 1.0.6, MyLuxy): Vikingfile's own file links are direct and its pages give theirs;
// FileKeeper's file is had without the browser, by waiting its countdown and posting its form.
// MODIFIED: a source marked `debrid` (state/debrid.js) is of kind "debrid": the resolver hands it to the
// debrid provider given to it, which answers with that service's direct link.
// MODIFIED (0.5.1): a magnet link is of kind "torrent": it downloads only through a debrid service (which
// fetches the torrent, then hands out a direct link), so unmarked it says to add one. A debrid answer may
// name the bytes' own size (expectedBytes; null when unknown) and say they are a repack of the listing
// (a torrent's files as one zip), so the listed size and checksum are not held against them.


  function webURL(value) {
    if (typeof value !== "string" || value.length > 8192 || /[\s\\\x00-\x1f]/.test(value)) throw new Error("Invalid HTTP URL.");
    const match = /^(https?):\/\/([a-z0-9.-]+)(:\d{1,5})?([/?#].*)?$/i.exec(value);
    if (!match || !match[2] || match[2].startsWith(".")) throw new Error("Invalid HTTP URL.");
    return { url: value, host: match[2].toLowerCase(), origin: `${match[1].toLowerCase()}://${match[2]}${match[3] || ""}`, path: match[4] || "/" };
  }
  // A magnet link with a BitTorrent info hash (40 hex or 32 base32 characters), as a feed may list one.
  var isMagnetLink = (value) => typeof value === "string" && value.length <= 8192 && !/[\s\x00-\x1f]/.test(value) && /^magnet:\?(?:[^&]*&)*xt=urn:btih:(?:[0-9a-f]{40}|[a-z2-7]{32})(?:&|$)/i.test(value);
  var hosts2 = {
    mediafire: ["mediafire.com"],
    buzzheavier: ["buzzheavier.com"],
    vikingfile: ["vikingfile.com", "vik1ngfile.site"],
    datanodes: ["datanodes.to"],
    filekeeper: ["filekeeper.net"],
    rootz: ["rootz.so"]
  };
  // The hosts this resolver reaches the file of without the browser, whatever the catalog says.
  var RESOLVED_KINDS = /* @__PURE__ */ new Set(["filekeeper", "rootz"]);
  var isHost = (host2, domain) => host2 === domain || host2.endsWith(`.${domain}`);
  // Archive.org answers 401 for a restricted item and 403 for one taken down. Neither is a
  // check a browser can pass: a login there gives the app no access, it only stays in the
  // console's browser. The status, when it is that refusal, else null.
  function archiveRefusal(release, message) {
    try {
      if (!isHost(webURL(release.browserUrl || release.url).host, "archive.org")) return null;
    } catch {
      return null;
    }
    return /\bHTTP (401|403)\b/.exec(message)?.[1] ?? null;
  }
  function sourceKind(release) {
    if (release.debrid) return "debrid";
    if (release.manifestUrl) return "manifest";
    const value = release.browserUrl || release.url;
    if (!value) return "unavailable";
    if (isMagnetLink(value)) return "torrent";
    const { host: host2, path } = webURL(value);
    const provider = Object.keys(hosts2).find((name) => hosts2[name].some((domain) => isHost(host2, domain)));
    if (provider === "mediafire" && host2.startsWith("download")) return "direct";
    if (provider === "vikingfile" && /^\/d\//.test(path) && !release.browserUrl) return "direct";
    if (provider) return provider;
    if (host2 === "archive.org" && path.startsWith("/download/") || host2 === "github.com" && path.includes("/releases/download/") || /\.(?:ffpfsc|ffpfs|ffpkg|exfat|pkg|zip|rar|7z)(?:[?#]|$)/i.test(path)) return "direct";
    if (release.requiresBrowser || release.source?.startsWith("pegasus")) return "browser";
    return "direct";
  }
  var decode = (value) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  function absolute(value, base) {
    value = decode(value);
    if (value.startsWith("//")) value = `${webURL(base).origin.split(":")[0]}:${value}`;
    else if (value.startsWith("/")) value = webURL(base).origin + value;
    else if (!/^https?:/i.test(value)) value = base.split(/[?#]/)[0].replace(/[^/]*$/, "") + value;
    webURL(value);
    if (base.startsWith("https:") && !value.startsWith("https:")) throw new Error("Provider attempted an insecure redirect.");
    return value;
  }
  function attribute(tag, key) {
    return new RegExp(`(?:^|\\s)${key}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
  }
  function anchor(html, id) {
    const tag = (html.match(/<a\b[^>]*>/gi) || []).find((value) => attribute(value, "id") === id);
    return tag && attribute(tag, "href");
  }
  var BrowserRequired = class extends Error {
    constructor(url, message = "Browser verification required. Open the source, then enter its final file URL.") {
      super(message);
      this.name = "BrowserRequired";
      this.url = webURL(url).url;
    }
  };
  var htmlResponse = (response) => /(?:text\/html|application\/xhtml)/i.test(response.headers?.["content-type"] || "");
  // A wait the queue's cancel ends early: FileKeeper's countdown.
  var pause = (ms, signal) => new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  var FILEKEEPER_COUNTDOWN_MS = 5e3;
  // `debrid`: { resolve(source, { signal }) -> { url } } for sources marked `debrid` (state/debrid.js).
  function createSourceResolver({ http, debrid = null }) {
    async function request(url, options = {}) {
      webURL(url);
      const response = await http.request(url, { maxBytes: 1024 * 1024, ...options });
      if (response.status === 404 || response.status === 410) throw new Error(`Source unavailable: HTTP ${response.status}. Choose another source.`);
      if ([401, 403, 429].includes(response.status)) throw new BrowserRequired(url);
      if (!response.ok && !(response.status >= 300 && response.status < 400)) throw new Error(`Provider HTTP ${response.status}.`);
      return response;
    }
    async function direct(url, signal, headers) {
      webURL(url);
      const response = await request(url, { method: "HEAD", signal, headers });
      if (htmlResponse(response)) throw new BrowserRequired(url);
      if (response.status >= 300) throw new BrowserRequired(url, "The final file redirects with custom headers. Choose another source.");
      return { url: webURL(response.url || url).url, headers, rejectHtml: true };
    }
    // FileKeeper's page has no human check: a five-second countdown, then its Free Download button
    // posts op=download2 with the file's code, and the answer redirects to the file on Datanodes'
    // dlproxy.uk gateway. The page keeps the file in a cookie the engine never hands to the app, so the
    // same form goes to the file's own address, /<code>, which needs none, once the countdown is out.
    async function fileKeeper(url, signal) {
      const code = /^\/([a-z0-9]{12})(?:[/?]|$)/i.exec(webURL(url).path)?.[1];
      if (!code) throw new BrowserRequired(url);
      console.log("[sources] filekeeper", code, "- waiting its countdown, then posting its form");
      await pause(FILEKEEPER_COUNTDOWN_MS, signal);
      if (signal?.aborted) throw new Error("Cancelled.");
      const next = await request(url, {
        signal,
        method: "POST",
        followRedirects: false,
        headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: url },
        body: `op=download2&id=${code}&rand=&referer=&method_free=&down_direct=1`
      });
      const location2 = next.headers?.location;
      console.log("[sources] filekeeper answered HTTP", next.status, location2 ? `with ${webURL(absolute(location2, url)).host}` : "without a file");
      if (!location2) throw new Error("Source unavailable: FileKeeper gave no file. Choose another source.");
      // The catalog's FileKeeper sizes are rounded (1 GiB for a 1.6 GB file), and the engine holds a
      // download to its expected size exactly: the file's own length, from the same HEAD, replaces it.
      const file = absolute(location2, url);
      const head = await request(file, { method: "HEAD", signal });
      if (htmlResponse(head) || head.status >= 300) throw new BrowserRequired(url);
      const bytes = Number(head.headers?.["content-length"]);
      return { url: webURL(head.url || file).url, rejectHtml: true, ...Number.isSafeInteger(bytes) && bytes > 0 ? { expectedBytes: bytes } : {} };
    }
    // 0.5.1: Rootz's page (/d/<id>) is a script that sends the browser to /api/files/proxy-download/<id>,
    // which redirects to the file on its CDN (cdn-files.alcyone.so) with no check of any kind. The console
    // browser seldom got that far, so the address is asked for here. A missing file answers 404; a
    // DDoS-Guard challenge (403) falls back to the browser.
    async function rootz(url, signal) {
      const id = /^\/d\/([A-Za-z0-9_-]{4,32})(?:[/?#]|$)/.exec(webURL(url).path)?.[1];
      if (!id) throw new BrowserRequired(url);
      const next = await request(`https://www.rootz.so/api/files/proxy-download/${id}`, { signal, followRedirects: false, headers: { Referer: url } });
      const location2 = next.headers?.location;
      console.log("[sources] rootz", id, "answered HTTP", next.status, location2 ? `with ${webURL(absolute(location2, url)).host}` : "without a file");
      if (!location2) throw new BrowserRequired(url);
      const file = absolute(location2, url);
      const head = await request(file, { method: "HEAD", signal });
      if (htmlResponse(head) || head.status >= 300) throw new BrowserRequired(url);
      const bytes = Number(head.headers?.["content-length"]);
      return { url: webURL(head.url || file).url, rejectHtml: true, ...Number.isSafeInteger(bytes) && bytes > 0 ? { expectedBytes: bytes } : {} };
    }
    async function resolve2(release, { signal, directURL } = {}) {
      if (directURL) return direct(directURL, signal);
      const url = release.browserUrl || release.url;
      const kind = sourceKind(release);
      if (kind === "unavailable") throw new Error("Source unavailable: no download URL.");
      if (kind === "torrent") throw new Error("This source is a torrent. Add a TorBox or AllDebrid API key in Settings to download it, or choose another source.");
      if (kind === "direct") return { url: webURL(url).url, rejectHtml: true };
      if (kind === "manifest") throw new Error("Split manifests must be resolved by the queue.");
      if (kind === "debrid") {
        if (!debrid) throw new Error("No debrid service is set up. Add a TorBox or AllDebrid API key in Settings, or choose another source.");
        const { url: link, expectedBytes, repacked } = await debrid.resolve(release, { signal });
        return { url: webURL(link).url, rejectHtml: true, ...expectedBytes === null || Number.isSafeInteger(expectedBytes) && expectedBytes > 0 ? { expectedBytes } : {}, ...repacked ? { repacked: true } : {} };
      }
      if (kind === "browser" || kind === "datanodes") throw new BrowserRequired(url);
      if (kind === "filekeeper") return fileKeeper(url, signal);
      if (kind === "rootz") return rootz(url, signal);
      const response = await request(url, { signal });
      const base = response.url || url;
      if (response.headers?.["content-disposition"]?.includes("attachment")) return direct(base, signal);
      const html = await response.text();
      let candidate;
      if (kind === "mediafire") candidate = anchor(html, "downloadButton");
      if (kind === "vikingfile") candidate = anchor(html, "download-link");
      if (kind === "buzzheavier") {
        const button = (html.match(/<[a-z]+\b[^>]*>/gi) || []).find((tag) => attribute(tag, "hx-get")?.includes("/download"));
        const route = button && attribute(button, "hx-get");
        if (route) {
          const next = await request(absolute(route, base), {
            signal,
            followRedirects: false,
            headers: { "HX-Request": "true", "HX-Current-URL": base }
          });
          candidate = next.headers?.["hx-redirect"] || next.headers?.location;
        }
      }
      if (!candidate) throw new BrowserRequired(url);
      return direct(absolute(candidate, base), signal);
    }
    return { resolve: resolve2 };
  }
  function cancellation() {
    const listeners4 = /* @__PURE__ */ new Set();
    const signal = { aborted: false, addEventListener: (_, fn) => listeners4.add(fn), removeEventListener: (_, fn) => listeners4.delete(fn) };
    return { signal, cancel() {
      signal.aborted = true;
      for (const fn of listeners4) fn();
      listeners4.clear();
    } };
  }

export { archiveRefusal, BrowserRequired, RESOLVED_KINDS, cancellation, createSourceResolver, isMagnetLink, sourceKind, webURL };
