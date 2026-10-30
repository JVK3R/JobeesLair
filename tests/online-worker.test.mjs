// Jobee'sLair online's Worker (0.5.2, tools/online): its SQL runs against Node's own SQLite through a D1 stand-in,
// so the schema and every query are the real ones. Pings, the count, events with no console ID, the dashboard's
// sign-in (password and authenticator code), announcements, the dashboard page and the nightly tidy-up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const schema = readFileSync(path.join(repo, 'tools/online/schema.sql'), 'utf8');
let fresh = 0;
// A new copy of the worker each time: its caches of the count and the announcements live in the module.
const loadWorker = async () => import(`${pathToFileURL(path.join(repo, 'tools/online/worker.js')).href}?copy=${fresh++}`);

// The parts of D1 the worker uses: prepare().bind().first/all/run, and batch().
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => db.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...values) }),
    run: async () => (db.prepare(sql).run(...values), { success: true })
  });
  // Rows as plain objects (node:sqlite's have no prototype), for the tests' own look into the tables.
  const get = (sql) => ({ ...db.prepare(sql).get() });
  const all = (sql) => db.prepare(sql).all().map((row) => ({ ...row }));
  return { prepare: (sql) => statement(sql), batch: async (list) => { for (const s of list) await s.run(); }, get, all };
}

// RFC 6238's test key, "12345678901234567890", in base32 as an authenticator app takes it.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
// The code an authenticator shows at `at`, worked out here with Node's own HMAC, not the worker's.
function code(at, secret = Buffer.from('12345678901234567890')) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30e3)));
  const mac = createHmac('sha1', secret).update(counter).digest();
  return String((mac.readUInt32BE(mac[19] & 15) & 0x7fffffff) % 1e6).padStart(6, '0');
}
const ID = '0123456789abcdef0123456789abcdef';
const T0 = Date.parse('2026-10-23T12:00:00Z');
let clock = T0;
const realNow = Date.now;
// GitHub's API as the worker asks it (the repository, then its releases), answered here: never the real one.
const realFetch = globalThis.fetch;
const github = { asked: 0, down: false, stars: 12, image: 100 };
function fakeGithub(url) {
  github.asked++;
  if (github.down) return Promise.resolve(new Response('{"message":"API rate limit exceeded"}', { status: 403 }));
  const body = String(url).endsWith('/releases?per_page=100')
    ? [
      { tag_name: 'v0.5.1', name: "Jobee'sLair 0.5.1", published_at: '2026-10-22T20:00:00Z', prerelease: false, draft: false, assets: [{ name: 'JobeesLair.exfat', download_count: github.image }, { name: 'update.zip', download_count: 40 }] },
      { tag_name: 'v0.5.0', name: "Jobee'sLair 0.5.0", published_at: '2026-10-20T20:00:00Z', prerelease: false, draft: false, assets: [{ name: 'JobeesLair.exfat', download_count: 900 }, { name: 'update.zip', download_count: 300 }, { name: 'notes.txt', download_count: 2 }] }
    ]
    : { stargazers_count: github.stars, forks_count: 3, subscribers_count: 4 };
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
}
test.beforeEach(() => {
  clock = T0;
  Date.now = () => clock;
  Object.assign(github, { asked: 0, down: false, stars: 12, image: 100 });
  globalThis.fetch = fakeGithub;
});
test.afterEach(() => { Date.now = realNow; globalThis.fetch = realFetch; });

const SESSION_KEY = 'a-session-signing-key-long-enough-0123456789';
const MINE = 'my-own-password-1234';
const { hashPassword } = await import(pathToFileURL(path.join(repo, 'tools/online/reset-login.mjs')).href);

async function world() {
  const { default: worker, tidy, totp, base32, checkPassword } = await loadWorker();
  const DB = d1();
  const env = { DB, SESSION_KEY };
  const call = (method, url, body, headers = {}) => worker.fetch(new Request(`https://online.example${url}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body)
  }), env);
  const cookieOf = (answer) => answer.headers.get('set-cookie')?.split(';')[0] ?? null;
  // What reset-login.mjs writes: a first-time password, open for an hour.
  const openSetup = (temporary = 'password', until = clock + 36e5) => DB.prepare(
    'INSERT INTO admin_login (slot, password, totp, pending, setup_until, version) VALUES (1, ?, NULL, NULL, ?, ?) ' +
    'ON CONFLICT (slot) DO UPDATE SET password = excluded.password, totp = NULL, pending = NULL, setup_until = excluded.setup_until, version = excluded.version'
  ).bind(hashPassword(temporary), until, clock).run();
  let key = null;  // the authenticator key setup made, as the phone has it
  const codeNow = (at = clock) => code(at, Buffer.from(base32(key)));
  // The whole first time: the temporary password, the key to scan, then my own password and the first code.
  async function setUp() {
    await openSetup();
    const setup = cookieOf(await call('POST', '/v1/admin/login', { password: 'password' }));
    ({ key } = await (await call('POST', '/v1/admin/setup/key', {}, { cookie: setup })).json());
    const done = await call('POST', '/v1/admin/setup/finish', { password: MINE, code: codeNow() }, { cookie: setup });
    assert.equal(done.status, 200, await done.clone().text());
    return cookieOf(done);
  }
  let cookie = null;
  const admin = async (method, url, body) => {
    if (!cookie) cookie = await setUp();
    let answer = await call(method, url, body, { cookie });
    if (answer.status === 401) {
      clock += 30e3;  // a code works once: the next sign-in takes the next one
      cookie = cookieOf(await call('POST', '/v1/admin/login', { password: MINE, code: codeNow() }));
      answer = await call(method, url, body, { cookie });
    }
    return answer;
  };
  return { worker, tidy, totp, base32, checkPassword, DB, env, call, admin, cookieOf, openSetup, setUp, codeNow };
}
const ping = (id = ID, extra = {}) => ({ id, version: '0.5.2-pre.1', edition: 'store', firmware: '13.60', language: 'en', ...extra });

test('a ping is counted once a minute and answered with the count', async () => {
  const { call, DB } = await world();
  assert.equal((await call('POST', '/v1/ping', { id: 'not-an-id' })).status, 400);
  const first = await call('POST', '/v1/ping', ping());
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { online: 1, announcements: [] });
  assert.deepEqual(DB.get('SELECT version, edition, firmware, language, first_seen, last_seen FROM consoles'),
    { version: '0.5.2-pre.1', edition: 'store', firmware: '13.60', language: 'en', first_seen: T0, last_seen: T0 });
  clock += 30e3;
  await call('POST', '/v1/ping', ping());
  assert.equal(DB.get('SELECT last_seen FROM consoles').last_seen, T0, 'not written again within the minute');
  clock += 40e3;
  await call('POST', '/v1/ping', ping(ID, { version: '0.5.2' }));
  assert.deepEqual(DB.get('SELECT last_seen, version FROM consoles'), { last_seen: T0 + 70e3, version: '0.5.2' });
  assert.equal(DB.get('SELECT COUNT(*) AS n FROM active').n, 1, 'one row a day per console');
});

test('what a ping carries is trimmed, and an unknown edition is the store', async () => {
  const { call, DB } = await world();
  await call('POST', '/v1/ping', ping(ID, { version: '<script>alert(1)</script>0.5.2', edition: 'pirate', firmware: '13.60; DROP TABLE', language: 'x'.repeat(50) }));
  const row = DB.get('SELECT version, edition, firmware, language FROM consoles');
  assert.equal(row.edition, 'store');
  assert.ok(!/[<>]/.test(row.version) && row.version.length <= 24, row.version);
  assert.ok(row.firmware.length <= 12 && row.language.length <= 12);
});

test('online means a ping in the last ten minutes; the status answer sends nothing about the console', async () => {
  const { call } = await world();
  await call('POST', '/v1/ping', ping());
  clock += 61e3;
  await call('POST', '/v1/ping', ping('ffffffffffffffffffffffffffffffff'));
  clock += 9 * 6e4;
  const status = await call('GET', '/v1/status');
  assert.equal(status.headers.get('cache-control'), 'public, max-age=30');
  assert.deepEqual(await status.json(), { online: 1, announcements: [] }, 'the first went quiet over ten minutes ago');
});

test('one address cannot run up the count: forty consoles in five minutes are counted, the rest only answered', async () => {
  const { call, DB } = await world();
  const from = { 'cf-connecting-ip': '203.0.113.50' };
  const ids = Array.from({ length: 45 }, (_, i) => i.toString(16).padStart(32, '0'));
  for (const id of ids) {
    const answer = await call('POST', '/v1/ping', ping(id), from);
    assert.equal(answer.status, 200);
    assert.ok(Array.isArray((await answer.json()).announcements), 'every one still gets the announcements');
  }
  assert.equal(DB.get('SELECT COUNT(*) AS n FROM consoles').n, 40);
  await call('POST', '/v1/ping', ping('f'.repeat(32)), { 'cf-connecting-ip': '198.51.100.7' });
  assert.equal(DB.get('SELECT COUNT(*) AS n FROM consoles').n, 41, 'another address is counted');
  clock += 5 * 6e4;
  await call('POST', '/v1/ping', ping(ids[44]), from);
  assert.equal(DB.get('SELECT COUNT(*) AS n FROM consoles').n, 42, 'five minutes on, that address counts again');
});

test('an install event is kept with no console ID, and a flood from one address is turned away', async () => {
  const { call, DB } = await world();
  assert.equal((await call('POST', '/v1/event', { type: 'something-else', app: 'x' })).status, 400);
  assert.equal((await call('POST', '/v1/event', { type: 'homebrew-install', app: 'brinootk/ps5x360', ok: true, version: '0.5.2', firmware: '13.60' })).status, 204);
  await call('POST', '/v1/event', { type: 'homebrew-install', app: 'brinootk/ps5x360', ok: false, error: 'Existing extraction has no matching, valid completion receipt', version: '0.5.2', firmware: '13.60' });
  const columns = DB.all('PRAGMA table_info(installs)').map((c) => c.name);
  assert.ok(!columns.includes('id'), 'installs never hold a console ID');
  assert.deepEqual(DB.all('SELECT app, ok, error FROM installs ORDER BY ok DESC'), [
    { app: 'brinootk/ps5x360', ok: 1, error: '' },
    { app: 'brinootk/ps5x360', ok: 0, error: 'Existing extraction has no matching, valid completion receipt' }
  ]);
  let refused = 0;
  for (let i = 0; i < 70; i++) {
    const answer = await call('POST', '/v1/event', { type: 'homebrew-install', app: 'a/b', ok: true }, { 'cf-connecting-ip': '203.0.113.9' });
    if (answer.status === 429) refused++;
  }
  assert.equal(refused, 10, 'sixty an hour from one address');
});

test("the authenticator codes are RFC 6238's", async () => {
  const { totp, base32 } = await world();
  const key = base32(SECRET);
  assert.deepEqual([...key], [...Buffer.from('12345678901234567890')]);
  // The RFC's SHA-1 table, last six digits.
  for (const [seconds, expected] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']]) {
    assert.equal(await totp(key, Math.floor(seconds / 30)), expected, `T=${seconds}`);
    assert.equal(code(seconds * 1e3), expected, 'and the test agrees with Node');
  }
  assert.equal(base32('not base32!'), null);
});

test("reset-login.mjs's password hash is the one the worker checks", async () => {
  const { checkPassword } = await world();
  const stored = hashPassword('password');
  assert.match(stored, /^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await checkPassword(stored, 'password'), true);
  assert.equal(await checkPassword(stored, 'Password'), false);
  assert.equal(await checkPassword(stored.replace('100000', '1'), 'password'), false, 'too few rounds is no hash');
});

test('the first sign-in takes the temporary password and opens only the setup', async () => {
  const { call, cookieOf, openSetup } = await world();
  assert.equal((await call('POST', '/v1/admin/login', { password: 'password' })).status, 503, 'nothing set up yet');
  await openSetup();
  assert.equal((await call('POST', '/v1/admin/login', { password: 'wrong' })).status, 401);
  const answer = await call('POST', '/v1/admin/login', { password: 'password' });
  assert.deepEqual(await answer.json(), { setup: true });
  const setup = cookieOf(answer);
  assert.match(answer.headers.get('set-cookie'), /Max-Age=1200; HttpOnly; Secure; SameSite=Strict$/, 'twenty minutes for the setup');
  assert.equal((await call('GET', '/v1/admin/summary', undefined, { cookie: setup })).status, 401, 'the setup session opens no stats');
  assert.equal((await call('POST', '/v1/admin/announcement', { text: 'x' }, { cookie: setup })).status, 401);
  const first = await (await call('POST', '/v1/admin/setup/key', {}, { cookie: setup })).json();
  assert.match(first.key, /^[A-Z2-7]{32}$/);
  assert.equal(first.cells.length, first.size * first.size);
  assert.match(first.cells, /^[01]+$/);
  const again = await (await call('POST', '/v1/admin/setup/key', {}, { cookie: setup })).json();
  assert.equal(again.key, first.key, 'the same key until setup is finished, so a scan stays good');
  assert.equal((await call('POST', '/v1/admin/setup/key')).status, 401, 'no key without the setup session');
});

test('setup takes my own password and the first code, then that is the sign-in and the temporary one is gone', async () => {
  const { call, cookieOf, openSetup, codeNow, base32 } = await world();
  await openSetup();
  const setup = cookieOf(await call('POST', '/v1/admin/login', { password: 'password' }));
  const { key } = await (await call('POST', '/v1/admin/setup/key', {}, { cookie: setup })).json();
  const right = code(clock, Buffer.from(base32(key)));
  const finish = (body) => call('POST', '/v1/admin/setup/finish', body, { cookie: setup });
  assert.equal((await finish({ password: 'short', code: right })).status, 400, 'twelve characters at least');
  assert.equal((await finish({ password: 'password', code: right })).status, 400, 'not the temporary one');
  assert.equal((await finish({ password: MINE, code: right === '000000' ? '111111' : '000000' })).status, 401, 'a wrong code');
  const done = await finish({ password: MINE, code: right });
  assert.equal(done.status, 200);
  const full = cookieOf(done);
  assert.match(done.headers.get('set-cookie'), /Max-Age=43200; HttpOnly; Secure; SameSite=Strict$/);
  assert.equal((await call('GET', '/v1/admin/summary', undefined, { cookie: full })).status, 200, 'signed in for real');
  assert.equal((await call('POST', '/v1/admin/setup/key', {}, { cookie: setup })).status, 401, 'the setup session is over');
  assert.equal((await call('POST', '/v1/admin/login', { password: 'password' })).status, 401, 'the temporary password is gone');
  assert.equal((await call('POST', '/v1/admin/login', { password: MINE })).status, 401, 'my password alone is not enough');
  clock += 30e3;
  assert.equal((await call('POST', '/v1/admin/login', { password: MINE, code: code(clock, Buffer.from(base32(key))) })).status, 200, 'my password and a code');
});

test('each code works once, a forged or old session opens nothing, and a reset signs everyone out', async () => {
  const { call, cookieOf, setUp, openSetup, codeNow } = await world();
  const first = await setUp();
  assert.equal((await call('POST', '/v1/admin/login', { password: MINE, code: codeNow() })).status, 401, 'the code setup used, again');
  clock += 30e3;
  const second = cookieOf(await call('POST', '/v1/admin/login', { password: MINE, code: codeNow() }));
  assert.equal((await call('POST', '/v1/admin/login', { password: MINE, code: codeNow(clock - 30e3) })).status, 401, 'an older code than the last one used');
  assert.equal((await call('GET', '/v1/admin/summary', undefined, { cookie: second.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) })).status, 401, 'forged');
  assert.equal((await call('GET', '/v1/admin/summary', undefined, { cookie: second.replace('.full.', '.setup.') })).status, 401, 'a scope swapped in');
  assert.equal((await call('GET', '/v1/admin/summary', undefined, { cookie: first })).status, 200, 'two sessions side by side');
  clock += 12 * 36e5;
  assert.equal((await call('GET', '/v1/admin/summary', undefined, { cookie: second })).status, 401, 'twelve hours later it is over');
  clock -= 12 * 36e5;
  await openSetup();
  assert.equal((await call('GET', '/v1/admin/summary', undefined, { cookie: second })).status, 401, 'a reset signs everyone out');
  const out = await call('POST', '/v1/admin/logout');
  assert.match(out.headers.get('set-cookie'), /^jl_session=; Path=\/v1\/admin; Max-Age=0;/);
});

test('the first-time password runs out after its hour', async () => {
  const { call, openSetup } = await world();
  await openSetup('password', clock + 36e5);
  clock += 36e5 + 1;
  assert.equal((await call('POST', '/v1/admin/login', { password: 'password' })).status, 403);
});

test('ten wrong codes with the right password (someone has it) lock sign-in for everyone for the hour', async () => {
  const { call, setUp, codeNow } = await world();
  await setUp();
  for (let i = 0; i < 10; i++) await call('POST', '/v1/admin/login', { password: MINE, code: 'abcdef' });
  clock += 30e3;
  assert.equal((await call('POST', '/v1/admin/login', { password: MINE, code: codeNow() })).status, 429);
  assert.equal((await call('POST', '/v1/admin/login', { password: MINE, code: codeNow() }, { 'cf-connecting-ip': '198.51.100.20' })).status, 429, 'from every address');
  clock += 36e5;
  assert.equal((await call('POST', '/v1/admin/login', { password: MINE, code: codeNow() })).status, 200, 'an hour later it opens');
});

test("a stranger's wrong passwords lock out only their own address, and nothing about them is written", async () => {
  const { call, setUp, codeNow, DB } = await world();
  await setUp();
  const stranger = { 'cf-connecting-ip': '203.0.113.66' };
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/v1/admin/login', { password: `guess-${i}-of-many`, code: '123456' }, stranger)).status, 401);
  assert.equal((await call('POST', '/v1/admin/login', { password: MINE, code: '123456' }, stranger)).status, 429, 'that address is turned away');
  clock += 30e3;
  assert.equal((await call('POST', '/v1/admin/login', { password: MINE, code: codeNow() }, { 'cf-connecting-ip': '198.51.100.20' })).status, 200, 'I still get in');
  assert.equal(DB.get('SELECT COUNT(*) AS n FROM admin_failures').n, 0, 'no failure written, no address kept');
  clock += 36e5;
  assert.equal((await call('POST', '/v1/admin/login', { password: 'one-more-guess-here' }, stranger)).status, 401, 'an hour later that address may try again');
});

test('without the session key, sign-in says so and opens nothing', async () => {
  const { call, env, openSetup } = await world();
  await openSetup();
  env.SESSION_KEY = 'short';
  assert.equal((await call('POST', '/v1/admin/login', { password: 'password' })).status, 503);
});


test('the summary counts today, the week and the month, and spreads versions, firmware and installs', async () => {
  const { call, admin } = await world();
  clock = T0 - 10 * 864e5;
  await call('POST', '/v1/ping', ping('11111111111111111111111111111111', { version: '0.5.1', firmware: '12.00' }));
  clock = T0;
  await call('POST', '/v1/ping', ping('22222222222222222222222222222222'));
  await call('POST', '/v1/ping', ping('33333333333333333333333333333333', { edition: 'homebrew' }));
  await call('POST', '/v1/event', { type: 'homebrew-install', app: 'a/emu', ok: false, error: 'disk full', version: '0.5.2', firmware: '13.60' });
  const data = await (await admin('GET', '/v1/admin/summary')).json();
  assert.equal(data.span, 30, 'thirty days unless asked');
  assert.deepEqual([data.online, data.today, data.week, data.month, data.consoles, data.fresh], [2, 2, 2, 3, 3, 2]);
  assert.deepEqual(data.versions, [{ name: '0.5.2-pre.1', n: 2 }, { name: '0.5.1', n: 1 }]);
  assert.deepEqual(data.editions, [{ name: 'store', n: 2 }, { name: 'homebrew', n: 1 }]);
  assert.deepEqual(data.daily.map((d) => [d.active, d.fresh]), [[1, 1], [2, 2]], 'each day, and how many were new that day');
  assert.deepEqual(data.apps, [{ app: 'a/emu', ok: 0, failed: 1 }]);
  assert.deepEqual(data.installDays, [{ day: '2026-10-23', ok: 0, failed: 1 }]);
  assert.equal(data.failures[0].error, 'disk full');
  // The week before is in the summary for the changes; a span past the limits is held to 7 and 180 days.
  clock += 864e5;
  await call('POST', '/v1/ping', ping('22222222222222222222222222222222'));
  const week = await (await admin('GET', '/v1/admin/summary?days=7')).json();
  assert.equal(week.span, 7);
  assert.deepEqual(week.daily.map((d) => [d.day, d.active, d.fresh]), [['2026-10-13', 1, 1], ['2026-10-23', 2, 2], ['2026-10-24', 1, 0]], 'back fourteen days; a console back the next day is not new');
  assert.equal((await (await admin('GET', '/v1/admin/summary?days=2')).json()).span, 7);
  assert.equal((await (await admin('GET', '/v1/admin/summary?days=9999')).json()).span, 180);
});

test('the online count is shared by every copy of the worker and made at most once a minute; a console coming on adds one', async () => {
  const { call, DB } = await world();
  const A = '0123456789abcdef0123456789abcdef', B = 'fedcba9876543210fedcba9876543210';
  let counted = 0;
  const prepare = DB.prepare;
  DB.prepare = (sql) => { if (sql.startsWith('SELECT COUNT(*) AS n FROM consoles WHERE last_seen')) counted++; return prepare(sql); };
  const online = async () => (await (await call('GET', '/v1/status')).json()).online;
  await call('POST', '/v1/ping', ping(A));
  clock += 45e3;  // past this copy's own thirty seconds, inside the shared minute
  for (let i = 0; i < 20; i++) assert.equal(await online(), 1);
  await call('POST', '/v1/ping', ping(B));
  assert.equal(await online(), 2, 'B came on: one more, without counting again');
  assert.equal(counted, 1, 'counted once for all of that');
  assert.deepEqual(DB.get('SELECT n FROM online'), { n: 2 });
  clock += 61e3;
  assert.equal(await online(), 2);
  assert.equal(counted, 2, 'counted again after the minute');
});

test('days are Eastern time from Oct 28, 2026: that day began at midnight UTC, and the day the clocks go back runs 25 hours', async () => {
  const { call, admin, DB } = await world();
  const A = '0123456789abcdef0123456789abcdef', B = 'fedcba9876543210fedcba9876543210', C = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  clock = Date.parse('2026-10-28T02:00:00Z');  // Oct 27, 10 PM in New York: still the UTC day
  await call('POST', '/v1/ping', ping(A));
  clock = Date.parse('2026-10-29T03:00:00Z');  // Oct 28, 11 PM in New York
  await call('POST', '/v1/ping', ping(B));
  clock = Date.parse('2026-11-02T04:30:00Z');  // Nov 1, 11:30 PM: standard time since 2 AM
  await call('POST', '/v1/ping', ping(C));
  await call('POST', '/v1/event', { type: 'homebrew-install', app: 'a/emu', ok: true, version: '0.5.4', firmware: '13.59' });
  assert.deepEqual(DB.all('SELECT day, id FROM active ORDER BY day, id').map((r) => [r.day, r.id]), [['2026-10-28', A], ['2026-10-28', B], ['2026-11-01', C]]);
  assert.deepEqual(DB.all('SELECT hour FROM usage_hours ORDER BY hour').map((r) => r.hour), ['2026-10-28T02', '2026-10-29T03', '2026-11-02T04'], 'hours stay UTC');
  const data = await (await admin('GET', '/v1/admin/summary')).json();
  assert.deepEqual(data.daily, [{ day: '2026-10-28', active: 2, fresh: 2 }, { day: '2026-11-01', active: 1, fresh: 1 }]);
  assert.deepEqual([data.today, data.fresh], [1, 1], 'today is Nov 1 until midnight in New York');
  assert.deepEqual(data.installDays, [{ day: '2026-11-01', ok: 1, failed: 0 }]);
});

test('time in Jobee\'sLair comes from the pings alone: sessions after ten quiet minutes, and the most online at once', async () => {
  const { call, admin, DB } = await world();
  const A = '0123456789abcdef0123456789abcdef', B = 'fedcba9876543210fedcba9876543210';
  // A is on for fifteen minutes (four pings, one session); B joins for one ping; A comes back after a break.
  for (const at of [0, 5, 10, 15]) { clock = T0 + at * 6e4; await call('POST', '/v1/ping', ping(A)); }
  clock = T0 + 15 * 6e4 + 1e3;
  await call('POST', '/v1/ping', ping(B));
  clock = T0 + 40 * 6e4;
  await call('POST', '/v1/ping', ping(A));
  assert.deepEqual(DB.get("SELECT pings, sessions, peak FROM usage WHERE day = '2026-10-23'"), { pings: 6, sessions: 3, peak: 2 });
  assert.deepEqual(DB.all('SELECT hour, pings, peak FROM usage_hours ORDER BY hour'), [{ hour: '2026-10-23T12', pings: 6, peak: 2 }]);
  // A second ping within the minute is answered but counts nothing.
  await call('POST', '/v1/ping', ping(A));
  assert.equal(DB.get("SELECT pings FROM usage WHERE day = '2026-10-23'").pings, 6);
  const now = await (await admin('GET', '/v1/admin/live')).json();
  assert.deepEqual([now.online, now.today, now.pings, now.sessions, now.peak], [1, 2, 6, 3, 2], 'B went quiet; the peak stays');
  const data = await (await admin('GET', '/v1/admin/summary')).json();
  assert.deepEqual(data.usage, [{ day: '2026-10-23', pings: 6, sessions: 3, peak: 2 }]);
  assert.deepEqual(data.hours, [{ hour: '2026-10-23T12', pings: 6, peak: 2 }]);
  assert.deepEqual(data.ever, { pings: 6, sessions: 3, peak: 2 });
  assert.equal((await call('GET', '/v1/admin/live')).status, 401, 'signed in only');
});

test("GitHub's numbers are asked for at most every fifteen minutes, and kept when GitHub can't be reached", async () => {
  const { admin } = await world();
  const first = (await (await admin('GET', '/v1/admin/summary')).json()).github;
  assert.equal(github.asked, 2, 'the repository and its releases');
  assert.deepEqual([first.total, first.stars, first.forks, first.watchers], [1342, 12, 3, 4]);
  assert.deepEqual(first.releases.map((r) => [r.tag, r.image, r.update, r.other, r.prerelease]), [['v0.5.1', 100, 40, 0, false], ['v0.5.0', 900, 300, 2, false]]);
  assert.deepEqual(first.days, [{ day: '2026-10-23', downloads: 1342, stars: 12 }]);
  clock += 10 * 6e4;
  await admin('GET', '/v1/admin/summary');
  assert.equal(github.asked, 2, 'not again within fifteen minutes');
  clock += 6 * 6e4;
  github.down = true;
  const kept = (await (await admin('GET', '/v1/admin/summary')).json()).github;
  assert.equal(github.asked, 4);
  assert.deepEqual([kept.total, kept.at], [1342, T0], 'the last answer, and when it came');
  // Back the next day with more downloads: the day's total is kept for the curve.
  github.down = false;
  github.image = 150;
  clock = T0 + 864e5;
  const next = (await (await admin('GET', '/v1/admin/summary')).json()).github;
  assert.deepEqual(next.days.map((d) => [d.day, d.downloads]), [['2026-10-23', 1342], ['2026-10-24', 1392]]);
});

test('announcements reach every ping, warnings first, until each is taken down or runs out', async () => {
  const { call, admin } = await world();
  const up = async () => (await (await call('GET', '/v1/status')).json()).announcements;
  const texts = async () => (await up()).map((note) => note.text);
  const posted = await (await admin('POST', '/v1/admin/announcement', { text: '0.5.2 is out', level: 'info', hours: 24 })).json();
  assert.deepEqual(posted.announcements, [{ id: T0, text: '0.5.2 is out', level: 'info', until: T0 + 24 * 36e5 }]);
  assert.deepEqual((await (await call('POST', '/v1/ping', ping())).json()).announcements, posted.announcements);
  // Two more in the same millisecond still get an ID each.
  await admin('POST', '/v1/admin/announcement', { text: 'Do not update ShadowMount yet', level: 'warning' });
  await admin('POST', '/v1/admin/announcement', { text: 'Fix it is in 0.5.2' });
  assert.deepEqual(await texts(), ['Do not update ShadowMount yet', 'Fix it is in 0.5.2', '0.5.2 is out'], 'warnings first, then the newest');
  assert.equal(new Set((await up()).map((note) => note.id)).size, 3);
  // Taking one down leaves the others up.
  const fix = (await up())[1];
  const left = await (await admin('POST', '/v1/admin/announcement/remove', { id: fix.id })).json();
  assert.deepEqual(left.announcements.map((note) => note.text), ['Do not update ShadowMount yet', '0.5.2 is out']);
  assert.deepEqual(await texts(), ['Do not update ShadowMount yet', '0.5.2 is out']);
  assert.equal((await admin('POST', '/v1/admin/announcement/remove', { id: 'all' })).status, 400);
  assert.equal((await admin('POST', '/v1/admin/announcement', { text: '   ' })).status, 400, 'nothing to say');
  // One line on the console: cut at 140 characters. Five at most.
  const long = await (await admin('POST', '/v1/admin/announcement', { text: 'x'.repeat(300) })).json();
  assert.equal(long.announcements.find((note) => note.text.startsWith('x')).text.length, 140);
  await admin('POST', '/v1/admin/announcement', { text: 'four' });
  await admin('POST', '/v1/admin/announcement', { text: 'five' });
  const sixth = await admin('POST', '/v1/admin/announcement', { text: 'six' });
  assert.equal(sixth.status, 409);
  assert.match((await sixth.json()).error, /Take one down/);
  assert.equal((await (await admin('GET', '/v1/admin/summary')).json()).announcements.length, 5);
  // A day later the one posted for a day is gone; the rest stay until they're taken down.
  clock += 25 * 36e5;
  assert.equal((await up()).length, 4);
  assert.ok(!(await texts()).includes('0.5.2 is out'));
});

test('the dashboard is one page with nothing from elsewhere', async () => {
  const { call } = await world();
  const page = await call('GET', '/dashboard');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  const html = await page.text();
  assert.ok(html.includes('Jobee\'sLair Online'));
  const outside = [...html.matchAll(/https?:\/\/[^\s"'<)]+/g)].map((m) => m[0]).filter((url) => url !== 'http://www.w3.org/2000/svg');
  assert.deepEqual(outside, [], 'no outside scripts, fonts or images');
  assert.ok(!/innerHTML/.test(html), 'what consoles sent goes on the page as text only');
  // One view at a time: each tab has its view, and the Phone companion is a sub-tab of Players.
  for (const view of ['now', 'players', 'homebrew', 'games', 'github', 'post']) {
    assert.ok(html.includes(`href="#${view}" data-view="${view}"`) && html.includes(`<section class="view" data-view="${view}"`), `the ${view} tab and its view`);
  }
  assert.ok(html.includes('data-pane="companion" id="companion"') && html.includes('data-show="companion"'), 'the Phone companion, in the Players sub-tabs');
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new Function(script), 'its script parses');
  // Its typeface comes from the worker too: Exo 2's two weights, cached for a year.
  for (const weight of ['500', '700']) {
    const font = await call('GET', `/dashboard/exo2-${weight}.woff2`);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
    assert.match(font.headers.get('cache-control'), /immutable/);
    assert.equal(Buffer.from(await font.arrayBuffer()).subarray(0, 4).toString('latin1'), 'wOF2');
  }
});

test('the nightly tidy-up drops what is past its keeping time', async () => {
  const { call, tidy, DB } = await world();
  clock = T0 - 401 * 864e5;
  await call('POST', '/v1/ping', ping('44444444444444444444444444444444', { companion: { on: true } }));
  await call('POST', '/v1/event', { type: 'homebrew-install', app: 'old/app', ok: true });
  clock = T0;
  await call('POST', '/v1/ping', ping(ID, { companion: { on: false } }));
  await DB.prepare("INSERT INTO announcements (id, text, level, until) VALUES (1, 'ran out', 'info', ?), (2, 'still up', 'info', NULL)").bind(T0 - 1).run();
  await tidy(DB, T0);
  assert.deepEqual(DB.all('SELECT id FROM consoles').map((r) => r.id), [ID]);
  assert.equal(DB.get('SELECT COUNT(*) AS n FROM installs').n, 0);
  assert.equal(DB.get('SELECT COUNT(*) AS n FROM active').n, 1);
  assert.deepEqual(DB.all('SELECT text FROM announcements').map((r) => r.text), ['still up']);
  assert.deepEqual(DB.all('SELECT day FROM usage').map((r) => r.day), ['2026-10-23'], 'time in the app: 400 days');
  assert.deepEqual(DB.all('SELECT hour FROM usage_hours').map((r) => r.hour), ['2026-10-23T12'], 'by the hour: 30 days');
  assert.deepEqual(DB.all('SELECT day FROM companion_days').map((r) => r.day), ['2026-10-23'], 'the phone companion: 400 days');
});

// ---- The phone companion (0.5.4) -------------------------------------------------------------------------------
const quietPhone = { on: false, away: false, minutes: 0, opens: 0, games: 0, homebrew: 0, downloads: 0, library: 0, remote: 0, feeds: 0 };

test("the phone companion: a console's day keeps whether it was on and adds up what a phone did; junk is cut down", async () => {
  const { call, DB } = await world();
  await call('POST', '/v1/ping', ping(ID, { companion: { ...quietPhone, on: true, minutes: 3, opens: 1, games: 1, downloads: 2, remote: 5 } }));
  clock += 5 * 6e4;
  await call('POST', '/v1/ping', ping(ID, { companion: { ...quietPhone, minutes: 2, remote: 1 } }));
  clock += 30e3;
  await call('POST', '/v1/ping', ping(ID, { companion: { ...quietPhone, on: true, minutes: 50 } }));
  assert.deepEqual(DB.all('SELECT * FROM companion_days'), [{ day: '2026-10-23', id: ID, enabled: 1, away: 0, minutes: 5, opens: 1, games: 1, homebrew: 0, downloads: 2, library: 0, remote: 6, feeds: 0 }],
    'on at any ping that day; counts added; a ping within the minute is answered but not written');
  const B = '22222222222222222222222222222222';
  await call('POST', '/v1/ping', ping(B, { companion: { on: 'yes', away: true, minutes: 1e9, games: -3, remote: 2.9, feeds: 'x', library: 1e9, extra: 5 } }));
  assert.deepEqual(DB.get(`SELECT enabled, away, minutes, games, remote, feeds, library FROM companion_days WHERE id = '${B}'`), { enabled: 0, away: 0, minutes: 1440, games: 0, remote: 2, feeds: 0, library: 5000 },
    'on only when true, kept on while closed only when on, whole numbers, at most a day of minutes');
  for (const [id, extra] of [['33333333333333333333333333333333', {}], ['44444444444444444444444444444444', { companion: [1, 2] }], ['55555555555555555555555555555555', { companion: 'on' }]]) {
    await call('POST', '/v1/ping', ping(id, extra));
    assert.equal(DB.get(`SELECT COUNT(*) AS n FROM companion_days WHERE id = '${id}'`).n, 0, JSON.stringify(extra));
    assert.equal(DB.get(`SELECT COUNT(*) AS n FROM consoles WHERE id = '${id}'`).n, 1, 'the ping itself still counts');
  }
});

test('the summary says how many consoles have the companion on, how many a phone uses, who came back, and what phones did', async () => {
  const { call, admin } = await world();
  const [A, B, C, D] = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(32));
  // Yesterday A used it from a phone. Today A again (kept on while closed too), B has it on with no phone, C has it off,
  // and D runs an app from before 0.5.4.
  clock = T0 - 864e5;
  await call('POST', '/v1/ping', ping(A, { companion: { ...quietPhone, on: true, minutes: 10, opens: 2, games: 1 } }));
  clock = T0;
  await call('POST', '/v1/ping', ping(A, { companion: { ...quietPhone, on: true, away: true, minutes: 4, remote: 9, homebrew: 1 } }));
  await call('POST', '/v1/ping', ping(B, { companion: { ...quietPhone, on: true } }));
  await call('POST', '/v1/ping', ping(C, { companion: quietPhone }));
  await call('POST', '/v1/ping', ping(D));
  const { companion } = await (await admin('GET', '/v1/admin/summary?days=7')).json();
  assert.deepEqual([companion.consoles, companion.enabled, companion.away, companion.used, companion.repeat], [3, 2, 1, 1, 1]);
  assert.deepEqual([companion.minutes, companion.opens, companion.games, companion.remote, companion.homebrew, companion.feeds], [14, 2, 1, 9, 1, 0]);
  assert.equal(companion.first, '2026-10-22', 'when counting started');
  assert.deepEqual(companion.days, [{ day: '2026-10-22', consoles: 1, enabled: 1, used: 1, minutes: 10 }, { day: '2026-10-23', consoles: 3, enabled: 2, used: 1, minutes: 4 }]);
  assert.deepEqual([companion.before.consoles, companion.before.used, companion.before.minutes], [0, 0, 0], 'the week before had none');
});

test('before any console sends it, the summary says the companion has nothing yet', async () => {
  const { call, admin } = await world();
  await call('POST', '/v1/ping', ping());
  const { companion } = await (await admin('GET', '/v1/admin/summary')).json();
  assert.deepEqual([companion.consoles, companion.used, companion.minutes, companion.first, companion.days], [0, 0, 0, null, []]);
});

test('deployed before schema.sql: pings still count without the companion table, and the summary still answers', async () => {
  const { call, admin, DB } = await world();
  await DB.prepare('DROP TABLE companion_days').run();
  const answer = await call('POST', '/v1/ping', ping(ID, { companion: { ...quietPhone, on: true, minutes: 2 } }));
  assert.equal(answer.status, 200);
  assert.equal(DB.get('SELECT COUNT(*) AS n FROM consoles').n, 1, 'the ping itself was kept');
  assert.equal(DB.get('SELECT COUNT(*) AS n FROM active').n, 1);
  const summary = await admin('GET', '/v1/admin/summary');
  assert.equal(summary.status, 200);
  const data = await summary.json();
  assert.equal(data.companion, null, 'shown as nothing yet');
  assert.equal(data.consoles, 1);
});

// ---- Game launches (0.5.4) ---------------------------------------------------------------------------------------
const token = (n) => String(n).padStart(32, 'a').slice(-32).replace(/[^0-9a-f]/g, 'b');
const report = (n, title, outcome = 'played', extra = {}) => ({ token: token(n), title, outcome, verdict: outcome === 'played' ? 'ran' : 'notStarted', format: 'exfat', fixed: false, backport: false, ...extra });
const launches = (reports, extra = {}) => ({ firmware: '13.590.001', version: '0.5.4', reports, ...extra });

test('launches: one row per token, written over by its next report, with no console ID and the firmware as its family', async () => {
  const { call, DB } = await world();
  assert.equal((await call('POST', '/v1/launches', launches([report(1, 'PPSA09076', 'wontStart', { verdict: 'crashed' }), report(2, 'PPSA01748')]))).status, 204);
  clock += 6e4;
  assert.equal((await call('POST', '/v1/launches', launches([report(1, 'PPSA09076', 'played', { fixed: true, format: 'ffpkg', backport: true })], { firmware: '12.590.001' }))).status, 204);
  const columns = DB.all('PRAGMA table_info(launches)').map((c) => c.name);
  assert.ok(!columns.includes('id'), 'launches never hold a console ID');
  assert.deepEqual(DB.all('SELECT title, firmware, outcome, verdict, format, fixed, backport, at FROM launches ORDER BY title'), [
    { title: 'PPSA01748', firmware: '13.59', outcome: 'played', verdict: 'ran', format: 'exfat', fixed: 0, backport: 0, at: T0 },
    { title: 'PPSA09076', firmware: '12.59', outcome: 'played', verdict: 'ran', format: 'ffpkg', fixed: 1, backport: 1, at: T0 + 6e4 }
  ]);
});

test('launches: a report that does not hold together is left out, a request with none is refused', async () => {
  const { call, DB } = await world();
  const junk = [
    { ...report(1, 'PPSA0907'), title: 'PPSA0907' }, report(2, 'ppsa09076'), { ...report(3, 'PPSA09076'), token: 'short' },
    report(4, 'PPSA09076', 'played', { verdict: 'crashed' }), report(5, 'PPSA09076', 'wontStart', { verdict: 'ran' }), report(6, 'PPSA09076', 'maybe'), report(8, 'PPSA09076', 'constructor'), report(9, 'PPSA09076', '__proto__'), null, 'x'
  ];
  assert.equal((await call('POST', '/v1/launches', launches(junk))).status, 400);
  assert.equal((await call('POST', '/v1/launches', { reports: 'none' })).status, 400);
  assert.equal((await call('POST', '/v1/launches', launches([...junk, report(7, 'CUSA01234', 'played', { format: 'iso', fixed: 'yes' })]))).status, 204);
  assert.deepEqual(DB.all('SELECT title, format, fixed FROM launches'), [{ title: 'CUSA01234', format: 'other', fixed: 0 }], 'only the one that holds; an unknown format is other');
  // Twenty-one fit in a request's 4 KiB; the twenty-first is left out.
  const many = Array.from({ length: 21 }, (_, i) => report(100 + i, 'PPSA00001'));
  assert.equal((await call('POST', '/v1/launches', launches(many))).status, 204);
  assert.equal(DB.get("SELECT COUNT(*) AS n FROM launches WHERE title = 'PPSA00001'").n, 20, 'twenty a request');
});

test("launches: the firmware's family is the app's way of showing it", async () => {
  const { firmwareFamily } = await loadWorker();
  assert.deepEqual(['13.590.001', '13.60', '9.6', '99.999.999', 'unknown', null].map(firmwareFamily), ['13.59', '13.60', '9.60', '99.99', '?', '?']);
});

test('launches: one address sends two hundred an hour; more are turned away and nothing about it is written', async () => {
  const { call, DB } = await world();
  const from = { 'cf-connecting-ip': '203.0.113.7' };
  let n = 0;
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/v1/launches', launches(Array.from({ length: 20 }, () => report(n++, 'PPSA00002'))), from)).status, 204);
  assert.equal((await call('POST', '/v1/launches', launches([report(n++, 'PPSA00002')]), from)).status, 429);
  assert.equal((await call('POST', '/v1/launches', launches([report(n++, 'PPSA00002')]), { 'cf-connecting-ip': '203.0.113.8' })).status, 204, 'another address is its own');
  clock += 36e5 + 1;
  assert.equal((await call('POST', '/v1/launches', launches([report(n++, 'PPSA00002')]), from)).status, 204, 'and the hour after, again');
  assert.equal(DB.get('SELECT COUNT(*) AS n FROM launches').n, 202);
});

test("compat: each game's started and didn't, on all firmware and on each, from the last year; cached ten minutes", async () => {
  const { call } = await world();
  await call('POST', '/v1/launches', launches([report(1, 'PPSA09076'), report(2, 'PPSA09076'), report(3, 'PPSA09076', 'wontStart')]));
  await call('POST', '/v1/launches', launches([report(4, 'PPSA09076'), report(5, 'PPSA01748', 'wontStart', { verdict: 'mountFailed' })], { firmware: '12.090.001' }));
  const answer = await call('GET', '/v1/compat');
  assert.equal(answer.headers.get('cache-control'), 'public, max-age=600');
  assert.deepEqual(await answer.json(), { at: T0, titles: {
    PPSA09076: { s: 3, f: 1, fw: { '13.59': [2, 1], '12.09': [1, 0] } },
    PPSA01748: { s: 0, f: 1, fw: { '12.09': [0, 1] } }
  } });
  await call('POST', '/v1/launches', launches([report(6, 'PPSA09076')]));
  assert.equal((await (await call('GET', '/v1/compat')).json()).titles.PPSA09076.s, 3, 'the same answer for ten minutes');
  clock += 10 * 6e4 + 1;
  assert.equal((await (await call('GET', '/v1/compat')).json()).titles.PPSA09076.s, 4);
  clock += 366 * 864e5;
  assert.deepEqual((await (await call('GET', '/v1/compat')).json()).titles, {}, 'a year on, nothing left in it');
});

test('the summary shows the launches: the totals, what Fix it got running, the games that fail most and why', async () => {
  const { call, admin } = await world();
  await call('POST', '/v1/launches', launches([
    report(1, 'PPSA09076', 'wontStart', { verdict: 'crashed' }), report(2, 'PPSA09076', 'wontStart'), report(3, 'PPSA09076'),
    report(4, 'PPSA01748', 'played', { fixed: true, format: 'folder' }), report(5, 'PPSA01748', 'wontStart', { verdict: 'mountFailed', fixed: true, backport: true })
  ]));
  const { launches: seen } = await (await admin('GET', '/v1/admin/summary?days=30')).json();
  assert.deepEqual({ ...seen, failing: undefined, formats: undefined, firmware: undefined }, { reports: 5, titles: 2, played: 2, failed: 3, fixed: 2, fixedPlayed: 1, backport: 1, recent: 5, failing: undefined, formats: undefined, firmware: undefined });
  assert.deepEqual(seen.failing, [
    { title: 'PPSA09076', played: 1, failed: 2, crashed: 1, notStarted: 1, mountFailed: 0 },
    { title: 'PPSA01748', played: 1, failed: 1, crashed: 0, notStarted: 0, mountFailed: 1 }
  ]);
  assert.deepEqual(seen.formats, [{ format: 'exfat', played: 1, failed: 3 }, { format: 'folder', played: 1, failed: 0 }]);
  assert.deepEqual(seen.firmware, [{ firmware: '13.59', played: 2, failed: 3 }]);
});

test('the nightly tidy-up drops a launch reported over a year ago', async () => {
  const { call, tidy, DB } = await world();
  clock = T0 - 366 * 864e5;
  await call('POST', '/v1/launches', launches([report(1, 'PPSA00003')]));
  clock = T0;
  await call('POST', '/v1/launches', launches([report(2, 'PPSA00004')]));
  await tidy(DB, T0);
  assert.deepEqual(DB.all('SELECT title FROM launches').map((r) => r.title), ['PPSA00004']);
});

// 0.5.4: Sony's pictures for the PS4 app, through Cloudflare's cache: no other host, nothing but pictures.
test("/v1/picture passes Sony's pictures through Cloudflare's cache, and nothing else", async () => {
  const { call } = await world();
  const asked = [];
  const sony = { status: 200, type: 'image/png', length: '5', bytes: 'PNG..', url: '' };
  globalThis.fetch = (url, init) => {
    asked.push({ url: String(url), cf: init?.cf });
    const answer = new Response(sony.bytes, { status: sony.status, headers: { 'content-type': sony.type, ...(sony.length ? { 'content-length': sony.length } : {}) } });
    if (sony.url) Object.defineProperty(answer, 'url', { value: sony.url });
    return Promise.resolve(answer);
  };
  const cover = 'https://image.api.playstation.com/vulcan/ap/rnd/202107/0800/rJE5OUnACX4Y6LxdgTQoCd8d.png?w=440';
  const get = (address) => call('GET', `/v1/picture?u=${encodeURIComponent(address)}`);
  let answer = await get(cover);
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get('content-type'), 'image/png');
  assert.equal(answer.headers.get('cache-control'), 'public, max-age=2592000, immutable');
  assert.equal(await answer.text(), 'PNG..');
  assert.deepEqual(asked, [{ url: cover, cf: { cacheEverything: true, cacheTtl: 2592000 } }]);

  // Only Sony's picture hosts, over https, as plain addresses: nothing else is fetched.
  for (const other of ['https://example.com/x.png', 'http://image.api.playstation.com/x.png', 'https://image.api.playstation.com:8443/x.png',
    'https://user:pw@image.api.playstation.com/x.png', 'https://image.api.playstation.com.example.com/x.png'])
    assert.equal((await get(other)).status, 403, other);
  assert.equal((await call('GET', '/v1/picture')).status, 400);
  assert.equal((await call('GET', '/v1/picture?u=not%20an%20address')).status, 400);
  assert.equal(asked.length, 1);

  // Only pictures, at most 8 MiB, counted here when Sony sends no length; a redirect off Sony's hosts is refused,
  // and Sony's 404 stays a 404.
  sony.type = 'text/html';
  assert.equal((await get(cover)).status, 502);
  sony.type = 'image/jpeg';
  sony.length = String(8 * 1024 * 1024 + 1);
  assert.equal((await get(cover)).status, 502);
  sony.length = '';
  sony.bytes = 'x'.repeat(8 * 1024 * 1024 + 1);
  assert.equal((await get(cover)).status, 502);
  sony.bytes = 'JPEG';
  answer = await get(cover);
  assert.equal(answer.status, 200);
  assert.equal(await answer.text(), 'JPEG');
  sony.url = 'https://elsewhere.example.com/x.jpg';
  assert.equal((await get(cover)).status, 502);
  sony.url = '';
  sony.status = 404;
  assert.equal((await get(cover)).status, 404);
  sony.status = 500;
  assert.equal((await get(cover)).status, 502);
});

test('/v1/picture never touches the database', async () => {
  const { worker } = await world();
  globalThis.fetch = () => Promise.resolve(new Response('PNG', { headers: { 'content-type': 'image/png', 'content-length': '3' } }));
  const refuse = () => { throw new Error('no D1 for pictures'); };
  const cover = 'https://image.api.playstation.com/x.png';
  const answer = await worker.fetch(new Request(`https://online.example/v1/picture?u=${encodeURIComponent(cover)}`), { DB: { prepare: refuse, batch: refuse } });
  assert.equal(answer.status, 200);
  assert.equal(await answer.text(), 'PNG');
});
