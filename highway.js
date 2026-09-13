// Canvas note highway: the projection from design/gen.mjs, fed by a song arrangement.
// Drawn in a virtual space 900px tall, scaled to the canvas height.

const VH = 900, H0 = 60, D = 1400, V = 1400, CAMH = 740, BASE = 30, SPAN = 180, LOOK = 2.6;
const WHOLE_SONG = [{ time: -Infinity, endTime: Infinity, fret: 1, width: 4 }];

const alpha = (color, a) =>
  color.startsWith('#') ? `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, ${a})` : color;

const anchorAt = (anchors, time) => {
  let found = anchors[0];
  for (const a of anchors) {
    if (a.time > time) break;
    found = a;
  }
  return found;
};

const bendLabel = (b) => (b < 0.5 ? '¼' : b === 0.5 ? '½' : b === 1 ? 'full' : b % 1 ? `${Math.floor(b)}½` : String(b));

// cam: { fret, width, at } kept by the caller so the camera eases between frames
export function drawHighway(canvas, arr, now, t, cam) {
  const dpr = devicePixelRatio || 1, cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const g = canvas.getContext('2d'), k = ch / VH, W = cw / k, B = dpr * k;
  g.setTransform(B, 0, 0, B, 0, 0);
  g.clearRect(0, 0, W, VH);
  if (!arr) return;

  const anchors = arr.anchors.length ? arr.anchors : WHOLE_SONG;
  const target = anchorAt(anchors, now + 0.3), clock = performance.now();
  const ease = 1 - Math.exp(-Math.min(clock - cam.at, 100) / 250);
  cam.at = clock;
  cam.fret += (target.fret - cam.fret) * ease;
  cam.width += (target.width - cam.width) * ease;

  const camX = cam.fret - 1 + cam.width / 2; // in fret-wire units
  const FW = Math.min(210, W / (cam.width + 4.5));
  const sc = (dt) => D / (Math.max(dt, -0.3) * V + D);
  const X = (x, dt) => W / 2 + (x - camX) * FW * sc(dt);
  const Y = (y, dt) => H0 + (CAMH - y) * sc(dt);
  const n = arr.strings, GAP = Math.min(48, SPAN / Math.max(1, n - 1));
  const ys = (s) => BASE + (n - 1 - s) * GAP; // lowest string on top, like looking down at the guitar
  const y0 = Y(0, 0), yF = Y(0, LOOK);
  const reach = (dt) => W / 2 / (FW * sc(dt));
  const lo = Math.max(0, Math.floor(camX - reach(LOOK))), hi = Math.min(24, Math.ceil(camX + reach(LOOK)));
  const color = (s) => t.str[s % t.str.length];

  const glow = (on, c, blur = 10) => {
    g.shadowBlur = on ? blur * B : 0;
    g.shadowColor = on ? c : 'transparent';
  };
  const line = (x1, y1, x2, y2) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  const quad = (a, b, d0, d1, y) => {
    g.beginPath();
    g.moveTo(X(a, d0), Y(y, d0));
    g.lineTo(X(b, d0), Y(y, d0));
    g.lineTo(X(b, d1), Y(y, d1));
    g.lineTo(X(a, d1), Y(y, d1));
    g.fill();
  };
  const text = (str, x, y, size, fill, weight) => {
    g.font = `${weight} ${size}px ${t.num}`;
    g.fillStyle = fill;
    g.fillText(str, x, y);
  };
  const fade = (c, a0, a1) => {
    const grad = g.createLinearGradient(0, y0, 0, yF);
    grad.addColorStop(0, alpha(c, a0));
    grad.addColorStop(1, alpha(c, a1));
    return grad;
  };
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineCap = 'round';

  // Floor, lit anchor zones, lanes, beat and bar lines
  const floor = g.createLinearGradient(0, y0, 0, yF);
  floor.addColorStop(0, t.floor0);
  floor.addColorStop(1, alpha(t.floor1, 0));
  g.fillStyle = floor;
  quad(lo - 1, hi + 1, 0, LOOK, 0);
  g.fillStyle = fade(t.anchorFill, t.anchorOpacity, 0);
  for (const a of anchors) if (a.endTime > now && a.time < now + LOOK) quad(a.fret - 1, a.fret - 1 + a.width, Math.max(0, a.time - now), Math.min(LOOK, a.endTime - now), 0);

  const here = anchorAt(anchors, now);
  const edge = (w) => w === here.fret - 1 || w === here.fret - 1 + here.width;
  const lane = fade(t.lane, 0.9, 0.12);
  for (let w = lo; w <= hi; w++) {
    g.strokeStyle = edge(w) ? alpha(t.anchorLane, 0.8) : lane;
    g.lineWidth = edge(w) ? t.anchorLaneW : t.laneW;
    line(X(w, 0), y0, X(w, LOOK), yF);
  }
  for (const beat of arr.beats) {
    const dt = beat.time - now;
    if (dt < 0) continue;
    if (dt > LOOK) break;
    const bar = beat.measure >= 0;
    g.strokeStyle = bar ? t.measure : t.beat;
    g.lineWidth = Math.max(1, (bar ? 3.5 : 2) * sc(dt));
    line(X(lo, dt), Y(0, dt), X(hi, dt), Y(0, dt));
  }

  // Strike line: fret posts and strings
  const postTop = Y(ys(0) + GAP * 0.8, 0);
  for (let w = Math.max(0, Math.floor(camX - reach(0))); w <= Math.ceil(camX + reach(0)); w++) {
    const e = edge(w), pw = e ? t.anchorPostW : t.postW;
    glow(e && t.glow, t.anchorPost);
    g.fillStyle = e ? t.anchorPost : t.post;
    g.beginPath();
    g.roundRect(X(w, 0) - pw / 2, postTop, pw, y0 + 8 - postTop, pw / 2);
    g.fill();
  }
  for (let s = 0; s < n; s++) {
    glow(t.glow, color(s), 6);
    g.strokeStyle = alpha(color(s), 0.85);
    g.lineWidth = t.strW;
    line(0, Y(ys(s), 0), W, Y(ys(s), 0));
  }
  glow(false);

  const visible = [];
  for (const note of arr.notes) {
    if (note.time > now + LOOK) break;
    if (note.time + Math.max(note.sustain, 0.15) >= now - 0.05) visible.push(note);
  }

  // Sounding notes light their string across the anchor, with a flash where they landed
  for (const note of visible) {
    const dt = note.time - now;
    if (dt > 0 || -dt > Math.max(note.sustain, 0.15) || note.mute) continue;
    const c = color(note.string), y = Y(ys(note.string), 0), a = anchorAt(anchors, note.time);
    glow(t.gem !== 'solid', c);
    g.strokeStyle = c;
    g.lineWidth = t.strW + 3;
    line(X(a.fret - 1.4, 0), y, X(a.fret - 1 + a.width + 0.4, 0), y);
    glow(false);
    if (-dt < 0.2 && t.gem !== 'solid') {
      const x = X(note.fret ? note.fret - 0.5 : a.fret - 1 + a.width / 2, 0);
      g.save();
      g.translate(x, y);
      g.scale(1, 44 / 120); // squash a round glow into a flat ellipse
      const flash = g.createRadialGradient(0, 0, 0, 0, 0, 120);
      flash.addColorStop(0, alpha(t.flash, 0.85 * (1 + dt / 0.2)));
      flash.addColorStop(1, alpha(t.flash, 0));
      g.fillStyle = flash;
      g.beginPath();
      g.arc(0, 0, 120, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  // Notes, far to near
  const boxed = new Set();
  for (let i = visible.length - 1; i >= 0; i--) {
    const note = visible[i], dt = note.time - now, s = sc(dt);
    const c = note.missed ? '#5a606b' : color(note.string);
    const chord = note.chord === null || note.chord === undefined ? null : arr.chords[note.chord];
    const a = anchorAt(anchors, note.time), open = note.fret === 0;
    const x = open ? a.fret - 1 + a.width / 2 : note.fret - 0.5;
    const cx = X(x, dt), cy = Y(ys(note.string), dt);

    const slide = note.slideTo ?? note.slideUnpitchTo;
    const tail = Math.max(note.sustain, slide === null || slide === undefined ? 0 : 0.25);
    if (tail > 0.2 && dt + tail > 0 && !chord?.highDensity) {
      const d0 = Math.max(dt, 0), y = ys(note.string);
      glow(t.glow, c, 8);
      if (slide === null || slide === undefined) {
        g.fillStyle = alpha(c, 0.4);
        quad(x - 0.06, x + 0.06, d0, Math.min(dt + tail, LOOK), y);
      } else {
        const from = x + (slide - 0.5 - x) * ((d0 - dt) / tail);
        g.strokeStyle = c;
        g.lineWidth = Math.max(2, 6 * sc(d0));
        g.setLineDash(note.slideTo === null ? [8, 8] : []);
        line(X(from, d0), Y(y, d0), X(slide - 0.5, dt + tail), Y(y, dt + tail));
        g.setLineDash([]);
      }
      glow(false);
    }
    if (dt < -0.15) continue;
    g.globalAlpha = dt < 0 ? Math.max(0, 1 + dt / 0.15) : 1;

    if (chord && !boxed.has(note.chord)) {
      boxed.add(note.chord);
      const members = chord.notes.map((j) => arr.notes[j]);
      const frets = members.filter((m) => m.fret > 0).map((m) => m.fret);
      const strings = members.map((m) => m.string);
      const left = X(frets.length ? Math.min(...frets) - 1 : a.fret - 1, dt) + 5 * s;
      const right = X(frets.length ? Math.max(...frets) : a.fret - 1 + a.width, dt) - 5 * s;
      const top = Y(ys(Math.min(...strings)) + GAP * 0.62, dt), bottom = Y(ys(Math.max(...strings)) - GAP * 0.62, dt);
      const alphaNow = g.globalAlpha;
      if (chord.highDensity) g.globalAlpha = alphaNow * 0.55;
      g.strokeStyle = t.chordBox;
      g.fillStyle = t.chordFill;
      g.lineWidth = Math.max(1, 2.5 * s);
      g.setLineDash(chord.highDensity ? [10 * s, 7 * s] : []);
      g.beginPath();
      g.roundRect(left, top, right - left, bottom - top, 8 * s);
      g.fill();
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = alphaNow;
      if (s > 0.4 && !chord.highDensity && chord.name) text(chord.name, (left + right) / 2, top - 16 * s, 26 * s, t.text, 600); // far labels only pile up
      if (s > 0.4 && chord.palmMute) text('PM', right + 20 * s, top + 10 * s, 18 * s, t.muted, 700);
    }
    if (chord?.highDensity) { // repeated chord: the outline says it all
      g.globalAlpha = 1;
      continue;
    }

    const w = open ? (a.width - 0.2) * FW * s : 0.5 * FW * s;
    const h = (open ? 0.34 : 0.8) * GAP * s;
    if (!open) {
      if (t.gem === 'pill') {
        g.fillStyle = 'rgba(0, 0, 0, 0.35)';
        g.beginPath();
        g.ellipse(cx, Y(0, dt), 0.24 * FW * s, Math.max(2, 7 * s), 0, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = alpha(c, t.gem === 'pill' ? 0.25 : 0.5);
      g.lineWidth = Math.max(1, 2 * s);
      line(cx, cy, cx, Y(0, dt));
    }

    g.beginPath();
    if (note.harmonic) {
      g.moveTo(cx, cy - h * 0.8);
      g.lineTo(cx + h, cy);
      g.lineTo(cx, cy + h * 0.8);
      g.lineTo(cx - h, cy);
      g.closePath();
    } else g.roundRect(cx - w / 2, cy - h / 2, w, h, t.gem === 'pill' ? h / 2 : t.gem === 'solid' ? 3 * s : 7 * s);
    const fill = note.hit ? '#ffffff' : c;
    if (t.gem === 'glass') {
      glow(s > 0.3 || note.hit, fill, 12);
      g.fillStyle = alpha(fill, note.hit ? 0.9 : 0.22);
      g.fill();
      g.strokeStyle = fill;
      g.lineWidth = Math.max(1.2, 4 * s);
      g.stroke();
      glow(false);
      if (!open && !note.harmonic) {
        g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        g.lineWidth = Math.max(0.6, 1.2 * s);
        g.beginPath();
        g.roundRect(cx - w / 2 + 4 * s, cy - h / 2 + 4 * s, w - 8 * s, h - 8 * s, 4 * s);
        g.stroke();
      }
    } else {
      g.fillStyle = fill;
      g.fill();
      if (t.gem === 'solid') {
        g.strokeStyle = t.ink;
        g.lineWidth = Math.max(1, 2 * s);
        g.stroke();
      }
    }

    if (!open) {
      const label = note.mute ? '×' : note.harmonic ? `<${note.fret}>` : String(note.fret);
      if (t.number === 'floor' && dt > 0.08) { if (!chord || s > 0.55) text(label, cx, Y(0, dt) + 18 * s, 26 * s, c, 600); }
      else if (20 * s >= 7) text(label, cx, cy + s, 20 * s, t.gem === 'glass' ? t.text : t.ink, 700);
    }
    const mark = note.hammerOn ? 'H' : note.pullOff ? 'P' : note.tap ? 'T' : '';
    if (mark) text(mark, cx, cy - h / 2 - 14 * s, 22 * s, t.text, 700);
    if (note.bend) {
      const base = cy - h / 2 - (mark ? 30 : 6) * s, tip = base - 34 * s;
      g.strokeStyle = t.text;
      g.lineWidth = Math.max(1.2, 3 * s);
      g.beginPath();
      g.moveTo(cx, base);
      g.lineTo(cx, tip);
      g.moveTo(cx - 7 * s, tip + 8 * s);
      g.lineTo(cx, tip);
      g.lineTo(cx + 7 * s, tip + 8 * s);
      g.stroke();
      g.textAlign = 'left';
      text(bendLabel(note.bend), cx + 10 * s, tip + 4 * s, 18 * s, t.text, 600);
      g.textAlign = 'center';
    }
    if (note.palmMute && !chord) text('PM', cx + w / 2 + 20 * s, cy - h / 2, 16 * s, t.muted, 700);
    g.globalAlpha = 1;
  }

  // Fret numbers under the strings
  for (let f = Math.max(1, Math.ceil(camX - reach(0) + 0.5)); f <= Math.floor(camX + reach(0) + 0.5); f++) {
    const on = f >= here.fret && f < here.fret + here.width;
    text(String(f), X(f - 0.5, 0), 856, on ? 32 : 26, on ? t.numOn : t.numOff, on ? 700 : 500);
  }
}
