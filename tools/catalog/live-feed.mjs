// Builds catalog/live.json, the live catalog feed every Jobee'sLair reads at launch (state/feeds.js LIVE_FEED),
// from the public Pegasus catalogs (pegasus-dl.dev). Added in 0.5.1.
//
//   node tools/catalog/live-feed.mjs        (from the repository root, Node 20+)
//
// Every catalog pegasus-dl.dev lists is read (a catalog added there is picked up by itself), its packages are
// merged by title ID, and what the app already bundles is left out: a link the bundled catalog has is
// dropped, and a game with nothing new left is dropped. What remains goes in, newest first and games the app
// lacks before games it has, within the budget a console can read in one piece (state/feed-format.js:
// 1500 games, 6000 links; state/feeds.js: 2 MiB). The scheduled workflow (.github/workflows/catalog-live.yml)
// runs it every few hours and commits the file when it changed, so a game added to a Pegasus catalog reaches
// every console the next time Jobee'sLair starts, without a new release.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'catalog', 'live.json');
const API = 'https://pegasus-dl.dev/api/catalogs';
const UA = 'JobeesLair-live-feed (+https://github.com/JVK3R/JobeesLair)';
// A little under the app's limits, so a console never has to cut the feed short.
const MAX_GAMES = 1450, MAX_LINKS = 5800, MAX_BYTES = 1.9 * 1024 * 1024;
// Links kept per game: every build gets one before any build gets a second.
const NEW_GAME_LINKS = 16, KNOWN_GAME_LINKS = 4;
const TITLE_ID = /^(?:CUSA|PPSA)\d{5}$/;

async function getJSON(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt >= 3) throw new Error(`${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
}

// The bundled catalog: its title IDs, and every link its releases hold.
function bundled() {
  const ids = new Set([...readFileSync(join(ROOT, 'app/data/catalog.js'), 'utf8').matchAll(/"id": "((?:CUSA|PPSA)\d{5})"/g)].map((m) => m[1]));
  const urls = new Set();
  const dir = join(ROOT, 'app/data/releases');
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    for (const release of JSON.parse(readFileSync(join(dir, name), 'utf8'))) {
      if (release.url) urls.add(release.url);
      if (release.browserUrl) urls.add(release.browserUrl);
    }
  }
  return { ids, urls };
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const plain = (html) => typeof html === 'string'
  ? html.replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
  : '';
const clip = (value, max) => (typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, max) : '');
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Short and stable: tells links apart in a record name or a file name.
const tag = (value) => { let h = 2166136261; for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
// "EUR 10.xx Base - 1fichier part 2": one volume of a set; its set is the label without the part.
const PART = /\s*\bpart\s*(\d{1,3})\s*$/i;
const httpsURL = (value) => typeof value === 'string' && /^https:\/\/[^\s/]+\/\S*$/.test(value) && value.length <= 600;

// A game's links as download sets: the volumes of one set together, in part order; any other link is a set
// of its own. A set missing a part (one the bundled catalog already has, or one the catalog skipped) is left
// out: half a game cannot be extracted.
function setsOf(links) {
  const sets = new Map();
  for (const link of links) {
    const part = PART.exec(link.label);
    const name = part ? link.label.replace(PART, '') : link.label;
    const key = part ? `${link.build}|${name}` : link.url;
    if (!sets.has(key)) sets.set(key, { build: link.build, name, parted: Boolean(part), links: [] });
    sets.get(key).links.push({ ...link, part: part ? Number(part[1]) : 0 });
  }
  return [...sets.values()]
    .map((set) => ({ ...set, links: set.links.sort((a, b) => a.part - b.part) }))
    .filter((set) => !set.parted || set.links.every((link, index) => link.part === index + 1));
}

// 0.5.1 Pre Release 1: DLPS numbers a game's AkiraBox links "part 1, 2, 3" in page order, whether they are
// the volumes of one archive or whole files side by side (PPSA21564: two complete .rar uploads and an .ffpkg,
// as "part 1-3"; the app then waited for a "part 1" no page held). AkiraBox and Rootz say a file's name in
// the page title, so those links are read once (catalog/names.json keeps what was read) and regrouped by
// the names: volumes of one name together, any other file a download of its own.
const NAMES = join(ROOT, 'catalog', 'names.json');
const NAMED_HOST = /^(?:www\.)?(?:akirabox\.(?:com|to)|rootz\.so)$/;
const DEAD = 'dead';
// "Game.part02.rar", "Game.7z.002", "Game.r00": a volume of the archive named without it.
function volumeOf(name) {
  let m = /^(.*)\.part0*(\d{1,3})\.rar$/i.exec(name);
  if (m) return { base: `${m[1]}.rar`, part: Number(m[2]) };
  m = /^(.*\.(?:7z|zip|rar))\.0*(\d{1,3})$/i.exec(name);
  if (m) return { base: m[1], part: Number(m[2]) };
  m = /^(.*)\.r(\d\d)$/i.exec(name);
  if (m) return { base: `${m[1]}.rar`, part: Number(m[2]) + 2, old: true };
  return null;
}
// A page's file name, DEAD for a removed file, or null when the page said nothing (asked again next run).
async function pageName(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (response.status === 404 || response.status === 410) return DEAD;
    if (!response.ok) return null;
    const title = (/<title>([^<]*)<\/title>/i.exec(await response.text())?.[1] ?? '').replace(/&amp;/g, '&').replace(/\s*·\s*AkiraBox\s*$/i, '').trim();
    if (/^AkiraBox\b/i.test(title)) return DEAD;
    return /\.[a-z0-9]{2,6}$/i.test(title) && title.length <= 200 ? title : null;
  } catch {
    return null;
  }
}
async function readNames(urls, names) {
  const queue = urls.filter((url) => !(url in names));
  let looked = 0;
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      const name = await pageName(url);
      if (name) names[url] = name;
      looked++;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return looked;
}
// A chosen set split by its files' names. A set whose names are not all known keeps its catalog grouping.
function byNames(set, names) {
  if (!set.links.every((link) => names[link.url])) return [set];
  const live = set.links.filter((link) => names[link.url] !== DEAD);
  const groups = new Map();
  for (const link of live) {
    const name = names[link.url];
    const volume = volumeOf(name);
    const key = volume ? `v|${volume.base.toLowerCase()}` : `f|${link.url}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...link, file: name, part: volume ? volume.part : 0 });
  }
  const out = [];
  const kinds = {};
  for (const [key, links] of groups) {
    links.sort((a, b) => a.part - b.part);
    // An old-style set starts with the .rar itself: Game.rar, Game.r00, Game.r01.
    if (key.startsWith('v|') && links[0].part === 2) {
      const first = live.find((link) => names[link.url].toLowerCase() === key.slice(2));
      if (first) links.unshift({ ...first, file: names[first.url], part: 1 });
    }
    if (key.startsWith('f|') && live.some((link) => volumeOf(names[link.url])?.old && volumeOf(names[link.url]).base.toLowerCase() === names[links[0].url].toLowerCase())) continue;
    const parted = key.startsWith('v|') && links.length > 1;
    if (parted && !links.every((link, index) => link.part === index + 1)) continue; // a volume missing
    const kind = (/\.([a-z0-9]+)$/i.exec(links[0].file)?.[1] ?? 'file').toUpperCase();
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    out.push({ build: set.build, name: `${set.name} (${kind}${kinds[kind] > 1 ? ` ${kinds[kind]}` : ''})`, parted, named: true, links: parted ? links : links.map((link) => ({ ...link, part: 0 })) });
  }
  return out;
}
// A download's file name: the page's, kept to the characters a console path takes, after the game and the link.
function fileName(game, link, label) {
  if (!link.file) return `${game.id}-${slug(label).slice(0, 60) || link.build}-${tag(link.url)}`;
  const prefix = `${game.id}-${tag(link.url)}-`;
  // The end of a long name is kept: it holds ".part02.rar" or ".ffpkg".
  return prefix + link.file.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(-(150 - prefix.length));
}

// Whole sets, every build's first set before any build's second, up to max links (a first set always fits).
function pick(links, max) {
  const byBuild = new Map();
  for (const set of setsOf(links)) byBuild.set(set.build, [...(byBuild.get(set.build) ?? []), set]);
  const out = [];
  let used = 0;
  for (let round = 0; ; round++) {
    let any = false;
    for (const sets of byBuild.values()) {
      const set = sets[round];
      if (!set) continue;
      any = true;
      if (used && used + set.links.length > max) continue;
      out.push(set);
      used += set.links.length;
    }
    if (!any || used >= max) break;
  }
  return out;
}

async function main() {
  const { ids: bundledIds, urls: bundledUrls } = bundled();
  const { catalogs = [] } = await getJSON(API);
  if (!catalogs.length) throw new Error('pegasus-dl.dev listed no catalogs');
  const games = new Map();
  const counts = [];
  for (const catalog of catalogs) {
    if (!httpsURL(catalog.sourceUrl)) continue;
    let document;
    try {
      document = await getJSON(catalog.sourceUrl);
    } catch (error) {
      console.warn(`skipped ${catalog.name}: ${error.message}`);
      continue;
    }
    const packages = Array.isArray(document.packages) ? document.packages : [];
    counts.push(`${catalog.name}: ${packages.length}`);
    for (const item of packages) {
      const id = clip(item?.titleId, 9).toUpperCase();
      const title = clip(item?.title, 200);
      if (!TITLE_ID.test(id) || !title || !Array.isArray(item.downloadLinks)) continue;
      const at = Date.parse(item.createdAt) || 0;
      let game = games.get(id);
      if (!game) games.set(id, game = { id, title, at, version: '', cover: '', about: [], links: [], seen: new Set() });
      if (at >= game.at) {
        game.at = at;
        game.version = clip(item.version, 32) || game.version;
      }
      const cover = item.originalPosterUrl || item.posterUrl;
      if (!game.cover && httpsURL(cover)) game.cover = cover;
      if (!game.about.length) game.about = plain(item.description).split('\n').map((line) => clip(line, 300)).filter(Boolean).slice(0, 4);
      for (const link of item.downloadLinks) {
        const url = link?.url;
        if (!httpsURL(url) || game.seen.has(url) || bundledUrls.has(url)) continue;
        game.seen.add(url);
        const build = clip(link?.details?.buildKey, 16).toLowerCase() || 'game';
        const host = clip(link?.details?.hostLabel, 40);
        game.links.push({ url, build, host, label: clip(link?.name, 100) || [build, host].filter(Boolean).join(' - '), version: clip(item.version, 32) });
      }
    }
  }

  const candidates = [...games.values()].filter((game) => game.links.length)
    .sort((a, b) => Number(bundledIds.has(a.id)) - Number(bundledIds.has(b.id)) || b.at - a.at || a.id.localeCompare(b.id));
  // The file names of the AkiraBox and Rootz links the feed may take, read once and kept.
  let names = {};
  try { names = JSON.parse(readFileSync(NAMES, 'utf8')); } catch {}
  const wanted = candidates.slice(0, MAX_GAMES + 200).flatMap((game) => pick(game.links, bundledIds.has(game.id) ? KNOWN_GAME_LINKS : NEW_GAME_LINKS))
    .flatMap((set) => set.links.map((link) => link.url)).filter((url) => NAMED_HOST.test(new URL(url).host));
  const looked = await readNames(wanted, names);
  // Every game's store rating (tools/catalog/ratings.mjs), listed here or not: the console's Top Rated.
  let ratings = {};
  try {
    ratings = Object.fromEntries(Object.entries(JSON.parse(readFileSync(join(ROOT, 'catalog', 'ratings.json'), 'utf8')))
      .filter(([, entry]) => entry.count > 0).map(([id, entry]) => [id, [entry.stars, entry.count]]));
  } catch {}
  const out = [];
  let links = 0, bytes = 200 + Buffer.byteLength(JSON.stringify(ratings)), fresh = 0, regrouped = 0;
  for (const game of candidates) {
    if (out.length >= MAX_GAMES || links >= MAX_LINKS) break;
    const known = bundledIds.has(game.id);
    const chosen = pick(game.links, Math.min(known ? KNOWN_GAME_LINKS : NEW_GAME_LINKS, MAX_LINKS - links)).flatMap((set) => {
      if (!set.links.some((link) => NAMED_HOST.test(new URL(link.url).host))) return [set];
      const split = byNames(set, names);
      if (split[0] !== set) regrouped++;
      return split;
    });
    if (!chosen.length) continue;
    const entry = {
      id: game.id,
      title: game.title,
      ...(known ? {} : { art: game.cover ? { cover: game.cover } : {}, summary: game.about.slice(0, 2).join(' ').slice(0, 300), about: game.about }),
      releases: chosen.flatMap((set) => set.links.map((link) => ({
        url: link.url,
        // Hosts name files "file" or nothing at all: the download is named after the game and the link instead.
        filename: fileName(game, link, link.label),
        label: set.named ? (link.part ? `${set.name} part ${link.part}` : set.name) : link.label,
        ...(link.part ? { volume: `part ${link.part}` } : {}),
        ...(link.host ? { provider: link.host.toLowerCase() } : {}),
        ...(link.version ? { version: link.version } : {}),
        category: link.build === 'dlc' ? 'dlc' : 'game',
        ...(link.build === 'fpkg' ? { format: 'fpkg' } : {}),
        requiresBrowser: true,
        // The volumes of one set share a record; any other link is a set of its own (hosts of one build are alternatives).
        record: set.parted ? `live-${game.id.toLowerCase()}-${tag(`${set.build}|${set.name}`)}` : `live-${game.id.toLowerCase()}-${tag(link.url)}`,
      }))),
    };
    const size = Buffer.byteLength(JSON.stringify(entry)) + 1;
    if (bytes + size > MAX_BYTES) break;
    bytes += size;
    links += entry.releases.length;
    if (!known) fresh++;
    out.push(entry);
  }

  const feed = { version: 1, name: "Jobee'sLair live catalog", source: 'pegasus-dl.dev', ratings, games: out };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(feed)}\n`);
  writeFileSync(NAMES, `${JSON.stringify(Object.fromEntries(Object.entries(names).sort()), null, 0)}\n`);
  console.log(`catalogs: ${counts.join(', ')}`);
  console.log(`ratings: ${Object.keys(ratings).length} games`);
  console.log(`file names: ${Object.keys(names).length} known (${looked} pages read this run), ${regrouped} sets regrouped by them`);
  console.log(`wrote catalog/live.json: ${out.length} games (${fresh} new to the app), ${links} links, ${(bytes / 1048576).toFixed(2)} MiB; ${candidates.length - out.length} left for a later run`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
