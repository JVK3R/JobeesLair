// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFrame} from './scroll-frame.js';

/** A 1280×720 vertical ScrollView over a stand-in NativeUI.scrollTo that clamps to `max`. */
function setup(maxY) {
  const engine = {x: 0, y: 0, maxY};
  globalThis.screen = {width: 1280, height: 720};
  globalThis.NativeUI = {scrollTo(handle, x, y) {
    if (!Number.isNaN(x)) engine.x = x;
    if (!Number.isNaN(y)) engine.y = Math.min(Math.max(y, 0), engine.maxY);
    return [engine.x, engine.y, 0, engine.maxY];
  }};
  engine.deferred = 0;
  globalThis.__ps5ReactNative = {image: {defer: ms => { engine.deferred = ms; }}};
  const targets = [];
  const frame = createFrame(null);
  frame.props = {onScrollTarget: target => targets.push(target)};
  frame.ref(1);
  frame.onLayout({layout: {x: 0, y: 0, width: 1280, height: 720}});
  const settle = () => {
    for (let i = 0; i < 200 && frame.timer !== null; i++) globalThis.__ps5ReactFrame(1000 / 60);
  };
  return {engine, frame, targets, settle};
}

test('onScrollTarget reports each new focus-scroll target once, when the scroll starts', () => {
  const {engine, frame, targets, settle} = setup(5000);
  const card = {x: 0, y: 1000, width: 100, height: 100};
  frame.reveal(card, null);
  assert.deepEqual(targets, [{x: 0, y: 412}], 'the card ends a 32 px margin above the bottom');
  frame.reveal(card, null);
  assert.equal(targets.length, 1, 'an unchanged target is not reported again');
  settle();
  assert.equal(engine.y, 412);
  assert.equal(frame.y, 412);
  assert.equal(targets.length, 1, 'arriving is not a new target');
  assert.equal(engine.deferred, 150, 'image fetches wait while the view moves');
});

test('onScrollTarget reports where the scroll settled when shrinking content clamps it', () => {
  const {engine, frame, targets, settle} = setup(5000);
  frame.reveal({x: 0, y: 1000, width: 100, height: 100}, null);
  engine.maxY = 300;
  settle();
  assert.deepEqual(targets, [{x: 0, y: 412}, {x: 0, y: 300}]);
  assert.equal(frame.y, 300);
});

test('a 120 Hz display scrolls at the 60 Hz speed, through the positions between its steps', () => {
  const run = (hz) => {
    const {engine, frame} = setup(5000);
    frame.reveal({x: 0, y: 3000, width: 100, height: 100}, null);
    const positions = [];
    for (let i = 0; i < 400 && frame.timer !== null; i++) {
      globalThis.__ps5ReactFrame(1000 / hz);
      positions.push(engine.y);
    }
    return positions;
  };
  const at60 = run(60), at120 = run(120);
  assert.equal(at120.at(-1), at60.at(-1));
  assert.ok(Math.abs(at120.length - 2 * at60.length) <= 1, `${at120.length} frames at 120 Hz, ${at60.length} at 60`);
  at60.slice(0, -1).forEach((y, i) => assert.equal(at120[2 * i + 1], y, `tick ${i + 1} lands where 60 Hz put it`));
  const between = at120.filter((y, i) => i % 2 === 0 && y !== (at120[i - 1] ?? 0) && y !== at120[i + 1]);
  assert.ok(between.length > at60.length / 2, 'the frames between ticks show new positions');
});

test('while it animates, position is where the engine shows the view (VirtualList reads it)', () => {
  const {engine, frame} = setup(5000);
  frame.reveal({x: 0, y: 3000, width: 100, height: 100}, null);
  assert.deepEqual(frame.position, [0, 0]);
  for (let i = 0; i < 5; i++) {
    globalThis.__ps5ReactFrame(1000 / 120);
    assert.deepEqual(frame.position, [engine.x, engine.y]);
  }
  assert.ok(frame.position[1] > 0 && frame.timer !== null);
  frame.shift(40);
  assert.equal(frame.position[1], engine.y, 'a shift moves it with the content');
});
