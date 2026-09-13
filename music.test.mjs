import assert from 'node:assert/strict';
import { tempoMap, tickToMs, msToTick, detectPitch, noteName, tuningName, markRepeats } from './music.js';

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
assert.deepEqual([[40, 45, 50, 55, 59, 64], [38, 45, 50, 55, 59, 64], [39, 44, 49, 54, 58, 63], [26, 33, 38, 43], [38, 45, 50, 55, 57, 62]].map(tuningName),
  ['E Standard', 'Drop D', 'E♭ Standard', 'Drop D', 'D A D G A D']);

// Repeats: the same note or chord again soon after is a beat; a change, a new technique or a long rest shows it in full
const n = (time, string, fret, extra = {}) => ({ time, string, fret, chord: null, mute: false, palmMute: false, harmonic: false, slideTo: null, bend: 0, hammerOn: false, pullOff: false, tap: false, ...extra });
const notes = [n(0, 0, 1), n(0.2, 0, 1), n(0.4, 0, 1, { palmMute: true }), n(0.6, 0, 3), n(0.8, 1, 3, { chord: 0 }), n(0.8, 2, 4, { chord: 0 }), n(1, 1, 3, { chord: 1 }), n(1, 2, 4, { chord: 1 }), n(3, 1, 3, { chord: 2 }), n(3, 2, 4, { chord: 2 })];
const chords = [{}, {}, {}];
markRepeats(notes, chords);
assert.deepEqual(notes.map((x) => x.repeat), [false, true, false, false, false, false, true, true, false, false]);
assert.deepEqual(chords.map((c) => !!c.highDensity), [false, true, false]);

console.log('ok');
