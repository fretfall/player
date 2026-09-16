import assert from 'node:assert/strict';
import { onsetEnvelope, align } from './sync.js';

// An irregular chart (8th notes at 150 bpm with gaps), played back 3% slower and starting 2.7 s into the "recording"
let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const onsets = [];
for (let i = 0; i < 400; i++) if (random() > 0.35) onsets.push(1 + i * 0.2);

const rate = 11025, offset = 2.7, ratio = 1.03;
const samples = new Float32Array(Math.ceil((offset + ratio * 82 + 3) * rate)).map(() => (random() - 0.5) * 0.02);
for (const t of onsets) { // a plucked-string-ish burst per note
  const start = Math.round((offset + ratio * t) * rate);
  for (let i = 0; i < 0.12 * rate; i++) samples[start + i] += Math.sin(i * 0.3 + random()) * Math.exp(-i / (0.03 * rate)) * 0.6;
}

const got = align(onsetEnvelope(samples, rate), onsets);
assert.ok(Math.abs(got.offset - offset) < 0.025, `offset ${got.offset}`);
assert.ok(Math.abs(got.ratio - ratio) < 0.002, `ratio ${got.ratio}`);
assert.ok(got.confidence > 2, `confidence ${got.confidence}`);

// A recording that has nothing to do with the chart should not look confident
const unrelated = align(onsetEnvelope(new Float32Array(samples.length).map(() => random() - 0.5), rate), onsets);
assert.ok(unrelated.confidence < got.confidence / 2, `unrelated confidence ${unrelated.confidence}`);

console.log('ok');
