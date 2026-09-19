// The package, in dist/: each module minified on its own (a page built on the player imports them too, like /music.js), the
// page's styles minified and its markup unindented, the modules preloaded so they download alongside player.js, and a
// package.json without the parts only this repo needs. src/ is the player, demo/ the page it ships with; dist/ is both, flat.
// node scripts/build.mjs [folder]: CI builds the base branch with it too. The demo's front door (between <!-- demo --> and
// <!-- /demo --> in its page) and its song stay out of the package: DEMO=1 keeps them, for the demo on github.io.
// mount.js, the player for an element of another page (see src/mount.js), is written from the same page: its body and its
// styles, kept to that element (scope.mjs). The player's own page never downloads it
import { build, transform } from 'esbuild';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { scope } from './scope.mjs';

const root = resolve(process.argv[2] ?? '.'), out = join(root, 'dist');
const src = join(root, 'src'), demo = join(root, 'demo'); // the modules, and the page they are shipped with
const modules = (await readdir(src)).filter((f) => f.endsWith('.js') && f !== 'mount.js').sort((a, b) => (b === 'player.js') - (a === 'player.js')); // the page's own first

await rm(out, { recursive: true, force: true });
await mkdir(out);
await build({ entryPoints: modules.map((m) => join(src, m)), outdir: out, format: 'esm', minify: true, charset: 'utf8', legalComments: 'none', logLevel: 'warning' });

// The markup keeps one whitespace wherever it had some (a line break), so nothing inline moves; </head> and </body> stay
// where a page built on the player adds its own
const page = await readFile(join(demo, 'index.html'), 'utf8'), bare = page.replace(/<!-- demo[\s\S]*?<!-- \/demo -->/g, '');
let html = process.env.DEMO ? page : bare;
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

// mount.js: the page without the demo's front door, whatever DEMO says. Its body without the scripts, which mount() loads
// itself: alphaTab from where the page loads it, then player.js
if (existsSync(join(src, 'mount.js'))) {
  const css = await Promise.all((bare.match(/<style>[\s\S]*?<\/style>/g) ?? []).map((s) => transform(s.slice('<style>'.length, -'</style>'.length), { loader: 'css', minify: true })));
  const body = bare.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, '').replace(/[ \t]*\n\s*/g, '\n').trim();
  const define = { PAGE_HTML: body, PAGE_CSS: scope(css.map((c) => c.code.trim()).join('')), ALPHATAB: bare.match(/<script src="([^"]+)"/)[1] };
  await build({ entryPoints: [join(src, 'mount.js')], outdir: out, format: 'esm', minify: true, charset: 'utf8', legalComments: 'none', logLevel: 'warning', define: Object.fromEntries(Object.entries(define).map(([name, text]) => [name, JSON.stringify(text)])) });
  if (process.env.DEMO) await writeFile(join(out, 'mount.html'), (await readFile(join(demo, 'mount.html'), 'utf8')).replaceAll('../src/', './')); // the page that tries it
}

for (const [dir, file] of [[demo, 'favicon.svg'], ...(process.env.DEMO ? [[demo, 'demo.atex']] : []), [src, 'mount.d.ts'], [root, 'README.md'], [root, 'LICENSE']]) if (existsSync(join(dir, file))) await copyFile(join(dir, file), join(out, file));
const { private: _, scripts, devDependencies, ...pkg } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await writeFile(join(out, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
