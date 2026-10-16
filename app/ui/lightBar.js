// ../pub-game-store/native/ui/lightBar.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: Jobee'sLair status light. While it is on (Settings, on by default) the DualSense light bar
// shows the download queue: a slow breath in the theme's accent when idle, green that brightens with the
// queue's overall percentage (and a soft sweep along it) while downloading, steady amber when paused,
// red on an error (a three-second flash when a download fails, then steady red while one stays failed).
// With it off, the bar takes the focused game's cover color as before.
// One owner writes the bar: a 100 ms tick computes the color (statusFrame, pure) and only a changed color
// reaches the pad, so a steady state costs no pad writes. Every pad call is caught: no pad, no error.

import { Controller, Image } from '@ps5-react/core';
import { loadList, saveList } from '../state/saved.js';
import { colors } from './colors.js';

  var NEUTRAL = "#ffffff";
  var colors2 = /* @__PURE__ */ new Map();
  var owner = null;
  var resetting = null;
  var RESET_DELAY_MS = 250;
  var LIGHT_DELAY_MS = 150;
  var lighting = null;
  // A refusal is logged once, not ten times a second.
  var warned = false;
  function setPad(color) {
    try {
      Controller.setLightBar(color);
    } catch (error2) {
      if (!warned) console.log(`lightBar: ${error2?.message ?? error2}`);
      warned = true;
    }
  }
  function resetPad() {
    try {
      Controller.resetLightBar();
    } catch (error2) {
      console.log(`lightBar: ${error2?.message ?? error2}`);
    }
  }
  var colorOf = (uri) => {
    if (!colors2.has(uri)) colors2.set(uri, Image.getColor(uri).catch(() => null));
    return colors2.get(uri);
  };
  // The focused game's cover color, used only while the status light is off.
  function lightGame(key, game) {
    owner = key;
    clearTimeout(resetting);
    clearTimeout(lighting);
    if (statusOn) return;
    if (!game.art.cover) {
      setPad(NEUTRAL);
      return;
    }
    // A color the pad refuses (a malformed one, or no pad) is dropped: no unhandled rejection.
    lighting = setTimeout(() => void colorOf(game.art.cover).then((color) => {
      if (owner !== key || statusOn) return;
      setPad(color ?? NEUTRAL);
    }).catch(() => {
    }), LIGHT_DELAY_MS);
  }
  function unlight(key) {
    if (owner !== key) return;
    owner = null;
    clearTimeout(resetting);
    if (statusOn) return;
    resetting = setTimeout(() => {
      if (owner === null && !statusOn) resetPad();
    }, RESET_DELAY_MS);
  }

  // ---- The status light ----
  var GREEN = [34, 255, 102], GREEN_DIM = [6, 64, 26], AMBER = [255, 160, 0], RED = [255, 0, 0];
  var TICK_MS = 100, BREATH_MS = 4200, SWEEP_MS = 1800, FLASH_MS = 3e3, BLINK_MS = 400;
  var MOVING = ["queued", "resolving", "connecting", "downloading", "verifying", "extracting", "installing"];
  var HELD = ["paused", "pausing", "awaiting-browser"];
  var hexRGB = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) || 0);
  var mix = (from, to, amount) => from.map((value, i) => Math.round(value + (to[i] - value) * amount));
  var scale = (rgb, level) => rgb.map((value) => Math.round(value * level));
  // The queue reduced to what the bar shows: the mode, the overall fraction of the moving jobs (null
  // when none knows its size yet) and how many have failed.
  function queueStatus(jobs) {
    const moving = jobs.filter((job2) => MOVING.includes(job2.state));
    const failed = jobs.filter((job2) => job2.state === "failed").length;
    let fraction = null;
    const sized = moving.filter((job2) => job2.total > 0);
    if (sized.length) {
      const total = sized.reduce((sum, job2) => sum + job2.total, 0);
      const written = sized.reduce((sum, job2) => sum + Math.min(job2.written || 0, job2.total), 0);
      fraction = Math.min(1, written / total);
    }
    const mode = moving.length ? "downloading" : failed ? "error" : jobs.some((job2) => HELD.includes(job2.state)) ? "paused" : "idle";
    return { mode, fraction, failed };
  }
  // The bar's color at `now` for a status, an accent ('#rrggbb') and the time a failure flash began
  // (or null). Pure, so the look is testable without a pad.
  function statusFrame(status, accent, now, flashSince = null) {
    if (flashSince != null && now - flashSince < FLASH_MS) return Math.floor((now - flashSince) / BLINK_MS) % 2 ? [40, 0, 0] : RED;
    if (status.mode === "error") return RED;
    if (status.mode === "paused") return AMBER;
    if (status.mode === "downloading") {
      // The base climbs from dim to full green with the percentage; a soft wave sweeps over it.
      const base = mix(GREEN_DIM, GREEN, 0.35 + 0.65 * (status.fraction ?? 0.35));
      const wave = 0.5 - 0.5 * Math.cos(now % SWEEP_MS / SWEEP_MS * 2 * Math.PI);
      return scale(base, 0.78 + 0.22 * wave);
    }
    // Idle: a slow breath in the theme's accent, never fully dark.
    const breath = 0.5 - 0.5 * Math.cos(now % BREATH_MS / BREATH_MS * 2 * Math.PI);
    return scale(hexRGB(accent), 0.12 + 0.88 * breath);
  }
  var SETTINGS = "settings.json";
  var statusOn = loadList(SETTINGS, "settings").statusLight !== false;
  var listeners = /* @__PURE__ */ new Set();
  var ticker = null, unsubscribe = null, status = { mode: "idle", fraction: null, failed: 0 }, flashSince = null, shown = "";
  function tick() {
    const rgb = statusFrame(status, colors.accent, Date.now(), flashSince);
    const key = rgb.join(",");
    if (key === shown) return;
    shown = key;
    setPad({ r: rgb[0], g: rgb[1], b: rgb[2] });
  }
  // Starts the status light on the queue (`subscribe` is the queue's: listener(jobs), returns the stop).
  // Returns the function that stops it; a queue that cannot be reached leaves the idle breath running.
  function startStatusLight(subscribe) {
    stopStatusLight();
    if (!statusOn) return () => {
    };
    // The first snapshot is the baseline: failures from an earlier session show steady red, without the flash.
    let primed = false;
    try {
      unsubscribe = subscribe((jobs) => {
        const next = queueStatus(jobs);
        if (primed && next.failed > status.failed) flashSince = Date.now();
        primed = true;
        status = next;
      });
    } catch (error2) {
      console.log(`lightBar: queue not watched: ${error2?.message ?? error2}`);
    }
    shown = "";
    ticker = setInterval(tick, TICK_MS);
    tick();
    return stopStatusLight;
  }
  var lastSubscribe = null;
  function stopStatusLight() {
    clearInterval(ticker);
    ticker = null;
    try {
      unsubscribe?.();
    } catch {
    }
    unsubscribe = null;
    flashSince = null;
    status = { mode: "idle", fraction: null, failed: 0 };
  }
  function watchQueue(subscribe) {
    lastSubscribe = subscribe;
    return startStatusLight(subscribe);
  }
  function setStatusLight(on) {
    if (on === statusOn) return;
    statusOn = on;
    saveList(SETTINGS, "settings", { ...loadList(SETTINGS, "settings"), statusLight: on });
    if (on && lastSubscribe) startStatusLight(lastSubscribe);
    else if (!on) {
      stopStatusLight();
      resetPad();
    }
    for (const listener of listeners) listener(on);
  }
  var statusLightOn = () => statusOn;
  function onStatusLight(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

export { lightGame, onStatusLight, queueStatus, setStatusLight, statusFrame, statusLightOn, unlight, watchQueue };
