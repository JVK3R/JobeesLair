// Times the source list's ranking on a large release list (the work the game page repeats on every render).
// Run: node --import ./tests/stub-loader.mjs tests/bench/sources.bench.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('../..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { preferredRelease, sourceSections, fallbacks, describeSource } = await load('app/game/sources.js');

const HOSTS = ['archive.org', 'mediafire.com', 'vikingfile.com', 'datanodes.to', 'buzzheavier.com', '1fichier.com', 'gofile.io', 'akirabox.com'];
const releases = Array.from({ length: 240 }, (_, i) => {
  const host = HOSTS[i % HOSTS.length];
  const url = `https://${host}/file/${i}`;
  return { id: `r${i}`, label: `USA ${10 + (i % 4)}.xx Base (v01.${i % 30}) - ${host}`, provider: host.split('.')[0], format: i % 3 ? 'exfat' : 'zip', sizeBytes: (20 + (i % 9)) * 1024 ** 3, url, browserUrl: url, record: `rec${i % 7}`, linkHealth: i % 11 ? { status: 'active' } : { status: 'dead' } };
});
const time = (name, fn, rounds = 60) => {
  fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) fn();
  console.log(`${name.padEnd(28)} ${(Number(process.hrtime.bigint() - start) / 1e6 / rounds).toFixed(2)} ms`);
};
time('preferredRelease (240)', () => preferredRelease(releases));
time('sourceSections (240)', () => sourceSections(releases));
time('fallbacks (240)', () => fallbacks(releases, 0));
time('describeSource x240', () => releases.forEach(describeSource));
