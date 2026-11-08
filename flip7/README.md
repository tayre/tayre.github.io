# Flip 7 scorekeeper

A buildless, touch-friendly scorekeeper at `/flip7/`. Choose 1–18 players, enter names, and tap a profile to choose from 29 emojis, including dragon, badger, snake, eagle, turtle and scorpion. Blank names become “Player 1”, etc. The player order stays stable while totals and leader labels update after each round. Each score card has a progress bar toward 200; scores above 200 remain visible while the bar stays full.

Setup shows **Min 1 · Max 18 players** beside the player selector; the minus and plus controls stop at those limits. Scoring help explains the [official player guidance](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/12/FLIP_7-RULES.pdf): standard play is for 3 or more, with a second deck recommended above 18. For 1–2 players, the rules suggest trying to reach 200 in as few rounds as possible. The scorekeeper's 18-player limit is separate from the physical game's guidance.

A minimal cream-and-green layout keeps scores and actions prominent. **Bust** and **Count points** are always on each player's card, including on phones. Four players and Save round fit at 320 × 568 with short names. iPads use larger cards in two columns. The number-card picker uses equally sized buttons in centered rows of 5, 4 and 4. The score editor keeps its action buttons visible while the card picker scrolls on short screens.

## At the table

- A small **1st** badge beside a player’s name marks who gets the first card this round. The house rule keeps the same dealer: Player 1 receives first in round 1, then each player in setup order, wrapping back to Player 1. Tiebreak rounds keep rotating; undo restores the previous recipient. New games and rematches restart with Player 1.
- Tap **Count points** to open the card calculator directly. Choose **Enter total** to use the large keypad or a physical keyboard instead. Manual scores accept whole numbers from 0 to 999; editing a saved manual entry returns to that keypad.
- **Count cards** adds unique number cards from 0–12, optional +2/+4/+6/+8/+10 modifiers, ×2, and the automatic seven-card bonus. Tap a selected card again to remove it. Zero counts toward seven cards.
- **Bust** records zero immediately from the main screen. Its selected state marks the player ready. Use **Count points** to correct a bust, or **Edit points** to change an entered score before saving the round.
- **Save round** waits for an explicit score or bust for every player. Totals and the winner are calculated together at the end of the round.
- Progress bars use saved totals, including the automatic **+15 for seven different number cards**. Draft entries do not advance them until the round is saved; undo updates both the scores and bars.
- **Undo last round** reopens its scores for correction. If a new round already has entries, a confirmation protects those entries. New games and rematches also confirm before replacing scores.
- A tied lead at 200 or more keeps every player in for another round. A unique high score at or above 200 ends the game with a trophy winner display, three waves of confetti and a short round of applause. **Celebrate again** replays it. The **Applause on/off** control on the winner display and in the footer remembers your preference on this device; muting stops sound immediately. Reloading never automatically replays the celebration. Reduced motion skips the animations while keeping the sound preference separate. Leaving the winner screen, undoing the win or hiding the tab stops the effects and audio.

Scoring follows the original Flip 7 [official FAQ](https://theop.games/pages/flip-7-faqs) and [rules, edition 3.1](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/12/FLIP_7-RULES.pdf), checked 2026-10-17. The formula is **number sum × multiplier + modifiers + 15 for seven numbers**. The multiplier never doubles modifiers or the Flip 7 bonus. This is an unofficial companion; the physical game handles dealing and action cards.

## Saving and offline use

Player setup, saved rounds, entered round scores, game history and the applause preference use the `flip7.scorekeeper.v1` localStorage key. The version 2 payload automatically migrates existing version 1 saves without changing their scores or player order. **Use score** saves an editor entry; closing the editor without it cancels that edit. Nothing is sent to a server. Scores stay in this browser on this device; clearing site data removes them. A visible notice reports storage failures.

Open **History** from setup or the score table to see earlier games. Finished games are saved immediately with the winner, date, player scores and every round. Starting a new game or rematch retains the previous game; unfinished games also keep any uncommitted entries, shown separately from saved totals. Empty games are not archived. Each game has its own identity so repeated games with the same players and scores remain separate, while reloads and rematches do not duplicate results. Undoing a winning round removes its outdated result until the corrected game finishes or is replaced.

Open the app online once and wait for “Ready for offline game nights.” A service worker caches only this app's files under the `flip7-` prefix and `/flip7/` scope. Offline use works while the browser retains the cache. Add the page to the iPad Home Screen through Safari's Share menu. Bump the cache version in `sw.js` when changing the app; updates wait until existing tabs close.

Back and Forward follow setup, the score table, game history, emoji picker, scoring editor and scoring help without deleting game data. Native dialogs provide focus handling and Escape cancellation. Controls use system fonts and local CSS/SVG; there are no packages or external resources needed at runtime. The 4.5-second applause clip is hosted with the app and cached for offline play. If a browser blocks sound, the winner display offers another tap to play it.

Audio credit: [“Small applause” by Breviceps](https://freesound.org/people/Breviceps/sounds/462362/), released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). `applause.mp3` is the unmodified MP3 preview (about 36 kB); playback volume is set to 60% where the browser supports it.

## Develop and verify

From the repository root, run `python3 -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/flip7/`.

From this directory, run `npm test` for scoring, ties, first-recipient rotation, round lifecycle, history and save validation. `PLAYWRIGHT_MODULE_PATH=/path/to/playwright node browser.test.cjs` checks setup, scoring, progress bars, history, save migration, navigation, reload, offline use, iPad/phone layouts, stable controls while editing, and the celebration/audio lifecycle against the local server. The browser test can use `TEST_BASE_URL` to select another host and `PLAYWRIGHT_EXECUTABLE_PATH` to use an existing Chromium executable. No build or dependency installation is needed for the app itself.

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

The original 40-piece celebration ran for less than 2.6 seconds. At 4× CPU slowdown, saving and starting that version took 13.1 ms, with no observed tasks over 50 ms during the animation. The expanded celebration now uses 120 pieces for less than five seconds, plus a brief winner animation. It still animates only transforms and opacity, releases its nodes and animations, and stops on navigation. Automated checks cover completion, replay, mute persistence, offline audio, blocked playback and reduced motion.
