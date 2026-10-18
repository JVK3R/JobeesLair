# Jobee'sLair installation guide

Jobee'sLair 0.3.0 · Title ID `PPSA99058` · created by JVK3R

This guide takes you from the `.exfat` image to a working install. It then covers pairing your
phone with the companion (port `34177`, a PIN you choose) and adding your own JSON catalog feeds
with mirrors.

> [!WARNING]
> **Download only what you own or have explicit permission to access.** Jobee'sLair downloads
> files directly to your console from the sources you add. You are responsible for what you
> download and for following the law where you live. The developer does not host or distribute any
> copyrighted content; see the [Content Neutrality & DMCA Notice](README.md#content-neutrality--dmca-notice),
> which also says how to report an infringing feed or catalog entry.

- [1. What you need](#1-what-you-need)
- [2. Deploy the .exfat image](#2-deploy-the-exfat-image)
- [3. First launch](#3-first-launch)
- [4. Pair the phone companion](#4-pair-the-phone-companion)
- [5. Configure custom JSON feeds](#5-configure-custom-json-feeds)
- [6. Downloading and installing](#6-downloading-and-installing)
- [7. Updating and removing](#7-updating-and-removing)
- [8. Troubleshooting](#8-troubleshooting)

## 1. What you need

- **A jailbroken PS5** with **kstuff** loaded.
- **[ShadowMount+](https://github.com/drakmor/ShadowMountPlus)** running. It finds `.exfat` images
  in a `homebrew` folder and installs them, and it shows a notification when it starts.
- **An ELF loader on port 9021** (or a resident Lapy). Jobee'sLair asks for console-wide file
  access when it starts, so it can save downloads to `/data` and your USB drives. Without it the
  app still opens but stays inside its own sandbox.
- **`JobeesLair.exfat`**, the release image or one you built yourself (see the
  [README](README.md#build-it-yourself)).
- **A USB drive formatted as exFAT** and a PC, *or* an FTP client that can reach the console.
- For the phone companion: **a phone on the same network** as the PS5.

The file-access setup this app relies on has been confirmed on firmware **13.60 with kstuff and
ShadowMount**. Other firmware and loader combinations may work but have not been checked.

## 2. Deploy the .exfat image

### Option A: USB drive

1. Plug the USB drive into your PC.
2. At the **top level** of the drive, create a folder named exactly **`homebrew`** (all lowercase).
3. Copy **`JobeesLair.exfat`** into it, unchanged. Do not unzip it or rename its `.exfat` ending.

   ```text
   USB drive
   └── homebrew
       └── JobeesLair.exfat
   ```

4. Eject the drive safely and plug it into the PS5.
5. Wait. ShadowMount+ checks for new files every few seconds, mounts the image and installs it. A
   notification tells you when it is done. There is nothing to click.

### Option B: FTP to internal storage

1. Start your FTP payload on the PS5 and connect to it from your PC.
2. Create the folder `/data/homebrew` if it does not exist.
3. Upload `JobeesLair.exfat` to **`/data/homebrew/JobeesLair.exfat`** in binary mode.
4. ShadowMount+ installs it the same way.

> [!NOTE]
> Jobee'sLair uses title ID `PPSA99058`. If an older image with the same title ID is in a
> `homebrew` folder, delete it first so only one image claims the title. That includes an earlier
> Jobee'sLair build.

## 3. First launch

1. Open **Jobee'sLair** from the home screen.
2. The launch sequence plays for under three seconds: the red and dark-red **JL** mark scales into the
   center of the screen while a few monospace lines report the startup (version, whether a phone PIN
   is set, and how many titles are indexed).
3. The **Terms of Use & Legal Notice** follows on every launch. It names the creator, says the
   author takes no responsibility for misuse or hardware modification, and asks you to use the tool
   only for content, homebrew and backups you legally own or have permission to access. It stays on
   screen until you press <kbd>✕</kbd> on the **Continue** button, which is already selected. Then it
   opens the store. <kbd>○</kbd> does not skip it. Launching and
   using Jobee'sLair counts as agreeing to these terms.
4. On the first start it can take a few seconds longer while the app gets file access from the ELF
   loader.
5. Open **Settings** with the gear icon at the right end of the navigation dock at the top. Use <kbd>L1</kbd> and
   <kbd>R1</kbd> to move between sections, and <kbd>○</kbd> to close Settings.

## 4. Pair the phone companion

The companion lets your phone do the following:
- Browse and queue downloads.
- Watch the queue and drive space live.
- Pause, resume and cancel jobs.
- Manage feeds.
- Act as a virtual remote.

It is served by the console itself, so there is no app to install.

### Turn it on

1. On the PS5, open **Settings → Phone companion & remote access**.
2. Switch **Phone companion** on.
3. **The first time, you choose a PIN.** A keypad opens: enter six digits, then enter them again to
   confirm. Use <kbd>✕</kbd> for a digit, <kbd>□</kbd> to delete one and <kbd>○</kbd> to cancel (the
   companion then stays off). Repeated digits (`111111`) and straight runs (`123456`) are refused.
4. The status chip goes from *Starting* to *Live*, and the card shows the address to open, such as
   **`http://192.168.1.50:34177/`**, and your PIN.

The companion listens on port **34177**. If another program already uses that port, it falls back
to 8080 and then to any free port. **Always use the address the card shows.** The setting and your
PIN are remembered on the console, so the companion starts again on the next launch with the same
PIN, and you are never asked again unless you change it.

A phone cannot set or change the PIN, and the companion never starts without one, so nobody on your
network can claim a console that has not chosen a PIN yet.

### Sign in from the phone

1. Connect the phone to the **same Wi-Fi network** as the PS5.
2. Open the address from the card in the phone's browser, for example
   `http://192.168.1.50:34177/`.
3. Enter your PIN. It signs in as soon as the sixth digit is typed.
4. The tabs appear:
   - **Games**: search the catalog and queue a download.
   - **Queue**: live progress, speed and drive space, with pause, resume and cancel.
   - **Feeds**: add, edit, remove and sync catalog feeds, and add mirrors to them.
   - **Remote**: a virtual D-pad and buttons, plus shortcuts to Home, Downloads, Search and Settings.

### About the PIN

- The PIN is the one **you chose**. It is kept in the console's settings, never generated or reset on
  its own, and stays the same across launches and reboots.
- To change it, open **Settings → Phone companion & remote access → Change PIN** and enter a new one
  twice. Every phone is signed out and must use the new PIN. Switching the companion off and on does
  **not** change or ask for it.
- The first 3 wrong PINs are free. After that, each attempt waits 2, 4, 8, 16 and then 30 seconds.
- After **20 wrong PINs** the companion locks. To let phones sign in again, switch it **off and on**
  in Settings.
- A phone stays signed in until the companion is switched off or the app closes.

> [!IMPORTANT]
> **Anyone on your network who knows your PIN can sign in** while the companion is on. Choose a PIN
> you do not use anywhere else, use the companion on a home network you trust, and switch it **off**
> in Settings when you are not using it or when the console is on a shared network.

## 5. Configure custom JSON feeds

A **catalog feed** is a JSON file at an `http://` or `https://` address. It adds games, or more
sources for games the catalog already lists. Jobee'sLair takes **up to 4 feeds**, each at most
**2 MiB**. The full format is in **[FEEDS.md](FEEDS.md)**.

> Add only feeds that point to content you have the right to download, such as your own backups,
> homebrew and freeware.

### Write a feed

The smallest valid feed is a version, a name and a list of games. Each game needs an ID, a title
and one release with a `url`:

```json
{
  "version": 1,
  "name": "My homebrew",
  "games": [
    {
      "id": "PPSA01234",
      "title": "My Homebrew App",
      "releases": [
        { "url": "https://example.com/files/my-homebrew.pkg", "sizeBytes": 52428800, "version": "1.00" }
      ]
    }
  ]
}
```

- `id` must be a title ID in the form `CUSA#####` or `PPSA#####`.
- Add `sizeBytes` so the app can check space before downloading, and `sha256` so it can verify the
  file afterwards.
- Anything malformed is skipped field by field. A game with no usable release is dropped, and a
  feed with no usable games is refused with a reason.

### Host it

Put the file anywhere the console can fetch it:
- A raw file link on GitHub or another file host.
- Your own web server.
- A simple HTTP server on a PC on your network, such as `http://192.168.1.20:8000/feed.json`.

Use the **full address of the `.json` file** itself, not just the site.

### Add it with the controller

1. **Settings → Storage & feeds → Add a feed**.
2. Type the full address on the on-screen keyboard and confirm.
3. The feed row shows *Refreshing…*. Then it shows how many games it brought, or why it failed (for
   example `HTTP 404` or *Not JSON*).

### Or add it from your phone

1. Sign in to the companion (see section 4) and open the **Feeds** tab.
2. Paste the address and tap **Add**. **Edit** changes a feed's address in place, and **Sync all**
   refreshes every feed.

### Add mirrors (so a feed survives a takedown)

A **mirror** is another address that serves the same feed. If a feed's own domain is taken down, a
refresh tries its mirrors instead, and when every address is down the console keeps the last good
copy, so your games do not disappear.

- A feed can list its own mirrors, with a `"mirrors": ["https://…/catalog.json"]` entry (see
  [FEEDS.md](FEEDS.md)); Jobee'sLair picks them up automatically.
- You can add your own: select a feed in **Settings → Storage & feeds** and choose **Add a mirror**
  (up to 4 per feed), or tap **Add mirror** on the feed in the phone's **Feeds** tab. The same menu
  removes a mirror or the feed.
- The address that worked last is tried first, so a dead domain does not slow every refresh. The feed
  row shows *via* the mirror that served it.
- Publish the same feed on more than one host (a code host, your own server) and list each as a
  mirror: that is the whole trick.

### Refresh and see the new games

- Feeds refresh in the background a few seconds after the app opens. You can also choose
  **Refresh feeds** in Settings, or **Sync all** on the phone.
- The console keeps the last good copy of each feed, so a feed that goes offline keeps its games.
- New or changed games appear **the next time you open Jobee'sLair**. Settings tells you when a
  restart is needed.
- To remove a feed, select it in **Storage & feeds** and choose **Remove feed** in its menu.
- The **counter** in the navigation dock (and on the Downloads page) shows how many titles are
  indexed and how many of them have a direct download, across the bundled catalog and all your
  feeds. It updates as soon as a feed refreshes or a mirror answers in place of the feed.

**Settings → Source Addition Guide** walks through the same steps on the console.

## 6. Downloading and installing

1. Open a game and choose **Download**. Pick the source and the drive (internal storage, a USB
   drive or an extended drive) when asked.
2. Follow it on the **Downloads** page (the download icon in the navigation dock):
   - The band at the top shows live throughput, overall progress, time left, counts by state and
     free space per drive.
   - Each download is a card with its state, percentage, meter, speed and controls.
   - <kbd>□</kbd> pauses or resumes the focused download, and <kbd>△</kbd> opens its game page.
   - **Cancel** asks for a second press before it deletes anything.
3. With the **status light** on, the DualSense light bar shows the queue:

   | Light | Meaning |
   | --- | --- |
   | Slow breath in your accent color | Idle |
   | Green, brighter as it progresses | Downloading |
   | Steady amber | Paused |
   | Red flash, then steady red | A download failed |

   You can turn the status light off in **Settings → Theme & Light Bar**. The same card holds the
   six accent colors, saved for each PS5 user profile. A new accent fills the whole store when you
   close Settings.
4. Finished packages install through ShadowMount+, which waits until no game is open. **Close
   Jobee'sLair** to let it finish. The new title appears on the home screen.

## 7. Updating and removing

**Update check:** Jobee'sLair looks at the latest release of
[JVK3R/JobeesLair](https://github.com/JVK3R/JobeesLair) when it starts and every 24 hours while it is
open. When a newer version exists, a **badge with the version** appears in the navigation dock;
select it to read what changed. **Settings → About → Check for updates** asks right away. A failed
check (no network, no release yet) changes nothing.

**Installing from the app (0.2.1 and later):** in the update dialog, select **Download and
install**. Jobee'sLair downloads the release's `update.zip` and `JobeesLair.exfat` in the background:

- Each file is checked against the size and SHA-256 that GitHub publishes for it.
- `update.zip` must name this title and the release's version before the image is kept.
- The files are staged on the same drive as the installed image, in
  `JobeesLair/update_staging/<version>/`. For internal storage that is
  `/data/JobeesLair/update_staging/`. The staged image is named `JobeesLair.exfat.staged`, so
  ShadowMount+ never installs it as a second copy.
- The download waits while your game downloads run, and gives way when you queue a new one. The
  dock's badge shows its progress.

When it is checked, the badge and the dialog say **Update ready – Restart app to apply**. Select
**Restart to apply** and Jobee'sLair closes. The updater then:

1. waits until ShadowMount+ has let go of the old image;
2. puts the new image in its place (the old one is kept as `JobeesLair.exfat.previous`) and asks
   ShadowMount+ to rescan;
3. opens Jobee'sLair again.

If the new version closes before it has finished starting, the updater puts the old image back and
opens that instead, and the dialog says why.

With **Settings → About → Install updates automatically** on, a new version downloads as soon as the
check finds it, and goes in the next time you close Jobee'sLair.

This needs the ELF loader on port 9021, which also gives the app its file access. It also needs
ShadowMount+ to release images when a game closes, which is its default. With
`persistent_image_mounts=1` the updater changes nothing and says so. The updater's log is
`/data/JobeesLair/update/updater.log`.

**Updating by hand:** download `JobeesLair.exfat` from the release page, close Jobee'sLair and copy
the new file over the old one in the same `homebrew` folder. ShadowMount+ installs the new image.
Either way, your settings, PIN, feeds, theme and download queue live in the console's data storage,
outside the image, so they carry over. (They are kept in a folder named `JobeesLair`; earlier test
builds used `overdrive`, and anything found there is still read the first time.)

**Removing:** delete `JobeesLair.exfat` from the `homebrew` folder **first**, then delete the icon
from the home screen. In the other order, ShadowMount+ finds the file again and puts the icon back.

## 8. Troubleshooting

**Jobee'sLair does not appear on the home screen**
- Check that ShadowMount+ is running. It shows a notification when it starts.
- The folder must be named exactly `homebrew` and sit at the top level of the drive.
- The file must still end in `.exfat`. A PC that hides extensions can leave it as
  `JobeesLair.exfat.zip`.
- Give it a minute. ShadowMount+ waits until the file has finished copying.

**Downloads cannot reach my USB drive, or the drive shows no space**
- Make sure the ELF loader (port 9021) was running when the app started, then reopen the app.
- The app reads drive space in the background. A drive that is waking up shows "—" for a few
  seconds instead of freezing the screen.

**The phone cannot open the companion address**
- The phone and the PS5 must be on the same network. Guest networks and "AP isolation" block this.
- Use the exact address in Settings, including the port. It may not be 34177 if that port was busy.
- If Settings says *Connect the console to a network*, the console has no network address yet.

**The phone says "Too many wrong PINs"**
- Switch the companion off and on in Settings, then enter your PIN.

**I forgot my PIN**
- Open **Settings → Phone companion & remote access**: the PIN is shown on the card while the
  companion is on. You can also choose **Change PIN** and set a new one.

**A feed says it failed**
- If the feed has mirrors, the message names the first failure and how many mirrors also failed.
- `HTTP 404`: the address is wrong, or the file moved.
- `Not JSON`: the address points to a web page, not to the `.json` file itself.
- `No usable games in this feed`: check the `id`, `title` and `releases[].url` fields against
  [FEEDS.md](FEEDS.md).
