import assert from 'node:assert/strict';
import { tempoMap, tickToMs, msToTick, tuningName, tuningReference, markRepeats, annotate, lyricsShown, markArpeggios } from './music.js';

// 120 bpm for 4 quarters, then 60 bpm
const map = tempoMap([{ tick: 3840, tempo: 60 }], 120);
assert.equal(tickToMs(map, 960), 500);
assert.equal(tickToMs(map, 3840), 2000);
assert.equal(tickToMs(map, 4800), 3000);
for (const tick of [0, 960, 3840, 4800]) assert.equal(msToTick(map, tickToMs(map, tick)), tick);
// A tempo change on every beat: every tick lands in the right one, there and back
const busy = tempoMap(Array.from({ length: 2000 }, (_, i) => ({ tick: (i + 1) * 960, tempo: 60 + (i % 7) * 10 })), 90);
const byScan = (tick) => { const seg = busy.findLast((t) => t.tick <= tick); return seg.ms + ((tick - seg.tick) * 60000) / (seg.tempo * 960); };
for (const tick of [0, 1, 959, 960, 961, 123456, 1919999, 1920000, 2500000]) {
  assert.ok(Math.abs(tickToMs(busy, tick) - byScan(tick)) < 1e-6, `tick ${tick}`);
  assert.ok(Math.abs(msToTick(busy, tickToMs(busy, tick)) - tick) < 1e-6, `back from tick ${tick}`);
}

assert.deepEqual([[40, 45, 50, 55, 59, 64], [38, 45, 50, 55, 59, 64], [39, 44, 49, 54, 58, 63], [26, 33, 38, 43], [38, 45, 50, 55, 57, 62]].map(tuningName),
  ['E Standard', 'Drop D', 'E♭ Standard', 'Drop D', 'D A D G A D']);

// A tuning against the one it's named after: standard ones against E Standard, drop ones against Drop D (Drop D itself
// against E Standard), anything else string by string against E Standard
const against = (open) => { const r = tuningReference(open); return [r.reference, r.shift.join(' ')]; };
assert.deepEqual(against([36, 41, 46, 51, 55, 60]), ['E Standard', '-4 -4 -4 -4 -4 -4']); // C Standard
assert.deepEqual(against([34, 41, 46, 51, 55, 60]), ['Drop D', '-4 -4 -4 -4 -4 -4']); // Drop B♭
assert.deepEqual(against([38, 45, 50, 55, 59, 64]), ['E Standard', '-2 0 0 0 0 0']); // Drop D
assert.deepEqual(against([38, 45, 50, 55, 57, 62]), ['E Standard', '-2 0 0 0 -2 -2']); // D A D G A D
assert.deepEqual(against([40, 45, 50, 55, 59, 64]), ['E Standard', '0 0 0 0 0 0']);
assert.deepEqual(against([26, 31, 36, 41]), ['E Standard', '-2 -2 -2 -2']); // bass in D Standard
assert.deepEqual(against([21, 28, 33, 38, 43]), ['B Standard', '-2 0 0 0 0']); // 5-string bass, drop A
assert.equal(tuningReference([40, 45, 50]), null); // no standard to go by

// Repeats: the same chord again soon after is a beat; a change, a new technique or a long rest shows it in full, and single
// notes always show in full
const n = (time, string, fret, extra = {}) => ({ time, string, fret, chord: null, mute: false, palmMute: false, harmonic: false, slideTo: null, bend: 0, hammerOn: false, pullOff: false, tap: false, ...extra });
const notes = [n(0, 0, 1), n(0.2, 0, 1), n(0.4, 0, 1, { palmMute: true }), n(0.6, 0, 3), n(0.8, 1, 3, { chord: 0 }), n(0.8, 2, 4, { chord: 0 }), n(1, 1, 3, { chord: 1 }), n(1, 2, 4, { chord: 1 }), n(3, 1, 3, { chord: 2 }), n(3, 2, 4, { chord: 2 })];
const chords = [{}, {}, {}];
markRepeats(notes, chords);
assert.deepEqual(notes.map((x) => x.repeat), [false, false, false, false, false, false, true, true, false, false]);
assert.deepEqual(chords.map((c) => !!c.highDensity), [false, true, false]);
const ornamented = [n(0, 2, 5, { chord: 0 }), n(0, 3, 7, { chord: 0 }), n(0.5, 2, 5, { chord: 1, ornament: 'turn' }), n(0.5, 3, 7, { chord: 1 }), n(1, 2, 5, { chord: 2, ornament: 'turn', pick: 'up' }), n(1, 3, 7, { chord: 2 })];
markRepeats(ornamented, [{}, {}, {}]);
assert.deepEqual(ornamented.map((x) => x.repeat), [false, false, false, false, true, true]); // new notation shows in full; a pick direction alone doesn't

// Holds: a spot the very next strike plays again stays held down in between, until the fingering switches
const held = [
  n(0, 0, 0), n(0.3, 0, 0), n(0.6, 0, 0), n(0.9, 1, 2), n(1.2, 0, 0), n(3, 0, 0), // chugs, a switch, back after it, a long rest
  n(4, 1, 5, { chord: 0 }), n(4, 2, 7, { chord: 0 }), n(4.5, 1, 5, { chord: 1 }), n(4.5, 2, 7, { chord: 1 }), n(5, 1, 5, { chord: 2 }), n(5, 2, 9, { chord: 2 }), // a chord again, then a change keeping a finger
  n(6, 3, 4, { slideTo: 6 }), n(6.3, 3, 4), // slid away from in between
];
markRepeats(held, [{}, {}, {}]);
assert.deepEqual(held.map((x) => x.heldFrom), [null, 0, 0.3, null, null, null, null, null, 4, 4, 4.5, null, null, null]);

// Annotations: slur back to the hammered-from note, a tie, let ring to the next note on the string, dynamics on change, barres
const an = [
  { time: 0, string: 1, fret: 5, sustain: 0, letRing: true, dynamic: 'f' },
  { time: 0.5, string: 1, fret: 7, sustain: 0, hammerOn: true, dynamic: 'f' },
  { time: 1, string: 2, fret: 3, sustain: 0, linkNext: true, dynamic: 'p' },
  { time: 3, string: 2, fret: 3, sustain: 0, dynamic: 'p' },
];
const shapes = [{ frets: [3, 5, 5, 4, 3, 3], fingers: [1, 3, 4, 2, 1, 1] }, { frets: [-1, 5, 7, 7], fingers: [-1, 1, 3, 3] }];
annotate(an, shapes);
assert.deepEqual([an[0].sustain, an[2].tieTo], [0.5, 3]);
assert.deepEqual(an.map((x) => x.dynamicLabel), [null, null, 'p', null]);
assert.deepEqual(shapes.map((c) => c.barre), [{ fret: 3, from: 0, to: 5 }, null]);

// Arpeggios: a C shape held for 2 s while its strings are played one at a time; each rings until the shape is let go or its
// string comes again. A note off the shape, and a shape held too briefly, stay as they are
const arp = [
  { time: 1, string: 1, fret: 3, sustain: 0, chord: null },
  { time: 1.5, string: 2, fret: 2, sustain: 0, chord: null },
  { time: 2, string: 1, fret: 3, sustain: 0, chord: null },
  { time: 2.5, string: 3, fret: 5, sustain: 0, chord: null }, // not in the shape
  { time: 5, string: 1, fret: 3, sustain: 0, chord: null },
  { time: 5.2, string: 2, fret: 2, sustain: 0, chord: null },
];
const shapesHeld = [
  { startTime: 1, endTime: 3, frets: [-1, 3, 2, 0, 1, 0] },
  { startTime: 5, endTime: 5.4, frets: [-1, 3, 2, 0, 1, 0] },
];
markArpeggios(arp, shapesHeld);
assert.deepEqual(shapesHeld.map((h) => !!h.arpeggio), [true, false]);
assert.deepEqual(arp.map((n) => Math.round(n.sustain * 10) / 10), [1, 1.5, 1, 0, 0, 0]);
assert.deepEqual(arp.map((n) => !!n.letRing), [true, true, true, false, false, false]);

// Lyrics in two rows: the line being sung on top, the next one under it
const sungLine = (start, texts) => ({
  time: start,
  end: start + texts.length * 0.5,
  syllables: texts.map((text, i) => ({ time: start + i * 0.5, text })),
});
const verse = [
  sungLine(10, ['Plug ', 'it ', 'in ', 'and ']), // its last word at 11.5, ends at 12
  sungLine(12.2, ['watch ', 'the ', 'high', 'way ', 'come ']), // straight on, ends at 14.7
  sungLine(30, ['Rea', 'dy, ', 'set, ', 'go! ']), // after a pause
];
const rows = (t) => Object.values(lyricsShown(verse, t)).join();
assert.equal(rows(0), '-1,-1'); // top, bottom
assert.equal(rows(3), '0,-1'); // coming up in 7 s, the one after it not yet
assert.equal(rows(5), '0,1');
assert.equal(rows(12.1), '0,1'); // its last word still lit on top, though the next line starts in a moment
assert.equal(rows(12.3), '1,-1'); // moved up; the line after is far off
assert.equal(rows(15), '1,-1'); // done, and staying a moment with nothing coming up
assert.equal(rows(16.5), '-1,-1');
assert.equal(rows(23), '2,-1');
assert.equal(rows(33), '2,-1');
assert.equal(rows(34), '-1,-1');

console.log('ok');
