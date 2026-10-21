#!/usr/bin/env node
// Builds homebrew/index.json, the Homebrew section's catalog, from nexgen999's PS5 Repository List (read live on
// every run; with nexgen999's permission, 2026-10-19) and homebrew/sources.json (the repositories
// we list and the category each goes in) and each repository's own GitHub data: its description, licence
// and stars, its newest release and the files in it, and its own art. Nothing is copied or rehosted: every
// file and image in the index is a link to the author's own repository or release.
//
//   node tools/homebrew/build-index.mjs            (GITHUB_TOKEN or GH_TOKEN raises GitHub's rate limit)
//
// For each repository:
//   - the release: the newest one that is not a draft (many PS5 projects only publish pre-releases);
//   - its files, sorted into what the console can do with them: a disk image ShadowMount+ mounts
//     (.exfat .ffpkg .ffpfs .ffpfsc), an app folder in a .zip (sce_sys/param.json and eboot.bin), a payload
//     for the ELF loader (.elf .bin), a package (.pkg) or an archive holding one of those. PC, phone and
//     PS4 builds, checksums and sources are left out; an archive is looked inside (a .zip by reading only
//     its central directory) to know which it is;
//   - its art, each image fetched and checked to be a PNG or JPEG the console decodes, at a size it can
//     draw: the icon (the app's own sce_sys/icon0.png first), a wide background (sce_sys/pic0/pic1, else a
//     screenshot from the README) and up to four screenshots from the README; the owner's avatar when the
//     repository has no icon;
//   - the name: the app's own title (sce_sys/param.json), else the README's heading, else the repository's.
// A repository with no release, or whose release holds nothing the PS5 runs, is left out and reported.
// homebrew/cache.json keeps what does not change between runs (archive listings, image checks, README
// and tree reads per commit), so the daily run stays well inside GitHub's limits.
//
// The repositories: those homebrew/sources.json lists, in its categories, then every other one the PS5 Repository
// List lists (its repos-config.json, which it keeps up to date every hour), each in the category
// sources.json "upstream.categories" maps its category to (null: not listed, as for PC tools). A repository
// in sources.json "exclude" is never listed. Two names for one repository (a renamed or moved one) are listed
// once, as sources.json names it. If the list cannot be read, the run goes on with sources.json alone.
//
// Writes homebrew/index.json and app/data/homebrew.json (the copy shipped in the app, used until the live
// index is fetched).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const SOURCES = path.join(ROOT, 'homebrew/sources.json');
const CACHE = path.join(ROOT, 'homebrew/cache.json');
const OUTPUTS = [path.join(ROOT, 'homebrew/index.json'), path.join(ROOT, 'app/data/homebrew.json')];
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const UA = 'JobeesLair-homebrew-index (+https://github.com/JVK3R/JobeesLair)';
const PARALLEL = 6;
// Raised when what is kept per repository changes, so the cache is read again.
const META_VERSION = 2;

const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
for (const key of ['archives', 'images', 'repos']) cache[key] ??= {};
const used = { archives: new Set(), images: new Set(), repos: new Set() };

// GitHub's API, with the token when there is one. 404 is null; anything else not OK throws.
async function api(route) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`https://api.github.com${route}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': UA, ...(TOKEN && { authorization: `Bearer ${TOKEN}` }) },
    });
    if (response.status === 404 || response.status === 451) return null;
    if (response.ok) return response.json();
    if (attempt < 2 && response.status >= 500) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    throw new Error(`GitHub ${route}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
}

// Bytes [start, end] of a URL (redirects followed), or null.
async function range(url, start, end) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': UA, range: `bytes=${start}-${end}` }, redirect: 'follow' });
    if (!response.ok) return null;
    const total = Number((response.headers.get('content-range') || '').split('/')[1]) || Number(response.headers.get('content-length')) || 0;
    return { bytes: Buffer.from(await response.arrayBuffer()), total, type: response.headers.get('content-type') || '', status: response.status };
  } catch {
    return null;
  }
}

async function text(url) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': UA } });
    return response.ok ? response.text() : null;
  } catch {
    return null;
  }
}

// ---- Files ---------------------------------------------------------------------------------------------

const IMAGE = /\.(exfat|ffpkg|ffpfs|ffpfsc)$/i;
const ARCHIVE = /\.(zip|7z|rar|tar\.gz|tgz|tar\.xz|tar\.bz2)$/i;
// Not for the console: checksums, notes, art, PC and phone installers, libraries, other consoles' files.
const NOT_CONSOLE = /\.(sha\d*|md5|sig|asc|txt|md|json|log|html?|png|jpe?g|webp|avif|gif|svg|mp4|ini|py|sh|pem|patch|a|prx|sprx|skprx|plugin|nro|apk|aab|ipa|exe|msi|dmg|deb|rpm|appimage|ipk|adb|gz\.sha256)$|\.pkg\.tar\.\w+$|^packages(\.\w+)?$/i;
// An archive built for a computer or a phone, or the project's source code.
const PC_ARCHIVE = /(^|[-_. ])(windows|win32|win64|win-x64|x86[-_]64|amd64|arm64|aarch64|macos|osx|darwin|linux|ubuntu|android|ios|source|sources|src|symbols|desktop|portable|frontend-|host-|keys)([-_. ]|$)|redump/i;
const PS4 = /(^|[-_. ])ps4([-_. ]|$)/i;
const NOT_PS5 = /esp32|\.pico\.|arduino/i;

// What the console can do with a release file, from its name alone: null when nothing.
function kindByName(name) {
  if (NOT_CONSOLE.test(name) || PS4.test(name) || NOT_PS5.test(name)) return null;
  if (IMAGE.test(name)) return 'image';
  if (/\.(elf|bin)$/i.test(name)) return 'payload';
  if (/\.f?pkg$/i.test(name)) return 'pkg';
  if (ARCHIVE.test(name)) return PC_ARCHIVE.test(name) ? null : 'archive';
  return null;
}

// A .zip's file names, from its central directory (the end of the file): two small range reads.
async function zipNames(url, size) {
  const tailSize = Math.min(size, 65_557);
  const tail = await range(url, size - tailSize, size - 1);
  if (!tail || tail.bytes.length < 22) return null;
  const b = tail.bytes;
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  let count = b.readUInt16LE(eocd + 10), cdSize = b.readUInt32LE(eocd + 12), cdOffset = b.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff || count === 0xffff) {
    // ZIP64: the locator just before the end record points at the ZIP64 end record.
    const loc = eocd - 20;
    if (loc < 0 || b.readUInt32LE(loc) !== 0x07064b50) return null;
    const z64 = Number(b.readBigUInt64LE(loc + 8));
    const rec = await range(url, z64, z64 + 55);
    if (!rec || rec.bytes.readUInt32LE(0) !== 0x06064b50) return null;
    count = Number(rec.bytes.readBigUInt64LE(32)); cdSize = Number(rec.bytes.readBigUInt64LE(40)); cdOffset = Number(rec.bytes.readBigUInt64LE(48));
  }
  const tailStart = size - tailSize;
  let cd;
  if (cdOffset >= tailStart && cdOffset + cdSize <= size) cd = b.subarray(cdOffset - tailStart, cdOffset - tailStart + cdSize);
  else {
    if (cdSize > 8 * 1024 * 1024) return null;
    const read = await range(url, cdOffset, cdOffset + cdSize - 1);
    if (!read) return null;
    cd = read.bytes;
  }
  const names = [];
  for (let at = 0; at + 46 <= cd.length && names.length < count; ) {
    if (cd.readUInt32LE(at) !== 0x02014b50) break;
    const nameLength = cd.readUInt16LE(at + 28), extra = cd.readUInt16LE(at + 30), comment = cd.readUInt16LE(at + 32);
    const usize = cd.readUInt32LE(at + 24);
    names.push([cd.subarray(at + 46, at + 46 + nameLength).toString('utf8'), usize]);
    at += 46 + nameLength + extra + comment;
  }
  return names;
}

// Another archive's file names, by downloading it (only when small) and listing it with bsdtar or 7z.
async function otherNames(url, size, name) {
  if (size > 80 * 1024 * 1024) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  const file = path.join(dir, name.replace(/[^\w.-]/g, '_'));
  try {
    const response = await fetch(url, { headers: { 'user-agent': UA } });
    if (!response.ok) return null;
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    for (const [tool, args] of [['bsdtar', ['-tf', file]], ['tar', ['-tf', file]], ['7z', ['l', '-ba', '-slt', file]]]) {
      try {
        const out = execFileSync(tool, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
        if (tool === '7z') return out.split('\n').filter((l) => l.startsWith('Path = ')).map((l) => [l.slice(7).trim(), 0]);
        return out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => [l, 0]);
      } catch {}
    }
    return null;
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// What an archive holds for the console: an app folder (the folder with sce_sys/param.json beside an
// eboot.bin), a disk image, payloads or a package, by the paths inside it.
function insideOf(names) {
  const paths = names.map(([p]) => p.replace(/\\/g, '/')).filter((p) => !p.endsWith('/') && !p.startsWith('__MACOSX/'));
  const params = paths.filter((p) => /(^|\/)sce_sys\/param\.json$/i.test(p));
  for (const param of params) {
    const folder = param.replace(/sce_sys\/param\.json$/i, '');
    if (paths.some((p) => p.toLowerCase() === `${folder}eboot.bin`.toLowerCase())) return { kind: 'app', folder: folder.replace(/\/$/, '') };
  }
  const image = paths.find((p) => IMAGE.test(p));
  if (image) return { kind: 'archive-image', inner: image };
  const payloads = paths.filter((p) => /\.elf$/i.test(p) && !PS4.test(p));
  if (payloads.length) return { kind: 'archive-payload', inner: payloads.sort((a, b) => payloadRank(b) - payloadRank(a))[0], payloads: payloads.slice(0, 8) };
  const pkg = paths.find((p) => /\.f?pkg$/i.test(p));
  if (pkg) return { kind: 'archive-pkg', inner: pkg };
  return null;
}

// A payload that starts the tool beats one that stops it, reports on it or probes for it.
function payloadRank(name) {
  const base = name.toLowerCase().replace(/^.*\//, '');
  let score = 0;
  if (/install/.test(base)) score += 2;
  if (/(^|[-_.])(stop|status|probe|uninstall|log|test|offsets|debug|notify|helper|klog|dump_main|info)([-_.]|$)/.test(base)) score -= 3;
  return score - base.length / 100;
}

const KIND_RANK = { image: 10, app: 9, 'archive-image': 8, payload: 6, 'archive-payload': 5, pkg: 3, 'archive-pkg': 2 };
const IMAGE_RANK = { exfat: 4, ffpkg: 3, ffpfs: 2, ffpfsc: 1 };
function fileRank(file) {
  let score = KIND_RANK[file.kind] * 10;
  if (file.kind === 'image') score += IMAGE_RANK[file.name.split('.').pop().toLowerCase()] || 0;
  if (file.kind === 'payload') score += payloadRank(file.name);
  return score;
}

async function filesOf(release) {
  const files = [];
  for (const asset of release.assets || []) {
    let kind = kindByName(asset.name);
    if (!kind) continue;
    const file = { name: asset.name, kind, size: asset.size, url: asset.browser_download_url, downloads: asset.download_count };
    if (kind === 'archive') {
      const key = `${asset.id}:${asset.updated_at}`;
      used.archives.add(key);
      let inside = cache.archives[key];
      if (inside === undefined) {
        const names = /\.zip$/i.test(asset.name) ? await zipNames(asset.browser_download_url, asset.size) : await otherNames(asset.browser_download_url, asset.size, asset.name);
        inside = names ? insideOf(names) : null;
        cache.archives[key] = inside;
      }
      if (!inside) continue;
      Object.assign(file, inside);
    }
    files.push(file);
  }
  return files.sort((a, b) => fileRank(b) - fileRank(a));
}

// ---- Art -----------------------------------------------------------------------------------------------

// Width and height of a PNG or JPEG from its first bytes, or null when it is neither.
function dimensions(bytes) {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 9 < bytes.length; ) {
      if (bytes[at] !== 0xff) { at++; continue; }
      const marker = bytes[at + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
      const length = bytes.readUInt16BE(at + 2);
      // Every SOF marker except DHT (c4), JPG (c8) and DAC (cc).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        // Arithmetic-coded JPEGs (SOF9 and up) are not decoded by stb_image.
        if (marker > 0xc2) return null;
        return { format: 'jpeg', width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      }
      at += 2 + length;
    }
  }
  return null;
}

// Fetches an image's start and checks it: PNG or JPEG, its size, its pixels. Cached by URL (and blob).
async function probe(url, key = url) {
  used.images.add(key);
  if (cache.images[key] !== undefined) return cache.images[key];
  let info = null;
  const head = await range(url, 0, 256 * 1024 - 1);
  if (head && !/text\/html/i.test(head.type)) {
    const dims = dimensions(head.bytes);
    if (dims) info = { url, ...dims, bytes: head.total || head.bytes.length };
  }
  cache.images[key] = info;
  return info;
}

// What the console takes: the decoder's area budget (40 MB at 8 bytes a pixel) and a download that does
// not hold up the page.
const fits = (info, maxBytes) => info && info.width * info.height <= 4.5e6 && info.width <= 4096 && info.height <= 4096 && info.bytes <= maxBytes;

const ART_SKIP = /(^|\/)(third[_-]?party|external|extern|deps|dependenc|vendor|node_modules|samples?|examples?|test|tests|addons|ps5-payload-sdk|sdk|res\/icons|icons_4k|xcassets|docs\/screenshots|\.github|homebrew|handoff)(\/|$)/i;
function iconScore(file) {
  const lower = file.toLowerCase(), base = lower.replace(/^.*\//, '');
  if (ART_SKIP.test(lower)) return -1;
  let score = 0;
  if (base === 'icon0.png') score = 100;
  else if (/^icon0[-_.]/.test(base)) score = 80;
  else if (/^icon[-_]?(512|1024|256)\.(png|jpe?g)$/.test(base)) score = 85;
  else if (/^icon\.(png|jpe?g)$/.test(base)) score = 70;
  else if (/^(logo[-_]?square|app[-_]?icon|appicon)/.test(base)) score = 65;
  else if (/^logo\.(png|jpe?g)$/.test(base)) score = 50;
  else if (/(^|[-_.])icon([-_.]|$)/.test(base) && !/(back|close|copy|folder|file|arrow|archive|check|menu|search|settings)/.test(base)) score = 45;
  else return -1;
  if (/(^|\/)sce_sys\//.test(lower)) score += 25;
  if (/source/.test(base)) score -= 15;
  return score - lower.split('/').length * 2;
}
// A wordmark or banner, drawn whole on a tile when the project has no square icon.
function logoScore(file) {
  const lower = file.toLowerCase(), base = lower.replace(/^.*\//, '');
  if (ART_SKIP.test(lower) || !/\.(png|jpe?g)$/.test(base) || !/(logo|banner|brand|wordmark|kapak|cover|title|header|hero)/.test(base)) return -1;
  return (/logo/.test(base) ? 10 : 5) - lower.split('/').length;
}
function heroScore(file) {
  const lower = file.toLowerCase(), base = lower.replace(/^.*\//, '');
  if (ART_SKIP.test(lower) || !/^pic[01](\.|[-_])/.test(base) || !/\.(png|jpe?g)$/.test(base)) return -1;
  return (/(^|\/)sce_sys\//.test(lower) ? 20 : 0) + (base.startsWith('pic0') ? 2 : 1) - lower.split('/').length;
}

const raw = (full, branch, file) => `https://raw.githubusercontent.com/${full}/${encodeURIComponent(branch)}/${file.split('/').map(encodeURIComponent).join('/')}`;

// Images in a README, in document order: markdown images and <img> tags, made absolute, each with its
// alt text and whether it comes before the README's first section heading (where a logo or banner sits).
// Badges and animations are left out.
function readmeImages(markdown, full, branch, readmePath) {
  const found = [];
  const base = readmePath.includes('/') ? readmePath.replace(/[^/]+$/, '') : '';
  const firstSection = markdown.search(/^##\s/m);
  const add = (src, alt, at) => {
    src = src.trim().replace(/^<|>$/g, '').split(/\s+/)[0];
    if (!src || /shields\.io|badge|badgen|img\.shields|buymeacoffee|ko-fi|paypal|patreon|discord|\.svg(\?|$)|\.gif(\?|$)|\.webp(\?|$)|star-history|contrib\.rocks|visitor|hits\.|komarev|githubusercontent\.com\/u\//i.test(src)) return;
    let url = src;
    if (/^https?:\/\/github\.com\/[^/]+\/[^/]+\/(blob|raw)\//.test(url)) url = url.replace(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/(?:blob|raw)\//, 'https://raw.githubusercontent.com/$1/');
    else if (!/^https?:\/\//i.test(url)) {
      if (url.startsWith('data:') || url.startsWith('#')) return;
      const joined = path.posix.normalize(url.startsWith('/') ? url.slice(1) : base + url.replace(/^\.\//, ''));
      if (joined.startsWith('..')) return;
      url = raw(full, branch, joined.split('?')[0]);
    }
    if (!found.some((item) => item.url === url)) found.push({ url, alt: alt || '', early: firstSection < 0 || at < firstSection });
  };
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)|<img\b([^>]*)>/gi)) {
    if (match[2]) add(match[2], match[1], match.index);
    else {
      const src = match[3].match(/\bsrc\s*=\s*["']([^"']+)["']/i), alt = match[3].match(/\balt\s*=\s*["']([^"']*)["']/i);
      if (src) add(src[1], alt?.[1], match.index);
    }
  }
  return found.slice(0, 12);
}

// ---- Text ----------------------------------------------------------------------------------------------

// Markdown to plain paragraphs: no markup, links as their words, code and tables and HTML left out.
function plain(markdown, limit) {
  const lines = markdown.replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '').split('\n');
  const out = [];
  for (let line of lines) {
    line = line.trim();
    if (/^(\||<|!\[|\[!\[|-{3,}|={3,}|\*{3,})/.test(line)) { if (out.at(-1) !== '') out.push(''); continue; }
    line = line.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '')
      .replace(/`([^`]*)`/g, '$1').replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
      .replace(/^#{1,6}\s*/, '').replace(/^>\s?/, '').replace(/^[-*+]\s+/, '• ').replace(/^\d+\.\s+/, (m) => m)
      .replace(/:[a-z0-9_+-]+:/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();
    if (!line) { if (out.length && out.at(-1) !== '') out.push(''); continue; }
    out.push(line);
  }
  let textOut = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (textOut.length > limit) textOut = `${textOut.slice(0, limit).replace(/\s+\S*$/, '')}…`;
  return textOut;
}

// The README's opening prose: its first paragraphs that are sentences, not headings, lists or links.
function about(markdown, limit) {
  const paragraphs = plain(markdown, 20_000).split(/\n{2,}/).map((p) => p.trim())
    .filter((p) => p.length > 60 && /[a-z]{3}/.test(p) && !/^•/.test(p) && !/^(table of contents|contents|installation|install|build|building|credits|license)\b/i.test(p)
      && !/coffee|ko-?fi|patreon|paypal|donat|sponsor/i.test(p));
  let out = '';
  for (const p of paragraphs) {
    if (out.length + p.length > limit) { if (!out) out = `${p.slice(0, limit).replace(/\s+\S*$/, '')}…`; break; }
    out += (out ? '\n\n' : '') + p;
    if (out.length > limit * 0.6) break;
  }
  return out;
}

function headingName(markdown) {
  for (const line of markdown.replace(/\r/g, '').split('\n')) {
    const match = line.match(/^#\s+(.+)$/) || line.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (!match) continue;
    const name = match[1].replace(/<[^>]+>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/[*_`]/g, '').trim();
    if (name && name.length <= 40 && !/readme/i.test(name)) return name;
    return null;
  }
  return null;
}

const prettyRepo = (name) => name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
const ms = (iso) => (iso ? Date.parse(iso) : null);

// ---- The repositories to look at -----------------------------------------------------------------------

const lower = (repo) => repo.toLowerCase();
const excluded = new Set((sources.exclude || []).map(lower));
async function upstreamApps() {
  const upstream = sources.upstream;
  if (!upstream) return [];
  try {
    const response = await fetch(upstream.config, { headers: { 'user-agent': UA } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    const names = Object.fromEntries((config.categories || []).map((category) => [category.id, category.name]));
    const ours = new Set(sources.apps.map((source) => lower(source.repo)));
    const added = [];
    for (const entry of config.repos || []) {
      const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(entry.url || '');
      const category = upstream.categories[names[entry.categoryId]];
      if (!match || !category || ours.has(lower(match[1])) || excluded.has(lower(match[1]))) continue;
      ours.add(lower(match[1]));
      added.push({ repo: match[1], category, upstream: true });
    }
    const unmapped = [...new Set(Object.values(names))].filter((name) => !(name in upstream.categories));
    if (unmapped.length) console.log(`${upstream.name}: categories with no mapping (left out): ${unmapped.join(', ')}`);
    console.log(`${upstream.name}: ${config.repos?.length ?? 0} repositories, ${added.length} not in sources.json`);
    return added;
  } catch (error) {
    console.log(`${upstream.name} not read (${error.message}): sources.json alone this run`);
    return [];
  }
}
const listed = [...sources.apps.filter((source) => !excluded.has(lower(source.repo))), ...await upstreamApps()];

// ---- One repository ------------------------------------------------------------------------------------

async function build(source) {
  const repo = await api(`/repos/${source.repo}`);
  if (!repo) return { skip: 'repository not found' };
  const full = repo.full_name;
  if (excluded.has(lower(full))) return { skip: 'excluded' };
  const releases = (await api(`/repos/${full}/releases?per_page=6`)) || [];
  const release = releases.find((r) => !r.draft);
  if (!release) return { skip: 'no release' };
  const files = await filesOf(release);
  if (source.files) {
    const keep = new RegExp(source.files, 'i');
    files.splice(0, files.length, ...files.filter((f) => keep.test(f.name)));
  }
  if (!files.length) return { skip: `release ${release.tag_name} has nothing the PS5 runs` };

  // README and tree, read again only when the repository changed.
  const key = full.toLowerCase();
  used.repos.add(key);
  let meta = cache.repos[key];
  if (!meta || meta.pushed !== repo.pushed_at || meta.v !== META_VERSION) {
    const readme = await api(`/repos/${full}/readme`);
    const tree = await api(`/repos/${full}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`);
    const paths = tree ? tree.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.size, t.sha]) : [];
    const art = paths.filter(([p]) => /\.(png|jpe?g)$/i.test(p) && (iconScore(p) >= 0 || heroScore(p) >= 0 || logoScore(p) >= 0));
    const params = paths.filter(([p]) => /(^|\/)sce_sys\/param\.json$/i.test(p) && !ART_SKIP.test(p)).sort((a, b) => a[0].split('/').length - b[0].split('/').length);
    let title = null;
    if (params.length) {
      const json = await text(raw(full, repo.default_branch, params[0][0]));
      try {
        const param = JSON.parse(json);
        const local = param.localizedParameters || {};
        title = local['en-US']?.titleName || local[local.defaultLanguage]?.titleName || Object.values(local).find((v) => v?.titleName)?.titleName || null;
      } catch {}
    }
    meta = {
      v: META_VERSION,
      pushed: repo.pushed_at,
      readme: readme ? { path: readme.path, text: Buffer.from(readme.content || '', 'base64').toString('utf8').slice(0, 60_000) } : null,
      art,
      title,
    };
    cache.repos[key] = meta;
  }
  const branch = repo.default_branch;
  const markdown = meta.readme?.text || '';

  // The icon: the best-scored square-ish image from the tree that checks out, else a README image that
  // is square, else the owner's avatar.
  let icon = null;
  for (const [p, size, sha] of meta.art.filter(([p]) => iconScore(p) >= 0).sort((a, b) => iconScore(b[0]) - iconScore(a[0])).slice(0, 4)) {
    if (size > 3_000_000) continue;
    const info = await probe(raw(full, branch, p), `${full}:${p}:${sha}`);
    if (fits(info, 3_000_000) && info.width >= 96 && Math.abs(info.width / info.height - 1) < 0.35) { icon = info; break; }
  }
  const pictures = [];
  for (const image of readmeImages(markdown, full, branch, meta.readme?.path || 'README.md')) {
    if (pictures.length >= 8) break;
    const info = await probe(image.url);
    if (fits(info, 3_500_000) && info.width >= 240) pictures.push({ ...info, alt: image.alt, early: image.early });
  }
  if (!icon) icon = pictures.find((p) => Math.abs(p.width / p.height - 1) < 0.2 && p.width >= 128) || null;
  // No square icon: the project's logo or banner, drawn whole ("contain") on a tile. The README's first
  // picture is usually it; else a file named like one.
  let logo = null;
  if (!icon) {
    // The README's opening picture, or one named or captioned as a logo or banner. One shaped like a
    // screen capture is a screenshot, not a logo.
    const BRAND = /logo|banner|brand|icon|title|header|kapak|hero|wordmark/i;
    logo = pictures.find((p, i) => {
      const aspect = p.width / p.height;
      return aspect < 6 && !(aspect > 1.3 && aspect < 1.9 && p.width >= 1200 && !BRAND.test(p.alt + p.url)) && ((i === 0 && p.early) || BRAND.test(p.alt + p.url.replace(/^.*\//, '')));
    }) || null;
    for (const [p, size, sha] of logo ? [] : meta.art.filter(([p]) => logoScore(p) >= 0).sort((a, b) => logoScore(b[0]) - logoScore(a[0])).slice(0, 3)) {
      if (size > 3_000_000) continue;
      const info = await probe(raw(full, branch, p), `${full}:${p}:${sha}`);
      if (fits(info, 3_000_000) && info.width >= 160 && info.width / info.height < 6) { logo = info; break; }
    }
  }
  let avatar = false;
  if (!icon && !logo) {
    const info = await probe(`https://avatars.githubusercontent.com/u/${repo.owner.id}?s=256&v=4`, `avatar:${repo.owner.id}`);
    if (fits(info, 2_000_000)) { icon = info; avatar = true; }
  }
  // The wide picture: the app's own background, else a wide README screenshot.
  let hero = null;
  for (const [p, size, sha] of meta.art.filter(([p]) => heroScore(p) >= 0).sort((a, b) => heroScore(b[0]) - heroScore(a[0])).slice(0, 2)) {
    if (size > 3_500_000) continue;
    const info = await probe(raw(full, branch, p), `${full}:${p}:${sha}`);
    if (fits(info, 3_500_000) && info.width >= 1000 && info.width / info.height > 1.4) { hero = info; break; }
  }
  const wide = pictures.filter((p) => p.width / p.height > 1.25 && p.width >= 640 && p.url !== icon?.url && p.url !== logo?.url);
  if (!hero && wide.length) hero = wide[0];
  const shots = wide.filter((p) => p.url !== hero?.url).slice(0, 4);

  const name = source.name || meta.title || headingName(markdown) || prettyRepo(repo.name);
  const total = files.reduce((sum, f) => sum + (f.downloads || 0), 0);
  return {
    app: {
      id: key,
      repo: full,
      name: name.slice(0, 48),
      author: repo.owner.login,
      category: source.category,
      description: (source.description || repo.description || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      about: about(markdown, 900),
      stars: repo.stargazers_count,
      license: repo.license && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : null,
      homepage: repo.homepage || null,
      pushed: ms(repo.pushed_at),
      icon: icon ? icon.url : null,
      iconFromAvatar: avatar || undefined,
      logo: logo ? logo.url : undefined,
      hero: hero ? hero.url : null,
      shots: shots.map((s) => s.url),
      release: {
        tag: release.tag_name,
        title: (release.name || release.tag_name).slice(0, 80),
        date: ms(release.published_at || release.created_at),
        prerelease: release.prerelease || undefined,
        notes: plain(release.body || '', 1500),
        url: release.html_url,
        downloads: total,
      },
      files: files.slice(0, 12).map((f) => ({ name: f.name, kind: f.kind, size: f.size, url: f.url, ...(f.folder !== undefined && { folder: f.folder }), ...(f.inner && { inner: f.inner }) })),
      note: source.note || undefined,
      with: source.with || undefined,
    },
  };
}

// ---- Run -----------------------------------------------------------------------------------------------

const apps = [], skipped = [];
const queue = listed.map((source, index) => ({ source, index }));
const results = new Array(queue.length);
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  for (let item; (item = queue.shift()); ) {
    try {
      results[item.index] = await build(item.source);
    } catch (error) {
      results[item.index] = { skip: `failed: ${error.message}` };
    }
    const done = results.filter(Boolean).length;
    if (done % 25 === 0) console.log(`${done}/${listed.length}`);
  }
}));
// A repository under two names (moved or renamed: GitHub answers both with its one current name) is listed once,
// the first time: as sources.json has it.
const ids = new Set();
results.forEach((result, index) => {
  if (!result.app) skipped.push(`${listed[index].repo}: ${result.skip}`);
  else if (ids.has(result.app.id)) skipped.push(`${listed[index].repo}: listed already as ${result.app.repo}`);
  else {
    ids.add(result.app.id);
    apps.push(result.app);
  }
});

// Prune the cache to what this run used, so it never grows without bound.
for (const key of ['archives', 'images', 'repos']) for (const k of Object.keys(cache[key])) if (!used[key].has(k)) delete cache[key][k];
fs.writeFileSync(CACHE, `${JSON.stringify(cache)}\n`);

// The time it was built changes only with what it lists, so a daily run that finds nothing new changes nothing.
const previous = (() => {
  try {
    return JSON.parse(fs.readFileSync(OUTPUTS[0], 'utf8'));
  } catch {
    return null;
  }
})();
const same = previous && JSON.stringify(previous.apps) === JSON.stringify(apps) && JSON.stringify(previous.categories) === JSON.stringify(sources.categories);
const index = {
  version: 1,
  generated: same ? previous.generated : Date.now(),
  source: 'https://github.com/JVK3R/JobeesLair/tree/main/homebrew',
  ...(sources.upstream && { list: { name: sources.upstream.name, author: sources.upstream.author, url: sources.upstream.url } }),
  categories: sources.categories,
  apps,
};
const body = `${JSON.stringify(index)}\n`;
for (const file of OUTPUTS) fs.writeFileSync(file, body);
console.log(`${apps.length} apps (${(body.length / 1024).toFixed(0)} KiB), ${apps.filter((a) => a.icon && !a.iconFromAvatar).length} with their own icon, ${apps.filter((a) => a.logo).length} with a logo, ${apps.filter((a) => a.iconFromAvatar).length} with the owner's avatar, ${apps.filter((a) => !a.icon).length} without, ${apps.filter((a) => a.hero).length} with a wide picture`);
if (skipped.length) console.log(`left out:\n  ${skipped.join('\n  ')}`);
