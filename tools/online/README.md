# Jobee'sLair online

A Cloudflare Worker with a D1 database at **https://api.jobees.org**, behind the app's online features
(app/state/online.js) and the dashboard at **https://api.jobees.org/dashboard**:

- **Stats.** With "Share anonymous stats" on (Settings, About; on by default), the app pings every five minutes while
  it's open with a random ID made on that console, its version and edition, the firmware and the language. Homebrew
  installs send which app and whether it worked (the error when it didn't), without the ID.
- **The live count**, shown in the app's bottom bar and in Settings, About.
- **Time in Jobee'sLair**, counted from those same pings (nothing more is sent): each day's and each hour's totals of
  time open, sessions and the most consoles online at once, with no console ID.
- **GitHub's public numbers** for the repository (each release's downloads, stars), asked of GitHub's API at most
  every 15 minutes while the dashboard is open, and each day's total for the downloads chart. An optional
  `GITHUB_TOKEN` secret only raises GitHub's hourly limit.
- **Announcements**, posted from the dashboard: up to five at once, one line each (140 characters). Every app shows
  them in a bar under its top menu on every section, taking turns (warnings first), until each is taken down from
  the dashboard or its time runs out. Settings, About shows them whole. Apps ask once a minute while they're open
  (sending nothing about the console), so a post or a take-down shows within about a minute.

Never stored: IP addresses (the limits against floods hold one in the Worker's memory for an hour at most), the
console's own ID, PSN names, anyone's games or downloads. `schema.sql` is everything stored and for how long; a
nightly run drops the rest.

## Deploy (once)

    cd tools/online
    npx wrangler login
    npx wrangler d1 create jobeeslair-online         # put the database_id it prints into wrangler.toml
    npx wrangler d1 execute jobeeslair-online --remote --file schema.sql
    npx wrangler deploy                              # also makes api.jobees.org
    node reset-login.mjs                             # opens the dashboard's first-time setup for an hour

After a change to `worker.js` or `dashboard.js`: `npx wrangler deploy`. After a change to `schema.sql`: the
`d1 execute` line again (every statement is safe to repeat).

## Signing in to the dashboard

The first time, sign in with the temporary password `password` (`node reset-login.mjs <other>` for another one)
within the hour. The dashboard then asks for your own password, shows a QR code to scan with Google Authenticator
(or any authenticator app), and takes the 6-digit code it shows. From then on, signing in takes your password and a
current code. Passwords are kept as PBKDF2 hashes; a sign-in lasts 12 hours, in a cookie the page's scripts can't
read; each code works once. Ten wrong passwords in an hour turn away only the address they came from, so nobody can
lock you out by guessing. Ten wrong codes after the right password lock sign-in for everyone for the hour: only
someone with your password gets that far.

## If something goes wrong

- **The password leaked, or the phone with the authenticator is lost:** `node reset-login.mjs`, then the setup
  again. Everyone signed in is signed out and the old password and key stop working.
- **Locked out by wrong codes:** someone typed your password, so treat it as leaked: `node reset-login.mjs`, then the
  setup again. If it was you, wait an hour, or
  `npx wrangler d1 execute jobeeslair-online --remote --command "DELETE FROM admin_failures"`.
- **Junk in the stats:** the online count is in every app's bottom bar, so a ping is counted for at most 40 consoles
  from one address in five minutes, and events are taken 60 an hour from one address (counted in the Worker's memory,
  never written). The worst junk can do is nudge the count and skew a chart.
  `npx wrangler d1 execute jobeeslair-online --remote --command "DELETE FROM ..."` cleans it.
- **The Worker is down:** the app keeps working as before; it just shows no count or announcement.
