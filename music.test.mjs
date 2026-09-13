import assert from 'node:assert/strict';
import { tempoMap, tickToMs, msToTick, detectPitch, noteName } from './music.js';

// 120 bpm for 4 quarters, then 60 bpm
const map = tempoMap([{ tick: 3840, tempo: 60 }], 120);
assert.equal(tickToMs(map, 960), 500);
assert.equal(tickToMs(map, 3840), 2000);
assert.equal(tickToMs(map, 4800), 3000);
for (const tick of [0, 960, 3840, 4800]) assert.equal(msToTick(map, tickToMs(map, tick)), tick);

// guitar-ish tone: sawtooth with a bit of noise
const tone = (hz, sr = 48000, n = 4096) =>
  Float32Array.from({ length: n }, (_, i) => 0.3 * (((i * hz) / sr) % 1) - 0.15 + (Math.random() - 0.5) * 0.02);

for (const midi of [28, 40, 45, 52, 64, 76, 88]) { // bass low E … guitar fret 24
  const hz = 440 * 2 ** ((midi - 69) / 12);
  const got = detectPitch(tone(hz), 48000);
  assert.ok(got !== null && Math.abs(got - midi) < 0.3, `${noteName(midi)} (${hz.toFixed(1)} Hz) → ${got}`);
}
assert.equal(detectPitch(new Float32Array(4096), 48000), null);
assert.equal(noteName(40), 'E2');

console.log('ok');
