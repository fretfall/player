import assert from 'node:assert/strict';
import { scope } from './scope.mjs';

// :root, and html or body at the start, are the element; the rest goes under it without weighing more than on the page
assert.equal(scope(':root{--bg:#000}'), '[data-fretfall]{--bg:#000}');
assert.equal(scope('html,\nbody { height: 100% }'), '[data-fretfall]{ height: 100% }');
assert.equal(scope('body{margin:0}html body .bar{top:0}body>.bar{top:0}'), '[data-fretfall]{margin:0}[data-fretfall] .bar{top:0}[data-fretfall]>.bar{top:0}');
assert.equal(scope('*{box-sizing:border-box}[hidden]{display:none!important}'), ':where([data-fretfall]) *{box-sizing:border-box}:where([data-fretfall]) [hidden]{display:none!important}');
assert.equal(scope('.bodywork,button{color:red}'), ':where([data-fretfall]) .bodywork,:where([data-fretfall]) button{color:red}');
assert.equal(scope(':root.minimal .bar,:root:not(.tab2d) .only-2d{display:none}'), '[data-fretfall].minimal .bar,[data-fretfall]:not(.tab2d) .only-2d{display:none}');
assert.equal(scope(':root:fullscreen:has(#phrases:hover, .bar:hover) .bar{opacity:1}'), '[data-fretfall]:fullscreen:has(#phrases:hover, .bar:hover) .bar{opacity:1}');
assert.equal(scope('.a', '#player'), '.a'); // no rule, nothing to scope
assert.equal(scope('.a{top:0}', '#player'), ':where(#player) .a{top:0}');

// Commas inside (), [] and strings belong to their selector
assert.equal(scope(':is(.wordmark, .welcome-mark) .fall,a[title="x,y{"]{top:0}'), ':where([data-fretfall]) :is(.wordmark, .welcome-mark) .fall,:where([data-fretfall]) a[title="x,y{"]{top:0}');

// Scoped inside @media and the like, however deep; @keyframes, @font-face and @property stay as they are
assert.equal(scope('@media (max-width:900px){.menu{display:none}@supports (gap:1px){:root .a,.b{gap:1px}}}'),
  '@media (max-width:900px){:where([data-fretfall]) .menu{display:none}@supports (gap:1px){[data-fretfall] .a,:where([data-fretfall]) .b{gap:1px}}}');
const kept = '@keyframes fall{from{top:0}40%{top:1vh}to{top:2px}}@font-face{font-family:"A}";src:url(a.woff2)}@property --x{syntax:"<length>";inherits:false;initial-value:0}';
assert.equal(scope(`${kept}.a{top:0}`), `${kept}:where([data-fretfall]) .a{top:0}`);
assert.equal(scope('@import "a.css";@layer base,player;.a{top:0}'), '@import "a.css";@layer base,player;:where([data-fretfall]) .a{top:0}');

// Comments and strings with braces in them don't end a rule
assert.equal(scope('/* the bar } */ .bar { content: "}"; top: 0 /* { */ } .b{top:0}'), ':where([data-fretfall]) .bar{ content: "}"; top: 0 /* { */ }:where([data-fretfall]) .b{top:0}');

// Sized by the screen on the page, by the element here
assert.equal(scope('.sheet{width:min(400px,calc(100vw - 32px));max-height:calc(100vh - 118px);font-size:clamp(20px,2.3vw,32px)}'),
  ':where([data-fretfall]) .sheet{width:min(400px,calc(100cqw - 32px));max-height:calc(100cqh - 118px);font-size:clamp(20px,2.3cqw,32px)}');
