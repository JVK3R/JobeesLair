// The editions (0.5.1, app/edition.js): the committed build is the store; the homebrew-only edition has its own
// title ID, repository and image, its manifest (app/app.homebrew.json) agrees with the store's on everything but
// those, and packaging/homebrew-edition.sh switches a copy over.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { EDITION, EDITIONS, HOMEBREW_ONLY } = await load('app/edition.js');
const { APP_NAME, IMAGE_NAME, REPO, TITLE_ID, VERSION } = await load('app/version.js');
const { ASSETS, contentVersionOf } = await load('app/state/updater.js');
const { IMAGE_NAME: STAGED } = await load('app/state/auto-update.js');

test('the committed edition is the store, and version.js and the updater take their names from it', () => {
  assert.equal(EDITION, 'store');
  assert.equal(HOMEBREW_ONLY, false);
  assert.equal(TITLE_ID, 'PPSA99471');
  assert.equal(REPO, 'JVK3R/JobeesLair');
  assert.equal(IMAGE_NAME, 'JobeesLair.exfat');
  assert.equal(APP_NAME, "Jobee'sLair");
  assert.equal(ASSETS.image, IMAGE_NAME);
  assert.equal(STAGED, `${IMAGE_NAME}.staged`);
  assert.equal(EDITIONS.homebrew.titleId, 'PPSA99472');
  assert.equal(EDITIONS.homebrew.repo, 'JVK3R/JobeesLair-Homebrew');
  assert.notEqual(EDITIONS.homebrew.image, EDITIONS.store.image, 'two images, so both install beside each other');
});

test("the homebrew edition's manifest is the store's with its own identity", () => {
  const store = JSON.parse(readFileSync(path.join(repo, 'app/app.json'), 'utf8'));
  const homebrew = JSON.parse(readFileSync(path.join(repo, 'app/app.homebrew.json'), 'utf8'));
  assert.equal(homebrew.titleId, EDITIONS.homebrew.titleId);
  assert.match(homebrew.contentId, new RegExp(`^UP9000-${EDITIONS.homebrew.titleId}_00-[A-Z0-9]{16}$`));
  assert.equal(homebrew.name, EDITIONS.homebrew.name);
  assert.equal(homebrew.version, contentVersionOf(VERSION), 'the same package version as the store');
  assert.match(homebrew.userAgent, /^JobeesLair-Homebrew\//);
  // `ps4` is identity too: the PS4 build's title and content IDs (ps5-react/tools/build_ps4.py).
  const same = ({ titleId, contentId, name, userAgent, ps4, ...rest }) => rest;
  assert.deepEqual(same(homebrew), same(store), 'everything else as the store has it');
});

test('the switch script rewrites exactly the EDITION line', () => {
  const script = readFileSync(path.join(repo, 'packaging/homebrew-edition.sh'), 'utf8');
  const source = readFileSync(path.join(repo, 'app/edition.js'), 'utf8');
  const line = /^  var EDITION = "store";$/m.exec(source);
  assert.ok(line, 'edition.js has the line the script looks for');
  assert.ok(script.includes(`s/^  var EDITION = "store";$/  var EDITION = "homebrew";/`), 'the sed the script runs');
  assert.ok(script.includes('cp "$root/app/app.homebrew.json" "$root/app/app.json"'));
});
