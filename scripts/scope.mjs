// The page's styles for the player mounted in an element of another page (src/mount.js; scripts/build.mjs scopes them):
// every rule kept to that element, at the weight it has on the player's own page. :root, and html or body at the start,
// become the element itself (:root.minimal …, :root:fullscreen … go on working: the class and the full screen are the
// element's there); any other selector goes under :where(element), which weighs nothing. @media, @supports, @container and
// @layer are scoped inside; @keyframes, @font-face, @property and the like stay as they are. What is sized by the screen
// (vw, vh) is sized by the element instead (cqw, cqh: the element is a size container, see src/mount.js).
// A dock (fretfall.dock: the header's controls in an element of the page's own) is a root of these styles too, so its
// controls are styled and :root's variables reach them; but html and body are the page's box, never a dock's

// → past the string or comment that starts at i, or i
const skip = (css, i) => {
  const c = css[i];
  if (c === '"' || c === "'") {
    for (i++; i < css.length && css[i] !== c; i++) if (css[i] === '\\') i++;
    return i + 1;
  }
  if (c !== '/' || css[i + 1] !== '*') return i;
  const end = css.indexOf('*/', i + 2);
  return end < 0 ? css.length : end + 2;
};

const scopeSelector = (selector, root, dock) =>
  selector === ':root' ? `${root}:not(${dock}),:where(${dock})` // on a dock it weighs nothing: the page's own rule on its element wins
  : selector.includes(':root') ? selector.replaceAll(':root', root)
  : /^(html|body)(?![\w-])/.test(selector) ? selector.replace(/^(html|body)(?![\w-])(\s*>?\s*body(?![\w-]))?/, `${root}:not(${dock})`)
  : `:where(${root}) ${selector}`;

// A selector list, split on its commas outside (), [] and strings; html, body → the element once
function scopeSelectors(list, root, dock) {
  const selectors = [];
  let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) {
    const next = skip(list, i);
    if (next !== i) i = next - 1;
    else if (list[i] === '(' || list[i] === '[') depth++;
    else if (list[i] === ')' || list[i] === ']') depth--;
    else if (list[i] === ',' && !depth) {
      selectors.push(list.slice(start, i));
      start = i + 1;
    }
  }
  selectors.push(list.slice(start));
  return [...new Set(selectors.map((s) => scopeSelector(s.trim(), root, dock)))].join(',');
}

export function scope(css, root = '[data-fretfall]', dock = '[data-fretfall-dock]') {
  let out = '';
  for (let i = 0; i < css.length; ) {
    let open = i; // the rule's {, or the ; of an @import
    while (open < css.length && css[open] !== '{' && css[open] !== ';') open = Math.max(open + 1, skip(css, open));
    if (css[open] !== '{') {
      out += css.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    let end = open + 1; // past its }
    for (let depth = 1; end < css.length && depth; ) {
      const next = skip(css, end);
      if (next === end) depth += (css[end] === '{') - (css[end] === '}');
      end = Math.max(end + 1, next);
    }
    const prelude = css.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, '').trim(), body = css.slice(open + 1, end - 1);
    out += !prelude.startsWith('@') ? `${scopeSelectors(prelude, root, dock)}{${body.replace(/(\d)v([wh])\b/g, '$1cq$2')}}`
      : /^@(media|supports|container|layer)\b/.test(prelude) ? `${prelude}{${scope(body, root, dock)}}`
      : css.slice(i, end).trim();
    i = end;
  }
  return out;
}
