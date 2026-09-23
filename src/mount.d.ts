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
  /** The names of the song's parts. */
  readonly parts: string[];
  /** The part shown, -1 without one. Settable. */
  part: number;
  addFormat(format: FretfallFormat<any>): void;
  /** Close Settings and the notation sheet. */
  closeSheets(): void;
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
