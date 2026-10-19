# Changelog

What changed in each version of Jobee'sLair. Each release on
[GitHub](https://github.com/JVK3R/JobeesLair/releases) carries the full notes, the files and their
SHA-256 checksums.

## 0.4.1 (2026-10-18)

**Install this one by hand:** copy the new `JobeesLair.exfat` over the old one in `homebrew/`. Updating from
inside the app can't cross this change.

### Fixed
- **Jobee'sLair can now be installed next to Overdrive.** The two shared one app ID, so the console treated
  them as the same app and only one could be installed at a time (and they wrote to the same saved queue
  file). Jobee'sLair now has its own ID.

### Update note
- Your **download list and play time carry over**. **Settings, favorites, feeds and your TorBox API key start
  fresh**, so set them up again. The old home-screen icon can be deleted.
- This is the one update that has to be done by hand. Updates install themselves again from here on.

### Changed
- A shorter README and installation guide, with new screenshots.

## 0.4.0 (2026-10-18)

A stability release: nothing new to learn, but the app is faster, fully translated and easier to debug.

### Changed
- **Every language is complete.** The 13 translations covered only the first release's screens, so about
  half the app (Library, Make Room, link health, TorBox, browser capture, updates and more) showed in
  English. All of it is translated now.
- **A new reveal after the startup notice.** Sparks spiral into the middle of the screen, the JL mark pops
  out of them with a flash, then flies into its place in the top island as the store fades in.
- **The version is always in sight:** a small tab under the logo in the top island (`v0.4.0`), not
  only in Settings.
- **Faster catalog search and filters.** A search does about a third of the work it did, the filter sheet
  about a third when you change a filter, and nothing at all when it redraws with nothing changed.
- **Faster source lists.** Ranking a game's sources does less than half the work it did, and TorBox's list of
  supported hosts is prepared once instead of on every check.

### Fixed
- When the console's browser could not be opened for a browser capture, the download stopped with only
  "needs a web browser". The real reason is now shown.

### Added
- **A debug log** at `/data/ps5-react/PPSA99058/logs/jobeeslair.log`, readable over FTP. It is kept
  small (about 1 MB at most), and API keys, tokens, email addresses and link query strings are blanked out
  before anything is written.

### For developers
- The app's tests live in `tests/` and run with `npm test` (logic) and `npm run test:render` (screens),
  needing only Node.js 22. They run on every push and pull request, and before every build.
- The tests now also check that every language has every string with the right placeholders, and that
  no app code uses JavaScript date features the console's engine lacks (the cause of a freeze at startup
  in an early 0.4.0 pre-release).
- The download queue is split into smaller modules: browser capture (`capture-flow.js`), moving games
  between drives (`queue-moves.js`) and the checks a download passes before ShadowMount+ sees it
  (`payload-checks.js`).
- Removed leftover code for hosts the app once stopped supporting, and unused strings.

## 0.3.0 (2026-10-18)

### Added
- **No typing links with the controller.** For a host only the console's browser can get past, pass its
  check and Jobee'sLair catches the file link out of the browser by itself, checks it is the game's file,
  and downloads it in the app. A file that names no game is shown to you first. Typing the link in still
  works if a capture fails.
  - **VikingFile is back**, and many games gained sources.
  - **FileKeeper** downloads with no browser step at all.
- **Learns which hosts work on your console.** Hosts that work are marked **Auto-capture** and ranked
  first; hosts that keep failing are marked **Rarely works here** and ranked last. Nothing is hidden.
- **TorBox (optional):** add your API key in Settings → Debrid providers. Sources on hosts TorBox
  supports get a **TorBox** button, and **TorBox Instant** marks files TorBox already holds.
- **Download speed limit** in Settings: no limit, 25, 10 or 5 MB/s. App updates are never limited.
- **13.60 compatibility badges** on each source (Folder Dump, .exfat Image, FFPKG, FFPFS Image,
  Backport, and **FPKG (<=11.60)** for fake packages that don't launch on 13.60).
- **Tips under the Download button** when they matter: backport files only, DLC, a label asking for newer
  firmware, or what to do on a browser host's page.

### Changed
- Link health no longer hides sources. A link that looks gone is tagged **Broken link** and ranked
  last; one that doesn't answer is tagged **Offline**.

### Fixed
- Files whose format the catalog doesn't state are routed by their header or name. A web page sent in
  place of a game fails as "Not a game file" instead of finishing as a useless `.binary`.
- "Backport files" downloads are no longer grouped into broken multi-part sets.

Thanks to MyLuxy (Overdrive) and saawant12 (Orbit Store).

## 0.2.3 (2026-10-17)

### Added
- **Link health:** a game's download links are checked in the background (one HEAD request each, only
  while no download needs the network), and **Check link health** checks them all at once.

### Fixed
- The free-space check now also works for downloads of unknown size: it runs again as soon as the
  server reports the size, and offers Make Room if it won't fit.
- In-app updates confirm they started as soon as the app opens, and a release whose files don't match
  its tag fails once instead of looping.
- Game pages are faster: "More like this" is worked out once per game.

## 0.2.1 (2026-10-16)

### Added
- **One-click updates:** Download and install, with each file checked against GitHub's SHA-256, a
  safe swap by a small updater, and an automatic rollback if the new version doesn't start.
- **Install updates automatically**, and an update badge in the top island.
- **Support development** in Settings → About (optional; nothing is locked).

### Fixed
- Settings could freeze while feeds refreshed.

## 0.2.0 (2026-10-16)

### Added
- **Library** with art, install status and play time; **Make Room** to free space on a drive;
  **moving games between drives** with verified, resumable copies.
- **Launch diagnosis** ("Won't start · See why") and ShadowMount+ health on library tiles.
- **Download checks** before ShadowMount+ sees a game, and **backports** placed in
  `homebrew/backports/<TITLE_ID>/`.

### Changed
- Delete from disk removes everything that belongs to a download, then uninstalls it from ShadowMount+.

### Fixed
- Archives holding several images track every image, base game first.

## 0.1.0 (2026-10-16)

The first release: a catalog browser and download manager for the jailbroken PS5, with catalog feeds and
mirrors, a phone companion, a live title counter and an update check.
