# Learn Guitar

A build-free HTML/CSS/JavaScript songbook. Open `index.html` directly, or serve this
folder with a static web server. The player loads local song scripts on demand;
there are no package dependencies. Acoustic-guitar samples are bundled locally.
Audio requires HTTP(S); use a static server for local playback instead of a file URL.

## Add a song

1. Copy `songs/jingle-bell-rock.js` to a new file in `songs/`.
2. Set a unique URL-safe `id` in both the registry assignment and song object.
3. Replace the title, notes, chords, sections, tips, and source information.
4. Add `{id, title, file}` to `songs/catalog.js`. No player or HTML edits are needed.
5. Run `node learn-guitar/tests/song-model.test.cjs` from the repository root.

The selector lists catalog entries in order. `?song=jingle-bell-rock` links directly
to a song. Switching songs stops playback and restores that song’s tempo, playback
range, and toggle settings when browser storage is available. Back/forward navigation
also switches songs. Files and source-image paths are relative to `index.html`.

## Song format

Required fields: `id`, `title`, `tempo` (40–200 quarter-note BPM), `beatsPerBar`
(1–6 quarter beats), `tuning` (six MIDI pitches, thin e to thick E), `capo` (0–12),
and `rawBars`. Standard tuning is `[64,59,55,50,45,40]`; the player adds the capo
offset. Tab frets and chord shapes are relative to the capo.

Each bar is `[notesOrRepeat, chordLabel, optionalHint]`:

```js
['2:1:.5 2:1:.5 2:1:1 2:0:2', 'C', 'Let the last note ring.'],
[1, 'C'] // Repeat the melody of bar 1; keep this bar’s own chord label.
```

- `string:fret:duration`: strings 1–6, frets 0–24, duration in quarter beats.
- `r:duration`: rest.
- `string:fret:duration:t`: tie from the immediately preceding matching pitch,
  including across a bar line. A tied note is not picked again.
- Durations use half-beat increments; each bar must total `beatsPerBar`.
- A repeat references an earlier bar; repeating a repeat is supported.
- Chord labels are displayed verbatim. They do not trigger chord audio.

Optional fields:

- `sections`: `{letter, name, start, end}` with inclusive, one-based bar numbers.
- `chordShapes`: `[name, [lowE, A, D, G, B, highE]]`; -1 = muted, 0 = open,
  frets 1–4 supported by the open-position diagrams.
- `tuningLabel`, `repeatSummary`, `accompaniment`: plain text.
- `tips`: arrays of `[heading, body]`, plain text.
- `source`: `{image, description}`; omit it for songs without a source photo.

The renderer lays out any number of bars in one continuous sheet: one bar per
row on phones, two on tablets (including iPad split view), and four on wide screens.
String labels follow each new row. Rotation reflows the sheet without restarting
playback. Touch controls are at least 44px tall; extra controls live under Options.
Print always uses four bars per row, including incomplete final rows. Printing excludes controls and help. Jingle Bell Rock fits on one sheet;
longer future songs may span multiple printed pages. Compound meters, triplets,
polyphonic tab, and movable chord diagrams are not supported yet.

`script.js` owns playback and UI, `song-model.js` validates transcription data,
`styles.css` controls the screen/print layouts, and `songs/` contains the catalog
and individual songs. Musical data never belongs in the player or HTML.


## Audio and tempo

The BPM number and slider work before and during playback (40–200 BPM). Tempo
changes preserve beat position and retime queued notes, the click track, highlights,
and sustained-note releases without changing sample pitch. Volume is in Options.
Settings are saved per song.

`acoustic-guitar.js` loads only the recordings needed by the selected passage,
then caches the decoded samples for the session. `playback.js` owns the beat clock,
look-ahead scheduling, ties, and live tempo changes. The audio remains mostly dry,
with light room ambience, gentle EQ/compression, and smooth note releases.
Sample sources and licensing are in `assets/audio/acoustic-guitar/CREDITS.txt`.

Run the timing regression checks with `node learn-guitar/tests/playback.test.cjs`.


Tap the sheet or page background to play/pause; the main button uses the same
behavior. Pause preserves the beat and sample offset, including inside tied notes.
Resume continues from that spot; Start over resets the selection. Scrolling, drags,
long presses, text selection, and interactive controls do not toggle playback.
