// Canvas note highway in 3D. A perspective camera looks down the highway from just behind the strike line,
// so the strings there read as a fretboard and notes rise out of the distance. World units are fret widths;
// time runs along z. Drawn in a virtual space 900px tall, scaled to the canvas height.

const VH = 900, HIGHWAY = 84, NOTE_SPEED = 28; // fret widths of highway ahead of the strike line; fret widths a note travels per second

// Seconds of notes in view for the drawing distance and note speed settings: faster notes are further apart and in
// view for less time, a longer drawing distance shows more of them
export const lookAhead = (view) => (HIGHWAY * (view.drawDistance ?? 1)) / (NOTE_SPEED * (view.noteSpeed ?? 1));
const GAP = 0.34, LAST_FRET = 24, PRESS_AHEAD = 1.2; // string spacing; how early a note's spot on the board lights up
// Fret widths from the board where arriving notes and frames light up: a distance, not a time, so everything lights
// at the same place on the highway whatever the note speed
const NEAR = 5;
const FRAME_AHEAD = 3, MIN_SPAN = 8;
const WHOLE_SONG = [{ time: -Infinity, endTime: Infinity, fret: 1, width: 4 }];
const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]; // where a fretboard has position dots

const alpha = (color, a) =>
  color.startsWith('#') ? `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, ${a})` : color;
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

// Steps at share p of a [share, steps] curve (a bend or the whammy bar over the note), straight between points
const shapeAt = (points, p) => {
  if (!points?.length) return 0;
  const i = points.findIndex(([q]) => q >= p);
  if (i <= 0) return points[i < 0 ? points.length - 1 : 0][1];
  const [[q0, s0], [q1, s1]] = [points[i - 1], points[i]];
  return s0 + (s1 - s0) * (q1 > q0 ? (p - q0) / (q1 - q0) : 1);
};
const pitchAt = (note, p) => (note.bendCurve ? shapeAt(note.bendCurve, p) : note.bend ? Math.min(1, p * 4) * note.bend : 0) + shapeAt(note.whammy, p);
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
  return (arr.chordSpans = spans);
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
  const n = arr.strings, gap = Math.min(0.5, (5 * GAP) / Math.max(1, n - 1)), stack = gap * (n - 1);
  const ys = (s) => (t.stringOrder === 'high' ? s : n - 1 - s) * gap; // lowest string on top, like looking down at the guitar, or highest on top, like tab
  const SPEED = NOTE_SPEED * (t.noteSpeed ?? 1), LOOK = lookAhead(t);
  const boardLo = -0.22, boardHi = stack + 0.22, floor = boardLo - 0.06, far = LOOK * SPEED;
  const Z = (dt) => Math.max(0, dt) * SPEED; // played notes stay on the board while they fade: the camera is right behind it
  const color = (s) => t.str[s % t.str.length];

  // Camera just behind and above the strike line, looking far down the highway, as in Tabizera: notes come up
  // out of the distance and the lanes run to a vanishing point under the header. The view angle swings it around
  // the strike line, lower for a flatter view, higher to look down on the highway (45°: behind and above equally).
  // The lens is shifted so the strings sit in the same place on screen however far the camera zooms out
  const span = cam.span, focus = [cam.center, stack / 2, 0], angle = ((t.viewAngle ?? 30) * Math.PI) / 180, reach = 0.6 * Math.SQRT2 * span;
  const eye = [focus[0], stack + reach * Math.sin(angle), -reach * Math.cos(angle)];
  const fwd = unit(sub([focus[0], 0, 2.2 * span], eye)), right = unit(cross([0, 1, 0], fwd)), up = cross(fwd, right);
  const focal = (Math.min(W * 0.88, VH * 1.05) * dot(sub(focus, eye), fwd)) / span; // wide screens show more neck, not bigger frets
  let shiftX = 0, shiftY = 0;
  const P = (x, y, z) => { // → [screen x, screen y, pixels per world unit there]
    const d = [x - eye[0], y - eye[1], z - eye[2]], k = focal / Math.max(0.05, dot(d, fwd));
    return [W / 2 + dot(d, right) * k + shiftX, VH / 2 - dot(d, up) * k + shiftY, k];
  };
  const [fx, fy, k0] = P(...focus);
  [shiftX, shiftY] = [W / 2 - fx, VH * 0.81 - fy]; // the board low on screen, the highway's far end still under the header

  const glow = (on, c, blur = 10) => {
    g.shadowBlur = on ? blur * B : 0;
    g.shadowColor = on ? c : 'transparent';
  };
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
    g.stroke();
  };
  const gem = (x, y, z, hw, hh) => path([[x - hw, y - hh, z], [x + hw, y - hh, z], [x + hw, y + hh, z], [x - hw, y + hh, z]]); // a gem's square face
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
  // size in world units at the strike line. Text on the floor shrinks with distance far more gently than the
  // highway (as in Tabizera), so the numbers of notes a few seconds away stay readable; ink text sits on a gem
  // and keeps to its size
  const label = (str, x, y, z, size, fill, weight = 700, align = 'center') => {
    const onGem = fill === t.ink, [px, py, k] = P(x, y, z), px2 = size * (onGem ? k : Math.sqrt(k * k0));
    if (px2 < (onGem ? 1 : 8) || px < -60 || px > W + 60) return; // numbers on gems fade in from the far end, however small
    g.font = `${weight} ${px2}px ${t.num}`;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    const ink = g.measureText(str), cy = py + (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2; // centre the digits themselves, not the font's em box
    if (!onGem) { // a dark halo lifts numbers off the lines behind them
      g.lineWidth = px2 * 0.2;
      g.strokeStyle = alpha(t.ink, 0.9);
      g.strokeText(str, px, cy);
    }
    g.fillStyle = fill;
    g.fillText(str, px, cy);
    g.textBaseline = 'middle';
  };
  const [, nearY] = P(focus[0], floor, 0), [, farY] = P(focus[0], floor, far);
  const fade = (c, a0, a1) => {
    const grad = g.createLinearGradient(0, nearY, 0, farY);
    grad.addColorStop(0, alpha(c, a0));
    grad.addColorStop(1, alpha(c, a1));
    return grad;
  };
  g.textBaseline = 'middle';
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Floor and grid: a lane for every fret wire, a line for every beat
  const floorFill = g.createLinearGradient(0, nearY, 0, farY);
  floorFill.addColorStop(0, t.floor0);
  floorFill.addColorStop(1, alpha(t.floor1, 0));
  g.fillStyle = floorFill;
  path([[-60, floor, 0], [LAST_FRET + 60, floor, 0], [LAST_FRET + 60, floor, far], [-60, floor, far]]); // wider than any view
  g.fill();
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
    g.fill();
    g.strokeStyle = fade(t.anchorLane, 0.55, 0.04);
    g.lineWidth = t.anchorLaneW * 0.6;
    for (const x of [l, r]) line3([x, floor, z0], [x, floor, z1]);
    if (i && a.time > now) line3([l, floor, z0], [r, floor, z0]);
    // outside the band so it can't be read as a note to play
    if (i && a.time > now + 0.3) label(String(a.fret), l - 0.2, floor, z0, 0.3, t.anchorLane, 700, 'right');
  });

  // Bar markings on the floor at the left of the view, where they happen (meter, key, tempo, feel, repeats, endings,
  // jumps, ottava, free text like "pizz."), and crescendo and diminuendo hairpins beside them
  const markX = cam.center - cam.span / 2 + 0.4, moments = new Map();
  for (const m of arr.markers ?? []) { // everything at the same moment goes on one line, so nothing overlaps
    const dt = m.time - now;
    if (dt < 0 || dt > LOOK) continue;
    const key = Math.round(m.time * 100);
    if (!moments.has(key)) moments.set(key, { dt, texts: [] });
    if (!moments.get(key).texts.includes(m.text)) moments.get(key).texts.push(m.text);
  }
  for (const { dt, texts } of moments.values()) { // right-aligned beside the hand position, past its fret number
    const z = Z(dt), [px, py, k] = P(anchorAt(anchors, now + dt).fret - 2.4, floor, z), size = 0.3 * Math.sqrt(k * k0), text = texts.join('  ·  ');
    g.globalAlpha = Math.min(1, (LOOK - dt) / 0.4);
    g.font = `700 ${size}px ${t.num}`;
    const right = Math.max(px, 24 + g.measureText(text).width); // kept on screen
    g.textAlign = 'right';
    g.lineWidth = size * 0.2;
    g.strokeStyle = alpha(t.ink, 0.9);
    g.strokeText(text, right, py);
    g.fillStyle = t.accent;
    g.fillText(text, right, py);
  }
  g.strokeStyle = t.text;
  g.lineWidth = 2;
  for (const h of arr.hairpins ?? []) {
    if (h.endTime < now || h.time > now + LOOK) continue;
    const from = (h.time - now) * SPEED, to = (h.endTime - now) * SPEED, z0 = Math.max(0, from), z1 = Math.min(far, to);
    const spread = (zz) => (h.kind === 'cresc' ? (zz - from) / (to - from || 1) : 1 - (zz - from) / (to - from || 1)) * 0.2; // half the opening
    g.globalAlpha = 0.8;
    for (const side of [-1, 1]) line3([markX + 1.4 + side * spread(z0), floor, z0], [markX + 1.4 + side * spread(z1), floor, z1]);
  }
  g.globalAlpha = 1;

  // The fingerboard at the strike line. Everything on the board comes after it, and the notes come after the
  // strings, so nothing hides them
  g.fillStyle = t.board;
  path([[0, boardLo, 0], [LAST_FRET + 0.6, boardLo, 0], [LAST_FRET + 0.6, boardHi, 0], [0, boardHi, 0]]);
  g.fill();
  g.fillStyle = alpha(t.anchorFill, 0.16);
  path([[cam.left, boardLo, 0], [cam.right, boardLo, 0], [cam.right, boardHi, 0], [cam.left, boardHi, 0]]);
  g.fill();
  g.fillStyle = t.inlayDot;
  for (const f of INLAYS) for (const y of f % 12 ? [stack / 2] : [stack * 0.25, stack * 0.75]) {
    const [px, py, k] = P(f - 0.5, y, 0);
    g.beginPath();
    g.ellipse(px, py, 0.1 * k, 0.08 * k, 0, 0, Math.PI * 2);
    g.fill();
  }

  const visible = [];
  for (const note of arr.notes) {
    if (note.time > now + LOOK) break;
    const lasts = Math.max(note.sustain, (note.slideTo ?? note.slideUnpitchTo ?? null) === null ? 0 : 0.25, 0.15);
    if (note.time + lasts >= now - 0.05) visible.push(note);
  }

  const chordOf = (note) => (note.chord === null || note.chord === undefined ? null : arr.chords[note.chord]);
  const spot = (note) => { // x along the neck (an open string spans the hand position), y at its string's height
    const a = anchorAt(anchors, note.time), open = note.fret === 0;
    return { a, open, x: open ? a.fret - 1 + a.width / 2 : note.fret - 0.5, y: ys(note.string) };
  };

  // The strike line: metal fret wires, the nut, the hand position's posts, and the strings
  const [, wireTop] = P(focus[0], boardHi, 0), [, wireBottom] = P(focus[0], boardLo, 0);
  const metal = g.createLinearGradient(0, wireTop, 0, wireBottom); // lit from above, like fret wire
  metal.addColorStop(0, alpha(t.anchorPost, 0.75));
  metal.addColorStop(1, t.post);
  g.strokeStyle = metal;
  g.lineWidth = Math.max(1.5, 0.05 * k0);
  for (let w = 1; w <= LAST_FRET; w++) line3([w, boardLo - 0.04, 0], [w, boardHi + 0.04, 0]);
  g.strokeStyle = t.nut;
  g.lineWidth = Math.max(3, 0.12 * k0);
  line3([0, boardLo - 0.06, 0], [0, boardHi + 0.06, 0]);
  glow(t.glow, t.anchorPost, 12);
  g.strokeStyle = t.anchorPost;
  g.lineWidth = Math.max(3, 0.07 * k0);
  for (const x of [cam.left, cam.right]) line3([x, boardLo - 0.14, 0], [x, boardHi + 0.14, 0]);
  glow(false);
  for (let s = 0; s < n; s++) {
    const width = t.strW * (0.7 + 0.14 * (n - 1 - s)); // wound strings are thicker
    glow(t.glow, color(s), 3);
    g.strokeStyle = alpha(color(s), 0.9);
    g.lineWidth = width;
    line3([-0.6, ys(s), 0], [LAST_FRET + 0.6, ys(s), 0]);
    glow(false);
    g.strokeStyle = 'rgba(255, 255, 255, 0.25)'; // the light catching the string
    g.lineWidth = Math.max(0.6, width * 0.3);
    line3([-0.6, ys(s) + 0.012, 0], [LAST_FRET + 0.6, ys(s) + 0.012, 0]);
  }

  // Sounding notes light their whole string, with a flash where they landed
  for (const note of visible) {
    const dt = note.time - now;
    if (dt > 0 || -dt > Math.max(note.sustain, 0.15) || note.mute) continue;
    const c = color(note.string), y = ys(note.string);
    glow(true, c, 10);
    g.strokeStyle = c;
    g.lineWidth = t.strW + 3;
    line3([-0.6, y, 0], [LAST_FRET + 0.6, y, 0]);
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
      g.fill();
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
    g.stroke();
  }
  glow(false);

  // Under every frame and gem: a white line on the floor under each note, marking its beat (chords get theirs under the
  // frame), and a stem from each fretted note down to it
  for (const note of visible) {
    const dt = note.time - now, z = Z(dt), chord = chordOf(note), { a, open, x, y } = spot(note);
    if (dt < -0.15 || Math.abs(P(x, y, z)[0] - W / 2) > W / 2 + 200) continue;
    const hw = open ? (a.width - 0.2) / 2 : 0.34;
    g.globalAlpha = dt < 0 ? Math.max(0, 1 + dt / 0.15) : Math.min(1, (LOOK - dt) / 0.4);
    if (!chord) {
      g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      g.lineWidth = 2;
      line3([x - hw, floor, z], [x + hw, floor, z]);
    }
    if (open) continue;
    g.strokeStyle = alpha(note.missed ? '#5a606b' : color(note.string), note.repeat || chord?.highDensity ? 0.35 : 0.75); // fainter under a repeat
    g.lineWidth = 1.5;
    line3([x, y - 0.42 * gap, z], [x, floor, z]);
  }
  g.globalAlpha = 1;

  // Under every gem: slide ramps into and out of notes, slurs from a hammer-on or pull-off back to its note, ties,
  // and tails. A tail is a ribbon along its string that fades into the distance; its shape is the technique: a slide
  // drifts along the neck, a bend or the whammy bar rises and falls with its curve, vibrato is an even wave, tremolo
  // picking jitters, let ring is dashed
  const arc = (from, to, bulge) => { // a curve between two points on the highway, rising by bulge in the middle
    const points = Array.from({ length: 13 }, (_, j) => {
      const u = j / 12;
      return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u + Math.sin(Math.PI * u) * bulge, from[2] + (to[2] - from[2]) * u];
    });
    path(points, false);
    g.stroke();
  };
  for (const [i, note] of visible.entries()) {
    const dt = note.time - now, chord = chordOf(note), slide = note.slideTo ?? note.slideUnpitchTo ?? null;
    const { a, open, x, y } = spot(note), c = note.missed ? '#5a606b' : color(note.string), z = Z(dt);
    const hw = (open ? (a.width - 0.2) / 2 : 0.34) * (note.grace ? 0.6 : 1), hh = (open ? 0.12 : 0.42) * gap * (note.grace ? 0.6 : 1);
    if (dt > -0.15 && !chord?.highDensity && !note.repeat) {
      g.globalAlpha = Math.min(1, (LOOK - dt) / 0.4);
      g.strokeStyle = c;
      g.lineWidth = 2;
      g.setLineDash([4, 4]);
      if (note.slideIn) line3([x + (note.slideIn === 'below' ? -1.4 : 1.4), y - hh, Math.max(0, z - 1)], [x + (note.slideIn === 'below' ? -hw : hw), y, z]);
      if (note.slideOut) line3([x + (note.slideOut === 'up' ? hw : -hw), y, z], [x + (note.slideOut === 'up' ? 1.4 : -1.4), y - hh, z + 1]);
      g.setLineDash([]);
      if (typeof note.slurFrom === 'number') { // a solid arc back to the note a hammer-on or pull-off comes from
        const from = arr.notes[note.slurFrom], p = spot(from);
        arc([p.x, p.y + hh, Z(from.time - now)], [x, y + hh, z], gap * 0.9);
      }
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
    if (tail <= 0.2 || dt + tail <= 0 || (chord && !moves)) continue; // chords sustain without trails: their frames already show the beats
    const d0 = Math.max(dt, 0), d1 = Math.min(dt + tail, LOOK), steps = Math.min(400, Math.max(12, Math.ceil((d1 - d0) * SPEED * 8)));
    const along = (d) => {
      const p = Math.min(1, Math.max(0, (d - dt) / tail)), zz = Z(d), glide = p * p * (3 - 2 * p);
      const wave = note.vibrato ? Math.sin((zz / 1.6) * Math.PI * 2) * (note.vibratoWide ? 0.13 : 0.07) : 0; // a steady wavelength along the highway
      const jitter = note.tremolo ? (Math.floor(zz / 0.3) % 2 ? 0.05 : -0.05) : 0;
      const pitch = pitchAt(note, p); // a bend swings the trail up the neck as the pitch rises and back as it falls
      return [x + (slide === null ? 0 : (slide - 0.5 - x) * glide) + wave + jitter + pitch * 0.6, y + pitch * gap * 0.4, zz];
    };
    const spine = Array.from({ length: steps + 1 }, (_, j) => along(d0 + ((d1 - d0) * j) / steps));
    // Trails ride at string height, so the camera shows them past the floor line of whatever follows; cut them off at
    // the line of the next chord, the next note on the same string, or any later note lying across the trail
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
    g.save();
    if (next) {
      const [, lineY] = P(x, floor, Z(next.time - now));
      g.beginPath();
      g.rect(-W, lineY, 3 * W, VH);
      g.clip();
    }
    if (open && !chord) { // an open string sounds as a lane as wide as the hand position, edged in its colour
      g.fillStyle = fade(c, note.letRing ? 0.14 : 0.26, 0.03);
      path([...spine.map(([px, py, pz]) => [px - hw, py, pz]), ...spine.slice().reverse().map(([px, py, pz]) => [px + hw, py, pz])]);
      g.fill();
      glow(t.glow && !note.letRing, c, 6);
      g.strokeStyle = fade(c, 0.95, 0.08);
      g.lineWidth = 2.5;
      g.setLineDash(note.letRing ? [7, 6] : []);
      for (const side of [-hw, hw]) {
        path(spine.map(([px, py, pz]) => [px + side, py, pz]), false);
        g.stroke();
      }
      g.setLineDash([]);
      glow(false);
    } else {
      glow(t.glow && !note.letRing, c, 6);
      g.fillStyle = fade(c, note.letRing ? 0.3 : 0.6, 0.06);
      path([...spine.map(([px, py, pz]) => [px - 0.09, py, pz]), ...spine.slice().reverse().map(([px, py, pz]) => [px + 0.09, py, pz])]);
      g.fill();
      glow(false);
    }
    if (note.letRing || slide !== null || note.bend || note.whammy || note.vibrato || note.tremolo) { // a bright spine traces the shape, dashed while ringing
      g.strokeStyle = fade(note.letRing ? c : '#ffffff', 0.7, 0.1);
      g.lineWidth = note.letRing ? 2 : 1.5;
      g.setLineDash(note.letRing ? [7, 6] : []);
      path(spine, false);
      g.stroke();
      g.setLineDash([]);
    }
    if (slide !== null) { // where the slide ends
      const [ex, ey, ez] = along(dt + tail);
      g.strokeStyle = c;
      g.lineWidth = 2;
      g.setLineDash(note.slideTo === null ? [5, 4] : []);
      gem(ex, ey, ez, hw, hh);
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  }

  // Notes, far to near: gems riding at their string's height
  const boxed = new Set();
  for (let i = visible.length - 1; i >= 0; i--) {
    const note = visible[i], dt = note.time - now, z = Z(dt);
    const chord = chordOf(note), { a, open, x, y } = spot(note);
    const muted = note.mute || chord?.fretHandMute, palm = note.palmMute || chord?.palmMute;
    const c = note.missed ? '#5a606b' : color(note.string);
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
      const weight = near ? 0.65 : chord.highDensity ? 0.18 : 0.5;
      path([[l, floor, z], [r, floor, z], [r, boardHi, z], [l, boardHi, z]]);
      if (t.frames === 'gradient') { // a panel glowing up from the floor, fading out above the top string
        const [, bottom] = P(l, floor, z), [, top] = P(l, boardHi, z), panel = g.createLinearGradient(0, bottom, 0, top);
        panel.addColorStop(0, alpha(near ? t.anchorLane : t.anchorFill, weight * 0.6));
        panel.addColorStop(1, alpha(near ? t.anchorLane : t.anchorFill, 0));
        g.fillStyle = panel;
        g.fill();
      } else {
        g.globalAlpha = shown * weight;
        if (!chord.highDensity) {
          g.fillStyle = t.chordFill;
          g.fill();
        }
        g.strokeStyle = near ? t.anchorLane : t.chordBox;
        g.lineWidth = near || !chord.highDensity ? 1.5 : 1.2;
        glow(t.glow && near, t.anchorLane, 8);
        g.stroke();
        glow(false);
      }
      g.globalAlpha = shown; // a white line under every frame, box or gradient, marks the moment to play it
      g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      g.lineWidth = 2;
      line3([l, floor, z], [r, floor, z]);
      if (chord.highDensity && (chord.palmMute || chord.fretHandMute)) xMark((l + r) / 2, floor + gap * 0.4, z, 0.14, gap * 0.3);
      if (chord.barre) { // one finger across several strings: a bar over them at its fret
        const bx = chord.barre.fret - 0.5;
        g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        g.lineWidth = Math.max(3, 0.1 * P(bx, stack / 2, z)[2]);
        const [y0, y1] = [ys(chord.barre.from), ys(chord.barre.to)].sort((p, q) => p - q);
        line3([bx, y0 - gap * 0.4, z], [bx, y1 + gap * 0.4, z]);
        label(chord.barre.half ? '½B' : 'B', bx, boardHi + 0.12, z, 0.22, t.text);
      }
      if (chord.strum || chord.roll) { // strum or roll beside the frame: down runs from the low strings to the high ones
        const ax = l - 0.25, lowSide = ys(0) > ys(n - 1) ? boardHi - 0.1 : floor + 0.15, highSide = lowSide > stack / 2 ? floor + 0.15 : boardHi - 0.1;
        const [from, to] = (chord.strum ?? chord.roll) === 'down' ? [lowSide, highSide] : [highSide, lowSide];
        g.strokeStyle = t.text;
        g.lineWidth = 2;
        if (chord.roll) path(Array.from({ length: 17 }, (_, j) => [ax + Math.sin((j / 16) * Math.PI * 6) * 0.06, from + ((to - from) * j) / 16, z]), false); // rolled: a wavy arrow
        else path([[ax, from, z], [ax, to, z]], false);
        g.stroke();
        const head = to < from ? 0.14 : -0.14;
        line3([ax - 0.08, to + head, z], [ax, to, z]);
        line3([ax + 0.08, to + head, z], [ax, to, z]);
      }
      const before = arr.chords[note.chord - 1], changed = !before || note.time - before.time > 1 || before.name !== chord.name;
      if (z > NEAR && chord.name && !chord.highDensity && changed) label(chord.name, l - 0.12, boardHi / 2, z, 0.34, t.text, 600, 'right'); // name it once per change
    }

    const [cx, cy, k] = P(x, y, z);
    if (cx < -200 || cx > W + 200) {
      g.globalAlpha = 1;
      continue;
    }
    const repeated = note.repeat || chord?.highDensity, fill = note.hit ? '#ffffff' : c;
    const legs = (color, width) => { // an open string's bar stands on the floor at both ends of the hand position
      g.strokeStyle = color;
      g.lineWidth = width;
      line3([x - hw, floor, z], [x - hw, y, z]);
      line3([x + hw, floor, z], [x + hw, y, z]);
    };
    if (repeated) { // the same note or chord again: just outlines on its beat, lit as they arrive
      const near = z < NEAR;
      g.globalAlpha *= near ? 0.9 : 0.4;
      g.strokeStyle = c;
      g.lineWidth = near ? 2 : 1.5;
      glow(t.glow && near, c, 8);
      gem(x, y, z, hw, hh);
      g.stroke();
      if (open && !chord) legs(c, 1.5);
      glow(false);
      if ((muted || palm) && t.repeatMarks !== 'hide') { // its mute, greyed out
        g.strokeStyle = t.muted;
        g.lineWidth = 2;
        xMark(x, y, z, open ? gap * 0.4 : hw * 0.8, open ? gap * 0.4 : hh * 1.1);
      }
      g.globalAlpha = faded;
    } else {
      if (!open && t.number === 'floor' && z > 1.75) {
        const fret = note.harmonic || note.harmonicPinch ? `<${note.fret}>` : note.ghost ? `(${note.fret})` : String(note.fret);
        label(fret, x, floor, z - 0.55, note.grace ? 0.18 : 0.26, c); // just in front of the note's line
      }
      if (note.dynamicLabel) label(note.dynamicLabel, x - 0.6, floor, z, 0.3, t.text, 'italic 700', 'right'); // where the dynamic changes

      if (open && !chord) { // a faint wall under the bar, between its legs (chords keep their frame instead)
        g.fillStyle = alpha(fill, 0.12);
        path([[x - hw, floor, z], [x + hw, floor, z], [x + hw, y, z], [x - hw, y, z]]);
        g.fill();
        legs(fill, 3);
      }
      if (note.ghost) g.globalAlpha = faded * 0.5;
      if (muted || palm) { // mutes an X, in a hollow gem for a palm mute (open strings keep their bar)
        glow(t.glow && z < NEAR, fill, 8);
        g.strokeStyle = fill;
        if (palm || open) {
          g.fillStyle = alpha(t.ink, 0.7);
          g.lineWidth = 2;
          gem(x, y, z, hw, hh);
          g.fill();
          g.stroke();
        }
        g.lineWidth = palm ? 2 : 3;
        if (open) xMark(x, y, z, gap * 0.4, gap * 0.4);
        else xMark(x, y, z, hw * (palm ? 0.9 : 0.8), hh * (palm ? 0.9 : 1.3));
        glow(false);
      } else if (t.gem === 'pill') {
        const [lx, ly] = P(x - hw, y + hh, z), [rx, ry] = P(x + hw, y - hh, z);
        g.fillStyle = fill;
        g.beginPath();
        g.roundRect(lx, ly, rx - lx, ry - ly, (ry - ly) / 2);
        g.fill();
      } else { // a square gem: a thin box (about 3px deep at the board) with a lit top, lit from above
        const harmonic = note.harmonic || note.harmonicPinch, depth = 0.04;
        if (!harmonic) { // top and sides first; the face covers whichever side faces away
          for (const [side, shade] of [
            [[[x - hw, y + hh, z], [x + hw, y + hh, z], [x + hw, y + hh, z + depth], [x - hw, y + hh, z + depth]], 'rgba(255, 255, 255, 0.35)'],
            [[[x - hw, y - hh, z], [x - hw, y + hh, z], [x - hw, y + hh, z + depth], [x - hw, y - hh, z + depth]], 'rgba(0, 0, 0, 0.4)'],
            [[[x + hw, y - hh, z], [x + hw, y + hh, z], [x + hw, y + hh, z + depth], [x + hw, y - hh, z + depth]], 'rgba(0, 0, 0, 0.4)'],
          ]) {
            path(side);
            g.fillStyle = fill;
            g.fill();
            g.fillStyle = shade;
            g.fill();
          }
        }
        glow(t.glow && z < NEAR, fill, 8);
        g.fillStyle = fill;
        if (harmonic) path([[x, y + hh * 1.3, z], [x + hw * 0.8, y, z], [x, y - hh * 1.3, z], [x - hw * 0.8, y, z]]);
        else gem(x, y, z, hw, hh);
        g.fill();
        glow(false);
        const [, ty] = P(x, y + hh, z), [, by] = P(x, y - hh, z), shine = g.createLinearGradient(0, ty, 0, by);
        shine.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        shine.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
        shine.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
        g.fillStyle = shine;
        g.fill();
        g.strokeStyle = t.gem === 'solid' ? t.ink : 'rgba(255, 255, 255, 0.6)';
        g.lineWidth = t.gem === 'solid' ? 2 : 1;
        g.stroke();
      }

      if (!open && !muted) {
        const finger = note.finger ?? (chord?.fingers?.[note.string] >= 0 ? chord.fingers[note.string] : null);
        const onGem = t.number === 'on' ? String(note.fret) : finger !== null ? (finger === 0 ? 'T' : String(finger)) : '';
        if (onGem) { // shown from the far end, fading in until 40% of the way along the drawing distance
          const shown = g.globalAlpha;
          g.globalAlpha = shown * Math.min(1, Math.max(0, (1 - dt / LOOK) / 0.4));
          label(onGem, x, y, z - 0.01, gap * 0.62, palm ? t.text : t.ink, 700); // a hollow gem is dark inside
          g.globalAlpha = shown;
        }
      }
    }
    if (repeated && t.repeatMarks === 'hide') {
      g.globalAlpha = 1;
      continue;
    }

    const ink = repeated ? t.muted : t.text; // marks on a repeated note are greyed out
    g.globalAlpha = faded * (repeated ? 0.8 : 1) * Math.min(1, Math.max(0, (1 - dt / LOOK) / 0.4)); // fading in from the far end
    if (note.ghost) { // ghost note: dimmed, in brackets
      const [lx] = P(x - hw, y, z), [rx] = P(x + hw, y, z), r = hh * k * 1.5;
      g.strokeStyle = repeated ? ink : c;
      g.lineWidth = Math.max(1.2, 0.035 * k);
      g.beginPath();
      g.arc(lx + r * 0.35, cy, r, Math.PI * 0.7, Math.PI * 1.3);
      g.stroke();
      g.beginPath();
      g.arc(rx - r * 0.35, cy, r, -Math.PI * 0.3, Math.PI * 0.3);
      g.stroke();
    }
    if (note.grace) { // grace note: small, with a slash
      g.strokeStyle = ink;
      g.lineWidth = Math.max(1, 0.03 * k);
      line2(g, cx - hw * k * 1.2, cy + hh * k * 1.4, cx + hw * k * 1.2, cy - hh * k * 1.4);
    }
    if (note.showString) { // the string's number in a circle, to the left of the note
      const [lx] = P(x - hw, y, z), r = 0.12 * k, sx = lx - r - 0.06 * k;
      g.strokeStyle = g.fillStyle = repeated ? ink : c;
      g.lineWidth = Math.max(1, 0.025 * k);
      g.beginPath();
      g.arc(sx, cy, r, 0, Math.PI * 2);
      g.stroke();
      g.font = `700 ${0.15 * k}px ${t.num}`;
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
      g.font = `${style} ${size * k}px ${t.num}`;
      g.fillText(word, cx, above);
      above -= (size + 0.04) * k;
    };
    if (note.staccato) { // staccato: a dot
      g.beginPath();
      g.arc(cx, above + 0.04 * k, Math.max(1.5, 0.045 * k), 0, Math.PI * 2);
      g.fill();
      above -= 0.16 * k;
    }
    if (note.accent) write({ heavy: '^', tenuto: '–' }[note.accent] ?? '>', 0.3);
    const words = [
      note.hammerOn ? 'H' : note.pullOff ? 'P' : '',
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
      g.stroke();
      above -= (0.16 + (note.vibratoWide ? 0.06 : 0)) * k;
    }
    if (note.pick) { // pick stroke: ⊓ down, V up
      const w = 0.09 * k, h = 0.13 * k;
      g.beginPath();
      if (note.pick === 'down') [[-w, h / 2], [-w, -h / 2], [w, -h / 2], [w, h / 2]].forEach(([dx, dy], j) => g[j ? 'lineTo' : 'moveTo'](cx + dx, above + dy));
      else [[-w, -h / 2], [0, h / 2], [w, -h / 2]].forEach(([dx, dy], j) => g[j ? 'lineTo' : 'moveTo'](cx + dx, above + dy));
      g.stroke();
      above -= 0.22 * k;
    }
    if (note.fermata) { // fermata: an arch over a dot
      g.beginPath();
      g.arc(cx, above + 0.06 * k, 0.14 * k, Math.PI, 0);
      g.stroke();
      g.beginPath();
      g.arc(cx, above + 0.02 * k, Math.max(1.5, 0.03 * k), 0, Math.PI * 2);
      g.fill();
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
    const bendPeak = Math.max(note.bend || 0, ...(note.bendCurve ?? []).map(([, v]) => v));
    if (bendPeak > 0) { // bend: an arrow up, then back down for a release; "pre" when it is bent before it is played
      const pre = note.bendCurve?.[0]?.[1] > 0, release = (note.bendCurve?.length ?? 0) > 1 && note.bendCurve.at(-1)[1] < bendPeak;
      const base = above + 0.12 * k, tip = base - 0.36 * k, rx = cx + 0.14 * k;
      line2(g, cx, base, cx, tip);
      line2(g, cx - 0.08 * k, tip + 0.09 * k, cx, tip);
      line2(g, cx + 0.08 * k, tip + 0.09 * k, cx, tip);
      if (release) {
        line2(g, rx, tip, rx, base);
        line2(g, rx - 0.06 * k, base - 0.08 * k, rx, base);
        line2(g, rx + 0.06 * k, base - 0.08 * k, rx, base);
      }
      g.font = `600 ${0.22 * k}px ${t.num}`;
      g.textAlign = 'left';
      g.fillText(`${pre ? 'pre ' : ''}${bendLabel(bendPeak)}`, cx + (release ? 0.24 : 0.12) * k, tip + 0.05 * k);
    }
    g.globalAlpha = 1;
  }

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
  // and light up while they sound
  for (const note of visible) {
    const dt = note.time - now, chord = chordOf(note), pressed = dt <= 0.06;
    if (note.mute || dt > PRESS_AHEAD || dt < -Math.max(note.sustain, 0.12) || (chord?.highDensity && !pressed)) continue;
    const { a, open, x, y } = spot(note), c = note.missed ? '#5a606b' : color(note.string);
    const hw = (open ? (a.width - 0.2) / 2 : 0.32) + 2 / k0, hh = (open ? 0.1 : 0.36) * gap + 2 / k0; // 2px bigger than the gem shape
    gem(x, y, 0, hw, hh);
    if (pressed) {
      glow(true, c, 14);
      g.fillStyle = note.hit ? '#ffffff' : c;
      g.fill();
      glow(false);
      g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      g.lineWidth = 1.5;
      g.stroke();
    } else {
      const near = (1 - dt / PRESS_AHEAD) ** 2;
      g.globalAlpha = 0.35 * near;
      g.fillStyle = c;
      g.fill();
      g.globalAlpha = 0.25 + 0.75 * near;
      g.strokeStyle = c;
      g.lineWidth = 2.2;
      g.stroke();
    }
    const finger = note.finger ?? (chord?.fingers?.[note.string] >= 0 ? chord.fingers[note.string] : null);
    if (!open && finger !== null) label(finger === 0 ? 'T' : String(finger), x, y, 0, gap * 0.55, pressed ? t.ink : t.text, 800);
    g.globalAlpha = 1;
  }

  // Fret numbers under the board: the hand position in the accent colour, the inlay frets bold
  for (let f = 1; f <= LAST_FRET; f++) {
    const on = f >= here.fret && f < here.fret + here.width, inlay = INLAYS.includes(f);
    label(String(f), f - 0.5, boardLo - 0.3, 0, on ? 0.3 : inlay ? 0.26 : 0.2, on ? t.accent : inlay ? t.inlay : t.numOff, on || inlay ? 800 : 500);
  }

  // The chord name, big, always to the right of the hand position: the chord sounding now, for as long as it sounds,
  // or else the next one, fading in over the second before it
  const spans = chordSpans(arr), current = spans.findLast((sp) => sp.time <= now && now < sp.end + 0.3);
  const upcoming = current ? null : spans.find((sp) => sp.time > now && sp.time - now < 1.2);
  const named = current ?? upcoming;
  if (named) {
    const [rx, ly] = P(cam.right + 0.4, boardHi + 0.5, 0);
    g.font = `700 52px ${t.num}`;
    g.globalAlpha = current ? 1 : Math.max(0.35, 1 - (named.time - now) / 1.2);
    g.fillStyle = t.text;
    g.textAlign = 'left';
    g.fillText(named.name, Math.min(rx, W - 24 - g.measureText(named.name).width), ly); // kept on screen at the top of the neck
    g.globalAlpha = 1;
  }
}
