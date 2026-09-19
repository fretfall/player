// What a change costs: the highway's and the tab's frame time and draw calls over a whole song, lining a recording up, the
// fingering, and the download (gzip). node scripts/bench.mjs dist: the numbers. node scripts/bench.mjs base/dist dist: both,
// run in turns so the machine's ups and downs hit them alike, and a failure if the second is slower or bigger than LIMITS
// allow (PERF_OK=true lets it pass: a regression taken on purpose). In CI the table goes to the job summary too.
// The download is what the player's own page downloads: mount.js, the page over again for a page that mounts the player
// (see scripts/build.mjs), is never part of that, and has a line of its own under the table.
import { readdir, readFile, appendFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const LIMITS = { time: 0.1, draws: 0.05, gzip: 0.01 }; // share worse than the base: timings are noisy, counts and bytes aren't
const ROUNDS = 15, FRAMES = 600, SONG = 240, BPM = 150;

// A canvas that draws nothing: its methods only count, so the time is the player's own code
let counting = null;
const DRAWS = new Set(['fill', 'stroke', 'fillText', 'strokeText', 'fillRect', 'drawImage', 'createLinearGradient', 'createRadialGradient']);
const gradient = { addColorStop() {} }, metrics = { width: 10, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 1 };
const context = new Proxy({}, {
  get: (target, key) => {
    if (!(key in target)) {
      const value = key === 'measureText' ? () => metrics : key.startsWith('create') ? () => gradient : () => {};
      target[key] = DRAWS.has(key) ? (...args) => { if (counting) counting.n++; return value(...args); } : value;
    }
    return target[key];
  },
  set: (target, key, value) => { target[key] = value; return true; },
});
globalThis.devicePixelRatio = 2;
globalThis.OffscreenCanvas = class { getContext() { return context; } };
globalThis.Path2D = class { moveTo() {} lineTo() {} };
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
  const frames = (draw) => { // ms a frame, and draw calls a frame, over the whole song
    const cam = {}, arrangement = { ...song, links: undefined };
    counting = { n: 0 };
    const start = performance.now();
    for (let f = 0; f < FRAMES; f++) draw(canvas, arrangement, (f / FRAMES) * SONG, look, cam);
    const ms = (performance.now() - start) / FRAMES, draws = counting.n / FRAMES;
    counting = null;
    return { ms, draws };
  };
  const timed = (run, times = 1) => { const start = performance.now(); for (let i = 0; i < times; i++) run(); return (performance.now() - start) / times; };
  parentPort.on('message', () => {
    const h = frames(highway.drawHighway), t = frames(highway.drawTab);
    parentPort.postMessage({
      'highway ms/frame': h.ms, 'tab ms/frame': t.ms,
      'sync ms': timed(() => sync.align(sync.onsetEnvelope(audio, RATE), onsets)),
      'fingering ms': timed(() => fingering.suggestPositions(notes), 100),
      'highway draws/frame': h.draws, 'tab draws/frame': t.draws,
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

  const median = (list) => list.toSorted((a, b) => a - b)[list.length >> 1];
  const gzipped = async (dir) => (await Promise.all((await readdir(dir)).filter((f) => /\.(js|html)$/.test(f) && !f.startsWith('mount.')).map((f) => readFile(join(dir, f))))).reduce((sum, b) => sum + gzipSync(b, { level: 9 }).length, 0);
  const mount = await readFile(join(dirs.at(-1), 'mount.js')).then((b) => `mount.js: ${gzipSync(b, { level: 9 }).length.toLocaleString('en')} bytes gzipped, not in the sum above (the player's own page never downloads it).\n\n`, () => '');
  const results = await Promise.all(dirs.map(async (dir, i) => ({ ...Object.fromEntries(Object.keys(samples[i][0]).map((key) => [key, median(samples[i].map((s) => s[key]))])), 'gzip bytes': await gzipped(dir) })));

  const show = (key, v) => (key.includes('draws') || key.includes('bytes') ? Math.round(v).toLocaleString('en') : v.toFixed(3));
  const limit = (key) => (key.includes('draws') ? LIMITS.draws : key.includes('bytes') ? LIMITS.gzip : LIMITS.time);
  const [base, head] = results.length === 2 ? results : [null, results[0]], failed = [];
  const table = base
    ? ['| | base | this change | |', '|:--|--:|--:|--:|', ...Object.keys(head).map((key) => {
      const change = base[key] ? head[key] / base[key] - 1 : 0, worse = change > limit(key);
      if (worse) failed.push(key);
      return `| ${key} | ${show(key, base[key])} | ${show(key, head[key])} | ${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%${worse ? ' ❌' : ''} |`;
    })]
    : ['| | this change |', '|:--|--:|', ...Object.entries(head).map(([key, v]) => `| ${key} | ${show(key, v)} |`)];
  const ok = process.env.PERF_OK === 'true';
  const verdict = !base ? '' : failed.length
    ? `**Performance regression** in ${failed.join(', ')} (limits: time +${LIMITS.time * 100}%, draw calls +${LIMITS.draws * 100}%, gzip +${LIMITS.gzip * 100}%).${ok ? ' Accepted with the `perf-ok` label.' : ' Make it faster, or add the `perf-ok` label to accept it.'}`
    : 'No performance regression.';
  const report = `### Performance\n\n${table.join('\n')}\n\n${mount}${verdict}\n`;
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  if (failed.length && !ok) process.exitCode = 1;
}
