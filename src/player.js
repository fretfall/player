import {
    tempoMap,
    tickToMs,
    msToTick,
    tuningName,
    tuningReference,
    noteName,
    markRepeats,
    annotate,
    lyricsShown,
    markArpeggios,
} from "./music.js";
import { suggestPositions, fingerFor } from "./fingering.js";

// Set once the player is up. The controls settle all through start-up, before the hook exists and with nothing
// listening yet, and tellControls runs on each of them: declared here so it is never read before it is set
let announcing = false;
import {
    LOOKS,
    COLORS,
    FONTS,
    STRINGS,
    DEFAULT_STYLE,
    theme as makeTheme,
} from "./themes.js";
import {
    drawHighway,
    drawTab,
    lookAhead,
    HEADSTOCKS,
    headstockParts,
    spline,
} from "./highway.js";
import { onsetEnvelope, align } from "./sync.js";
import {
    startProfiler,
    startFrame,
    lap,
    endFrame,
    benchTime,
} from "./perf.js";

const $ = (id) => document.getElementById(id);
// Where the player lives: the element it's mounted in on a page that isn't its own (see mount.js), or else the page. Found
// once, here. What is the page's there is this element's: the classes and colours of the look, the full screen, the box
// things are fixed to, the keys and the drops; the title stays the page's own
const root =
        document.querySelector("[data-fretfall]") ??
        document.documentElement,
    mounted = root !== document.documentElement;
const CDN =
    "https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.4/dist/";
const OPEN_STRINGS = {
    4: [28, 33, 38, 43],
    5: [23, 28, 33, 38, 43],
    6: [40, 45, 50, 55, 59, 64],
    7: [35, 40, 45, 50, 55, 59, 64],
};
const PLAY =
    '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M6.5 4.2v11.6L16 10z"/></svg>';
const PAUSE =
    '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7.5 4.5v11M12.5 4.5v11"/></svg>';
const ENTER_FULLSCREEN =
    '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4"/></svg>';
const EXIT_FULLSCREEN =
    '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 3.5v4h-4M16.5 7.5h-4v-4M12.5 16.5v-4h4M3.5 12.5h4v4"/></svg>';
const setIcon = (button, svg) => {
    button.querySelector("svg")?.remove();
    button.insertAdjacentHTML("afterbegin", svg);
}; // swaps the drawing, keeping the button's tooltip
const clock = (s) =>
    `${s < 0 ? "-" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, "0")}`; // negative: the recording's intro before the tab starts
const paint = () =>
    new Promise((r) => {
        requestAnimationFrame(() => setTimeout(r));
        setTimeout(r, 100);
    }); // background tabs get no frames


// --- Settings: look, colours and fonts mix freely; everything is remembered per browser
const FRAMES = {
    gradient: { label: "Gradient" },
    box: { label: "Box" },
};
const REPEAT_MARKS = {
    frame: { label: "Frame only" },
    grey: { label: "Greyed marks" },
    hide: { label: "No marks" },
};
const TAB_LAYOUTS = {
    scroll: { label: "Scroll" },
    pages: { label: "Pages" },
}; // the 2D tab view: notes scrolling to the play line, or a page of bars at a time
const MARKINGS = {
    black: { label: "Black" },
    white: { label: "White" },
};
const STRING_ORDERS = {
    low: { label: "Low E on top" },
    high: { label: "High e on top" },
}; // looking down at the guitar, or as in tab
const VIEW_DEFAULTS = 8; // bumped whenever a default changes: 4 changed the view sliders (defaults and scale), 5 repeated chords, 6 the side angle, 7 fret numbers, 8 their opacity
const VIEW_START = {
    viewAngle: 30,
    sideAngle: 5,
    noteSpeed: 1,
    drawDistance: 1,
    fretWidth: 1,
    boardHeight: 1,
};
const settings = {
    ...DEFAULT_STYLE,
    volume: 0.8,
    volumeMuted: false,
    frames: "gradient",
    repeatMarks: "frame",
    markings: "black",
    stringOrder: "low",
    headstock: "inline",
    offset: 0,
    mute: false,
    autoplay: false,
    metronome: false,
    minimal: false,
    tabView: false,
    tabLayout: "scroll",
    guides: true,
    fretNumbers: 0.5,
    songIntro: true,
    noteLines: 0.5,
    notes3d: true,
    ...VIEW_START,
    viewDefaults: VIEW_DEFAULTS,
    panel: "view",
};
const DEFAULTS = { ...settings }; // before this browser's are laid over them, for Reset settings
try {
    const saved = JSON.parse(
        localStorage.getItem("fretfall") ?? "{}",
    );
    const version = saved.viewDefaults ?? 0; // saved under older defaults: whatever changed since starts from its new default
    if (version < 4)
        for (const key of Object.keys(VIEW_START))
            delete saved[key];
    if (version < 5) delete saved.repeatMarks;
    if (version < 6) delete saved.sideAngle;
    if (version < 8) delete saved.fretNumbers; // saved while it was an on/off switch
    delete saved.viewDefaults;
    if (typeof saved.noteLines !== "number") delete saved.noteLines; // saved while it was an on/off switch
    Object.assign(settings, saved);
} catch {}
for (const [key, options, fallback] of [
    ["look", LOOKS],
    ["colors", COLORS],
    ["fonts", FONTS],
    ["strings", STRINGS],
    ["frames", FRAMES, "gradient"],
    ["repeatMarks", REPEAT_MARKS, "frame"],
    ["markings", MARKINGS, "black"],
    ["tabLayout", TAB_LAYOUTS, "scroll"],
    ["stringOrder", STRING_ORDERS, "low"],
    ["headstock", HEADSTOCKS, "inline"],
])
    if (!options[settings[key]])
        settings[key] = fallback ?? DEFAULT_STYLE[key];
const save = () => {
    try {
        localStorage.setItem("fretfall", JSON.stringify(settings));
    } catch {}
};
const loudness = () => (settings.volumeMuted ? 0 : settings.volume);
let theme;

function applyTheme() {
    theme = {
        ...makeTheme(settings),
        guides: settings.guides,
        fretNumbers: settings.fretNumbers,
        noteLines: settings.noteLines,
        notes3d: settings.notes3d,
        frames: settings.frames,
        repeatMarks: settings.repeatMarks,
        markings: settings.markings,
        tabLayout: settings.tabLayout,
        stringOrder: settings.stringOrder,
        headstock: settings.headstock,
        viewAngle: settings.viewAngle,
        sideAngle: settings.sideAngle,
        noteSpeed: settings.noteSpeed,
        drawDistance: settings.drawDistance,
        fretWidth: settings.fretWidth,
        boardHeight: settings.boardHeight,
        fill: settings.minimal, // nothing over the highway: it grows into the room
    };
    root.classList.toggle("minimal", settings.minimal);
    root.classList.toggle("tab2d", settings.tabView);
    $("fonts").href = theme.href;
    const vars = {
        bg: theme.bg,
        ink: theme.ink,
        text: theme.text,
        muted: theme.muted,
        accent: theme.accent,
        chip: theme.chip,
        "chip-border": theme.chipBorder,
        done: theme.phraseDone,
        todo: theme.phraseTodo,
        ui: theme.ui,
        num: theme.num,
        lyric: theme.lyric,
        "lyric-style": theme.lyricStyle,
    };
    Object.assign(
        vars,
        { lane: theme.anchorLane },
        Object.fromEntries(theme.str.map((c, i) => [`s${i}`, c])),
    ); // the legend draws with these
    for (const [k, v] of Object.entries(vars))
        root.style.setProperty(`--${k}`, v);
    for (const seg of root.querySelectorAll("[data-setting]"))
        for (const b of seg.children) {
            b.setAttribute(
                "aria-pressed",
                String(b.value === settings[seg.dataset.setting]),
            );
            if (b.dots)
                b.dots.replaceChildren(
                    ...dotsFor(seg.dataset.setting, b.value).map(
                        (c) =>
                            Object.assign(
                                document.createElement("i"),
                                { style: `background: ${c}` },
                            ),
                    ),
                );
        }
}
// A headstock's card draws it as on the fretboard: its keys and outline, truss rod cover, the strings
// running from where they end over the nut and on along the neck to the right
const headstockCard = (id) => {
    const head = HEADSTOCKS[id],
        strings = Array.from({ length: 6 }, (_, s) => 0.83 * (1 - (2 * s) / 5)),
        { outline, ends, keys } = headstockParts(head, strings);
    const x = (u) => (96 - u * 12).toFixed(1),
        y = (v) => (28 - v * 12).toFixed(1),
        d = (points) =>
            `M${points.map(([u, v]) => `${x(u)} ${y(v)}`).join("L")}`;
    return `<svg class="headstock" viewBox="8 -2 114 60" preserveAspectRatio="xMinYMid meet" aria-hidden="true" fill="currentColor" stroke="currentColor">${[
        ...keys.map(
            ({ u, side, edge }) =>
                `<ellipse cx="${x(u)}" cy="${y(edge + side * 0.36)}" rx="1.5" ry="2.6" fill-opacity=".35" stroke="none"/>`,
        ),
        `<path d="${d(outline)}Z" fill-opacity=".1" stroke-width="1.2"/>`,
        head.cover &&
            `<path d="${d(spline(head.cover))}Z" fill="none" stroke-width=".6"/>`,
        `<path d="${d([[0, 1], [-2.1, 1]])} ${d([[0, -1], [-2.1, -1]])}" fill="none" stroke-width="1.2"/>`,
        `<path d="${d([[0, 1.05], [0, -1.05]])}" stroke-width="2.4"/>`,
        ...strings.map(
            (v, s) =>
                `<path d="${d([ends[s], [0, v], [-2.1, v]])}" fill="none" stroke-width=".7"/>`,
        ),
        ...ends.map(
            ([u, v]) =>
                `<circle cx="${x(u)}" cy="${y(v)}" r="1.1" stroke="none"/>`,
        ),
    ]
        .filter(Boolean)
        .join("")}</svg>`;
};
// Cards preview their option: a preset's six string colours, a colour theme's floor, lanes, accent and text, or the
// strings in order from the top
const dotsFor = (setting, value) => {
    if (setting === "strings")
        return (
            STRINGS[value].str ?? COLORS[settings.colors].str
        ).slice(0, 6);
    const c = COLORS[value];
    return [c.floor0, c.lane, c.accent, c.text];
};
for (const seg of root.querySelectorAll("[data-setting]")) {
    const setting = seg.dataset.setting,
        options = {
            look: LOOKS,
            colors: COLORS,
            fonts: FONTS,
            strings: STRINGS,
            frames: FRAMES,
            repeatMarks: REPEAT_MARKS,
            markings: MARKINGS,
            tabLayout: TAB_LAYOUTS,
            stringOrder: STRING_ORDERS,
            headstock: HEADSTOCKS,
        }[setting];
    for (const [value, { label }] of Object.entries(options)) {
        const b = Object.assign(document.createElement("button"), {
            value,
            textContent: label,
        });
        if (setting === "stringOrder")
            b.prepend(
                Object.assign(document.createElement("span"), {
                    className: "order",
                    textContent:
                        value === "low"
                            ? "E A D G B e"
                            : "e B G D A E",
                }),
            );
        else if (setting === "headstock")
            b.insertAdjacentHTML("afterbegin", headstockCard(value));
        else if (seg.classList.contains("cards"))
            b.prepend(
                (b.dots = Object.assign(
                    document.createElement("span"),
                    { className: "dots", ariaHidden: "true" },
                )),
            );
        b.onclick = () => {
            settings[setting] = value;
            save();
            applyTheme();
        };
        seg.append(b);
    }
}
const fill = (range) =>
    range.style.setProperty(
        "--fill",
        `${((range.value - range.min) / (range.max - range.min)) * 100}%`,
    ); // the slider's track, lit up to the thumb
// The view sliders (and the note lines') change the highway straight away, without reloading the theme's fonts
const VIEW = {
    viewAngle: (v) => `${v}°`,
    sideAngle: (v) =>
        v ? `${Math.abs(v)}° ${v < 0 ? "left" : "right"}` : "Straight",
    noteSpeed: (v) => `${Math.round(v * 100)}%`,
    drawDistance: () => `${lookAhead(settings).toFixed(1)} s`,
    fretWidth: (v) => `${Math.round(v * 100)}%`,
    boardHeight: (v) => `${Math.round(v * 100)}%`,
    noteLines: (v) => `${Math.round(v * 100)}%`,
    fretNumbers: (v) => `${Math.round(v * 100)}%`,
};
const showView = () => {
    for (const [key, show] of Object.entries(VIEW))
        $(`${key}Out`).value = show(settings[key]);
};
const setView = (values) => {
    for (const [key, value] of Object.entries(values)) {
        theme && (theme[key] = value);
        settings[key] = $(key).value = value;
        fill($(key));
    }
    showView();
    save();
};
for (const key in VIEW) {
    $(key).value = settings[key];
    fill($(key));
    $(key).oninput = (e) => setView({ [key]: +e.target.value });
}
showView();
// Everything in the settings dialog back to its default. The volume, the toolbar's switches and the open tab stay
$("resetSettings").onclick = () => {
    const { volume, volumeMuted, metronome, minimal, tabView, panel } = settings;
    Object.assign(settings, DEFAULTS, { volume, volumeMuted, metronome, minimal, tabView, panel });
    for (const key of ["guides", "notes3d", "songIntro", "mute", "autoplay"])
        $(key).checked = settings[key];
    if (arr?.track) api.changeTrackMute([arr.track], settings.mute);
    setOffset(settings.offset);
    applyTheme();
    setView(Object.fromEntries(Object.keys(VIEW).map((key) => [key, settings[key]])));
};
const setOffset = (ms) => {
    settings.offset = $("offset").value = ms;
    $("offsetOut").value = `${ms > 0 ? "+" : ""}${ms} ms`;
    fill($("offset"));
    save();
};
setOffset(settings.offset);
$("offset").oninput = (e) => setOffset(+e.target.value);
$("resetOffset").onclick = () => setOffset(0);

// Volume: the speaker opens a slider under it, with a speaker of its own that mutes (as does M)
const SPEAKER = (waves) =>
    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5h3L10.5 4v12l-4-3.5h-3z"/>${waves}</svg>`;
function setVolume(
    volume = settings.volume,
    muted = settings.volumeMuted,
) {
    Object.assign(settings, {
        volume,
        volumeMuted: muted || volume === 0,
    });
    $("volume").value = loudness();
    $("volumeOut").value = `${Math.round(loudness() * 100)}%`;
    fill($("volume"));
    const speaker = SPEAKER(
        settings.volumeMuted
            ? '<path d="M13.5 8l4 4M17.5 8l-4 4"/>'
            : volume < 0.5
              ? '<path d="M13.5 8a3 3 0 0 1 0 4"/>'
              : '<path d="M13.5 8a3 3 0 0 1 0 4M15.5 5.5a6.5 6.5 0 0 1 0 9"/>',
    );
    setIcon($("volumeButton"), speaker);
    $("volumeMute").innerHTML = speaker;
    $("volumeButton").classList.toggle(
        "muted",
        settings.volumeMuted,
    );
    $("volumeMute").setAttribute(
        "aria-pressed",
        String(settings.volumeMuted),
    );
    $("volumeMute").setAttribute(
        "aria-label",
        settings.volumeMuted ? "Unmute" : "Mute",
    );
    player?.setVolume(loudness());
    save();
    tellControls();
}
const toggleVolume = (open = $("volumePanel").hidden) => {
    $("volumePanel").hidden = !open;
    $("volumeButton").setAttribute("aria-expanded", String(open));
};
$("volume").oninput = (e) => setVolume(+e.target.value, false);
$("volumeButton").onclick = () => toggleVolume();
$("volumeMute").onclick = () =>
    setVolume(settings.volume || 0.8, !settings.volumeMuted);
for (const key of ["guides", "notes3d", "songIntro"]) {
    $(key).checked = settings[key];
    $(key).onchange = (e) => {
        settings[key] = e.target.checked;
        save();
        applyTheme();
    };
}
$("autoplay").checked = settings.autoplay;
$("autoplay").onchange = (e) => {
    settings.autoplay = e.target.checked;
    save();
};
$("mute").checked = settings.mute;
$("mute").onchange = (e) => {
    settings.mute = e.target.checked;
    save();
    if (arr?.track) api.changeTrackMute([arr.track], settings.mute);
};
const showPanel = (name) => {
    for (const tab of root.querySelectorAll("[data-tab]")) {
        const on = tab.dataset.tab === name;
        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
        $(`pane-${tab.dataset.tab}`).hidden = !on;
    }
    settings.panel = name;
    save();
};
for (const tab of root.querySelectorAll("[data-tab]")) {
    tab.onclick = () => showPanel(tab.dataset.tab);
    tab.onkeydown = (e) => {
        // arrow keys move between tabs
        const tabs = [...root.querySelectorAll("[data-tab]")],
            step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        const next =
            tabs[
                (tabs.indexOf(tab) + step + tabs.length) %
                    tabs.length
            ];
        showPanel(next.dataset.tab);
        next.focus();
    };
}
showPanel(
    root.querySelector(`[data-tab="${settings.panel}"]`)
        ? settings.panel
        : "view",
);
// Settings and the notation legend open as sheets from the header, one at a time
const SHEETS = {
    settings: "settingsButton",
    legend: "legendButton",
};
function toggleSheet(name, open = $(name).hidden) {
    for (const [sheet, button] of Object.entries(SHEETS)) {
        const show = sheet === name && open,
            changed = $(sheet).hidden === show;
        $(sheet).hidden = !show;
        $(button).setAttribute("aria-expanded", String(show));
        if (changed) announce("sheet", { name: sheet, open: show });
    }
    tellControls();
}
for (const [sheet, button] of Object.entries(SHEETS)) {
    $(button).onclick = () => toggleSheet(sheet);
    $(`${sheet}Close`).onclick = () => {
        toggleSheet(sheet, false);
        $(button).focus();
    };
}
// Small screens: everything but the part picker, speed and volume folds into a menu. The picker stays beside the
// logo; on phones it leads the row of speed and volume under it
const compact = matchMedia("(max-width: 900px)"),
    phone = matchMedia("(max-width: 560px)");
const toggleMenu = (
    open = $("menuButton").ariaExpanded !== "true",
) => $("menuButton").setAttribute("aria-expanded", String(open));
const placeParts = () => {
    if (docks.length) return; // docked, the page's bar places them
    if (phone.matches)
        root.querySelector(".speed").before($("arrangements"));
    else
        root.querySelector(".wordmark").after($("arrangements"));
    toggleMenu(false);
};
// Docked (fretfall.dock): the header's controls in an element of the page around the player, its own bar say, so the
// page has one bar and the highway the row. Bound by id, they work wherever they stand. The element becomes a root of
// the mounted styles (data-fretfall) so they reach the controls, in the stylesheet's own colours and fonts (the theme's
// are set on this root: the page's bar sets the variables it wants on its element); data-fretfall-dock keeps mount.js's
// size container and the page-level rules off it (scope.mjs). The menu and its button stay home: the page's bar decides
// what folds
const barTools = [
    $("arrangements"),
    ...root.querySelectorAll(
        ".bar > .group:last-child > :not(#menuButton, #menu), #menu > :not(.divider)",
    ),
];
const MORE = new Set(["legendButton", "settingsButton", "fullscreen"]); // the menu's last three, for a bar with a right side of its own
let docks = [],
    homes = []; // the page's elements holding the tools, and where each tool stood: [parent, next sibling]
function dockTools(element, more = element) {
    for (let i = homes.length; i--; )
        homes[i][0].insertBefore(barTools[i], homes[i][1]); // last first, so its next sibling is back already
    for (const el of docks)
        for (const name of ["data-fretfall", "data-fretfall-dock"])
            el.removeAttribute(name);
    docks = element ? [...new Set([element, more])] : [];
    homes = docks.length
        ? barTools.map((el) => [el.parentNode, el.nextSibling])
        : [];
    for (const el of docks)
        for (const name of ["data-fretfall", "data-fretfall-dock"])
            el.setAttribute(name, "");
    if (docks.length)
        for (const el of barTools)
            (MORE.has(el.id) ? more : element).append(el);
    root.querySelector(".bar").hidden = docks.length > 0;
    root.toggleAttribute("data-docked", docks.length > 0); // what sat under the bar moves up (the page's CSS)
    placeParts();
}
compact.onchange = phone.onchange = placeParts;
placeParts();
$("menuButton").onclick = () => toggleMenu();
$("menu").onclick = (e) => {
    if (e.target.closest("button")) toggleMenu(false);
}; // picking something closes it
addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".sheet, #settingsButton, #legendButton"))
        toggleSheet("settings", false);
    if (!e.target.closest(".volume")) toggleVolume(false);
    if (!e.target.closest("#menu, #menuButton")) toggleMenu(false);
});

// --- Notation legend: what each mark on the highway, or on the 2D tab, means, drawn in the current theme's colours
const svg = (inner) =>
    `<svg viewBox="0 0 56 32" aria-hidden="true">${inner}</svg>`;
const gem = (x, y, w = 24, h = 12, c = 1, label = "") =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="f${c}"/><rect x="${x}" y="${y}" width="${w}" height="${h / 4}" class="fw" opacity=".35"/>${label ? `<text x="${x + w / 2}" y="${y + h / 2 + 0.5}" class="fi" font-size="${h * 0.75}">${label}</text>` : ""}`;
const word = (text, size = 13, cls = "ft", extra = "") =>
    `<text x="28" y="16.5" class="${cls}" font-size="${size}" ${extra}>${text}</text>`;
const above = (mark, size = 11) =>
    `${gem(16, 17, 24, 11)}<text x="28" y="9" class="ft" font-size="${size}">${mark}</text>`;
const LEGEND = [
    [
        "Notes and chords",
        [
            [
                "Note",
                "Play this string at this fret when its white line on the floor reaches the fretboard. The number on it is the finger to use (T = thumb).",
                svg(
                    `${gem(16, 8, 24, 12, 1, "1")}<path d="M16 27h24" class="lw" stroke-width="2" opacity=".6"/>`,
                ),
            ],
            [
                "Fret number",
                "The fret to play, on the floor under the note.",
                svg(
                    `${gem(20, 3, 16, 7)}<path d="M28 10v8" class="l1" stroke-width="1.5"/><text x="28" y="25" class="f1" font-size="11">7</text>`,
                ),
            ],
            [
                "Open string",
                "Play the string without fretting it. The bar spans your hand position; held, it becomes a lane that wide.",
                svg(
                    `<rect x="6" y="11" width="44" height="5" class="f3"/><path d="M6 25h44" class="lw" stroke-width="2" opacity=".6"/>`,
                ),
            ],
            [
                "Played again",
                "The same chord as just before: strum it again on this beat. It shows as its frame alone, or as outlines with its marks greyed out or hidden (Settings). Single notes always show in full.",
                svg(
                    `<rect x="6" y="4" width="44" height="22" class="lt" stroke-width="1" opacity=".5"/><path d="M6 26h44" class="lw" stroke-width="2" opacity=".6"/>`,
                ),
            ],
            [
                "Chord",
                "Play these notes together. The white line marks the beat; the chord name shows when it changes. Held or played again, its edges run on as rails until the shape changes.",
                svg(
                    `<rect x="6" y="4" width="44" height="22" class="lt" stroke-width="1" opacity=".5"/>${gem(14, 16, 12, 5, 0)}${gem(30, 10, 12, 5, 1)}<path d="M6 26h44" class="lw" stroke-width="2" opacity=".6"/>`,
                ),
            ],
            [
                "Accented chord",
                "Strum it harder: the top corners of its frame shine white, bolder for a heavy accent.",
                svg(
                    `<rect x="6" y="4" width="44" height="22" class="lt" stroke-width="1" opacity=".3"/><path d="M6 12V4h12M38 4h12v8" class="lw" stroke-width="3" fill="none" stroke-linecap="square"/>${gem(14, 16, 12, 5, 0)}${gem(30, 10, 12, 5, 1)}<path d="M6 26h44" class="lw" stroke-width="2" opacity=".6"/>`,
                ),
            ],
            [
                "Arpeggio",
                "Hold the chord shape and play its strings one at a time: the shape's rails run as long as you hold it, every note rings on as a dashed trail, and the board outlines every spot of the shape.",
                svg(
                    `<path d="M8 30V6M48 30V6" class="ll" stroke-width="2.5"/><path d="M8 6h40" class="ll" stroke-width="1" opacity=".6"/>${gem(14, 20, 12, 5, 1)}<path d="M20 20V8" class="l1" stroke-width="1.6" stroke-dasharray="3 2"/>${gem(32, 12, 12, 5, 3)}`,
                ),
            ],
            [
                "Chord name",
                "The chord you are playing, big, to the right of your hand. It shows up a second before the chord.",
                svg(word("G5", 16)),
            ],
            [
                "Barre",
                "Lay one finger across several strings at this fret. ½B is a half barre.",
                svg(
                    `<rect x="6" y="4" width="44" height="22" class="lt" stroke-width="1" opacity=".5"/><path d="M24 8v16" class="lt" stroke-width="4" opacity=".8"/><text x="36" y="10" class="ft" font-size="9">B</text>`,
                ),
            ],
            [
                "Hand position",
                "Where your index finger sits. A new band with a number means move your hand there.",
                svg(
                    `<rect x="16" y="2" width="34" height="28" class="fl" opacity=".2"/><path d="M16 2v28M50 2v28" class="ll" stroke-width="1.5"/><text x="9" y="17" class="fl" font-size="10">5</text>`,
                ),
            ],
            [
                "Capo",
                "Clamped across the neck: from there the strings play open, and the dark frets behind it are out of play.",
                svg(
                    `<path d="M4 9h14M4 14h14M4 19h14M4 24h14" class="lt" stroke-width="1" opacity=".15"/><path d="M18 9h32M18 14h32M18 19h32M18 24h32" class="lt" stroke-width="1" opacity=".5"/><path d="M32 6v20M46 6v20" class="lt" stroke-width="1" opacity=".3"/><path d="M18 4v24" class="lt" stroke-width="4.5"/>`,
                ),
            ],
            [
                "Where to press",
                "The spot on the fretboard lights up as the note comes close and fills in when you play it.",
                svg(
                    `<path d="M2 16h52" class="l2" stroke-width="2"/><rect x="18" y="10" width="20" height="12" class="f2" opacity=".35"/><rect x="18" y="10" width="20" height="12" class="l2" stroke-width="1.6"/>`,
                ),
            ],
            [
                "String number",
                "Play it on this string (1 is the high e).",
                svg(
                    `<circle cx="28" cy="16" r="9" class="l2" stroke-width="1.5"/><text x="28" y="16.5" class="f2" font-size="10">3</text>`,
                ),
            ],
        ],
    ],
    [
        "Picking hand",
        [
            [
                "Palm mute",
                "Rest the side of your picking hand on the strings near the bridge: a big dark X across the note.",
                svg(
                    `${gem(16, 10, 24, 12, 0)}<path d="M18 11l20 10M18 21l20-10" class="li" stroke-width="2" opacity=".85"/>`,
                ),
            ],
            [
                "Fret-hand mute",
                "Touch the string with your fretting hand without pressing it down, for a percussive click: a small white X on the note.",
                svg(
                    `${gem(16, 10, 24, 12, 0)}<path d="M24.5 13l7 6M24.5 19l7-6" class="li" stroke-width="3.5" opacity=".7"/><path d="M24.5 13l7 6M24.5 19l7-6" class="lw" stroke-width="1.8"/>`,
                ),
            ],
            [
                "Down and up strokes",
                "Pick down (⊓) or up (V).",
                svg(
                    `<path d="M10 22V10h12v12" class="lt" stroke-width="1.8"/><path d="M34 10l6 12 6-12" class="lt" stroke-width="1.8"/>`,
                ),
            ],
            [
                "Picking-hand fingers",
                "p thumb, i index, m middle, a ring, c little finger.",
                svg(
                    word(
                        "p i m a",
                        12,
                        "ft",
                        'font-style="italic"',
                    ),
                ),
            ],
            [
                "Strum",
                "Strum the chord in the direction of the arrow, where a Guitar Pro file marks it.",
                svg(
                    `<path d="M28 5v22M23 21l5 6 5-6" class="lt" stroke-width="1.8"/>`,
                ),
            ],
            [
                "Rolled chord",
                "Roll the chord: sound the strings one after another, quickly.",
                svg(
                    `<path d="M28 4q4 3 0 5.5t0 5.5 0 5.5 0 5.5M23 21l5 6 5-6" class="lt" stroke-width="1.6"/>`,
                ),
            ],
            [
                "Tremolo picking",
                "Pick the note as fast as you can for its whole length.",
                svg(
                    `${gem(16, 20, 24, 9)}<path d="M22 12l12-4M22 16l12-4M22 8l12-4" class="lt" stroke-width="1.6"/>`,
                ),
            ],
            [
                "Rasgueado",
                "Flamenco strum: flick the fingers out one after another in the pattern shown.",
                svg(word("rasg.", 12)),
            ],
            [
                "Slap and pop",
                "Bass: hit the string with your thumb, or pull it away with a finger and let it snap back.",
                svg(word("slap", 12)),
            ],
            [
                "Golpe",
                "Tap the body of the guitar with your thumb or a finger.",
                svg(word("golpe", 12)),
            ],
        ],
    ],
    [
        "Fretting hand and legato",
        [
            [
                "Hammer-on",
                "Sound the note by hammering a finger down, without picking: a white triangle on the note, pointing down.",
                svg(
                    `${gem(16, 14, 24, 12)}<path d="M22 7h12l-6 10z" class="fw li" stroke-width="1.2"/>`,
                ),
            ],
            [
                "Pull-off",
                "Pull your finger off the string to sound the lower note: a white triangle on the note, pointing up.",
                svg(
                    `${gem(16, 14, 24, 12)}<path d="M22 17h12l-6-10z" class="fw li" stroke-width="1.2"/>`,
                ),
            ],
            [
                "Tie",
                "Hold the note on into the next one without playing it again.",
                svg(
                    `${gem(4, 19, 16, 8)}${gem(36, 19, 16, 8)}<path d="M12 18Q28 4 44 18" class="lt" stroke-width="1.4" stroke-dasharray="3 3"/>`,
                ),
            ],
            [
                "Slide",
                "Slide to the fret where the trail ends. A dashed end means slide off without a clear target. From an open string, an arch runs from its bar to the fret you land on.",
                svg(
                    `${gem(4, 20, 16, 8)}<path d="M12 20L40 8" class="l1" stroke-width="3" opacity=".6"/><rect x="32" y="3" width="16" height="7" class="l1" stroke-width="1.5"/>`,
                ),
            ],
            [
                "Slide in and out",
                "Slide into the note from below or above, or off it at the end.",
                svg(
                    `<path d="M6 27L22 17" class="l1" stroke-width="2" stroke-dasharray="3 3"/>${gem(22, 10, 22, 12)}`,
                ),
            ],
            [
                "Tapping",
                "Tap the note with a finger of your picking hand: an arrow in its colour on the note, pointing down. m.g. marks a tap with the fretting hand.",
                svg(
                    `${gem(16, 17, 24, 11)}<path d="M20 4L28 16L36 4L28 8.5Z" class="f1" opacity=".45"/><path d="M20 4L28 16L36 4L28 8.5Z" class="l1" stroke-width="1.6"/>`,
                ),
            ],
            [
                "Grace note",
                "A quick note played just before the beat.",
                svg(
                    `${gem(22, 12, 12, 7, 2)}<path d="M18 24L38 7" class="lt" stroke-width="1.4"/>`,
                ),
            ],
            [
                "Trill",
                "Alternate quickly between the note and the fret shown.",
                svg(word("tr 7", 13, "ft", 'font-style="italic"')),
            ],
            [
                "Turn and mordent",
                "Ornaments: a quick flick to the neighbouring notes and back.",
                svg(word("turn", 12)),
            ],
        ],
    ],
    [
        "Sustain and pitch",
        [
            [
                "Sustain",
                "Keep the note ringing for as long as its trail.",
                svg(
                    `<path d="M24 20L26 2h4l2 18z" class="f1" opacity=".5"/>${gem(16, 18, 24, 10)}`,
                ),
            ],
            [
                "Let ring",
                "Let the note ring on over the notes after it.",
                svg(
                    `<path d="M28 18V2" class="l1" stroke-width="2" stroke-dasharray="3 3"/>${gem(16, 18, 24, 10)}`,
                ),
            ],
            [
                "Vibrato",
                "Shake the note. A taller wave means a wider vibrato.",
                svg(
                    `${gem(16, 19, 24, 9)}<path d="M13 9q2.5-4 5 0t5 0 5 0 5 0 5 0 5 0" class="lt" stroke-width="1.6"/>`,
                ),
            ],
            [
                "Bend",
                "Bend the string up by the amount shown: ½ is one fret higher, full is two. The chevrons on the note point up; its trail rises where the bend happens; on the fretboard the string bends up while you hold it.",
                svg(
                    `${gem(6, 21, 20, 8)}<path d="M10 16l6-4 6 4M10 11l6-4 6 4" class="lt" stroke-width="1.6"/><text x="40" y="11" class="ft" font-size="9">full</text>`,
                ),
            ],
            [
                "Bend and release",
                "Bend up, then let the string back down: chevrons up, then down, and the trail rises and comes back down.",
                svg(
                    `${gem(4, 21, 20, 8)}<path d="M8 16l6-4 6 4M24 8l6 4 6-4" class="lt" stroke-width="1.6"/><text x="46" y="11" class="ft" font-size="9">full</text>`,
                ),
            ],
            [
                "Pre-bend",
                "Bend the string before you pick it, then play.",
                svg(word("pre ½", 12)),
            ],
            [
                "Whammy bar",
                "Push or pull the whammy bar; the trail dips and rises with it.",
                svg(
                    `<text x="28" y="8" class="ft" font-size="9">w/bar</text><path d="M6 20q11 12 22 0t22 0" class="l1" stroke-width="2"/>`,
                ),
            ],
        ],
    ],
    [
        "Harmonics",
        [
            [
                "Natural harmonic",
                "Touch the string lightly right above the fret wire, without pressing, and pick.",
                svg(
                    `<path d="M20 4l7 7-7 7-7-7z" class="f4"/><text x="40" y="12" class="f4" font-size="10">&lt;12&gt;</text>`,
                ),
            ],
            [
                "Pinch harmonic",
                "Catch the string with the side of your thumb just after the pick.",
                svg(above("PH", 10)),
            ],
            [
                "Artificial harmonic",
                "Fret the note and touch the string 12 frets higher while you pick.",
                svg(above("AH", 10)),
            ],
            [
                "Tapped harmonic",
                "Fret the note and tap the string 12 frets higher.",
                svg(above("TH", 10)),
            ],
            [
                "Semi and feedback harmonics",
                "SH: half harmonic, half note. FH: hold it until it feeds back.",
                svg(above("SH", 10)),
            ],
        ],
    ],
    [
        "Articulation and expression",
        [
            [
                "Accent",
                "Play it louder. ^ is a strong accent; – means hold it for its full length.",
                svg(above("&gt;", 12)),
            ],
            [
                "Staccato",
                "Short: stop the note right after you play it.",
                svg(
                    `${gem(16, 17, 24, 11)}<circle cx="28" cy="9" r="2.2" class="ft"/>`,
                ),
            ],
            [
                "Ghost note",
                "Barely audible: felt more than heard.",
                svg(word("(7)", 14, "f1")),
            ],
            [
                "Dynamics",
                "How loud, from very soft (pp) to very loud (ff). Shown where it changes.",
                svg(word("mf", 15, "ft", 'font-style="italic"')),
            ],
            [
                "Crescendo and diminuendo",
                "Get louder along an opening wedge, softer along a closing one. It shows left of the neck where it starts, beside the bar markings.",
                svg(
                    `<path d="M8 16L48 8M8 16l40 8" class="lt" stroke-width="1.6"/>`,
                ),
            ],
            [
                "Swell and fade",
                "Fade the note in with the volume knob, or fade it out.",
                svg(word("swell", 12)),
            ],
            [
                "Wah",
                "Wah pedal open (o) or closed (+).",
                svg(word("o  +", 14)),
            ],
            [
                "Fermata",
                "Hold the note longer than written.",
                svg(
                    `<path d="M16 22a12 12 0 0 1 24 0" class="lt" stroke-width="1.8"/><circle cx="28" cy="19" r="2.2" class="ft"/>`,
                ),
            ],
        ],
    ],
    [
        "On the floor",
        [
            [
                "Tempo, time and key",
                "From this bar on, a new tempo, time signature, key or swing feel.",
                svg(word("♩ = 120", 11, "fa")),
            ],
            [
                "Repeats and endings",
                "Where a repeat starts, how many times, and which ending you are on.",
                svg(word("repeat ×2", 10, "fa")),
            ],
            [
                "Jumps",
                "Road signs to follow: segno, coda, D.C. (from the start), D.S. (from the segno), fine.",
                svg(word("D.S. al coda", 8, "fa")),
            ],
            [
                "8va and loco",
                "Play an octave higher, until loco.",
                svg(word("8va", 13, "fa")),
            ],
            [
                "Text",
                "Instructions written in the file, like pizz. or bass stop.",
                svg(word("pizz.", 13, "fa")),
            ],
        ],
    ],
];
// The same marks as they show in the 2D tab view: bars along faint strings, a fret number at their start
const lane = (...ys) =>
    ys.map((y) => `<path d="M2 ${y}h52" class="lt" stroke-width=".8" opacity=".3"/>`).join("");
const tx = (x, y, text, size = 8, cls = "fi", extra = "") =>
    `<text x="${x}" y="${y + 0.5}" class="${cls}" font-size="${size}" ${extra}>${text}</text>`;
const bar = (x, y, w, c, fret, extra = "", at = x + Math.min(w, 12) / 2) =>
    `<rect x="${x}" y="${y - 5}" width="${w}" height="10" rx="2" class="f${c}" ${extra}/>${fret ? tx(at, y, fret) : ""}`;
const bracket = (y0, y1, cls = 'class="lt" stroke-width="1.5" opacity=".7"') =>
    `<path d="M14 ${y0}h-3v${y1 - y0}h3" ${cls}/>`;
const over = (mark, size = 9, extra = "") =>
    `${lane(23)}${bar(22, 23, 12, 1, "5")}${tx(28, 10, mark, size, "ft", extra)}`;
const barMark = (text, size = 8) =>
    `<path d="M8 12v18" class="lt" stroke-width="1" opacity=".4"/>${tx(12, 6, "5", 7, "fm")}${tx(34, 6, text, size, "fa")}`;
const TAB_LEGEND = [
    [
        "Notes and chords",
        [
            [
                "Note",
                "Play this string at this fret when the start of its bar reaches the play line. The small number beside the fret is the finger to use (T = thumb).",
                svg(`${lane(16)}${bar(10, 16, 36, 1, "7")}${tx(22, 16.5, "1", 5.5, "fi", 'opacity=".7"')}`),
            ],
            [
                "Play line",
                "Play each note as it reaches the line. Scrolling, played notes dim and fade out to the left; in pages (Settings), the page holds still and the line moves across it.",
                svg(`${lane(16)}${bar(4, 16, 12, 1, "3", 'opacity=".4"')}<path d="M21 3v26" class="la" stroke-width="2.5"/>${bar(26, 16, 24, 1, "5")}`),
            ],
            [
                "Open string",
                "Play the string without fretting it.",
                svg(`${lane(16)}${bar(22, 16, 12, 3, "0")}`),
            ],
            [
                "Played again",
                "The same chord as just before: strum it again on this beat. Its notes show as outlines, their marks greyed out.",
                svg(`${lane(16)}<rect x="20" y="11" width="16" height="10" rx="2" class="l1" stroke-width="1.5"/>${tx(28, 16, "5", 8, "f1")}`),
            ],
            [
                "Chord",
                "Play these notes together: a bracket runs down the side of them.",
                svg(`${lane(9, 23)}${bracket(3, 29)}${bar(16, 9, 14, 1, "5")}${bar(16, 23, 14, 2, "7")}`),
            ],
            [
                "Accented chord",
                "Strum it harder: its bracket is white, and thicker for a heavy accent.",
                svg(`${lane(9, 23)}${bracket(3, 29, 'class="lw" stroke-width="2.5"')}${bar(16, 9, 14, 1, "5")}${bar(16, 23, 14, 2, "7")}`),
            ],
            [
                "Arpeggio",
                "Hold the chord shape and play its strings one at a time, for as long as the dashed outline runs. Its name is over it.",
                svg(`${lane(10, 22)}<rect x="5" y="3" width="46" height="26" rx="4" class="lt" stroke-width="1" stroke-dasharray="3 2" opacity=".55"/>${bar(9, 22, 10, 2, "2")}${bar(24, 10, 10, 1, "1")}${bar(38, 22, 10, 2, "2")}`),
            ],
            [
                "Chord name",
                "The chord you are playing, over the strings where it starts. It shows when the chord changes.",
                svg(tx(28, 16, "G5", 16, "ft")),
            ],
            [
                "Barre",
                "Lay one finger across several strings at the fret shown. ½B is a half barre.",
                svg(`${lane(14, 25)}${bracket(9, 30)}${tx(21, 4.5, "½B5", 7, "ft")}${bar(16, 14, 14, 1, "5")}${bar(16, 25, 14, 2, "5")}`),
            ],
            [
                "Hand position",
                "Move your hand so your index finger is at this fret. Under the tab, where the hand moves (Hand position guides in Settings).",
                svg(`${lane(8)}<path d="M14 13v12" class="ll" stroke-width="1.5"/>${tx(31, 22, "fret 5", 9, "fl")}`),
            ],
            [
                "String number",
                "Play it on this string (1 is the high e).",
                svg(`${lane(16)}<circle cx="15" cy="16" r="6.5" class="l2" stroke-width="1.2"/>${tx(15, 16, "3", 7, "f2")}${bar(26, 16, 16, 2, "5")}`),
            ],
            [
                "Bar number",
                "Each bar line is numbered along the top of the tab.",
                svg(`${lane(20)}<path d="M20 9v22" class="lt" stroke-width="1" opacity=".5"/>${tx(28, 5, "12", 8, "fm")}`),
            ],
        ],
    ],
    [
        "Picking hand",
        [
            ["Palm mute", "Rest the side of your picking hand on the strings near the bridge: PM over the note.", svg(over("PM", 8))],
            [
                "Fret-hand mute",
                "Touch the string with your fretting hand without pressing it down, for a percussive click: a grey bar with an ×.",
                svg(`${lane(16)}<rect x="20" y="11" width="16" height="10" rx="2" class="ft" opacity=".22"/>${tx(28, 16, "×", 10, "ft")}`),
            ],
            [
                "Down and up strokes",
                "Pick down (⊓) or up (V).",
                svg(`${lane(23)}${bar(8, 23, 12, 1, "5")}${bar(36, 23, 12, 1, "5")}<path d="M10 14V6h8v8" class="lt" stroke-width="1.4"/><path d="M38 6l4 8 4-8" class="lt" stroke-width="1.4"/>`),
            ],
            ["Picking-hand fingers", "p thumb, i index, m middle, a ring, c little finger.", svg(over("i", 10, 'font-style="italic"'))],
            [
                "Strum",
                "Strum the chord in the direction of the arrow beside it, where a Guitar Pro file marks it.",
                svg(`${lane(9, 23)}<path d="M5 4v22M2.5 22.5l2.5 3.5 2.5-3.5" class="lt" stroke-width="1.4"/>${bracket(3, 29)}${bar(16, 9, 14, 1, "5")}${bar(16, 23, 14, 2, "7")}`),
            ],
            [
                "Rolled chord",
                "Roll the chord: sound the strings one after another, quickly. The arrow beside it is wavy.",
                svg(`${lane(9, 23)}<path d="M5 4q2 2 0 4.5t0 4.5 0 4.5 0 4.5 0 4M2.5 22.5l2.5 3.5 2.5-3.5" class="lt" stroke-width="1.3"/>${bracket(3, 29)}${bar(16, 9, 14, 1, "5")}${bar(16, 23, 14, 2, "7")}`),
            ],
            [
                "Tremolo picking",
                "Pick the note as fast as you can for its whole length: three slashes over it.",
                svg(`${lane(24)}${bar(22, 24, 24, 1, "5")}<path d="M23 16l10-3M23 11.5l10-3M23 7l10-3" class="lt" stroke-width="1.4"/>`),
            ],
            ["Rasgueado", "Flamenco strum: flick the fingers out one after another in the pattern shown.", svg(over("rasg.", 8))],
            ["Slap and pop", "Bass: hit the string with your thumb, or pull it away with a finger and let it snap back.", svg(over("slap", 8))],
            ["Golpe", "Tap the body of the guitar with your thumb or a finger.", svg(over("golpe", 8))],
        ],
    ],
    [
        "Fretting hand and legato",
        [
            [
                "Hammer-on",
                "Sound the note by hammering a finger down, without picking: an arc from the note before, with H on it.",
                svg(`${lane(23)}${bar(4, 23, 12, 1, "5")}${bar(38, 23, 12, 1, "7")}<path d="M10 16Q27 5 44 16" class="lt" stroke-width="1.4"/>${tx(27, 7, "H", 8, "ft")}`),
            ],
            [
                "Pull-off",
                "Pull your finger off the string to sound the lower note: an arc from the note before, with P on it.",
                svg(`${lane(23)}${bar(4, 23, 12, 1, "7")}${bar(38, 23, 12, 1, "5")}<path d="M10 16Q27 5 44 16" class="lt" stroke-width="1.4"/>${tx(27, 7, "P", 8, "ft")}`),
            ],
            [
                "Tie",
                "Hold the note on into the next one without playing it again: a dashed arc under them.",
                svg(`${lane(12)}${bar(4, 12, 12, 1, "5")}${bar(38, 12, 12, 1, "5")}<path d="M10 19Q27 30 44 19" class="lt" stroke-width="1.3" stroke-dasharray="3 2"/>`),
            ],
            [
                "Slide",
                "Slide to the next note, up or down the way the slash after the bar points. A dashed slash means slide off without a clear target.",
                svg(`${lane(16)}${bar(4, 16, 22, 1, "5")}<path d="M29 20l8-8" class="lt" stroke-width="1.6"/>${bar(40, 16, 12, 1, "7")}`),
            ],
            [
                "Slide in and out",
                "Slide into the note from below or above (the slash before it), or off it at the end (the slash after).",
                svg(`${lane(16)}<path d="M8 20l8-8" class="lt" stroke-width="1.6"/>${bar(20, 16, 16, 1, "5")}<path d="M40 12l8 8" class="lt" stroke-width="1.6"/>`),
            ],
            ["Tapping", "Tap the note with a finger of your picking hand: T over it. m.g. marks a tap with the fretting hand.", svg(over("T"))],
            [
                "Grace note",
                "A quick note played just before the beat: a smaller note.",
                svg(`${lane(16)}<rect x="8" y="12.4" width="9" height="7.2" rx="1.5" class="f2"/>${tx(12.5, 16, "5", 6)}${bar(22, 16, 24, 2, "7")}`),
            ],
            ["Trill", "Alternate quickly between the note and the fret shown.", svg(over("tr 7", 8))],
            ["Turn and mordent", "Ornaments: a quick flick to the neighbouring notes and back.", svg(over("turn", 8))],
        ],
    ],
    [
        "Sustain and pitch",
        [
            ["Sustain", "Keep the note ringing for as long as its bar.", svg(`${lane(16)}${bar(6, 16, 44, 1, "5")}`)],
            [
                "Let ring",
                "Let the note ring on over the notes after it: its bar runs on faint and dashed.",
                svg(`${lane(16)}<rect x="6" y="11" width="44" height="10" rx="2" class="f1" opacity=".3"/><path d="M22 16h24" class="l1" stroke-width="1.5" stroke-dasharray="3 3"/>${bar(6, 16, 12, 1, "5")}`),
            ],
            [
                "Vibrato",
                "Shake the note for as long as the wave over its bar. A taller wave means a wider vibrato.",
                svg(`${lane(22)}${bar(6, 22, 44, 1, "5")}<path d="M8 12q2.5-3 5 0t5 0 5 0 5 0 5 0 5 0 5 0 5 0" class="lt" stroke-width="1.4"/>`),
            ],
            [
                "Bend",
                "Bend the string up by the amount shown: ½ is one fret higher, full is two. The arrow rises from the note's number.",
                svg(`${lane(23)}${bar(6, 23, 34, 1, "7")}<path d="M14 18q4-1 5-12" class="lt" stroke-width="1.4"/><path d="M16.5 9l2.5-3.5 2 3.8" class="lt" stroke-width="1.4"/>${tx(36, 8, "full", 8, "ft")}`),
            ],
            [
                "Bend and release",
                "Bend up, then let the string back down: an arrow up, then one down.",
                svg(`${lane(23)}${bar(4, 23, 40, 1, "7")}<path d="M12 18q4-1 5-12M17 6q6 2 6 12" class="lt" stroke-width="1.4"/><path d="M14.5 9l2.5-3.5 2 3.8M20.5 15l2.5 3.5 2.5-3.5" class="lt" stroke-width="1.4"/>${tx(40, 8, "full", 8, "ft")}`),
            ],
            [
                "Pre-bend",
                "Bend the string before you pick it, then play: a straight arrow up.",
                svg(`${lane(23)}${bar(6, 23, 34, 1, "7")}<path d="M16 18V5M13.5 8l2.5-3 2.5 3" class="lt" stroke-width="1.4"/>${tx(36, 8, "pre ½", 8, "ft")}`),
            ],
            ["Whammy bar", "Push or pull the whammy bar.", svg(over("w/bar", 8))],
        ],
    ],
    [
        "Harmonics",
        [
            [
                "Natural harmonic",
                "Touch the string lightly right above the fret wire, without pressing, and pick: the fret in angle brackets.",
                svg(`${lane(16)}${bar(12, 16, 32, 4, "&lt;12&gt;", "", 28)}`),
            ],
            ["Pinch harmonic", "Catch the string with the side of your thumb just after the pick.", svg(over("PH", 8))],
            ["Artificial harmonic", "Fret the note and touch the string 12 frets higher while you pick.", svg(over("AH", 8))],
            ["Tapped harmonic", "Fret the note and tap the string 12 frets higher.", svg(over("TH", 8))],
            ["Semi and feedback harmonics", "SH: half harmonic, half note. FH: hold it until it feeds back.", svg(over("SH", 8))],
        ],
    ],
    [
        "Articulation and expression",
        [
            ["Accent", "Play it louder. ^ is a strong accent; – means hold it for its full length.", svg(over("&gt;", 11))],
            ["Staccato", "Short: stop the note right after you play it: a dot over it.", svg(`${lane(23)}${bar(22, 23, 12, 1, "5")}<circle cx="28" cy="12" r="1.8" class="ft"/>`)],
            ["Ghost note", "Barely audible: felt more than heard. Faint, in brackets.", svg(`${lane(16)}${bar(16, 16, 24, 1, "(7)", 'opacity=".55"', 28)}`)],
            ["Dynamics", "How loud, from very soft (pp) to very loud (ff), under the tab where it changes.", svg(`${lane(8)}${tx(28, 21, "mf", 14, "ft", 'font-style="italic"')}`)],
            [
                "Crescendo and diminuendo",
                "Get louder along an opening wedge, softer along a closing one, under the tab.",
                svg(`${lane(8)}<path d="M48 15L8 21L48 27" class="lt" stroke-width="1.5"/>`),
            ],
            ["Swell and fade", "Fade the note in with the volume knob, or fade it out.", svg(over("swell", 8))],
            ["Wah", "Wah pedal open (o) or closed (+).", svg(over("o  +", 9))],
            [
                "Fermata",
                "Hold the note longer than written.",
                svg(`${lane(24)}${bar(22, 24, 12, 1, "5")}<path d="M21 15a7 7 0 0 1 14 0" class="lt" stroke-width="1.5"/><circle cx="28" cy="13.5" r="1.5" class="ft"/>`),
            ],
        ],
    ],
    [
        "Along the top",
        [
            ["Tempo, time and key", "From this bar on, a new tempo, time signature, key or swing feel, beside the bar's number.", svg(barMark("♩ = 120"))],
            ["Repeats and endings", "Where a repeat starts, how many times, and which ending you are on.", svg(barMark("repeat ×2", 7))],
            ["Jumps", "Road signs to follow: segno, coda, D.C. (from the start), D.S. (from the segno), fine.", svg(barMark("D.S. al coda", 6))],
            ["8va and loco", "Play an octave higher, until loco.", svg(barMark("8va", 9))],
            ["Text", "Instructions written in the file, like pizz. or bass stop.", svg(barMark("pizz.", 9))],
        ],
    ],
];
// groups: [[heading, [[name, meaning, drawing (HTML)]]]] → a heading and a row for each
const legendRows = (groups) =>
    groups.flatMap(([group, items]) => [
        Object.assign(document.createElement("h3"), {
            textContent: group,
        }),
        ...items.map(([name, meaning, drawing]) => {
            const row = Object.assign(
                document.createElement("div"),
                { className: "legend-item", innerHTML: drawing },
            );
            row.append(
                Object.assign(document.createElement("div"), {
                    innerHTML: "<b></b><span></span>",
                }),
            );
            row.querySelector("b").textContent = name;
            row.querySelector("span").textContent = meaning;
            return row;
        }),
    ]);
$("legendFind").oninput = (e) => {
    // show the matching rows, and only the headings that still have some
    const needle = e.target.value.trim().toLowerCase();
    let heading = null,
        shown = 0,
        groupShown = 0;
    const closeGroup = () =>
        heading && (heading.hidden = !groupShown);
    for (const el of $("legendList").children) {
        if (el.tagName === "H3") {
            closeGroup();
            [heading, groupShown] = [el, 0];
            continue;
        }
        if (!el.classList.contains("legend-item")) continue;
        el.hidden =
            !!needle &&
            !el.textContent.toLowerCase().includes(needle);
        if (!el.hidden) {
            groupShown++;
            shown++;
        }
    }
    closeGroup();
    $("legendList").lastElementChild.hidden = shown > 0;
};
// The marks as the view shows them, highway or tab, then the keyboard shortcuts (see SHORTCUTS); a search stays on
let shortcutRows = () => [];
const showLegend = () => {
    $("legendList").replaceChildren(
        ...legendRows(settings.tabView ? TAB_LEGEND : LEGEND),
        ...shortcutRows(),
        Object.assign(document.createElement("p"), {
            className: "legend-empty",
            textContent: "Nothing matches.",
            hidden: true,
        }),
    );
    $("legendFind").oninput({ target: $("legendFind") });
};
applyTheme();

let statusTimer;
function status(text, loading = false) {
    // loading: something to wait for, shown with the loader until the next message; otherwise gone after a while
    clearTimeout(statusTimer);
    $("statusText").textContent = text ?? "";
    $("status").hidden = !text;
    $("status").classList.toggle("loading", loading);
    if (text && !loading)
        statusTimer = setTimeout(
            () => ($("status").hidden = true),
            5000,
        );
}

// --- Players: a packed song plays its real audio, Guitar Pro files play through alphaTab's synth
let song = null,
    arr = null,
    player = null,
    speed = 1,
    loop = null,
    announcedPlaying = false; // told with fretfall:playing, see the hook near the end

// A band window (?band=part, see Band below) draws another window's player instead of playing one of its own
const bandPart = new URLSearchParams(location.search).get("band"),
    following = bandPart !== null;

// src: a blob of the song's audio. sync maps it onto the chart: audio time = offset + ratio * chart time
function audioPlayer(src, { offset = 0, ratio = 1 } = {}) {
    const el = new Audio(URL.createObjectURL(src));
    el.preservesPitch = true;
    el.onplay = el.onpause = updatePlayButton;
    el.onended = () => announce("ended"); // played out to the end, rather than paused: see the hook near the end
    return {
        get time() {
            return (el.currentTime - offset) / ratio;
        },
        get playing() {
            return !el.paused;
        },
        play: () => el.play(),
        pause: () => el.pause(),
        seek: (t) => {
            el.currentTime = Math.max(0, offset + ratio * t);
        },
        setSpeed: (v) => {
            el.playbackRate = v;
        },
        setVolume: (v) => {
            el.volume = v;
        },
        stop: () => {
            el.pause();
            URL.revokeObjectURL(el.src);
        },
    };
}

const api = new alphaTab.AlphaTabApi($("tab"), {
    core: { fontDirectory: CDN + "font/" },
    display: { staveProfile: "Tab" },
    // Automatic: a Guitar Pro file's own recording (its backing track) when it has one, the synth otherwise
    player: {
        playerMode: following ? "Disabled" : "EnabledAutomatic",
        soundFont: CDN + "soundfont/sonivox.sf2",
        enableCursor: false,
        enableUserInteraction: false,
        scrollMode: "Off", // or it scrolls the page along with its hidden score: nothing to scroll on the player's own, mounted it's the page around it
    },
});
// paused: the tick the player was paused at. alphaTab 1.8 rewinds to the start on pause, so the position it reports
// then is ignored and play resumes from here.
// heard: audio has played since the last start or seek. alphaTab says Playing before the first samples are out, so
// extrapolating before then runs the notes ahead and the first real position pulls them back: a stutter.
const synth = {
    tick: 0,
    at: 0,
    playing: false,
    heard: false,
    tempo: [],
    paused: null,
};
// A track's part is read from its first staff with strings, wherever it sits: MuseScore's MusicXML puts the notation
// staff first and the tab under it. It is played from there alone too: the staves around it are the same notes written as
// notation, which the synth would play over them again. They are kept aside for their lyrics (see songFromScore).
// ponytail: every staff without strings in such a track goes quiet, not only a copy of the tab; compare their notes
// should a file ever pair a tab with other music
const partStaff = (track) =>
    track.staves.find((s) => s.isStringed && !s.isPercussion);
api.scoreLoaded.on((score) => {
    for (const track of score.tracks.filter(partStaff)) {
        track.unplayed = track.staves.filter((s) => !s.isStringed);
        track.staves = track.staves.filter((s) => s.isStringed);
        track.staves.forEach((s, i) => (s.index = i));
    }
    // alphaTab draws the first track's tab (unseen, see #tab), and throws at a track without one, a voice over the
    // guitar say: it is given a track with a tab to draw instead
    const drawn = score.tracks.find(partStaff);
    if (drawn?.index) api.renderTracks([drawn]);
});
api.playerPositionChanged.on((e) => {
    if (synth.paused !== null) return;
    [synth.tick, synth.at] = [e.currentTick, performance.now()];
    if (!e.isSeek) synth.heard = true;
});
api.playerStateChanged.on((e) => {
    synth.playing = e.state === alphaTab.synth.PlayerState.Playing;
    synth.heard = false;
    synth.at = performance.now();
    updatePlayButton();
});
api.playerFinished.on(() => announce("ended")); // the synth's end of the song, as el.onended is the recording's
api.soundFontLoad.on((e) =>
    status(
        e.total // a compressed or chunked response has no length to count against
            ? `Loading instrument sounds ${Math.round((e.loaded / e.total) * 100)}%`
            : "Loading instrument sounds",
        true,
    ),
);
api.playerReady.on(() => status(null));
api.error.on((e) =>
    status(`Could not read that file: ${e.message}`),
);

const synthPlayer = {
    // position events arrive every few ms; extrapolate between them, never far past the last one
    get time() {
        return synth.tempo.length
            ? (tickToMs(synth.tempo, synth.tick) +
                  (synth.playing && synth.heard && synth.paused === null
                      ? Math.min(
                            performance.now() - synth.at,
                            100,
                        ) * api.playbackSpeed
                      : 0)) /
                  1000
            : 0;
    },
    get playing() {
        return synth.playing;
    },
    play: () => {
        if (synth.paused !== null) api.tickPosition = synth.paused;
        synth.paused = null;
        return api.play();
    },
    pause: () => {
        synth.tick = synth.paused = msToTick(
            synth.tempo,
            synthPlayer.time * 1000,
        ); // right where the highway is
        synth.at = performance.now();
        api.pause();
    },
    seek: (t) => {
        synth.tick = msToTick(synth.tempo, Math.max(0, t) * 1000);
        synth.at = performance.now();
        synth.heard = false; // the synth refills its buffers from here
        if (synth.paused !== null) synth.paused = synth.tick;
        api.tickPosition = synth.tick;
    },
    setSpeed: (v) => {
        api.playbackSpeed = v;
    },
    setVolume: (v) => {
        api.masterVolume = v;
    },
    stop: () => {
        synth.paused = null;
        api.stop();
    },
};

function usePlayer(next) {
    if (player && player !== next) player.stop();
    player = next;
    player.setSpeed(speed);
    player.setVolume(loudness());
    updatePlayButton();
}
function updatePlayButton() {
    setIcon($("play"), player?.playing ? PAUSE : PLAY);
    $("play").dataset.label = $("play").ariaLabel = player?.playing
        ? "Pause"
        : "Play"; // data-label: its name in the small-screen menu
    if (!!player?.playing !== announcedPlaying)
        announce("playing", { playing: (announcedPlaying = !!player?.playing) });
        tellControls();
}

// alphaTab score → the song model the highway draws, as a page's formats hand it over too (see fretfall.addFormat):
// seconds, string 0 = lowest, with Guitar Pro's notation named the way the highway draws it
const GP = alphaTab.model;
const words = (name = "") =>
    name.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase(); // "AmiTriplet" → "ami triplet"
const curve = (points) =>
    points?.length
        ? points.map((p) => [p.offset / 60, p.value / 4])
        : null; // [share of the note, steps]
const HARMONICS = [
    null,
    "natural",
    "artificial",
    "pinch",
    "tap",
    "semi",
    "feedback",
];
const ACCENTS = [null, "accent", "heavy", "tenuto"];
const ORNAMENTS = [
    null,
    "inverted turn",
    "turn",
    "upper mordent",
    "lower mordent",
];
const OTTAVAS = ["15ma", "8va", null, "8vb", "15mb"];
const KEYS = {
    major: [
        "C♭",
        "G♭",
        "D♭",
        "A♭",
        "E♭",
        "B♭",
        "F",
        "C",
        "G",
        "D",
        "A",
        "E",
        "B",
        "F♯",
        "C♯",
    ],
    minor: [
        "A♭",
        "E♭",
        "B♭",
        "F",
        "C",
        "G",
        "D",
        "A",
        "E",
        "B",
        "F♯",
        "C♯",
        "G♯",
        "D♯",
        "A♯",
    ],
};
const jump = (direction) =>
    GP.Direction[direction]
        .replace(/^(Target|Jump)/, "")
        .replace("DaCapo", "D.C.")
        .replace("DalSegnoSegno", "D.S.S.")
        .replace("DalSegno", "D.S.")
        .replace(/^DaDoubleCoda$/, "To double coda")
        .replace(/^DaCoda$/, "To coda")
        .replace("SegnoSegno", "Segno segno")
        .replace("DoubleCoda", "Double coda")
        .replace(/Al(.*)$/, " al $1")
        .replace(" al Double", " al double");

let builtCache = null;
function songFromScore(score, cache) {
    const tempo = tempoMap(
        cache.masterBars.flatMap((mb) => mb.tempoChanges),
        score.tempo,
    );
    const sec = (tick) => tickToMs(tempo, tick) / 1000;
    const arrangements = score.tracks
        .filter(partStaff)
        .map((track) => {
            const staff = partStaff(track),
                notes = [],
                chords = [],
                anchors = [],
                phrases = [],
                beats = [],
                sections = [],
                handShapes = [],
                lastOnString = {};
            const markers = [],
                hairpins = [],
                capos = staff.capo ? [{ time: 0, fret: staff.capo }] : [], // the file's own capo is simply one from the start
                passes = {};
            let meter = "4/4",
                key = "0:0",
                bpm = score.tempo,
                feel = 0,
                ottava = null,
                swell = null;
            for (const mb of cache.masterBars) {
                const master = mb.masterBar,
                    bar = staff.bars[master.index],
                    start = sec(mb.start),
                    end = sec(mb.end),
                    perBeat =
                        (mb.end - mb.start) /
                        master.timeSignatureNumerator;
                for (
                    let i = 0;
                    i < master.timeSignatureNumerator;
                    i++
                )
                    beats.push({
                        time: sec(mb.start + i * perBeat),
                        measure: i ? -1 : master.index + 1, // counted from 1
                    });
                if (master.section)
                    sections.push({
                        time: start,
                        name: master.section.text,
                    });

                // What the bar line says: meter, key, tempo, feel, repeats, endings, jumps
                const mark = (text, time = start) =>
                    markers.push({ time, text });
                const pass = (passes[master.index] =
                    (passes[master.index] ?? 0) + 1);
                const barMeter = `${master.timeSignatureNumerator}/${master.timeSignatureDenominator}`;
                if (barMeter !== meter) mark((meter = barMeter));
                const barKey = `${bar.keySignature}:${bar.keySignatureType}`,
                    mode = bar.keySignatureType ? "minor" : "major";
                if (barKey !== key) {
                    mark(
                        `${KEYS[mode][bar.keySignature + 7]} ${mode}`,
                    );
                    key = barKey;
                }
                for (const change of mb.tempoChanges) {
                    // every bar repeats its tempo: mark only a change
                    if (
                        Math.round(change.tempo) === Math.round(bpm)
                    )
                        continue;
                    bpm = change.tempo;
                    mark(
                        `♩ = ${Math.round(bpm)}`,
                        sec(change.tick),
                    );
                }
                if (master.tripletFeel !== feel) {
                    mark(
                        master.tripletFeel
                            ? `${words(GP.TripletFeel[master.tripletFeel])} feel`
                            : "straight",
                    );
                    feel = master.tripletFeel;
                }
                if (master.isRepeatStart)
                    mark(`repeat · pass ${pass}`);
                if (master.repeatCount > 0)
                    mark(`repeat ×${master.repeatCount}`, end);
                if (master.alternateEndings)
                    mark(
                        `ending ${[0, 1, 2, 3, 4, 5, 6, 7]
                            .filter(
                                (i) =>
                                    master.alternateEndings &
                                    (1 << i),
                            )
                            .map((i) => i + 1)
                            .join(", ")}`,
                    );
                for (const direction of master.directions ?? [])
                    mark(jump(direction));
                if (master.isFreeTime) mark("free time");

                const inBar = [];
                bar.voices.forEach((voice, v) => {
                    for (const beat of voice.beats) {
                        const t0 = sec(
                                mb.start + beat.playbackStart,
                            ),
                            t1 = sec(
                                mb.start +
                                    beat.playbackStart +
                                    beat.playbackDuration,
                            );
                        if (!v) {
                            // beat-wide marks from the first voice only: free text, ottava, crescendo hairpins
                            if (beat.text) {
                                mark(beat.text, t0);
                                const capo =
                                    /^\s*capo\s*(\d+|off)\s*$/i.exec(
                                        beat.text,
                                    ); // as a tab writes it over the staff
                                if (capo)
                                    capos.push({
                                        time: t0,
                                        fret: /off/i.test(capo[1])
                                            ? 0
                                            : +capo[1],
                                    });
                            }
                            if (OTTAVAS[beat.ottava] !== ottava) {
                                ottava = OTTAVAS[beat.ottava];
                                mark(ottava ?? "loco", t0);
                            }
                            const kind = [null, "cresc", "dim"][
                                beat.crescendo
                            ];
                            if (swell && swell.kind !== kind)
                                swell = null;
                            if (kind && !swell)
                                hairpins.push(
                                    (swell = {
                                        time: t0,
                                        endTime: t1,
                                        kind,
                                    }),
                                );
                            if (swell) swell.endTime = t1;
                        }
                        let chord = null;
                        if (beat.notes.length > 1) {
                            // the same chord back to back is one held shape; its repeats show as outlines
                            const frets = Array(
                                    staff.tuning.length,
                                ).fill(-1),
                                fingers = [...frets];
                            for (const x of beat.notes)
                                [
                                    frets[x.string - 1],
                                    fingers[x.string - 1],
                                ] = [
                                    x.fret,
                                    Math.max(-1, x.leftHandFinger),
                                ];
                            const held = handShapes.at(-1),
                                repeat =
                                    !!held &&
                                    held.frets.join() ===
                                        frets.join() &&
                                    Math.abs(held.endTime - t0) <
                                        0.01;
                            const barred = beat.barreShape
                                ? beat.notes
                                      .filter(
                                          (x) =>
                                              x.fret ===
                                              beat.barreFret,
                                      )
                                      .map((x) => x.string - 1)
                                : [];
                            chord =
                                chords.push({
                                    time: t0,
                                    name: beat.chord?.name ?? "",
                                    notes: [],
                                    frets,
                                    fingers,
                                    highDensity: repeat,
                                    palmMute: beat.notes.every(
                                        (x) => x.isPalmMute,
                                    ),
                                    fretHandMute: beat.notes.every(
                                        (x) => x.isDead,
                                    ),
                                    accent: ACCENTS[
                                        Math.max(
                                            ...beat.notes.map(
                                                (x) =>
                                                    x.accentuated ===
                                                    GP
                                                        .AccentuationType
                                                        .Tenuto
                                                        ? 0
                                                        : x.accentuated,
                                            ),
                                        )
                                    ], // pressed harder: accented or heavy
                                    strum:
                                        [
                                            null,
                                            "up",
                                            "down",
                                            null,
                                            null,
                                        ][beat.brushType] ??
                                        [null, "up", "down"][
                                            beat.pickStroke
                                        ] ??
                                        null,
                                    roll:
                                        [
                                            null,
                                            null,
                                            null,
                                            "up",
                                            "down",
                                        ][beat.brushType] ?? null,
                                    barre: barred.length
                                        ? {
                                              fret: beat.barreFret,
                                              from: Math.min(
                                                  ...barred,
                                              ),
                                              to: Math.max(
                                                  ...barred,
                                              ),
                                              half:
                                                  beat.barreShape ===
                                                  GP.BarreShape
                                                      .Half,
                                          }
                                        : undefined,
                                }) - 1;
                            if (repeat) held.endTime = t1;
                            else
                                handShapes.push({
                                    startTime: t0,
                                    endTime: t1,
                                    name: chords[chord].name,
                                    frets,
                                    fingers,
                                });
                        }
                        for (const nt of beat.notes) {
                            const tied =
                                nt.isTieDestination &&
                                lastOnString[nt.string];
                            if (tied) {
                                tied.sustain = t1 - tied.time;
                                continue;
                            }
                            const origin = nt.hammerPullOrigin,
                                harmonic =
                                    HARMONICS[nt.harmonicType];
                            const note = {
                                time: t0,
                                sustain:
                                    nt.slideTarget ||
                                    nt.hasBend ||
                                    t1 - t0 >= 0.4
                                        ? t1 - t0
                                        : 0,
                                string: nt.string - 1,
                                fret: nt.fret,
                                chord,
                                hammerOn:
                                    !!origin &&
                                    nt.fret > origin.fret,
                                pullOff:
                                    !!origin &&
                                    nt.fret < origin.fret,
                                slideTo:
                                    nt.slideTarget &&
                                    (nt.fret || nt.slideTarget.fret) // from an open string to another is no slide
                                        ? nt.slideTarget.fret
                                        : null,
                                slideUnpitchTo: null,
                                slideIn:
                                    [null, "below", "above"][
                                        nt.slideInType
                                    ] ?? null,
                                slideOut:
                                    [
                                        null,
                                        null,
                                        null,
                                        "up",
                                        "down",
                                        "down",
                                        "up",
                                    ][nt.slideOutType] ?? null,
                                bend: nt.hasBend
                                    ? (nt.maxBendPoint?.value ??
                                          0) / 4
                                    : 0,
                                bendCurve: nt.hasBend
                                    ? curve(nt.bendPoints)
                                    : null,
                                whammy: curve(beat.whammyBarPoints),
                                harmonic:
                                    !!harmonic &&
                                    harmonic !== "pinch",
                                harmonicPinch: harmonic === "pinch",
                                harmonicType: harmonic,
                                palmMute: nt.isPalmMute,
                                mute: nt.isDead || beat.deadSlapped,
                                ghost: nt.isGhost,
                                staccato: nt.isStaccato,
                                letRing: nt.isLetRing,
                                accent:
                                    ACCENTS[nt.accentuated] ?? null,
                                dynamic: words(
                                    GP.DynamicValue[nt.dynamics],
                                ),
                                vibrato:
                                    nt.vibrato > 0 ||
                                    beat.vibrato > 0,
                                vibratoWide:
                                    nt.vibrato ===
                                        GP.VibratoType.Wide ||
                                    beat.vibrato ===
                                        GP.VibratoType.Wide,
                                trill:
                                    nt.trillValue >= 0
                                        ? nt.trillValue
                                        : null,
                                ornament:
                                    ORNAMENTS[nt.ornament] ?? null,
                                grace:
                                    beat.graceType !==
                                    GP.GraceType.None,
                                tremolo: beat.isTremolo,
                                tap: beat.tap,
                                tapLeft: nt.isLeftHandTapped,
                                slap: beat.slap,
                                pop: beat.pop,
                                golpe:
                                    [null, "thumb", "finger"][
                                        beat.golpe
                                    ] ?? null,
                                rasgueado: beat.rasgueado
                                    ? words(
                                          GP.Rasgueado[
                                              beat.rasgueado
                                          ],
                                      )
                                    : null,
                                fade:
                                    [
                                        null,
                                        "fade in",
                                        "fade out",
                                        "swell",
                                    ][beat.fade] ?? null,
                                wah:
                                    [null, "open", "closed"][
                                        beat.wahPedal
                                    ] ?? null,
                                fermata: !!beat.fermata,
                                pick:
                                    beat.notes.length > 1
                                        ? null
                                        : ([null, "up", "down"][
                                              beat.pickStroke
                                          ] ?? null),
                                showString: nt.showStringNumber,
                                finger:
                                    nt.leftHandFinger >= 0
                                        ? nt.leftHandFinger
                                        : null,
                                rightFinger:
                                    "pimac"[nt.rightHandFinger] ??
                                    null,
                            };
                            notes.push(
                                (lastOnString[nt.string] = note),
                            );
                            inBar.push(note);
                        }
                    }
                });
                phrases.push({
                    time: start,
                    endTime: end,
                    name: "",
                    maxDifficulty: inBar.length,
                });
            }
            notes.sort(
                (a, b) => a.time - b.time || a.string - b.string,
            );
            notes.forEach(
                (x, i) =>
                    x.chord !== null &&
                    chords[x.chord].notes.push(i),
            );
            if (staff.capo) {
                // Guitar Pro counts a capo'd chart's frets from the capo. Everything here is where the finger goes on the
                // board instead, so lift them onto it before the hand positions are worked out from them
                const up = (fret) =>
                    fret > 0 ? fret + staff.capo : fret; // an open string stays open: the capo is fretting it
                for (const x of notes) {
                    x.fret = up(x.fret);
                    if (x.slideTo !== null) x.slideTo = up(x.slideTo);
                    if (x.slideUnpitchTo !== null)
                        x.slideUnpitchTo = up(x.slideUnpitchTo);
                    if (typeof x.trill === "number")
                        x.trill = up(x.trill);
                }
                for (const c of chords) {
                    c.frets = c.frets.map(up);
                    if (c.barre) c.barre.fret = up(c.barre.fret);
                }
                for (const h of handShapes) h.frets = h.frets.map(up);
            }
            const suggested = suggestPositions(notes); // Guitar Pro files rarely say where the hand goes or which finger presses
            anchors.push(...suggested.anchors);
            for (const x of notes)
                x.finger ??= suggested.fingers.get(x) ?? null;
            for (const c of chords)
                for (const j of c.notes)
                    if (
                        c.fingers[notes[j].string] < 0 &&
                        notes[j].finger !== null
                    )
                        c.fingers[notes[j].string] =
                            notes[j].finger;
            const name = (
                track.name || `Track ${track.index + 1}`
            ).replace(/\s+-\s+.*$/, ""); // "Farin Gitarre - Electric Guitar (clean)" → "Farin Gitarre"
            return {
                name,
                program: track.playbackInfo.program,
                strings: staff.tuning.length,
                open: [...staff.tuning].reverse(),
                notes,
                chords,
                anchors,
                phrases,
                sections,
                beats,
                handShapes,
                markers,
                hairpins,
                capos,
                track,
            };
        });
    // Lyrics from the first staff that has any, a syllable a beat: usually a vocal line, which gets no part of its
    // own. They read like this: "-" joins a syllable to the next, a "+" at its end ends the line.
    const lyrics = [];
    for (const staff of score.tracks.flatMap((track) => [
        ...track.staves,
        ...(track.unplayed ?? []), // a tab's notation staff, which is where MuseScore writes the words
    ])) {
        for (const mb of cache.masterBars)
            for (const beat of staff.bars[
                mb.masterBar.index
            ].voices.flatMap((voice) => voice.beats)) {
                if (!beat.lyrics?.[0]) continue;
                const time = sec(mb.start + beat.playbackStart);
                lyrics.push({
                    time,
                    length:
                        sec(
                            mb.start +
                                beat.playbackStart +
                                beat.playbackDuration,
                        ) - time,
                    text: beat.lyrics[0],
                });
            }
        if (lyrics.length) break;
    }
    lyrics.sort((a, b) => a.time - b.time); // sung in more voices than one: in the order they're heard
    return {
        title: score.title,
        artist: score.artist,
        bpm: score.tempo,
        length: sec(cache.masterBars.at(-1)?.end ?? 0),
        arrangements,
        lyrics,
        tempo,
    };
}

// Chart lyrics: "-" joins a syllable to the next, "+" ends a line. Many charts skip the "+",
// so pauses and line length break lines too.
function lyricLines(lyrics) {
    const lines = [];
    let words = [];
    for (const { time, length, text } of lyrics) {
        if (words.length && time - words.at(-1).end > 2) {
            lines.push(words);
            words = [];
        }
        const raw = text.replace(/\+$/, ""),
            joined = raw.endsWith("-");
        words.push({
            time,
            end: time + length,
            text: joined ? raw.slice(0, -1) : `${raw} `,
        });
        const long =
            !joined &&
            words.reduce((sum, w) => sum + w.text.length, 0) > 34;
        if (text.endsWith("+") || long) {
            lines.push(words);
            words = [];
        }
    }
    if (words.length) lines.push(words);
    return lines.map((w) => ({
        time: w[0].time,
        end: w.at(-1).end,
        syllables: w,
    }));
}

function setSong(next) {
    for (const a of next.arrangements) {
        markRepeats(a.notes, a.chords);
        annotate(a.notes, a.chords);
        markArpeggios(a.notes, a.handShapes ?? []);
    }
    song = { ...next, lines: lyricLines(next.lyrics) };
    if (!following) loop = null; // a band window keeps the loop it was sent
    if (leading) band.postMessage({ song: bandSong() });
    if (!mounted)
        document.title = `${song.title || "Untitled"} – Fretfall`;
    const parts = song.arrangements;
    $("band").disabled = parts.length < 2;
    if (parts.length > 4) {
        // too many parts for buttons (Guitar Pro files often carry vocals, horns, …)
        const select = Object.assign(
            document.createElement("select"),
            { ariaLabel: "Part" },
        );
        select.append(
            ...parts.map((a, i) => new Option(a.name, i)),
        );
        select.onchange = () => selectArrangement(+select.value);
        $("arrangements").replaceChildren(select);
    } else {
        $("arrangements").replaceChildren(
            ...parts.map((a, i) => {
                const b = Object.assign(
                    document.createElement("button"),
                    { textContent: a.name },
                );
                b.onclick = () => selectArrangement(i);
                return b;
            }),
        );
    }
    // Start on the busiest guitar part: Guitar Pro files often put a vocal or horn line first (MIDI programs 24-31 are guitars)
    const guitars = parts.filter(
        (a) =>
            a.program === undefined ||
            (a.program >= 24 && a.program <= 31),
    );
    const first = guitars.length
        ? parts.indexOf(
              guitars.reduce((best, a) =>
                  a.notes.length > best.notes.length ? a : best,
              ),
          )
        : 0;
    if (parts.length)
        selectArrangement(
            parts[0].program === undefined ? 0 : first,
        );
    else {
        arr = null;
        status("No guitar or bass parts in this file");
    }
    announce("song", {
        file: opening, // null: the demo, or a band window's song
        title: song.title,
        artist: song.artist,
        parts: parts.map((a) => a.name),
        part: arr ? parts.indexOf(arr) : -1,
    });
    opening = null;
}

let bars = [],
    ui = {};
const el = (tag, props, ...children) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children);
    return e;
};
// The tuning, told against the one it's named after (see tuningReference) when hovered or tapped: how far it is
// from it, and each string's note in both, with a bar as long as the string is retuned
function explainTuning(fact, open) {
    const r = tuningReference(open);
    if (!r) return fact;
    const moved = r.shift.filter(Boolean),
        semitones = (d) =>
            `${Math.abs(d)} semitone${Math.abs(d) === 1 ? "" : "s"} ${d < 0 ? "lower" : "higher"}`;
    const text = !moved.length
        ? "Every string at its usual pitch"
        : moved.length === open.length && moved.every((d) => d === moved[0])
          ? `${semitones(moved[0])} than ${r.reference}`
          : moved.length === 1 && r.shift[0]
            ? `The lowest string ${semitones(r.shift[0])} than in ${r.reference}`
            : `${moved.length} of ${open.length} strings retuned from ${r.reference}`;
    fact.classList.add("tuning");
    fact.tabIndex = 0;
    fact.setAttribute("aria-describedby", "tuningTip");
    fact.append(
        el(
            "span",
            { className: "tip", id: "tuningTip", role: "tooltip" },
            el("b", { textContent: tuningName(open) }),
            text,
            el(
                "span",
                { className: "pegs", ariaHidden: "true" },
                ...open.map((m, s) =>
                    el(
                        "span",
                        {
                            className: r.shift[s] ? "peg" : "peg same",
                            style: `--c: var(--s${s}); --d: ${Math.min(12, Math.abs(r.shift[s]))}`,
                        },
                        el("i", { textContent: noteName(r.open[s]) }),
                        el("i", {
                            className: "move",
                            textContent: r.shift[s]
                                ? `${r.shift[s] < 0 ? "−" : "+"}${Math.abs(r.shift[s])}`
                                : "0",
                        }),
                        el("strong", { textContent: noteName(m) }),
                    ),
                ),
            ),
            el("small", { textContent: `${r.reference} on top, this song underneath, lowest string first` }),
        ),
    );
    return fact;
}
function selectArrangement(i) {
    if (arr?.track) api.changeTrackMute([arr.track], false);
    arr = song.arrangements[i];
    queueMicrotask(tellControls); // once the picker and the camera have caught up
    if (arr.track) api.changeTrackMute([arr.track], settings.mute);
    for (const key in cam) delete cam[key];
    const picker = $("arrangements");
    if (picker.firstElementChild?.tagName === "SELECT")
        picker.firstElementChild.value = i;
    else
        [...picker.children].forEach((b, j) =>
            b.setAttribute("aria-pressed", String(i === j)),
        );
    const facts = [
        ["Tuning", arr.open?.length ? tuningName(arr.open) : null],
        ["Capo", arr.capos?.[0]?.time === 0 && arr.capos[0].fret ? `fret ${arr.capos[0].fret}` : null],
        ["Tempo", song.bpm ? `${Math.round(song.bpm)} bpm` : null],
    ].filter(([, v]) => v);
    $("info").replaceChildren(
        el("span", {}, el("b", { textContent: song.title || "Untitled" }), song.artist ? ` ${song.artist}` : ""),
        ...facts.map(([k, v]) => {
            const fact = el("span", {}, `${k} `, el("b", { textContent: v }));
            return k === "Tuning" ? explainTuning(fact, arr.open) : fact;
        }),
    ); // the song first, then its facts, each on its own between dividers
    $("introTitle").textContent = song.title || "Untitled";
    $("introFacts").textContent = [
        song.artist,
        arr.name,
        ...facts.map(([, v]) => v),
    ]
        .filter(Boolean)
        .join("  ·  ");

    const total = {},
        seen = {};
    const names = arr.sections.map((s) =>
        s.name.replace(/[_-]+/g, " ").toUpperCase(),
    );
    names.forEach((nm) => (total[nm] = (total[nm] ?? 0) + 1));
    arr.sectionLabels = names.map((nm) =>
        total[nm] > 1
            ? `${nm} ${(seen[nm] = (seen[nm] ?? 0) + 1)}`
            : nm,
    );

    const hardest = Math.max(
        1,
        ...arr.phrases.map((p) => p.maxDifficulty),
    );
    bars = arr.phrases.map((p) => {
        const b = document.createElement("div");
        b.style.left = pct(p.time);
        b.style.width = `calc(${pct(p.endTime)} - ${pct(p.time)} - 3px)`; // 3px apart
        b.style.height = `${Math.max(8, (p.maxDifficulty / hardest) * 100)}%`;
        return b;
    });
    $("phrases").replaceChildren(...bars, $("loopBox"), $("phraseTime"));
    markLoop();
    // Under it, how busy each stretch of the song is: brighter = more notes per second
    const busy = arr.phrases.map(
        (p) =>
            arr.notes.filter(
                (n) => n.time >= p.time && n.time < p.endTime,
            ).length / Math.max(0.5, p.endTime - p.time),
    );
    const busiest = Math.max(1e-6, ...busy);
    $("progress").style.background =
        `linear-gradient(90deg, ${arr.phrases
            .map(
                (p, j) =>
                    `color-mix(in srgb, var(--accent) ${Math.round(8 + 62 * (busy[j] / busiest))}%, var(--todo)) ${pct(p.time)} ${pct(p.endTime)}`,
            )
            .join(", ")})`;
    ui = {};
}

// Where a moment sits along the phrase bars and the progress line: both run from 0:00 to the end, so a
// recording's lead-in before the first phrase is empty space
const pct = (sec) =>
    `${Math.min(100, Math.max(0, (sec / song.length) * 100)).toFixed(2)}%`;
// The loop shows as a box with a grip on each edge, placed by its own times: snapped to the phrase bars or not
const loopBars = (range) => {
    const inside = (b, j) =>
        !!range &&
        arr.phrases[j].time >= range.start &&
        arr.phrases[j].endTime <= range.end;
    return [bars.findIndex(inside), bars.findLastIndex(inside)];
};
function markLoop(range = loop) {
    const box = $("loopBox");
    box.hidden = !range || !song;
    if (!box.hidden)
        Object.assign(box.style, {
            left: `calc(${pct(range.start)} - 3px)`, // the same 3px of air the bars leave between them
            width: `calc(${pct(range.end)} - ${pct(range.start)} + 3px)`,
        });
    $("loop").setAttribute("aria-pressed", String(!!range));
    if (following && range === loop && JSON.stringify(loop) !== JSON.stringify(leader.loop))
        band.postMessage({ do: "loop", loop }); // looped here: the band's first window loops everyone
    syncLoopTools();
    tellControls();
}
addEventListener("resize", () => markLoop());
// Phrase bars: a click jumps to that moment, whose time shows under the pointer (with a loop, a click moves the loop to
// the phrase, or stretches it there with shift); pressing and dragging across them loops that stretch, and dragging a
// grip moves just that edge. A drag snaps to whole phrases; held with shift it takes the pointer's own moment instead,
// for a loop of any length. Only the pointer's x counts, so a drag can stray off the bars.
let phrasesBox = null; // measured as the pointer comes in: the bars don't move under it
const timeAt = (x) =>
    Math.min(1, Math.max(0, (x - phrasesBox.left) / phrasesBox.width)) *
    song.length; // the bars run by time from end to end (see selectArrangement)
$("phrases").onpointerenter = () =>
    (phrasesBox = $("phrases").getBoundingClientRect());
$("phrases").onpointerleave = () => ($("phraseTime").hidden = true);
const phraseAt = (x) => {
    const i = bars.findIndex(
        (b) => x < b.getBoundingClientRect().right,
    );
    return i < 0 ? bars.length - 1 : i;
};
let drag = null;
$("phrases").onpointerdown = (e) => {
    if (!bars.length || e.button !== 0) return;
    const at = phraseAt(e.clientX),
        [first, last] = loopBars(loop),
        box = $("loopBox").getBoundingClientRect();
    const grip = // a grip pivots on the other end of the loop
        !loop || box.width === 0
            ? null
            : Math.abs(e.clientX - box.left) < 6
              ? "start"
              : Math.abs(e.clientX - box.right) < 6
                ? "end"
                : null;
    const from = grip === "start" && last >= 0 ? last : grip === "end" && first >= 0 ? first : at;
    const pivot = grip ? loop[grip === "start" ? "end" : "start"] : timeAt(e.clientX);
    drag = { at, from, pivot, x: e.clientX, range: null };
    $("phrases").setPointerCapture(e.pointerId);
};
$("phrases").onpointermove = (e) => {
    if (song && phrasesBox) {
        Object.assign($("phraseTime"), {
            hidden: false,
            textContent: clock(timeAt(e.clientX)),
        });
        $("phraseTime").style.left = `${Math.min(phrasesBox.width, Math.max(0, e.clientX - phrasesBox.left))}px`;
    }
    if (!drag || (!drag.range && Math.abs(e.clientX - drag.x) < 4))
        return; // a few pixels of wobble is still a click
    const to = phraseAt(e.clientX),
        here = timeAt(e.clientX);
    drag.range = e.shiftKey
        ? {
              start: Math.min(drag.pivot, here),
              end: Math.max(drag.pivot, here, Math.min(drag.pivot, here) + 0.25), // never so narrow that the loop has nothing to play
          }
        : {
              start: arr.phrases[Math.min(drag.from, to)].time,
              end: arr.phrases[Math.max(drag.from, to)].endTime,
          };
    markLoop(drag.range);
};
$("phrases").onpointerup = (e) => {
    if (!drag) return;
    const p = arr.phrases[drag.at];
    if (drag.range) {
        loop = drag.range;
        player?.seek(loop.start);
    } else if (drag.from === drag.at) {
        // a click; on a grip it does nothing
        if (loop) {
            loop = e.shiftKey
                ? {
                      start: Math.min(loop.start, p.time),
                      end: Math.max(loop.end, p.endTime),
                  }
                : { start: p.time, end: p.endTime };
            player?.seek(p.time);
        } else player?.seek(timeAt(e.clientX));
    }
    drag = null;
    markLoop();
};
$("phrases").onpointercancel = $("phrases").onlostpointercapture =
    () => {
        drag = null;
        markLoop();
    }; // a drag cut short loops nothing

// --- Opening files
const AUDIO = /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i,
    OPENING = "Opening song…";
let songReady = Promise.resolve(),
    resolveSong = () => {},
    opening = null; // the name of the file being opened, told with the song once it's ready
const formats = []; // kinds of song file a page adds, see fretfall.addFormat

// options: handed on to the format that opens a file (see fretfall.addFormat)
async function openFiles(files, options) {
    if (following)
        return status("Open songs in the window the band started from");
    // a tab and its recording can come together: the tab first
    for (const file of [...files].sort(
        (a, b) => AUDIO.test(a.name) - AUDIO.test(b.name),
    ))
        // oxlint-disable-next-line no-await-in-loop -- one at a time: a tab is open before its recording lines up with it
        await openFile(file, options);
}

async function openFile(file, options = {}) {
    if (AUDIO.test(file.name)) return addRecording(file);
    opening = file.name;
    const format = formats.find((f) =>
        f.extensions.some((ext) => file.name.toLowerCase().endsWith(ext)),
    );
    if (!format) {
        // Guitar Pro, MusicXML, alphaTab's own tex: alphaTab reads them, and plays them unless their recording follows
        const tex = file.name.toLowerCase().endsWith(".atex");
        const data = tex
            ? await file.text()
            : new Uint8Array(await file.arrayBuffer());
        usePlayer(synthPlayer);
        synth.paused = null;
        builtCache = api.tickCache; // rebuild once alphaTab has the new score
        songReady = new Promise(
            (resolve) => (resolveSong = resolve),
        );
        status(OPENING, true); // until the frame loop has the song
        return tex ? api.tex(data) : api.load(data);
    }
    status(OPENING, true);
    await paint();
    try {
        const { song: next, audio } = await format.open(file, {
            ...options,
            status: (text) => status(text, true),
        });
        // Where the hand goes and which finger presses, when the chart doesn't say
        for (const a of next.arrangements) {
            a.open = Array.from(
                { length: a.strings },
                (_, s) =>
                    (OPEN_STRINGS[a.strings]?.[s] ?? 40) +
                    (a.tuning[s] ?? 0),
            );
            if (!a.anchors.length)
                a.anchors = suggestPositions(a.notes).anchors;
            let hand = 0;
            for (const n of a.notes) {
                while (a.anchors[hand + 1]?.time <= n.time) hand++;
                const template =
                    n.chord === null
                        ? -1
                        : (a.chords[n.chord].fingers[n.string] ??
                          -1);
                if (n.fret > 0)
                    n.finger ??=
                        template >= 0
                            ? template
                            : a.anchors[hand]
                              ? fingerFor(
                                    n.fret,
                                    a.anchors[hand].fret,
                                )
                              : null;
            }
        }
        usePlayer(audioPlayer(audio));
        setSong(next);
        status(null);
        autoplay();
    } catch (e) {
        opening = null;
        status(`Could not open ${file.name}: ${e.message}`);
    }
}
// The band's recording instead of the synth: find where the tab's notes land in it, then play it
async function addRecording(file) {
    await songReady;
    if (!song)
        return status("Open the tab first, then its recording");
    status("Lining the recording up with the tab…", true);
    await paint();
    try {
        const decoded = await new OfflineAudioContext(
            1,
            1,
            11025,
        ).decodeAudioData(await file.arrayBuffer()); // 11 kHz is plenty to find attacks
        const mono = new Float32Array(decoded.length);
        for (let c = 0; c < decoded.numberOfChannels; c++)
            decoded
                .getChannelData(c)
                .forEach(
                    (v, i) =>
                        (mono[i] += v / decoded.numberOfChannels),
                );
        const onsets = [
            ...new Set(
                song.arrangements.flatMap((a) =>
                    a.notes.map(
                        (n) => Math.round(n.time * 100) / 100,
                    ),
                ),
            ),
        ].sort((a, b) => a - b);
        const sync = align(
            onsetEnvelope(mono, decoded.sampleRate),
            onsets,
        );
        usePlayer(audioPlayer(file, sync));
        status(
            sync.confidence >= 2
                ? `Playing the recording: the tab starts ${sync.offset.toFixed(1)} s in`
                : "Could not line the recording up with the tab. Nudge it with Audio delay in settings.",
        );
    } catch (e) {
        status(`Could not use ${file.name}: ${e.message}`);
    }
}

$("open").onclick = () => $("file").click();
$("file").onchange = (e) => {
    openFiles(e.target.files);
    e.target.value = "";
};
let dragDepth = 0; // on the root: mounted, files dropped on the page around the player are that page's
root.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    $("drop").hidden = false;
});
root.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) {
        dragDepth = 0;
        $("drop").hidden = true;
    }
});
root.addEventListener("dragover", (e) => e.preventDefault());
root.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    $("drop").hidden = true;
    openFiles(e.dataTransfer.files);
});

// --- Transport
// --- Practice tools: a metronome on the chart's beats, and a loop that speeds up
// each time round. Clicks go on the audio clock a little ahead of when they sound, so they keep time however the
// frames fall; they follow the volume but not its mute, to play along with the click alone
let clicks = null, // the audio clock, started from a press: browsers only let a page make sound after one
    clickedTo = null; // the song time the metronome has clicked up to
const audioClock = () => {
    clicks ??= new AudioContext();
    clicks.resume();
    return clicks;
};
function click(at, accent) {
    if (!settings.volume) return;
    const tone = clicks.createOscillator(),
        gain = clicks.createGain();
    tone.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(0.6 * settings.volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    tone.connect(gain).connect(clicks.destination);
    tone.start(at);
    tone.stop(at + 0.05);
}
function metronome(t) {
    // from the frame loop: clicks for the beats in the next tenth of a second
    if (
        !settings.metronome ||
        !player?.playing ||
        !arr ||
        clicks?.state !== "running"
    )
        return void (clickedTo = null);
    if (clickedTo === null || Math.abs(t - clickedTo) > 0.5)
        clickedTo = t - 0.05; // just started, or moved: from here on (a beat right here still clicks)
    const until = t + 0.1 * speed;
    for (const beat of arr.beats) {
        if (beat.time <= clickedTo) continue;
        if (beat.time > until) break;
        click(
            clicks.currentTime + Math.max(0, beat.time - t) / speed,
            beat.measure >= 0,
        );
    }
    clickedTo = until;
}
// Autoplay (Settings): a song that has just opened starts playing. Not before anyone has used the page (browsers keep
// it silent until then, so the demo on a first visit waits), and not in the band's windows, which follow this one
let autoplayWaits = false; // for the synth's instruments to load
// Start playing as soon as there is something to play: what Autoplay uses, and what a page around the player asks
// for by setting fretfall.playing
const playWhenReady = () => {
    if (!player || player.playing) return;
    if (player === synthPlayer && !api.isReadyForPlayback) { // a Guitar Pro file opened before its instruments have loaded
        if (autoplayWaits) return;
        autoplayWaits = true;
        const ready = () => {
            api.playerReady.off(ready);
            autoplayWaits = false;
            playWhenReady();
        };
        return api.playerReady.on(ready);
    }
    audioClock();
    Promise.resolve(player.play()).catch(
        (e) => e.name !== "AbortError" && e.name !== "NotAllowedError" && status(e.message),
    );
};
const autoplay = () => {
    if (!settings.autoplay || following) return;
    if (navigator.userActivation?.hasBeenActive === false) return;
    playWhenReady();
};
const togglePlay = () => {
    if (!player) return;
    audioClock();
    if (player.playing) return player.pause();
    Promise.resolve(player.play()).catch(
        (e) => e.name !== "AbortError" && status(e.message),
    ); // AbortError: a newer song took over
};
function toggleTool(key) {
    settings[key] = !settings[key];
    save();
    audioClock();
    $(key).setAttribute("aria-pressed", String(settings[key]));
    tellControls();
}
for (const key of ["metronome", "minimal", "tabView"]) {
    $(key).setAttribute("aria-pressed", String(settings[key]));
    $(key).onclick = () => toggleTool(key);
}
const toggleMinimal = () => {
    toggleTool("minimal");
    applyTheme();
    markLoop(); // the loop's box is measured on the phrase bars, which weren't showing
};
$("minimal").onclick = toggleMinimal;
const toggleTabView = () => {
    toggleTool("tabView");
    applyTheme();
    showLegend();
};
$("tabView").onclick = toggleTabView;
// The speed trainer works on a loop played slower than it could be: without both it switches off, which is
// also how it stops once it has sped up to 100%. Both sit on the loop, with an X that clears it
let training = false;
function syncLoopTools() {
    const usable = !!loop && speed <= 0.9,
        tools = $("loopTools"),
        box = $("loopBox");
    if (!usable) training = false;
    $("trainer").disabled = !usable;
    $("trainer").setAttribute("aria-pressed", String(training));
    $("trainerHint").textContent =
        speed > 0.9
            ? "Slow down to 90% or less to use it"
            : "10% faster each time the loop comes round, up to 100%";
    tools.hidden = !loop || box.hidden;
    if (tools.hidden) return;
    const edge = box.getBoundingClientRect(),
        room = root.getBoundingClientRect(), // the screen, or mounted the element's box: what the tools are fixed to
        half = tools.offsetWidth / 2,
        x = Math.min(
            room.width - half - 8,
            Math.max(half + 8, edge.left - room.left + edge.width / 2),
        ); // centred on the loop's top edge, kept on screen
    Object.assign(tools.style, {
        left: `${x}px`,
        top: `${edge.top - room.top}px`,
    });
    tools.style.setProperty(
        "--tip",
        x < 140 ? "0%" : x > room.width - 140 ? "100%" : "50%",
    ); // half a tooltip from the side: it opens from that side
}
$("trainer").onclick = () => {
    training = !training;
    syncLoopTools();
};
$("clearLoop").onclick = () => {
    loop = null;
    markLoop();
};
function setSpeed(v) {
    speed = Math.min(1.5, Math.max(0.1, Math.round(v * 10) / 10)); // 10% steps, from 10% to 150%
    player?.setSpeed(speed);
    $("speed").textContent = `${Math.round(speed * 100)}%`;
    syncLoopTools();
    tellControls();
}
function toggleLoop() {
    const p = arr?.phrases.findLast((x) => x.time <= songTime());
    loop = loop || !p ? null : { start: p.time, end: p.endTime };
    markLoop();
}
$("play").onclick = togglePlay;
$("slower").onclick = () => setSpeed(speed - 0.1);
$("faster").onclick = () => setSpeed(speed + 0.1);
$("speed").onclick = () => setSpeed(1);
$("loop").onclick = toggleLoop;
const toggleFullscreen = () =>
    document.fullscreenElement
        ? document.exitFullscreen()
        : root.requestFullscreen();
const updateFullscreenButton = () => {
    setIcon(
        $("fullscreen"),
        document.fullscreenElement
            ? EXIT_FULLSCREEN
            : ENTER_FULLSCREEN,
    );
};
$("fullscreen").onclick = toggleFullscreen;
$("fullscreen").hidden = !document.fullscreenEnabled; // iPhones can't take a page full screen
document.addEventListener("fullscreenchange", () => tellControls());
document.addEventListener("fullscreenchange", updateFullscreenButton); // added, not set: a page the player is mounted in may listen too
// Full screen shows the player alone, so docked tools come home meanwhile and go back to the page's elements after
let undocked = null;
document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement === root && docks.length) {
        undocked = [docks[0], docks.at(-1)];
        dockTools(null);
    } else if (!document.fullscreenElement && undocked) {
        if (!docks.length) dockTools(...undocked); // unless the page docked them elsewhere meanwhile
        undocked = null;
    }
});
updateFullscreenButton();
// --- Keyboard shortcuts, listed at the end of the notation sheet too: [heading, [[keys as e.key names them (letters
// in lower case), the keys as shown, what they do, more about it, what happens]]]
const skip = (e) => {
    // 5 seconds, or with shift to the next phrase, or back to the start of this one (the one before, just past its start)
    const t = player?.time ?? 0,
        ahead = e.key === "ArrowRight";
    if (!e.shiftKey) return player?.seek(songTime() + (ahead ? 5 : -5));
    const phrases = arr?.phrases ?? [],
        i = phrases.findLastIndex((p) => p.time <= t + 0.05),
        to = ahead
            ? phrases[i + 1]
            : phrases[t - (phrases[i]?.time ?? 0) > 1 ? i : i - 1];
    player?.seek(to?.time ?? (ahead ? t : 0));
};
const nudgeVolume = (step) =>
    setVolume(
        Math.min(1, Math.max(0, Math.round((loudness() + step) * 10) / 10)),
        false,
    );
const SHORTCUTS = [
    [
        "Playing",
        [
            [[" "], "Space", "Play or pause", "", togglePlay],
            [
                ["ArrowLeft", "ArrowRight"],
                "← →",
                "Back or ahead 5 seconds",
                "With Shift, a phrase at a time",
                skip,
            ],
            [
                ["Home", "0"],
                "Home 0",
                "Back to the start",
                "Of the loop, when there is one",
                () => player?.seek(loop?.start ?? 0),
            ],
            [
                ["-", "+", "="],
                "− +",
                "Slower or faster",
                "In 10% steps",
                (e) => setSpeed(speed + (e.key === "-" ? -0.1 : 0.1)),
            ],
            [["r"], "R", "Back to 100% speed", "", () => setSpeed(1)],
            [
                ["l"],
                "L",
                "Loop the phrase you are in",
                "Or clear the loop",
                toggleLoop,
            ],
            [
                ["t"],
                "T",
                "Speed trainer",
                "On a loop at 90% or slower: 10% faster each time round",
                () => $("trainer").click(),
            ],
            [
                [..."123456789"],
                "1–9",
                "Switch part",
                "In the order they are in the header",
                (e) =>
                    song?.arrangements[e.key - 1] &&
                    selectArrangement(e.key - 1),
            ],
        ],
    ],
    [
        "Practice tools",
        [
            [["k"], "K", "Metronome", "", () => toggleTool("metronome")],
            [
                ["ArrowUp", "ArrowDown"],
                "↑ ↓",
                "Volume up or down",
                "",
                (e) => nudgeVolume(e.key === "ArrowUp" ? 0.1 : -0.1),
            ],
            [["m"], "M", "Mute or unmute", "", () => $("volumeMute").click()],
            [
                ["b"],
                "B",
                "Play as a band",
                "Every part in a window of its own, side by side",
                () => !following && $("band").click(),
            ],
        ],
    ],
    [
        "View",
        [
            [
                ["h"],
                "H",
                "Minimal view",
                "Just the highway and the lyrics",
                toggleMinimal,
            ],
            [["d"], "D", "2D tab view", "Or back to the 3D highway", toggleTabView],
            [["f"], "F", "Full screen", "", toggleFullscreen],
            [["o"], "O", "Open a song", "", () => $("open").click()],
            [["s"], "S", "Settings", "", () => toggleSheet("settings")],
            [
                ["?"],
                "?",
                "Notation and shortcuts",
                "This sheet",
                () => toggleSheet("legend"),
            ],
            [
                ["Escape"],
                "Esc",
                "Close what is open",
                "Settings, this sheet, the volume or the menu",
                () => {
                    toggleSheet("settings", false);
                    toggleVolume(false);
                    toggleMenu(false);
                },
            ],
        ],
    ],
];
shortcutRows = () =>
    legendRows(
        SHORTCUTS.map(([group, rows]) => [
            `Keyboard shortcuts: ${group.toLowerCase()}`,
            rows.map(([, shown, name, more]) => [
                name,
                more,
                `<div class="keys">${shown
                    .split(" ")
                    .map((k) => `<kbd>${k}</kbd>`)
                    .join("")}</div>`,
            ]),
        ]),
    );
showLegend();
const SHORTCUT_KEYS = new Map(
    SHORTCUTS.flatMap(([, rows]) =>
        rows.flatMap(([keys, , , , run]) => keys.map((k) => [k, run])),
    ),
);
addEventListener("keydown", (e) => {
    if (
        mounted &&
        (!canvas.clientWidth ||
            !(
                root.contains(e.target) ||
                barTools.some((t) => t.contains(e.target)) ||
                e.target === document.body
            ))
    )
        return; // mounted: keys pressed in the page around the player, in its inputs and on its buttons, are that page's (the player's docked tools are the player's, the rest of a dock element the page's); so are all of them while the player is hidden
    if (
        e.key !== "Escape" &&
        (e.target.tagName === "INPUT" || e.target.closest?.(".sheet"))
    )
        return; // typing, and space and arrows, belong to the controls there
    if (e.metaKey || e.ctrlKey || e.altKey) return; // the browser's own shortcuts, like Cmd+F to find
    const run = SHORTCUT_KEYS.get(
        e.key.length === 1 ? e.key.toLowerCase() : e.key,
    );
    if (!run) return;
    e.preventDefault();
    run(e);
});

// --- Band: every other part in a window of its own, all in time. The window that opened them plays the song and
// sends the others its time every frame; they draw from it, and send it their play, pause, jumps, speed and loop.
// ponytail: windows of one browser on one computer (BroadcastChannel), a server if players join from elsewhere
const band = new BroadcastChannel("fretfall-band"),
    bandWindows = [],
    leader = { t: 0, at: 0, playing: false, speed: 1, loop: null },
    wallClock = () => performance.timeOrigin + performance.now(); // the same in every window
let leading = false;
const bandSong = () => ({
    ...song,
    audio: null,
    arrangements: song.arrangements.map(({ track, ...a }) => a), // alphaTab's tracks stay with the synth here
});
const bandPlayer = {
    get time() {
        return (
            leader.t +
            (leader.playing
                ? ((wallClock() - leader.at) / 1000) * leader.speed
                : 0)
        );
    },
    get playing() {
        return leader.playing;
    },
    play: () => band.postMessage({ do: "play" }),
    pause: () => band.postMessage({ do: "pause" }),
    seek: (t) => band.postMessage({ do: "seek", t }),
    setSpeed: (v) =>
        v !== leader.speed && band.postMessage({ do: "speed", v }),
    setVolume: () => {},
    stop: () => {},
};
band.onmessage = ({ data }) => {
    if (following) {
        if (data.bye) return close();
        if (data.song && (data.part ?? bandPart) === bandPart) {
            setSong(data.song);
            if (arr) {
                selectArrangement(
                    Math.min(+bandPart, song.arrangements.length - 1),
                );
                if (!mounted)
                    document.title = `${arr.name} · ${document.title}`;
            }
            status(null);
        }
        const clock = data.clock; // the other band windows' messages to the first one aren't for us
        if (!clock) return;
        const changed = clock.playing !== leader.playing;
        Object.assign(leader, clock);
        if (changed) updatePlayButton();
        if (clock.speed !== speed) setSpeed(clock.speed);
        if (JSON.stringify(clock.loop) !== JSON.stringify(loop)) {
            loop = clock.loop;
            markLoop();
        }
        return;
    }
    if (!leading) return;
    if (data.hello !== undefined)
        band.postMessage({ song: bandSong(), part: data.hello });
    if (data.do === "play" && !player.playing)
        Promise.resolve(player.play()).catch(
            (e) => e.name !== "AbortError" && status(e.message),
        );
    if (data.do === "pause" && player.playing) player.pause();
    if (data.do === "seek") player.seek(data.t);
    if (data.do === "speed") setSpeed(data.v);
    if (data.do === "loop") {
        loop = data.loop;
        markLoop();
    }
};
// Each part in a column of the screen by its place in the header, this one's too: a page can't resize the tab it's in,
// only windows it opened, so this tab stays behind them and plays the sound. Browsers let a click open one window unless
// the page may open pop-ups, so it says when some didn't open; pressing again opens the rest
$("band").onclick = () => {
    leading = true;
    const parts = song.arrangements,
        width = Math.floor(screen.availWidth / parts.length);
    let blocked = 0;
    parts.forEach((_, i) => {
        if (bandWindows[i] && !bandWindows[i].closed)
            return bandWindows[i].focus();
        const url = new URL(location.href);
        url.searchParams.set("band", i);
        bandWindows[i] = window.open(
            url,
            `fretfall-band-${i}`,
            `popup,left=${(screen.availLeft ?? 0) + i * width},top=${screen.availTop ?? 0},width=${width},height=${screen.availHeight}`,
        );
        if (!bandWindows[i]) blocked++;
    });
    if (blocked)
        status(
            `The browser blocked ${blocked} ${blocked > 1 ? "windows" : "window"}: allow pop-ups for this page, then press again`,
        );
};
$("band").hidden = following;
addEventListener(
    "pagehide",
    () => leading && band.postMessage({ bye: true }),
); // the band ends with the window it started from

// --- Frame loop
const canvas = $("highway"),
    cam = {};
const songTime = () =>
    player ? player.time - settings.offset / 1000 : 0;

// A row for each line of lyrics on screen, kept while it shows so it can move up. When the lines step on by one, the
// top row goes out the top and a new row coming in waits for the others to move up; when they're done for now it
// fades; after a jump it's simply gone
const lyricRows = new Map(); // line → its row
function showLyrics(t) {
    const lines = song.lines,
        { top, bottom } = lyricsShown(lines, t),
        places = new Map(
            [top, bottom]
                .filter((i) => i >= 0)
                .map((i) => [lines[i], i === bottom]),
        );
    let movingUp = false;
    for (const [line, row] of lyricRows) {
        if (places.has(line)) continue;
        lyricRows.delete(line);
        const up = row.at === top - 1;
        if (!up && top >= 0) {
            row.remove();
            continue;
        }
        movingUp ||= up;
        row.classList.add("gone");
        row.classList.toggle("up", up);
        setTimeout(() => row.remove(), 800);
    }
    for (const [line, low] of places) {
        let row = lyricRows.get(line);
        if (!row) {
            row = Object.assign(document.createElement("div"), {
                className: `gone${low ? " low" : ""}`,
                at: lines.indexOf(line),
            });
            row.append(
                ...line.syllables.map((s) =>
                    Object.assign(document.createElement("span"), {
                        textContent: s.text,
                    }),
                ),
            );
            $("lines").append(row);
            row.getBoundingClientRect(); // drawn hidden first, so it fades in
            if (movingUp) {
                row.style.transitionDelay = "0.2s";
                setTimeout(() => (row.style.transitionDelay = ""), 700);
            }
            lyricRows.set(line, row);
        } else if (row.low !== low) row.style.transitionDelay = ""; // moving up: straight away
        row.low = low;
        row.classList.remove("gone");
        row.classList.toggle("low", low);
        const sung = line.syllables.filter((s) => s.time <= t).length;
        if (row.sung !== sung) {
            row.sung = sung;
            [...row.children].forEach((s, j) =>
                s.classList.toggle("sung", j < sung),
            );
        }
    }
}

function updateOverlay(t) {
    const time = `${clock(t)} / ${clock(song.length)}`;
    if (ui.time !== time) $("time").textContent = ui.time = time;
    $("progress").firstElementChild.style.width =
        `${Math.min(100, (t / song.length) * 100)}%`;

    const p = arr.phrases.findLastIndex((x) => x.time <= t);
    if (ui.phrase !== p) {
        ui.phrase = p;
        bars.forEach((b, j) => {
            b.classList.toggle("done", j < p);
            b.style.background = "";
        });
    }
    if (bars[p]) {
        const pct = Math.min(
            100,
            ((t - arr.phrases[p].time) /
                (arr.phrases[p].endTime - arr.phrases[p].time)) *
                100,
        );
        bars[p].style.background =
            `linear-gradient(90deg, var(--accent) ${pct}%, var(--todo) ${pct}%)`;
    }

    const section =
        arr.sectionLabels[
            arr.sections.findLastIndex((x) => x.time <= t)
        ] ?? "";
    if (ui.section !== section)
        $("section").textContent = ui.section = section;

    showLyrics(t);

    // The intro card, until the first notes come into view (not over a message, nor with the song intro setting off):
    // press play, or get ready.
    // Its text changes once a second at most
    const first = arr.notes[0]?.time ?? 0,
        intro =
            settings.songIntro && first - t > lookAhead(settings) && $("status").hidden
                ? `${!!player?.playing}|${Math.ceil((first - t) / speed)}`
                : "";
    if (ui.intro !== intro) {
        ui.intro = intro;
        $("intro").classList.toggle("show", !!intro);
        $("introBars").classList.toggle("moving", !!intro && !!player?.playing);
        if (intro)
            $("introText").textContent = player?.playing
                ? `Get ready · first notes in ${intro.split("|")[1]}`
                : "Press Space to play";
    }
}

// The song's own work, whether it's drawn or not: a Guitar Pro score built, loops and the speed trainer, the metronome,
// and the band's clock. → the song's time
function tick() {
    if (
        player === synthPlayer &&
        api.tickCache &&
        api.tickCache !== builtCache
    ) {
        builtCache = api.tickCache;
        const next = songFromScore(api.score, api.tickCache);
        synth.tempo = next.tempo;
        setSong(next);
        resolveSong();
        autoplay();
        if (api.score.backingTrack?.rawAudioFile)
            status(
                "Playing the recording that comes with this file",
            );
        else if ($("statusText").textContent === OPENING)
            status(null);
    }
    const t = songTime();
    if (loop && player?.playing && t >= loop.end && !following) {
        player.seek(Math.max(0, loop.start - 1)); // one second of run-up
        if (training) setSpeed(speed + 0.1); // the speed trainer: faster each time round
    }
    metronome(t);
    if (leading)
        band.postMessage({
            clock: {
                t: player.time,
                at: wallClock(),
                playing: player.playing,
                speed,
                loop,
            },
        });
    return t;
}
function frame() {
    if (bandOpen()) return keepTime();
    requestAnimationFrame(frame);
    startFrame();
    const t = tick();
    lap("song");
    const shown = benchTime() ?? t;
    if (!mounted || canvas.clientWidth) // no width while the page the player is mounted in hides it: nothing to draw on
        (settings.tabView ? drawTab : drawHighway)(canvas, arr, shown, theme, cam);
    if (song && arr) updateOverlay(shown);
    lap("overlay");
    endFrame();
}
// While the band plays, this window sits behind the parts' windows: it draws nothing and keeps time on a timer (a
// covered window gets no animation frames, and one playing sound keeps its timers), until the band's windows close
const bandOpen = () => leading && bandWindows.some((w) => w && !w.closed);
function keepTime() {
    root.classList.add("banding");
    $("bandNote").hidden = false;
    const timer = setInterval(() => {
        if (bandOpen()) return tick();
        clearInterval(timer);
        root.classList.remove("banding");
        $("bandNote").hidden = true;
        requestAnimationFrame(frame);
    }, 50);
}
$("bandBack").onclick = () => {
    for (const w of bandWindows) w?.close();
};

// --- For a page built on the player, like a song library: open songs, choose the part, and follow along through events
// on window, each with its facts in detail: fretfall:song (a song is ready: file, title, artist, parts, part),
// fretfall:playing ({ playing }), fretfall:ended (played out to its end, rather than paused: what a library autoplaying a
// setlist follows) and fretfall:sheet (Settings or the notation sheet: { name, open }). The page can use
// the player's markup and styles too, but only this stays put as the player changes. fretfall:ready: it's here
function announce(name, detail) {
    dispatchEvent(new CustomEvent(`fretfall:${name}`, { detail }));
}
// --- Controls a page can build its own of. Everything the header's controls do is on the hook as well, so a bar of the
// page's own drives the player without reaching into its markup: `controls` is what such a bar
// draws itself from, and fretfall:controls says it changed — one listener, one re-render, rather than an event per knob.
// Only what a control toggles is in it; time and length move on their own and have accessors of their own
function controlState() {
    return {
        playing: !!player?.playing,
        speed,
        volume: settings.volume,
        muted: settings.volumeMuted,
        loop: loop ? { start: loop.start, end: loop.end } : null,
        metronome: settings.metronome,
        parts: song?.arrangements.map((a) => a.name) ?? [],
        part: song ? song.arrangements.indexOf(arr) : -1,
        sheet: Object.keys(SHEETS).find((name) => !$(name).hidden) ?? null,
        fullscreen: !!document.fullscreenElement,
    };
}
function tellControls() {
    if (announcing) announce("controls", controlState());
}
// What Open takes, on its tooltip and while files are dragged over: a page's formats first
function describeOpening() {
    const kinds = [
        ...formats.map((f) => f.name),
        "a Guitar Pro file",
        "or a tab with its recording",
    ].join(", ");
    $("openTip").lastChild.textContent = `${kinds[0].toUpperCase()}${kinds.slice(1)}. You can also drop them anywhere`;
    $("drop").textContent = `Drop ${kinds}`;
}
window.fretfall = {
    open: (files, options) => openFiles(files, options), // → done once they're open
    pick: () => $("file").click(), // the Open dialog
    get playing() {
        return !!player?.playing;
    },
    set playing(on) {
        if (!on) player?.pause();
        else if (!following) playWhenReady(); // waits for the synth's instruments if the song has just opened
    },
    get time() {
        return player?.time ?? 0; // seconds into the song
    },
    set time(t) {
        if (song && !following) // a jump to there, kept within the song; a band window follows its first one, as with playing
            player.seek(Math.min(song.length, Math.max(0, +t || 0)));
    },
    get length() {
        return song?.length ?? 0; // the song's, in seconds
    },
    get speed() {
        return speed; // 1 is the song's own tempo
    },
    get style() {
        // What the instrument looks like: the note shape, the colours, the fonts, the string colours, the headstock
        return {
            look: settings.look,
            colors: settings.colors,
            fonts: settings.fonts,
            strings: settings.strings,
            headstock: settings.headstock,
        };
    },
    set style(next) {
        // Each name has to be one this player knows (a page may add its own colour set to COLORS first)
        for (const [key, options] of Object.entries({
            look: LOOKS,
            colors: COLORS,
            fonts: FONTS,
            strings: STRINGS,
            headstock: HEADSTOCKS,
        }))
            if (next?.[key] && options[next[key]]) settings[key] = next[key];
        save();
        applyTheme();
    },
    set speed(v) {
        setSpeed(+v || 1); // the player's own steps and limits: 10% to 150%, in tenths
    },
    get volume() {
        return settings.volume; // 0 to 1, what the slider holds; muted is a switch of its own
    },
    set volume(v) {
        setVolume(Math.min(1, Math.max(0, +v || 0)), false); // as the slider does: asking for a volume asks for sound
    },
    get muted() {
        return settings.volumeMuted;
    },
    set muted(on) {
        setVolume(settings.volume, !!on);
    },
    get metronome() {
        return settings.metronome;
    },
    set metronome(on) {
        if (!!on !== settings.metronome) toggleTool("metronome");
    },
    get loop() {
        return loop ? { start: loop.start, end: loop.end } : null; // a copy: a loop is set whole, never edited in place
    },
    set loop(range) {
        const start = Math.max(0, +range?.start || 0),
            end = Math.min(song?.length ?? 0, +range?.end || 0);
        loop = range && end > start ? { start, end } : null; // anything else clears it, as the loop button does
        markLoop();
    },
    get sheet() {
        return Object.keys(SHEETS).find((name) => !$(name).hidden) ?? null; // "settings", "legend", or null
    },
    set sheet(name) {
        if (name === null || name in SHEETS) toggleSheet(name, name !== null);
    },
    get fullscreen() {
        return !!document.fullscreenElement;
    },
    set fullscreen(on) {
        if (!!on === !!document.fullscreenElement) return;
        if (on) root.requestFullscreen(); // set it from the page's own click: the browser wants a gesture behind it
        else document.exitFullscreen();
    },
    get controls() {
        return controlState(); // everything a bar of the page's own draws itself from; fretfall:controls says it changed
    },
    get notes() {
        // What the part shown is asking for, so a page can listen to a guitar and say whether it was played: the open
        // strings' notes, low to high as the fretboard is drawn, and every note as seconds into the song, string,
        // fret, and the midi note it sounds. A copy, made on each read: read it once a song, not each frame.
        if (!song || !arr) return null;
        const open = [...(arr.open ?? [])];
        return {
            open,
            notes: arr.notes.map((n) => ({
                time: n.time,
                sustain: n.sustain,
                string: n.string,
                fret: n.fret,
                midi: (open[n.string] ?? 0) + n.fret,
            })),
        };
    },
    get parts() {
        return song?.arrangements.map((a) => a.name) ?? [];
    },
    get part() {
        return song && arr ? song.arrangements.indexOf(arr) : -1;
    },
    set part(i) {
        if (song?.arrangements[i] && song.arrangements[i] !== arr)
            selectArrangement(i);
    },
    closeSheets: () => toggleSheet(null, false),
    // The header's controls in an element of the page's own, and the sheet and full screen buttons in `more` if given;
    // null brings them home (see dockTools)
    dock: dockTools,
    // A kind of song file the player doesn't read itself: { name ("a .pak"), extensions ([".pak"]), open(file,
    // options) → { song, audio } }. song: the model the highway draws (see songFromScore); audio: a Blob of its
    // recording. options: what fretfall.open was given, and status(text) to say what is taking the time
    addFormat: (format) => {
        formats.push(format);
        $("file").accept += format.extensions.map((ext) => `,${ext}`).join("");
        describeOpening();
    },
};
announcing = true;
announce("ready");

usePlayer(following ? bandPlayer : synthPlayer);
setVolume();
if (following) {
    band.postMessage({ hello: bandPart });
    status("Waiting for the window the band started from", true);
} else status(null); // the player opens with no song of its own: the page around it hands over the first one (the demo page offers its own, see index.html).
// Nothing to wait for either way — alphaTab is only ever ready once it has a song to play (see api.playerReady)
if (new URLSearchParams(location.search).has("perf"))
    startProfiler(canvas, () => song?.length ?? 0); // see perf.js
requestAnimationFrame(frame);
