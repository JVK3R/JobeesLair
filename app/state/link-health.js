// Link health: whether a game's download links still answer, checked without downloading them, and what
// that means for its source list (overlay). The wiring (the network, the saved file, when checks run) is
// state/links.js.
//
// The runtime runs one network task at a time (ps5-react docs/NETWORKING.md): a request queued behind a
// download waits for the whole file, and one queued ahead of it holds the download up. So checks never
// compete with one: a background check borrows the network only while the download queue is idle
// (`lend`, the queue's lendNetwork) and gives it back the moment a download is queued; a check the gamer
// asks for pauses the download in progress meanwhile (`quiet`, the queue's quietNetwork) and is bounded
// in time. Requests are HEAD (the transport owns Range), one at a time, spaced per host.
//
// A link is
//   active       it answered: 2xx, or redirects that end in one
//   dead         looks gone (labelled and ranked last, never hidden): 404 or 410, Archive.org's 401/403 (an item restricted or taken down; see
//                download-sources.js archiveRefusal), MediaFire's error page. Only when a second request a
//                moment later says the same, so a blip on a CDN node does not bury a good link
//   unreachable  no answer after three tries with growing pauses (timeouts, refused connections, 5xx)
//   unknown      an answer that says nothing about the file (a browser check's 401/403, a host that
//                refuses HEAD): never flagged
// A host that rate-limits (429) is left alone for a while, longer each time, and its links keep what they
// were: being told to slow down says nothing about a link either.

import { sourceKind, webURL } from './download-sources.js';

  var MINUTE = 6e4;
  var HOUR = 60 * MINUTE;
  // How long a verdict stands before a background check asks again.
  var TTL = { active: 12 * HOUR, unreachable: 30 * MINUTE, dead: 72 * HOUR, unknown: 24 * HOUR };
  var TRIES = 3;
  // The pause before the second try, doubled before the third, each within ±25 %.
  var BACKOFF_MS = 2e3;
  var CONFIRM_MS = 1500;
  var REQUEST_MS = 1e4;
  var HOST_GAP_MS = 750;
  var COOL_MS = 5 * MINUTE;
  var COOL_MAX_MS = 2 * HOUR;
  var RETRY_AFTER_MAX_MS = MINUTE;
  // A background run checks at most this many links (a 20-part set and a few mirrors); one the gamer asks
  // for, more, within MANUAL_MS.
  var BACKGROUND_LINKS = 24;
  var MANUAL_LINKS = 64;
  var MANUAL_MS = 6e4;
  // When the queue would not lend the network, ask it again after this long.
  var BUSY_RETRY_MS = MINUTE;
  var KEPT = 800;
  var SAVE_MS = 2e3;
  var CHECKED_KINDS = /* @__PURE__ */ new Set(["direct", "manifest", "mediafire", "buzzheavier"]);
  var isHost = (host, domain) => host === domain || host.endsWith(`.${domain}`);

  // The links of a release a HEAD can answer for: its file, manifest or host page, or each part's first
  // source in a set. Hosts that need the console's browser are left out: no request of ours passes their check.
  // Remembered per release object (the release cache hands out the same ones): the source list asks on
  // every change of what is known, and working them out runs each URL through webURL and sourceKind.
  var linkMemo = /* @__PURE__ */ new WeakMap();
  function linksOf(release) {
    if (!release || typeof release !== "object") return [];
    let links = linkMemo.get(release);
    if (!links) linkMemo.set(release, links = findLinks(release));
    return links;
  }
  function findLinks(release) {
    if (release.unavailableReason) return [];
    // A set's links carry their part number, so a broken one can be named ("part 3 is gone").
    const sources = release.parts ? release.parts.filter((part) => part.sources?.[0]).map((part) => [part.sources[0], part.number]) : [[release, null]];
    const links = [];
    for (const [source, part] of sources) {
      try {
        const kind = sourceKind(source);
        if (!CHECKED_KINDS.has(kind)) continue;
        const { url, host } = webURL(kind === "manifest" ? source.manifestUrl : source.browserUrl || source.url);
        links.push(part ? { url, host, kind, part } : { url, host, kind });
      } catch {
      }
    }
    return links;
  }
  function retryAfter(response) {
    const seconds = Number(response.headers?.["retry-after"]);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1e3, RETRY_AFTER_MAX_MS) : null;
  }
  // What one answer says about a link: active, dead, unknown, `transient` (ask again) or `limited` (429).
  function classify(link, response) {
    const status = response.status;
    if (link.kind === "mediafire" && /\/error\.php\b/i.test(response.url || "")) return { verdict: "dead", code: "removed" };
    if (status === 404 || status === 410) return { verdict: "dead", code: status };
    if ((status === 401 || status === 403) && isHost(link.host, "archive.org")) return { verdict: "dead", code: status };
    if (status === 429) return { verdict: "limited", code: status, wait: retryAfter(response) };
    if (status === 408 || status === 425 || status >= 500) return { verdict: "transient", code: status, wait: retryAfter(response) };
    // A file link that answers with a web page is a landing or "not found" page more often than the file:
    // the download would refuse it (rejectHtml), but it proves nothing either way.
    if (link.kind === "direct" && /(?:text\/html|application\/xhtml)/i.test(response.headers?.["content-type"] || "")) return { verdict: "unknown", code: status };
    if (status >= 200 && status < 400) return { verdict: "active", code: status };
    return { verdict: "unknown", code: status };
  }
  // 0.5.0 Pre Release 4: the size a file link's answer gives (Content-Length), so a source the catalog lists
  // without one shows it before the download. Only a direct file link's, never a web page's, and only past
  // 1 MB (a smaller answer is an error page or a stub, not a game).
  var MIN_SIZE = 1024 * 1024;
  function sizeOf(link, response) {
    if (link.kind !== "direct" || /(?:text\/html|application\/xhtml)/i.test(response.headers?.["content-type"] || "")) return null;
    const bytes = Number(response.headers?.["content-length"]);
    return Number.isSafeInteger(bytes) && bytes >= MIN_SIZE ? bytes : null;
  }
  // A release's standing from its links: dead when any is, unreachable when any is, active when all are.
  function judge(links, recordOf) {
    if (!links.length) return null;
    let unreachable = null;
    let all = true;
    for (const link of links) {
      const record = recordOf(link.url);
      const part = link.part ? { part: link.part } : {};
      if (record?.s === "dead") return { status: "dead", code: record.c, host: link.host, at: record.at, ...part };
      if (record?.s === "unreachable") unreachable ?? (unreachable = { status: "unreachable", code: record.c, host: link.host, at: record.at, ...part });
      else if (record?.s !== "active") all = false;
    }
    return unreachable ?? (all ? { status: "active", at: Math.min(...links.map((link) => recordOf(link.url).at)) } : null);
  }
  // A release as the source list should treat it: a dead or unreachable one ranked after the links that
  // answer, an active one before those not checked. A dead one stays in the list and can still be picked:
  // the check is a HEAD from the console, and a link it calls gone may still download (as in 0.1.0, which
  // had no check), so only a download that fails takes it out of the running.
  var HEALTH = { active: "ok", unreachable: "flaky", dead: "dead" };
  var withVerdict = (release, verdict) => ({ ...release, health: HEALTH[verdict.status], linkHealth: verdict });
  // A single-file release with no size of its own takes the size its link answered with (a set's parts are
  // checked by their first part only, so a set's whole size is never known this way).
  function withSize(release, recordOf) {
    if (release.sizeBytes || release.parts) return release;
    const links = linksOf(release);
    const bytes = links.length === 1 ? recordOf(links[0].url)?.b : null;
    return bytes ? { ...release, sizeBytes: bytes, sizeFromCheck: true } : release;
  }
  var stopped = () => Object.assign(new Error("Link check stopped."), { stopped: true });
  function createLinkHealth({
    http,
    store,
    // (onYield) => release | null: the download queue's lendNetwork.
    lend = () => () => {
    },
    // (reason, work) => work's promise: the download queue's quietNetwork.
    quiet = (reason, work) => work(),
    now = Date.now,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    // Calls `fn` after `ms` unless the returned function is called first: a request's deadline.
    timeout = (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
    random = Math.random,
    log = (line) => console.log(`[links] ${line}`)
  }) {
    let records = null;
    let version = 0;
    let saving = false;
    const listeners = /* @__PURE__ */ new Set();
    const hosts = /* @__PURE__ */ new Map();
    const lastAsked = /* @__PURE__ */ new Map();
    // Checks waiting to run, by key (a game id): { key, releases, manual, resolve, retryAt }. One runs at a time.
    const pending = /* @__PURE__ */ new Map();
    const progress = /* @__PURE__ */ new Map();
    let running = null;
    let retrying = false;
    const memo = /* @__PURE__ */ new WeakMap();
    function load() {
      if (records) return records;
      const saved = store.get();
      records = saved?.version === 1 && saved.links && typeof saved.links === "object" ? { ...saved.links } : {};
      return records;
    }
    const recordOf = (url) => load()[url];
    function emit() {
      for (const listener of [...listeners]) {
        try {
          listener(version);
        } catch (error) {
          log(`listener failed: ${error.message}`);
        }
      }
    }
    function save() {
      saving = false;
      const urls = Object.keys(records);
      if (urls.length > KEPT) for (const url of urls.sort((a, b) => records[a].at - records[b].at).slice(0, urls.length - KEPT)) delete records[url];
      store.set({ version: 1, links: records });
    }
    function saveSoon() {
      if (saving) return;
      saving = true;
      wait(SAVE_MS).then(save, save);
    }
    function remember(url, status, code, bytes = null) {
      const before = load()[url];
      records[url] = { s: status, c: code ?? null, at: now(), ...bytes && { b: bytes } };
      saveSoon();
      if (before?.s !== status || before?.c !== (code ?? null) || (before?.b ?? null) !== bytes) {
        version++;
        emit();
      }
    }
    const stale = (url) => {
      const record = recordOf(url);
      return !record || now() - record.at >= (TTL[record.s] ?? 0);
    };
    const cooling = (host) => (hosts.get(host)?.until ?? 0) > now();
    function cool(host, retryMs) {
      const n = (hosts.get(host)?.n ?? 0) + 1;
      const ms = Math.max(retryMs ?? 0, Math.min(COOL_MS * 2 ** (n - 1), COOL_MAX_MS));
      hosts.set(host, { n, until: now() + ms });
      log(`${host} asked us to slow down: no checks there for ${Math.round(ms / 1e3)} s`);
    }
    // A pause that a stopped run cuts short.
    async function pause(run, ms) {
      if (ms > 0) await Promise.race([wait(ms), run.stopping]);
      if (run.stop) throw stopped();
    }
    async function probe(link, run) {
      const gap = (lastAsked.get(link.host) ?? -Infinity) + HOST_GAP_MS - now();
      await pause(run, gap);
      lastAsked.set(link.host, now());
      const aborts = /* @__PURE__ */ new Set();
      const signal = { aborted: false, addEventListener: (type, fn) => type === "abort" && aborts.add(fn), removeEventListener: (type, fn) => aborts.delete(fn) };
      let timedOut = false;
      const abort = () => {
        signal.aborted = true;
        for (const fn of [...aborts]) fn();
      };
      run.abort = abort;
      const cancel = timeout(() => {
        timedOut = true;
        abort();
      }, REQUEST_MS);
      try {
        const response = await http.request(link.url, { method: "HEAD", maxBytes: 4096, signal });
        const answer = classify(link, response);
        const bytes = answer.verdict === "active" ? sizeOf(link, response) : null;
        return bytes ? { ...answer, bytes } : answer;
      } catch (error) {
        if (run.stop) throw stopped();
        return { verdict: "transient", code: timedOut ? "timeout" : "network", detail: error.message };
      } finally {
        cancel();
        run.abort = null;
      }
    }
    // A link's verdict: { status, code }, or null when its host rate-limited us (nothing learned). A "gone"
    // answer is asked again a moment later and the second answer decides; a transient one is tried again
    // after a growing pause (or the server's Retry-After), and three of those make the link unreachable.
    async function verify(link, run) {
      let last = null;
      for (let attempt = 0; attempt < TRIES; attempt++) {
        if (attempt) await pause(run, last.wait ?? BACKOFF_MS * 2 ** (attempt - 1) * (0.75 + random() * 0.5));
        last = await probe(link, run);
        if (last.verdict === "dead") {
          await pause(run, CONFIRM_MS);
          last = await probe(link, run);
        }
        if (last.verdict === "limited") {
          cool(link.host, last.wait);
          return null;
        }
        if (last.verdict !== "transient") {
          hosts.delete(link.host);
          return { status: last.verdict, code: last.code, bytes: last.bytes ?? null };
        }
      }
      return { status: "unreachable", code: last.code };
    }
    function setProgress(key, next) {
      progress.set(key, { ...progress.get(key), ...next });
      emit();
    }
    // Checks the links of `job.releases` (all of them when manual, else the stale ones), one at a time.
    async function checkLinks(job, run) {
      const seen = /* @__PURE__ */ new Set();
      const links = job.releases.flatMap(linksOf).filter((link) => !seen.has(link.url) && seen.add(link.url));
      const due = links.filter((link) => job.manual || stale(link.url)).slice(0, job.manual ? MANUAL_LINKS : BACKGROUND_LINKS);
      const summary = { active: 0, unreachable: 0, dead: 0, unknown: 0, skipped: links.length - due.length };
      const started = now();
      setProgress(job.key, { state: "checking", done: 0, total: due.length, manual: job.manual });
      for (const link of due) {
        if (run.stop) throw stopped();
        if (cooling(link.host) || job.manual && now() - started > MANUAL_MS) {
          summary.skipped++;
        } else {
          const verdict = await verify(link, run);
          if (!verdict) summary.skipped++;
          else {
            summary[verdict.status]++;
            remember(link.url, verdict.status, verdict.code, verdict.bytes);
          }
        }
        setProgress(job.key, { done: progress.get(job.key).done + 1 });
      }
      return summary;
    }
    async function runJob(job) {
      const run = { stop: false, abort: null };
      run.stopping = new Promise((resolve) => {
        run.halt = () => {
          run.stop = true;
          run.abort?.();
          resolve();
        };
      });
      running = { job, run };
      try {
        if (job.manual) {
          const summary = await quiet(`check links ${job.key}`, () => checkLinks(job, run));
          setProgress(job.key, { state: "done", summary, at: now() });
          job.resolve?.(summary);
          return;
        }
        const release = lend(() => run.halt());
        if (!release) {
          job.retryAt = now() + BUSY_RETRY_MS;
          pending.set(job.key, job);
          setProgress(job.key, { state: "waiting" });
          return;
        }
        try {
          const summary = await checkLinks(job, run);
          setProgress(job.key, { state: "done", summary, at: now() });
        } finally {
          release();
        }
      } catch (error) {
        if (!error.stopped) {
          log(`check ${job.key} failed: ${error.message}`);
          setProgress(job.key, { state: "done", summary: null, at: now() });
          job.resolve?.(null);
        } else if (!pending.has(job.key) && !job.dropped) {
          // Asked to give the network back: the rest waits for the next idle moment (what was checked stands).
          pending.set(job.key, { ...job, retryAt: now() + BUSY_RETRY_MS });
          setProgress(job.key, { state: "waiting" });
        } else job.resolve?.(null);
      } finally {
        running = null;
      }
    }
    // The next job: the gamer's before the background's, then the most recently asked for.
    function next() {
      const ready = [...pending.values()].filter((job) => job.manual || (job.retryAt ?? 0) <= now());
      return ready.find((job) => job.manual) ?? ready.at(-1) ?? null;
    }
    async function pump() {
      if (running) return;
      for (let job = next(); job; job = next()) {
        pending.delete(job.key);
        await runJob(job);
      }
      // Background checks the queue would not lend the network for: asked again once it may have.
      if (pending.size && !retrying) {
        retrying = true;
        const soonest = Math.min(...[...pending.values()].map((job) => job.retryAt ?? 0));
        wait(Math.max(0, soonest - now())).then(() => {
          retrying = false;
          return pump();
        });
      }
    }
    return {
      /** The saved record of one link: { s: status, c: code, at }, or undefined. */
      recordOf,
      /** A release's standing (judge), or null when its links are not known yet. */
      verdictOf: (release) => judge(linksOf(release), recordOf),
      /** `releases` with what is known of their links applied (withVerdict); the same array while nothing changed. */
      overlay(releases) {
        const known = memo.get(releases);
        if (known?.version === version) return known.result;
        let changed = false;
        const result = releases.map((release) => {
          const verdict = judge(linksOf(release), recordOf);
          const sized = withSize(release, recordOf);
          if (!verdict && sized === release) return release;
          changed = true;
          return verdict ? withVerdict(sized, verdict) : sized;
        });
        const shown = changed ? result : releases;
        memo.set(releases, { version, result: shown });
        return shown;
      },
      /** Checks `key`'s stale links when the network is free; a later want for the same key replaces it. */
      want(key, releases) {
        if (running?.job.key === key) return;
        const before = pending.get(key);
        if (before?.manual) return;
        pending.delete(key);
        pending.set(key, { key, releases, manual: false, retryAt: before?.retryAt });
        void pump();
      },
      /** No longer wanted (its page closed): a background check of `key` not yet run is dropped. */
      drop(key) {
        const job = pending.get(key);
        if (job && !job.manual) pending.delete(key);
        if (running?.job.key === key && !running.job.manual) {
          running.job.dropped = true;
          running.run.halt();
        }
      },
      /** Checks every link of `releases` now (the gamer asked): resolves with how many were active, dead…. */
      checkNow(key, releases) {
        return new Promise((resolve) => {
          pending.get(key)?.resolve?.(null);
          pending.set(key, { key, releases, manual: true, resolve });
          setProgress(key, { state: "waiting", done: 0, total: 0, manual: true });
          // A background check gives way: of this game it is redone whole, of another it waits its turn.
          if (running && !running.job.manual) {
            if (running.job.key === key) running.job.dropped = true;
            running.run.halt();
          }
          void pump();
        });
      },
      /** A download's own failure (download-queue.js): a 404/410 there is as good as a check's. */
      report(url, message) {
        let link;
        try {
          link = { ...webURL(url), kind: "direct" };
        } catch {
          return;
        }
        const status = Number(/\bHTTP (\d{3})\b/.exec(message || "")?.[1]);
        if (status && classify(link, { status }).verdict === "dead") remember(link.url, "dead", status);
      },
      /** { state: waiting | checking | done, done, total, manual, summary, at } for `key`, or null. */
      progressOf: (key) => progress.get(key) ?? null,
      version: () => version,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      /** Writes what is known now (tests; the app saves by itself). */
      flush: () => records && save()
    };
  }
  // Failures the download queue reports, for whoever keeps link health (the queue is built before it).
  var reporters = /* @__PURE__ */ new Set();
  function reportLink(url, message) {
    for (const reporter of reporters) {
      try {
        reporter(url, message);
      } catch {
      }
    }
  }
  function onLinkReport(reporter) {
    reporters.add(reporter);
    return () => reporters.delete(reporter);
  }

export { BACKGROUND_LINKS, MANUAL_LINKS, TTL, classify, createLinkHealth, judge, linksOf, onLinkReport, reportLink, withVerdict };
