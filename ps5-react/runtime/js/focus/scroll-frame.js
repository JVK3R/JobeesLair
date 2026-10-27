// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// The scrolling state behind a ScrollView: focus reveals, the eased per-frame scroll through
// NativeUI.scrollTo (patches/embeddedReact-scroll-to.patch) and `onScrollTarget`. Free of React so
// tests can drive it with a stand-in NativeUI.
import {onFrame} from '../frame.js';
import {deferImageFetches} from '../native.js';
import {anchorOffset, catchUpSpeed, revealOffset, scrollStep, topOffset} from './geometry.js';

// 32 logical px of a 1280-wide layout, in screen px like the layout rectangles.
const MARGIN = 32 / 1280;
// The engine cannot animate a scroll offset, so JavaScript steps it on every presented frame (the
// host's frame callback, not a timer that drifts against the display), in whole pixels: up to 40
// logical px per 60 Hz frame, reached in four frames, then braking to stop on the target. A held
// key scrolls at that one steady speed, which also bounds the strip the engine rasterizes per frame.
// The steps are 60 Hz ticks; a faster display shows positions between them, so speed is the same.
const MAX_LOGICAL_PX_PER_FRAME = 40;
const ACCEL_LOGICAL_PX = 12;
const BRAKE_LOGICAL_PX = 4;
const FRAME_MS = 1000 / 60;
// Images wait while the view moves and this long after it stops, like a browser's lazy loading: art
// that only flies past is never fetched; what the view stops on (with the rows the list mounts ahead)
// starts then. Cached art still draws during the scroll.
const IMAGE_DEFER_MS = 150;

function assignRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/** @param {import('./manager.js').Frame | null} parent */
export function createFrame(parent) {
  const frame = {
    parent, x: 0, y: 0, props: {}, forwardedRef: null, handle: null, viewport: null, timer: null, target: null,
    speed: [0, 0], position: [0, 0], from: [0, 0], to: [0, 0], progress: 1, listeners: new Set(),
    /**
     * @param {import('./geometry.js').Rect} rect pre-scroll, like `viewport`
     * @param {import('./geometry.js').Rect | null} anchor its `scrollAnchor` ancestor in this frame, aligned
     *   on a vertical frame's y axis; the x axis and horizontal frames always move the least
     * @param {{instant?: boolean, first?: boolean}} [options] `instant` moves there now instead of easing (a
     *   jump far down a list, whose rows on the way could not all mount); `first`: nothing focusable is above
     *   it, so the content's top is shown when that keeps it in view (MODIFIED, Jobee'sLair 0.5.0 Pre Release 3),
     *   else as much of it as does (0.5.3)
     */
    reveal(rect, anchor, {instant = false, first = false} = {}) {
      const {viewport, handle} = frame;
      if (!viewport || handle == null) return;
      const [fromX, fromY, maxX, maxY] = NativeUI.scrollTo(handle, NaN, NaN);
      const margin = Math.round(screen.width * MARGIN);
      const x = revealOffset(frame.x, rect.x - viewport.x, rect.width, viewport.width, maxX, margin);
      // Content offsets (rect is pre-scroll): the first focusable shows from 0 when it fits on the first screen,
      // else from as near the top as still shows it (the least movement kept what is above it out of reach).
      const y = first && !frame.props.horizontal ? topOffset(rect.y - viewport.y, rect.height, viewport.height, maxY, margin)
        : anchor && !frame.props.horizontal
        ? anchorOffset(frame.y, rect.y - viewport.y, rect.height, anchor.y - viewport.y, viewport.height, maxY, margin)
        : revealOffset(frame.y, rect.y - viewport.y, rect.height, viewport.height, maxY, margin);
      if (instant) {
        frame.stop();
        const [atX, atY] = NativeUI.scrollTo(handle, Math.round(x), Math.round(y));
        frame.x = Math.round(atX);
        frame.y = Math.round(atY);
        frame.position = [frame.x, frame.y];
      } else {
        if (x === frame.x && y === frame.y) return;
        frame.x = x;
        frame.y = y;
        frame.animate(fromX, fromY, x, y);
      }
      frame.notify();
      frame.props.onScrollTarget?.({x: frame.x, y: frame.y});
    },
    // A new target while scrolling only moves the target; the steps carry on at the current speed.
    animate(fromX, fromY, toX, toY) {
      frame.target = [Math.round(toX), Math.round(toY)];
      if (frame.timer !== null) return;
      const scale = screen.width / 1280;
      const [maxSpeed, accel, brake] = [MAX_LOGICAL_PX_PER_FRAME, ACCEL_LOGICAL_PX, BRAKE_LOGICAL_PX]
        .map(logical => Math.max(1, Math.round(logical * scale)));
      frame.from = frame.to = frame.position = [Math.round(fromX), Math.round(fromY)];
      frame.progress = 1;
      frame.speed = [0, 0];
      frame.timer = onFrame(elapsedMs => {
        // Ticks covered by this frame; a late frame advances at most two, so a hitch is not followed by a jump.
        frame.progress += Math.min(2, elapsedMs / FRAME_MS);
        for (; frame.progress > 1 + 1e-6; frame.progress--) {
          let [x, y] = frame.to, speedX, speedY;
          const capX = catchUpSpeed(frame.target[0] - x, frame.viewport.width, maxSpeed);
          const capY = catchUpSpeed(frame.target[1] - y, frame.viewport.height, maxSpeed);
          [x, speedX] = scrollStep(x, frame.speed[0], frame.target[0], capX, accel, brake);
          [y, speedY] = scrollStep(y, frame.speed[1], frame.target[1], capY, accel, brake);
          frame.speed = [speedX, speedY];
          frame.from = frame.to;
          frame.to = [x, y];
        }
        const t = Math.min(frame.progress, 1);
        let [x, y] = frame.from.map((from, axis) => Math.round(from + (frame.to[axis] - from) * t));
        const [atX, atY] = NativeUI.scrollTo(frame.handle, x, y);
        deferImageFetches(IMAGE_DEFER_MS);
        // The engine stores offsets as floats. Far from the request means clamped by a content size that
        // changed since the target was chosen: settle where it stopped.
        const clampX = Math.abs(atX - x) > 0.5, clampY = Math.abs(atY - y) > 0.5;
        if (clampX) frame.target[0] = x = Math.round(atX);
        if (clampY) frame.target[1] = y = Math.round(atY);
        if (clampX || clampY) [frame.from, frame.to, frame.progress] = [[x, y], [x, y], 1];
        frame.position = [x, y];
        if (x !== frame.target[0] || y !== frame.target[1]) return;
        frame.stop();
        const clamped = x !== frame.x || y !== frame.y;
        frame.x = x;
        frame.y = y;
        frame.notify();
        if (clamped) frame.props.onScrollTarget?.({x, y});
      });
    },
    /**
     * The content moved up by `dy` (a VirtualList dropping rows above the viewport, or down for a
     * negative `dy`): scrolls by the same amount so nothing moves on screen, mid-animation included.
     */
    shift(dy) {
      const [, atY] = NativeUI.scrollTo(frame.handle, NaN, NaN);
      NativeUI.scrollTo(frame.handle, NaN, atY - dy);
      frame.y -= dy;
      if (frame.timer === null) return;
      frame.from = [frame.from[0], frame.from[1] - dy];
      frame.to = [frame.to[0], frame.to[1] - dy];
      frame.position = [frame.position[0], frame.position[1] - dy];
      frame.target[1] -= dy;
    },
    // Viewport or offset changed; while animating, y is the target, so listeners see where it is going.
    notify() {
      for (const listener of frame.listeners) listener();
    },
    stop() {
      frame.timer?.();
      frame.timer = null;
    },
    onLayout(event) {
      frame.viewport = event.layout;
      frame.notify();
      frame.props.onLayout?.(event);
    },
    // While focus scrolling animates, x/y already hold its target; touch scrolling updates them live.
    onScroll(event) {
      if (frame.timer === null) {
        frame.x = event.scrollX;
        frame.y = event.scrollY;
        frame.notify();
      }
      frame.props.onScroll?.(event);
    },
    ref(handle) {
      frame.handle = handle;
      assignRef(frame.forwardedRef, handle);
    },
  };
  return frame;
}
