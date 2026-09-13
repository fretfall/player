// Pure helpers, no DOM, so `node music.test.mjs` can check them.

const TICKS_PER_QUARTER = 960; // alphaTab MIDI resolution

// changes: [{tick, tempo}] in playback order → [{tick, tempo, ms}] with the song time at each change
export function tempoMap(changes, initialTempo) {
  const map = [{ tick: 0, tempo: initialTempo, ms: 0 }];
  for (const { tick, tempo } of changes) {
    const p = map.at(-1);
    map.push({ tick, tempo, ms: p.ms + ((tick - p.tick) * 60000) / (p.tempo * TICKS_PER_QUARTER) });
  }
  return map;
}

// ponytail: linear scan over tempo changes, binary search if a song ever has thousands of them
export function tickToMs(map, tick) {
  let seg = map[0];
  for (const t of map) {
    if (t.tick > tick) break;
    seg = t;
  }
  return seg.ms + ((tick - seg.tick) * 60000) / (seg.tempo * TICKS_PER_QUARTER);
}

export function msToTick(map, ms) {
  let seg = map[0];
  for (const t of map) {
    if (t.ms > ms) break;
    seg = t;
  }
  return seg.tick + ((ms - seg.ms) * seg.tempo * TICKS_PER_QUARTER) / 60000;
}

// YIN pitch detection → fractional MIDI note, or null for silence/noise.
// Covers bass low B (31 Hz) through guitar fret 24. Monophonic: on chords it usually finds the root.
export function detectPitch(samples, sampleRate) {
  const x = new Float32Array(samples.length >> 1); // halve the rate, 4× less work and plenty for < 1.4 kHz
  let power = 0;
  for (let i = 0; i < x.length; i++) {
    x[i] = (samples[2 * i] + samples[2 * i + 1]) / 2;
    power += x[i] * x[i];
  }
  if (power / x.length < 1e-4) return null; // quieter than RMS 0.01

  const sr = sampleRate / 2;
  const maxLag = Math.min(Math.ceil(sr / 30), x.length >> 1);
  const window = x.length - maxLag;
  const cmnd = new Float32Array(maxLag + 2).fill(1);
  let sum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let d = 0;
    for (let i = 0; i < window; i++) {
      const v = x[i] - x[i + lag];
      d += v * v;
    }
    sum += d;
    cmnd[lag] = sum ? (d * lag) / sum : 1;
    const t = lag - 1; // first local minimum under the threshold is the period
    if (t > 1 && cmnd[t] < 0.15 && cmnd[t] <= cmnd[lag]) {
      const a = cmnd[t - 1], b = cmnd[t], c = cmnd[lag];
      const period = t + (a - c) / (2 * (a - 2 * b + c) || 1);
      return 69 + 12 * Math.log2(sr / period / 440);
    }
  }
  return null;
}

export const noteName = (midi) =>
  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);
