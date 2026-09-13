// Renders the highway directions as static SVG scenes into .dc.html artboards.
// The projection here is the one the canvas renderer will use, so the mockups stay honest.
// node design/gen.mjs [previewDir]
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STYLE, theme } from '../themes.js';

const W = 1440, H = 900;
const H0 = 60, D = 1400, V = 1400, CAMH = 740, BASE = 30, GAP = 36, FW = 170, CAMX = 6, LOOK = 2.6;
const sc = (dt) => D / (dt * V + D); // perspective scale, 1 at the strike line
const X = (x, dt) => W / 2 + (x - CAMX) * FW * sc(dt); // x in fret-wire units
const Y = (y, dt) => H0 + (CAMH - y) * sc(dt); // y in px above the floor
const ys = (k) => BASE + (5 - k) * GAP; // string 0 = low E, highest
const r = (n) => Math.round(n * 10) / 10;
const ANCHOR = [4, 8]; // fret wires around the lit zone (frets 5-8)

// Sample phrase, invented for the mockup
const NOTES = [
  { dt: 0, k: 0, f: 5, sus: 0.4, chord: 'A5', hit: true },
  { dt: 0, k: 1, f: 7, sus: 0.4, chord: 'A5', hit: true },
  { dt: 0.47, k: 2, f: 5 },
  { dt: 0.6, k: 2, f: 7, tech: 'H' },
  { dt: 0.85, k: 3, f: 6, slideTo: 8, sus: 0.28 },
  { dt: 1.15, k: 4, f: 8, bend: 'full', sus: 0.3 },
  { dt: 1.45, k: 1, f: 0 },
  { dt: 1.72, k: 0, f: 5, chord: 'A5', ghost: true },
  { dt: 1.72, k: 1, f: 7, chord: 'A5', ghost: true },
  { dt: 2.0, k: 0, f: 5, chord: 'A5', pm: true },
  { dt: 2.0, k: 1, f: 7, chord: 'A5', pm: true },
  { dt: 2.25, k: 5, f: 7, harmonic: true },
  { dt: 2.38, k: 2, f: 7 },
  { dt: 2.5, k: 2, f: 5, tech: 'P' },
];
const MEASURES = [0.2, 1.4];
const BEATS = [0.5, 0.8, 1.1, 1.7, 2.0, 2.3];
const PHRASES = [[6, 0], [10, 0.35], [8, 0.3], [12, 0.55], [9, 0.6], [11, 0.7], [10, 0.62], [12, 0.8], [8, 0.5], [10, 0.66], [9, 0.45], [7, 0.25], [12, 0.85], [10, 0.7], [11, 0.6], [14, 1], [9, 0.55], [5, 0]];
const NOW_PHRASE = 6;

const ARTBOARDS = {
  Main: DEFAULT_STYLE,
  Stage: { look: 'stage', colors: 'stage', fonts: 'stage' },
  Chart: { look: 'chart', colors: 'chart', fonts: 'chart' },
  Workbench: { look: 'workbench', colors: 'workbench', fonts: 'workbench' },
};

function highway(t) {
  const o = [];
  const y0 = Y(0, 0), yF = Y(0, LOOK);
  const glow = t.glow ? ' filter="url(#glow)"' : '';
  o.push(`<defs>
<linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="${r(y0)}" x2="0" y2="${r(yF)}"><stop offset="0" stop-color="${t.lane}" stop-opacity="0.9"></stop><stop offset="1" stop-color="${t.lane}" stop-opacity="0.12"></stop></linearGradient>
<linearGradient id="floor" gradientUnits="userSpaceOnUse" x1="0" y1="${r(y0)}" x2="0" y2="${r(yF)}"><stop offset="0" stop-color="${t.floor0}"></stop><stop offset="1" stop-color="${t.floor1}" stop-opacity="0"></stop></linearGradient>
<linearGradient id="anchor" gradientUnits="userSpaceOnUse" x1="0" y1="${r(y0)}" x2="0" y2="${r(yF)}"><stop offset="0" stop-color="${t.anchorFill}" stop-opacity="${t.anchorOpacity}"></stop><stop offset="1" stop-color="${t.anchorFill}" stop-opacity="0"></stop></linearGradient>
<radialGradient id="flash"><stop offset="0" stop-color="${t.flash}" stop-opacity="0.85"></stop><stop offset="1" stop-color="${t.flash}" stop-opacity="0"></stop></radialGradient>
<filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="4" result="b"></feGaussianBlur><feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter>
</defs>`);
  const quad = (a, b, d0, d1, y, fill) =>
    `<polygon points="${r(X(a, d0))},${r(Y(y, d0))} ${r(X(b, d0))},${r(Y(y, d0))} ${r(X(b, d1))},${r(Y(y, d1))} ${r(X(a, d1))},${r(Y(y, d1))}" fill="${fill}"></polygon>`;

  // Floor, lit anchor zone, lanes, beat and measure lines
  o.push(quad(-2, 14, 0, LOOK, 0, 'url(#floor)'));
  o.push(quad(ANCHOR[0], ANCHOR[1], 0, LOOK, 0, 'url(#anchor)'));
  for (let w = 0; w <= 12; w++) {
    const a = w === ANCHOR[0] || w === ANCHOR[1];
    o.push(`<line x1="${r(X(w, 0))}" y1="${r(y0)}" x2="${r(X(w, LOOK))}" y2="${r(yF)}" stroke="${a ? t.anchorLane : 'url(#fade)'}" stroke-width="${a ? t.anchorLaneW : t.laneW}"${a ? ` stroke-opacity="0.8"` : ''}></line>`);
  }
  for (const dt of BEATS) o.push(`<line x1="${r(X(0.5, dt))}" y1="${r(Y(0, dt))}" x2="${r(X(11.5, dt))}" y2="${r(Y(0, dt))}" stroke="${t.beat}" stroke-width="${r(Math.max(1, 2 * sc(dt)))}"></line>`);
  for (const dt of MEASURES) o.push(`<line x1="${r(X(0.5, dt))}" y1="${r(Y(0, dt))}" x2="${r(X(11.5, dt))}" y2="${r(Y(0, dt))}" stroke="${t.measure}" stroke-width="${r(Math.max(1, 3.5 * sc(dt)))}"></line>`);

  // Strike line: fret posts and the six strings
  const postTop = Y(ys(0) + GAP * 0.8, 0);
  for (let w = 2; w <= 10; w++) {
    const a = w === ANCHOR[0] || w === ANCHOR[1];
    const pw = a ? t.anchorPostW : t.postW;
    o.push(`<rect x="${r(X(w, 0) - pw / 2)}" y="${r(postTop)}" width="${pw}" height="${r(y0 + 8 - postTop)}" rx="${pw / 2}" fill="${a ? t.anchorPost : t.post}"${a && t.glow ? ' filter="url(#glow)"' : ''}></rect>`);
  }
  for (let k = 0; k < 6; k++) o.push(`<line x1="0" y1="${r(Y(ys(k), 0))}" x2="${W}" y2="${r(Y(ys(k), 0))}" stroke="${t.str[k]}" stroke-width="${t.strW}" stroke-opacity="0.85"${glow}></line>`);

  // Notes, far to near, grouped by moment
  const groups = [...new Set(NOTES.map((n) => n.dt))].sort((a, b) => b - a).map((dt) => NOTES.filter((n) => n.dt === dt));
  for (const g of groups) {
    const dt = g[0].dt, s = sc(dt);
    for (const n of g) {
      const cx = n.f === 0 ? X(CAMX, dt) : X(n.f - 0.5, dt), cy = Y(ys(n.k), dt), c = t.str[n.k];
      if (n.sus && !n.slideTo && !n.ghost) o.push(quad(n.f - 0.54, n.f - 0.46, dt, dt + n.sus, ys(n.k), c).replace('></polygon>', ` fill-opacity="0.4"${glow}></polygon>`));
      if (n.slideTo) o.push(`<line x1="${r(cx)}" y1="${r(cy)}" x2="${r(X(n.slideTo - 0.5, dt + n.sus))}" y2="${r(Y(ys(n.k), dt + n.sus))}" stroke="${c}" stroke-width="${r(Math.max(2, 6 * s))}" stroke-linecap="round"${glow}></line>`);
      if (n.f > 0 && !n.ghost) {
        if (t.gem === 'pill') o.push(`<ellipse cx="${r(cx)}" cy="${r(Y(0, dt))}" rx="${r(0.24 * FW * s)}" ry="${r(Math.max(2, 7 * s))}" fill="#000000" fill-opacity="0.35"></ellipse>`);
        o.push(`<line x1="${r(cx)}" y1="${r(cy)}" x2="${r(cx)}" y2="${r(Y(0, dt))}" stroke="${c}" stroke-opacity="${t.gem === 'pill' ? 0.25 : 0.5}" stroke-width="${r(Math.max(1, 2 * s))}"></line>`);
      }
    }
    const chord = g[0].chord;
    if (chord) {
      const frets = g.map((n) => n.f), ks = g.map((n) => n.k);
      const left = X(Math.min(...frets) - 1, dt) + 5 * s, right = X(Math.max(...frets), dt) - 5 * s;
      const top = Y(ys(Math.min(...ks)) + GAP * 0.62, dt), bottom = Y(ys(Math.max(...ks)) - GAP * 0.62, dt);
      const ghost = g[0].ghost;
      o.push(`<rect x="${r(left)}" y="${r(top)}" width="${r(right - left)}" height="${r(bottom - top)}" rx="${r(8 * s)}" fill="${t.chordFill}" stroke="${t.chordBox}" stroke-width="${r(Math.max(1, 2.5 * s))}"${ghost ? ` stroke-dasharray="${r(10 * s)} ${r(7 * s)}" stroke-opacity="0.55"` : ''}></rect>`);
      if (!ghost) o.push(`<text x="${r((left + right) / 2)}" y="${r(top - 10 * s)}" text-anchor="middle" font-family="${t.num}" font-weight="600" font-size="${r(26 * s)}" fill="${t.text}">${chord}</text>`);
      if (g[0].pm) o.push(`<text x="${r(right + 8 * s)}" y="${r(top + 18 * s)}" font-family="${t.num}" font-weight="700" font-size="${r(18 * s)}" fill="${t.muted}">PM</text>`);
      if (ghost) continue;
    }
    if (g[0].hit) {
      for (const n of g) {
        const cy = Y(ys(n.k), 0);
        o.push(`<line x1="${r(X(ANCHOR[0] - 0.4, 0))}" y1="${r(cy)}" x2="${r(X(ANCHOR[1] + 0.4, 0))}" y2="${r(cy)}" stroke="${t.str[n.k]}" stroke-width="${t.strW + 3}" stroke-linecap="round"${t.gem === 'solid' ? '' : ' filter="url(#glow)"'}></line>`);
        if (t.gem !== 'solid') o.push(`<ellipse cx="${r(X(n.f - 0.5, 0))}" cy="${r(cy)}" rx="120" ry="44" fill="url(#flash)"></ellipse>`);
      }
    }
    for (const n of g) {
      const cx = n.f === 0 ? X(CAMX, dt) : X(n.f - 0.5, dt), cy = Y(ys(n.k), dt), c = t.str[n.k];
      const open = n.f === 0;
      const w = open ? (ANCHOR[1] - ANCHOR[0] - 0.2) * FW * s : 0.5 * FW * s;
      const h = open ? 0.34 * GAP * s : 0.8 * GAP * s;
      const style =
        t.gem === 'glass' ? `fill="${c}" fill-opacity="0.22" stroke="${c}" stroke-width="${r(Math.max(1.2, 4 * s))}"${s > 0.3 ? glow : ''}`
        : t.gem === 'solid' ? `fill="${c}" stroke="${t.ink}" stroke-width="${r(Math.max(1, 2 * s))}"`
        : `fill="${c}"`;
      const rx = t.gem === 'pill' ? h / 2 : t.gem === 'solid' ? 3 * s : 7 * s;
      if (n.harmonic) o.push(`<polygon points="${r(cx)},${r(cy - h * 0.8)} ${r(cx + h)},${r(cy)} ${r(cx)},${r(cy + h * 0.8)} ${r(cx - h)},${r(cy)}" ${style}></polygon>`);
      else o.push(`<rect x="${r(cx - w / 2)}" y="${r(cy - h / 2)}" width="${r(w)}" height="${r(h)}" rx="${r(rx)}" ${style}></rect>`);
      if (t.gem === 'glass' && !open && !n.harmonic) o.push(`<rect x="${r(cx - w / 2 + 4 * s)}" y="${r(cy - h / 2 + 4 * s)}" width="${r(w - 8 * s)}" height="${r(h - 8 * s)}" rx="${r(4 * s)}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${r(Math.max(0.6, 1.2 * s))}"></rect>`);
      if (n.hit && t.gem === 'solid') o.push(`<rect x="${r(cx - w / 2 - 7)}" y="${r(cy - h / 2 - 7)}" width="${r(w + 14)}" height="${r(h + 14)}" rx="6" fill="none" stroke="${t.accent}" stroke-width="2.5"></rect>`);
      if (!open) {
        const label = n.harmonic ? `&lt;${n.f}&gt;` : n.f;
        if (t.number === 'floor' && !n.hit) o.push(`<text x="${r(cx)}" y="${r(Y(0, dt) + 24 * s)}" text-anchor="middle" font-family="${t.num}" font-weight="600" font-size="${r(26 * s)}" fill="${c}">${label}</text>`);
        else if (18 * s >= 7) o.push(`<text x="${r(cx)}" y="${r(cy + 7 * s)}" text-anchor="middle" font-family="${t.num}" font-weight="700" font-size="${r(20 * s)}" fill="${t.ink}">${label}</text>`);
      }
      if (n.tech) o.push(`<text x="${r(cx)}" y="${r(cy - h / 2 - 9 * s)}" text-anchor="middle" font-family="${t.num}" font-weight="700" font-size="${r(22 * s)}" fill="${t.text}">${n.tech}</text>`);
      if (n.bend) {
        const top = cy - h / 2 - 6 * s, tip = top - 34 * s;
        o.push(`<path d="M${r(cx)} ${r(top)} L${r(cx)} ${r(tip)} M${r(cx - 7 * s)} ${r(tip + 8 * s)} L${r(cx)} ${r(tip)} L${r(cx + 7 * s)} ${r(tip + 8 * s)}" fill="none" stroke="${t.text}" stroke-width="${r(Math.max(1.2, 3 * s))}" stroke-linecap="round" stroke-linejoin="round"></path>`);
        o.push(`<text x="${r(cx + 12 * s)}" y="${r(tip + 6 * s)}" font-family="${t.num}" font-weight="600" font-size="${r(18 * s)}" fill="${t.text}">${n.bend}</text>`);
      }
    }
  }

  // Fret numbers under the strings
  for (let f = 3; f <= 10; f++) {
    const a = f > ANCHOR[0] && f <= ANCHOR[1];
    o.push(`<text x="${r(X(f - 0.5, 0))}" y="866" text-anchor="middle" font-family="${t.num}" font-weight="${a ? 700 : 500}" font-size="${a ? 32 : 26}" fill="${a ? t.numOn : t.numOff}">${f}</text>`);
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position: absolute; left: 0px; top: 0px;">${o.join('\n')}</svg>`;
}

const ICONS = {
  minus: '<path d="M5 10h10"></path>',
  plus: '<path d="M10 5v10M5 10h10"></path>',
  loop: '<path d="M13.5 3.5l2.5 2.5-2.5 2.5"></path><path d="M4 10V9a3 3 0 0 1 3-3h9"></path><path d="M6.5 16.5L4 14l2.5-2.5"></path><path d="M16 10v1a3 3 0 0 1-3 3H4"></path>',
  mic: '<rect x="7" y="2.5" width="6" height="10" rx="3"></rect><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"></path>',
  pause: '<path d="M7.5 4.5v11M12.5 4.5v11"></path>',
  open: '<path d="M3 6.5V15a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15V8.5A1.5 1.5 0 0 0 15.5 7H10L8.5 5H4.5A1.5 1.5 0 0 0 3 6.5z"></path>',
  settings: '<path d="M3.5 6h8M15.5 6h1M3.5 14h2M9.5 14h7"></path><circle cx="13.5" cy="6" r="2"></circle><circle cx="7.5" cy="14" r="2"></circle>',
};
const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

function overlay(t) {
  const iconButton = (name) =>
    `<div style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: ${t.chip}; border: 1px solid ${t.chipBorder}; color: ${t.text};">${icon(name)}</div>`;
  const total = PHRASES.reduce((a, [w]) => a + w, 0);
  const played = PHRASES.slice(0, NOW_PHRASE).reduce((a, [w]) => a + w, 0) + PHRASES[NOW_PHRASE][0] * 0.4;
  const columns = PHRASES.map(([w, d], i) => {
    const bg = i < NOW_PHRASE ? t.phraseDone : i === NOW_PHRASE ? `linear-gradient(90deg, ${t.accent} 40%, ${t.phraseTodo} 40%)` : t.phraseTodo;
    return `<div style="flex-grow: ${w}; flex-basis: 0px; height: ${Math.max(8, Math.round(d * 100))}%; background: ${bg}; border-radius: 2px;"></div>`;
  }).join('\n      ');
  return `
  <div style="position: absolute; left: 32px; right: 32px; top: 18px; height: 40px; display: flex; align-items: center; justify-content: space-between; gap: 24px; font-family: ${t.ui}; color: ${t.text};">
    <div style="display: flex; align-items: center; gap: 20px;">
      <div style="font-family: ${t.num}; font-weight: 700; font-size: 15px; letter-spacing: 0.22em;">FRETFALL</div>
      <div style="display: flex; align-items: baseline; gap: 10px;">
        <span style="font-size: 16px; font-weight: 600;">Song Title</span>
        <span style="font-size: 14px; color: ${t.muted};">Artist</span>
      </div>
      <div style="display: flex; gap: 2px; padding: 3px; border-radius: 9px; background: ${t.chip}; border: 1px solid ${t.chipBorder};">
        <span style="padding: 5px 12px; border-radius: 6px; background: ${t.text}; color: ${t.ink}; font-size: 13px; font-weight: 600;">Lead</span>
        <span style="padding: 5px 12px; border-radius: 6px; color: ${t.muted}; font-size: 13px; font-weight: 500;">Rhythm</span>
        <span style="padding: 5px 12px; border-radius: 6px; color: ${t.muted}; font-size: 13px; font-weight: 500;">Bass</span>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="font-family: ${t.num}; font-size: 14px; color: ${t.muted}; margin-right: 6px;">1:12 / 4:17</span>
      <div style="height: 36px; display: flex; align-items: center; gap: 10px; padding: 0px 10px; border-radius: 8px; background: ${t.chip}; border: 1px solid ${t.chipBorder}; color: ${t.muted};">
        ${icon('minus', 16)}<span style="font-family: ${t.num}; font-size: 14px; font-weight: 600; color: ${t.text};">100%</span>${icon('plus', 16)}
      </div>
      ${iconButton('loop')}
      ${iconButton('mic')}
      ${iconButton('pause')}
      <div style="width: 1px; height: 24px; background: ${t.chipBorder}; margin: 0px 4px;"></div>
      ${iconButton('open')}
      ${iconButton('settings')}
    </div>
  </div>
  <div style="position: absolute; left: 32px; right: 32px; top: 74px; height: 54px; display: flex; align-items: flex-end; gap: 3px;">
      ${columns}
  </div>
  <div style="position: absolute; left: 32px; right: 32px; top: 134px; height: 2px; background: ${t.phraseTodo};">
    <div style="width: ${((played / total) * 100).toFixed(1)}%; height: 2px; background: ${t.accent};"></div>
  </div>
  <div style="position: absolute; left: 40px; top: 164px; max-width: 520px; display: flex; flex-direction: column; gap: 8px; font-family: ${t.lyric}; font-style: ${t.lyricStyle};">
    <div style="font-family: ${t.num}; font-style: normal; font-size: 12px; font-weight: 600; letter-spacing: 0.18em; color: ${t.accent};">VERSE 2</div>
    <div style="font-size: 32px; line-height: 1.15; color: ${t.muted};"><span style="color: ${t.text};">Hold the note and</span> let it ring out</div>
    <div style="font-size: 24px; line-height: 1.15; color: ${t.muted}; opacity: 0.6;">watch the lanes come down to meet you</div>
  </div>
  <div style="position: absolute; right: 40px; top: 164px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
    <div style="font-family: ${t.num}; font-size: 40px; font-weight: 600; line-height: 1; color: ${t.text};">96%</div>
    <div style="font-family: ${t.ui}; font-size: 13px; color: ${t.muted};">accuracy</div>
  </div>`;
}

function artboard(t) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="${t.href.replaceAll('&', '&amp;')}">
  <style>
    body { margin: 0; background: ${t.ink}; }
    a { color: ${t.accent}; } a:hover { color: ${t.text}; }
  </style>
</helmet>
<div style="position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: ${t.bg};">
  ${highway(t)}
  ${overlay(t)}
</div>
</x-dc>
</body>
</html>
`;
}

const here = path.dirname(new URL(import.meta.url).pathname);
const previewDir = process.argv[2];
for (const [name, style] of Object.entries(ARTBOARDS)) {
  const html = artboard(theme(style));
  fs.writeFileSync(path.join(here, `${name}.dc.html`), html);
  if (previewDir) {
    const body = html.split('</helmet>')[1].split('</x-dc>')[0];
    const head = html.split('<helmet>')[1].split('</helmet>')[0];
    fs.writeFileSync(path.join(previewDir, `${name}.html`), `<!doctype html><html><head><meta charset="utf-8">${head}<style>body { zoom: 0.66; }</style></head><body>${body}</body></html>`);
  }
}
console.log('wrote', Object.keys(ARTBOARDS).map((n) => n + '.dc.html').join(', '));
