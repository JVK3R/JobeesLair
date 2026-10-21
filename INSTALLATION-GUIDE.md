# Jobee'sLair installation guide

Jobee'sLair 0.5.0 · Title ID `PPSA99471` · created by JVK3R

> [!WARNING]
> **Download only what you own or have permission to access.** You are responsible for what you
> download. Jobee'sLair hosts nothing; see the
> [Content Neutrality & DMCA Notice](README.md#content-neutrality--dmca-notice).

## What you need

- A **jailbroken PS5** with **kstuff**, running **[ShadowMount+](https://github.com/drakmor/ShadowMountPlus)**
  (it finds `.exfat` images in a `homebrew` folder and installs them).
- An **ELF loader on port 9021** (or a resident Lapy). It gives Jobee'sLair file access to `/data` and
  your USB drives. Without it the app opens but stays inside its own sandbox.
- **`JobeesLair.exfat`** from the [latest release](https://github.com/JVK3R/JobeesLair/releases/latest),
  and an exFAT USB drive, or an FTP client that can reach the console.

Tested on firmware **13.60** with kstuff and ShadowMount+. Other setups may work but are unchecked.

## Install

**USB drive:** on the top level of an exFAT drive, create a folder named exactly `homebrew`, copy
`JobeesLair.exfat` into it (unzipped, still ending in `.exfat`), and plug the drive into the PS5.

**FTP:** upload `JobeesLair.exfat` to `/data/homebrew/JobeesLair.exfat` in binary mode.

ShadowMount+ installs it within a minute and shows a notification. Then open **Jobee'sLair** from the
home screen.

Jobee'sLair has its own title ID, so it installs next to Overdrive. If an older Jobee'sLair image with
the same ID is in a `homebrew` folder, remove it first so only one image claims the ID.

## Updating

- **From 0.4.1 on,** the app updates itself: a badge with the new version appears in the top bar. Select
  it, then **Download and install** (or turn on **Settings → About → Install updates automatically**).
  Each file is checked against GitHub's SHA-256 before it is used, and if the new version doesn't start,
  the old one is put back.
- **From 0.4.0 or earlier,** install by hand once: copy the new `JobeesLair.exfat` over the old one in
  `homebrew`, then open it. (Those versions used another title ID, so an in-app update can't cross over.)
  Your **download list and play time carry over**; **settings, favorites, feeds and your TorBox API key
  start fresh**, so set them up again. The old home-screen icon can be deleted.
- **By hand at any time:** close Jobee'sLair and copy the new `JobeesLair.exfat` over the old one.

**Removing:** delete `JobeesLair.exfat` from `homebrew` first, then the home-screen icon (the other way
round, ShadowMount+ puts the icon back).

## First launch

The **Terms of Use** appear on every launch; press <kbd>✕</kbd> on **Continue**. The first start can take a
few seconds longer while the app gets file access. Open **Settings** with the gear at the right of the top
bar; <kbd>L1</kbd> <kbd>R1</kbd> switch sections and <kbd>○</kbd> goes back or closes.

## Homebrew

Select **Homebrew** in the top island. Pick an app and select **Install**: it downloads from its author's own
GitHub release.

- **Apps** go into `homebrew/`. ShadowMount+ adds them to the home screen once you **close Jobee'sLair**.
- **Payloads** are kept in `/data/JobeesLair/payloads`. Select **Run** to send one to your ELF loader
  (port 9021); run it again after each reboot, like any payload.
- **Updates:** a newer release shows as **Update** on the app's tile, and the Homebrew item in the island
  counts them. **Other files** lets you pick another file of the same release.
- **Remove** takes a payload off the console, or takes an app out of `homebrew/` (delete its home-screen
  icon if it stays).

## Phone companion

A live dashboard, games, homebrew (install, update and run it), the download queue, your feeds and a
virtual remote, from your phone. The console serves it, so there is nothing to install.

1. **Settings → Phone companion & remote access**, switch it on.
2. The first time, **choose a six-digit PIN** (repeated digits like `111111` and runs like `123456` are
   refused).
3. On a phone on the **same Wi-Fi**, open the address shown on the card (usually port `34177`) and enter the
   PIN.

Change the PIN under **Change PIN** in the same card; every phone is signed out. Wrong PINs are slowed
down and the companion locks after 20 (switch it off and on to unlock).

**While Jobee'sLair is closed (experimental):** turn on **Keep it on when Jobee'sLair is closed** in the same
card. A small helper (it needs the ELF loader on port 9021) then answers on the same address with the same
PIN whenever the app is closed: open Jobee'sLair from your phone, see the queue, and run installed payloads.
It steps aside while the app runs, and stops when you switch it off (or the console restarts; open
Jobee'sLair once to start it again).

> [!IMPORTANT]
> Anyone on your network who knows the PIN can sign in while the companion is on. Pick a PIN you don't use
> elsewhere, and keep it off on a shared network.

## Catalog feeds

A feed is a JSON file at an `http(s)` address that adds games or sources (up to 4 feeds, 2 MiB each).
The format is in **[FEEDS.md](FEEDS.md)**; add only feeds for content you have the right to download.

- **On the console:** **Settings → Catalog feeds → Add a feed**, type the full address of the `.json`
  file and confirm.
- **From your phone:** the companion's **Feeds** tab, paste the address and tap **Add**.
- **Mirrors:** add another address that serves the same feed (**Add a mirror** on the feed, up to 4). If
  the feed's own domain goes down, a refresh uses a mirror, and the last good copy stays on the console.

Feeds refresh a few seconds after launch (or **Refresh feeds**); new games show the next time you open the
app.

## Downloading

1. Open a game, choose **Download**, then pick the source and the drive.
2. Follow it on the **Downloads** page (the download icon in the top bar). <kbd>□</kbd> pauses or resumes,
   <kbd>△</kbd> opens the game page.
3. Finished games install through ShadowMount+, which waits until no game is open: **close Jobee'sLair** to
   let it finish.

The DualSense light shows the queue: slow breath = idle, green = downloading, amber = paused, red = failed
(turn it off under **Settings → Look & feel**).

**TorBox (optional):** in **Settings → Debrid providers** enter your TorBox API key and select **Test
connection**. Sources on hosts TorBox supports then get a **TorBox** button that downloads in the app with
no browser step.

## Troubleshooting

- **It doesn't appear on the home screen:** check ShadowMount+ is running, the folder is named exactly
  `homebrew` at the top level, the file still ends in `.exfat` (a PC can leave `.exfat.zip`), and give it a
  minute while the copy finishes.
- **A USB drive shows no space or won't download:** make sure the ELF loader (port 9021) was running when
  the app started, then reopen the app.
- **The phone can't open the address:** use the exact address on the card; the phone and PS5 must be on the
  same network (guest networks and "AP isolation" block it).
- **Forgot the PIN:** it is shown on the phone companion card while it is on, or choose **Change PIN**.
- **A feed failed:** `HTTP 404` means a wrong address, `Not JSON` means the address is a web page rather
  than the `.json` file, and `No usable games` means check the fields against [FEEDS.md](FEEDS.md).
- **Something else:** the app keeps a debug log at `/data/ps5-react/PPSA99471/logs/jobeeslair.log`
  (readable over FTP, with keys, tokens and addresses blanked out). Attach it to a bug report.
