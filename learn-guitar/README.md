# Learn Guitar

A static HTML/CSS/JavaScript songbook with no package dependencies. Serve this
folder over HTTP(S) for playback; the browser loads local song scripts and bundled
acoustic-guitar recordings. Node is needed only to import/check songs, not to host
or use the player.

## Add a song

Attach a clear photo of the whole sheet in this project's chat and say:

> Add this to my Learn Guitar songbook.

The project instructions route the assistant to the versioned
[photo-to-song skill](skills/add-guitar-tab/SKILL.md). It handles transcription,
repeated phrases, suggested play-along chords, import, and verification. Blurry
notes or missing rhythm get specific questions rather than silent guesses.

For a separate ChatGPT chat, attach the photo and
[this portable transcription prompt](photo-to-song-prompt.txt). Bring its JSON
and the original photo back to the chat connected to this repository. The prompt
does not connect an unrelated chat to GitHub or automatically publish anything.

### Import commands

Start from [song-template.json](song-template.json), or use the existing song's
JSON as a complete example. The starter intentionally fails validation until its
notes and outstanding question have been replaced. From the repository root:

```sh
node learn-guitar/tools/songbook.cjs validate /tmp/new-song.json
node learn-guitar/tools/songbook.cjs import /tmp/new-song.json --photo /path/to/tab.jpg
node learn-guitar/tests/run.cjs
```

Import validates the whole library before writing, copies a JPG/PNG/WebP photo
to a content-versioned path under `assets/sheets/`, saves the JSON, discovers exact
repeated melodies, and regenerates the song files and menu. It refuses duplicate
IDs, unresolved transcription questions, unsafe image paths, malformed tokens,
incorrect bar totals, and invalid ties/ranges. A passing check does not establish
that the photo was read correctly; visually compare the notes and listen too.

For a correction to the same arrangement, pass `--replace`. Use a different ID for
a different arrangement. Do not change IDs after sharing links. Omit `--photo`
when keeping an existing image or adding an original exercise without a photo.

`songs/data/<id>.json` is the source of truth. To edit it directly, then rebuild:

```sh
node learn-guitar/tools/songbook.cjs build
node learn-guitar/tools/songbook.cjs build --check
```

`songs/<id>.js` and `songs/catalog.js` are generated. Do not edit them by hand.
Commit the JSON, photo, generated scripts, and `index.html` together. Publication
uses this repository's existing GitHub Pages workflow and authorization.

The selector lists songs by title. `?song=jingle-bell-rock` links directly
to a song. Switching songs stops playback and restores that song’s tempo, playback
range, and toggle settings when browser storage is available. Back/forward navigation
also switches songs. Files and source-image paths are relative to `index.html`.

## Song format

The JSON envelope requires `schemaVersion: 1`, `source`, and `transcription` plus
the musical fields: `id`, `title`, `tempo` (40–200 quarter-note BPM), `beatsPerBar`
(1–6 quarter beats), `tuning` (six MIDI pitches, thin e to thick E), `capo` (0–12),
and `rawBars`. Standard tuning is `[64,59,55,50,45,40]`; the player adds the capo
offset. Tab frets and chord shapes are relative to the capo.

Each bar is `[notesOrRepeat, chordLabel, optionalHint]`:

```json
[
  ["2:1:.5 2:1:.5 2:1:1 2:0:2", "C", "Let the last note ring."],
  [1, "C"]
]
```

- `string:fret:duration`: strings 1–6, frets 0–24, duration in quarter beats.
- `r:duration`: rest.
- `string:fret:duration:t`: tie from the immediately preceding matching pitch,
  including across a bar line. A tied note is not picked again.
- Durations use half-beat increments; each bar must total `beatsPerBar`.
- A repeat references an earlier bar; repeating a repeat is supported.
- The importer also converts exact repeated melodies to references, preserving
  each bar's chord and custom hint. If `repeatSummary` is omitted it is generated.
- Chord labels are displayed verbatim. They do not trigger chord audio.

Optional fields:

- `sections`: `{letter, name, start, end}` with inclusive, one-based bar numbers.
- `chordShapes`: `[name, [lowE, A, D, G, B, highE]]`; -1 = muted, 0 = open,
  frets 1–4 supported by the open-position diagrams.
- `tuningLabel`, `repeatSummary`, `accompaniment`: plain text.
- `tips`: arrays of `[heading, body]`, plain text.
- `source.image`: a local path under `assets/`; the importer sets it with `--photo`.
- `layout`: preserve the photographed sheet's row breaks on iPad and larger
  screens. `rows` lists the number of bars per row and must cover the whole song.
  Optional `widths` gives relative bar widths for each row. For example,
  `{"rows":[2,3],"widths":[[1,2],[1,1,1]]}` gives five bars in two rows, with
  the second bar of the first row twice as wide as the first. The default is equal
  widths. Jingle Bell Rock uses the photo's six rows: 5, 6, 5, 6, 5, 5 bars.

Required transcription context:

- `source.description`: describe the supplied source and any rhythm, tuning,
  capo, or practice-tempo assumptions. Visible below the sheet.
- `transcription.rhythm`: `from-photo`, `interpreted`, or `user-specified`.
- `transcription.chords`: `from-photo`, `suggested`, or `none`. Chords need an
  `accompaniment` explanation; suggested chords must be labeled as suggestions.
- `transcription.unresolved`: questions as strings. Must be `[]` before import.

Number bars in playback order. Expand printed repeat signs and alternate endings,
and describe that in the source notes. Do not use ties for hammer-ons or pull-offs.

The renderer lays out any number of bars in one continuous sheet. At widths of
700px and up, songs with `layout` retain the photo's rows and relative bar widths,
including on portrait and landscape iPad. String lines align across each row;
note sizes stay consistent even when bar widths differ. Narrow windows use the
readable fallback: one bar per row through 600px, then two. Songs without a saved
layout keep the original responsive grid (up to four bars per row).
String labels follow each new row. Rotation reflows the sheet without restarting
playback or losing the active note. Touch controls are at least 44px tall; extra
controls live under Options. Print preserves the displayed photo layout, or uses
four bars per row in the fallback layout. Printing excludes controls and help.
Jingle Bell Rock fits on one sheet;
longer future songs may span multiple printed pages. Compound/mixed meters,
triplets, sixteenth notes, pickup bars, polyphonic tab, slides/bends/hammer-ons,
and movable chord diagrams are not supported yet. Extend the shared model/player
or obtain an explicit choice of simplification before importing those features.

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

Run `node learn-guitar/tools/songbook.cjs build` after changing player code or CSS.
It assigns content hashes to the player assets, catalog, and individual song URLs
so a deployment refreshes cached files automatically. No handwritten cache token
is needed. `node learn-guitar/tests/run.cjs` checks generated-file freshness as well
as import, transcription-model, and playback behavior.
