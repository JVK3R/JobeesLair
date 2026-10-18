#!/usr/bin/env bash
# Copies the project documentation into a staged copy of the built app, so the exFAT image carries it
# as /docs: the READMEs, the installation guide, the feed format, the changelog, the license, and the images
# they show.
# Run it on a copy, not on ps5-react/dist itself, whose files tools/verify.py has checked.
#
# usage: stage-docs.sh <staged-app-folder>
set -euo pipefail

app="${1:-}"
[ -n "$app" ] && [ -f "$app/eboot.bin" ] || { echo "usage: $0 <staged-app-folder> (a built PS5 app)" >&2; exit 2; }
repo="$(cd "$(dirname "$0")/.." && pwd)"
docs="$app/docs"
rm -rf "$docs"
mkdir -p "$docs/.github/readme"
for file in README.md README.ru.md INSTALLATION-GUIDE.md FEEDS.md CHANGELOG.md LICENSE; do
    [ -f "$repo/$file" ] || { echo "error: $repo/$file is missing" >&2; exit 1; }
    cp "$repo/$file" "$docs/$file"
done
# The images the READMEs reference, at the same relative paths.
for image in logo.svg logo-dark.svg logo-light.svg home.png dashboard.png settings-theme.png; do
    cp "$repo/.github/readme/$image" "$docs/.github/readme/$image"
done
echo "staged docs: $(find "$docs" -type f | wc -l) files in $docs"
