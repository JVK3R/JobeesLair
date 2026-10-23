// Reads ShadowMount+'s debug log (and the system's SDK log, when it can be read) for one title and says
// what its last launch got to. Read-only: it only looks at text the queue fetched from ShadowMount's API.
//
// A launch in ShadowMount 1.7's log runs: "[LINK] nullfs mounted ... -> /system_ex/app/TITLE",
// "[SHELLCORE] launch mount ready: TITLE", "[FAKELIB] ..." for the sandbox, "[SHELLCORE] sandbox ready
// handled: TITLE", then "[GAME] started: TITLE pid=..." once the game process exists, with "[MDBG]"
// lines for any error in its first 60 seconds. A launch that ends in "runtime layers released" with no
// "[GAME] started" never got a game process: the console refused the executable before the game ran.

import { t } from '../i18n/core.js';

  var TITLE_ID = /\b[A-Z]{4}\d{5}\b/g;
  var REGISTRATION = /register(?:ed)? failed|failed to register|\[SKIP\]|duplicate|Failed to copy staged/i;
  var MOUNT_FAILURE = /nullfs mount failed|launch mount (?:failed|error)|prepare(?:d)? .*fail|runtime .*fail|\[SHELLCORE\].*(?:failed|error)/i;
  var GAME_ERROR = /error|fatal|signal|exception|crash|fail|cannot|could not|load/i;
  var MONITOR_NOISE = /monitoring game errors|log monitor ready|coredump privileges|monitoring expired/i;
  var LOADER = /eboot\.bin|sce_module|\.s?prx\b|\bself\b|\belf\b|module/i;
  var MAX_LINES = 40;
  var MAX_KERNEL = 20;
  // A line that names another title is someone else's; one that names none belongs to whatever ran then.
  function ours(line, title) {
    const named = line.match(TITLE_ID);
    return !named || named.includes(title);
  }
  var text = (line) => line.replace(/^\[[\d:]+\]\s*/, "").trim();
  // The launches of `title` in the log: from "launch mount ready" to the release of its runtime layers
  // (or the next launch), with only the lines that belong to it.
  function launches(lines, title) {
    const found = [];
    let current = null;
    for (const line of lines) {
      if (line.includes(`launch mount ready: ${title}`)) {
        if (current) found.push(current);
        current = { lines: [], started: false, sandbox: false, fakelib: false, errors: [], mountFailures: [] };
      }
      if (!current) continue;
      if (!ours(line, title)) continue;
      current.lines.push(line);
      if (line.includes(`[GAME] started: ${title}`)) current.started = true;
      if (line.includes(`sandbox ready handled: ${title}`)) current.sandbox = true;
      // 0.5.1: the game's own fakelib went into its sandbox (a backported image's, for older firmware).
      if (line.includes(`[FAKELIB] game mounted for ${title}`)) current.fakelib = true;
      if (/\[MDBG\]/.test(line) && GAME_ERROR.test(line) && !MONITOR_NOISE.test(line)) current.errors.push(line);
      if (MOUNT_FAILURE.test(line)) current.mountFailures.push(line);
      if (line.includes(`runtime layers released: ${title}`) || line.includes(`[GAME] finalizing stopped application: ${title}`)) {
        found.push(current);
        current = null;
      }
    }
    if (current) found.push(current);
    return found;
  }
  function verdictOf(title, attempts, registration, installed) {
    const last = attempts.at(-1);
    if (last) {
      if (last.mountFailures.length) return { key: "mountFailed", params: { title, error: text(last.mountFailures[0]) } };
      if (last.started && last.errors.length) return { key: "crashed", params: { title, error: text(last.errors[0]) } };
      if (last.started) return { key: "ran", params: { title } };
      if (last.sandbox) return { key: "notStarted", params: { title } };
      return { key: "mountFailed", params: { title, error: text(last.lines.at(-1) ?? "") } };
    }
    if (registration.length) return { key: "notRegistered", params: { title, error: text(registration.at(-1)) } };
    if (installed) return { key: "installedOnly", params: { title } };
    return { key: "noLog", params: { title } };
  }
  /**
   * `debug` / `kernel`: the logs' text, or null when they could not be read. Returns the verdict (an i18n
   * key and its params, and the sentence), how many launches the log holds, the lines that show it, and
   * the system log's lines about the title or its executable and modules.
   */
  function diagnoseLaunch({ title, debug, kernel, version = "" }) {
    const lines = (debug ?? "").split("\n").map((line) => line.trimEnd()).filter(Boolean);
    const attempts = launches(lines, title);
    const registration = lines.filter((line) => line.includes(title) && REGISTRATION.test(line));
    const installed = lines.some((line) => line.includes(`installed game ${title}`) || line.includes(`Installing:`) && line.includes(title));
    const verdict = verdictOf(title, attempts, registration, installed);
    const shown = [...new Set([...registration.slice(-5), ...attempts.at(-1)?.lines ?? []])].slice(-MAX_LINES);
    const kernelLines = (kernel ?? "").split("\n").map((line) => line.trimEnd()).filter((line) => line && (line.includes(title) || LOADER.test(line) && ours(line, title))).slice(-MAX_KERNEL);
    return {
      title,
      version,
      verdict: { ...verdict, text: t(`diagnosis.verdict.${verdict.key}`, verdict.params) },
      launches: attempts.length,
      // Whether its last launch loaded the game's own fakelib: the Library's Options can turn it off.
      fakelib: Boolean(attempts.at(-1)?.fakelib),
      lines: shown,
      kernel: kernelLines,
      debugRead: debug !== null && debug !== void 0,
      kernelRead: kernel !== null && kernel !== void 0
    };
  }

  /**
   * What the log says about every title's last launch: { TITLE: { outcome, verdict, mark } }, where `outcome` is
   * "played" (its game process started and no error was reported) or "wontStart" (it never got a game
   * process, ShadowMount could not prepare it, or it failed right after starting), and `verdict` the
   * diagnosis key. Titles the log has no launch of are left out, so what is known about them stays.
   */
  function launchOutcomes(debug) {
    const lines = (debug ?? "").split("\n").map((line) => line.trimEnd()).filter(Boolean);
    const titles = new Set(lines.map((line) => /launch mount ready: ([A-Z]{4}\d{5})/.exec(line)?.[1]).filter(Boolean));
    const outcomes = {};
    for (const title of titles) {
      const attempts = launches(lines, title);
      const last = attempts.at(-1);
      if (!last) continue;
      const verdict = verdictOf(title, attempts, [], true).key;
      // `mark`: the attempt's first line (its "launch mount ready", time-stamped), which tells this launch
      // from a later one with the same outcome.
      outcomes[title] = { outcome: verdict === "ran" ? "played" : "wontStart", verdict, mark: last.lines[0] ?? null };
    }
    return outcomes;
  }

export { diagnoseLaunch, launchOutcomes };
