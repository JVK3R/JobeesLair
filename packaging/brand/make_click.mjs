// Synthesizes Jobee'sLair's navigation click (app/assets/sounds/focus.wav), the sound of every move
// through a list or menu: a short, bright tick with a soft body, quieter and shorter than the D-pad's
// 110 ms repeat so held scrolling stays a light patter. Deterministic: the same file every run.
//   node packaging/brand/make_click.mjs        (from the repository root)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodeWav } from '../../ps5-react/tools/wav.mjs';

const RATE = 48000, LENGTH_MS = 28, PEAK_DB = -26;
const out = fileURLToPath(new URL('../../app/assets/sounds/focus.wav', import.meta.url));

// A fixed-seed generator, so the transient's noise is the same every time.
let seed = 0x6a6f65;
const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;

const count = Math.round(RATE * LENGTH_MS / 1000);
const samples = new Float64Array(count);
let previous = 0;
for (let i = 0; i < count; ++i) {
  const t = i / RATE;
  const attack = Math.min(1, t / 0.0004); // 0.4 ms: crisp, but no click of its own from a hard edge
  const tick = Math.sin(2 * Math.PI * 2900 * t) * Math.exp(-t / 0.0035);
  const body = 0.35 * Math.sin(2 * Math.PI * 1450 * t) * Math.exp(-t / 0.006);
  const white = noise();
  const transient = 0.5 * (white - previous) * Math.exp(-t / 0.0006); // first difference: the hiss's top end
  previous = white;
  const fade = Math.min(1, (count - i) / (RATE * 0.003)); // last 3 ms
  samples[i] = (tick + body + transient) * attack * fade;
}
let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
const gain = 10 ** (PEAK_DB / 20) / peak;
for (let i = 0; i < count; ++i) samples[i] *= gain;
writeFileSync(out, encodeWav(samples, RATE));
console.log(`wrote ${out}: ${LENGTH_MS} ms, peak ${PEAK_DB} dBFS`);
