// The player in an element of a page that isn't its own, a React app's say:
//   import { mount } from '@fretfall/player/mount.js';
//   const fretfall = await mount(element); // window.fretfall, once fretfall:ready has fired
// The build writes this module from the player's page (scripts/build.mjs), so the two can't drift: PAGE_HTML is the page's
// body, PAGE_CSS its styles kept to the element (scripts/scope.mjs), ALPHATAB the script it loads. The page around the
// player talks to it as any page built on it does: window.fretfall and the fretfall:* events.
// Once a page: the player's modules run once and there is no unmount, so a second call returns the first one's promise.
// The page keeps the element, and hides it rather than removing it
/* global PAGE_HTML, PAGE_CSS, ALPHATAB */
let mounted = null;
export const mount = (element) => (mounted ??= start(element));

async function start(element) {
  // The player's root is an element of its own inside the page's: the page sizes and places its element however it likes
  // (a class, a cascade layer), and none of that competes with the player's styles. It stands in for the player's page:
  // what is fixed to the screen there is fixed to its box here (contain), what is sized by the screen is sized by it
  // (a size container, for the cqw and cqh that vw and vh became), and its layers stay among themselves (contain again).
  // Not a dock (fretfall.dock): an element of the page's bar sized by what it holds, which a size container would collapse
  const style = Object.assign(document.createElement('style'), { textContent: `${PAGE_CSS}[data-fretfall]:not([data-fretfall-dock]){contain:layout;container-type:size}` });
  const fonts = Object.assign(document.createElement('link'), { id: 'fonts', rel: 'stylesheet' }); // the themes': see applyTheme in player.js
  if (!element.isConnected) throw new Error('mount(element): the element has to be in the page');
  element.innerHTML = `<div data-fretfall>${PAGE_HTML}</div>`;
  // The player finds its elements by id, and an id the page uses too would hand it the page's element: better said now
  // than found out as a button that does nothing
  const taken = [...element.querySelectorAll('[id]')].map((el) => el.id).filter((id) => document.querySelectorAll(`[id="${id}"]`).length > 1);
  if (document.getElementById(fonts.id)) taken.push(fonts.id);
  if (taken.length) {
    element.innerHTML = '';
    throw new Error(`The page around the player uses ids that are the player's: ${taken.join(', ')}`);
  }
  document.head.append(style, fonts);
  if (!window.alphaTab)
    await new Promise((loaded, failed) => document.head.append(Object.assign(document.createElement('script'), { src: ALPHATAB, onload: loaded, onerror: () => failed(new Error(`Could not load ${ALPHATAB}`)) })));
  await import('./player.js'); // finds [data-fretfall] as it starts, and has announced fretfall:ready by the time it's in
  return window.fretfall;
}
