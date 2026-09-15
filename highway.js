// Canvas note highway in 3D. A perspective camera looks down the highway from just behind the strike line,
// so the strings there read as a fretboard and notes rise out of the distance. World units are fret widths;
// time runs along z. Drawn in a virtual space 900px tall, scaled to the canvas height.

import { lap } from './perf.js';

const VH = 900, HIGHWAY = 84, NOTE_SPEED = 28; // fret widths of highway ahead of the strike line; fret widths a note travels per second

// Seconds of notes in view for the drawing distance and note speed settings: faster notes are further apart and in
// view for less time, a longer drawing distance shows more of them
export const lookAhead = (view) => (HIGHWAY * (view.drawDistance ?? 1)) / (NOTE_SPEED * (view.noteSpeed ?? 1));
const GAP = 0.34, LAST_FRET = 24, PRESS_AHEAD = 1.2; // string spacing; how early a note's spot on the board lights up
const FRET_WIDTH = 1.25, BOARD_HEIGHT = 1.25; // the neck at 100% on the fret width and fretboard height sliders
// Fret widths from the board where arriving notes and frames light up: a distance, not a time, so everything lights
// at the same place on the highway whatever the note speed
const NEAR = 5;
const BEND_LIFT = 1, BEND_RISE = 1.6; // string gaps a bent string rises on the fretboard, and its trail on the highway, per step bent
const BEND_EASE = 2; // fret widths before the board over which the trail's rise settles to the string's
const RAIL = 0.19; // half the width of a bent note's trail
const GEM_DEPTH = 0.12; // how deep 3D notes are: 4 to 5 px at the board
const FRAME_AHEAD = 3, MIN_SPAN = 11; // seconds of hand positions framed ahead; frets in view at the closest zoom, less the fret of slack
const WHOLE_SONG = [{ time: -Infinity, endTime: Infinity, fret: 1, width: 4 }];
const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]; // where a fretboard has position dots

// Headstocks in front of the nut, after the classic types rather than any maker's outline (drawn up in design/headstocks).
// Measured in half neck widths from the middle of the nut: u runs away from the nut, v across toward the bass strings
// (±1: the neck's edges). An outline or cover is a smooth closed curve through its points (a point given twice is a
// corner). Posts run from `from` to `to`, lowest string nearest the nut: all on the bass side, or split, the treble strings
// mirrored on the other side; on a classical head they are the rollers in its slots. Each post has a key on the edge
// beside it: machine heads, blade keys, tulips or pearl buttons. A headless neck ends its strings in clamps instead
const mirror = (half) => [...half, half.at(-1), ...half.slice(0, -1).reverse().map(([u, v]) => [u, -v])]; // a corner at the tip
export const HEADSTOCKS = {
  inline: {
    label: 'Six in line',
    outline: [[0, 1], [0.35, 1], [0.9, 1.2], [1.6, 1.4], [2.6, 1.5], [3.6, 1.56], [4.4, 1.6], [4.95, 1.47], [5.2, 1.1], [5.2, 0.56], [5, 0.22], [4.6, 0.03], [4.1, 0.02], [3.3, -0.1], [2.4, -0.3], [1.5, -0.6], [0.8, -0.94], [0.35, -1], [0, -1]],
    posts: { from: [1.25, 0.78], to: [4.45, 1.08] },
    keys: 'machine',
    trussNut: [0.22, 0], // where the truss rod adjusts
    tree: 2.6, // a string tree over the top two strings, this far out
  },
  split: {
    label: 'Three a side',
    outline: mirror([[0, 1], [0.3, 1], [0.9, 1.14], [1.8, 1.28], [2.8, 1.39], [3.7, 1.47], [4.3, 1.49], [4.56, 1.35], [4.72, 0.9], [4.62, 0.38], [4.34, 0]]),
    posts: { from: [1.55, 0.78], to: [3.75, 1], split: true },
    keys: 'tulip',
    cover: [[0.3, 0], [0.34, 0.14], [0.66, 0.21], [1, 0.32], [1.24, 0.22], [1.28, 0], [1.24, -0.22], [1, -0.32], [0.66, -0.21], [0.34, -0.14], [0.3, 0]], // a bell truss rod cover
    screws: [[0.48, 0], [1.06, 0]],
  },
  pointed: {
    label: 'Pointed',
    outline: [[0, 1], [0.35, 1], [1, 1.15], [2, 1.28], [3, 1.4], [4, 1.5], [4.55, 1.55], [4.86, 1.36], [5.75, -0.55], [5.75, -0.55], [4.6, -0.12], [3.6, 0.02], [2.6, -0.08], [1.6, -0.4], [0.8, -0.86], [0.35, -1], [0, -1]],
    posts: { from: [1.4, 0.72], to: [4.45, 1.03] },
    keys: 'blade',
    cover: [[0.52, 0.2], [0.52, 0.2], [0.98, 0.2], [1.26, 0], [1.26, 0], [0.98, -0.2], [0.52, -0.2], [0.52, -0.2], [0.52, 0.2]], // a shield
    screws: [[0.7, 0]],
    lockingNut: true, // clamping the strings in pairs, in place of the nut
  },
  classical: {
    label: 'Classical',
    outline: mirror([[0, 1.02], [0.3, 1.03], [1.5, 1.13], [3, 1.23], [3.72, 1.27], [3.92, 1.1], [3.88, 0.62], [4.18, 0.34], [4.36, 0]]),
    slots: [0.95, 3.35, 0.28, 0.8], // u from, to, v from, to, round-ended (and mirrored)
    posts: { from: [1.45, 0.54], to: [2.85, 0.54], split: true },
    keys: 'pearl',
  },
  headless: {
    label: 'Headless',
    outline: [[0.2, 0], [0.2, 0.9], [0.25, 1.03], [0.36, 1.06], [0.79, 1.06], [0.9, 1.03], [0.95, 0.9], [0.95, -0.9], [0.9, -1.03], [0.79, -1.06], [0.36, -1.06], [0.25, -1.03], [0.2, -0.9], [0.2, 0]],
    clamps: 0.62,
  },
};
// A headstock's parts for strings at the given heights (half neck widths, lowest string first): its outline, where each
// string ends (a post, roller or clamp), and the key beside each post, at the outline's edge on its side
export function headstockParts(head, strings) {
  const n = strings.length, outline = spline(head.outline, 10);
  let ends = strings.map((v) => [head.clamps, v]);
  if (head.posts) {
    const { from, to, split } = head.posts, side = split ? Math.ceil(n / 2) : n;
    const at = (i) => from.map((a, c) => a + ((to[c] - a) * i) / Math.max(1, side - 1));
    ends = strings.map((_, s) => (s < side ? at(s) : ((p) => [p[0], -p[1]])(at(n - 1 - s))));
  }
  const edge = (u, side) => { // the outline's outermost crossing at u on that side
    let best = null;
    for (let i = 1; i < outline.length; i++) {
      const [u0, v0] = outline[i - 1], [u1, v1] = outline[i];
      if ((u0 - u) * (u1 - u) > 0 || u0 === u1) continue;
      const v = v0 + ((v1 - v0) * (u - u0)) / (u1 - u0);
      if (Math.sign(v) === side && (best === null || Math.abs(v) > Math.abs(best))) best = v;
    }
    return best ?? side;
  };
  const keys = head.keys ? ends.map(([u, v]) => ({ u, side: Math.sign(v) || 1, edge: edge(u, Math.sign(v) || 1) })) : [];
  return { outline, ends, keys };
}
// The same shapes every frame, until the headstock or the strings' spacing changes: worked out once
const headstocks = new WeakMap(), shapes = new Map();
const headstockFor = (head, strings) => {
  const key = strings.join(), known = headstocks.get(head);
  if (known?.key === key) return known.parts;
  const parts = headstockParts(head, strings);
  headstocks.set(head, { key, parts });
  return parts;
};
const headstockShape = (key, points) => {
  if (!shapes.has(key)) {
    if (shapes.size > 500) shapes.clear(); // the fretboard height slider makes new ones as it moves
    shapes.set(key, points());
  }
  return shapes.get(key);
};
export const rounded = (u0, u1, v0, v1, round) => { // a rectangle with rounded corners, as points round its outline
  const [ua, ub, va, vb] = [Math.min(u0, u1), Math.max(u0, u1), Math.min(v0, v1), Math.max(v0, v1)], r = Math.min(round, (ub - ua) / 2, (vb - va) / 2);
  const corner = (cu, cv, from) => Array.from({ length: 5 }, (_, j) => [cu + Math.cos(from + (j * Math.PI) / 8) * r, cv + Math.sin(from + (j * Math.PI) / 8) * r]);
  return [...corner(ub - r, vb - r, 0), ...corner(ua + r, vb - r, Math.PI / 2), ...corner(ua + r, va + r, Math.PI), ...corner(ub - r, va + r, 1.5 * Math.PI)];
};
// Points along a smooth curve through the given ones (Catmull-Rom), `steps` of them to each; a point given twice is a
// corner the curve comes into and leaves straight
export const spline = (points, steps = 8) => [
  ...points.slice(0, -1).flatMap((p1, i) => {
    const p0 = points[Math.max(0, i - 1)], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    if (p1[0] === p2[0] && p1[1] === p2[1]) return [p1];
    return Array.from({ length: steps }, (_, j) => {
      const s = j / steps;
      return [0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * s + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * s * s + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * s ** 3));
    });
  }),
  points.at(-1),
];

const shade = (color, amount) => { // a hex colour mixed toward white (amount > 0) or black (amount < 0)
  if (!color.startsWith('#')) return color;
  const mix = (i) => {
    const v = parseInt(color.slice(i, i + 2), 16);
    return Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount)).toString(16).padStart(2, '0');
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
};
const alpha = (color, a) =>
  color.startsWith('#') ? `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, ${a})` : color;
// Short text is set at quarter-pixel sizes and measured once per font and string: it shrinks smoothly with distance, and a
// font at a size not seen before is slow to set up. font: what g.font was just set to (reading g.font back is slow)
const fontSize = (px) => Math.round(px * 4) / 4;
const MARK_PX = 32; // the size floor markings are set in, before they're scaled
const metrics = new Map();
const measure = (g, font, str) => { // → { width, middle: how far the ink's middle is above the baseline }
  const key = `${font}|${str}`;
  let m = metrics.get(key);
  if (!m) {
    if (metrics.size > 5000) metrics.clear(); // every song brings its own chord names: start over now and then
    const ink = g.measureText(str); // kept as numbers: a TextMetrics holds on to the browser's font data, and the frames stall collecting it
    metrics.set(key, (m = { width: ink.width, middle: (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2 }));
  }
  return m;
};
// The floor in bands of flat colour, for each theme: filling a gradient that big is by far the slowest thing to draw without a GPU
const FLOOR_BANDS = 128, floorBands = new WeakMap();
const fades = new Map(); // gradients along the highway, by colour and opacities (see fade in drawHighway)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => a.map((v) => v / Math.hypot(...a));

const anchorAt = (anchors, time) => {
  let found = anchors[0];
  for (const a of anchors) {
    if (a.time > time) break;
    found = a;
  }
  return found;
};

const smooth = (u) => u * u * (3 - 2 * u);

// Bends and the whammy bar. Charts store a curve of [share of the note, steps]; Guitar Pro often spreads a plain bend
// evenly over the whole note, but it is played up quickly and then held, as it is drawn here. So on the highway each
// change takes at most BEND_RAMP seconds, eased into an S, and then holds: from where it starts, or, when a curve only
// says when a later point is reached (the chart's bend values), up to that point.
const BEND_RAMP = 0.3;
const timedCurves = new WeakMap();
function timedCurve(note, key) { // → [seconds, steps, reached by then] points, or null
  let cache = timedCurves.get(note);
  if (!cache) timedCurves.set(note, (cache = {}));
  if (!(key in cache)) {
    const length = Math.max(note.sustain, 0.05), given = note[key] ?? (key === 'bendCurve' && note.bend ? [[0, 0], [0.25, note.bend]] : null);
    const points = given?.map(([share, steps]) => [share * length, steps, false]) ?? [];
    if (points.length && points[0][0] > 0.001) { // starts unbent, reaching the first point by its time
      points[0][2] = true;
      points.unshift([0, 0, false]);
    }
    cache[key] = points.length ? points : null;
  }
  return cache[key];
}
function curveAt(points, sec) {
  if (!points) return 0;
  let value = points[0][1];
  for (let i = 1; i < points.length && sec > points[i - 1][0]; i++) {
    const [[t0, v0], [t1, v1, reached]] = [points[i - 1], points[i]], ramp = Math.min(t1 - t0, BEND_RAMP) || 1e-6;
    value = v0 + (v1 - v0) * smooth(Math.min(1, Math.max(0, (sec - (reached ? t1 - ramp : t0)) / ramp)));
  }
  return value;
}
export const bendAt = (note, sec) => curveAt(timedCurve(note, 'bendCurve'), sec); // steps bent, sec seconds after the note starts
const pitchAt = (note, sec) => bendAt(note, sec) + curveAt(timedCurve(note, 'whammy'), sec); // bend and whammy bar together
const bendPeak = (note) => Math.max(note.bend || 0, ...(note.bendCurve ?? []).map(([, v]) => v));
// The chords named big beside the hand: runs of the same chord (named again, or restruck as a repeat) count as one
// span, from the first strike to when its last note stops, so the name stays put through a riff
function chordSpans(arr) {
  if (arr.chordSpans) return arr.chordSpans;
  const spans = [];
  for (const c of arr.chords) {
    const end = Math.max(c.time + 0.25, ...c.notes.map((j) => arr.notes[j].time + arr.notes[j].sustain));
    const last = spans.at(-1);
    if (last && c.time - last.end < 1 && (c.name ? c.name === last.name : c.highDensity)) last.end = Math.max(last.end, end);
    else if (c.name) spans.push({ name: c.name, time: c.time, end });
  }
  for (const h of arr.handShapes ?? []) if (h.arpeggio && h.name) spans.push({ name: h.name, time: h.startTime, end: h.endTime }); // an arpeggio is named while it's held
  return (arr.chordSpans = spans.sort((p, q) => p.time - q.time));
}
// Chord shapes worth rails on the highway: a chord and the repeats that follow it, from the first strike until the last
// one stops (or the next different chord starts), when that lasts long enough to see
function chordRails(arr) {
  if (arr.chordRails) return arr.chordRails;
  const rails = [], ends = (c) => Math.max(c.time + 0.15, ...c.notes.map((j) => arr.notes[j].time + arr.notes[j].sustain));
  for (let i = 0; i < arr.chords.length; i++) {
    const first = arr.chords[i];
    if (first.highDensity) continue;
    let end = ends(first), j = i + 1;
    for (; arr.chords[j]?.highDensity && arr.chords[j].time - end < 1; j++) end = Math.max(end, ends(arr.chords[j]));
    end = Math.min(end, arr.chords[j]?.time ?? Infinity);
    if (end - first.time > 0.2) rails.push({ time: first.time, end, frets: first.notes.map((n) => arr.notes[n].fret) });
  }
  for (const h of arr.handShapes ?? []) if (h.arpeggio) rails.push({ time: h.startTime, end: h.endTime, frets: h.frets, arpeggio: h }); // an arpeggio's shape, held while its notes are played
  return (arr.chordRails = rails);
}
const TEXT_MARKS = { artificial: 'AH', pinch: 'PH', tap: 'TH', semi: 'SH', feedback: 'FH' };

const bendLabel = (b) => (b < 0.5 ? '¼' : b === 0.5 ? '½' : b === 1 ? 'full' : b % 1 ? `${Math.floor(b)}½` : String(b));
const ease = (from, to, ms, tau) => (from === undefined ? to : from + (to - from) * (1 - Math.exp(-ms / tau)));

// Critically damped spring (Unity's SmoothDamp): cam[key] reaches target in about `time` seconds, speeding up and
// slowing down smoothly even when the target jumps, so the camera never lurches
function follow(cam, key, target, time, dt) {
  if (cam[key] === undefined) [cam[key], cam[key + 'Speed']] = [target, 0];
  const omega = 2 / time, x = omega * dt, decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const offset = cam[key] - target, pull = (cam[key + 'Speed'] + omega * offset) * dt;
  cam[key + 'Speed'] = (cam[key + 'Speed'] - omega * pull) * decay;
  cam[key] = target + (offset + pull) * decay;
}

// Frame every hand position coming up in the next FRAME_AHEAD seconds: a big move zooms out to show
// both positions, then eases back in once the old one is behind.
function framing(anchors, now) {
  let lo = Infinity, hi = -Infinity;
  for (const a of anchors) {
    if (a.endTime <= now || a.time >= now + FRAME_AHEAD) continue;
    lo = Math.min(lo, a.fret - 1);
    hi = Math.max(hi, a.fret - 1 + a.width);
  }
  if (lo === Infinity) {
    const a = anchorAt(anchors, now);
    [lo, hi] = [a.fret - 1, a.fret - 1 + a.width];
  }
  const span = Math.max(MIN_SPAN, hi - lo + 2) + 1; // the extra fret of slack keeps small shifts from moving the camera
  return { lo, hi, span, center: Math.min(25 - span / 2, Math.max(span / 2 - 1, (lo + hi) / 2)) };
}

// Glides cam { center, span, left, right } toward the framing; returns the hand position right now
export function moveCamera(cam, anchors, now, clock) {
  const want = framing(anchors, now), view = cam.target;
  const outside = !view || want.lo < view.center - view.span / 2 || want.hi > view.center + view.span / 2;
  const tooWide = view && view.span - Math.max(want.span, framing(anchors, now + FRAME_AHEAD).span) > 2; // don't zoom in just to zoom out again
  if (outside || tooWide) cam.target = want;
  const ms = Math.min(clock - (cam.at ?? clock), 100);
  cam.at = clock;
  follow(cam, 'span', cam.target.span, cam.target.span > cam.span ? 0.8 : 1.4, ms / 1000); // out a little sooner than in
  follow(cam, 'center', cam.target.center, 1, ms / 1000);
  const here = anchorAt(anchors, now);
  cam.left = ease(cam.left, here.fret - 1, ms, 90);
  cam.right = ease(cam.right, here.fret - 1 + here.width, ms, 90);
  return here;
}

// A chevron with its point at (x, y), pointing up (dir -1) or down (dir 1): a bar in its colour on a dark edge, lit along
// its middle, so it reads on any background
function chevron(g, x, y, w, h, dir, color, ink) {
  g.beginPath();
  g.moveTo(x - w, y - dir * h);
  g.lineTo(x, y);
  g.lineTo(x + w, y - dir * h);
  g.lineWidth = Math.max(3, h * 1.15);
  g.strokeStyle = ink;
  g.stroke();
  g.lineWidth = Math.max(1.5, h * 0.65);
  g.strokeStyle = color;
  g.stroke();
  g.lineWidth = Math.max(0.6, h * 0.2);
  g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  g.stroke();
}

function line2(g, x1, y1, x2, y2) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

// cam is kept by the caller between frames; reset it to {} to snap to a new song
export function drawHighway(canvas, arr, now, t, cam) {
  const dpr = devicePixelRatio || 1, cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const g = canvas.getContext('2d'), scale = ch / VH, W = cw / scale, B = dpr * scale;
  g.setTransform(B, 0, 0, B, 0, 0);
  g.clearRect(0, 0, W, VH);
  if (!arr) return;

  const anchors = arr.anchors.length ? arr.anchors : WHOLE_SONG;
  const here = moveCamera(cam, anchors, now, performance.now());
  const n = arr.strings, spacing = Math.min(0.5, (5 * GAP) / Math.max(1, n - 1)), gap = spacing * BOARD_HEIGHT * (t.boardHeight ?? 1), stack = gap * (n - 1); // the height setting spreads the strings, and their notes grow with them
  const ys = (s) => (t.stringOrder === 'high' ? s : n - 1 - s) * gap; // lowest string on top, like looking down at the guitar, or highest on top, like tab
  const SPEED = NOTE_SPEED * (t.noteSpeed ?? 1), LOOK = lookAhead(t);
  const boardLo = -0.22, boardHi = stack + 0.22, floor = boardLo - 0.06, far = LOOK * SPEED;
  const Z = (dt) => Math.max(0, dt) * SPEED; // played notes stay on the board while they fade: the camera is right behind it
  const color = (s) => t.str[s % t.str.length];
  const noteLine = t.noteLines === 0 ? null : `rgba(255, 255, 255, ${t.noteLines ?? 0.5})`; // the white line under each note and frame

  // Camera just behind and above the strike line, looking far down the highway, as in Tabizera: notes come up
  // out of the distance and the lanes run to a vanishing point under the header. The view angle swings it around
  // the strike line, lower for a flatter view, higher to look down on the highway (45°: behind and above equally). The
  // side angle swings it around sideways too: from the left the highway runs off to the left, and the low frets come closer.
  // The lens is shifted so the strings sit in the same place on screen however far the camera zooms out, aimed at the
  // middle of a board of standard height: a taller board grows upwards and the fret numbers under it stay put
  const span = cam.span, focus = [cam.center, (spacing * (n - 1)) / 2, 0], angle = ((t.viewAngle ?? 30) * Math.PI) / 180, reach = 0.6 * Math.SQRT2 * span;
  const straight = [focus[0], stack + reach * Math.sin(angle), -reach * Math.cos(angle)], ahead = unit(sub([focus[0], 0, 2.2 * span], straight)), up = cross(ahead, [1, 0, 0]);
  const side = ((t.sideAngle ?? 0) * Math.PI) / 180, [ss, cs] = [Math.sin(side), Math.cos(side)], rel = sub(straight, focus), behind = dot(rel, ahead), above = dot(rel, up);
  const fwd = [-ss, ahead[1] * cs, ahead[2] * cs], right = [cs, ahead[1] * ss, ahead[2] * ss]; // swung around the camera's up
  const eye = [focus[0] + above * up[0] + behind * fwd[0], focus[1] + above * up[1] + behind * fwd[1], above * up[2] + behind * fwd[2]];
  const budget = Math.min(W * 0.88, VH * (t.fill ? 1.3 : 1.05)), focal = (budget * dot(sub(focus, eye), fwd)) / span; // wide screens show more neck, not bigger frets
  // The fret width setting stretches the picture across the screen: wider frets, strings and depth as they are, however the
  // camera is swung. Capped so the framed hand positions fit
  const stretch = Math.min(FRET_WIDTH * (t.fretWidth ?? 1), (W * span) / (budget * Math.max(1, span - 2.5)));
  let shiftX = 0, shiftY = 0;
  const P = (x, y, z) => { // → [screen x, screen y, pixels per world unit there (across the neck, times stretch)]
    const d = [x - eye[0], y - eye[1], z - eye[2]], k = focal / Math.max(0.05, dot(d, fwd));
    return [W / 2 + dot(d, right) * stretch * k + shiftX, VH / 2 - dot(d, up) * k + shiftY, k];
  };
  const [fx, fy, k0] = P(...focus);
  [shiftX, shiftY] = [W / 2 - fx, VH * (t.fill ? 0.83 : 0.81) - fy]; // the board low on screen, the highway's far end under the header (t.fill: no header, so bigger and up to near the top)
  const [, yl] = P(cam.center - span / 2, floor, 0), [, yr] = P(cam.center + span / 2, floor, 0), [, yc] = P(cam.center, floor, 0);
  shiftY -= Math.min(VH * 0.08, Math.max(0, yl - yc, yr - yc)); // swung, the near end of the view comes down: lift it back toward where the middle was. The same lift at any zoom, so the board holds still
  lap('setup');

  const path = (points, close = true) => {
    g.beginPath();
    points.forEach(([x, y, z], i) => {
      const [px, py] = P(x, y, z);
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    });
    if (close) g.closePath();
  };
  const line3 = (a, b) => {
    path([a, b], false);
    stroke();
  };
  // A gem's face, and the outline of everything shaped like one (targets, repeats, where a slide lands): square, or for
  // rounded notes a capsule along its string, which slants when the camera is swung to a side
  const gem = (x, y, z, hw, hh) => {
    if (t.gem !== 'pill') return path([[x - hw, y - hh, z], [x + hw, y - hh, z], [x + hw, y + hh, z], [x - hw, y + hh, z]]);
    const [lx, ly] = P(x - hw, y, z), [rx, ry] = P(x + hw, y, z), [, top] = P(x, y + hh, z), [, bottom] = P(x, y - hh, z);
    const along = Math.atan2(ry - ly, rx - lx), r = Math.min(Math.abs(bottom - top), Math.hypot(rx - lx, ry - ly)) / 2, [dx, dy] = [r * Math.cos(along), r * Math.sin(along)];
    g.beginPath();
    g.arc(lx + dx, ly + dy, r, along + Math.PI / 2, along + Math.PI * 1.5);
    g.arc(rx - dx, ry - dy, r, along - Math.PI / 2, along + Math.PI / 2);
    g.closePath();
  };
  // A chord's frame covers the whole hand position (four frets at least, more if the chord stretches) and every
  // string, standing on the floor
  const frameAt = (frets, time) => {
    const a = anchorAt(anchors, time), fretted = frets.filter((f) => f > 0);
    return [Math.min(a.fret - 1, ...fretted.map((f) => f - 1)) + 0.05, Math.max(a.fret - 1 + Math.max(4, a.width), ...fretted) - 0.05];
  };
  const xMark = (x, y, z, w, h) => {
    line3([x - w, y - h, z], [x + w, y + h, z]);
    line3([x - w, y + h, z], [x + w, y - h, z]);
  };
  // Mutes: a palm mute is a big dark X across the note, a fret-hand mute a small white X in its middle. hw
  // and hh: the gem's half size; color: the X's own colour instead (greyed out on a repeat)
  const muteMark = (x, y, z, k, hw, hh, palm, color = null) => {
    const [w, h] = palm ? [hw * 0.85, hh * 0.8] : [Math.min(hw, 0.34) * 0.4, hh * 0.55];
    if (!color) { // a dark edge under a white X
      g.strokeStyle = palm ? alpha(t.ink, 0.85) : alpha(t.ink, 0.7);
      g.lineWidth = Math.max(palm ? 2 : 3.5, (palm ? 0.06 : 0.1) * k);
      xMark(x, y, z, w, h);
    }
    if (palm && !color) return;
    g.strokeStyle = color ?? '#ffffff';
    g.lineWidth = Math.max(color ? 2 : 1.8, 0.05 * k);
    xMark(x, y, z, w, h);
  };
  // size in world units at the strike line. Text on the floor shrinks with distance far more gently than the
  // highway (as in Tabizera), so the numbers of notes a few seconds away stay readable; ink text sits on a gem
  // and keeps to its size
  const label = (str, x, y, z, size, fill, weight = 700, align = 'center', halo = fill !== t.ink) => {
    const onGem = fill === t.ink, [px, py, k] = P(x, y, z), px2 = fontSize(size * (onGem ? k : Math.sqrt(k * k0)));
    if (px2 < (onGem ? 1 : 8) || px < -60 || px > W + 60) return; // numbers on gems fade in from the far end, however small
    const font = `${weight} ${px2}px ${t.num}`;
    g.font = font;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    const cy = py + measure(g, font, str).middle; // centre the digits themselves, not the font's em box
    if (halo) { // a dark halo lifts numbers off the lines behind them
      g.lineWidth = px2 * 0.2;
      g.strokeStyle = alpha(t.ink, 0.9);
      g.strokeText(str, px, cy);
    }
    g.fillStyle = fill;
    g.fillText(str, px, cy);
    g.textBaseline = 'middle';
  };
  const [, nearY] = P(focus[0], floor, 0), [, farY] = P(focus[0], floor, far);
  const fade = (c, a0, a1) => { // the same fade for everything that asks for it until the highway's ends move: a new gradient for every trail is dear
    const span = `${nearY}|${farY}`;
    if (fades.span !== span || fades.size > 300) {
      fades.clear();
      fades.span = span;
    }
    const key = `${c}|${a0}|${a1}`;
    let grad = fades.get(key);
    if (!grad) {
      grad = g.createLinearGradient(0, nearY, 0, farY);
      grad.addColorStop(0, alpha(c, a0));
      grad.addColorStop(1, alpha(c, a1));
      fades.set(key, grad);
    }
    return grad;
  };
  // Glows. A shadow blur is a pass of its own for every shape, by far the dearest thing a GPU canvas draws (it halved the
  // frame rate), so a glowing shape gets a soft edge drawn around it instead: its outline stroked a few times, wider and
  // fainter, under it. blur is how far out the glow reaches; a shape filled or stroked with a fade glows with a fade too
  let halo = null;
  const glow = (on, color, blur = 10) => (halo = on ? { color, blur } : null);
  const HALO = [[0.6, 0.05], [0.35, 0.13], [0.15, 0.27]]; // reach as a share of blur, opacity: stacked, they fall off as a blur does
  const THIN_HALO = [[0.4, 0.3]]; // a glow of a pixel or two (the strings') looks the same in one layer, and every string has one
  const withHalo = (filled) => {
    if (!halo) return;
    const style = filled ? g.fillStyle : g.strokeStyle, { lineWidth, strokeStyle, globalAlpha } = g;
    const light = filled ? 1 : Math.min(1, (2 * lineWidth) / halo.blur); // a blurred thin line spreads out faint
    g.strokeStyle = typeof style === 'string' ? halo.color : fade(halo.color, 1, 0.1);
    for (const [reach, opacity] of halo.blur > 4 ? HALO : THIN_HALO) {
      g.lineWidth = (filled ? 0 : lineWidth) + 2 * halo.blur * reach;
      g.globalAlpha = globalAlpha * opacity * light;
      g.stroke();
    }
    Object.assign(g, { lineWidth, strokeStyle, globalAlpha });
  };
  const stroke = () => {
    withHalo(false);
    g.stroke();
  };
  const fill = () => {
    withHalo(true);
    g.fill();
  };
  g.textBaseline = 'middle';
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Floor and grid: a lane for every fret wire, a line for every beat. The floor, wider than any view, fades from floor0 at
  // the strike line to nothing at the far end, as a gradient would, in bands between whole device pixels (see FLOOR_BANDS)
  if (!floorBands.has(t)) {
    const [c0, c1] = [t.floor0, t.floor1].map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
    floorBands.set(t, Array.from({ length: FLOOR_BANDS }, (_, i) => {
      const u = (i + 0.5) / FLOOR_BANDS;
      return `rgba(${c0.map((v, c) => Math.round(v + (c1[c] - v) * u))}, ${1 - u})`;
    }));
  }
  const [left0] = P(-60, floor, 0), [left1] = P(-60, floor, far), [right0] = P(LAST_FRET + 60, floor, 0), [right1] = P(LAST_FRET + 60, floor, far);
  const bandEdge = (i) => (i % FLOOR_BANDS ? Math.round((nearY + ((farY - nearY) * i) / FLOOR_BANDS) * B) / B : i ? farY : nearY);
  const sides = (y) => [left0 + ((left1 - left0) * (y - nearY)) / (farY - nearY), right0 + ((right1 - right0) * (y - nearY)) / (farY - nearY)];
  if (side) { // swung, the strike line slants and the floor's far ends can be beside the camera: clip the bands to the floor in front of it
    const edge = focus[0] + (1 - dot(sub([focus[0], floor, 0], eye), fwd)) / fwd[0]; // where the floor comes to a fret width in front
    const [l, r] = fwd[0] > 0 ? [Math.max(-60, edge), LAST_FRET + 60] : [-60, Math.min(LAST_FRET + 60, edge)];
    g.save();
    path([[l, floor, 0], [r, floor, 0], [r, floor, far], [l, floor, far]]);
    g.clip();
    g.fillStyle = floorBands.get(t)[0];
    g.fillRect(0, nearY, W, VH - nearY); // the strike line's near end, below the middle's
  }
  floorBands.get(t).forEach((color, i) => {
    const bottom = bandEdge(i), top = bandEdge(i + 1), [l0, r0] = sides(bottom), [l1, r1] = sides(top);
    if (top >= bottom) return;
    g.fillStyle = color;
    if (side || (Math.max(l0, l1) <= 0 && Math.min(r0, r1) >= W)) return g.fillRect(0, top, W, bottom - top);
    g.beginPath(); // the floor's edges show: follow them
    [[l0, bottom], [r0, bottom], [r1, top], [l1, top]].forEach(([x, y]) => g.lineTo(x, y));
    fill();
  });
  if (side) g.restore();
  g.strokeStyle = fade(t.lane, 0.5, 0.04);
  g.lineWidth = t.laneW;
  for (let w = 0; w <= LAST_FRET; w++) line3([w, floor, 0], [w, floor, far]);
  for (const beat of arr.beats) {
    const dt = beat.time - now;
    if (dt < 0) continue;
    if (dt > LOOK) break;
    g.strokeStyle = beat.measure >= 0 ? t.measure : t.beat;
    g.lineWidth = beat.measure >= 0 ? 1.6 : 1;
    line3([0, floor, Z(dt)], [LAST_FRET, floor, Z(dt)]);
  }

  // Hand positions, unless the guides are turned off: a faint band down the highway with thin edges on the
  // floor. A move starts a new band, with its index-finger fret beside it
  const zones = t.guides === false ? [] : anchors.filter((a) => a.endTime > now && a.time < now + LOOK);
  zones.forEach((a, i) => {
    const z0 = Z(Math.max(0, a.time - now)), z1 = Z(Math.min(LOOK, a.endTime - now)), l = a.fret - 1, r = l + a.width;
    g.fillStyle = fade(t.anchorFill, t.anchorOpacity, 0.02);
    path([[l, floor, z0], [r, floor, z0], [r, floor, z1], [l, floor, z1]]);
    fill();
    g.strokeStyle = fade(t.anchorLane, 0.55, 0.04);
    g.lineWidth = t.anchorLaneW * 0.6;
    for (const x of [l, r]) line3([x, floor, z0], [x, floor, z1]);
    if (i && a.time > now) line3([l, floor, z0], [r, floor, z0]);
    // outside the band so it can't be read as a note to play
    if (i && a.time > now + 0.3) label(String(a.fret), l - 0.2, floor, z0, 0.3, t.anchorLane, 700, 'right');
  });

  // Bar markings on the floor where they happen (meter, key, tempo, feel, repeats, endings, jumps, ottava, free text like
  // "pizz."), and crescendo and diminuendo hairpins beside them. They keep to a line along the highway, just left of the
  // framed neck: it moves with the camera, so on screen it stays in place wherever the hand is
  const moments = new Map(), moment = (time) => { // everything at the same moment goes on one line, so nothing overlaps
    const key = Math.round(time * 100);
    if (!moments.has(key)) moments.set(key, { dt: time - now, texts: [], pins: [] });
    return moments.get(key);
  };
  for (const m of arr.markers ?? []) if (m.time >= now && m.time <= now + LOOK && !moment(m.time).texts.includes(m.text)) moment(m.time).texts.push(m.text);
  for (const h of arr.hairpins ?? []) if (h.time >= now && h.time <= now + LOOK) moment(h.time).pins.push(h.kind);
  const markLine = cam.center - (cam.span / 2 + 0.5) / stretch; // the same place on screen at any fret width
  for (const { dt, texts, pins } of moments.values()) { // right-aligned against the line at the depth of their bar, in perspective
    // Set in one font size and scaled to its depth: a size of its own every frame would set up a new font every frame, and
    // quarter-pixel sizes (see fontSize) would make a long line of right-aligned text jump
    const [px, py, k] = P(markLine, floor, Z(dt)), scale = Math.sqrt(k * k0), text = texts.join('  ·  '), space = 0.25 * scale;
    const font = `700 ${MARK_PX}px ${t.num}`, shrink = (0.3 * scale) / MARK_PX;
    g.font = font;
    const textWidth = text ? measure(g, font, text).width * shrink : 0, width = textWidth + pins.length * (0.9 * scale + space);
    let right = Math.max(px - 0.3 * scale, 16 + width); // a little padding from the line, kept on screen
    g.globalAlpha = Math.min(1, (LOOK - dt) / 0.4);
    if (text) {
      g.save();
      g.translate(right, py);
      g.scale(shrink, shrink);
      g.textAlign = 'right';
      g.lineWidth = MARK_PX * 0.2;
      g.strokeStyle = alpha(t.ink, 0.9);
      g.strokeText(text, 0, 0);
      g.fillStyle = t.accent;
      g.fillText(text, 0, 0);
      g.restore();
      right -= textWidth + space;
    }
    for (const kind of pins) { // a hairpin, as in notation, where it starts: opening for a crescendo, closing for a diminuendo
      const left = right - 0.9 * scale, open = 0.14 * scale, [tip, mouth] = kind === 'cresc' ? [left, right] : [right, left];
      for (const [color, lineWidth] of [[alpha(t.ink, 0.9), Math.max(3.5, 0.12 * scale)], [t.text, Math.max(1.5, 0.05 * scale)]]) {
        g.strokeStyle = color;
        g.lineWidth = lineWidth;
        g.beginPath();
        g.moveTo(mouth, py - open);
        g.lineTo(tip, py);
        g.lineTo(mouth, py + open);
        stroke();
      }
      right = left - space;
    }
  }
  g.globalAlpha = 1;
  lap('floor');

  // The fingerboard at the strike line. Everything on the board comes after it, and the notes come after the
  // strings, so nothing hides them
  g.fillStyle = t.board;
  path([[0, boardLo, 0], [LAST_FRET + 0.6, boardLo, 0], [LAST_FRET + 0.6, boardHi, 0], [0, boardHi, 0]]);
  fill();
  g.fillStyle = alpha(t.anchorFill, 0.16);
  path([[cam.left, boardLo, 0], [cam.right, boardLo, 0], [cam.right, boardHi, 0], [cam.left, boardHi, 0]]);
  fill();
  g.fillStyle = t.inlayDot;
  const between = (at) => (Math.max(0, Math.ceil(at) - 1) + 0.5) * gap; // halfway between the strings around `at`, counted in strings (on a string: the gap under it)
  for (const f of INLAYS) for (const y of f % 12 ? [between((n - 1) / 2)] : [between((n - 1) / 4), stack - between((n - 1) / 4)]) { // one dot in the middle, a pair a gap off either side of it
    const [px, py, k] = P(f - 0.5, y, 0);
    g.beginPath();
    g.ellipse(px, py, 0.1 * k, 0.08 * k, 0, 0, Math.PI * 2);
    fill();
  }

  // The headstock in front of the nut, in the theme's colours (see HEADSTOCKS). Kept to its shape whatever the fret width;
  // the strings run on over it to where they end (see stringPath), and what they wind onto goes over them further down
  const head = HEADSTOCKS[t.headstock], half = (boardHi - boardLo) / 2, flip = t.stringOrder === 'high' ? -1 : 1;
  const onHead = ([u, v]) => [(-u * half) / stretch, stack / 2 + v * half * flip, 0];
  const headV = (s) => ((ys(s) - stack / 2) * flip) / half; // a string's height, in the headstock's terms
  const parts = head && headstockFor(head, Array.from({ length: n }, (_, s) => headV(s)));
  const ends = parts?.ends.map(onHead);
  const paint = (fillStyle, strokeStyle, width = 1) => { // fill and outline the current path
    if (fillStyle) { g.fillStyle = fillStyle; fill(); }
    if (strokeStyle) { g.strokeStyle = strokeStyle; g.lineWidth = width; stroke(); }
  };
  const oval = (uv, ru, rv) => { // an oval on the headstock, radii in half neck widths
    const [x, y] = onHead(uv), [px, py] = P(x, y, 0), [ex] = P(x + (ru * half) / stretch, y, 0), [, ey] = P(x, y + rv * half, 0);
    g.beginPath();
    g.ellipse(px, py, Math.abs(ex - px), Math.abs(ey - py), 0, 0, Math.PI * 2);
  };
  const box = (u0, u1, v0, v1, round) => path(headstockShape(`${u0},${u1},${v0},${v1},${round}`, () => rounded(u0, u1, v0, v1, round)).map(onHead)); // a small part on the headstock, leaning with the board
  if (parts) {
    for (const { u, side, edge } of parts.keys) { // keys, sticking out from under the plate's edge
      const span = (a, b) => [edge + side * a, edge + side * b];
      if (head.keys === 'machine' || head.keys === 'blade') {
        const blade = head.keys === 'blade', w = blade ? 0.09 : 0.11; // long across the neck: the view flattens them
        box(u - w - 0.04, u + w + 0.04, ...span(-0.12, 0.08), 0.03);
        paint(alpha(t.text, 0.12), alpha(t.anchorLane, 0.35));
        box(u - 0.03, u + 0.03, ...span(0.06, 0.22), 0);
        paint(alpha(t.text, 0.28));
        box(u - w, u + w, ...span(0.2, blade ? 0.62 : 0.68), blade ? 0.04 : 0.1);
        paint(alpha(t.text, 0.18), alpha(t.anchorLane, 0.55));
      } else if (head.keys === 'tulip') {
        box(u - 0.035, u + 0.035, ...span(-0.05, 0.22), 0);
        paint(alpha(t.text, 0.28));
        oval([u, edge + side * 0.18], 0.08, 0.04);
        paint(alpha(t.text, 0.3));
        oval([u, edge + side * 0.4], 0.14, 0.2);
        paint(alpha(t.text, 0.18), alpha(t.anchorLane, 0.55));
      } else { // pearl buttons
        box(u - 0.03, u + 0.03, ...span(-0.05, 0.2), 0);
        paint(alpha(t.text, 0.28));
        oval([u, edge + side * 0.34], 0.12, 0.16);
        paint(alpha(t.nut, 0.55), alpha(t.text, 0.35));
      }
    }
    for (const side of head.keys === 'pearl' ? [1, -1] : []) { // a classical head's tuner plates, just showing past its edges
      const row = parts.keys.filter((key) => key.side === side);
      if (!row.length) continue;
      const us = row.map((key) => key.u), e = Math.max(...row.map((key) => key.edge * side));
      box(Math.min(...us) - 0.4, Math.max(...us) + 0.4, side * (e - 0.1), side * (e + 0.07), 0.05);
      paint(alpha(t.text, 0.16), alpha(t.anchorLane, 0.35));
    }
    // The plate: its finish darkening toward the treble side, a bevel inside the lit edge
    path(parts.outline.map(onHead));
    const [, bassY] = P(...onHead([0, 1.6])), [, trebleY] = P(...onHead([0, -1.2])), finish = g.createLinearGradient(0, bassY, 0, trebleY);
    finish.addColorStop(0, t.floor0);
    finish.addColorStop(1, t.ink);
    paint(finish);
    g.save();
    g.clip();
    paint(null, alpha(t.text, 0.07), 0.3 * half * k0);
    g.restore();
    glow(t.glow, t.anchorLane, 8);
    paint(null, alpha(t.anchorLane, 0.6), Math.max(1.5, 0.03 * k0));
    glow(false);
    for (const side of head.slots ? [1, -1] : []) {
      const [u0, u1, v0, v1] = head.slots;
      box(u0, u1, v0 * side, v1 * side, (v1 - v0) / 2);
      paint(alpha(t.ink, 0.92), alpha(t.text, 0.12));
    }
    if (head.cover) { // the truss rod cover and its screws
      path(headstockShape(head.cover, () => spline(head.cover)).map(onHead));
      paint(alpha(t.text, 0.09), alpha(t.text, 0.4));
      for (const screw of head.screws) {
        oval(screw, 0.04, 0.04);
        paint(alpha(t.nut, 0.85));
      }
    }
    if (head.trussNut) { // or where the truss rod adjusts, a recess at the heel
      oval(head.trussNut, 0.12, 0.12);
      paint(alpha(t.ink, 0.8), alpha(t.text, 0.28));
      oval(head.trussNut, 0.055, 0.055);
      paint(alpha(t.ink, 0.95));
    }
  }
  lap('headstock');

  const visible = [];
  for (const note of arr.notes) {
    if (note.time > now + LOOK) break;
    const lasts = Math.max(note.sustain, (note.slideTo ?? note.slideUnpitchTo ?? null) === null ? 0 : 0.25, 0.15);
    if (note.time + lasts >= now - 0.05) visible.push(note);
  }

  const chordOf = (note) => (note.chord === null || note.chord === undefined ? null : arr.chords[note.chord]);
  const frameOnly = (note) => t.repeatMarks === 'frame' && (note.repeat || chordOf(note)?.highDensity); // a repeated chord shown by its frame alone
  const spot = (note) => { // x along the neck (an open string spans the hand position), y at its string's height
    const a = anchorAt(anchors, note.time), open = note.fret === 0;
    return { a, open, x: open ? a.fret - 1 + a.width / 2 : note.fret - 0.5, y: ys(note.string) };
  };
  // A slide glides from x along the neck over its note's length (a quarter second at least), easing in and out. Its trail
  // follows it, and so do its gem and its target on the fretboard while it sounds: a sliding chord moves with its slide
  const slideX = (note, x, sec) => { // sec seconds into the note; an open string keeps to its bar (its slide is an arch, see the trails)
    const to = note.slideTo ?? note.slideUnpitchTo ?? null, p = Math.min(1, Math.max(0, sec / Math.max(note.sustain, 0.25)));
    return to === null || note.fret === 0 ? x : x + (to - 0.5 - x) * p * p * (3 - 2 * p);
  };

  // A bend raises what shows the note: its trail on the highway, and its string and target on the fretboard, all by the
  // same amount, so they meet at the board
  const liftAt = (note, sec) => pitchAt(note, sec) * gap * BEND_LIFT; // sec seconds into the note
  const noteLift = (note) => { // while it sounds
    const sec = now - note.time;
    return sec < 0 || note.fret === 0 || !(bendPeak(note) > 0) ? 0 : liftAt(note, Math.min(sec, Math.max(note.sustain, 0.15)));
  };

  // Strings being bent right now: the whole string pushed up by the finger, as a real one is, in a straight line from the nut
  // to the fretted note and on to the end of the board
  const bending = new Map();
  for (const note of visible) {
    const dt = note.time - now, held = Math.max(note.sustain, 0.15);
    if (dt > 0 || -dt > held || note.fret === 0 || !(bendPeak(note) > 0)) continue;
    bending.set(note.string, { note, x: note.fret - 0.5, dy: noteLift(note) });
  }
  const stringPath = (s, lift = 0, sounding = false) => { // along the string at the board from where it ends on the headstock (or, sounding, from the nut: nothing past it rings), bent where it is being bent
    const b = bending.get(s), y0 = ys(s) + lift, start = sounding ? [[0, y0, 0]] : [ends ? [ends[s][0], ends[s][1] + lift, 0] : [-0.6, y0, 0], [0, y0, 0]];
    if (!b) return path([...start, [LAST_FRET + 0.6, y0, 0]], false);
    path([...start, [b.x, y0 + b.dy, 0], [LAST_FRET + 0.6, y0, 0]], false); // bent on the neck only
  };
  const boardY = (note) => ys(note.string) + noteLift(note); // a bent note rides with its string

  // The strike line: metal fret wires, the nut, the hand position's posts, and the strings
  const [, wireTop] = P(focus[0], boardHi, 0), [, wireBottom] = P(focus[0], boardLo, 0);
  const metal = g.createLinearGradient(0, wireTop, 0, wireBottom); // lit from above, like fret wire
  metal.addColorStop(0, alpha(t.anchorPost, 0.75));
  metal.addColorStop(1, t.post);
  g.strokeStyle = metal;
  g.lineWidth = Math.max(1.5, 0.05 * k0);
  for (let w = 1; w <= LAST_FRET; w++) line3([w, boardLo - 0.04, 0], [w, boardHi + 0.04, 0]);
  if (!head?.lockingNut) {
    g.strokeStyle = t.nut;
    g.lineWidth = Math.max(3, 0.12 * k0);
    line3([0, boardLo - 0.06, 0], [0, boardHi + 0.06, 0]);
  }
  glow(t.glow, t.anchorPost, 12);
  g.strokeStyle = t.anchorPost;
  g.lineWidth = Math.max(3, 0.07 * k0);
  for (const x of [cam.left, cam.right]) line3([x, boardLo - 0.14, 0], [x, boardHi + 0.14, 0]);
  glow(false);
  const stringWidth = (s) => t.strW * (0.7 + 0.14 * (n - 1 - s)); // wound strings are thicker
  for (let s = 0; s < n; s++) {
    const width = stringWidth(s);
    glow(t.glow, color(s), 3);
    g.strokeStyle = alpha(color(s), 0.9);
    g.lineWidth = width;
    stringPath(s, 0, true); // the neck and the headstock stroked apart: a glow is blurred over the box around its path, and the box around both is most of the screen
    stroke();
    path([ends ? ends[s] : [-0.6, ys(s), 0], [0, ys(s), 0]], false);
    stroke();
    glow(false);
    g.strokeStyle = 'rgba(255, 255, 255, 0.25)'; // the light catching the string
    g.lineWidth = Math.max(0.6, width * 0.3);
    stringPath(s, 0.012);
    stroke();
  }
  if (parts) { // over the string ends: what they wind onto, a string tree, a locking nut
    parts.ends.forEach(([u, v], s) => {
      if (head.slots) { // a roller across the slot, the string wound round it
        box(u - 0.07, u + 0.07, v - 0.26, v + 0.26, 0.05);
        paint(alpha(t.nut, 0.85));
        box(u - 0.08, u + 0.08, v - 0.035, v + 0.035, 0.03);
        paint(color(s));
      } else if (head.clamps) {
        box(u - 0.1, u + 0.1, v - 0.1, v + 0.1, 0.04);
        paint(alpha(t.text, 0.22), alpha(t.text, 0.45));
        oval([u, v], 0.05, 0.05);
        paint(t.nut);
      } else { // a post in its bushing, the string wound round the side it comes from
        oval([u, v], 0.17, 0.17);
        paint(alpha(t.ink, 0.5), alpha(t.nut, 0.4));
        oval([u, v], 0.085, 0.085);
        paint(t.nut);
        oval([u, v], 0.03, 0.03);
        paint(alpha(t.ink, 0.85));
        const [px, py, k] = P(...ends[s]), [nutX, nutY] = P(0, ys(s), 0), toNut = Math.atan2(nutY - py, nutX - px);
        g.beginPath();
        g.arc(px, py, 0.1 * half * k, toNut - 1.3, toNut + 1.3);
        paint(null, color(s), stringWidth(s));
      }
    });
    if (head.tree) { // pressing the top two strings down on their way to their posts
      const vs = [n - 2, n - 1].map((s) => { const [pu, pv] = parts.ends[s]; return headV(s) + ((pv - headV(s)) * head.tree) / pu; });
      box(head.tree - 0.05, head.tree + 0.05, Math.min(...vs) - 0.08, Math.max(...vs) + 0.08, 0.04);
      paint(alpha(t.nut, 0.7), alpha(t.ink, 0.6));
    }
    if (head.lockingNut) { // a metal block over the nut, clamping the strings in pairs
      path([[-0.06, 1.07], [0.36, 1.07], [0.36, -1.07], [-0.06, -1.07]].map(onHead));
      paint(alpha(t.text, 0.14), alpha(t.text, 0.4));
      for (const v of [0.56, 0, -0.56]) {
        box(0, 0.3, v - 0.21, v + 0.21, 0.05);
        paint(alpha(t.text, 0.28), alpha(t.text, 0.45));
        oval([0.15, v], 0.06, 0.06);
        paint(t.nut);
      }
    }
  }

  // Sounding notes light their string from the nut on, with a flash where they landed. A note left ringing
  // (let ring, an arpeggio) glows as it's struck and then stays lit without the glow: a glow on every ringing string is dear
  const ringing = (note, dt) => note.letRing && -dt > 0.25;
  for (const note of visible) {
    const dt = note.time - now;
    if (dt > 0 || -dt > Math.max(note.sustain, 0.15) || note.mute) continue;
    const c = color(note.string), y = boardY(note);
    glow(!ringing(note, dt), c, 10);
    g.strokeStyle = c;
    g.lineWidth = t.strW + 3;
    stringPath(note.string, 0, true);
    stroke();
    glow(false);
    if (-dt < 0.2) {
      const [px, py, k] = P(spot(note).x, y, 0);
      g.save();
      g.translate(px, py);
      g.scale(1, 0.4); // squash a round glow into a flat ellipse
      const flash = g.createRadialGradient(0, 0, 0, 0, 0, 0.5 * k); // kept inside the fret so the next target stays visible
      flash.addColorStop(0, alpha(t.flash, 0.8 * (1 + dt / 0.2)));
      flash.addColorStop(1, alpha(t.flash, 0));
      g.fillStyle = flash;
      g.beginPath();
      g.arc(0, 0, 0.5 * k, 0, Math.PI * 2);
      fill();
      g.restore();
    }
  }

  // A chord shape being held: its frame lit on the board
  g.strokeStyle = t.anchorLane;
  g.lineWidth = 2.5;
  glow(t.glow, t.anchorLane, 10);
  for (const shape of arr.handShapes ?? []) {
    if (shape.startTime > now || shape.endTime <= now || shape.endTime - shape.startTime < 0.3 || !shape.frets.some((f, str) => f >= 0 && str < n)) continue;
    const [l, r] = frameAt(shape.frets.filter((f, str) => str < n), shape.startTime);
    path([[l, boardLo, 0], [r, boardLo, 0], [r, boardHi, 0], [l, boardHi, 0]]);
    stroke();
  }
  glow(false);
  lap('strings');

  // Under every frame and gem: a white line on the floor under each note, marking its beat (chords get theirs under the
  // frame; the note lines setting sets how white, down to none), and a stem from each fretted note down to it
  for (const note of visible) {
    const dt = note.time - now, z = Z(dt), chord = chordOf(note), { a, open, x: from, y } = spot(note), x = slideX(note, from, -dt);
    if (dt < -0.15 || Math.abs(P(x, y, z)[0] - W / 2) > W / 2 + 200) continue;
    const hw = open ? (a.width - 0.2) / 2 : 0.34;
    g.globalAlpha = dt < 0 ? Math.max(0, 1 + dt / 0.15) : Math.min(1, (LOOK - dt) / 0.4);
    if (!chord && noteLine) {
      g.strokeStyle = noteLine;
      g.lineWidth = 2;
      line3([x - hw, floor, z], [x + hw, floor, z]);
    }
    if (open || frameOnly(note)) continue;
    g.strokeStyle = alpha(color(note.string), note.repeat || chord?.highDensity ? 0.35 : 0.75); // fainter under a repeat
    g.lineWidth = 1.5;
    line3([x, Math.min(y, boardY(note)) - 0.42 * gap, z], [x, floor, z]);
  }
  g.globalAlpha = 1;

  // Under every gem: slide ramps into and out of notes, slurs from a hammer-on or pull-off back to its note, ties,
  // and tails. A tail is a ribbon along its string that fades into the distance; its shape is the technique: a slide
  // drifts along the neck, a bend or the whammy bar rises and falls with its curve, vibrato is an even wave up and down, tremolo
  // picking jitters, let ring is dashed
  const arc = (from, to, bulge) => { // a curve between two points on the highway, rising by bulge in the middle
    const points = Array.from({ length: 13 }, (_, j) => {
      const u = j / 12;
      return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u + Math.sin(Math.PI * u) * bulge, from[2] + (to[2] - from[2]) * u];
    });
    path(points, false);
    stroke();
  };
  // Chord shapes being held or played again: two glowing rails on the floor along the frame's edges. An
  // arpeggio's rails don't glow (they run for seconds, under notes that ring), and where its shape is taken they start with
  // the outline of its frame, and its name
  for (const rail of chordRails(arr)) {
    if (rail.end <= now || rail.time >= now + LOOK) continue;
    const [l, r] = frameAt(rail.frets, rail.time), dt = rail.time - now, z0 = Z(Math.max(dt, 0)), z1 = Z(Math.min(rail.end - now, LOOK));
    g.globalAlpha = Math.min(1, (LOOK - Math.max(dt, 0)) / 0.4);
    glow(t.glow && !rail.arpeggio, t.anchorLane, 10);
    g.strokeStyle = fade(t.anchorLane, 1, 0.2);
    g.lineWidth = 3.5;
    for (const side of [l, r]) line3([side, floor, z0], [side, floor, z1]);
    glow(false);
    if (rail.arpeggio && dt > 0) {
      g.strokeStyle = alpha(t.anchorLane, 0.7);
      g.lineWidth = 1.5;
      path([[l, floor, z0], [l, boardHi, z0], [r, boardHi, z0], [r, floor, z0]], false);
      stroke();
      if (rail.arpeggio.name && z0 > NEAR) label(rail.arpeggio.name, l - 0.12, boardHi / 2, z0, 0.34, t.text, 600, 'right');
    }
  }
  g.globalAlpha = 1;

  for (const [i, note] of visible.entries()) {
    const dt = note.time - now, chord = chordOf(note), slide = note.slideTo ?? note.slideUnpitchTo ?? null;
    const { a, open, x, y } = spot(note), c = color(note.string), z = Z(dt);
    const hw = (open ? (a.width - 0.2) / 2 : 0.34) * (note.grace ? 0.6 : 1), hh = (open ? 0.12 : 0.42) * gap * (note.grace ? 0.6 : 1);
    if (dt > -0.15 && !chord?.highDensity && !note.repeat) {
      g.globalAlpha = Math.min(1, (LOOK - dt) / 0.4);
      g.strokeStyle = c;
      g.lineWidth = 2;
      g.setLineDash([4, 4]);
      if (note.slideIn) line3([x + (note.slideIn === 'below' ? -1.4 : 1.4), y - hh, Math.max(0, z - 1)], [x + (note.slideIn === 'below' ? -hw : hw), y, z]);
      if (note.slideOut) line3([x + (note.slideOut === 'up' ? hw : -hw), y, z], [x + (note.slideOut === 'up' ? 1.4 : -1.4), y - hh, z + 1]);
      g.setLineDash([]);
      if (typeof note.tieTo === 'number') { // a dashed arc to the note it is tied to
        const to = arr.notes[note.tieTo], q = spot(to);
        g.setLineDash([5, 4]);
        arc([x, y + hh, z], [q.x, q.y + hh, Z(to.time - now)], gap * 0.9);
        g.setLineDash([]);
      }
      g.globalAlpha = 1;
    }

    const tail = slide === null ? note.sustain : Math.max(note.sustain, 0.25);
    const moves = slide !== null || note.bend || note.bendCurve || note.whammy;
    if (tail <= 0.2 || dt + tail <= 0 || (chord && !moves) || frameOnly(note)) continue; // chords sustain without trails: their frames already show the beats
    if (open && slide) { // a slide from an open string: an arch from its bar to the fret it lands on when the note ends
      g.strokeStyle = c;
      g.lineWidth = 2.5;
      g.setLineDash(note.letRing ? [7, 6] : []);
      arc([x, y, Z(Math.max(dt, 0))], [slide - 0.5, y, Z(Math.min(dt + tail, LOOK))], gap * 1.5);
      g.setLineDash([]);
    }
    // A trail ends where the next note in its way starts: the next chord, the next note on its string (a slide runs into
    // the note it slides to), or a later note lying across it. Cut there in time, so the trail keeps its shape as it comes
    let next = null;
    for (let j = i + 1; j < visible.length && visible[j].time <= note.time + tail + 0.02; j++) {
      const later = visible[j];
      if (later.time <= note.time + 0.005) continue;
      const over = spot(later), reach = over.open ? (over.a.width - 0.2) / 2 + 0.1 : 0.45;
      if (chordOf(later) || later.string === note.string || Math.abs(over.x - x) < reach) {
        next = later;
        break;
      }
    }
    const d0 = Math.max(dt, 0), bent = note.bend || note.bendCurve || note.whammy;
    let d1 = Math.min(dt + tail, LOOK, next ? next.time - now : Infinity);
    if (d1 <= d0) continue;
    const along = (d) => {
      const sec = d - dt, zz = Z(d);
      const railed = note.bend || note.bendCurve || note.whammy; // a rail stays straight: its vibrato shows in the mark above the note
      const wave = note.vibrato && !railed ? Math.sin((zz / 1.6) * Math.PI * 2) * gap * (note.vibratoWide ? 0.45 : 0.25) : 0; // the string pushed up and let back, a steady wavelength along the highway
      const jitter = note.tremolo ? (Math.floor(zz / 0.3) % 2 ? 0.05 : -0.05) : 0;
      // A bend raises the trail in a smooth S where the pitch rises, holds it up and lowers it again for a release; it rises
      // a little more than the string on the fretboard, so it reads from behind, and settles to the string at the board
      const rise = BEND_LIFT + (BEND_RISE - BEND_LIFT) * smooth(Math.min(1, zz / BEND_EASE));
      return [slideX(note, x, sec) + jitter, y + wave + (liftAt(note, sec) * rise) / BEND_LIFT, zz];
    };
    if (bent && next) { // raised, the trail would show past the next note: end it where it reaches that note's bottom edge on screen
      const at = spot(next), bottom = P(at.x, at.y - (at.open ? 0.12 : 0.42) * gap, Z(next.time - now))[1] + 3, screenY = (d) => P(...along(d))[1];
      if (screenY(d1) < bottom) {
        let lo = d0, hi = d1;
        for (let j = 0; j < 24; j++) [lo, hi] = screenY((lo + hi) / 2) < bottom ? [lo, (lo + hi) / 2] : [(lo + hi) / 2, hi];
        d1 = lo;
      }
      if (d1 <= d0 + 0.001) continue;
    }
    const straight = slide === null && !bent && !note.vibrato && !note.tremolo; // a straight line along the highway stays straight in perspective: its two ends draw it
    const steps = straight ? 1 : Math.min(400, Math.max(12, Math.ceil((d1 - d0) * SPEED * 8)));
    const spine = Array.from({ length: steps + 1 }, (_, j) => along(d0 + ((d1 - d0) * j) / steps));
    if (open && !chord) { // an open string sounds as a lane as wide as the hand position, edged in its colour
      g.fillStyle = fade(c, note.letRing ? 0.14 : 0.26, 0.03);
      path([...spine.map(([px, py, pz]) => [px - hw, py, pz]), ...spine.slice().reverse().map(([px, py, pz]) => [px + hw, py, pz])]);
      fill();
      glow(t.glow && !note.letRing, c, 6);
      g.strokeStyle = fade(c, 0.95, 0.3);
      g.lineWidth = 2.5;
      g.setLineDash(note.letRing ? [7, 6] : []);
      for (const side of [-hw, hw]) {
        path(spine.map(([px, py, pz]) => [px + side, py, pz]), false);
        stroke();
      }
      g.setLineDash([]);
      glow(false);
    } else if (note.bend || note.bendCurve || note.whammy) { // a bend: a solid band, raised where the string is bent
      const band = (half) => path([...spine.map(([px, py, pz]) => [px - half, py, pz]), ...spine.slice().reverse().map(([px, py, pz]) => [px + half, py, pz])]);
      band(RAIL);
      g.fillStyle = fade(c, 1, 0.6);
      fill();
      band(RAIL * 0.35); // a slightly darker stripe along the middle
      g.fillStyle = fade(shade(c, -0.22), 1, 0.55);
      fill();
      glow(t.glow, c, 8);
      g.strokeStyle = fade(shade(c, 0.6), 1, 0.5); // bright edges
      g.lineWidth = 2;
      for (const side of [-RAIL, RAIL]) {
        path(spine.map(([px, py, pz]) => [px + side, py, pz]), false);
        stroke();
      }
      glow(false);
    } else {
      glow(t.glow && !note.letRing, c, 6);
      g.fillStyle = fade(c, note.letRing ? 0.4 : 0.75, note.letRing ? 0.15 : 0.3); // plain to see from the far end, not only as it arrives
      path([...spine.map(([px, py, pz]) => [px - 0.09, py, pz]), ...spine.slice().reverse().map(([px, py, pz]) => [px + 0.09, py, pz])]);
      fill();
      glow(false);
    }
    if (note.letRing || slide !== null || (!bent && (note.vibrato || note.tremolo))) { // a bright spine traces the shape, dashed while ringing
      g.strokeStyle = fade(note.letRing ? c : '#ffffff', 0.75, 0.3);
      g.lineWidth = note.letRing ? 2 : 1.5;
      g.setLineDash(note.letRing ? [7, 6] : []);
      path(spine, false);
      stroke();
      g.setLineDash([]);
    }
    if (slide !== null && d1 >= Math.min(dt + tail, LOOK) - 0.001) { // where the slide ends, unless the trail was cut short
      const [ex, ey, ez] = along(dt + tail);
      g.strokeStyle = c;
      g.lineWidth = 2;
      g.setLineDash(note.slideTo === null ? [5, 4] : []);
      if (open) gem(slide - 0.5, ey, ez, 0.34, 0.42 * gap); // where the arch lands, a fret's width
      else gem(ex, ey, ez, hw, hh);
      stroke();
      g.setLineDash([]);
    }
  }
  lap('trails');

  // Notes, far to near: gems riding at their string's height
  const boxed = new Set();
  for (let i = visible.length - 1; i >= 0; i--) {
    const note = visible[i], dt = note.time - now, z = Z(dt);
    const chord = chordOf(note), { a, open, x: from } = spot(note), x = slideX(note, from, -dt), y = boardY(note); // a note being bent rides up with its string
    const muted = note.mute || chord?.fretHandMute, palm = note.palmMute || chord?.palmMute;
    const c = color(note.string);
    const hw = (open ? (a.width - 0.2) / 2 : 0.34) * (note.grace ? 0.6 : 1), hh = (open ? 0.12 : 0.42) * gap * (note.grace ? 0.6 : 1); // grace notes are small
    const slide = note.slideTo ?? note.slideUnpitchTo ?? null;

    if (dt < -0.15) continue;
    const faded = dt < 0 ? Math.max(0, 1 + dt / 0.15) : Math.min(1, (LOOK - dt) / 0.4); // fade in at the far end, out once played
    g.globalAlpha = faded;

    if (chord && !boxed.has(note.chord)) {
      boxed.add(note.chord);
      // Repeats of the chord before get the same frame, empty and faint until it comes close: then strum again
      const [l, r] = frameAt(chord.notes.map((j) => arr.notes[j].fret), note.time), shown = g.globalAlpha;
      const near = z < NEAR;
      const weight = near ? 0.65 : chord.highDensity && t.repeatMarks !== 'frame' ? 0.18 : 0.5; // a frame on its own keeps its full weight
      path([[l, floor, z], [r, floor, z], [r, boardHi, z], [l, boardHi, z]]);
      if (t.frames === 'gradient') { // a panel glowing up from the floor, fading out above the top string
        const [, bottom] = P(l, floor, z), [, top] = P(l, boardHi, z), panel = g.createLinearGradient(0, bottom, 0, top);
        panel.addColorStop(0, alpha(near ? t.anchorLane : t.anchorFill, weight * 0.6));
        panel.addColorStop(1, alpha(near ? t.anchorLane : t.anchorFill, 0));
        g.fillStyle = panel;
        fill();
      } else {
        g.globalAlpha = shown * weight;
        if (!chord.highDensity) {
          g.fillStyle = t.chordFill;
          fill();
        }
        g.strokeStyle = near ? t.anchorLane : t.chordBox;
        g.lineWidth = near || !chord.highDensity ? 1.5 : 1.2;
        glow(t.glow && near, t.anchorLane, 8);
        stroke();
        glow(false);
      }
      g.globalAlpha = shown; // a white line under every frame, box or gradient, marks the moment to play it
      g.strokeStyle = noteLine;
      g.lineWidth = 2;
      if (noteLine) line3([l, floor, z], [r, floor, z]);
      if (chord.highDensity && (chord.palmMute || chord.fretHandMute)) { // a repeat's mute: grey and big for a palm mute, small and white for the fretting hand (see muteMark)
        g.strokeStyle = chord.palmMute ? t.muted : '#ffffff';
        xMark((l + r) / 2, floor + gap * 0.4, z, chord.palmMute ? 0.22 : 0.12, gap * (chord.palmMute ? 0.35 : 0.22));
      }
      if (chord.accent) { // played harder: the frame's top corners shine white
        const arm = Math.min(0.6, (r - l) * 0.22), drop = (boardHi - floor) * 0.35;
        g.strokeStyle = '#ffffff';
        g.lineWidth = (near ? 3.5 : 2.5) * (chord.accent === 'heavy' ? 1.4 : 1);
        g.lineCap = 'square';
        glow(t.glow, '#ffffff', near ? 12 : 6);
        path([[l, boardHi - drop, z], [l, boardHi, z], [l + arm, boardHi, z]], false);
        stroke();
        path([[r - arm, boardHi, z], [r, boardHi, z], [r, boardHi - drop, z]], false);
        stroke();
        glow(false);
        g.lineCap = 'round';
      }
      if (chord.barre && (!chord.highDensity || t.repeatMarks === 'grey')) { // one finger across several strings: a bar over them at its fret (a repeat's like its other marks: greyed out, or left off)
        const bx = chord.barre.fret - 0.5;
        g.strokeStyle = chord.highDensity ? t.muted : 'rgba(255, 255, 255, 0.7)';
        g.lineWidth = Math.max(3, 0.1 * P(bx, stack / 2, z)[2]);
        const [y0, y1] = [ys(chord.barre.from), ys(chord.barre.to)].sort((p, q) => p - q);
        line3([bx, y0 - gap * 0.4, z], [bx, y1 + gap * 0.4, z]);
        label(chord.barre.half ? '½B' : 'B', bx, boardHi + 0.12, z, 0.22, chord.highDensity ? t.muted : t.text);
      }
      if (chord.strum || chord.roll) { // strum or roll beside the frame: down runs from the low strings to the high ones
        const ax = l - 0.25, lowSide = ys(0) > ys(n - 1) ? boardHi - 0.1 : floor + 0.15, highSide = lowSide > stack / 2 ? floor + 0.15 : boardHi - 0.1;
        const [from, to] = (chord.strum ?? chord.roll) === 'down' ? [lowSide, highSide] : [highSide, lowSide];
        g.strokeStyle = t.text;
        g.lineWidth = 2;
        if (chord.roll) path(Array.from({ length: 17 }, (_, j) => [ax + Math.sin((j / 16) * Math.PI * 6) * 0.06, from + ((to - from) * j) / 16, z]), false); // rolled: a wavy arrow
        else path([[ax, from, z], [ax, to, z]], false);
        stroke();
        const head = to < from ? 0.14 : -0.14;
        line3([ax - 0.08, to + head, z], [ax, to, z]);
        line3([ax + 0.08, to + head, z], [ax, to, z]);
      }
      const before = arr.chords[note.chord - 1], changed = !before || note.time - before.time > 1 || before.name !== chord.name;
      if (z > NEAR && chord.name && !chord.highDensity && changed) label(chord.name, l - 0.12, boardHi / 2, z, 0.34, t.text, 600, 'right'); // name it once per change
    }

    const [cx, cy, k] = P(x, y, z);
    if (cx < -200 || cx > W + 200 || frameOnly(note)) {
      g.globalAlpha = 1;
      continue;
    }
    const repeated = note.repeat || chord?.highDensity;
    if (repeated) { // the same chord again: just outlines on its beat, lit as they arrive
      const near = z < NEAR;
      g.globalAlpha *= near ? 0.9 : 0.4;
      g.strokeStyle = c;
      g.lineWidth = near ? 2 : 1.5;
      glow(t.glow && near, c, 8);
      gem(x, y, z, hw, hh);
      stroke();
      glow(false);
      if ((muted || palm) && t.repeatMarks !== 'hide') muteMark(x, y, z, k, open ? 0.34 : hw, open ? gap * 0.3 : hh, palm, t.muted); // its mute, greyed out
      g.globalAlpha = faded;
    } else {
      if (!open && t.number === 'floor' && z > 1.75) {
        const fret = note.harmonic || note.harmonicPinch ? `<${note.fret}>` : note.ghost ? `(${note.fret})` : String(note.fret);
        label(fret, x, floor, z - 0.55, note.grace ? 0.18 : 0.26, c); // just in front of the note's line
      }
      if (note.dynamicLabel) label(note.dynamicLabel, x - 0.6, floor, z, 0.3, t.text, 'italic 700', 'right'); // where the dynamic changes

      if (note.ghost) g.globalAlpha = faded * 0.5;
      if (t.gem === 'pill') { // a capsule; in 3D its back shows a few pixels behind it, lit as a square gem's top
        if (t.notes3d !== false) {
          gem(x, y, z + GEM_DEPTH, hw, hh);
          g.fillStyle = c;
          fill();
          g.fillStyle = 'rgba(255, 255, 255, 0.35)';
          fill();
        }
        gem(x, y, z, hw, hh);
        g.fillStyle = c;
        fill();
      } else { // a square gem with a lit face; in 3D a thin box with a lit top, lit from above
        const harmonic = note.harmonic || note.harmonicPinch, depth = GEM_DEPTH;
        if (!harmonic && t.notes3d !== false) { // top and sides first; the face covers whichever side faces away
          for (const [side, shade] of [
            [[[x - hw, y + hh, z], [x + hw, y + hh, z], [x + hw, y + hh, z + depth], [x - hw, y + hh, z + depth]], 'rgba(255, 255, 255, 0.35)'],
            [[[x - hw, y - hh, z], [x - hw, y + hh, z], [x - hw, y + hh, z + depth], [x - hw, y - hh, z + depth]], 'rgba(0, 0, 0, 0.4)'],
            [[[x + hw, y - hh, z], [x + hw, y + hh, z], [x + hw, y + hh, z + depth], [x + hw, y - hh, z + depth]], 'rgba(0, 0, 0, 0.4)'],
          ]) {
            path(side);
            g.fillStyle = c;
            fill();
            g.fillStyle = shade;
            fill();
          }
        }
        glow(t.glow && z < NEAR, c, 8);
        g.fillStyle = c;
        if (harmonic) path([[x, y + hh * 1.3, z], [x + hw * 0.8, y, z], [x, y - hh * 1.3, z], [x - hw * 0.8, y, z]]);
        else gem(x, y, z, hw, hh);
        fill();
        glow(false);
        const [, ty] = P(x, y + hh, z), [, by] = P(x, y - hh, z), shine = g.createLinearGradient(0, ty, 0, by);
        shine.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        shine.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
        shine.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
        g.fillStyle = shine;
        fill();
        g.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        g.lineWidth = 1;
        stroke();
      }
      if (muted || palm) muteMark(x, y, z, k, open ? 0.34 : hw, open ? gap * 0.3 : hh, palm, open && palm ? c : null); // on an open string's thin bar, the palm mute's X keeps its colour

      if (!open && !muted && !palm) { // a mute's X takes the middle of the gem
        const finger = note.finger ?? (chord?.fingers?.[note.string] >= 0 ? chord.fingers[note.string] : null);
        const onGem = t.number === 'on' ? String(note.fret) : finger !== null ? (finger === 0 ? 'T' : String(finger)) : '';
        if (onGem) { // shown from the far end, fading in until 40% of the way along the drawing distance
          const shown = g.globalAlpha;
          g.globalAlpha = shown * Math.min(1, Math.max(0, (1 - dt / LOOK) / 0.4));
          label(onGem, x, y, z - 0.01, gap * 0.62, t.ink, 700);
          g.globalAlpha = shown;
        }
      }
    }
    if (repeated && t.repeatMarks === 'hide') {
      g.globalAlpha = 1;
      continue;
    }

    const ink = repeated ? t.muted : t.text; // marks on a repeated note are greyed out
    g.globalAlpha = faded * (repeated ? 0.8 : 1) * Math.min(1, Math.max(0, (1 - dt / LOOK) / 0.15)); // fading in from the far end, a little after the note
    if (note.ghost) { // ghost note: dimmed, in brackets
      const [lx] = P(x - hw, y, z), [rx] = P(x + hw, y, z), r = hh * k * 1.5;
      g.strokeStyle = repeated ? ink : c;
      g.lineWidth = Math.max(1.2, 0.035 * k);
      g.beginPath();
      g.arc(lx + r * 0.35, cy, r, Math.PI * 0.7, Math.PI * 1.3);
      stroke();
      g.beginPath();
      g.arc(rx - r * 0.35, cy, r, -Math.PI * 0.3, Math.PI * 0.3);
      stroke();
    }
    if (note.grace) { // grace note: small, with a slash
      g.strokeStyle = ink;
      g.lineWidth = Math.max(1, 0.03 * k);
      line2(g, cx - hw * k * stretch * 1.2, cy + hh * k * 1.4, cx + hw * k * stretch * 1.2, cy - hh * k * 1.4);
    }
    if (note.showString) { // the string's number in a circle, to the left of the note
      const [lx] = P(x - hw, y, z), r = 0.12 * k, sx = lx - r - 0.06 * k;
      g.strokeStyle = g.fillStyle = repeated ? ink : c;
      g.lineWidth = Math.max(1, 0.025 * k);
      g.beginPath();
      g.arc(sx, cy, r, 0, Math.PI * 2);
      stroke();
      g.font = `700 ${fontSize(0.15 * k)}px ${t.num}`;
      g.textAlign = 'center';
      g.fillText(String(n - note.string), sx, cy);
    }

    // Marks stack upwards above the note, articulation nearest to it as in notation
    let above = cy - hh * k - 0.18 * k;
    g.strokeStyle = g.fillStyle = ink;
    g.lineWidth = Math.max(1.2, 0.04 * k);
    g.textAlign = 'center';
    const write = (word, size, style = '700') => {
      if (size * k < 2) return; // below a pixel or two it is only noise
      g.font = `${style} ${fontSize(size * k)}px ${t.num}`;
      g.fillText(word, cx, above);
      above -= (size + 0.04) * k;
    };
    let onTop = cy - hh * k; // the top of the gem, and then of what sits on it
    if (note.hammerOn || note.pullOff) { // a white triangle on the note, pointing down to hammer on and up to pull off
      const scale = note.grace ? 0.6 : 1, w = 0.2 * k * stretch * scale, h = 0.38 * gap * k * scale, [tip, base] = note.hammerOn ? [onTop + 0.4 * h, onTop - 0.6 * h] : [onTop - 0.6 * h, onTop + 0.4 * h];
      g.beginPath();
      g.moveTo(cx - w, base);
      g.lineTo(cx + w, base);
      g.lineTo(cx, tip);
      g.closePath();
      g.fillStyle = repeated ? ink : '#ffffff';
      g.strokeStyle = alpha(t.ink, 0.9);
      g.lineWidth = Math.max(1.5, 0.03 * k);
      stroke();
      fill();
      onTop -= 0.6 * h;
      above = Math.min(above, onTop - 0.14 * k);
      g.strokeStyle = g.fillStyle = ink;
      g.lineWidth = Math.max(1.2, 0.04 * k);
    }
    const peak = bendPeak(note);
    if (peak > 0) { // bend: chevrons in the note's colour right on top of it, up (and down again for a release)
      const pre = note.bendCurve?.[0]?.[1] > 0, release = (note.bendCurve?.length ?? 0) > 1 && note.bendCurve.at(-1)[1] < peak;
      const count = Math.min(3, Math.max(1, Math.round(peak * 2))), w = hw * k * stretch * 0.6, h = hw * k * 0.3, step = h * 1.25, edge = alpha(t.ink, 0.9);
      let top = onTop - 0.04 * k;
      const stack = (dir) => {
        for (let j = 0; j < count; j++) chevron(g, cx, top - j * step - (dir > 0 ? 0 : h), w, h, dir, repeated ? ink : c, edge);
        top -= count * step + 0.08 * k;
      };
      if (!pre || !release) stack(-1); // a pre-bend that is let down only needs the way down
      if (release) stack(1);
      g.font = `700 ${fontSize(0.22 * k)}px ${t.num}`;
      g.textAlign = 'left';
      g.fillStyle = ink;
      g.fillText(`${pre ? 'pre ' : ''}${bendLabel(peak)}`, cx + w + 0.08 * k, (cy - hh * k + top) / 2);
      g.textAlign = 'center';
      above = Math.min(above, top - 0.1 * k);
    }
    if (note.staccato) { // staccato: a dot
      g.beginPath();
      g.arc(cx, above + 0.04 * k, Math.max(1.5, 0.045 * k), 0, Math.PI * 2);
      fill();
      above -= 0.16 * k;
    }
    if (note.accent && (note.accent === 'tenuto' || !chord?.accent)) write({ heavy: '^', tenuto: '–' }[note.accent] ?? '>', 0.3); // an accented chord's frame shows it
    const words = [
      note.tapLeft ? 'm.g.' : note.tap ? (note.tapLeft === false ? 'm.d.' : 'T') : '', // Guitar Pro says which hand taps
      TEXT_MARKS[note.harmonicType] ?? (note.harmonicPinch ? 'PH' : ''),
      note.slap ? 'slap' : note.pop ? 'pop' : '', note.golpe ? `golpe (${note.golpe})` : '', note.rasgueado ? `rasg. ${note.rasgueado}` : '',
      typeof note.trill === 'number' ? `tr ${note.trill}` : '', note.ornament ?? '', note.fade ?? '', note.whammy ? 'w/bar' : '',
      note.wah === 'open' ? 'o' : note.wah === 'closed' ? '+' : '',
    ];
    for (const word of words) if (word) write(word, word.length > 2 ? 0.22 : 0.28);
    if (note.rightFinger) write(note.rightFinger, 0.26, 'italic 700'); // picking-hand finger: p i m a c
    if (note.vibrato) { // vibrato: a short wave, taller when wide
      const w = 0.24 * k, amp = (note.vibratoWide ? 0.07 : 0.035) * k;
      g.beginPath();
      for (let j = 0; j <= 20; j++) g[j ? 'lineTo' : 'moveTo'](cx - w + (2 * w * j) / 20, above + Math.sin((j / 20) * Math.PI * 4) * amp);
      stroke();
      above -= (0.16 + (note.vibratoWide ? 0.06 : 0)) * k;
    }
    if (note.pick) { // pick stroke: ⊓ down, V up
      const w = 0.09 * k, h = 0.13 * k;
      g.beginPath();
      if (note.pick === 'down') [[-w, h / 2], [-w, -h / 2], [w, -h / 2], [w, h / 2]].forEach(([dx, dy], j) => g[j ? 'lineTo' : 'moveTo'](cx + dx, above + dy));
      else [[-w, -h / 2], [0, h / 2], [w, -h / 2]].forEach(([dx, dy], j) => g[j ? 'lineTo' : 'moveTo'](cx + dx, above + dy));
      stroke();
      above -= 0.22 * k;
    }
    if (note.fermata) { // fermata: an arch over a dot
      g.beginPath();
      g.arc(cx, above + 0.06 * k, 0.14 * k, Math.PI, 0);
      stroke();
      g.beginPath();
      g.arc(cx, above + 0.02 * k, Math.max(1.5, 0.03 * k), 0, Math.PI * 2);
      fill();
      above -= 0.24 * k;
    }
    if (note.tremolo) { // three short slashes, as in notation
      for (let j = -1; j <= 1; j++) line2(g, cx - 0.12 * k, above + (j * 0.08 + 0.05) * k, cx + 0.12 * k, above + (j * 0.08 - 0.05) * k);
      above -= 0.34 * k;
    }
    if (slide !== null && !open) { // arrow pointing the way the slide goes
      const dir = Math.sign(slide - note.fret) || 1, x0 = cx - dir * 0.16 * k, x1 = cx + dir * 0.16 * k, yb = above + 0.07 * k, yt = above - 0.09 * k;
      line2(g, x0, yb, x1, yt);
      line2(g, x1, yt, x1 - dir * 0.1 * k, yt);
      line2(g, x1, yt, x1, yt + 0.1 * k);
      above -= 0.3 * k;
    }
    g.globalAlpha = 1;
  }
  lap('notes');

  // A barre being played: its bar across the strings on the board
  const barred = new Set();
  for (const note of visible) {
    const dt = note.time - now, chord = chordOf(note);
    if (!chord?.barre || barred.has(chord) || dt > 0.06 || dt < -Math.max(note.sustain, 0.12)) continue;
    barred.add(chord);
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.lineWidth = Math.max(4, 0.12 * k0);
    const [y0, y1] = [ys(chord.barre.from), ys(chord.barre.to)].sort((p, q) => p - q);
    line3([chord.barre.fret - 0.5, y0 - gap * 0.45, 0], [chord.barre.fret - 0.5, y1 + gap * 0.45, 0]);
  }

  // Where to press, on top of everything on the board: targets fill in as notes approach, finger number and all,
  // and light up while they sound. A spot played again straight after stays lit from the strike before (see markRepeats), so
  // repeated notes and chords hold their targets until the fingering switches instead of flashing on every strike
  const lit = new Set(), outlined = new Set(); // one lit target per spot, however many notes hold it; the spots with a target
  for (const note of visible) {
    const dt = note.time - now, chord = chordOf(note), bent = bending.get(note.string), heldFrom = note.heldFrom ?? null;
    const pressed = dt <= 0.06 || (heldFrom !== null && now >= heldFrom - 0.06);
    const slides = (note.slideTo ?? note.slideUnpitchTo ?? null) !== null;
    if (note.mute || dt > PRESS_AHEAD || dt < -Math.max(note.sustain, slides ? 0.25 : 0.12) || ((chord?.highDensity || heldFrom !== null) && !pressed)) continue;
    if (bent && bent.note !== note && !pressed) continue; // the next note on a string being bent shows once it is let down
    if (pressed && lit.has(`${note.string}:${note.fret}`)) continue;
    if (pressed) lit.add(`${note.string}:${note.fret}`);
    outlined.add(`${note.string}:${note.fret}`);
    const { a, open, x: from } = spot(note), x = slideX(note, from, -dt), y = boardY(note), c = color(note.string);
    const hw = (open ? (a.width - 0.2) / 2 : 0.32) + 2 / k0, hh = (open ? 0.1 : 0.36) * gap + 2 / k0; // 2px bigger than the gem shape
    gem(x, y, 0, hw, hh);
    if (pressed) {
      glow(!ringing(note, dt), c, 14);
      g.fillStyle = c;
      fill();
      glow(false);
      g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      g.lineWidth = 1.5;
      stroke();
    } else {
      const near = (1 - dt / PRESS_AHEAD) ** 2;
      g.globalAlpha = 0.35 * near;
      g.fillStyle = c;
      fill();
      g.globalAlpha = 0.25 + 0.75 * near;
      g.strokeStyle = c;
      g.lineWidth = 2.2;
      stroke();
    }
    const finger = note.finger ?? (chord?.fingers?.[note.string] >= 0 ? chord.fingers[note.string] : null);
    if (!open && finger !== null) label(finger === 0 ? 'T' : String(finger), x, y, 0, gap * 0.55, pressed ? t.ink : t.text, 800);
    if (!open && bendPeak(note) > 0) { // a bend: a chevron on top of its target, down for a pre-bend let down
      const [px, py] = P(x, y + hh, 0), letDown = note.bendCurve?.[0]?.[1] > 0 && note.bendCurve.at(-1)[1] < bendPeak(note);
      chevron(g, px, py - (letDown ? 0.14 : 0.05) * k0, 0.17 * k0 * stretch, 0.085 * k0, letDown ? 1 : -1, '#ffffff', alpha(t.ink, 0.9));
    }
    g.globalAlpha = 1;
  }
  // An arpeggio's shape, from a moment before it's taken until it's let go: every spot it frets outlined with its finger, so
  // the whole shape is held, not only the note being played (those light up above)
  for (const shape of arr.handShapes ?? []) {
    if (!shape.arpeggio || shape.startTime - now > PRESS_AHEAD || shape.endTime <= now) continue;
    g.globalAlpha = 0.3 + 0.5 * Math.min(1, 1 - (shape.startTime - now) / PRESS_AHEAD) ** 2;
    shape.frets.forEach((fret, s) => {
      if (fret <= 0 || s >= n || outlined.has(`${s}:${fret}`)) return;
      const x = fret - 0.5, y = ys(s), finger = shape.fingers[s];
      gem(x, y, 0, 0.32 + 2 / k0, 0.36 * gap + 2 / k0);
      g.strokeStyle = color(s);
      g.lineWidth = 2.2;
      stroke();
      if (finger >= 0) label(finger === 0 ? 'T' : String(finger), x, y, 0, gap * 0.55, t.text, 800);
    });
    g.globalAlpha = 1;
  }
  lap('targets');

  // Fret numbers under the board: the hand position in the accent colour, the inlay frets bold. Nothing is behind them to
  // need a halo, and outlined text is slow to draw
  for (let f = 1; f <= LAST_FRET; f++) {
    const on = f >= here.fret && f < here.fret + here.width, inlay = INLAYS.includes(f);
    label(String(f), f - 0.5, boardLo - 0.3, 0, on ? 0.3 : inlay ? 0.26 : 0.2, on ? t.accent : inlay ? t.inlay : t.numOff, on || inlay ? 800 : 500, 'center', false);
  }

  // The chord name, big, always to the right of the hand position: the chord sounding now, for as long as it sounds,
  // or else the next one, fading in over the second before it
  const spans = chordSpans(arr), current = spans.findLast((sp) => sp.time <= now && now < sp.end + 0.3);
  const upcoming = current ? null : spans.find((sp) => sp.time > now && sp.time - now < 1.2);
  const named = current ?? upcoming;
  if (named) {
    const [rx, ly] = P(cam.right + 0.4, boardHi + 0.5, 0);
    const font = `700 52px ${t.num}`;
    g.font = font;
    g.globalAlpha = current ? 1 : Math.max(0.35, 1 - (named.time - now) / 1.2);
    g.fillStyle = t.text;
    g.textAlign = 'left';
    g.fillText(named.name, Math.min(rx, W - 24 - measure(g, font, named.name).width), ly); // kept on screen at the top of the neck
    g.globalAlpha = 1;
  }
  lap('labels');
}
