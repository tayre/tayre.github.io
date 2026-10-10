# Fieldnotes

A touch-first baseball scorebook with MLB game selection, a fielding-position picker, lessons, and a notation reference.

## Local preview

```sh
cd baseball
npm start
```

Open http://127.0.0.1:4173. No dependency installation or build is required. The production path is https://tayre.github.io/baseball/.

## Scoring

- **Choose game** opens the MLB schedule, starting with the Blue Jays. Select a month and season, or switch to **All MLB**. Past games open an empty scorebook with the starting lineup, ready to score a replay. Scores are not imported.
- Starting lineups load when available. Before recording a play, **Settings → Load lineup** can refresh a lineup that has not been posted yet. **Custom game** accepts your own teams and batting order.
- Tap a result, then tap each runner's destination and save the play. Suggested destinations are a starting point; adjust them to what happened.
- For **Groundout** or **Double play**, tap fielders in order. Shortstop → First base produces `6-3`; a single fielder produces an unassisted out such as `3U`.
- For **Flyout** or **Error**, tap one fielder. A new tap replaces the selection. **Undo** removes the last position; **Clear** resets the picker. **Edit notation** allows manual entry.
- A double play is available with a runner on base and fewer than two outs. It suggests the batter and one runner out; check that they are the correct runners.
- **Runner play** records steals, caught stealing, wild pitches, and passed balls without advancing the batter.
- On third-out plays, runs are excluded by default. For a timing play, select Home only for runs that crossed before the out, leave other runners at their last base, and enable **Count runs**. Runs never count on a third-out force or batter retired before first.
- **Undo** restores the previous play. **Finish game** closes the game; **Reopen game** resumes it. Extra innings are supported.
- **Other** offers sacrifice fly, sacrifice bunt, and dropped third strike presets, with optional manual notation.
- **Settings → Print** includes both teams. **Export** saves the current game as JSON, including its event history and summary.

## Saved games and settings

Each game is saved automatically. Starting another game keeps the previous game in **Settings → Saved games**; tap it to resume. Selecting that same MLB game in the schedule also resumes it. Settings includes the favourite team, individual exports, and **Export all** for a complete JSON backup. Import is not currently supported.

Saves are local to the browser and site address. They do not sync between a phone and iPad, and clearing site data removes them. Export a backup to keep a separate copy. Storage failures show a warning and leave the current game available for export. Existing single-game saves migrate into the library; unreadable data is kept for recovery export.

MLB schedule and lineup requests require an internet connection and use `statsapi.mlb.com`. Saved games can be scored without further API requests while the app is open. This app does not yet install or cache itself for offline launch.

This is a basic fan’s scorebook. It does not calculate RBI, earned runs, pitch counts, substitutions, or automatic game-ending rules. Error credit is one error per play. Google Fonts is optional; system fonts are used if unavailable. There are no analytics or server-side saves.

## Tests

```sh
npm test
```

Requires Node.js 18 or later. Tests cover scoring, runner advancement, inning changes, undo, fielding notation, schedule normalization, starting lineups, library migration, exports, and storage failures.

- `index.html` — app shell, lessons, and forms
- `styles.css` — responsive layout and print styles
- `app.js` — scoring interaction, rendering, and quiz
- `engine.js` — event-based scoring
- `positions.js` — field positions, selection, and notation
- `mlb.js` — schedule and lineup API client, independent of the UI
- `library-ui.js` — game picker, settings, and downloads
- `storage.js` — async local repository with stable game IDs and a versioned library

The storage interface is deliberately asynchronous. A future server repository can replace it without changing the scoring engine or MLB client. Exported games retain their IDs, timestamps, MLB game metadata, lineups, and events; server authentication, sync, and conflict handling are not implemented.

[MLB scoring guide](https://www.mlb.com/official-information/basics/score)
