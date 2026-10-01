# Chordbook

A small, dependency-free guitar chord explorer at `/guitar/`.

- 17 common major, minor, seventh and suspended chord shapes.
- Standard tuning (E A D G B E), low string on the left, frets 1–5.
- Finger numbers, muted/open strings, mini-barre F and barre B minor.
- Notes and chord formulas, semitone distances, and basic explanations.
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
```

Set `CHROME_PATH` to a local Chrome executable if Playwright's Chromium is not
installed. Set `ARTIFACTS_DIR` to keep screenshots in a chosen directory.

The diagrams are generated from the fret data; theory note names and audio
frequencies are derived from the same chord definitions. This keeps the three
views consistent. The page links to Fender's guide to reading chord diagrams
and musictheory.net's introduction to triads for further learning.
