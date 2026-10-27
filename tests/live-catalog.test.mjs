// 0.5.1: the Pegasus catalog format, and the live catalog built from it (catalog/live.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { parseFeed } = await import('../app/state/feed-format.js');

const pegasus = {
  name: 'Test catalog',
  version: 1,
  packages: [
    {
      titleId: 'PPSA11111', title: 'Big Game', version: 'v01.002', category: 'game',
      originalPosterUrl: 'https://image.api.playstation.com/cover.png',
      description: '<p>Builds: Dump</p><p>Size: 80GB &amp; more</p>',
      downloadLinks: [
        { name: 'EUR Base - Akirabox part 1', url: 'https://akirabox.com/aaa/file' },
        { name: 'EUR Base - Akirabox part 2', url: 'https://akirabox.com/bbb/file' },
        { name: 'Dump - VikingFile', url: 'https://vikingfile.com/f/ccc', details: { buildKey: 'dump', hostLabel: 'VikingFile' } },
        { name: 'Dump - DataNodes', url: 'https://datanodes.to/ddd/game.7z', details: { buildKey: 'dump', hostLabel: 'DataNodes' } },
      ],
    },
    // The same game in another catalog: its links join the first entry, a repeated link only once.
    {
      titleId: 'PPSA11111', title: 'Big Game', version: 'v01.002',
      downloadLinks: [
        { name: 'Dump - VikingFile', url: 'https://vikingfile.com/f/ccc' },
        { name: 'DLC - DataVaults', url: 'https://datavaults.co/eee/dlc.rar', details: { buildKey: 'dlc', hostLabel: 'DataVaults' } },
      ],
    },
  ],
};

test('a Pegasus catalog reads as a feed: games merged by title ID, parts kept together, hosts kept apart', () => {
  const feed = parseFeed(pegasus, 'https://pegasus-dl.dev/catalogs/test.json');
  assert.equal(feed.games.length, 1);
  const { game, page, releases } = feed.games[0];
  assert.equal(game.title, 'Big Game');
  assert.equal(game.art.cover, 'https://image.api.playstation.com/cover.png');
  assert.deepEqual(page.about, ['Builds: Dump', 'Size: 80GB & more']);
  assert.equal(releases.length, 5, 'four links, plus the DLC from the second listing; the repeated link once');
  const [part1, part2, viking, nodes, dlc] = releases;
  assert.equal(part1.record, part2.record, 'the volumes of one set share a record');
  assert.deepEqual([part1.volume, part2.volume], ['part 1', 'part 2']);
  assert.notEqual(viking.record, nodes.record, 'two hosts of one build are alternatives, not parts');
  assert.notEqual(viking.record, part1.record);
  assert.ok(releases.every((release) => release.filename !== 'file' && release.filename.startsWith('ppsa11111')), 'no download named "file"');
  assert.equal(dlc.category, 'dlc');
  assert.ok(releases.every((release) => release.requiresBrowser));
});

test('the live catalog parses whole, within the console limits, with every multi-part set complete', () => {
  const raw = readFileSync(new URL('../catalog/live.json', import.meta.url), 'utf8');
  assert.ok(raw.length <= 2 * 1024 * 1024, 'under the 2 MiB a feed may be');
  const document = JSON.parse(raw);
  const feed = parseFeed(document, 'https://raw.githubusercontent.com/JVK3R/JobeesLair/main/catalog/live.json');
  assert.ok(feed.games.length > 100);
  assert.equal(feed.skipped, 0, 'nothing in it is dropped by the app');
  const sets = new Map();
  for (const { releases } of feed.games) {
    for (const release of releases) if (release.volume) sets.set(release.record, [...(sets.get(release.record) ?? []), release.volume]);
  }
  for (const [record, volumes] of sets) assert.deepEqual(volumes, volumes.map((_, index) => `part ${index + 1}`), record);
});

// 0.5.3: 26 bundled games had no cover ("cover": null) and showed only their name where the picture goes (7 Days to
// Die, Alien: Rogue Incursion...). The live catalog's own games take theirs from the PlayStation Store (artOf).
test('every game has a picture: the bundled ones, and the ones only the live catalog lists', async () => {
  const { games } = await import('../app/data/catalog.js');
  assert.deepEqual(games.filter((game) => !game.art?.cover).map((game) => `${game.id} ${game.title}`), []);
  for (const game of games) {
    for (const url of [game.art.cover, ...game.art.coverFallbacks ?? []]) assert.match(url, /^https:\/\/[^\s"]+$/, game.id);
    assert.doesNotMatch(game.art.cover, /\.webp(\?|$)/i, `${game.id}: the console can't draw WebP`);
  }
  const live = JSON.parse(readFileSync(new URL('../catalog/live.json', import.meta.url), 'utf8')).games.filter((game) => game.art);
  assert.deepEqual(live.filter((game) => !game.art.cover).map((game) => game.id), []);
});

test('the app reads the live catalog without the player adding it, and keeps a place for it', () => {
  const source = readFileSync(new URL('../app/state/feeds.js', import.meta.url), 'utf8');
  assert.match(source, /LIVE_FEED = "https:\/\/raw\.githubusercontent\.com\/JVK3R\/JobeesLair\/main\/catalog\/live\.json"/);
  assert.match(source, /for \(const url of allFeeds\(\)\) \{\n\s+const cache = readCache/);
  assert.match(source, /for \(const url of allFeeds\(\)\) await refreshFeed\(url\)/);
  assert.match(source, /MAX_FEEDS = 3/);
});

// ---- 0.5.1 Pre Release 1: AkiraBox sets by their file names, Rootz without the browser, store ratings ----
const { createSourceResolver, sourceKind, RESOLVED_KINDS } = await import('../app/state/download-sources.js');
const { hostStanding } = await import('../app/state/capture-hosts.js');
const { feedDocument } = await import('../app/state/feed-format.js');

test('the live catalog: AkiraBox and Rootz volumes are a set only when their files say so', () => {
  const document = JSON.parse(readFileSync(new URL('../catalog/live.json', import.meta.url), 'utf8'));
  const astro = document.games.find((game) => game.id === 'PPSA21564');
  assert.ok(astro, 'ASTRO BOT (USA) is listed');
  assert.ok(astro.releases.every((release) => !release.volume), 'its three AkiraBox uploads are whole files, not "part 1-3"');
  assert.ok(astro.releases.some((release) => /\.ffpkg$/.test(release.filename)), 'the .ffpkg keeps its name, so it reads as a 13.60 image');
  for (const game of document.games) {
    for (const release of game.releases) {
      if (!release.volume || !/akirabox|rootz/.test(new URL(release.url).host)) continue;
      const part = Number(release.volume.replace('part ', ''));
      if (!/\.part0*\d+\.rar$|\.\d{3}$|\.r\d\d$|\.rar$/i.test(release.filename)) continue; // a name the page did not give
      if (/\.part0*\d+\.rar$/i.test(release.filename)) assert.match(release.filename, new RegExp(`\.part0*${part}\.rar$`, 'i'), `${game.id} ${release.label}`);
    }
  }
});

test('Rootz: its page is resolved to the CDN file without the browser; a missing file is unavailable', async () => {
  const asked = [];
  const http = {
    async request(url, options = {}) {
      asked.push([options.method || 'GET', url, options.followRedirects]);
      if (url === 'https://www.rootz.so/api/files/proxy-download/1UOSVE') return { status: 302, ok: false, url, headers: { location: 'https://cdn-files.alcyone.so/users/u/1-PPSA21564.rar?filename=PPSA21564.rar' } };
      if (url.startsWith('https://cdn-files.alcyone.so/')) return { status: 200, ok: true, url, headers: { 'content-type': 'application/x-compressed', 'content-length': '39992984669' } };
      return { status: 404, ok: false, url, headers: {} };
    },
  };
  const release = { url: 'https://www.rootz.so/d/1UOSVE', requiresBrowser: true };
  assert.equal(sourceKind(release), 'rootz');
  assert.ok(RESOLVED_KINDS.has('rootz'));
  const out = await createSourceResolver({ http }).resolve(release, {});
  assert.equal(out.url, 'https://cdn-files.alcyone.so/users/u/1-PPSA21564.rar?filename=PPSA21564.rar');
  assert.equal(out.expectedBytes, 39992984669);
  assert.deepEqual(asked[0], ['GET', 'https://www.rootz.so/api/files/proxy-download/1UOSVE', false]);
  await assert.rejects(createSourceResolver({ http }).resolve({ url: 'https://rootz.so/d/GONE00', requiresBrowser: true }, {}), /Source unavailable: HTTP 404/);
  assert.equal(hostStanding(release), 'works', 'no capture history counts against a host that needs none');
});

test('store ratings: a feed carries them for any title, checked, and its cache keeps them', () => {
  const feed = parseFeed({ version: 1, games: [], ratings: { PPSA21564: [4.77, 76635], CUSA00001: [6, 10], PPSA00002: [4, 1.5], bad: [4, 10] } }, 'https://example.com/feed.json');
  assert.deepEqual(feed.ratings, { PPSA21564: [4.77, 76635] });
  assert.deepEqual(parseFeed(feedDocument(feed), 'https://example.com/feed.json').ratings, feed.ratings);
  const live = parseFeed(JSON.parse(readFileSync(new URL('../catalog/live.json', import.meta.url), 'utf8')), 'https://raw.githubusercontent.com/JVK3R/JobeesLair/main/catalog/live.json');
  assert.ok(Object.keys(live.ratings).length > 2000, 'the live catalog rates the whole store');
  assert.deepEqual(live.ratings.PPSA21564?.length, 2);
});

// ---- 0.5.1: a game's own fakelib, off or on (state/fakelib.js), and the diagnosis that points at it ----
const { diagnoseLaunch } = await import('../app/state/launch-diagnosis.js');
const { fakelibState } = await import('../app/state/fakelib.js');

test('the diagnosis notes a launch that loaded the game\'s own fakelib (PRAGMATA, CE-107098-5 on 13.60)', () => {
  const debug = readFileSync(new URL('./fixtures/fixture-fakelib.log', import.meta.url), 'utf8');
  const result = diagnoseLaunch({ title: 'PPSA02530', debug, kernel: null });
  assert.equal(result.verdict.key, 'ran', 'it started; the crash came after ShadowMount stopped watching');
  assert.equal(result.fakelib, true);
  assert.equal(diagnoseLaunch({ title: 'PPSA02530', debug: debug.replace(/.*\[FAKELIB\] game mounted.*\n/, ''), kernel: null }).fakelib, false);
});

test("ShadowMount's fakelib answer reads as the Options entry's state; anything else is none", () => {
  assert.deepEqual(fakelibState({ title_id: 'PPSA02530', fakelib_mode: 'full', fakelib_mode_override: 'default', can_toggle_fakelib: true }, 'PPSA02530'),
    { titleId: 'PPSA02530', mode: 'full', override: 'default', canToggle: true });
  assert.equal(fakelibState({ status: 0, title_id: 'PPSA02530', fakelib_mode: 'disabled', fakelib_mode_override: 'disabled' }, 'PPSA02530').mode, 'disabled');
  assert.equal(fakelibState({ path: '/data/homebrew/x.ffpfsc' }, 'PPSA02530'), null, 'an older ShadowMount says nothing of it');
  assert.equal(fakelibState(null, 'PPSA02530'), null);
});

test('a part listed twice under two addresses (a re-upload) is one part, not a set with two part 1s', () => {
  const twice = {
    name: 'Twice', version: 1,
    packages: [
      { titleId: 'PPSA22222', title: 'Twice Game', version: 'v01.000', downloadLinks: [
        { name: 'EUR Base - Akirabox part 1', url: 'https://akirabox.com/a1/file' },
        { name: 'EUR Base - Akirabox part 2', url: 'https://akirabox.com/a2/file' },
      ] },
      { titleId: 'PPSA22222', title: 'Twice Game', version: 'v01.000', downloadLinks: [
        { name: 'EUR Base - Akirabox part 1', url: 'https://akirabox.com/b1/file' },
      ] },
    ],
  };
  const { releases } = parseFeed(twice, 'https://pegasus-dl.dev/catalogs/twice.json').games[0];
  assert.deepEqual(releases.map((release) => release.volume), ['part 1', 'part 2']);
});
