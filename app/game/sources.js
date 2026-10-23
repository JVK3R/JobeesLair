// ../pub-game-store/native/game/sources.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Vikingfile is a browser source again (its file link captured from the console's browser), and a
// browser source ranks by how captures on its host fare on this console (state/capture-hosts.js).

import { activeService, serviceName } from '../state/debrid.js';
import { t } from '../i18n/core.js';
import { hostStanding } from '../state/capture-hosts.js';
import { ps5FakePackagesLaunch } from '../state/firmware.js';
import { sourceKind } from '../state/download-sources.js';
import { formatBytes } from '../state/size.js';

  var KIND = {
    ffpfsc: "sources.kind.image",
    ffpfs: "sources.kind.image",
    ffpkg: "sources.kind.image",
    exfat: "sources.kind.image",
    pkg: "sources.kind.package",
    fpkg: "sources.kind.package",
    zip: "sources.kind.archive",
    rar: "sources.kind.archive",
    "7z": "sources.kind.archive",
    tar: "sources.kind.archive",
    "archive-set": "sources.kind.archive"
  };
  // Disk images mount through ShadowMount as they are; an archive can hold an image or an extracted game
  // folder (a folder dump), and a "binary" release says nothing until its bytes arrive.
  var isImage = (release) => KIND[release.format] === "sources.kind.image";
  var kindOf = (release) => t(KIND[release.format] ?? "sources.kind.unknown");
  var REGIONS = { US: "USA", USA: "USA", EU: "EUR", EUR: "EUR", EUROPE: "EUR", UK: "UK", JP: "JPN", JPN: "JPN", JAP: "JPN", JAPAN: "JPN", ASIA: "ASIA", ASA: "ASIA", KR: "KOR", KOR: "KOR", CN: "CHN", CHN: "CHN", HK: "HKG", HKG: "HKG", WORLD: "World", GLOBAL: "World" };
  // "USA Base (v01.21) - Direct" → "USA"; null when the label names no region.
  function regionOf({ label }) {
    const match = /\b(USA?|EU(?:R|ROPE)?|UK|JPN?|JAP(?:AN)?|ASIA|ASA|KOR?|KR|CHN?|CN|HKG?|WORLD|GLOBAL)\b/i.exec(label || "");
    return match ? REGIONS[match[1].toUpperCase()] ?? null : null;
  }
  // The release's version, from its own field or its label ("(v01.21)"), as "v1.21"; null when none.
  function versionOf(release) {
    const value = release.version || /\bv(\d+(?:\.\d+)+)\b/i.exec(release.label || "")?.[1];
    return value ? `v${version(value)}` : null;
  }
  function edition({ label, provider }) {
    const text = (label || "").replace(/\s*·\s*\d+ parts$/, "").trim();
    const split = text.lastIndexOf(" - ");
    const host2 = provider.toLowerCase().replace(/^www\./, "").slice(0, 4);
    const edition2 = split >= 0 && text.slice(split + 3).toLowerCase().startsWith(host2) ? text.slice(0, split) : text;
    return provider.toLowerCase().startsWith(edition2.toLowerCase()) ? "" : edition2;
  }
  var GATED = /* @__PURE__ */ new Set(["vikingfile", "buzzheavier"]);
  function access(release) {
    const first = release.parts?.[0]?.sources[0] ?? release;
    let kind;
    try {
      kind = sourceKind(first);
    } catch {
      return "browser";
    }
    // A source sent through TorBox (state/debrid.js) downloads in the app like a file link.
    if (kind === "direct" || kind === "manifest" || kind === "debrid") return "direct";
    // 0.5.1: a magnet link: its own section, downloadable through a debrid service only.
    if (kind === "torrent") return "torrent";
    return kind === "browser" || kind === "datanodes" || kind === "unavailable" || GATED.has(kind) ? "browser" : "page";
  }
  var SPEED = { "archive.org": "sources.speed.archive", mediafire: "sources.speed.mediafire", "overdrive cdn": "sources.cdnFastest" };
  var isCdnProvider = (provider) => /^overdrive\s*cdn$/i.test(provider ?? "");
  // A source as the gamer reads it: `name` leads with what they get ("Disk image · USA v1.10"), `detail`
  // says where from ("VikingFile · Backport · 2 parts"), `size` stands apart.
  function describeSource(release) {
    const parts = release.parts?.length;
    const region = regionOf(release);
    const shownVersion = versionOf(release);
    const said = [region, shownVersion].filter(Boolean).join(" ");
    const name = [kindOf(release), said || edition(release)].filter(Boolean).join(" \xB7 ");
    const group = release.unavailableReason ? "unavailable" : access(release);
    const host = group === "torrent" ? t("sources.torrent") : release.provider.replace(/^www\./, "");
    const speed = SPEED[release.provider.toLowerCase()];
    const detail2 = [
      host,
      release.debrid ? t("debrid.via").replace("TorBox", serviceName(release.debrid.service)) : null,
      isBackport(release) ? t("sources.role.backport") : isDlc(release) ? t("sources.role.dlc") : null,
      parts ? t("sources.parts", { count: parts }) : null,
      speed ? t(speed) : null
    ].filter(Boolean).join(" \xB7 ");
    return {
      name,
      detail: detail2,
      host,
      size: release.sizeBytes ? formatBytes(release.sizeBytes) : null,
      group,
      reason: release.unavailableReason ?? null
    };
  }
  /** How captures on a browser source's host fare here: "works", "hard", "unknown"; null for other sources. */
  function captureStanding(release) {
    if (access(release) !== "browser") return null;
    return hostStanding(release.parts?.[0]?.sources[0] ?? release);
  }
  var version = (value) => {
    const parts = (value || "").replace(/^v/i, "").split(".").map(Number);
    while (parts.length > 1 && parts.at(-1) === 0) parts.pop();
    return parts.join(".");
  };
  var sameSize = (a, b) => Boolean(a && b) && Math.abs(a - b) <= a * 0.01;
  var partOf = ({ label, filename }) => /\bpart\s*(\d+)\b/i.exec(`${label || ""} ${filename || ""}`)?.[1] ?? "";
  var recordOf = (release) => (release.parts?.[0].sources[0] ?? release).record;
  var sameFormat = (a, b) => a.format === b.format || a.format === "binary" || b.format === "binary";
  function equivalent(a, b) {
    if (Boolean(a.parts) !== Boolean(b.parts) || a.parts?.length !== b.parts?.length || isDlc(a) !== isDlc(b)) return false;
    if (a.sha256 && b.sha256) return a.sha256 === b.sha256;
    const [ea, eb] = [edition(a).toLowerCase(), edition(b).toLowerCase()];
    if (ea && eb && ea !== eb) return false;
    if (a.version && b.version && version(a.version) !== version(b.version)) return false;
    if (a.sizeBytes && b.sizeBytes && !sameSize(a.sizeBytes, b.sizeBytes)) return false;
    if (!a.parts && (!sameFormat(a, b) || partOf(a) !== partOf(b))) return false;
    return sameSize(a.sizeBytes, b.sizeBytes) || Boolean(ea) && ea === eb && recordOf(a) !== void 0 && recordOf(a) === recordOf(b);
  }
  var isDlc = ({ label }) => /\bDLCs?\b/i.test(label || "") && !/\b(?:game|full)\b|\+\s*(?:all\s+)?DLCs?\b|\bwith\s+(?:all\s+)?DLCs?\b|\bincl/i.test(label);
  var GROUP_RANK = { direct: 0, page: 1, torrent: 2, browser: 3, unavailable: 4 };
  // 0.5.1: a torrent ranks after host pages with a debrid key set, after the browser without one.
  function groupRank(release) {
    const group = release.unavailableReason ? "unavailable" : access(release);
    return group === "torrent" && !activeService() ? GROUP_RANK.browser + 0.5 : GROUP_RANK[group];
  }
  var HEALTH_RANK = { ok: 0, flaky: 2 };
  var isBackport = ({ label }) => /\bback\s*port\b/i.test(label || "");
  // (From Overdrive 1.0.6.) The firmware major a source's label asks for ("USA 10.xx Base", "10.xx BackPort
  // 4.xx"): a backport runs from the lowest it names, anything else needs the highest. Null when it names none.
  function labelFirmware(release) {
    const named = [...(release.label || "").matchAll(/\b(\d{1,2})\.xx\b/gi)].map((match) => Number(match[1]));
    if (!named.length) return null;
    return isBackport(release) ? Math.min(...named) : Math.max(...named);
  }
  var hostRank = ({ provider }) => isCdnProvider(provider) ? 0 : provider.toLowerCase() === "archive.org" ? 1 : provider.toLowerCase() === "mediafire" ? 2 : 3;
  // The order sources are offered in: the game before its add-ons and backports, what can be had before
  // what cannot, a link that answers now before one that just failed to and one the check found gone after
  // both (state/link-health.js), a browser host whose captures fail here with those, what runs
  // on 13.60 before what is known not to (a PS5 fake package, release-sets.js releaseType), a disk image
  // (which mounts as it is) before an archive or an unknown format (which can turn out to be an extracted
  // folder dump), then the faster and healthier hosts, a browser host whose captures work before one not
  // tried yet.
  var ranked = (release, index) => {
    // Only the group and the capture standing are needed here, not the whole described source.
    const group = groupRank(release);
    const standing = captureStanding(release);
    return { release, index, group, rank: [
      isDlc(release) || isBackport(release) ? 1 : 0,
      release.unavailableReason ? 1 : 0,
      release.linkHealth?.status === "dead" ? 1 : 0,
      // 0.5.1: a torrent without a debrid key is no link anyone here can use yet: after everything else.
      group > GROUP_RANK.browser && group < GROUP_RANK.unavailable ? 1 : 0,
      standing === "hard" ? 1 : 0,
      release.linkHealth?.status === "unreachable" ? 1 : 0,
      release.compatible1360 === false ? 1 : 0,
      isImage(release) ? 0 : 1,
      hostRank(release),
      standing === "unknown" ? 1 : 0,
      group,
      HEALTH_RANK[release.health] ?? 1,
      release.source === "orbit" ? 0 : 1,
      release.requiresBrowser ? 1 : 0
    ] };
  };
  var compare = (a, b) => a.rank.reduce((order, value, i) => order || value - b.rank[i], 0) || a.index - b.index;
  function preferredRelease(releases) {
    return releases.map(ranked).sort(compare)[0]?.index ?? 0;
  }
  // 0.5.1: whether a source runs on this console as it is (release-sets.js compatible1360: a dump or image, and a
  // PS5 fake package at 11.60 or lower), leaving out add-ons, backports, links found gone and sources listed as
  // unavailable. `readyLinks`: how many of a game's sources do.
  function runsHere(release, firmware) {
    if (!release || release.unavailableReason || release.linkHealth?.status === "dead" || isDlc(release) || isBackport(release)) return false;
    // A torrent needs a debrid key before it is a link anyone here can use.
    if (access(release) === "torrent" && !activeService()) return false;
    return release.compatible1360 === true || release.compatible1360 === false && ps5FakePackagesLaunch(firmware) === true;
  }
  var readyLinks = (releases, firmware) => (releases || []).filter((release) => runsHere(release, firmware)).length;
  // 0.5.1: every source's index in the order they are offered (ranked above), best first.
  function sourceOrder(releases) {
    return releases.map(ranked).sort(compare).map(({ index }) => index);
  }
  function fallbacks(releases, selected) {
    return releases.map(ranked).filter(({ release, index, group }) => index !== selected && group <= GROUP_RANK.page && equivalent(releases[selected], release)).sort(compare).map(({ release }) => release);
  }
  function sourceSections(releases) {
    const sections = ["direct", "page", "torrent", "browser", "dlc", "backport", "unavailable"].map((group) => ({ group, items: [] }));
    releases.forEach((release, index) => {
      const { group } = describeSource(release);
      const into = group === "unavailable" ? group : isBackport(release) ? "backport" : isDlc(release) ? "dlc" : group;
      sections.find((section) => section.group === into).items.push({ release, index });
    });
    const links = ({ release }) => release.parts?.length ?? 1;
    sections.find((section) => section.group === "browser").items.sort((a, b) => links(a) - links(b));
    return sections.filter((section) => section.items.length);
  }

export { captureStanding, describeSource, fallbacks, isBackport, isCdnProvider, isDlc, isImage, labelFirmware, preferredRelease, readyLinks, runsHere, sourceOrder, sourceSections };
