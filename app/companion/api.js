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

  var MAX_PAGE = 60;
  // What the phone's virtual remote may press: the d-pad, Cross, Circle, the shoulders and Options.
  var REMOTE_ACTIONS = /* @__PURE__ */ new Set(["up", "down", "left", "right", "confirm", "back", "l1", "r1", "options"]);
  // Shortcuts: refresh the store's feeds, or open a part of it on the console.
  var QUICK_ACTIONS = /* @__PURE__ */ new Set(["refresh", "home", "downloads", "search", "settings"]);
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
    if (state === "pausing" || state === "awaiting-browser") return ["cancel"];
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
      actions: actionsOf(item.state)
    };
  }
  // `catalog`: { search(query) -> games, getGame(id) }; `describe(release)` -> { name, detail, size, group };
  // `download(game)` -> { id, source }; `queue()` -> the queue's tasks; `control`: { pause, resume, cancel,
  // clear }(id); `storage()` -> [{ root, name, free, total }]; `feeds`: { list, add, edit, remove, refresh };
  // `remote(action)` presses a button on the console; `quick(action)` runs a shortcut; `info()` -> /api/info.
  // `releasesOf(game)` -> its sources as the console shows them (with what is known of their links).
  function createCompanionApi({ catalog, describe, download, queue, control, storage, feeds, remote, quick, info, releasesOf = (game) => game.releases }) {
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
    const routes = {
      "GET /api/info": () => json(200, info()),
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
