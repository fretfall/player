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

const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const STANDARD = { 4: [28, 33, 38, 43], 5: [23, 28, 33, 38, 43], 6: [40, 45, 50, 55, 59, 64], 7: [35, 40, 45, 50, 55, 59, 64] };

// open-string MIDI notes, lowest string first → "E Standard", "Drop D", or the string names
export function tuningName(open) {
  const standard = STANDARD[open.length], shift = standard && open.map((m, i) => m - standard[i]);
  if (shift?.every((d) => d === shift[0])) return `${FLATS[open[0] % 12]} Standard`;
  if (shift && shift[0] === shift[1] - 2 && shift.slice(1).every((d) => d === shift[1])) return `Drop ${FLATS[open[0] % 12]}`;
  return open.map((m) => FLATS[m % 12]).join(' ');
}

export const noteName = (midi) =>
  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);

// Marks what only repeats the notes just played: the same strings, frets and notation again within `gap` seconds.
// The highway draws those as beats instead of full notes: single notes get `repeat`, chords become `highDensity`
// (the format's own flag for a repeated chord). Timing, links and pick direction don't count: alternate picking is
// still the same note again.
const UNMARKED = new Set(['time', 'sustain', 'chord', 'midi', 'hit', 'missed', 'repeat', 'slurFrom', 'tieTo', 'dynamicLabel', 'pick']);
const fingering = (n) => JSON.stringify(Object.entries(n).filter(([k, v]) => !UNMARKED.has(k) && v !== null && v !== undefined && v !== false && v !== 0).sort());
export function markRepeats(notes, chords, gap = 1) {
  let before = null;
  for (let i = 0, j; i < notes.length; i = j) {
    for (j = i + 1; j < notes.length && notes[j].time - notes[i].time < 0.005; j++);
    const group = notes.slice(i, j), shape = group.map(fingering).sort().join('|');
    const repeat = !!before && before.shape === shape && group[0].time - before.time <= gap;
    for (const n of group) n.repeat = repeat;
    if (repeat && group[0].chord !== null) chords[group[0].chord].highDensity = true;
    before = { shape, time: group[0].time };
  }
}

// Connections the highway draws between notes, for charts from any source: a slur back to the note a hammer-on or
// pull-off comes from, a tie to the next note for linked notes, let-ring notes sounding until the string is played
// again (4 s at most), a dynamic only where it changes (f is where a Guitar Pro file starts), and a barre where one
// finger holds three or more strings at the same fret.
export function annotate(notes, chords) {
  const last = {};
  let dynamic = 'f';
  notes.forEach((n, i) => {
    const before = last[n.string];
    n.slurFrom = (n.hammerOn || n.pullOff) && before !== undefined && n.time - notes[before].time < 1.5 ? before : null;
    if (before !== undefined) {
      const p = notes[before];
      if (p.letRing) p.sustain = Math.max(p.sustain, Math.min(n.time - p.time, 4));
      if (p.linkNext) p.tieTo = i;
    }
    n.dynamicLabel = n.dynamic && n.dynamic !== dynamic ? n.dynamic : null;
    if (n.dynamic) dynamic = n.dynamic;
    last[n.string] = i;
  });
  for (const n of Object.values(last).map((i) => notes[i])) if (n.letRing) n.sustain = Math.max(n.sustain, 2);
  for (const c of chords) c.barre ??= barreOf(c);
}

function barreOf({ frets = [], fingers = [] }) {
  const held = {};
  frets.forEach((fret, string) => {
    if (fret > 0 && fingers[string] >= 1) (held[`${fingers[string]}:${fret}`] ??= []).push(string);
  });
  const [key, strings] = Object.entries(held).sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  return strings?.length >= 3 ? { fret: +key.split(':')[1], from: Math.min(...strings), to: Math.max(...strings) } : null;
}
