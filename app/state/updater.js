// Jobee'sLair update checker. It asks GitHub for the latest release of the official repository
// (JVK3R/JobeesLair), compares its tag with the running version, and reports whether a newer build exists.
// It downloads nothing itself: state/auto-update.js does, from the assets described here. What it reads is
// validated: the tag must look like a version, the page it links must be on the repository's own
// github.com path, and an asset is offered only at that release's own download path, with its exact size
// and the SHA-256 GitHub computed for it (an asset without one is not offered: nothing is installed that
// cannot be checked).
//
// The result is kept in update-check.json (when it last looked, what the latest release was), so the
// header's indicator is there at launch even before the network answers, and a relaunch does not ask again
// within the hour. The schedule (at launch, then every 24 hours) lives in state/update.js.

// 0.5.1: the image's name is the edition's (version.js IMAGE_NAME).
import { IMAGE_NAME } from '../version.js';
  var DAY_MS = 24 * 60 * 60 * 1e3;
  var HOUR_MS = 60 * 60 * 1e3;
  var NOTES_MAX = 1200;
  var TAG = /^v?(\d+(?:\.\d+){0,3})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
  var numbers = (version2) => TAG.exec(String(version2 ?? ""))?.[1].split(".").map(Number) ?? null;
  var prerelease = (version2) => TAG.exec(String(version2 ?? ""))?.[2] ?? "";
  // Pre-release identifiers compared the semver way: numbers by value, words by text, more identifiers later.
  function comparePre(p, q) {
    const [x, y] = [p.split("."), q.split(".")];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      if (x[i] === y[i]) continue;
      const [m, n] = [/^\d+$/.test(x[i]) ? Number(x[i]) : null, /^\d+$/.test(y[i]) ? Number(y[i]) : null];
      if (m !== null && n !== null) return m - n;
      if (m !== null || n !== null) return m !== null ? -1 : 1;
      return x[i] < y[i] ? -1 : 1;
    }
    return x.length - y.length;
  }
  // Whether version `a` is newer than `b` ("v0.1.1" over "0.1.0", "0.1.1" over its "0.1.1-beta.1", "beta.2"
  // over "beta.1"); anything that is not a version is not newer.
  function newer(a, b) {
    const [x, y] = [numbers(a), numbers(b)];
    if (!x || !y) return false;
    for (let i = 0; i < Math.max(x.length, y.length); i++)
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    const [p, q] = [prerelease(a), prerelease(b)];
    if (p === q) return false;
    if (!p || !q) return !p;
    return comparePre(p, q) > 0;
  }
  var clean = (text, max) => typeof text === "string" ? text.replace(/[\x00-\x08\x0b-\x1f\x7f]+/g, " ").slice(0, max) : "";
  // A release's page, only when it is on the repository's own path.
  function releasePage(url, repo) {
    const prefix = `https://github.com/${repo}/`;
    return typeof url === "string" && url.startsWith(prefix) && !/[\s\\]/.test(url) && url.length < 300 ? url : `${prefix}releases/latest`;
  }
  // The console's package version for a release version, as app.json writes it: package versions start at
  // 01, so 0.2.0 is "01.002.000" and "0.2.1-beta.1" is "01.002.001" (the pre-release part has no place in it).
  // Null when the numbers do not fit it.
  function contentVersionOf(version2) {
    const [major = 0, minor = 0, patch = 0] = numbers(version2) ?? [];
    if (!numbers(version2) || major > 98 || minor > 999 || patch > 999) return null;
    return `${String(major + 1).padStart(2, "0")}.${String(minor).padStart(3, "0")}.${String(patch).padStart(3, "0")}`;
  }
  // The files auto-update installs from, by their release names.
  var ASSETS = { image: IMAGE_NAME, zip: "update.zip" };
  var MAX_ASSET = 8 * 1024 ** 3;
  // A release asset as auto-update may download it: at the release's own download path, of a plausible
  // size, with GitHub's SHA-256. Null otherwise.
  function assetOf(release, name, repo) {
    const asset = Array.isArray(release?.assets) ? release.assets.find((item) => item?.name === name) : null;
    if (!asset) return null;
    const url = `https://github.com/${repo}/releases/download/${encodeURIComponent(release.tag_name)}/${name}`;
    const sha256 = /^sha256:([0-9a-f]{64})$/.exec(String(asset.digest ?? ""))?.[1];
    const size = asset.size;
    if (asset.browser_download_url !== url || !sha256 || !Number.isSafeInteger(size) || size <= 0 || size > MAX_ASSET) return null;
    return { url, size, sha256 };
  }
  // A release as the checker keeps it, or null when it is not one that can be offered. `assets` is set only
  // when both files are there and checkable.
  function describe(release, repo) {
    const tag = release?.tag_name;
    if (typeof tag !== "string" || !numbers(tag)) return null;
    const [image, zip] = [assetOf(release, ASSETS.image, repo), assetOf(release, ASSETS.zip, repo)];
    return {
      version: tag.replace(/^v/, ""),
      url: releasePage(release.html_url, repo),
      notes: clean(release.body, NOTES_MAX).trim(),
      published: clean(release.published_at, 40),
      assets: image && zip ? { image, zip } : null
    };
  }
  function createUpdateChecker({ http, store, version: version2, repo, now = () => Date.now() }) {
    const feed = `https://api.github.com/repos/${repo}/releases/latest`;
    // What the last check found, if it is newer than this build.
    function known() {
      const latest = store.get().latest;
      return latest && newer(latest.version, version2) ? latest : null;
    }
    // Asks GitHub unless it already did within `minAge` ms; returns { update, checkedAt, asked }, or throws
    // when GitHub cannot be reached (nothing is remembered then, so the next launch asks again).
    async function check({ minAge = 0 } = {}) {
      const saved = store.get();
      if (minAge && saved.checkedAt && now() - saved.checkedAt < minAge) return { update: known(), checkedAt: saved.checkedAt, asked: false };
      const response = await http.request(feed, { headers: { Accept: "application/vnd.github+json", "User-Agent": "JobeesLair" }, maxBytes: 256 * 1024 });
      let latest = null;
      // No release published yet is an answer, not a failure.
      if (response.status !== 404) {
        if (!response.ok) throw new Error(`Update check answered HTTP ${response.status}`);
        latest = describe(await response.json(), repo);
      }
      const checkedAt = now();
      store.set({ ...saved, checkedAt, latest });
      return { update: known(), checkedAt, asked: true };
    }
    return { check, known };
  }

export { ASSETS, DAY_MS, HOUR_MS, contentVersionOf, createUpdateChecker, describe, newer };
