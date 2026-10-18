# Flip 7 scorekeeper

A buildless, touch-friendly scorekeeper at `/flip7/`. Choose 1–18 players, enter names, and tap a profile to choose from 24 emojis. Blank names become “Player 1”, etc. The player order stays stable while totals and leader labels update after each round.

## At the table

- Tap **Add score** and enter the final round total with the large keypad or a physical keyboard. Manual scores accept whole numbers from 0 to 999.
- **Count my cards** adds unique number cards from 0–12, optional +2/+4/+6/+8/+10 modifiers, ×2, and the automatic seven-card bonus. Tap a selected card again to remove it. Zero counts toward seven cards.
- **Bust** records zero. An entered score stays editable until the round is saved.
- **Save round** waits for an explicit score or bust for every player. Totals and the winner are calculated together at the end of the round.
- **Undo last round** reopens its scores for correction. If a new round already has entries, a confirmation protects those entries. New games and rematches also confirm before replacing scores.
- A tied lead at 200 or more keeps every player in for another round. A unique high score at or above 200 ends the game.

Scoring follows the original Flip 7 [official FAQ](https://theop.games/pages/flip-7-faqs) and [rules, edition 3.1](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/12/FLIP_7-RULES.pdf), checked 2026-10-17. The formula is **number sum × multiplier + modifiers + 15 for seven numbers**. The multiplier never doubles modifiers or the Flip 7 bonus. This is an unofficial companion; the physical game handles dealing and action cards.

## Saving and offline use

Player setup, saved rounds and entered round scores use the `flip7.scorekeeper.v1` localStorage key. **Use score** saves an editor entry; closing the editor without it cancels that edit. Nothing is sent to a server. Scores stay in this browser on this device; clearing site data removes them. A visible notice reports storage failures.

Open the app online once and wait for “Ready for offline game nights.” A service worker caches only this app's files under the `flip7-` prefix and `/flip7/` scope. Offline use works while the browser retains the cache. Add the page to the iPad Home Screen through Safari's Share menu. Bump the cache version in `sw.js` when changing the app; updates wait until existing tabs close.

Back and Forward follow setup, the score table, emoji picker, scoring editor and scoring help without deleting game data. Native dialogs provide focus handling and Escape cancellation. Controls use system fonts and local CSS/SVG; there are no packages or external resources needed at runtime.

## Develop and verify

From the repository root, run `python3 -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/flip7/`.

From this directory, run `npm test` for scoring, ties, round lifecycle and save validation. `PLAYWRIGHT_MODULE_PATH=/path/to/playwright node browser.test.cjs` checks setup, scoring, navigation, reload, offline use and iPad/phone layouts against the local server. The browser test can use `TEST_BASE_URL` to select another host. No build or dependency installation is needed for the app itself.
