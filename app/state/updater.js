// Jobee'sLair update checker. Lightweight and read-only: it asks GitHub for the latest release of the
// official repository (JVK3R/JobeesLair), compares its tag with the running version, and reports whether
// a newer build exists. It never downloads or installs anything: a new build is installed by copying its
// .exfat over the old one (INSTALLATION-GUIDE.md), so a failed or hostile reply can at worst show a
// banner. What it reads is validated: the tag must look like a version and the page it links must be on
// the repository's own github.com path.
//
// The result is kept in update-check.json (when it last looked, what the latest release was), so the
// header's indicator is there at launch even before the network answers, and a relaunch does not ask again
// within the hour. The schedule (at launch, then every 24 hours) lives in state/update.js.

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
  // A release as the checker keeps it, or null when it is not one that can be offered.
  function describe(release, repo) {
    const tag = release?.tag_name;
    if (typeof tag !== "string" || !numbers(tag)) return null;
    return { version: tag.replace(/^v/, ""), url: releasePage(release.html_url, repo), notes: clean(release.body, NOTES_MAX).trim(), published: clean(release.published_at, 40) };
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

export { DAY_MS, HOUR_MS, createUpdateChecker, describe, newer };
