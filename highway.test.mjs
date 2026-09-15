import assert from 'node:assert/strict';
import { moveCamera, bendAt, drawHighway, drawTab, HEADSTOCKS, headstockParts } from './highway.js';
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
globalThis.OffscreenCanvas = class { getContext() { return context; } }; // the floor's strip of colour bands
globalThis.Path2D = class { moveTo() {} lineTo() {} }; // the tab's beat lines, gathered into one path
const canvas = { clientWidth: 1728, clientHeight: 944, width: 0, height: 0, getContext: () => context };
const { arrangement } = parseArrangement(`<song><arrangement>Lead</arrangement><songLength>20</songLength>
  <tuning string0="0" string1="0" string2="0" string3="0" string4="0" string5="0" /><ebeats><ebeat time="0" measure="1" /></ebeats>
  <levels><level difficulty="0"><notes>${Array.from({ length: 24 }, (_, i) => `<note time="${1 + i * 0.25}" string="${i % 6}" fret="${i % 3 ? 1 + ((i * 5) % 22) : 0}" />`).join('')}</notes>
  <anchors><anchor time="0" fret="1" width="4" /><anchor time="4" fret="12" width="4" /></anchors></level></levels></song>`);
for (const look of Object.keys(LOOKS))
  for (let sideAngle = -20; sideAngle <= 20; sideAngle += 5)
    for (const now of [0, 2, 4])
      assert.doesNotThrow(() => drawHighway(canvas, arrangement, now, { ...theme({ ...DEFAULT_STYLE, look }), headstock: 'headless', sideAngle }, {}), `${look} at ${sideAngle}°, ${now} s`);

// Headstocks: keys on the side of their row of posts (a 6 in line's far posts cross the middle, their keys stay on the bass
// side), 4 + 2 and 3 + 3 splits for any number of strings, and every one draws, in either string order
const sidesOf = (id, n) => headstockParts(HEADSTOCKS[id], Array.from({ length: n }, (_, s) => 0.8 * (1 - (2 * s) / (n - 1)))).keys.map((k) => k.side).join();
assert.equal(sidesOf('inline', 6), '1,1,1,1,1,1');
assert.equal(sidesOf('fourTwo', 6), '1,1,1,1,-1,-1');
assert.equal(sidesOf('fourTwo', 4), '1,1,1,-1');
assert.equal(sidesOf('openBook', 7), '1,1,1,1,-1,-1,-1');
assert.equal(sidesOf('pointed', 6), '1,1,1,-1,-1,-1');
// The headless plate's rounded outline never turns back on itself (a loop there stroked a spike beside the nut)
const plate = headstockParts(HEADSTOCKS.headless, [0.8, -0.8]).outline;
assert.ok(plate.slice(2).every(([u, v], i) => {
  const [[u0, v0], [u1, v1]] = [plate[i], plate[i + 1]];
  return (u1 - u0) * (u - u1) + (v1 - v0) * (v - v1) >= 0;
}), 'headless outline loops');
for (const headstock of Object.keys(HEADSTOCKS))
  for (const stringOrder of ['low', 'high'])
    assert.doesNotThrow(() => drawHighway(canvas, arrangement, 2, { ...theme(DEFAULT_STYLE), headstock, stringOrder }, {}), `${headstock}, ${stringOrder}`);

// A vibrato trail running into a chord ends at the bottom of the chord's note lying across it on the string below, not over it
const trailTop = (string) => { // the top of the wavy spine on screen, the chord's fret 7 note on this string
  let points = [], moves = 0, closed = false, top = Infinity; // a trail's spine: one open line of many points (lanes and beat lines are many short ones in a path)
  const recorder = new Proxy({
    beginPath: () => { points = []; moves = 0; closed = false; }, moveTo: (x, y) => { points.push(y); moves++; }, lineTo: (x, y) => points.push(y), closePath: () => { closed = true; },
    stroke: () => { if (!closed && moves === 1 && points.length > 12) top = Math.min(top, ...points); },
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

// A slide off fret 12 into a chord on the same string (The Hell Song at 0:51): once its trail comes into view it stays, all the
// way in. Cut against the chord's note however far across the neck it was, it vanished while both were in the distance
const { arrangement: sliding } = parseArrangement(`<song><arrangement>Rhythm</arrangement><songLength>10</songLength>
  <tuning string0="0" string1="0" string2="0" string3="0" string4="0" string5="0" /><ebeats><ebeat time="0" measure="1" /></ebeats>
  <levels><level difficulty="0"><notes><note time="5" string="0" fret="12" sustain="0.22" slideUnpitchTo="4" /></notes>
  <chords><chord time="5.26" chordId="0"><chordNote time="5.26" string="0" fret="4" /><chordNote time="5.26" string="1" fret="6" /></chord></chords>
  <anchors><anchor time="0" fret="2" width="4" /><anchor time="5.26" fret="4" width="4" /></anchors></level></levels></song>`);
let spines = 0, points = 0, moves = 0, closed = false;
const spineCounter = new Proxy({
  beginPath: () => { points = 0; moves = 0; closed = false; }, moveTo: () => { points++; moves++; }, lineTo: () => points++, closePath: () => { closed = true; },
  stroke: () => { if (!closed && moves === 1 && points > 12) spines++; },
}, { get: (target, key) => (key in target ? target[key] : context[key]) });
const trailFrames = [], slideCam = {};
for (let now = 1.5; now < 4.9; now += 1 / 30) {
  spines = 0;
  drawHighway({ ...canvas, getContext: () => spineCounter }, sliding, now, { ...theme(DEFAULT_STYLE), headstock: 'headless' }, slideCam);
  trailFrames.push(spines > 0);
}
const firstShown = trailFrames.indexOf(true);
assert.ok(firstShown >= 0 && trailFrames.slice(firstShown).every(Boolean), `the slide's trail stays once it shows: ${trailFrames.map(Number).join('')}`);

// The 2D tab view draws the fret numbers of the notes coming up, and none from long ago
const texts = [];
const writer = new Proxy({ fillText: (str) => texts.push(str) }, { get: (target, key) => (key in target ? target[key] : context[key]) });
for (const stringOrder of ['low', 'high'])
  assert.doesNotThrow(() => drawTab({ ...canvas, getContext: () => writer }, { ...arrangement, open: [40, 45, 50, 55, 59, 64] }, 2, { ...theme(DEFAULT_STYLE), stringOrder }));
const frets = arrangement.notes.filter((note) => note.time >= 2 && note.time < 4).map((note) => String(note.fret));
assert.ok(frets.every((f) => texts.includes(f)), 'the notes in view are numbered');
assert.ok(texts.includes('E') && texts.includes('B'), 'the strings are named');
texts.length = 0;
drawTab({ ...canvas, getContext: () => writer }, arrangement, 20, theme(DEFAULT_STYLE));
assert.equal(texts.length, 0, 'nothing left once the song has gone by');

// A held note sliding into a chord, and sixteenths closer than a note is wide: on a string, each bar ends before the next
// note begins, with room for the chord's bracket and the slide's slash in between
const bars = new Map(); // row → [x, end]
const boxes = new Proxy({ roundRect: (x, y, w, h) => h < 60 && (bars.get(y) ?? bars.set(y, []).get(y)).push([x, x + w]) }, { get: (target, key) => (key in target ? target[key] : context[key]) });
const { arrangement: tight } = parseArrangement(`<song><arrangement>Lead</arrangement><songLength>10</songLength>
  <tuning string0="0" string1="0" string2="0" string3="0" string4="0" string5="0" /><ebeats><ebeat time="0" measure="1" /></ebeats>
  <levels><level difficulty="0"><notes><note time="1" string="0" fret="3" sustain="0.3" slideTo="5" />
  ${[1.8, 1.9, 2, 2.1].map((time, i) => `<note time="${time}" string="0" fret="${12 + i}" />`).join('')}</notes>
  <chords><chord time="1.3" chordId="0"><chordNote time="1.3" string="0" fret="5" /><chordNote time="1.3" string="1" fret="7" /></chord></chords>
  <anchors><anchor time="0" fret="3" width="4" /></anchors></level></levels></song>`);
drawTab({ ...canvas, getContext: () => boxes }, { ...tight, open: [40, 45, 50, 55, 59, 64] }, 0.5, theme(DEFAULT_STYLE));
const lane = [...bars.values()].find((b) => b.length === 6).sort((a, b) => a[0] - b[0]);
assert.ok(lane.slice(1).every(([x], i) => x >= lane[i][1] + 4), `bars on a string overlap: ${JSON.stringify(lane)}`);
assert.ok(lane[1][0] - lane[0][1] >= 24, 'room for the slide slash and the chord bracket');

// In pages, the notes hold still while the play line moves across the page; scrolling, they move
const placed = [];
const placer = new Proxy({ fillText: (str, x) => placed.push(x) }, { get: (target, key) => (key in target ? target[key] : context[key]) });
const numbersAt = (now, tabLayout) => {
  placed.length = 0;
  drawTab({ ...canvas, getContext: () => placer }, arrangement, now, { ...theme(DEFAULT_STYLE), tabLayout });
  return placed.join();
};
assert.equal(numbersAt(2, 'pages'), numbersAt(2.2, 'pages'), 'a page holds still');
assert.notEqual(numbersAt(2, 'scroll'), numbersAt(2.2, 'scroll'), 'scrolling moves');

// Every notation the highway shows draws in the tab view too, in both layouts
const marks = [
  { hammerOn: true }, { pullOff: true }, { bendCurve: [[0, 0], [0.5, 1], [1, 0]], sustain: 1 }, { bendCurve: [[0, 1], [1, 1]], sustain: 0.5 },
  { slideTo: 9, sustain: 0.5 }, { slideUnpitchTo: 2, slideTo: null, sustain: 0.4 }, { slideIn: 'below', slideOut: 'down' }, { tieTo: 0 },
  { letRing: true, sustain: 1.5 }, { grace: true }, { showString: true }, { pick: 'down' }, { pick: 'up' }, { fermata: true }, { tremolo: true },
  { staccato: true, accent: 'heavy' }, { accent: 'tenuto' }, { dynamicLabel: 'pp' }, { harmonic: true, harmonicType: 'artificial' },
  { harmonicPinch: true }, { rightFinger: 'i', tapLeft: true }, { tap: true }, { vibrato: true, vibratoWide: true }, { mute: true },
  { ghost: true, palmMute: true }, { slap: true }, { golpe: 'thumb', rasgueado: 'i i' }, { trill: 7, ornament: 'turn' },
  { fade: 'swell', whammy: [[0, 0], [1, -1]], wah: 'open' }, { finger: 0 }, { repeat: true },
];
const notated = {
  ...arrangement, open: [40, 45, 50, 55, 59, 64],
  notes: arrangement.notes.map((note, i) => ({ ...note, ...marks[i % marks.length], chord: i < 2 ? 0 : null })),
  chords: [{ time: 1, name: 'E5', notes: [0, 1], fingers: [1, 3, -1, -1, -1, -1], accent: 'heavy', strum: 'down', barre: { fret: 1, from: 0, to: 1, half: true } }],
  handShapes: [{ startTime: 3, endTime: 5, name: 'Am', frets: [0, 2, 2, 1, 0, -1], fingers: [], arpeggio: true }],
  markers: [{ time: 1, text: '♩ = 120' }], hairpins: [{ time: 2, endTime: 3, kind: 'cresc' }, { time: 4, endTime: 5, kind: 'dim' }],
  beats: [0, 1, 2, 3, 4, 5, 6].map((time) => ({ time, measure: time % 2 ? -1 : time / 2 + 1 })),
};
for (const tabLayout of ['scroll', 'pages'])
  for (const now of [0, 1.5, 3, 6])
    assert.doesNotThrow(() => drawTab(canvas, notated, now, { ...theme(DEFAULT_STYLE), tabLayout, markings: 'white' }), `${tabLayout} at ${now} s`);

console.log('ok');
