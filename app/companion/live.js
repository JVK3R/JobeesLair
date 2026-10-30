// Live updates for phones with the companion page open (0.5.4): what changed on the console, sent as Server-Sent
// Events through the native server (LocalServer.push, GET /api/events). The queue, the Homebrew section and the
// announcements mark what changed; tick() looks once a second for phones listening and sends them what changed at
// most every PUSH_MS. With none listening, nothing is built or sent. service.js runs it from its pump.

  var PUSH_MS = 500;
  var LOOK_MS = 1e3;
  var calm = () => ({ queue: false, homebrew: false, notes: false });
  var updatesOf = (value) => value ? value.updates.map((app) => `${app.id} ${app.state}`).join(",") : "";
  /**
   * `server`: {status() -> {streams}, push(name, value)}; `events`: api.js companionEvents; `notes()`: the announcements
   * up now. `onMinute(now)` hears each look while a phone listens (a minute with one counts as time on the page).
   */
  function createLive({ server, events, notes, onMinute = () => {}, log = () => {} }) {
    let dirty = calm();
    let streams = 0, lookedAt = -Infinity, pushedAt = -Infinity;
    let hbSeen = /* @__PURE__ */ new Map(), updatesSent = "", notesSent = JSON.stringify(notes());
    function push(name, value) {
      try {
        server.push(name, value);
      } catch (error) {
        log(`${name} not pushed: ${error.message}`);
      }
    }
    // How many phones listen. The first to open its stream starts the Homebrew states afresh (it fetched the rest
    // itself as it connected); with none, nothing waits to be sent.
    function look(now) {
      lookedAt = now;
      let open = 0;
      try {
        open = server.status().streams || 0;
      } catch {
      }
      if (open && !streams) {
        hbSeen = /* @__PURE__ */ new Map();
        updatesSent = updatesOf(events.homebrew(hbSeen));
      }
      if (!open) dirty = calm();
      streams = open;
      if (open) onMinute(now);
    }
    function send(now) {
      pushedAt = now;
      if (dirty.queue) {
        dirty.queue = false;
        push("queue", events.queue());
      }
      if (dirty.homebrew) {
        dirty.homebrew = false;
        const value = events.homebrew(hbSeen);
        const updates = updatesOf(value);
        if (value && (value.changes.length || updates !== updatesSent)) {
          updatesSent = updates;
          push("homebrew", value);
        }
      }
      if (dirty.notes) {
        dirty.notes = false;
        const list = notes();
        notesSent = JSON.stringify(list);
        push("notes", { notes: list });
      }
    }
    return {
      /** The queue or the Homebrew section changed ("queue" | "homebrew"). */
      mark(name) {
        dirty[name] = true;
      },
      /** The announcements the app holds now; sent only when they differ from what phones were last sent. */
      notesChanged(list) {
        if (JSON.stringify(list) !== notesSent) dirty.notes = true;
      },
      tick(now) {
        if (now - lookedAt >= LOOK_MS) look(now);
        if (streams && now - pushedAt >= PUSH_MS && (dirty.queue || dirty.homebrew || dirty.notes)) send(now);
      },
      push
    };
  }

export { LOOK_MS, PUSH_MS, createLive };
