import assert from 'node:assert/strict';
import { moveCamera } from './highway.js';

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
assert.ok(shows(jump.seen[5], 0, 4) && jump.seen[5].span < 10, 'settled close on the first position');
assert.ok(shows(jump.seen[9.5], 0, 13), 'zoomed out to show both positions before the move');
assert.ok(shows(jump.seen[14], 9, 13) && jump.seen[14].span < 10, 'zoomed back in on the new position');

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

console.log('ok');
