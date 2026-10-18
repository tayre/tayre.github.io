# Flip 7 scorekeeper

A buildless, touch-friendly scorekeeper at `/flip7/`. Choose 1–18 players, enter names, and tap a profile to choose from 24 emojis. Blank names become “Player 1”, etc. The player order stays stable while totals and leader labels update after each round.

A minimal cream-and-green layout keeps scores and actions prominent. **Bust** and **Count points** are always on each player's card, including on phones. Four players and Save round fit at 320 × 568 with short names. iPads use larger cards in two columns. The score editor keeps its action buttons visible while the card picker scrolls on short screens.

## At the table

- Tap **Count points** to open the card calculator directly. Choose **Enter total** to use the large keypad or a physical keyboard instead. Manual scores accept whole numbers from 0 to 999; editing a saved manual entry returns to that keypad.
- **Count cards** adds unique number cards from 0–12, optional +2/+4/+6/+8/+10 modifiers, ×2, and the automatic seven-card bonus. Tap a selected card again to remove it. Zero counts toward seven cards.
- **Bust** records zero immediately from the main screen. Its selected state marks the player ready. Use **Count points** to correct a bust, or **Edit points** to change an entered score before saving the round.
- **Save round** waits for an explicit score or bust for every player. Totals and the winner are calculated together at the end of the round.
- **Undo last round** reopens its scores for correction. If a new round already has entries, a confirmation protects those entries. New games and rematches also confirm before replacing scores.
- A tied lead at 200 or more keeps every player in for another round. A unique high score at or above 200 ends the game and triggers a brief confetti celebration. It does not replay on reload, uses no external library, honours reduced motion, and cleans up after finishing, navigating away or hiding the tab.

Scoring follows the original Flip 7 [official FAQ](https://theop.games/pages/flip-7-faqs) and [rules, edition 3.1](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/12/FLIP_7-RULES.pdf), checked 2026-10-17. The formula is **number sum × multiplier + modifiers + 15 for seven numbers**. The multiplier never doubles modifiers or the Flip 7 bonus. This is an unofficial companion; the physical game handles dealing and action cards.

## Saving and offline use

Player setup, saved rounds and entered round scores use the `flip7.scorekeeper.v1` localStorage key. **Use score** saves an editor entry; closing the editor without it cancels that edit. Nothing is sent to a server. Scores stay in this browser on this device; clearing site data removes them. A visible notice reports storage failures.

Open the app online once and wait for “Ready for offline game nights.” A service worker caches only this app's files under the `flip7-` prefix and `/flip7/` scope. Offline use works while the browser retains the cache. Add the page to the iPad Home Screen through Safari's Share menu. Bump the cache version in `sw.js` when changing the app; updates wait until existing tabs close.

Back and Forward follow setup, the score table, emoji picker, scoring editor and scoring help without deleting game data. Native dialogs provide focus handling and Escape cancellation. Controls use system fonts and local CSS/SVG; there are no packages or external resources needed at runtime.

## Develop and verify

From the repository root, run `python3 -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/flip7/`.

From this directory, run `npm test` for scoring, ties, round lifecycle and save validation. `PLAYWRIGHT_MODULE_PATH=/path/to/playwright node browser.test.cjs` checks setup, scoring, navigation, reload, offline use, iPad/phone layouts, stable controls while editing, and the confetti lifecycle against the local server. The browser test can use `TEST_BASE_URL` to select another host. No build or dependency installation is needed for the app itself.

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
