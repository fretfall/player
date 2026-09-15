import assert from 'node:assert/strict';
import { moveCamera, bendAt, drawHighway } from './highway.js';
import { parseArrangement } from './the reference game.js';
import { LOOKS, DEFAULT_STYLE, theme } from './themes.js';

const run = (anchors, until, snapshotsAt) => {
  const cam = {}, seen = {}, targets = new Set();
  for (let ms = 0; ms <= until * 1000; ms += 16) {
    moveCamera(cam, anchors, ms / 1000, ms);
    targets.add(cam.target);
    for (const t of snapshotsAt) if (ms >= t * 1000 && !seen[t]) seen[t] = { left: cam.center - cam.span / 2, right: cam.center + cam.span / 2, span: cam.span };
  }
  return { seen, moves: targets.size };
};
const shows = (v, lo, hi) => v.left <= lo && v.right >= hi;

// A big move: frets 1-4, then frets 10-13 from 10 s
const jump = run([{ time: 0, endTime: 10, fret: 1, width: 4 }, { time: 10, endTime: 20, fret: 10, width: 4 }], 16, [5, 9.5, 14]);
assert.ok(shows(jump.seen[5], 0, 4) && jump.seen[5].span < 13, 'settled close on the first position');
assert.ok(shows(jump.seen[9.5], 0, 13), 'zoomed out to show both positions before the move');
assert.ok(shows(jump.seen[14], 9, 13) && jump.seen[14].span < 13, 'zoomed back in on the new position');

// A hand rocking one fret back and forth every second should not move the camera each time
const rocking = Array.from({ length: 20 }, (_, i) => ({ time: i, endTime: i + 1, fret: 5 + (i % 2), width: 4 }));
assert.ok(run(rocking, 20, []).moves <= 2, 'small shifts keep the camera still');

// Moves back and forth every 4.5 s: stay zoomed out in between instead of pumping in and out
const back = Array.from({ length: 6 }, (_, i) => ({ time: i * 4.5, endTime: (i + 1) * 4.5, fret: i % 2 ? 12 : 1, width: 4 }));
assert.ok(Object.values(run(back, 22, [6.75, 11.25, 15.75]).seen).every((v) => shows(v, 0, 15)), 'no zooming in between moves that follow each other');

// The glide starts gently: just after a big move comes into frame, the view has barely shifted
const shift = [{ time: 0, endTime: 10, fret: 1, width: 4 }, { time: 10, endTime: 20, fret: 10, width: 4 }], glide = {};
moveCamera(glide, shift, 6.9, 0);
const start = glide.center;
for (let ms = 16; ms <= 64; ms += 16) moveCamera(glide, shift, 6.9 + ms / 1000 + 0.1, ms);
assert.ok(Math.abs(glide.center - start) < 0.2, 'no lurch when the camera starts to move');

// Bends on the highway: up within 0.3 s and held, back down where a release starts; the chart's late points are reached on time
const near = (a, b) => Math.abs(a - b) < 0.01;
const even = { sustain: 0.6, bendCurve: [[0, 0], [1, 1]] }; // Guitar Pro's "b (0 4)": spread over the note, drawn up quickly
assert.ok(near(bendAt(even, 0), 0) && near(bendAt(even, 0.15), 0.5) && near(bendAt(even, 0.3), 1) && near(bendAt(even, 0.6), 1));
const release = { sustain: 0.9, bendCurve: [[0, 0], [1 / 3, 1], [2 / 3, 1], [1, 0]] };
assert.ok(near(bendAt(release, 0.3), 1) && near(bendAt(release, 0.55), 1) && bendAt(release, 0.65) < 1 && near(bendAt(release, 0.9), 0));
const late = { sustain: 1, bendCurve: [[0.5, 1]] }; // only when the peak is reached
assert.ok(near(bendAt(late, 0.2), 0) && near(bendAt(late, 0.35), 0.5) && near(bendAt(late, 0.5), 1));
assert.ok(near(bendAt({ sustain: 1, bendCurve: [[0, 1], [1, 1]] }, 0), 1) && near(bendAt({ sustain: 1, bend: 0.5 }, 0.3), 0.5)); // pre-bend; no curve

// A whole frame draws at every side angle in every look: a shape the swing turns inside out must not stop the frame. The
// canvas turns down negative radii as browsers do (a pill gem once did, and the notes after it vanished)
const noRadius = (name, ...radii) => { if (radii.some((r) => r < 0)) throw new RangeError(`${name}: negative radius`); };
const context = new Proxy({
  arc: (x, y, r) => noRadius('arc', r), ellipse: (x, y, rx, ry) => noRadius('ellipse', rx, ry), roundRect: (x, y, w, h, r) => noRadius('roundRect', r),
  measureText: () => ({ width: 10, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 0 }),
  createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
}, { get: (target, key) => (key in target ? target[key] : () => {}) });
globalThis.devicePixelRatio = 2;
const canvas = { clientWidth: 1728, clientHeight: 944, width: 0, height: 0, getContext: () => context };
const { arrangement } = parseArrangement(`<song><arrangement>Lead</arrangement><songLength>20</songLength>
  <tuning string0="0" string1="0" string2="0" string3="0" string4="0" string5="0" /><ebeats><ebeat time="0" measure="1" /></ebeats>
  <levels><level difficulty="0"><notes>${Array.from({ length: 24 }, (_, i) => `<note time="${1 + i * 0.25}" string="${i % 6}" fret="${i % 3 ? 1 + ((i * 5) % 22) : 0}" />`).join('')}</notes>
  <anchors><anchor time="0" fret="1" width="4" /><anchor time="4" fret="12" width="4" /></anchors></level></levels></song>`);
for (const look of Object.keys(LOOKS))
  for (let sideAngle = -20; sideAngle <= 20; sideAngle += 5)
    for (const now of [0, 2, 4])
      assert.doesNotThrow(() => drawHighway(canvas, arrangement, now, { ...theme({ ...DEFAULT_STYLE, look }), headstock: 'headless', sideAngle }, {}), `${look} at ${sideAngle}°, ${now} s`);

// A vibrato trail running into a chord ends at the bottom of the chord's note lying across it on the string below, not over it
const trailTop = (string) => { // the top of the wavy spine on screen, the chord's fret 7 note on this string
  let points = [], closed = false, top = Infinity;
  const recorder = new Proxy({
    beginPath: () => { points = []; closed = false; }, moveTo: (x, y) => points.push(y), lineTo: (x, y) => points.push(y), closePath: () => { closed = true; },
    stroke: () => { if (!closed && points.length > 12) top = Math.min(top, ...points); },
  }, { get: (target, key) => (key in target ? target[key] : context[key]) });
  const { arrangement: vibrato } = parseArrangement(`<song><arrangement>Lead</arrangement><songLength>10</songLength>
    <tuning string0="0" string1="0" string2="0" string3="0" string4="0" string5="0" /><ebeats><ebeat time="0" measure="1" /></ebeats>
    <levels><level difficulty="0"><notes><note time="1" string="1" fret="7" sustain="0.5" vibrato="80" /></notes>
    <chords><chord time="1.5" chordId="0"><chordNote time="1.5" string="1" fret="5" /><chordNote time="1.5" string="${string}" fret="7" /></chord></chords>
    <anchors><anchor time="0" fret="5" width="4" /></anchors></level></levels></song>`);
  drawHighway({ ...canvas, getContext: () => recorder }, vibrato, 0.9, { ...theme(DEFAULT_STYLE), headstock: 'headless' }, {});
  return top;
};
assert.ok(trailTop(2) > trailTop(0) + 10, 'the trail stops short of the note below it');

console.log('ok');
