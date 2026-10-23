Private, per-build files that are never committed (see .gitignore).

report.json: {"reportUrl": "https://jobeeslair-report.<account>.workers.dev"}, the bug report relay (tools/report-relay)
"Report a bug" in Settings sends logs to (app/state/bug-report.js). Without it, the build has no Report a bug
button. The Discord webhook itself lives only in the relay (wrangler secret), never here: the app refuses one.
