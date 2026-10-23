# Changelog

What changed in each version of Jobee'sLair. Each release on
[GitHub](https://github.com/JVK3R/JobeesLair/releases) carries the full notes, the files and their
SHA-256 checksums.

## 0.5.1 (2026-10-22)

The release where far more of the catalog actually plays. Every game that comes down as an archive, which is
most of the catalog, was unpacked with files the console refuses to run: the game installed, showed up on the
home screen, and died with "Can't start the game or app". That is fixed for new downloads and for the games
already on your console. With it: a live catalog with real ratings and no duplicates, "13.60 Ready" on every
game page, AllDebrid and torrents, Report a bug, and updates that offer themselves. Pre Release 1 and 2 went to
the Discord the same day.

- **A live game catalog.** Games are now pulled from the public Pegasus catalogs (pegasus-dl.dev) and
  refreshed every three hours. A newly added game shows up the next time you open the app, with no app update
  needed. This adds about 150 games and thousands of new download links.
- Multi-part downloads from these catalogs stay grouped together, and they never save as a file called "file".
- **No more duplicate games on Browse.** The PS4 and PS5 versions of a game, and regional copies of the same
  store listing, now show as one card in every row and in the full grid. Download still asks which version you
  want, and picking PS4 or PS5 in the filters still shows that platform's copies. Search still lists every copy.
- **Top rated, for real.** Every game now has its PlayStation Store star rating (about 2,200 rated, up
  from about 100 with a Metacritic score). Top Rated sits right under Featured and ranks by stars and by how
  many people rated, so a 4.9 from 40 people doesn't beat a 4.8 from 70,000. Stars show on game cards and
  on each game's page. Ratings update with the live catalog.
- **Icons that vanished are back.** The star on every card used up the engine's 128 icon slots, so the
  button hints at the bottom, the Favorites, Downloads, Library and Settings tabs and some of the stars drew
  nothing until something scrolled away. Stars are now drawn as text and take no slot.
- **13.60 Ready, said at once.** A game's page now shows "13.60 Ready · 3 links" in green beside its rating
  (or "No 13.60 Ready links") the moment it opens, the chosen source's line leads with its tag, up to three
  other sources that run on your console sit right under it, and a plain "More download links (12)" opens the
  full list. No more opening the list to find out.
- **Updates offer themselves.** When a newer Jobee'sLair is out, the update window opens by itself at launch
  (once per release, like Prospero Store): Download and install, then Restart to apply. It comes back on its
  own once the download is ready. Close it and only the badge in the top bar stays.
- Search lists every copy of a game again (the PS4 edition had dropped out of search results in an earlier
  0.5.1 build), and a game page's "Ready" count leaves out links the check found gone.
- **Settings is calmer.** Each row shows its name and its state; what a setting does appears under it only
  while it is selected. The paragraphs about debrid, feeds, the credits and the legal notice are folded
  behind a row or gone.
- **Clear finished and Cancel all** at the top of the Downloads page. Cancel all asks for a second press.
- The Downloads page scrolls all the way back to the top again. With two rows of cards in a section it stopped
  short, leaving the library band and the telemetry cut off.
- A card's focus frame no longer blinks on every step along a row: it is solid from the first frame, and on
  the wide Featured cards it now lifts and grows with the card instead of staying put under it.
- Side sheets (sources, options, "Why won't it start?", Make room) slide out as they close instead of
  vanishing, and the hero banner crossfades to the next game instead of cutting.
- **The screen saver fills the screen again.** An earlier 0.5.1 build drew its pictures at 1280 x 720 in the
  middle of the screen. While a game extracts it shows one picture at a time, which is what the memory then
  allows.
- **The screen saver skips a picture it can't show** (a host not answering, or no memory to decode it while a
  game extracts) instead of leaving the screen black.
- **AkiraBox fixed.** Many AkiraBox links were labelled "part 1, 2, 3" when they were really separate whole
  files (Astro Bot USA: two complete RARs and an FFPKG), so the download waited for a "part 1" that didn't
  exist. Links are now grouped by their real file names.
- **Rootz downloads without the browser.** Rootz links (about 1,800 in the live catalog) now go straight to
  the file instead of opening the browser.
- **"Ready" fits your firmware.** On 11.60 or lower, PS5 fake packages start, so those games count as ready
  too, and the row and filter say "Ready for 9.60" (or whatever your console runs). On 13.60 nothing changes.
- **Cancel works while a game extracts.** Cancelling during extraction could hang on "Pausing…" forever, and
  a retry afterwards could fail with "Staging belongs to another extraction". Both are fixed.
- **Deleting a game no longer holds up your other downloads.** Downloads pause only for the moment ShadowMount
  is asked about the game, not for the minutes a big game's files take to delete. Deleting a download also
  removes its half-extracted files, which used to be left behind.
- **The screen saver no longer runs out of memory** while a game extracts.
- **Games packed beside a backport folder install.** A download holding the game folder next to a "backport"
  folder (Assassin's Creed Black Flag Resynced) stopped at "Extracted" and never reached ShadowMount. The game is
  now found and installed, and the backport is kept aside. A download already stuck there gets an Install button.
- **AllDebrid support.** Add your AllDebrid API key in Settings → Debrid providers, next to TorBox. Sources it
  supports get a download button that skips the browser. If both keys are set, TorBox is used.
- **Extracted games start.** A game folder unpacked from an archive could not be started: the home screen said
  "Can't start the game or app" with every file in place and nothing in ShadowMount's log past "sandbox ready".
  The extractor wrote files without the execute bit, and the console refuses to run an eboot.bin without it.
  Extracted files are now rwxrwxrwx like everything copied over FTP, a game folder is opened when it is put in
  place, and games installed by earlier builds are opened each time the app starts. Fakelibs had nothing to do
  with it. (Minecraft Dungeons, Assassin's Creed IV Black Flag.)
- **Jobee'sLair Homebrew, a build of its own.** The Homebrew section can be built alone (`packaging/homebrew-edition.sh`,
  `app/edition.js`): Jobee'sLair Homebrew, title PPSA99472, with its own dock (Homebrew and Settings), its own
  repository for updates and its own image, installing beside the store. Its index now lives and refreshes in
  [JVK3R/JobeesLair-Homebrew](https://github.com/JVK3R/JobeesLair-Homebrew), which every build reads.
- **Torrents through debrid.** A feed can list a magnet link as a source. With a TorBox or AllDebrid key set
  it downloads in Jobee'sLair: the service fetches the torrent, the console downloads from it at full speed,
  and "TorBox Instant" marks torrents TorBox already holds. A one-file torrent downloads as that file; a folder
  dump of many files comes as one zip through TorBox and extracts like any archive. Without a key, the Torrents
  section says what to add. See FEEDS.md.
- **New this week.** A row on Browse with the games the live catalog added in the last seven days, best rated
  first.
- **Report a bug.** Settings → About → Report a bug sends your logs to the Jobee'sLair Discord in two presses.
  They go through a small relay (tools/report-relay) that holds the channel's webhook, so no build carries it.
  Keys and passwords are blanked out.
- **Turn off fakelibs per game.** Many backported downloads bring their own fakelibs (system libraries for
  older firmware), and on a console new enough for the game they can make it crash (CE-107098-5). Open the
  game in the Library, press Options, and turn them off; it applies the next time you start it. "Why won't it
  start?" points to this when a game loaded its own fakelibs.

## 0.5.0 (2026-10-20)

The biggest Jobee'sLair update yet.

### New

- **Homebrew section.** Browse and install 200+ PS5 apps and emulators (PS5SX2, Stremio, RetroArch and more) straight from their authors' own releases. Updates show up on their own, and installed apps appear in your Library with their name and picture.
- **Helpers for emulators.** Apps that need a payload loaded first (PS5SX2, XPSemu, Ruffle, VITA5) get it installed with them. Press **Run helper** on the app's page after each console restart.
- **New phone companion.** Scan the QR code in Settings → Phone companion to watch your downloads, manage the queue, run payloads and send a log if something goes wrong, all from your phone.
- **New search.** A cover grid with Games and Homebrew tabs and a pop-up keyboard.
- **"Ready for 13.60" row and a Format filter.** Find games by folder dump, .exfat, FFPFS, backport or fPKG.
- **Downloads in parts keep going on their own.** The next part's link is grabbed while the current one downloads, and parts that need the browser open by themselves.
- **Sizes before you download**, even when the catalog doesn't list one.
- **Screen saver** after 10 minutes idle, showing how your download is going.
- **Settings is its own section**, with categories down the side.
- **A home-screen background.** Hover Jobee'sLair on the PS5 home screen to see its new art.

### Fixed

- **ShadowMount no longer says "Device busy" after you close Jobee'sLair.** It releases the app a few seconds after it closes, so refresh, unmount and delete work without reloading ShadowMount.
- The **✕** on a finished download only clears the card. It no longer uninstalls the game.
- Homebrew apps that closed straight away ("Couldn't start app or game") now start.
- Top Rated, New Releases and Favorites work from the Search page.
- A download in parts that finished but wouldn't extract ("missing parts") now says which part is a copy, and Retry re-downloads just that part.
- Settings no longer freezes when you change phone companion options.
- Pages scroll all the way back to the top.

The pre-release notes below list every change in detail.

## 0.5.0 Pre Release 4 (2026-10-19)

### Added
- **A QR code for the phone companion.** Settings → Phone companion shows the address as a QR code: point the
  phone's camera at it instead of typing an IP.
- **Report a problem from your phone.** The phone page's Home has **Share log**, **Save log** and **Copy log**:
  the console's debug log (keys, tokens and e-mail addresses already blanked out), ready to send with a bug
  report on Discord. No FTP needed.
- **The next part gets ready while one downloads.** In a download in parts, when a part starts downloading and
  the next one needs the browser, its browser opens after the 10-second countdown (Wait stops it) and its link
  is captured right away, so the set goes on to it without stopping. A link that expired by then asks for the
  browser again, as before.
- **Sizes before you download.** A source the catalog lists without a size shows the one its file link reports
  when the background link check reaches it.
- **A screen saver.** After 10 minutes without a button press, a slideshow of the most popular games'
  screenshots (from their own store pages, loaded like the store's art), the time, and how a download is going.
  Any button brings you back. Off, or shown now, in **Settings → Look & feel**.
- **"What's new in 0.5.0"**, shown once after the store first comes up.
- **A background on the PS5 home screen.** Hover Jobee'sLair there and it now shows its own art behind it (a
  4K picture, `pic0.dds`, the same kind PS5SX2 and Prospero ship), not just the icon.

### Fixed
- **The ✕ on a finished download no longer uninstalls the game.** In the Downloads list it now only clears the
  card (for installed, downloaded and failed-to-install items); the game stays in the library, where deleting
  it is done. A card still downloading, paused or failed keeps its Cancel, which deletes its partial files. The
  phone's Clear works the same way.
- **Top rated, New releases and Favorites did nothing when pressed from the Search page.** The search page's
  sort menu used the same focus name as the store's, so the header's buttons sent focus to a page that was
  closing. Leaving Search through those buttons also put back the filters you had before searching,
  undoing the Favorites button. Both fixed.
- **Homebrew apps that closed as they opened ("Couldn't start app or game"): PS5SX2, the Wii U / 3DS / DS
  emulator (PS5CEMU-HAR) and others.** ShadowMount mounted them but the console never ran them: the app
  folders were unpacked as `rw-rw-rw-`, and the console can't start an app it can't execute. Prospero and an FTP
  copy leave every file `rwxrwxrwx`; Jobee'sLair now does the same when it installs an app, and opens the
  folders of apps it installed earlier once, the next time it starts.
- **Installing a homebrew app no longer throws you down its page** when the install starts and when it
  finishes. The Install button turned into a different button each time, so focus jumped to whatever was nearest
  below; it is now the same button throughout.
- **ShadowMount said "Device busy" after Jobee'sLair closed, and wouldn't refresh, unmount or delete until it
  was reloaded.** Every launch left its sandbox folder behind with `/data` still mounted in it (three stacked
  aliases), and ShadowMount waits for that folder to go before it lets go of the title. A small helper
  (`sandbox-sweeper.elf`) now waits for the app to close, takes those aliases down and removes the empty
  folders, so ShadowMount releases Jobee'sLair a few seconds after it closes. It only unmounts aliases, only
  removes empty folders, stops if the app opens again, and logs to `/data/ps5-react/PPSA99471/logs/sandbox.log`.
- **"Device busy" in ShadowMount after installing, updating or removing a homebrew app.** Jobee'sLair renamed
  and deleted the app's folder while ShadowMount still had it mounted, leaving a stale mount that made every
  refresh and unmount answer "Device busy". ShadowMount is now asked to let go of the app first.
- **Helpers.** Apps that need a payload loaded first (PS5SX2, XPSemu, Ruffle, VITA5) now get it installed with
  them. On the app's page, **Run helper** works only once the app is on the home screen (ShadowMount has
  mounted it), it says when it was last run and to run it again after every console restart, and **Remove
  helper** deletes its file, and **Install helper** brings it back (the button used to vanish with it, leaving
  no way to run the helper again). (A helper already running can't be stopped from the app: it ends when the console
  restarts.) Apps that need other setup (PSXS5, PSP5, 5S2CD, Prospero Multi Tools, PS5CEMU-HAR) say so on
  their page.
- **Homebrew apps in the library show their name and picture** (PS5SX2, Stremio and the rest) instead of a
  file name and an empty tile. Jobee'sLair's own image is no longer listed there, so it can't be deleted by
  mistake.
- **A homebrew app deleted by hand** (FTP, the library) is no longer listed as installed.
- **On the phone, Share log and Copy log now work.** The log is fetched ahead, because a phone only shares or
  copies from the tap itself, and over a plain http address (the console's) the browser has no share sheet:
  those buttons then open the log on screen, ready to select, with a Save button.

### Changed
- **A shorter startup notice.** The terms of use that open the app are now three plain sentences (free and
  open source, hosts no games or files; download only what you own or may use; no warranty) and "By
  continuing, you agree to these terms", without the shouted headings.

## 0.5.0 Pre Release 3 (2026-10-19)

Fixes from the first beta testers, games by format, a new search and Settings, and the Homebrew list from
nexgen999's PS5 Repository List.

### Fixed
- **Getting stuck in Settings.** Turning the phone companion's switches on or off (or changing the PIN) made
  the app wait for the closed-app helper's answer, and the whole app froze, sometimes for many seconds:
  nothing moved and Circle did nothing. It no longer waits. Dialogs opened from Settings also give focus back
  to the row they came from.
- **A download in parts that finished but would not extract ("missing parts").** On a browser host, the
  link of the part before could be captured again for the next part, so one part was downloaded twice and
  another not at all. A captured file whose name says it is another part is now refused, and the capture
  keeps watching for the right one. A set that already has a copied part now names it ("Part 4 is a copy of
  part 3"): **Retry** downloads that one part again, not the whole set.
- **Pages that would not scroll back to their very top.** Going up now always shows the title or header
  above the first button, on every page.
- **The donation QR code can be scanned.** Opening it in Settings → About now scrolls the whole code into view
  and keeps it there; before, scrolling either way cut half of it off.

### Added
- **"Ready for 13.60":** a new row on Discover with every game that has a folder dump or a disk image, what
  ShadowMount+ runs on 13.60 (648 of them in the bundled catalog). **See all** opens them in the library.
- **A Format filter** in the store's filter sheet and on the search page: 13.60 Ready, .exfat Image, FFPFS
  Image, Backport, FPKG. It sorts each game's sources with the same rules as the badges on its sources.
- **Parts continue by themselves.** When a download in parts reaches a part that needs the browser, the
  browser opens for it after a 10-second countdown on its card (**Wait** stops it). Turn it off in **Settings
  → Downloads**. The card's button opens the browser for that part directly.
- **From your phone:** a part waiting on the browser has an **Open on console** button, and the phone shows
  which part is downloading.
- Download cards show the **file's format** (from the file itself once it starts) and **which part** of a set
  is downloading.

### Changed
- **Settings is a section** like Downloads and Library: the gear in the island, or L1/R1, opens it, and
  Circle goes back. Its categories are on the left (Phone companion, Downloads, Catalog feeds, Debrid,
  Look & feel, Guide, About), their settings on the right.
- **A new search page, built on the store's cover grid.** The search field with **Games | Homebrew** tabs,
  then chips for 13.60 Ready, each format and favorites, the filter sheet and the sort, then the results as
  covers. The keyboard pops up over the bottom while you type and closes when you search (R2) or press Circle,
  so the results get the whole screen; Triangle brings it back.
- **The Homebrew list comes from nexgen999's PS5 Repository List**, with his permission. A project he adds shows up
  in Jobee'sLair within hours (the list is checked every six hours instead of once a day), sorted into our
  categories. His credit is in the Homebrew section's header, its footer and the README. YouTube Max'd is the
  first new app it brought.

## 0.5.0 Pre Release 2 (2026-10-19)

The first fixes from testing Pre Release 1 on a console, and a clearer, easier interface.

### Fixed
- **Homebrew rows scroll sideways again.** Each row had grown as wide as all its apps, so there was nothing
  to scroll and the apps past the edge could not be reached.
- **An app's page in Homebrew scrolls all the way back to the top.** Going up stopped at its buttons.
- **The phone companion no longer asks for a PIN it then refuses.** When Jobee'sLair closed, the phone's page
  showed the PIN card from the closed-app helper, took the PIN, then stayed on the card. It now switches to the
  helper's page by itself, and back to the full companion when the app opens again.
- **Pictures that never appeared** in Homebrew ("the engine image registry is full" in the log). The engine
  now keeps room for them, and a picture refused that way is asked for again instead of given up.
- The closed-app helper now confirms it started (a system library's own log line came back first, in place of
  its answer).

### Changed
- **Stay signed in on your phone.** A phone that signed in stays signed in when Jobee'sLair restarts and when
  the closed-app helper takes over. Changing the PIN still signs every phone out.
- Wrong PINs on the closed-app helper no longer freeze it for everyone while it waits; three are free, then
  each try waits a little longer.
- **Homebrew has its own color** (green, or amber with the emerald theme): the island item and the pill under
  it, the section's new header, its rows, chips, buttons and focus. The store keeps the theme's color, so you
  always know which side you are on.
- **"Where you are" at the bottom left:** the bar under every store and Homebrew page starts with GAME STORE or
  HOMEBREW, in that side's color.
- **The island's icons say what they are:** focusing favorites, downloads, the library or settings shows its
  name under it.
- **Homebrew rows end with a "See all" tile**, show how many apps they hold, and "Most popular" and "Fresh
  releases" open the whole list sorted that way.
- **Sort any Homebrew grid with Square** (most popular, newest release, A–Z); **Triangle** goes back to the top.
- An app's page shows where it is (Homebrew › category), and grows to fit its buttons instead of cutting them.

## 0.5.0 Pre Release 1 (2026-10-19)

A test build of 0.5.0: the Homebrew section and a new phone companion. Not a release yet.

### Added
- **Homebrew, its own section next to the store** (the new **Homebrew** item in the top island, or
  <kbd>L1</kbd>/<kbd>R1</kbd>). 210 open-source PS5 apps, emulators, ports, players and payloads, each with its
  own icon, banner and screenshots, in 13 categories, with search. Every one installs straight from its
  author's own GitHub release; Jobee'sLair hosts none of them.
  - **Apps** (a disk image, or an app folder in a .zip) go into `homebrew/`, where ShadowMount+ puts them on
    the home screen once you close Jobee'sLair.
  - **Payloads** (.elf/.bin) are kept on the console and run through your ELF loader with **Run**.
  - **Updates:** a newer release of anything you installed shows as **Update** on its tile and as a count on
    the island's Homebrew item. Apps you installed by hand are recognised too.
  - The list refreshes itself every day from this repository, so new releases arrive without a new
    Jobee'sLair.
- **A new phone companion.** Five tabs: **Home** (the download in progress on a live ring with its speed
  graph and time left, the queue, the drives, homebrew updates with **Update all**, shortcuts on the
  console, and the catalog feeds), **Games**, **Homebrew** (browse, install, update and run homebrew from
  your phone), **Queue** and **Remote**.
- **The phone page while Jobee'sLair is closed** (experimental, off by default: **Settings → Phone companion
  → Keep it on when Jobee'sLair is closed**). A small helper answers on the same address with the same PIN:
  open Jobee'sLair from your phone, see the queue, and run installed payloads.

### Changed
- The store's Homebrew row is now a banner that opens the Homebrew section.

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
