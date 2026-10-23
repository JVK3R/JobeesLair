// Which browser-only hosts finish on this console. A host whose check only the console's browser can pass
// has its file link captured from the browser (download-queue.js); some hosts let that happen, others don't
// (a captcha whose answer is the file itself, ads that bury the page). Overdrive hides the ones it found
// failing with a hand-kept list; Jobee'sLair hides nothing: it starts from what Overdrive 1.0.6 found on the
// console (2026-10-16/17) and then goes by what happens here, each capture's outcome kept per host in
// capture-hosts.json ({ <host>: { ok, fail, at } }). The source list ranks and labels by it.
//   works    a capture finished here, or the host is known to (and none failed since without one working)
//   hard     known to fail, or three captures here failed and none finished
//   unknown  nothing known either way

import { webURL } from './download-sources.js';
import { savedList } from './saved.js';

  // Overdrive 1.0.6's console tests: captures that finish (Vikingfile by its file name; Datanodes and
  // AkiraBox by the title id), and hosts it paused because they did not (DataVaults' file is the captcha
  // form's own answer, with no link to capture; Buzzheavier's ads; the rest untested or failing).
  var KNOWN_WORKING = ["vikingfile", "datanodes", "akirabox"];
  var KNOWN_HARD = ["datavaults", "buzzheavier", "1fichier", "gofile", "rapidgator", "filecrypt", "ranoz", "transfer", "mega", "urlvanish", "fileditchfiles", "tinyurl", "fuckingfast", "1024terabox"];
  // Hosts the app reaches without the browser (download-sources.js RESOLVED_KINDS): rootz since 0.5.1.
  var KNOWN_DIRECT = ["filekeeper", "rootz"];
  var FAILS_TO_GIVE_UP = 3;
  var KEPT = 64;
  // A LinkVault vault's mirror, by its link's #fragment or its label's suffix ("Dump - Filek").
  var VAULT_MIRRORS = { vikingfile: "vikingfile", akirabox: "akirabox", datanodes: "datanodes", datavaults: "datavaults", filekeeper: "filekeeper", filek: "filekeeper", fileditch: "fileditchfiles" };
  /** A source's host as one word ("1fichier", "vikingfile"), the mirror for a LinkVault vault; null when none. */
  function hostKey(source) {
    try {
      const page = source.browserUrl || source.url;
      const host = webURL(page).host.replace(/^www\./, "");
      if (host === "link-vault.org" || host.endsWith(".link-vault.org")) {
        const mirror = (page.split("#")[1] || (source.label || "").split(" - ").pop() || "").toLowerCase();
        return VAULT_MIRRORS[mirror] ?? null;
      }
      const labels = host.split(".");
      const name = labels.length > 1 ? labels[labels.length - 2] : labels[0];
      return name === "vik1ngfile" ? "vikingfile" : name;
    } catch {
      return null;
    }
  }
  var store = null;
  var saved = () => store ?? (store = savedList("capture-hosts.json", "capture hosts"));
  /** Keeps how a capture on `source`'s host ended (the download queue calls it). */
  function recordCapture(source, ok) {
    const key = hostKey(source);
    if (!key) return;
    const all = { ...saved().get() };
    const entry = all[key] ?? { ok: 0, fail: 0 };
    all[key] = { ok: entry.ok + (ok ? 1 : 0), fail: ok ? 0 : entry.fail + 1, at: Date.now() };
    const kept = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, KEPT);
    saved().set(Object.fromEntries(kept));
  }
  /** How `source`'s host fares with captures here: "works", "hard" or "unknown" (see above). */
  function hostStanding(source) {
    const key = hostKey(source);
    if (!key) return "unknown";
    // No capture, so no capture history: an earlier version's failed Rootz captures say nothing now.
    if (KNOWN_DIRECT.includes(key)) return "works";
    const entry = saved().get()[key];
    // A failure resets `fail` only by a later success, so a host that worked and then failed three times
    // in a row reads as failing again.
    if (entry?.fail >= FAILS_TO_GIVE_UP) return "hard";
    if (entry?.ok > 0) return "works";
    if (KNOWN_WORKING.includes(key)) return "works";
    if (KNOWN_HARD.includes(key)) return "hard";
    return "unknown";
  }

export { KNOWN_DIRECT, KNOWN_HARD, KNOWN_WORKING, hostKey, hostStanding, recordCapture };
