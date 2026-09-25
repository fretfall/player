// The player mounted in an element of a page that isn't its own, and the hook that page talks to it through:
// window.fretfall, and the fretfall:* events on window (see the README)

/** A kind of song file the player doesn't read itself, added with `fretfall.addFormat`. */
export interface FretfallFormat<Options = Record<string, unknown>> {
  /** As the Open dialog says it: "a .pak". */
  name: string;
  /** Lower case, with the dot: `[".pak"]`. */
  extensions: string[];
  /** `options`: what `fretfall.open` was given, and `status(text)` to say what is taking the time. */
  open(file: File, options: Options & { status(text: string): void }): Promise<{ song: unknown; audio?: Blob | null }>;
}

export interface Fretfall {
  /** Open songs: a tab, or a tab with its recording. `options` are handed on to the format that opens a file. */
  open(files: Iterable<File>, options?: Record<string, unknown>): Promise<void>;
  /** Show the file dialog. */
  pick(): void;
  /** Settable: `true` waits for the synth's instruments if the song has just opened. */
  playing: boolean;
  /** Seconds into the song. Settable: a jump to there, kept within the song. */
  time: number;
  /** The song's length in seconds, 0 without a song. */
  readonly length: number;
  /** How fast it plays: 1 is the song's own tempo. Settable, in the player's steps of a tenth from 0.1 to 1.5. */
  speed: number;
  /**
   * What the instrument looks like: the note shape (`look`), the colour set (`colors`), the fonts, the string colours
   * (`strings`) and the headstock. Settable whole or in part; a name the player does not know is ignored, so add a
   * colour set of your own to `COLORS` in `themes.js` before naming it here.
   */
  style: { look: string; colors: string; fonts: string; strings: string; headstock: string };
  /**
   * What the part shown is asking for, or null without a song: `open`, the open strings' midi notes lowest string
   * first, and every note as `time` and `sustain` in seconds, `string` (0 is the lowest), `fret`, and the `midi` note
   * it sounds. A copy, made on each read: read it once a song, not each frame.
   */
  readonly notes: { open: number[]; notes: { time: number; sustain: number; string: number; fret: number; midi: number }[] } | null;
  /**
   * The open song's own nudge in milliseconds, on top of the player's alignment of a recording and its Audio delay
   * setting (the device's): positive makes the notes arrive later. Settable once the song is open; a new song starts at 0.
   * It moves the song's clock: `time`, seeks and the loop go by it.
   */
  offset: number;
  /**
   * Sets `offset` so the tab's first note lands on its attack in the recording, and returns it; `null` without a
   * recording the player lined up itself. Near where the player's fit puts that note when the fit is sure; else the
   * recording's first loud sound, which a count-in can be: a starting point to nudge from.
   */
  snap(): number | null;
  /** The names of the song's parts. */
  readonly parts: string[];
  /** The part shown, -1 without one. Settable. */
  part: number;
  /** How loud, 0 to 1. Settable; a volume of 0 is muted, and setting one asks for sound again. */
  volume: number;
  /** The mute, which a volume of 0 also turns on. Settable. */
  muted: boolean;
  /** What is looping, in seconds, or null. Settable: kept inside the song, and anything else clears it. */
  loop: { start: number; end: number } | null;
  /** The click on the chart's beats. Settable. */
  metronome: boolean;
  /** What the notes are drawn as: the 3D highway, the tablature, or the notation page. Settable. */
  view: 'highway' | 'tablature' | 'notation';
  /** The view alone with the lyrics, the bar and the phrases hidden. Settable. */
  minimal: boolean;
  /** Opens every other part in a window of its own, all in time. Nothing in a window that is itself following. */
  band(): void;
  /** Which sheet is open, or null. Settable. */
  sheet: 'settings' | 'legend' | null;
  /** Settable — set it from your own button's click, as browsers want a gesture behind it. */
  fullscreen: boolean;
  /**
   * Everything a control toggles, in one object, for a bar of the page's own to draw itself from. `fretfall:controls`
   * fires whenever any of it changes, whoever changed it — the page's buttons or the player's own.
   */
  readonly controls: FretfallControls;
  addFormat(format: FretfallFormat<any>): void;
  /** Close Settings and the notation sheet. */
  closeSheets(): void;
  /**
   * Move the header's controls (the part picker, time, speed, volume, loop, play, open, help, settings, full screen)
   * into `element`, an element of the page's own bar say, and hide the header meanwhile: the page has one bar and
   * the highway the row. Help, settings and full screen go into `more` instead when given. Both are marked
   * `data-fretfall` and `data-fretfall-dock`, so the player's styles reach the controls. `null` brings them home.
   */
  dock(element: HTMLElement | null, more?: HTMLElement): void;
}

export interface FretfallControls {
  playing: boolean;
  speed: number;
  volume: number;
  muted: boolean;
  loop: { start: number; end: number } | null;
  metronome: boolean;
  parts: string[];
  part: number;
  sheet: 'settings' | 'legend' | null;
  fullscreen: boolean;
  view: 'highway' | 'tablature' | 'notation';
  minimal: boolean;
}

export interface FretfallSong {
  /** The file's name; null for a band window's song. */
  file: string | null;
  title?: string;
  artist?: string;
  parts: string[];
  part: number;
}

/**
 * Mounts the player in `element`, which has to be in the page and have a size. Once a page: there is no unmount, and a
 * second call returns the first one's promise, so keep the element and hide it rather than removing it.
 * Resolves to `window.fretfall` once `fretfall:ready` has fired.
 */
export function mount(element: HTMLElement): Promise<Fretfall>;

declare global {
  var fretfall: Fretfall | undefined; // window.fretfall too
  interface WindowEventMap {
    'fretfall:ready': CustomEvent<null>;
    'fretfall:song': CustomEvent<FretfallSong>;
    'fretfall:playing': CustomEvent<{ playing: boolean }>;
    /** Played out to its end, rather than paused. */
    'fretfall:ended': CustomEvent<null>;
    'fretfall:sheet': CustomEvent<{ name: 'settings' | 'legend'; open: boolean }>;
  }
}
