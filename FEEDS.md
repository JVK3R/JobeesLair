# Catalog feeds

A catalog feed is a JSON file, served over `http://` or `https://`, that adds games to Jobee'sLair
or adds sources to games its catalog already lists. Add one in **Settings → Storage & feeds → Add a feed**
by typing its full address, or from the phone companion's **Feeds** tab. Up to 4 feeds, each at most 2 MiB.
Step-by-step instructions, including hosting a feed, are in [INSTALLATION-GUIDE.md](INSTALLATION-GUIDE.md#5-configure-custom-json-feeds).

> [!WARNING]
> Only add feeds that point to content you legally own or have explicit permission to download, such as your
> own backups, homebrew and freeware. You are responsible for what you download.

Feeds refresh in the background a few seconds after the app opens, or from **Refresh feeds**. A copy is
kept on the console, so a feed that is offline keeps its last good games. What a refresh brings in is
shown the next time the app opens: Settings says so when a restart is needed.

## Mirrors and takedown resistance

A feed is its own address **plus any number of mirrors**: other addresses that serve the same feed.
A refresh tries the address that worked last first, then the feed's own address, then each mirror, and
stops at the first that gives a usable feed. So a feed whose domain is taken down keeps refreshing from
a mirror, and if every address is down the console keeps the last good copy and its games.

Mirrors come from two places:

- **The feed itself**, with an optional top-level `mirrors` list. Publishers should list every host
  that serves the feed:

  ```json
  {
    "version": 1,
    "name": "My feed",
    "mirrors": ["https://mirror-one.example/catalog.json", "https://mirror-two.example/catalog.json"],
    "games": []
  }
  ```

  Only `http://` and `https://` addresses are kept, duplicates and the feed's own address are
  dropped, and at most 4 are used.
- **You**, from **Settings → Storage & feeds** (select the feed, then **Add a mirror**) or the phone's
  **Feeds** tab. Up to 4 per feed; they are kept in `feed-mirrors.json` and move with the feed if you
  edit its address.

A copy fetched from a mirror is read as the feed's own, so the same game has the same sources whichever
address served it, and a download started from one keeps its identity. A mirror that is down, answers
with an error, or answers with something that is not a feed is skipped like any other failure. A mirror
is only ever used to fetch the feed file; it does not change how games are downloaded.

## Format

```json
{
  "version": 1,
  "name": "My feed",
  "games": [
    {
      "id": "PPSA01234",
      "title": "Example Game",
      "releases": [
        { "url": "https://archive.org/download/example-item/Example.pkg", "sizeBytes": 5368709120, "version": "1.02" }
      ]
    }
  ]
}
```

Only `version`, `games`, and for each game `id`, `title` and one release with a `url` are required.
Anything malformed is skipped, field by field and game by game; a game left with no usable release is
dropped.

### Game

| Field | Meaning |
| --- | --- |
| `id` | Title ID, `CUSA#####` or `PPSA#####`. A game the catalog already has gets this feed's releases added to its own. |
| `title` | Name, up to 200 characters. |
| `platform` | `ps5` or `ps4`; from the ID when absent (`PPSA` is PS5). |
| `releases` | Up to 64 sources, below. |
| `developer`, `publisher` | Text. |
| `releaseDate` | `YYYY-MM-DD`; sorts "New releases" and the release-year filter. |
| `genres`, `features` | Lists of text (up to 8 and 12). |
| `sizeGb` | Download size; the sum of the releases' `sizeBytes` when absent. |
| `metacritic`, `recommendations` | Numbers, for the score badge and sorting. |
| `art` | `cover`, `hero` and `coverFallbacks` (image URLs), `tint` (`#rrggbb` behind the hero). |
| `summary`, `about`, `shots` | The game page: a short description, paragraphs, and screenshot URLs. Ignored for a game the catalog already has. |

### Release

| Field | Meaning |
| --- | --- |
| `url` | The file, or the host page the app resolves it from (MediaFire, Buzzheavier, …). |
| `browserUrl` | A page to open in the console's browser when the host needs a check there. |
| `requiresBrowser` | `true` when the source always needs the browser. |
| `format` | `pkg`, `fpkg`, `exfat`, `ffpfs`, `ffpfsc`, `ffpkg`, `rar`, `7z`, `zip` or `binary`; from the file name when absent. |
| `filename` | The name to save as; the URL's last segment when absent. |
| `sizeBytes`, `version`, `sha256` | Size check, the version shown, and a whole-file SHA-256 checked after download. |
| `provider` | The host's name as shown; the URL's host when absent. |
| `label` | The source's name in the source list. Volumes of one archive share a label but for `part 1`, `part 2`…, and are offered as one set. |
| `record` | Groups volumes when labels alone don't (defaults to one record per game). |
| `archivePassword`, `volume`, `category` | As in the bundled catalog's release data. |

Sources on retired hosts (Vikingfile, AkiraBox, and link pages that only lead to them) are dropped
from feeds exactly as from the bundled catalog.
