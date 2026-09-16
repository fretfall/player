# Fretfall Player

An arcade-style note highway for Guitar Pro and MusicXML tabs, in the browser.

[![CI](https://github.com/fretfall/player/actions/workflows/ci.yml/badge.svg)](https://github.com/fretfall/player/actions/workflows/ci.yml)
[![Performance](https://github.com/fretfall/player/actions/workflows/perf.yml/badge.svg)](https://github.com/fretfall/player/actions/workflows/perf.yml)
[![npm](https://img.shields.io/npm/v/@fretfall/player?color=c8f04a&labelColor=0e1014)](https://www.npmjs.com/package/@fretfall/player)
[![license](https://img.shields.io/npm/l/@fretfall/player?color=c8f04a&labelColor=0e1014)](LICENSE)

[**Try it**](https://fretfall.github.io/player/) — the demo is the published package, served from GitHub Pages.

Open a tab and play along: the notes fall down a 3D fretboard, with hand positions and fingering worked out for you. Add the
band's recording and the player lines the tab up with it on its own.

- **Formats**: `.gp`, `.gp3`–`.gp5`, `.gpx`, `.musicxml`, `.mxl`, plus `.mp3`, `.m4a`, `.ogg`, `.wav`, `.flac` recordings
- **Practice**: phrase loops, speed control with a speed trainer, metronome, 3D highway or 2D tab
- **Band**: every part in a window of its own, all in time
- **Lean**: plain HTML and ES modules, no framework, no runtime dependencies, about 58 kB gzipped

## Quick start

```sh
npm install @fretfall/player
npx serve node_modules/@fretfall/player
```

Any static file server works. Tabs are read and played by [alphaTab](https://www.alphatab.net), loaded from jsDelivr.

## Build on it

Serve the package's files and add your own page around it. The player exposes `window.fretfall` once it dispatches
`fretfall:ready`:

```js
if (!window.fretfall) await new Promise((ready) => addEventListener('fretfall:ready', ready, { once: true }));

addEventListener('fretfall:song', (e) => console.log(e.detail.title, e.detail.parts));
await fretfall.open(files, { audio: recording }); // File[] from an input or a drop
fretfall.part = 1;
```

| Member | |
|:--|:--|
| `open(files, options)` / `pick()` | Open songs, or show the file dialog |
| `playing`, `time`, `length` | Where playback is, in seconds |
| `parts`, `part` | The song's parts, and the one shown (settable) |
| `addFormat({ name, extensions, open })` | Read another file type: `open(file)` resolves to `{ song, audio }` |
| `closeSheets()` | Close Settings and the notation sheet |

Events on `window`: `fretfall:ready`, `fretfall:song`, `fretfall:playing`, `fretfall:sheet`. The modules import on their own
too, for example `music.js` for tunings and note names.

Keys: <kbd>Space</kbd> play · <kbd>L</kbd> loop · <kbd>O</kbd> open · <kbd>D</kbd> 2D tab · <kbd>K</kbd> metronome ·
<kbd>F</kbd> full screen · <kbd>S</kbd> settings · <kbd>?</kbd> everything else. Add `?perf` to the URL for a frame profiler.

## Develop

```sh
npm ci
npm test          # node --test
npm run lint      # oxlint: correctness and performance rules
npm run build     # dist/, the published package
npm run bench     # frame time, draw calls, sync and size of dist/
```

`src/` is the player's modules, `demo/` the page they ship with (and its demo tab). The build flattens both into `dist/`,
which is what npm publishes and what the demo serves — so the page next to the modules, as a page built on the player has it.

No pull request may make the player slower or bigger. CI builds it and the base branch, benchmarks both in turns on the same
runner, and fails on more than 10% frame or sync time, 5% draw calls or 1% gzipped size. A regression taken on purpose
passes with the `perf-ok` label.

Releases: bump `version`, publish a GitHub release tagged `v<version>`, and CI publishes to npm with provenance.

## License

[MIT](LICENSE)
