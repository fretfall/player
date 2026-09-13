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
  const ys = (s) => (n - 1 - s) * gap; // lowest string on top, like looking down at the guitar
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

  // Stems, under every frame and gem: a line from each note down to the floor, where its fret number goes (or, when
  // the number sits on the gem, a tick across the lane)
  for (const note of visible) {
    const dt = note.time - now, z = Z(dt), { a, open, x, y } = spot(note);
    if (open || note.repeat || dt < -0.15 || chordOf(note)?.highDensity || Math.abs(P(x, y, z)[0] - W / 2) > W / 2 + 200) continue;
    const c = note.missed ? '#5a606b' : color(note.string);
    g.globalAlpha = dt < 0 ? Math.max(0, 1 + dt / 0.15) : Math.min(1, (LOOK - dt) / 0.4);
    g.strokeStyle = alpha(c, 0.75);
    g.lineWidth = 1.5;
    line3([x, y - 0.42 * gap, z], [x, floor, z]);
    if (t.number !== 'floor') {
      g.lineWidth = 3;
      line3([x - 0.3, floor, z], [x + 0.3, floor, z]);
    }
  }
  g.globalAlpha = 1;

  // Tails, under every gem: sustains trail back along their string and fade into the distance; slides drift
  // along the neck, bends climb toward the next string, vibrato wobbles, tremolo jitters
  for (const note of visible) {
    const dt = note.time - now, chord = chordOf(note), slide = note.slideTo ?? note.slideUnpitchTo ?? null;
    const tail = slide === null ? note.sustain : Math.max(note.sustain, 0.25);
    if (tail <= 0.2 || dt + tail <= 0 || chord?.highDensity) continue;
    const { a, open, x, y } = spot(note), c = note.missed ? '#5a606b' : color(note.string);
    const hw = open ? (a.width - 0.2) / 2 : 0.34, hh = (open ? 0.12 : 0.42) * gap;
    const d0 = Math.max(dt, 0), d1 = Math.min(dt + tail, LOOK), steps = 18;
    const along = (d) => {
      const p = (d - dt) / tail;
      return [
        x + (slide === null ? 0 : (slide - 0.5 - x) * p) + (note.vibrato ? Math.sin(p * 38) * 0.07 : 0) + (note.tremolo ? (Math.round(p * 70) % 2 ? 0.06 : -0.06) : 0),
        y + (note.bend ? Math.min(1, p * 4) * note.bend * gap : 0),
        Z(d),
      ];
    };
    const spine = Array.from({ length: steps + 1 }, (_, j) => along(d0 + ((d1 - d0) * j) / steps));
    glow(t.glow, c, 6);
    g.fillStyle = fade(c, 0.6, 0.08);
    path([...spine.map(([px, py, pz]) => [px - 0.08, py, pz]), ...spine.slice().reverse().map(([px, py, pz]) => [px + 0.08, py, pz])]);
    g.fill();
    glow(false);
    if (slide !== null || note.bend || note.vibrato || note.tremolo) { // a bright spine traces the shape
      g.strokeStyle = fade('#ffffff', 0.6, 0.1);
      g.lineWidth = 1.5;
      path(spine, false);
      g.stroke();
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
  }

  // Notes, far to near: gems riding at their string's height
  const boxed = new Set();
  let nextChord = null;
  for (let i = visible.length - 1; i >= 0; i--) {
    const note = visible[i], dt = note.time - now, z = Z(dt);
    const chord = chordOf(note), { a, open, x, y } = spot(note);
    if (chord?.name && dt > 0) nextChord = chord; // far to near, so the last one kept is the nearest
    const muted = note.mute || chord?.fretHandMute, palm = note.palmMute || chord?.palmMute;
    const c = note.missed ? '#5a606b' : color(note.string);
    const hw = open ? (a.width - 0.2) / 2 : 0.34, hh = (open ? 0.12 : 0.42) * gap;
    const slide = note.slideTo ?? note.slideUnpitchTo ?? null;

    if (dt < -0.15) continue;
    g.globalAlpha = dt < 0 ? Math.max(0, 1 + dt / 0.15) : Math.min(1, (LOOK - dt) / 0.4); // fade in at the far end, out once played

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
      const before = arr.chords[note.chord - 1], changed = !before || note.time - before.time > 1 || before.name !== chord.name;
      if (z > NEAR && chord.name && !chord.highDensity && changed) label(chord.name, l - 0.12, boardHi / 2, z, 0.34, t.text, 600, 'right'); // name it once per change
    }

    const [cx, cy, k] = P(x, y, z);
    if (cx < -200 || cx > W + 200) {
      g.globalAlpha = 1;
      continue;
    }
    if (note.repeat || chord?.highDensity) { // the same note or chord again: just outlines on its beat, lit as they arrive
      const near = z < NEAR;
      g.globalAlpha *= near ? 0.9 : 0.4;
      g.strokeStyle = c;
      g.lineWidth = near ? 2 : 1.5;
      glow(t.glow && near, c, 8);
      gem(x, y, z, hw, hh);
      g.stroke();
      glow(false);
      g.globalAlpha = 1;
      continue;
    }
    if (!open && t.number === 'floor' && z > 1.75) label(note.harmonic || note.harmonicPinch ? `<${note.fret}>` : String(note.fret), x, floor, z - 0.3, 0.26, c);

    const fill = note.hit ? '#ffffff' : c;
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

    // Technique marks stack upwards above the block
    let above = cy - hh * k - 0.18 * k;
    const mark = note.hammerOn ? 'H' : note.pullOff ? 'P' : note.tap ? 'T' : note.harmonicPinch ? 'PH' : '';
    g.strokeStyle = t.text;
    g.lineWidth = Math.max(1.2, 0.04 * k);
    if (mark && 0.28 * k >= 8) {
      g.font = `700 ${0.28 * k}px ${t.num}`;
      g.textAlign = 'center';
      g.fillStyle = t.text;
      g.fillText(mark, cx, above);
      above -= 0.3 * k;
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
    if (note.bend) {
      const base = above + 0.12 * k, tip = base - 0.36 * k;
      line2(g, cx, base, cx, tip);
      line2(g, cx - 0.08 * k, tip + 0.09 * k, cx, tip);
      line2(g, cx + 0.08 * k, tip + 0.09 * k, cx, tip);
      g.font = `600 ${Math.max(9, 0.22 * k)}px ${t.num}`;
      g.textAlign = 'left';
      g.fillStyle = t.text;
      g.fillText(bendLabel(note.bend), cx + 0.12 * k, tip + 0.05 * k);
    }
    g.globalAlpha = 1;
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

  // The chord to play next, big, just beside the hand position on whichever side has more room
  if (nextChord && nextChord.time - now < 1.2) {
    const [lx, ly] = P(cam.left - 0.4, boardHi + 0.5, 0), [rx] = P(cam.right + 0.4, boardHi + 0.5, 0), onLeft = lx > W - rx;
    g.globalAlpha = Math.min(1, Math.max(0.4, 1 - (nextChord.time - now) / 1.2));
    g.font = `700 52px ${t.num}`;
    g.fillStyle = t.text;
    g.textAlign = onLeft ? 'right' : 'left';
    g.fillText(nextChord.name, onLeft ? lx : rx, ly);
    g.globalAlpha = 1;
  }
}
