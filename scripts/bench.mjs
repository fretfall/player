// What a change costs the player, over a whole song: what each surface asks the canvas to do, what the download weighs
// (gzip), and how long a frame takes. node scripts/bench.mjs dist: the numbers. node scripts/bench.mjs base/dist dist: both,
// run in turns so the machine's ups and downs hit them alike, and a failure if the second asks the canvas for more or
// downloads heavier than the first (PERF_OK=true lets it pass: a regression taken on purpose). In CI the table goes to the
// job summary too.
//
// What can fail the build, and why only this. The operation counts and the gzip bytes are exact: the same code gives the
// same integer on any machine, every time, so any rise at all is a real regression and fails. Frame time is not: on a
// shared runner the noise floor is wider than the differences worth catching, and a gate on it gave opposite verdicts on
// byte-identical code five runs in a row. So frame time is printed and marked advisory here, and fails nothing. Reading it
// is still worth it — a count that holds while the time doubles is a change in what the work costs, not in how much of it
// there is.
//
// For the counts to be exact the frame has to be exact. The camera glides on the wall clock, so how fast the machine ran the
// loop would change what is on screen and with it what is drawn; the bench hands drawHighway a frame clock of its own
// (cam.clock) that ticks a fixed 1/60 s a frame. The browser leaves cam.clock unset and keeps performance.now(). Every count
// is checked against every round of the same worker before the two builds are compared: a count that moves inside one build
// is a bug in this freeze, and says so.
//
// Not gated: per-frame allocations. Measured as a heap delta over the frame loop with --expose-gc (the cheap way), the
// highway read 42.1 kB a frame against 41.1 for a byte-identical copy of itself, and 41.5 against 57.0 on the next run: a
// collection landing inside the window moves it by more than any change worth catching. That is the unenforceable gate this
// bench just got rid of, so it is left out. A row that needs a tolerance does not belong beside counters that are exact.
//
// The download is what the player's own page downloads: mount.js, the page over again for a page that mounts the player
// (see scripts/build.mjs), is never part of that, and has a line of its own under the table.
import { readdir, readFile, appendFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const ROUNDS = 15, FRAMES = 600, SONG = 240, BPM = 150, FRAME_MS = 1000 / 60; // the bench's own frame clock: a frozen 60 Hz
const SURFACES = ['highway', 'tab', 'notation'];

// A canvas that draws nothing: its methods only count, so the time is the player's own code. What is counted is split the
// way src/perf.js splits the profiler's panel — fills, strokes, text, images, gradients, text measured, and glow (anything
// drawn with a shadow blur, often the dearest by far) — plus the operations a path is built from, on the context and on
// Path2D alike. save() and restore() do nothing here, so a shadow blur lasts until the code clears it: read glow as a figure
// to compare a change against, not as what a browser would count.
let counting = null;
const KINDS = {
  fill: 'fill', fillRect: 'fill', stroke: 'stroke', strokeRect: 'stroke', fillText: 'text', strokeText: 'text',
  drawImage: 'image', createLinearGradient: 'gradient', createRadialGradient: 'gradient', createPattern: 'gradient',
  measureText: 'measure',
  moveTo: 'path', lineTo: 'path', arc: 'path', arcTo: 'path', ellipse: 'path', quadraticCurveTo: 'path',
  bezierCurveTo: 'path', rect: 'path', roundRect: 'path', closePath: 'path',
};
const LABELS = { fill: 'fill calls', stroke: 'stroke calls', text: 'text calls', image: 'image draws', gradient: 'gradients', measure: 'text measures', path: 'path ops', glow: 'glow calls' };
const KEYS = Object.keys(LABELS);
const GLOWS = new Set(['fill', 'stroke', 'text', 'image']); // a gradient made or a width measured draws nothing, so it can't glow
const zeroes = () => Object.fromEntries(KEYS.map((k) => [k, 0]));

const gradient = { addColorStop() {} }, metrics = { width: 10, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 1 };
const target = {};
const context = new Proxy(target, {
  get: (t, key) => {
    if (!(key in t)) {
      const value = key === 'measureText' ? () => metrics : key.startsWith('create') ? () => gradient : () => {};
      const kind = KINDS[key];
      t[key] = kind
        ? (...args) => {
          if (counting) {
            counting[kind]++;
            if (GLOWS.has(kind) && t.shadowBlur > 0) counting.glow++; // off the plain object, not the proxy: an unset property must stay unset
          }
          return value(...args);
        }
        : value;
    }
    return t[key];
  },
  set: (t, key, value) => { t[key] = value; return true; },
});
const pathOp = () => { if (counting) counting.path++; };
globalThis.devicePixelRatio = 2;
globalThis.OffscreenCanvas = class { getContext() { return context; } };
globalThis.Path2D = class {
  moveTo() { pathOp(); } lineTo() { pathOp(); } arc() { pathOp(); } arcTo() { pathOp(); } ellipse() { pathOp(); }
  quadraticCurveTo() { pathOp(); } bezierCurveTo() { pathOp(); } rect() { pathOp(); } roundRect() { pathOp(); } closePath() { pathOp(); }
};
const canvas = { clientWidth: 1728, clientHeight: 944, width: 0, height: 0, getContext: () => context };

// A busy four minutes: eighths across the strings with slides, bends and mutes, a chord on every bar, a new hand position
// every two bars
const beat = 60 / BPM, NOTE = { sustain: 0, chord: null, hammerOn: false, pullOff: false, slideTo: null, slideUnpitchTo: null, bend: 0, harmonic: false, harmonicPinch: false, palmMute: false, mute: false, tremolo: false, vibrato: false, accent: false, tap: false, linkNext: false, finger: null, slap: false, pop: false, pick: null };
const notes = [], chords = [], anchors = [];
for (let bar = 0; bar * 4 * beat < SONG; bar++) {
  const t0 = bar * 4 * beat, fret = 1 + ((bar >> 1) * 5) % 12;
  if (bar % 2 === 0) anchors.push({ time: t0, endTime: t0 + 8 * beat, fret, width: 4 });
  chords.push({ time: t0, name: 'A5', frets: [], fingers: [1, 3, 4, -1, -1, -1], notes: [], accent: false, palmMute: false, fretHandMute: false, highDensity: bar % 4 === 3 });
  for (let s = 0; s < 3; s++) notes.push({ ...NOTE, time: t0, string: s, fret: fret + (s ? 2 : 0), sustain: beat, chord: chords.length - 1, finger: s + 1 });
  for (let i = 2; i < 8; i++) {
    const n = bar * 8 + i;
    notes.push({ ...NOTE, time: t0 + (i * beat) / 2, string: n % 6, fret: fret + (n % 4), finger: 1 + (n % 4), sustain: n % 5 ? 0 : beat, slideTo: n % 11 ? null : fret + 2, bend: n % 13 ? 0 : 1, bendCurve: n % 13 ? null : [[0, 0], [0.5, 1]], palmMute: n % 7 === 0, hammerOn: n % 9 === 0, vibrato: n % 17 === 0 });
  }
}
notes.forEach((n, i) => n.chord !== null && chords[n.chord].notes.push(i));
const song = {
  name: 'Lead', tuning: [0, 0, 0, 0, 0, 0], centOffset: 0, capo: 0, strings: 6, open: [40, 45, 50, 55, 59, 64], notes, chords, anchors, handShapes: [],
  sections: Array.from({ length: SONG / 20 }, (_, i) => ({ time: i * 20, name: i % 2 ? 'Chorus' : 'Verse' })),
  beats: Array.from({ length: SONG / beat }, (_, i) => ({ time: i * beat, measure: i % 4 ? -1 : i / 4 + 1 })),
  rhythm: Array.from({ length: (SONG / beat) * 2 }, (_, i) => ({ time: (i * beat) / 2, value: 8, dots: i % 12 === 11 ? 1 : 0, rest: i % 16 === 15, tuplet: 0 })), // eighths, a rest every other bar
  meters: [{ time: 0, text: '4/4' }],
  phrases: Array.from({ length: SONG / 10 }, (_, i) => ({ time: i * 10, endTime: (i + 1) * 10, name: '', maxDifficulty: 0 })),
};
// A recording: an attack on every beat, over noise
const RATE = 11025, audio = new Float32Array(20 * RATE);
for (let i = 0; i < audio.length; i++) audio[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1 * 0.05;
for (let t = 1.3; t < 20; t += beat) for (let i = 0; i < 800; i++) audio[Math.floor(t * RATE) + i] += Math.sin(i * 0.3) * Math.exp(-i / 200);
const onsets = Array.from({ length: Math.floor(18 / beat) }, (_, i) => i * beat);

// Each build runs in a worker of its own (its own engine: what one build's code leaves the JIT and the heap in can't slow
// the other's), a round at a time, in turns
if (!isMainThread) {
  const dir = workerData;
  const url = (file) => pathToFileURL(join(dir, file)).href;
  const [highway, themes, sync, fingering] = await Promise.all(['highway.js', 'themes.js', 'sync.js', 'fingering.js'].map((f) => import(url(f))));
  const look = { ...themes.theme(themes.DEFAULT_STYLE), guides: true, noteLines: 0.5, notes3d: true, frames: 'gradient', repeatMarks: 'frame', markings: 'black', tabLayout: 'scroll', stringOrder: 'low', headstock: 'inline', viewAngle: 30, sideAngle: 5, noteSpeed: 1, drawDistance: 1, fretWidth: 1, boardHeight: 1, fretNumbers: true };
  const frames = (draw) => { // ms a frame, and what the whole song asked the canvas for, over FRAMES frames of a frozen clock
    const cam = { clock: 0 }, arrangement = { ...song, links: undefined };
    counting = zeroes();
    const start = performance.now();
    for (let f = 0; f < FRAMES; f++) {
      cam.clock = f * FRAME_MS;
      draw(canvas, arrangement, (f / FRAMES) * SONG, look, cam);
    }
    const ms = (performance.now() - start) / FRAMES, counts = counting;
    counting = null;
    return { ms, counts };
  };
  const timed = (run, times = 1) => { const start = performance.now(); for (let i = 0; i < times; i++) run(); return (performance.now() - start) / times; };
  parentPort.on('message', () => {
    const drawn = { highway: frames(highway.drawHighway), tab: frames(highway.drawTab), notation: highway.drawSheet ? frames(highway.drawSheet) : null }; // a build before the notation page has nothing to measure
    parentPort.postMessage({
      times: {
        ...Object.fromEntries(SURFACES.filter((s) => drawn[s]).map((s) => [`${s} ms/frame`, drawn[s].ms])),
        'sync ms': timed(() => sync.align(sync.onsetEnvelope(audio, RATE), onsets)),
        'fingering ms': timed(() => fingering.suggestPositions(notes), 100),
      },
      counts: Object.fromEntries(SURFACES.filter((s) => drawn[s]).flatMap((s) => KEYS.map((k) => [`${s} ${LABELS[k]}`, drawn[s].counts[k]]))),
    });
  });
} else {
  /* oxlint-disable no-await-in-loop -- a round at a time: side by side they'd share the CPU */
  const dirs = process.argv.slice(2).map((d) => resolve(d));
  if (!dirs.length || dirs.length > 2) throw new Error('usage: bench.mjs [base] dir');
  const workers = dirs.map((dir) => new Worker(new URL(import.meta.url), { workerData: dir }));
  const round = (worker) => new Promise((done) => { worker.once('message', done); worker.postMessage(null); });
  const samples = dirs.map(() => []);
  for (let r = 0; r < 3; r++) for (const worker of workers) await round(worker); // warm up the JIT
  for (let r = 0; r < ROUNDS; r++) for (const i of r % 2 ? dirs.keys().toArray().reverse() : dirs.keys()) samples[i].push(await round(workers[i]));
  await Promise.all(workers.map((w) => w.terminate()));

  // A count that moves between rounds of the same build is the freeze leaking, not a regression: nothing below it means
  // anything until that is fixed, so it is its own failure
  const drifted = [];
  for (const [i, rounds] of samples.entries()) {
    for (const [key, first] of Object.entries(rounds[0].counts)) {
      const off = rounds.find((s) => s.counts[key] !== first);
      if (off) drifted.push(`${dirs[i]}: ${key} ${first} in the first round, ${off.counts[key]} in another`);
    }
  }

  const median = (list) => list.toSorted((a, b) => a - b)[list.length >> 1];
  const gzipped = async (dir) => (await Promise.all((await readdir(dir)).filter((f) => /\.(js|html)$/.test(f) && !f.startsWith('mount.')).map((f) => readFile(join(dir, f))))).reduce((sum, b) => sum + gzipSync(b, { level: 9 }).length, 0);
  const mount = await readFile(join(dirs.at(-1), 'mount.js')).then((b) => `mount.js: ${gzipSync(b, { level: 9 }).length.toLocaleString('en')} bytes gzipped, not in the sum above (the player's own page never downloads it).\n\n`, () => '');
  const results = await Promise.all(dirs.map(async (dir, i) => ({
    times: Object.fromEntries(Object.keys(samples[i][0].times).map((key) => [key, median(samples[i].map((s) => s.times[key]))])),
    counts: { ...samples[i][0].counts, 'gzip bytes': await gzipped(dir) },
  })));

  // Counts and bytes are exact and hard: any rise fails, so a hard row shows the operations it moved by as well as the share
  // (a single call on a hundred thousand is a real failure that rounds to +0.0%). Times are noisy and advisory: printed only
  const rows = (r) => [...Object.entries(r.times).map(([key, v]) => ({ key, v, hard: false })), ...Object.entries(r.counts).map(([key, v]) => ({ key, v, hard: true }))];
  const show = (row) => (row.hard ? row.v.toLocaleString('en') : row.v.toFixed(3));
  const share = (v, was) => (was ? `${v >= was ? '+' : ''}${((v / was - 1) * 100).toFixed(1)}%` : v ? 'new' : '+0.0%');
  const moved = (v, was) => `${v >= was ? '+' : ''}${(v - was).toLocaleString('en')} · ${share(v, was)}`;
  const [base, head] = results.length === 2 ? results : [null, results[0]], failed = [];
  const table = base
    ? ['| | base | this change | |', '|:--|--:|--:|--:|', ...rows(head).map((row) => {
      const was = base.times[row.key] ?? base.counts[row.key];
      if (was === undefined) return `| ${row.key} | — | ${show(row)} | new |`; // the base build has no such surface (no notation page yet)
      const worse = row.hard && row.v > was;
      if (worse) failed.push(`${row.key} ${moved(row.v, was)}: ${was.toLocaleString('en')} → ${row.v.toLocaleString('en')}`);
      const delta = row.hard ? `${moved(row.v, was)}${worse ? ' ❌' : ''}` : `${share(row.v, was)} · advisory`;
      return `| ${row.key} | ${show({ ...row, v: was })} | ${show(row)} | ${delta} |`;
    })]
    : ['| | this change |', '|:--|--:|', ...rows(head).map((row) => `| ${row.key} | ${show(row)}${row.hard ? '' : ' · advisory'} |`)];
  const ok = process.env.PERF_OK === 'true';
  const legend = `Counts are operations over ${FRAMES} frames of the whole song at a frozen 60 Hz, so they are exact: any rise fails. Frame times are advisory — the noise floor is wider than the gate would be.\n\n`;
  const verdict = drifted.length
    ? `**The frame is not frozen**: a count moved between rounds of the same build, so no comparison below it holds.\n${drifted.map((d) => `- ${d}`).join('\n')}`
    : !base ? '' : failed.length
      ? `**Performance regression**: ${failed.join('; ')}.${ok ? ' Accepted with the `perf-ok` label.' : ' Bring it back down, or add the `perf-ok` label to accept it.'}`
      : 'No performance regression: no surface asks the canvas for more than the base does, and the download is no heavier.';
  const report = `### Performance\n\n${table.join('\n')}\n\n${legend}${mount}${verdict}\n`;
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  if (drifted.length || (failed.length && !ok)) process.exitCode = 1;
}
