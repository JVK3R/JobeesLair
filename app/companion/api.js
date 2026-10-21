// The phone companion's API: requests the native server (LocalServer) already checked for the PIN
// session, answered from the catalog, the download queue, the drives and the feeds. Pure routing over
// what it is given, so it runs (and is tested) without the console.
//
//   GET    /api/info                       app, version, creator
//   GET    /api/games?q=&offset=&limit=    catalog search, most popular first (limit ≤ 60)
//   GET    /api/game?id=                   one game, with its sources
//   POST   /api/download   {"id": "…"}     queues the game's preferred source
//   GET    /api/queue                      every task with its progress, speed and what can be done to it
//   POST   /api/queue/pause|resume|cancel|clear  {"id": "…"}   controls one task
//   GET    /api/storage                    each drive: name, free and total bytes
//   GET    /api/feeds                      catalog feeds and their state
//   POST   /api/feeds      {"url": "…"}    adds a feed (saved at once) and fetches it
//   POST   /api/feeds/edit {"from": "…", "url": "…"}   changes a feed's address in place
//   DELETE /api/feeds?url=…                removes a feed
//   POST   /api/feeds/mirrors {"url": "…", "mirror": "…"}   adds a fallback address for a feed
//   DELETE /api/feeds/mirrors?url=…&mirror=…                removes one
//   POST   /api/feeds/refresh              fetches every feed again
//   POST   /api/remote     {"action": "…"} a controller press on the console (REMOTE_ACTIONS)
//   POST   /api/quick      {"action": "…"} a shortcut on the console (QUICK_ACTIONS)
//   GET    /api/dashboard                  the Home tab in one answer: info, the download in progress, the
//                                          queue's counts, the drives and the homebrew with an update
//   GET    /api/homebrew?q=&category=&filter=&offset=&limit=   the Homebrew section: its categories, and its
//                                          apps (searched, one category, or installed/updates), most starred first
//   GET    /api/homebrew/app?id=           one app: everything its console page shows, and its state
//   POST   /api/homebrew/install {"id": "…", "file": "…"?}   installs (or updates) it from its release
//   POST   /api/homebrew/run     {"id": "…"}   sends its installed payload to the payload loader
//   POST   /api/homebrew/cancel  {"id": "…"}   stops its install
//   POST   /api/homebrew/update-all            installs every update out

  var MAX_PAGE = 60;
  // What the phone's virtual remote may press: the d-pad, Cross, Circle, the shoulders and Options.
  var REMOTE_ACTIONS = /* @__PURE__ */ new Set(["up", "down", "left", "right", "confirm", "back", "l1", "r1", "options"]);
  // Shortcuts: refresh the store's feeds, or open a part of it on the console.
  var QUICK_ACTIONS = /* @__PURE__ */ new Set(["refresh", "home", "downloads", "search", "settings", "homebrew"]);
  // Task states, as state/download-queue.js names them.
  var ACTIVE = ["resolving", "connecting", "downloading", "verifying", "extracting", "installing", "pausing"];
  var COMPLETE = ["downloaded", "file-downloaded", "installer-required", "installed", "extraction-required", "extracted", "attention"];
  var json = (status, value) => ({ status, type: "application/json", body: JSON.stringify(value) });
  var failure = (status, message) => json(status, { error: message });
  function params(query) {
    const out = {};
    for (const pair of (query || "").split("&")) {
      if (!pair) continue;
      const at = pair.indexOf("=");
      const decode = (text) => {
        try {
          return decodeURIComponent(text.replace(/\+/g, " "));
        } catch {
          return "";
        }
      };
      out[decode(at < 0 ? pair : pair.slice(0, at))] = decode(at < 0 ? "" : pair.slice(at + 1));
    }
    return out;
  }
  function bodyOf(request) {
    try {
      const value = JSON.parse(request.body || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return null;
    }
  }
  var integer = (text, fallback, min, max) => {
    const value = Number.parseInt(text, 10);
    return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
  };
  var card = (game) => ({
    id: game.id,
    title: game.title,
    platform: game.platform,
    year: game.year ?? null,
    sizeGb: game.sizeGb ?? null,
    cover: game.art?.cover ?? null,
    providers: game.providers ?? []
  });
  // What the phone may do to a task in its state (the console's own Downloads rules).
  function actionsOf(state) {
    if (state === "queued" || ACTIVE.includes(state) && state !== "pausing" && state !== "installing") return ["pause", "cancel"];
    if (state === "paused" || state === "failed") return ["resume", "cancel"];
    // Stopping already: it can still be discarded once it stops (the queue's cancel waits for that).
    // A part waiting on the browser can open it on the console from the phone (0.5.0 Pre Release 3).
    if (state === "awaiting-browser") return ["browser", "cancel"];
    if (state === "pausing") return ["cancel"];
    if (COMPLETE.includes(state)) return ["clear"];
    return [];
  }
  function job(item) {
    const total = item.total || 0;
    return {
      id: item.id,
      gameId: item.gameId,
      title: item.title,
      state: item.state,
      written: item.written || 0,
      total: total || null,
      percent: total ? Math.min(100, Math.round(item.written / total * 1e3) / 10) : null,
      bytesPerSecond: item.bytesPerSecond || 0,
      connections: item.connections || 0,
      error: item.error || "",
      message: item.message || "",
      part: item.parts?.length > 1 ? (item.partIndex ?? 0) + 1 : null,
      parts: item.parts?.length > 1 ? item.parts.length : null,
      opensAt: item.autoOpenAt || null,
      actions: actionsOf(item.state)
    };
  }
  // `catalog`: { search(query) -> games, getGame(id) }; `describe(release)` -> { name, detail, size, group };
  // `download(game)` -> { id, source }; `queue()` -> the queue's tasks; `control`: { pause, resume, cancel,
  // clear }(id); `storage()` -> [{ root, name, free, total }]; `feeds`: { list, add, edit, remove, refresh };
  // `remote(action)` presses a button on the console; `quick(action)` runs a shortcut; `info()` -> /api/info.
  // `releasesOf(game)` -> its sources as the console shows them (with what is known of their links).
  // A homebrew app as a list shows it, with where it stands on the console.
  function hbCard(app, status) {
    return {
      id: app.id,
      name: app.name,
      author: app.author,
      category: app.category,
      description: app.description,
      stars: app.stars,
      icon: app.icon && !app.iconFromAvatar ? app.icon : null,
      avatar: app.iconFromAvatar ? app.icon : null,
      logo: app.logo || null,
      version: app.release.tag,
      kind: app.files[0]?.kind ?? "",
      state: hbState(status),
      percent: status.task?.total ? Math.min(100, Math.floor(status.task.written / status.task.total * 100)) : null
    };
  }
  var hbState = (status) => status.task ? status.task.phase : status.failed ? "failed" : status.update ? "update" : status.installed ? "installed" : "";
  // `homebrew`: the section (state/homebrew.js createHomebrew), or null where there is none.
  function createCompanionApi({ catalog, describe, download, queue, control, storage, feeds, remote, quick, info, homebrew = null, releasesOf = (game) => game.releases, logs = null }) {
    const withId = (request, run) => {
      const body = bodyOf(request);
      if (!body || typeof body.id !== "string") return failure(400, "Send {\"id\": \"…\"}.");
      return run(body.id);
    };
    const queueAction = (name) => (request) => withId(request, (id) => {
      if (!control?.[name]) return failure(404, "Unknown request.");
      const item = queue().find((task) => task.id === id);
      if (!item) return failure(404, "That download is no longer in the queue.");
      if (!actionsOf(item.state).includes(name)) return failure(409, `It cannot ${name} while ${item.state.replace(/-/g, " ")}.`);
      try {
        // Cancelling settles later (an active task stops first): it is not waited for.
        Promise.resolve(control[name](id)).catch((error) => console.log(`companion: ${name} ${id}: ${error?.message}`));
      } catch (error) {
        return failure(409, error.message);
      }
      return json(200, { jobs: queue().map(job) });
    });
    const hbApp = (request, run) => withId(request, (id) => {
      if (!homebrew) return failure(404, "Unknown request.");
      const app = homebrew.app(id);
      if (!app) return failure(404, "No such app.");
      return run(app);
    });
    const hbDetail = (app) => {
      const status = homebrew.statusOf(app.id);
      return {
        ...hbCard(app, status),
        repo: app.repo,
        about: app.about,
        license: app.license,
        hero: app.hero,
        shots: app.shots,
        release: { tag: app.release.tag, title: app.release.title, date: app.release.date, prerelease: app.release.prerelease, notes: app.release.notes, downloads: app.release.downloads },
        files: app.files.map((file) => ({ name: file.name, kind: file.kind, size: file.size })),
        installed: status.record ? { version: status.record.tag, file: status.record.file, runnable: Boolean(status.record.run) } : status.outside ? { version: null, file: null, runnable: false } : null,
        error: status.failed || ""
      };
    };
    const routes = {
      "GET /api/info": () => json(200, info()),
      // 0.5.0 Pre Release 4: the debug log as plain text, for a bug report from the phone (the logger has already
      // blanked keys, tokens, e-mail addresses and link queries out of every line).
      "GET /api/logs": () => {
        if (!logs) return failure(404, "Unknown request.");
        return { status: 200, type: "text/plain; charset=utf-8", body: logs() || "(the log is empty)" };
      },
      "GET /api/dashboard": () => {
        const jobs = queue().map(job);
        const active = jobs.find((item) => ACTIVE.includes(item.state) && item.state !== "pausing") ?? null;
        const updates = homebrew ? homebrew.updates().map((app) => hbCard(app, homebrew.statusOf(app.id))) : [];
        return json(200, {
          info: info(),
          active,
          counts: { active: jobs.filter((item) => item.state === "queued" || ACTIVE.includes(item.state)).length, done: jobs.filter((item) => COMPLETE.includes(item.state)).length, failed: jobs.filter((item) => item.state === "failed").length, total: jobs.length },
          speed: jobs.reduce((sum, item) => sum + (item.bytesPerSecond || 0), 0),
          drives: storage ? storage() : [],
          homebrew: homebrew ? { apps: homebrew.index.apps.length, installed: homebrew.installedApps().length, updates } : null
        });
      },
      "GET /api/homebrew": (request) => {
        if (!homebrew) return failure(404, "Unknown request.");
        const { q = "", category = "", filter = "", offset, limit } = params(request.query);
        const index = homebrew.index;
        let apps = filter === "installed" ? homebrew.installedApps() : filter === "updates" ? homebrew.updates() : index.apps;
        if (category) apps = apps.filter((app) => app.category === category);
        const words = q.slice(0, 80).toLowerCase().split(/\s+/).filter(Boolean);
        if (words.length) apps = apps.filter((app) => words.every((word) => app.search.includes(word)));
        apps = [...apps].sort((a, b) => b.stars - a.stars);
        const start = integer(offset, 0, 0, apps.length);
        const size = integer(limit, 40, 1, MAX_PAGE);
        return json(200, {
          total: apps.length,
          offset: start,
          categories: index.categories.map((c) => ({ id: c.id, name: c.name, count: index.apps.filter((app) => app.category === c.id).length })),
          counts: { all: index.apps.length, installed: homebrew.installedApps().length, updates: homebrew.updates().length },
          apps: apps.slice(start, start + size).map((app) => hbCard(app, homebrew.statusOf(app.id)))
        });
      },
      "GET /api/homebrew/app": (request) => {
        if (!homebrew) return failure(404, "Unknown request.");
        const app = homebrew.app(params(request.query).id || "");
        return app ? json(200, hbDetail(app)) : failure(404, "No such app.");
      },
      "POST /api/homebrew/install": (request) => hbApp(request, (app) => {
        const body = bodyOf(request) || {};
        try {
          homebrew.install(app.id, typeof body.file === "string" ? body.file : void 0);
        } catch (error) {
          return failure(409, error.message);
        }
        return json(200, hbDetail(app));
      }),
      "POST /api/homebrew/run": (request) => hbApp(request, (app) => {
        try {
          const result = homebrew.run(app.id);
          return result.ok ? json(200, { ran: true, name: app.name }) : failure(409, result.error || "The payload loader did not take it.");
        } catch (error) {
          return failure(409, error.message);
        }
      }),
      "POST /api/homebrew/cancel": (request) => hbApp(request, (app) => {
        homebrew.cancel(app.id);
        return json(200, hbDetail(app));
      }),
      "POST /api/homebrew/update-all": () => {
        if (!homebrew) return failure(404, "Unknown request.");
        const started = [];
        for (const app of homebrew.updates()) {
          try {
            const record = homebrew.statusOf(app.id).record;
            homebrew.install(app.id, record?.file && app.files.some((file) => file.name === record.file) ? record.file : void 0);
            started.push(app.name);
          } catch (error) {
            console.log(`companion: update ${app.id}: ${error.message}`);
          }
        }
        return json(200, { started });
      },
      "GET /api/games": (request) => {
        const { q = "", offset, limit } = params(request.query);
        const found = catalog.search(q.slice(0, 100));
        const start = integer(offset, 0, 0, found.length);
        const size = integer(limit, 30, 1, MAX_PAGE);
        return json(200, { total: found.length, offset: start, games: found.slice(start, start + size).map(card) });
      },
      "GET /api/game": (request) => {
        const game = catalog.getGame(params(request.query).id || "");
        if (!game) return failure(404, "No such game.");
        return json(200, { ...card(game), summary: game.shortDescription || "", developer: game.developer || "", sources: releasesOf(game).map((release) => {
          const { name, detail, size, group } = describe(release);
          return { name, detail, size, group };
        }) });
      },
      "POST /api/download": (request) => withId(request, (id) => {
        const game = catalog.getGame(id);
        if (!game) return failure(404, "No such game.");
        try {
          return json(200, { queued: true, title: game.title, ...download(game) });
        } catch (error) {
          return failure(409, error.message);
        }
      }),
      "GET /api/queue": () => json(200, { jobs: queue().map(job) }),
      "POST /api/queue/pause": queueAction("pause"),
      "POST /api/queue/resume": queueAction("resume"),
      "POST /api/queue/cancel": queueAction("cancel"),
      "POST /api/queue/clear": queueAction("clear"),
      "POST /api/queue/browser": queueAction("browser"),
      "GET /api/storage": () => json(200, { drives: storage ? storage() : [] }),
      "GET /api/feeds": () => json(200, { feeds: feeds.list() }),
      "POST /api/feeds": (request) => {
        const body = bodyOf(request);
        if (!body || typeof body.url !== "string") return failure(400, "Send {\"url\": \"…\"}.");
        try {
          feeds.add(body.url);
          return json(200, { feeds: feeds.list() });
        } catch (error) {
          return failure(409, error.message);
        }
      },
      "POST /api/feeds/edit": (request) => {
        const body = bodyOf(request);
        if (!body || typeof body.from !== "string" || typeof body.url !== "string") return failure(400, "Send {\"from\": \"…\", \"url\": \"…\"}.");
        if (!feeds.edit) return failure(404, "Unknown request.");
        if (!feeds.list().some((feed) => feed.url === body.from)) return failure(404, "No such feed.");
        try {
          feeds.edit(body.from, body.url);
          return json(200, { feeds: feeds.list() });
        } catch (error) {
          return failure(409, error.message);
        }
      },
      "DELETE /api/feeds": (request) => {
        const url = params(request.query).url || "";
        if (!feeds.list().some((feed) => feed.url === url)) return failure(404, "No such feed.");
        feeds.remove(url);
        return json(200, { feeds: feeds.list() });
      },
      "POST /api/feeds/mirrors": (request) => {
        const body = bodyOf(request);
        if (!body || typeof body.url !== "string" || typeof body.mirror !== "string") return failure(400, "Send {\"url\": \"…\", \"mirror\": \"…\"}.");
        if (!feeds.addMirror) return failure(404, "Unknown request.");
        if (!feeds.list().some((feed) => feed.url === body.url)) return failure(404, "No such feed.");
        try {
          feeds.addMirror(body.url, body.mirror);
          return json(200, { feeds: feeds.list() });
        } catch (error) {
          return failure(409, error.message);
        }
      },
      "DELETE /api/feeds/mirrors": (request) => {
        const query = params(request.query);
        if (!feeds.removeMirror) return failure(404, "Unknown request.");
        if (!feeds.list().some((feed) => feed.url === query.url)) return failure(404, "No such feed.");
        feeds.removeMirror(query.url, query.mirror || "");
        return json(200, { feeds: feeds.list() });
      },
      "POST /api/feeds/refresh": () => {
        void feeds.refresh();
        return json(200, { feeds: feeds.list() });
      },
      "POST /api/remote": (request) => {
        const body = bodyOf(request);
        if (!body || !REMOTE_ACTIONS.has(body.action)) return failure(400, `Send {"action": one of ${[...REMOTE_ACTIONS].join(", ")}}.`);
        if (!remote) return failure(404, "Unknown request.");
        remote(body.action);
        return json(200, { ok: true });
      },
      "POST /api/quick": (request) => {
        const body = bodyOf(request);
        if (!body || !QUICK_ACTIONS.has(body.action)) return failure(400, `Send {"action": one of ${[...QUICK_ACTIONS].join(", ")}}.`);
        if (!quick) return failure(404, "Unknown request.");
        quick(body.action);
        return json(200, { ok: true });
      }
    };
    // Never throws: whatever goes wrong is a 500 with its message, and the server stays up.
    return function handle(request) {
      const route = routes[`${request.method} ${request.path}`];
      if (!route) return failure(404, "Unknown request.");
      try {
        return route(request);
      } catch (error) {
        console.log(`companion: ${request.method} ${request.path} failed: ${error?.message}`);
        return failure(500, error?.message || "Something went wrong.");
      }
    };
  }

export { QUICK_ACTIONS, REMOTE_ACTIONS, createCompanionApi };
