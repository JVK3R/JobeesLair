// The Homebrew section's catalog: homebrew/index.json (built by tools/homebrew/build-index.mjs from each
// project's own GitHub repository and release). This module only checks and shapes it; state/homebrew.js
// loads it (the copy shipped in the app, then the newest one fetched) and installs from it.
//
// Nothing from the index is trusted: a field of the wrong type is dropped, an app without a name or a
// file is dropped, and a file is kept only when it downloads from the app's own repository's releases
// (https://github.com/<owner>/<repo>/releases/download/...), so the index can point the console at
// nothing else. Images may come from any https address (they are only drawn).

  var MAX_APPS = 600, MAX_FILES = 12, MAX_SHOTS = 4;
  // What the console does with each kind of file (tools/homebrew/build-index.mjs names them).
  var KINDS = /* @__PURE__ */ new Set(["image", "app", "archive-image", "payload", "archive-payload", "pkg", "archive-pkg"]);
  var REPO = /^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
  var CATEGORY = /^[a-z][a-z0-9-]{0,31}$/;
  var str = (value, max) => typeof value === "string" ? value.slice(0, max) : "";
  var num = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  var https = (value) => typeof value === "string" && /^https:\/\/[^\s"'<>]+$/.test(value) && value.length <= 600 ? value : null;
  // A file name as it will be written on the console: no folders, no control characters, no "..".
  var fileName = (value) => typeof value === "string" && value.length <= 200 && /^[^/\\\x00-\x1f]+$/.test(value) && value !== "." && value !== ".." ? value : null;
  // A path inside an archive: relative, without "..", ending in a name.
  var innerPath = (value) => typeof value === "string" && value.length <= 400 && !/[\\\x00-\x1f]/.test(value) && !value.startsWith("/") && !value.split("/").includes("..") ? value : null;
  function normalizeFile(file, repo) {
    if (!file || typeof file !== "object") return null;
    const name = fileName(file.name);
    const url = https(file.url);
    if (!name || !url || !KINDS.has(file.kind)) return null;
    // Only the app's own release files.
    if (!url.toLowerCase().startsWith(`https://github.com/${repo.toLowerCase()}/releases/download/`)) return null;
    const out = { name, kind: file.kind, url, size: num(file.size) };
    if (file.kind === "app") {
      const folder = typeof file.folder === "string" ? innerPath(file.folder || ".") : null;
      if (folder === null) return null;
      out.folder = file.folder;
    }
    if (file.kind.startsWith("archive-")) {
      const inner = innerPath(file.inner);
      if (!inner) return null;
      out.inner = inner;
    }
    return out;
  }
  function normalizeApp(app, categories) {
    if (!app || typeof app !== "object" || typeof app.repo !== "string" || !REPO.test(app.repo)) return null;
    const name = str(app.name, 60).trim();
    if (!name) return null;
    const files = (Array.isArray(app.files) ? app.files : []).slice(0, MAX_FILES).map((file) => normalizeFile(file, app.repo)).filter(Boolean);
    if (!files.length) return null;
    const release = app.release && typeof app.release === "object" ? app.release : {};
    return {
      id: app.repo.toLowerCase(),
      repo: app.repo,
      name,
      author: str(app.author, 40) || app.repo.split("/")[0],
      category: categories.has(app.category) ? app.category : "system",
      description: str(app.description, 300),
      about: str(app.about, 1200),
      stars: num(app.stars) ?? 0,
      license: str(app.license, 40) || null,
      icon: https(app.icon),
      iconFromAvatar: app.iconFromAvatar === true,
      logo: https(app.logo),
      hero: https(app.hero),
      shots: (Array.isArray(app.shots) ? app.shots : []).map(https).filter(Boolean).slice(0, MAX_SHOTS),
      pushed: num(app.pushed),
      release: {
        tag: str(release.tag, 80) || "",
        title: str(release.title, 100),
        date: num(release.date),
        prerelease: release.prerelease === true,
        notes: str(release.notes, 2e3),
        url: https(release.url),
        downloads: num(release.downloads) ?? 0
      },
      files,
      note: str(app.note, 300) || null,
      // Payloads installed with the app (its helper), by file name; only names the release really has.
      with: (Array.isArray(app.with) ? app.with : []).map((name2) => str(name2, 120)).filter((name2) => files.some((file) => file.name === name2)).slice(0, 3),
      // Lowercased words for search, built once.
      search: `${name} ${app.repo} ${str(app.description, 300)}`.toLowerCase()
    };
  }
  // The index as the app uses it, or null when the document is not one.
  function normalizeIndex(doc) {
    if (!doc || typeof doc !== "object" || doc.version !== 1 || !Array.isArray(doc.apps)) return null;
    const categories = (Array.isArray(doc.categories) ? doc.categories : []).filter((c) => c && CATEGORY.test(c.id) && typeof c.name === "string").map((c) => ({ id: c.id, name: c.name.slice(0, 40) }));
    const known = new Set(categories.map((c) => c.id));
    if (!known.has("system")) {
      categories.push({ id: "system", name: "System tools" });
      known.add("system");
    }
    const seen = /* @__PURE__ */ new Set();
    const apps = [];
    for (const raw of doc.apps.slice(0, MAX_APPS)) {
      const app = normalizeApp(raw, known);
      if (!app || seen.has(app.id)) continue;
      seen.add(app.id);
      apps.push(app);
    }
    return { generated: num(doc.generated) ?? 0, categories: categories.filter((c) => apps.some((a) => a.category === c.id)), apps };
  }
  // What a file does on the console, for labels and the install steps.
  var IMAGE_KINDS = ["image", "archive-image"];
  var APP_KINDS = ["image", "app", "archive-image"];
  var PAYLOAD_KINDS = ["payload", "archive-payload"];
  var PACKAGE_KINDS = ["pkg", "archive-pkg"];
  var roleOf = (file) => APP_KINDS.includes(file.kind) ? "app" : PAYLOAD_KINDS.includes(file.kind) ? "payload" : "package";
  // Search: every word of the query in the name, the repository or the description; name matches first.
  function searchApps(apps, query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return apps;
    const found = apps.filter((app) => words.every((word) => app.search.includes(word)));
    const named = (app) => words.every((word) => app.name.toLowerCase().includes(word)) ? 1 : 0;
    return found.sort((a, b) => named(b) - named(a) || b.stars - a.stars);
  }

export { APP_KINDS, IMAGE_KINDS, PACKAGE_KINDS, PAYLOAD_KINDS, normalizeIndex, roleOf, searchApps };
