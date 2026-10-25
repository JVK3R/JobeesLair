// Jobee'sLair online (0.5.2): a Cloudflare Worker with a D1 database (schema.sql) behind the app's online features
// (app/state/online.js) and Jake's dashboard.
//
//   POST /v1/ping    {id, version, edition, firmware, language}: a console that shares stats, every five minutes
//                    while the app is open. Answers {online, announcements: [{id, text, level, until}]}.
//   GET  /v1/status  the same answer, with nothing about the console sent or kept: every app asks once a minute
//                    between its pings (with stats off, only this).
//   POST /v1/event   {type: "homebrew-install", app, ok, error, version, firmware}: kept with no console ID.
//   GET  /dashboard  the dashboard page (dashboard.js), and its typeface (/dashboard/exo2-*.woff2). Signing in
//                    (POST /v1/admin/login) takes the password and the 6-digit code of an authenticator app; the
//                    first time, reset-login.mjs's temporary password opens /v1/admin/setup/key and
//                    /v1/admin/setup/finish instead. A session cookie then lasts 12 hours for /v1/admin/live (the
//                    top row), /v1/admin/summary?days=N (the rest) and /v1/admin/announcement (/remove takes one down).
//
// Nothing here stores IP addresses, and the app never sends its library, its downloads or anything that
// identifies the console or the person. A nightly run (scheduled) drops what's past its keeping time.
import { DASHBOARD } from "./dashboard.js";
import { qrMatrix } from "../../app/ui/qr.js";
import { EXO2_500, EXO2_700 } from "../../app/companion/fonts.js";

var ID = /^[0-9a-f]{32}$/;
var DAY_MS = 864e5;
var ONLINE_MS = 10 * 6e4;    // a console counts as online for ten minutes after a ping (the app pings every five)
var PING_GAP_MS = 6e4;       // pings closer together than this are answered but not written again
var CACHE_MS = 30e3;         // the count and the announcements, per isolate
var MAX_BODY = 4096;
var EVENTS_PER_HOUR = 60;    // per address, in this isolate's memory only (never written anywhere)
// Pings written from one address in five minutes, counted the same way: about as many consoles behind one address
// (a home, a café, a carrier's shared one), and no more, so the count every app shows can't be run up from one machine.
var PINGS_PER_ADDRESS = 40;
var PING_SPAN_MS = 5 * 6e4;
var LEVELS = new Set(["info", "warning"]);
var MAX_NOTES = 5;           // announcements up at once
var MAX_TEXT = 140;          // one line across the app's announcement bar

var day = (ms) => new Date(ms).toISOString().slice(0, 10);
var hour = (ms) => new Date(ms).toISOString().slice(0, 13);
// Short text from a client: printable, trimmed, cut to `max`.
var clean = (value, max, drop = /[^\w .,:;'()+\-\/]/g) => String(value ?? "").replace(drop, "").replace(/\s+/g, " ").trim().slice(0, max);
var json = (body, status = 200, cache = "no-store", extra = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, ...extra } });

// The dashboard's typeface, Exo 2 (SIL OFL 1.1, app/notices/Exo2-OFL.txt): the phone page's two weights.
var fromBase64Text = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
var FONTS = { "/dashboard/exo2-500.woff2": fromBase64Text(EXO2_500), "/dashboard/exo2-700.woff2": fromBase64Text(EXO2_700) };

let counted = { at: -Infinity, online: 0 };
let posted = { at: -Infinity, rows: [] };
var lastPing = new Map();
var eventsFrom = new Map();
var pingsFrom = new Map();
var wrongFrom = new Map();  // wrong dashboard passwords, by address

// What one address did within `span`, in this isolate's memory only (never written anywhere): its times, for the
// caller to count and add to.
function recentFrom(seen, address, now, span) {
  if (seen.size > 20000) seen.clear();
  const recent = (seen.get(address) ?? []).filter((at) => now - at < span);
  seen.set(address, recent);
  return recent;
}
var addressOf = (request) => request.headers.get("cf-connecting-ip") || "?";

async function readJson(request) {
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return null;
  try {
    const text = await request.text();
    return text.length > MAX_BODY ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

async function onlineNow(db, now, fresh = false) {
  if (fresh || now - counted.at > CACHE_MS) {
    const row = await db.prepare("SELECT COUNT(*) AS n FROM consoles WHERE last_seen > ?").bind(now - ONLINE_MS).first();
    counted = { at: now, online: row?.n ?? 0 };
  }
  return counted.online;
}

// The announcements up now, warnings first, then the newest: the order the app takes turns in.
async function announcements(db, now, fresh = false) {
  if (fresh || now - posted.at > CACHE_MS) {
    posted = { at: now, rows: (await db.prepare("SELECT id, text, level, until FROM announcements ORDER BY level = 'warning' DESC, id DESC").all()).results ?? [] };
  }
  return posted.rows.filter((row) => !row.until || row.until > now).map((row) => ({ id: row.id, text: row.text, level: row.level, until: row.until ?? null }));
}

async function answer(db, now) {
  return { online: await onlineNow(db, now), announcements: await announcements(db, now) };
}

async function ping(request, db, now) {
  const body = await readJson(request);
  if (!body || !ID.test(String(body.id))) return json({ error: "not a ping" }, 400);
  // Always answered; written once a minute a console, and for PINGS_PER_ADDRESS from one address in five minutes.
  const due = now - (lastPing.get(body.id) ?? -Infinity) >= PING_GAP_MS;
  const fromThere = due ? recentFrom(pingsFrom, addressOf(request), now, PING_SPAN_MS) : [];
  if (due && fromThere.length < PINGS_PER_ADDRESS) {
    fromThere.push(now);
    lastPing.set(body.id, now);
    if (lastPing.size > 50000) lastPing.clear();
    const edition = body.edition === "homebrew" ? "homebrew" : "store";
    // A session starts with a console's first ping after ten quiet minutes (or its first ever).
    const seen = await db.prepare("SELECT last_seen FROM consoles WHERE id = ?").bind(body.id).first();
    const starts = !seen || now - seen.last_seen > ONLINE_MS ? 1 : 0;
    await db.batch([
      db.prepare(
        "INSERT INTO consoles (id, first_seen, last_seen, version, edition, firmware, language) VALUES (?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT (id) DO UPDATE SET last_seen = excluded.last_seen, version = excluded.version, edition = excluded.edition, " +
          "firmware = excluded.firmware, language = excluded.language"
      ).bind(body.id, now, now, clean(body.version, 24) || "?", edition, clean(body.firmware, 12) || "?", clean(body.language, 12) || "?"),
      db.prepare("INSERT OR IGNORE INTO active (day, id) VALUES (?, ?)").bind(day(now), body.id)
    ]);
    // Time in Jobee'sLair, from the pings alone: each stands for five minutes open. Counted again when a session
    // starts, so the day's and the hour's peak include this console.
    const online = await onlineNow(db, now, starts === 1);
    await db.batch([
      db.prepare("INSERT INTO usage (day, pings, sessions, peak) VALUES (?, 1, ?, ?) ON CONFLICT (day) DO UPDATE SET " +
        "pings = pings + 1, sessions = sessions + excluded.sessions, peak = MAX(peak, excluded.peak)").bind(day(now), starts, online),
      db.prepare("INSERT INTO usage_hours (hour, pings, peak) VALUES (?, 1, ?) ON CONFLICT (hour) DO UPDATE SET " +
        "pings = pings + 1, peak = MAX(peak, excluded.peak)").bind(hour(now), online)
    ]);
  }
  return json(await answer(db, now));
}

async function event(request, db, now) {
  const body = await readJson(request);
  const app = clean(body?.app, 80, /[^\w.\-\/]/g);
  if (body?.type !== "homebrew-install" || !app) return json({ error: "not an event" }, 400);
  const recent = recentFrom(eventsFrom, addressOf(request), now, 36e5);
  if (recent.length >= EVENTS_PER_HOUR) return json({ error: "slow down" }, 429);
  recent.push(now);
  const ok = body.ok === true;
  await db.prepare("INSERT INTO installs (at, day, app, ok, error, version, firmware) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(now, day(now), app, ok ? 1 : 0, ok ? "" : clean(body.error, 200, /[\x00-\x1f\x7f]/g), clean(body.version, 24) || "?", clean(body.firmware, 12) || "?")
    .run();
  return new Response(null, { status: 204 });
}

// ---- The dashboard's sign-in ---------------------------------------------------------------------------------
// The first time (and after reset-login.mjs), a temporary password works for an hour and opens only the setup:
// Jake picks his own password and adds the authenticator (scan the QR code, type the code it shows). From then on,
// signing in takes the password and a current 6-digit code (RFC 6238: HMAC-SHA-1, 30-second steps, the step
// before and after accepted for a slow clock), each code once. A wrong password counts against its own address
// only, in memory like a flood of events: ten in an hour turn that address away, so a stranger guessing locks out
// only themselves. A wrong or reused code after the right password means someone has the password: ten of those
// in an hour, from anywhere, lock sign-in for everyone for the rest of it (D1 admin_failures).
// Passwords are kept as PBKDF2 hashes in D1, the authenticator key too; a session is a cookie the page's
// scripts can't read, signed with the SESSION_KEY secret and tied to the sign-in's version, so a reset or a new
// setup signs everyone out.
var SESSION_MS = 12 * 36e5;
var SETUP_SESSION_MS = 20 * 6e4;
var FAILURES_PER_HOUR = 10;
var MIN_PASSWORD = 12;
var ITERATIONS = 100000;  // the most PBKDF2 rounds Workers allows
var COOKIE = "jl_session";
var encoder = new TextEncoder();
var sessionKey = (env) => String(env.SESSION_KEY || "").trim();  // a secret piped in can bring a line break

function same(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

var toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
var fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(text) {
  const out = [];
  let bits = 0, value = 0;
  for (const char of String(text).toUpperCase().replace(/[\s=-]/g, "")) {
    const index = BASE32.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 255);
      value &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(out);
}
function toBase32(bytes) {
  let out = "", bits = 0, value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  return bits ? out + BASE32[(value << (5 - bits)) & 31] : out;
}

async function hmac(hash, keyBytes, message) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
}

// The 6-digit code for a 30-second step.
async function totp(secret, step) {
  const counter = new DataView(new ArrayBuffer(8));
  counter.setUint32(0, Math.floor(step / 2 ** 32));
  counter.setUint32(4, step >>> 0);
  const mac = await hmac("SHA-1", secret, counter.buffer);
  const at = mac[19] & 15;
  const number = ((mac[at] & 127) << 24) | (mac[at + 1] << 16) | (mac[at + 2] << 8) | mac[at + 3];
  return String(number % 1e6).padStart(6, "0");
}

// The step whose code this is (the one before and after count too), or null.
async function codeStep(key, given, now) {
  const code = String(given ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code) || !key) return null;
  const secret = base32(key);
  const step = Math.floor(now / 30e3);
  let matched = null;
  for (const candidate of [step - 1, step, step + 1]) if (same(await totp(secret, candidate), code)) matched = candidate;
  return matched;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256));
}
async function makePassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(await derive(password, salt, ITERATIONS))}`;
}
async function checkPassword(stored, given) {
  const [kind, rounds, salt, hash] = String(stored ?? "").split("$");
  const iterations = Number(rounds);
  if (kind !== "pbkdf2" || !salt || !hash || !(iterations >= 1e4 && iterations <= ITERATIONS)) return false;
  return same(toBase64(await derive(String(given ?? ""), fromBase64(salt), iterations)), hash);
}

var loginOf = (db) => db.prepare("SELECT password, totp, pending, setup_until, version FROM admin_login WHERE slot = 1").first();

var sign = async (env, body) => toBase64(await hmac("SHA-256", encoder.encode(sessionKey(env)), encoder.encode(body))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sessionCookie(env, scope, version, now) {
  const length = scope === "full" ? SESSION_MS : SETUP_SESSION_MS;
  const body = `${now + length}.${scope}.${version}`;
  return `${COOKIE}=${body}.${await sign(env, body)}; Path=/v1/admin; Max-Age=${length / 1e3}; HttpOnly; Secure; SameSite=Strict`;
}

// The session's scope ("full" or "setup") when its cookie is good and from the sign-in as it is now, else null.
async function sessionOf(request, env, login, now) {
  if (sessionKey(env).length < 32 || !login) return null;
  const cookie = (request.headers.get("cookie") || "").split(/;\s*/).find((part) => part.startsWith(`${COOKIE}=`));
  const [expires, scope, version, mac] = (cookie?.slice(COOKIE.length + 1) || "").split(".");
  if (!/^\d{13}$/.test(expires || "") || Number(expires) <= now || !mac || String(login.version) !== version) return null;
  if (!same(mac, await sign(env, `${expires}.${scope}.${version}`))) return null;
  return scope === "full" || (scope === "setup" && !login.totp) ? scope : null;
}

async function locked(db, now) {
  return ((await db.prepare("SELECT COUNT(*) AS n FROM admin_failures WHERE at > ?").bind(now - 36e5).first())?.n ?? 0) >= FAILURES_PER_HOUR;
}
async function failed(db, now, message) {
  await db.prepare("INSERT INTO admin_failures (at) VALUES (?)").bind(now).run();
  console.log("online: a dashboard sign-in failed");
  return json({ error: message }, 401);
}
var wrongHere = (request, now) => recentFrom(wrongFrom, addressOf(request), now, 36e5);
function wrongPassword(request, now, message) {
  wrongHere(request, now).push(now);
  console.log("online: a dashboard sign-in failed (wrong password)");
  return json({ error: message }, 401);
}
async function useStep(db, step) {
  await db.prepare("INSERT INTO admin_state (name, value) VALUES ('totp_step', ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value").bind(step).run();
}

async function signIn(request, env, db, now) {
  const login = await loginOf(db);
  if (sessionKey(env).length < 32 || !login) return json({ error: "Sign-in isn't set up yet (tools/online/reset-login.mjs)." }, 503);
  if (wrongHere(request, now).length >= FAILURES_PER_HOUR || await locked(db, now)) return json({ error: "Too many wrong tries. Sign-in is locked for up to an hour." }, 429);
  const body = await readJson(request);
  const passwordOk = await checkPassword(login.password, body?.password);
  if (!login.totp) {
    if (!login.setup_until || login.setup_until <= now) return json({ error: "The first-time password has run out. Run tools/online/reset-login.mjs again." }, 403);
    if (!passwordOk) return wrongPassword(request, now, "Wrong password.");
    return json({ setup: true }, 200, "no-store", { "set-cookie": await sessionCookie(env, "setup", login.version, now) });
  }
  const step = await codeStep(login.totp, body?.code, now);
  const used = (await db.prepare("SELECT value FROM admin_state WHERE name = 'totp_step'").first())?.value ?? -1;
  if (!passwordOk) return wrongPassword(request, now, "Wrong password or code.");
  if (step === null || step <= used) return failed(db, now, "Wrong password or code.");
  await useStep(db, step);
  return json({ ok: true }, 200, "no-store", { "set-cookie": await sessionCookie(env, "full", login.version, now) });
}

// Setup, step 1: the authenticator key to scan (the same one until setup is finished), and its QR code as
// {size, cells}: one "1" or "0" a module, row by row, for the page to draw.
async function setupKey(db, login) {
  let key = login.pending;
  if (!key) {
    key = toBase32(crypto.getRandomValues(new Uint8Array(20)));
    await db.prepare("UPDATE admin_login SET pending = ? WHERE slot = 1").bind(key).run();
  }
  const name = encodeURIComponent("Jobee'sLair Online");
  const uri = `otpauth://totp/${name}:dashboard?secret=${key}&issuer=${name}&algorithm=SHA1&digits=6&period=30`;
  const matrix = qrMatrix(uri);
  let cells = "";
  for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) cells += matrix.dark(x, y) ? "1" : "0";
  return json({ key, size: matrix.size, cells });
}

// Setup, step 2: Jake's own password and the first code from the authenticator. Then the sign-in is his, a new
// version (the setup session ends), and he's signed in for real.
async function setupFinish(request, env, db, login, now) {
  if (await locked(db, now)) return json({ error: "Too many wrong tries. Sign-in is locked for up to an hour." }, 429);
  const body = await readJson(request);
  const password = String(body?.password ?? "");
  if (password.length < MIN_PASSWORD) return json({ error: `Pick a password of at least ${MIN_PASSWORD} characters.` }, 400);
  if (await checkPassword(login.password, password)) return json({ error: "Pick a new password, not the first-time one." }, 400);
  const step = await codeStep(login.pending, body?.code, now);
  if (!login.pending || step === null) return failed(db, now, "That code doesn't match. Check the time on your phone, then try the newest code.");
  const version = now;
  await db.prepare("UPDATE admin_login SET password = ?, totp = pending, pending = NULL, setup_until = NULL, version = ? WHERE slot = 1")
    .bind(await makePassword(password), version).run();
  await useStep(db, step);
  return json({ ok: true }, 200, "no-store", { "set-cookie": await sessionCookie(env, "full", version, now) });
}

var signOut = () => json({ ok: true }, 200, "no-store", { "set-cookie": `${COOKIE}=; Path=/v1/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });


var rows = async (db, sql, ...values) => (await db.prepare(sql).bind(...values).all()).results ?? [];
var count = async (db, sql, ...values) => (await db.prepare(sql).bind(...values).first())?.n ?? 0;

// The dashboard's top row, asked for every 15 seconds: who's on now, today so far.
async function live(db, now) {
  const [online, today, usage] = await Promise.all([
    onlineNow(db, now, true),
    count(db, "SELECT COUNT(*) AS n FROM active WHERE day = ?", day(now)),
    db.prepare("SELECT pings, sessions, peak FROM usage WHERE day = ?").bind(day(now)).first()
  ]);
  return { at: now, online, today, pings: usage?.pings ?? 0, sessions: usage?.sessions ?? 0, peak: Math.max(usage?.peak ?? 0, online) };
}

// Everything else, for the last `span` days (7 to 180) and, for the changes, the same span before it.
async function summary(db, env, now, span) {
  const since = (days) => day(now - days * DAY_MS);
  const from = since(2 * span);
  const spread = (column) => rows(db, `SELECT ${column} AS name, COUNT(*) AS n FROM consoles WHERE last_seen > ? GROUP BY ${column} ORDER BY n DESC LIMIT 12`, now - span * DAY_MS);
  const [week, month, consoles, fresh, daily, usage, hours, ever, versions, firmware, languages, editions, installDays, apps, failures, notes, github] = await Promise.all([
    count(db, "SELECT COUNT(DISTINCT id) AS n FROM active WHERE day > ?", since(7)),
    count(db, "SELECT COUNT(DISTINCT id) AS n FROM active WHERE day > ?", since(30)),
    count(db, "SELECT COUNT(*) AS n FROM consoles"),
    count(db, "SELECT COUNT(*) AS n FROM consoles WHERE first_seen >= ?", Date.parse(`${day(now)}T00:00:00Z`)),
    // Each day's consoles, and how many of them were new that day.
    rows(db, "SELECT a.day AS day, COUNT(*) AS active, SUM(CASE WHEN strftime('%Y-%m-%d', c.first_seen / 1000, 'unixepoch') = a.day THEN 1 ELSE 0 END) AS fresh " +
      "FROM active a LEFT JOIN consoles c ON c.id = a.id WHERE a.day > ? GROUP BY a.day ORDER BY a.day", from),
    rows(db, "SELECT day, pings, sessions, peak FROM usage WHERE day > ? ORDER BY day", from),
    rows(db, "SELECT hour, pings, peak FROM usage_hours WHERE hour >= ? ORDER BY hour", hour(now - 47 * 36e5)),
    db.prepare("SELECT COALESCE(SUM(pings), 0) AS pings, COALESCE(SUM(sessions), 0) AS sessions, COALESCE(MAX(peak), 0) AS peak FROM usage").first(),
    spread("version"),
    spread("firmware"),
    spread("language"),
    spread("edition"),
    rows(db, "SELECT day, SUM(ok) AS ok, SUM(1 - ok) AS failed FROM installs WHERE day > ? GROUP BY day ORDER BY day", from),
    rows(db, "SELECT app, SUM(ok) AS ok, SUM(1 - ok) AS failed FROM installs WHERE day > ? GROUP BY app ORDER BY ok + failed DESC LIMIT 40", since(span)),
    rows(db, "SELECT at, app, error, version, firmware FROM installs WHERE ok = 0 ORDER BY at DESC LIMIT 25"),
    announcements(db, now, true),
    githubNumbers(db, env, now)
  ]);
  return { ...(await live(db, now)), span, week, month, consoles, fresh, daily, usage, hours, ever, versions, firmware, languages, editions, installDays, apps, failures, announcements: notes, github };
}

// ---- GitHub's public numbers -----------------------------------------------------------------------------------
// The repository's releases (downloads of each file) and stars, asked of GitHub's API at most every GITHUB_MS while
// the dashboard is open, kept in D1 between times (and when GitHub can't be reached), with each day's total
// downloads for the growth curve. A GITHUB_TOKEN secret is optional: it only raises GitHub's hourly limit.
var GITHUB_REPO = "JVK3R/JobeesLair";
var GITHUB_MS = 15 * 6e4;

async function fetchGithub(env) {
  const headers = { "user-agent": "jobeeslair-online", accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  const token = String(env.GITHUB_TOKEN || "").trim();
  if (token) headers.authorization = `Bearer ${token}`;
  const get = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, { headers, signal: AbortSignal.timeout(8e3) });
    if (!response.ok) throw new Error(`GitHub answered HTTP ${response.status}`);
    return response.json();
  };
  const [repo, list] = await Promise.all([get(""), get("/releases?per_page=100")]);
  const releases = (Array.isArray(list) ? list : []).filter((release) => !release.draft).map((release) => {
    const files = (pattern) => (release.assets ?? []).filter((asset) => pattern.test(asset.name)).reduce((sum, asset) => sum + (Number(asset.download_count) || 0), 0);
    return {
      tag: clean(release.tag_name, 40),
      name: clean(release.name || release.tag_name, 80),
      published: Date.parse(release.published_at) || 0,
      prerelease: release.prerelease === true,
      image: files(/\.exfat$/i),       // a fresh install
      update: files(/\.zip$/i),        // the in-app updater's download
      other: files(/^(?!.*\.(exfat|zip)$)/i)
    };
  });
  const total = releases.reduce((sum, release) => sum + release.image + release.update + release.other, 0);
  return { total, stars: Number(repo.stargazers_count) || 0, forks: Number(repo.forks_count) || 0, watchers: Number(repo.subscribers_count) || 0, releases };
}

async function githubNumbers(db, env, now) {
  const kept = await db.prepare("SELECT at, data FROM github WHERE slot = 1").first();
  let at = kept?.at ?? 0;
  let data = kept ? JSON.parse(kept.data) : null;
  if (now - at > GITHUB_MS) {
    try {
      data = await fetchGithub(env);
      at = now;
      await db.batch([
        db.prepare("INSERT INTO github (slot, at, data) VALUES (1, ?, ?) ON CONFLICT (slot) DO UPDATE SET at = excluded.at, data = excluded.data").bind(now, JSON.stringify(data)),
        db.prepare("INSERT INTO github_days (day, downloads, stars) VALUES (?, ?, ?) ON CONFLICT (day) DO UPDATE SET downloads = excluded.downloads, stars = excluded.stars").bind(day(now), data.total, data.stars)
      ]);
    } catch (error) {
      console.log(`online: GitHub not reached: ${error?.message}`);
    }
  }
  if (!data) return null;
  const days = await rows(db, "SELECT day, downloads, stars FROM github_days WHERE day > ? ORDER BY day", day(now - 180 * DAY_MS));
  return { ...data, at, days };
}

// {text, level, hours}: puts one more up, next to the ones already up (MAX_NOTES at most).
async function postAnnouncement(request, db, now) {
  const body = await readJson(request);
  const text = clean(body?.text, MAX_TEXT, /[\x00-\x1f\x7f]/g);
  if (!text) return json({ error: "Write the announcement first." }, 400);
  if ((await announcements(db, now, true)).length >= MAX_NOTES) return json({ error: `${MAX_NOTES} are up already. Take one down first.` }, 409);
  const hours = Number(body.hours);
  const until = Number.isFinite(hours) && hours > 0 ? now + Math.min(hours, 24 * 90) * 36e5 : null;
  // Its ID is when it was posted; two in the same millisecond still get one each.
  const last = (await db.prepare("SELECT MAX(id) AS id FROM announcements").first())?.id ?? 0;
  await db.prepare("INSERT INTO announcements (id, text, level, until) VALUES (?, ?, ?, ?)")
    .bind(Math.max(now, last + 1), text, LEVELS.has(body.level) ? body.level : "info", until).run();
  return json({ announcements: await announcements(db, now, true) });
}

// {id}: takes that one down; the others stay up.
async function removeAnnouncement(request, db, now) {
  const id = Number((await readJson(request))?.id);
  if (!Number.isSafeInteger(id)) return json({ error: "not an announcement" }, 400);
  await db.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
  return json({ announcements: await announcements(db, now, true) });
}

async function tidy(db, now) {
  await db.batch([
    db.prepare("DELETE FROM active WHERE day < ?").bind(day(now - 400 * DAY_MS)),
    db.prepare("DELETE FROM installs WHERE at < ?").bind(now - 180 * DAY_MS),
    db.prepare("DELETE FROM consoles WHERE last_seen < ?").bind(now - 365 * DAY_MS),
    db.prepare("DELETE FROM announcements WHERE until IS NOT NULL AND until < ?").bind(now),
    db.prepare("DELETE FROM admin_failures WHERE at < ?").bind(now - DAY_MS),
    db.prepare("DELETE FROM usage WHERE day < ?").bind(day(now - 400 * DAY_MS)),
    db.prepare("DELETE FROM usage_hours WHERE hour < ?").bind(hour(now - 30 * DAY_MS))
  ]);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;
    const now = Date.now();
    const db = env.DB;
    try {
      if (pathname === "/v1/ping" && method === "POST") return await ping(request, db, now);
      if (pathname === "/v1/status" && method === "GET") return json(await answer(db, now), 200, "public, max-age=30");
      if (pathname === "/v1/event" && method === "POST") return await event(request, db, now);
      if ((pathname === "/" || pathname === "/dashboard") && method === "GET") {
        return new Response(DASHBOARD, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer" } });
      }
      if (FONTS[pathname] && method === "GET") {
        return new Response(FONTS[pathname], { headers: { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" } });
      }
      if (pathname === "/v1/admin/login" && method === "POST") return await signIn(request, env, db, now);
      if (pathname === "/v1/admin/logout" && method === "POST") return signOut();
      if (pathname.startsWith("/v1/admin/")) {
        const login = await loginOf(db);
        const scope = await sessionOf(request, env, login, now);
        if (pathname === "/v1/admin/setup/key" && method === "POST" && scope === "setup") return await setupKey(db, login);
        if (pathname === "/v1/admin/setup/finish" && method === "POST" && scope === "setup") return await setupFinish(request, env, db, login, now);
        if (scope !== "full") return json({ error: "signed out" }, 401);
        if (pathname === "/v1/admin/live" && method === "GET") return json(await live(db, now));
        if (pathname === "/v1/admin/summary" && method === "GET") {
          const days = Number(new URL(request.url).searchParams.get("days")) || 30;
          return json(await summary(db, env, now, Math.min(Math.max(Math.round(days), 7), 180)));
        }
        if (pathname === "/v1/admin/announcement" && method === "POST") return await postAnnouncement(request, db, now);
        if (pathname === "/v1/admin/announcement/remove" && method === "POST") return await removeAnnouncement(request, db, now);
      }
      return json({ error: "not found" }, 404);
    } catch (error) {
      console.log(`online: ${method} ${pathname}: ${error?.message}`);
      return json({ error: "server error" }, 500);
    }
  },
  async scheduled(controller, env) {
    await tidy(env.DB, Date.now());
  }
};

export { base32, checkPassword, tidy, toBase32, totp };
