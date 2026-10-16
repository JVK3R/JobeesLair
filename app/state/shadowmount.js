// ../pub-game-store/native/state/shadowmount.js
// reconstructed from the esbuild bundle in eboot.bin


  var TTL_MS = 3e4;
  function createShadowMountProbe({ http, now }) {
    let checkedAt = -Infinity;
    let answer;
    return () => {
      if (now() - checkedAt < TTL_MS) return answer;
      checkedAt = now();
      answer = http.request("http://127.0.0.1:10101/api/v1/version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        maxBytes: 64 * 1024
      }).then(() => true, () => {
        checkedAt = -Infinity;
        return false;
      });
      return answer;
    };
  }
  // How long a request to ShadowMount may take, waiting included. The runtime runs one network task at a
  // time (ps5-react docs/NETWORKING.md): a request made while a download holds it waits for the whole file,
  // so a caller that cannot wait (a delete) pauses the download first (download-queue.js quietNetwork),
  // and none waits forever: past this it is cancelled and fails with `timedOut` set.
  var REQUEST_MS = 2e4;
  function deadline(ms) {
    const listeners = /* @__PURE__ */ new Set();
    const signal = {
      aborted: false,
      addEventListener: (type, listener) => type === "abort" && listeners.add(listener),
      removeEventListener: (type, listener) => listeners.delete(listener)
    };
    const id = setTimeout(() => {
      signal.aborted = true;
      for (const listener of [...listeners]) listener();
    }, ms);
    return { signal, clear: () => clearTimeout(id) };
  }
  // Fails with `status` (ShadowMount's errno, 16 = EBUSY) and `httpStatus` when ShadowMount answers with an
  // error, `unreachable` when nothing answers, `timedOut` when the answer did not come in time.
  async function shadowRequest(http, route, body = {}, { timeoutMs = REQUEST_MS } = {}) {
    let response;
    const timer = deadline(timeoutMs);
    try {
      response = await http.request(`http://127.0.0.1:10101/api/v1/${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        maxBytes: 1024 * 1024,
        signal: timer.signal
      });
    } catch (error2) {
      if (timer.signal.aborted) throw Object.assign(new Error(`ShadowMount did not answer ${route} within ${Math.round(timeoutMs / 1e3)} seconds.`), { timedOut: true });
      error2.unreachable = true;
      throw error2;
    } finally {
      timer.clear();
    }
    if (!response.ok) {
      const reply = await response.json().catch(() => null);
      const reason = reply?.error ?? "";
      throw Object.assign(new Error(`ShadowMount HTTP ${response.status}${reason ? `: ${reason}` : ""}.`), { httpStatus: response.status, status: typeof reply?.status === "number" ? reply.status : null });
    }
    return response.json();
  }
  // ShadowMount refuses mounts, uninstalls and source deletes while a game is running (HTTP 409, EBUSY), and
  // Jobee'sLair is itself the running game whenever it asks: only after it closes can ShadowMount do them.
  var busyWhileOpen = (error2) => error2?.httpStatus === 409 || error2?.status === 16 || /\bEBUSY\b|game is active|awaiting exit/i.test(error2?.message ?? "");
  function within2(path, paths, root2) {
    const target = path?.replace(/\/+$/, "");
    if (!target) return false;
    return paths.some((base) => {
      const tail = base.startsWith(`${root2}/`) ? base.slice(root2.length) : null;
      return target === base || target.startsWith(`${base}/`) || tail && (target.endsWith(tail) || target.includes(`${tail}/`));
    });
  }
  async function mountedImages(request, paths, root2) {
    let reply;
    try {
      reply = await request("images");
    } catch (error2) {
      if (error2.unreachable) return null;
      throw error2;
    }
    return (reply.images ?? []).filter((image) => image.mounted && within2(image.path, paths, root2));
  }

  // ShadowMount answers one request at a time, and the runtime runs one network task at a time behind any
  // download (see REQUEST_MS). Two ways to ask it, then:
  //   background(route, body)       for work nobody waits on (the mount monitor, health checks): one at a
  //                                 time, never while a download holds the network (it would sit behind the
  //                                 whole file), a short deadline, and after ShadowMount timed out or did not
  //                                 answer, none for a minute. Fails with `skipped` when it was not asked.
  //   now(reason, route, body)      for what the gamer waits on: the download in progress is paused
  //                                 meanwhile (`quiet`, the queue's quietNetwork) and resumed after.
  var BACKGROUND_MS = 8e3;
  var REST_MS = 6e4;
  function createShadowClient({ http, transferring = () => false, quiet = (reason, work) => work(), now = Date.now }) {
    let resting = 0;
    let chain = Promise.resolve();
    const skipped = (why) => Object.assign(new Error(`ShadowMount was not asked: ${why}.`), { skipped: true });
    const serial = (work) => {
      const run = chain.then(work, work);
      chain = run.catch(() => {
      });
      return run;
    };
    const noted = async (work) => {
      try {
        const reply = await work();
        resting = 0;
        return reply;
      } catch (error2) {
        if (error2.timedOut || error2.unreachable) resting = now() + REST_MS;
        throw error2;
      }
    };
    return {
      background(route, body = {}, { timeoutMs = BACKGROUND_MS } = {}) {
        if (transferring()) return Promise.reject(skipped("a download holds the network"));
        if (now() < resting) return Promise.reject(skipped("it did not answer a moment ago"));
        return serial(() => {
          if (transferring()) throw skipped("a download holds the network");
          return noted(() => shadowRequest(http, route, body, { timeoutMs }));
        });
      },
      now(reason, route, body = {}, options) {
        return quiet(reason, () => serial(() => noted(() => shadowRequest(http, route, body, options))));
      },
      get resting() {
        return now() < resting;
      }
    };
  }
  var parentOf = (path) => path.replace(/\/+$/, "").replace(/\/[^/]+$/, "") || "/";
  // Whether ShadowMount's scan finds `path` (a game's image or folder) by itself: it lies in one of its scan
  // paths, at most `depth` folders down (config.ini scan_depth, 1 by default).
  function scanCovers(scanPaths, path, depth = 1) {
    const parent = parentOf(path);
    return (scanPaths ?? []).some((base) => {
      const root2 = String(base).replace(/\/+$/, "");
      if (!root2 || !(parent === root2 || parent.startsWith(`${root2}/`))) return false;
      return parent.slice(root2.length).split("/").filter(Boolean).length < Math.max(1, depth);
    });
  }
  // The last time a game was launched, from ShadowMount's game record (app.db), in ms, or null.
  var LAUNCH_FIELDS = ["last_launch_time", "last_access_time", "last_launched", "last_played", "lastAccessTime", "last_launch"];
  function launchedAt(game, parse) {
    for (const field of LAUNCH_FIELDS) {
      const at = parse(game?.[field]);
      if (at) return at;
    }
    return null;
  }
  /**
   * After a game's files moved from `from` to `to`: makes ShadowMount find the game at its new place.
   * `ask(route, body)` asks ShadowMount now. Its scan finds `to` when a scan path holds it; otherwise
   * `to` goes into manual.lst (manual/add, idempotent). An entry for `from` there goes (manual/remove), and
   * a rescan is asked for: ShadowMount drops the link to the old place ("source removed") and links the
   * title to the new one. It holds a scan while a game runs, and Jobee'sLair is one, so that happens once
   * the app is closed. Returns { steps, failed } for the log; it never throws.
   */
  async function reregister(ask, { from, to }) {
    const steps = [];
    let failed = false;
    const step = async (what, route, body) => {
      try {
        const reply = await ask(route, body);
        steps.push(what);
        return reply ?? {};
      } catch (error2) {
        failed = true;
        steps.push(`${what} failed: ${error2.message}`);
        return null;
      }
    };
    const settings = await step("scan paths read", "settings", {});
    const paths = settings?.scan_paths ?? settings?.settings?.scan_paths ?? null;
    const depth = Number(settings?.scan_depth ?? settings?.settings?.scan_depth) || 1;
    const manual = await step("manual list read", "manual/list", {});
    const listed2 = (manual?.paths ?? manual?.entries ?? manual?.sources ?? []).map((item) => typeof item === "string" ? item : item?.path).filter(Boolean);
    if (listed2.some((path) => path.replace(/\/+$/, "") === from)) await step(`manual entry ${from} removed`, "manual/remove", { path: from });
    if (!paths || !scanCovers(paths, to, depth)) await step(`manual entry ${to} added`, "manual/add", { path: to });
    else steps.push(`${to} is in a scan path`);
    await step("rescan asked", "scan", { reset_attempts: false });
    return { steps, failed };
  }

export { busyWhileOpen, createShadowClient, createShadowMountProbe, launchedAt, mountedImages, reregister, scanCovers, shadowRequest, within2 };
