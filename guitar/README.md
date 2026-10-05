# Chordbook

A small, dependency-free guitar chord and scale explorer at `/guitar/`.

- 17 common major, minor, seventh and suspended chord shapes.
- Standard tuning (E A D G B E), low string on the left, frets 1–5.
- Finger numbers, muted/open strings, mini-barre F and barre B minor.
- Notes and chord formulas, semitone distances, and basic explanations.
- Numbered major scales and note-labelled fret distances for each chord.
- Separate Chords, Minor pentatonic and Solo practice tabs, with keyboard navigation.
- Solo practice transposes all five minor pentatonic shapes into 12 keys.
- A minimal, warm-paper solo workspace with muted shape colours and ten reversible
  slide routes on high E, B, G and D. Arrows join actual notes and label the frets.
- Phones show four stacked shape-pair diagrams without sideways scrolling.
  Pair and single-shape views also fit small screens. Tap notes to hear them.
  Phone diagrams are built only at the small-screen breakpoint; audio stops when
  changing layouts. The optional pair view has a numbered audible phrase.
- A slow minor-chord vamp or i–♭VI–♭VII–i backing loop, with count-in,
  tempo, volume and optional click. Chord tones are ringed as landing notes.
- Listen & answer alternates a one-bar example lick with a bar for your reply.
  The example includes string/fret labels and rhythm; no microphone is required.
- All five A minor pentatonic shapes, from frets 5–17, plus shape 1 repeating
  at frets 17–20. All shapes share one continuous, playable fretboard with numbered shape spans.
- Shape highlighting keeps the whole neck visible and shows shared notes,
  neighbouring positions and a connecting phrase for every pair. A B-string route follows the scale along the neck.
- Root-finding, phrasing and transposition explanations for beginners.
- An audible C major / C minor comparison showing the lowered third.
- Synthesized chord, arpeggio and individual-note playback with Web Audio.
- A C–G–Am–F practice progression and shareable chord links such as `#Am`.

Serve this folder with any static server. From the repository root, for example:

```sh
python3.11 -m http.server 8089 --bind 127.0.0.1
```

Open `http://localhost:8089/guitar/`. No install or build is needed. The page
does not fetch external assets, use a microphone, or collect data. Audio starts
only after an explicit button press; these are synthesized reference tones,
not guitar recordings. Fingerings are common options, not the only options.

## Checks

Run `npm test` from this folder to validate every shape's pitches, intervals,
note spelling, finger positions and muted strings. Browser QA is optional:

```sh
PLAYWRIGHT_PATH=/path/to/playwright TEST_URL=http://127.0.0.1:8089/guitar/ node qa/browser.cjs
PLAYWRIGHT_PATH=/path/to/playwright TEST_URL=http://127.0.0.1:8089/guitar/ node qa/solo-browser.cjs
```

Set `CHROME_PATH` to a local Chrome executable if Playwright's Chromium is not
installed. Set `ARTIFACTS_DIR` to keep screenshots in a chosen directory.

The diagrams are generated from the fret data; theory note names and audio
frequencies are derived from the same chord definitions. Pentatonic notes are
derived from the displayed string and fret. Unit tests check all five shapes,
their coverage of the scale, neighbouring overlaps and the connecting phrases.
Browser QA checks chord and scale playback, tabs, keyboard navigation, small
screens and audio fallback. The page links to Fender's guide to reading chord
diagrams and musictheory.net's introduction to triads for further learning.

Chord links use hashes such as `#Am`. Scale links use `#pentatonic-3` or
`#pentatonic-3-connect` to restore the lesson and highlights.
`#pentatonic-all` shows all shapes equally on the continuous fretboard.
`#solo` opens solo practice. Start with A minor, shape 1 and the minor vamp:
play a short phrase, leave space, and finish on a ringed chord tone. Try Listen
& answer before adding chord changes. Changing the lesson, key, shape, mode,
backing or tempo stops playback; hiding the page also stops playback.

The backing scheduler precomputes its four-bar harmony and reuses control and
note references. Unchanged chords do not rebuild the lick or fretboard; idle
and hidden pages stop the playback timers. No framework or external assets.
