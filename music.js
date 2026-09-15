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

const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const STANDARD = { 4: [28, 33, 38, 43], 5: [23, 28, 33, 38, 43], 6: [40, 45, 50, 55, 59, 64], 7: [35, 40, 45, 50, 55, 59, 64] };

// open-string MIDI notes, lowest string first → "E Standard", "Drop D", or the string names
export function tuningName(open) {
  const standard = STANDARD[open.length], shift = standard && open.map((m, i) => m - standard[i]);
  if (shift?.every((d) => d === shift[0])) return `${FLATS[open[0] % 12]} Standard`;
  if (shift && shift[0] === shift[1] - 2 && shift.slice(1).every((d) => d === shift[1])) return `Drop ${FLATS[open[0] % 12]}`;
  return open.map((m) => FLATS[m % 12]).join(' ');
}

// Marks chords that only repeat the chord just played: the same strings, frets and notation again within `gap` seconds.
// The highway draws those as beats instead of full chords: their notes get `repeat`, the chord becomes `highDensity`
// (the format's own flag for a repeated chord). Single notes are never marked: each one is still a note to play. Timing,
// links and pick direction don't count: alternate picking is still the same chord again.
// A spot played again by the very next strike (the same string and fret, within `gap`) is held down between the two: the
// later note gets `heldFrom`, the time of the strike before, so its target on the board stays lit instead of flashing off
// and on. A spot let go of in between (a mute, a slide or a bend moving off it) isn't held.
const UNMARKED = new Set(['time', 'sustain', 'chord', 'repeat', 'heldFrom', 'slurFrom', 'tieTo', 'dynamicLabel', 'pick']);
const fingering = (n) => JSON.stringify(Object.entries(n).filter(([k, v]) => !UNMARKED.has(k) && v !== null && v !== undefined && v !== false && v !== 0).sort());
export function markRepeats(notes, chords, gap = 1) {
  let before = null;
  for (let i = 0, j; i < notes.length; i = j) {
    for (j = i + 1; j < notes.length && notes[j].time - notes[i].time < 0.005; j++);
    const group = notes.slice(i, j), shape = group.map(fingering).sort().join('|');
    const chord = group[0].chord ?? null, soon = !!before && group[0].time - before.time <= gap, repeat = chord !== null && soon && before.shape === shape;
    for (const n of group) {
      n.repeat = repeat;
      const kept = soon && !n.mute && before.group.some((b) => b.string === n.string && b.fret === n.fret && !b.mute && !b.bend && !b.bendCurve && (b.slideTo ?? b.slideUnpitchTo ?? null) === null);
      n.heldFrom = kept ? before.time : null;
    }
    if (repeat) chords[chord].highDensity = true;
    before = { shape, time: group[0].time, group };
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

// Lyrics in two rows, karaoke style. lines: [{ time, end, syllables: [{ time, text }] }] in order, a syllable that ends a
// word ending in a space. Returns the lines on the top and bottom rows and the line being sung, as indexes (-1: none).
// A line shows from half a second before it starts until 1.5 s after it ends, and the line after it from 8 s ahead. A
// line that follows straight on is sung on the bottom row, under the one before, until `holdWords` of its words have
// lit up (fewer on a short line); then the rows move up and the next line comes in under it.
export function lyricsShown(lines, t, holdWords = 3) {
  const li = lines.findLastIndex((l) => l.time <= t + 0.5), soon = (i) => (lines[i]?.time ?? Infinity) - t < 8;
  if (li < 0 || t >= lines[li].end + 1.5) {
    const top = soon(li + 1) ? li + 1 : -1;
    return { top, bottom: top >= 0 && soon(top + 1) ? top + 1 : -1, active: -1 };
  }
  const words = (syllables) => syllables.filter((s) => s.text.endsWith(' ')).length, { syllables } = lines[li];
  const follows = li > 0 && lines[li].time - 0.5 < lines[li - 1].end + 1.5; // the line before was still up when this one came
  const hold = follows && words(syllables.filter((s) => s.time <= t)) < Math.max(1, Math.min(holdWords, words(syllables) - 1));
  const top = hold ? li - 1 : li;
  return { top, bottom: top + 1 === li || soon(top + 1) ? top + 1 : -1, active: li };
}
