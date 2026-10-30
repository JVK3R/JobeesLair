// 0.5.4: the PS4 fetches Sony's pictures through api.jobees.org/v1/picture (app/state/picture-route.js); every other
// address loads as given.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pictureRoute } from '../app/state/picture-route.js';

test("Sony's picture hosts go through Jobee'sLair online, whole and encoded; other addresses load as given", () => {
  const cover = 'https://image.api.playstation.com/vulcan/ap/rnd/202107/0800/rJE5OUnACX4Y6LxdgTQoCd8d.png?w=440';
  assert.equal(pictureRoute(cover), `https://api.jobees.org/v1/picture?u=${encodeURIComponent(cover)}`);
  assert.equal(new URL(pictureRoute(cover)).searchParams.get('u'), cover);
  assert.match(pictureRoute('https://poseidon.dl.playstation.net/cdn/UP0001/CUSA00001_00/a.png'), /^https:\/\/api\.jobees\.org\/v1\/picture\?u=/);
  for (const other of ['https://cdn.cloudflare.steamstatic.com/steam/apps/1985810/library_hero.jpg', 'https://archive.org/download/x/cover.jpg',
    'http://image.api.playstation.com/x.png', 'https://image.api.playstation.com.example.com/x.png'])
    assert.equal(pictureRoute(other), null, other);
});
