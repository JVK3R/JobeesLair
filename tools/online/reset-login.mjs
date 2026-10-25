// Opens the dashboard's first-time setup: a temporary password (default "password") that works for an hour and
// only for the setup, where Jake picks his own password and adds his authenticator. Use it the first time, and if
// the password or the phone with the authenticator is lost. Everyone signed in is signed out, the old password
// and authenticator key stop working, and the session signing key is replaced (SESSION_KEY, never shown).
//
//   cd tools/online && node reset-login.mjs [temporary password]      (logged in with `npx wrangler login`)
import { spawnSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
var SETUP_MS = 36e5;
var ITERATIONS = 100000;  // as worker.js (the most PBKDF2 rounds Workers allows)

/** The stored form worker.js checks: pbkdf2$<iterations>$<salt>$<hash>, base64. */
export function hashPassword(password, salt = randomBytes(16)) {
  return `pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('base64')}`;
}

// One command line (npx is a .cmd on Windows, which only runs through a shell); a secret goes in on stdin.
function wrangler(args, input) {
  const run = spawnSync(`npx --yes wrangler@4 ${args}`, { cwd: here, input, encoding: 'utf8', shell: true });
  if (run.status !== 0) throw new Error(`wrangler ${args.split(' ')[0]} failed: ${String(run.stderr || run.stdout).trim().split('\n').pop()}`);
}

function main() {
  const temporary = process.argv[2] || 'password';
  const now = Date.now();
  const until = now + SETUP_MS;
  const sql = [
    "INSERT INTO admin_login (slot, password, totp, pending, setup_until, version) " +
      `VALUES (1, '${hashPassword(temporary)}', NULL, NULL, ${until}, ${now}) ` +
      "ON CONFLICT (slot) DO UPDATE SET password = excluded.password, totp = NULL, pending = NULL, setup_until = excluded.setup_until, version = excluded.version",
    'DELETE FROM admin_failures',
    "DELETE FROM admin_state WHERE name = 'totp_step'"
  ].join(';\n');
  // As a file: the hash's "$" signs would mean something to a shell on a command line.
  const file = path.join(tmpdir(), `jobeeslair-reset-${randomBytes(4).toString('hex')}.sql`);
  writeFileSync(file, `${sql};\n`);
  try {
    wrangler('secret put SESSION_KEY', randomBytes(32).toString('base64url'));
    wrangler(`d1 execute jobeeslair-online --remote --yes --file "${file}"`);
  } finally {
    rmSync(file, { force: true });
  }
  const time = new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  console.log(`Setup is open until ${time}: sign in at https://api.jobees.org/dashboard with the first-time password, then pick your own and add your authenticator.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`${error.message}. Nothing was opened; run it again.`);
    process.exitCode = 1;
  }
}
