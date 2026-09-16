// The package, in dist/: each module minified on its own (a page built on the player imports them too, like /music.js), the
// page's styles minified and its markup unindented, the modules preloaded so they download alongside player.js, and a
// package.json without the parts only this repo needs. src/ is the player, demo/ the page it ships with; dist/ is both, flat.
// node scripts/build.mjs [folder]: CI builds the base branch with it too. The demo's front door (between <!-- demo --> and
// <!-- /demo --> in its page) and its song stay out of the package: DEMO=1 keeps them, for the demo on github.io
import { build, transform } from 'esbuild';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.'), out = join(root, 'dist');
const src = join(root, 'src'), demo = join(root, 'demo'); // the modules, and the page they are shipped with
const modules = (await readdir(src)).filter((f) => f.endsWith('.js')).sort((a, b) => (b === 'player.js') - (a === 'player.js')); // the page's own first

await rm(out, { recursive: true, force: true });
await mkdir(out);
await build({ entryPoints: modules.map((m) => join(src, m)), outdir: out, format: 'esm', minify: true, charset: 'utf8', legalComments: 'none', logLevel: 'warning' });

// The markup keeps one whitespace wherever it had some (a line break), so nothing inline moves; </head> and </body> stay
// where a page built on the player adds its own
let html = await readFile(join(demo, 'index.html'), 'utf8');
if (!process.env.DEMO) html = html.replace(/<!-- demo[\s\S]*?<!-- \/demo -->/g, '');
const styles = html.match(/<style>[\s\S]*?<\/style>/g) ?? [];
const squeezed = await Promise.all(styles.map((s) => transform(s.slice('<style>'.length, -'</style>'.length), { loader: 'css', minify: true })));
styles.forEach((s, i) => (html = html.replace(s, `<style>${squeezed[i].code.trim()}</style>`)));
// The page's own scripts, like the demo's front door: minified as the modules are, comments and all
const inline = html.match(/<script type="module">[\s\S]*?<\/script>/g) ?? [];
const minified = await Promise.all(inline.map((s) => transform(s.slice(s.indexOf('>') + 1, -'</script>'.length), { loader: 'js', minify: true })));
inline.forEach((s, i) => (html = html.replace(s, `<script type="module">${minified[i].code.trim()}</script>`)));
html = html
  .replaceAll('../src/', '') // the page sits above the modules in the repo, next to them in the package
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/[ \t]*\n\s*/g, '\n')
  .replace('</head>', `${modules.map((m) => `<link rel="modulepreload" href="${m}">`).join('\n')}\n</head>`);
await writeFile(join(out, 'index.html'), html);

for (const [dir, file] of [[demo, 'favicon.svg'], ...(process.env.DEMO ? [[demo, 'demo.atex']] : []), [root, 'README.md'], [root, 'LICENSE']]) if (existsSync(join(dir, file))) await copyFile(join(dir, file), join(out, file));
const { private: _, scripts, devDependencies, ...pkg } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await writeFile(join(out, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
