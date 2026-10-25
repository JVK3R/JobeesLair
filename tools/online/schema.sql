-- Jobee'sLair online (0.5.2): everything the online Worker keeps, in Cloudflare D1. Apply once (and again after a
-- change; every statement is safe to repeat):
--   npx wrangler d1 execute jobeeslair-online --remote --file schema.sql

-- One row per console that shares stats. The ID is random, made by the app on first launch: not the console's
-- own ID, not the PSN account. Kept until a year after its last ping (worker.js scheduled).
CREATE TABLE IF NOT EXISTS consoles (
  id TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,  -- ms since 1970, UTC
  last_seen INTEGER NOT NULL,
  version TEXT NOT NULL,
  edition TEXT NOT NULL,        -- "store" or "homebrew"
  firmware TEXT NOT NULL,
  language TEXT NOT NULL        -- the app's language
);
CREATE INDEX IF NOT EXISTS consoles_last_seen ON consoles (last_seen);

-- Which consoles were on each day: daily, weekly and monthly users. Kept 400 days.
CREATE TABLE IF NOT EXISTS active (
  day TEXT NOT NULL,            -- YYYY-MM-DD, UTC
  id TEXT NOT NULL,
  PRIMARY KEY (day, id)
);

-- Time in Jobee'sLair, counted from the pings above (nothing more is sent for it): each UTC day's pings (one stands
-- for about five minutes open), sessions (a console's first ping after ten quiet minutes) and the most consoles
-- online at once. Kept 400 days.
CREATE TABLE IF NOT EXISTS usage (
  day TEXT PRIMARY KEY,         -- YYYY-MM-DD, UTC
  pings INTEGER NOT NULL,
  sessions INTEGER NOT NULL,
  peak INTEGER NOT NULL
);

-- The same by the hour, for the dashboard's last-two-days curve: pings (twelve are one console all hour) and the
-- most online at once. Kept 30 days.
CREATE TABLE IF NOT EXISTS usage_hours (
  hour TEXT PRIMARY KEY,        -- YYYY-MM-DDTHH, UTC
  pings INTEGER NOT NULL,
  peak INTEGER NOT NULL
);

-- Homebrew installs, with no console ID: which app, whether it worked, and the error when it didn't. Kept 180 days.
CREATE TABLE IF NOT EXISTS installs (
  at INTEGER NOT NULL,
  day TEXT NOT NULL,
  app TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT NOT NULL,
  version TEXT NOT NULL,
  firmware TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS installs_day ON installs (day);

-- The dashboard's sign-in. reset-login.mjs writes a first-time password (good for an hour); the first sign-in
-- then sets Jake's own password and authenticator key from the dashboard.
CREATE TABLE IF NOT EXISTS admin_login (
  slot INTEGER PRIMARY KEY CHECK (slot = 1),
  password TEXT NOT NULL,       -- pbkdf2$<iterations>$<salt>$<hash>, base64
  totp TEXT,                    -- the authenticator key (base32); NULL until set up
  pending TEXT,                 -- the key being set up, until its first code is typed in
  setup_until INTEGER,          -- ms: until when the first-time password works; NULL once set up
  version INTEGER NOT NULL      -- changes with every reset or setup: sessions from before stop working
);

-- The last authenticator time step used (each code works once), and when a sign-in with the right password failed
-- on its code (ten in an hour lock sign-in for everyone for the hour: someone has the password). Wrong passwords
-- are counted per address in the Worker's memory only, never here. Failures are kept a day, with no address.
CREATE TABLE IF NOT EXISTS admin_state (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_failures (
  at INTEGER NOT NULL
);

-- The announcements up now, posted from the dashboard (five at most): every app shows them in a bar under its top
-- menu, taking turns, until each is taken down or its time runs out.
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY,       -- when it was posted (ms)
  text TEXT NOT NULL,
  level TEXT NOT NULL,          -- "info" or "warning"
  until INTEGER                 -- ms; NULL until it's taken down
);

-- GitHub's public numbers for the app's repository (each release's downloads, stars), as last asked of GitHub's API
-- (worker.js githubNumbers, at most every 15 minutes while the dashboard is open), and each day's total downloads.
CREATE TABLE IF NOT EXISTS github (
  slot INTEGER PRIMARY KEY CHECK (slot = 1),
  at INTEGER NOT NULL,          -- ms: when GitHub answered
  data TEXT NOT NULL            -- JSON: {total, stars, forks, watchers, releases: [...]}
);
CREATE TABLE IF NOT EXISTS github_days (
  day TEXT PRIMARY KEY,         -- YYYY-MM-DD, UTC
  downloads INTEGER NOT NULL,
  stars INTEGER NOT NULL
);
