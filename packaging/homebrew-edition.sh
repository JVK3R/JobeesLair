#!/usr/bin/env bash
# Turns a checkout into the homebrew-only edition before it is built (app/edition.js): Jobee'sLair Homebrew,
# title PPSA99472, its own repository and image. Run it on a build copy, never on the working tree:
#
#   bash packaging/homebrew-edition.sh /build/JobeesLair
#   cd /build/JobeesLair/ps5-react && python3 tools/build_ps5.py --app-dir ../app ...
#   bash packaging/make-exfat.sh <built app> JobeesLair-Homebrew.exfat JLHOMEBREW
#
# It writes EDITION = "homebrew" into app/edition.js and puts app/app.homebrew.json in app.json's place.
set -euo pipefail
root="${1:-}"
[ -n "$root" ] && [ -f "$root/app/edition.js" ] && [ -f "$root/app/app.homebrew.json" ] || { echo "usage: $0 <checkout with app/edition.js and app/app.homebrew.json>" >&2; exit 2; }
sed -i 's/^  var EDITION = "store";$/  var EDITION = "homebrew";/' "$root/app/edition.js"
grep -q '^  var EDITION = "homebrew";$' "$root/app/edition.js" || { echo "error: app/edition.js has no EDITION line to switch" >&2; exit 1; }
cp "$root/app/app.homebrew.json" "$root/app/app.json"
echo "edition: homebrew ($(grep -o '"titleId": "[A-Z0-9]*"' "$root/app/app.json"))"
