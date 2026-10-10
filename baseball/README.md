# Fieldnotes

A static baseball scorebook with a fielding-position picker, lessons, and a notation reference.

## Local preview

```sh
cd baseball
npm start
```

Open http://127.0.0.1:4173. No dependency installation or build is required. The production path is https://tayre.github.io/baseball/.

## Scoring

- Select a result and review the runner destinations.
- For **Groundout** or **Double play**, tap fielders in order. Shortstop → First base produces `6-3`; a single fielder produces an unassisted out such as `3U`.
- For **Flyout** or **Error**, tap one fielder. A new tap replaces the selection. **Undo** removes the last position; **Clear** resets the picker. **Edit notation** allows manual entry.
- A double play is available with a runner on base and fewer than two outs. It suggests the batter and one runner out; check that they are the correct runners.
- **Runner play** records steals, caught stealing, wild pitches, and passed balls without advancing the batter.
- On third-out plays, runs are excluded by default. For a timing play, select Home only for runs that crossed before the out, leave other runners at their last base, and enable **Count runs**. Runs never count on a third-out force or batter retired before first.
- **Undo** restores the previous play. **Finish game** closes the game; **Reopen game** resumes it. Extra innings are supported.
- **Print scorecards** includes both teams. **Export game** saves the complete event history as JSON. Import is not currently supported.

The current game is saved in browser local storage. Starting a new game replaces it. Saves are specific to the browser and site address.

This is a basic fan’s scorebook. It does not calculate RBI, earned runs, pitch counts, substitutions, or automatic game-ending rules. Error credit is one error per play. Google Fonts is optional; system fonts are used if unavailable. There are no analytics or server-side saves.

## Tests

```sh
npm test
```

Requires Node.js 18 or later. Tests cover scoring, runner advancement, inning changes, undo, position selection, and generated notation.

- `index.html` — app shell, lessons, and forms
- `styles.css` — responsive layout and print styles
- `app.js` — interaction, rendering, saving, exports, and quiz
- `engine.js` — event-based scoring
- `positions.js` — field positions, selection, and notation

[MLB scoring guide](https://www.mlb.com/official-information/basics/score)
