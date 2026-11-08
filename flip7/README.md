# Flip 7 scorekeeper

A buildless, touch-friendly scorekeeper at `/flip7/`. Choose 1–18 players, enter names, and tap a profile to choose from 29 emojis, including dragon, badger, snake, eagle, turtle and scorpion. Blank names become “Player 1”, etc. The player order stays stable while totals and leader labels update after each round. Each score card has a progress bar toward 200; scores above 200 remain visible while the bar stays full.

A minimal cream-and-green layout keeps scores and actions prominent. **Bust** and **Count points** are always on each player's card, including on phones. Four players and Save round fit at 320 × 568 with short names. iPads use larger cards in two columns. The number-card picker uses equally sized buttons in centered rows of 5, 4 and 4. The score editor keeps its action buttons visible while the card picker scrolls on short screens.

## At the table

- A small **1st** badge beside a player’s name marks who gets the first card this round. The house rule keeps the same dealer: Player 1 receives first in round 1, then each player in setup order, wrapping back to Player 1. Tiebreak rounds keep rotating; undo restores the previous recipient. New games and rematches restart with Player 1.
- Tap **Count points** to open the card calculator directly. Choose **Enter total** to use the large keypad or a physical keyboard instead. Manual scores accept whole numbers from 0 to 999; editing a saved manual entry returns to that keypad.
- **Count cards** adds unique number cards from 0–12, optional +2/+4/+6/+8/+10 modifiers, ×2, and the automatic seven-card bonus. Tap a selected card again to remove it. Zero counts toward seven cards.
- **Bust** records zero immediately from the main screen. Its selected state marks the player ready. Use **Count points** to correct a bust, or **Edit points** to change an entered score before saving the round.
- **Save round** waits for an explicit score or bust for every player. Totals and the winner are calculated together at the end of the round.
- Progress bars use saved totals, including the automatic **+15 for seven different number cards**. Draft entries do not advance them until the round is saved; undo updates both the scores and bars.
- **Undo last round** reopens its scores for correction. If a new round already has entries, a confirmation protects those entries. New games and rematches also confirm before replacing scores.
- A tied lead at 200 or more keeps every player in for another round. A unique high score at or above 200 ends the game and triggers a brief confetti celebration. It does not replay on reload, uses no external library, honours reduced motion, and cleans up after finishing, navigating away or hiding the tab.

Scoring follows the original Flip 7 [official FAQ](https://theop.games/pages/flip-7-faqs) and [rules, edition 3.1](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/12/FLIP_7-RULES.pdf), checked 2026-10-17. The formula is **number sum × multiplier + modifiers + 15 for seven numbers**. The multiplier never doubles modifiers or the Flip 7 bonus. This is an unofficial companion; the physical game handles dealing and action cards.

## Saving and offline use

Player setup, saved rounds, entered round scores and game history use the `flip7.scorekeeper.v1` localStorage key. The version 2 payload automatically migrates existing version 1 saves without changing their scores or player order. **Use score** saves an editor entry; closing the editor without it cancels that edit. Nothing is sent to a server. Scores stay in this browser on this device; clearing site data removes them. A visible notice reports storage failures.

Open **History** from setup or the score table to see earlier games. Finished games are saved immediately with the winner, date, player scores and every round. Starting a new game or rematch retains the previous game; unfinished games also keep any uncommitted entries, shown separately from saved totals. Empty games are not archived. Each game has its own identity so repeated games with the same players and scores remain separate, while reloads and rematches do not duplicate results. Undoing a winning round removes its outdated result until the corrected game finishes or is replaced.

Open the app online once and wait for “Ready for offline game nights.” A service worker caches only this app's files under the `flip7-` prefix and `/flip7/` scope. Offline use works while the browser retains the cache. Add the page to the iPad Home Screen through Safari's Share menu. Bump the cache version in `sw.js` when changing the app; updates wait until existing tabs close.

Back and Forward follow setup, the score table, game history, emoji picker, scoring editor and scoring help without deleting game data. Native dialogs provide focus handling and Escape cancellation. Controls use system fonts and local CSS/SVG; there are no packages or external resources needed at runtime.

## Develop and verify

From the repository root, run `python3 -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/flip7/`.

From this directory, run `npm test` for scoring, ties, first-recipient rotation, round lifecycle, history and save validation. `PLAYWRIGHT_MODULE_PATH=/path/to/playwright node browser.test.cjs` checks setup, scoring, progress bars, history, save migration, navigation, reload, offline use, iPad/phone layouts, stable controls while editing, and the confetti lifecycle against the local server. The browser test can use `TEST_BASE_URL` to select another host and `PLAYWRIGHT_EXECUTABLE_PATH` to use an existing Chromium executable. No build or dependency installation is needed for the app itself.

## Performance review — 2026-10-17

Compared with `c9b3414` using Chromium at 390 × 844 and 4× CPU slowdown. Eight editor opens and card taps per scenario; times below are median synchronous click-handler work, not full input-to-paint latency or measurements on physical iPads. Histories contain zero-point rounds so the game stays open for the stress test.

| Check | Before | After |
| --- | ---: | ---: |
| Open editor, 4 players / 25 rounds | 6.0 ms | 2.9 ms |
| Open editor, 18 players / 100 rounds | 31.7 ms | 8.7 ms |
| Tap a card, 18 players / 100 rounds | 1.4 ms | 0.1 ms |
| App files, including offline assets | 71.8 kB | 64.1 kB |
| Same files, gzip estimate | 20.2 kB | 18.3 kB |

Dialog navigation now preserves the score table; draft edits preserve round history. Card taps update existing buttons instead of replacing them, retaining focus without extra layout work. Removed decorative logo requests, gradients and backdrop blur. All fonts and assets remain local, with no runtime dependencies. The gzip sizes are a local estimate rather than measured transfer sizes. Fresh local loads remained below 60 ms to DOM ready in these samples; network and hardware will affect real load times.

Confetti is limited to 40 pieces for less than 2.6 seconds, animates only transforms and opacity through the browser, and leaves no nodes or animations after cleanup. At 4× CPU slowdown, saving and starting the celebration took 13.1 ms, with no observed tasks over 50 ms during the animation. Automated checks cover normal completion, leaving the winner screen, and reduced motion.
