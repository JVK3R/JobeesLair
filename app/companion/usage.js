// How much the phone companion is used (0.5.4), for the stats ping (state/online.js, only with "Share anonymous
// stats" on): whether it is switched on, whether the helper keeps it on while the app is closed, and since the last
// ping went through, the minutes a phone had the page open and how many times one did each kind of thing. Counts
// only: never what was searched, queued, installed or pressed, and nothing about the phone.

  // What a request did, by its method and path. Looking around only counts as time on the page; GET /api/info is
  // the page opening (it asks once, as it loads or signs in).
  var KINDS = [
    ["games", /^POST \/api\/download$/],
    ["homebrew", /^POST \/api\/homebrew\//],
    ["downloads", /^POST \/api\/queue\//],
    ["library", /^POST \/api\/library\//],
    ["remote", /^POST \/api\/(remote|quick)$/],
    ["feeds", /^(POST|DELETE) \/api\/feeds/],
    ["opens", /^GET \/api\/info$/]
  ];
  var FIELDS = ["minutes", ...KINDS.map(([name]) => name)];
  var MINUTE_MS = 6e4;
  var counts = Object.fromEntries(FIELDS.map((name) => [name, 0]));
  var lastMinute = -1;
  var switches = () => ({ on: false, away: false });
  // A minute with a phone on the page: a request in it, or a live stream open (service.js looks once a second).
  function countMinute(now = Date.now()) {
    const minute = Math.floor(now / MINUTE_MS);
    if (minute === lastMinute) return;
    lastMinute = minute;
    counts.minutes++;
  }
  // A request a phone sent: its minute, and what it was for.
  function countRequest(method, path, now = Date.now()) {
    countMinute(now);
    const said = `${method} ${path}`;
    const kind = KINDS.find(([, pattern]) => pattern.test(said));
    if (kind) counts[kind[0]]++;
  }
  /** Where the switches are read from (service.js): () => ({on, away}). */
  function trackCompanion(read) {
    switches = read;
  }
  /** What the next ping says: {on, away, minutes, opens, games, homebrew, downloads, library, remote, feeds}. */
  function companionFacts() {
    let state = { on: false, away: false };
    try {
      state = switches();
    } catch {
    }
    return { on: Boolean(state.on), away: Boolean(state.away), ...counts };
  }
  /**
   * A ping went through saying `sent` (companionFacts then): those counts are taken off, and what came in since stays
   * for the next one. With stats off, online.js passes what was counted, so nothing from then is ever sent.
   */
  function companionSent(sent) {
    if (!sent) return;
    for (const name of FIELDS) counts[name] = Math.max(0, counts[name] - (Number(sent[name]) || 0));
  }

export { companionFacts, companionSent, countMinute, countRequest, trackCompanion };
