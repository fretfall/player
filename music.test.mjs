import assert from 'node:assert/strict';
import { tempoMap, tickToMs, msToTick, tuningName, markRepeats, annotate } from './music.js';

// 120 bpm for 4 quarters, then 60 bpm
const map = tempoMap([{ tick: 3840, tempo: 60 }], 120);
assert.equal(tickToMs(map, 960), 500);
assert.equal(tickToMs(map, 3840), 2000);
assert.equal(tickToMs(map, 4800), 3000);
for (const tick of [0, 960, 3840, 4800]) assert.equal(msToTick(map, tickToMs(map, tick)), tick);

assert.deepEqual([[40, 45, 50, 55, 59, 64], [38, 45, 50, 55, 59, 64], [39, 44, 49, 54, 58, 63], [26, 33, 38, 43], [38, 45, 50, 55, 57, 62]].map(tuningName),
  ['E Standard', 'Drop D', 'E♭ Standard', 'Drop D', 'D A D G A D']);

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
assert.deepEqual(an.map((x) => x.slurFrom), [null, 0, null, null]);
assert.deepEqual([an[0].sustain, an[2].tieTo], [0.5, 3]);
assert.deepEqual(an.map((x) => x.dynamicLabel), [null, null, 'p', null]);
assert.deepEqual(shapes.map((c) => c.barre), [{ fret: 3, from: 0, to: 5 }, null]);

console.log('ok');
