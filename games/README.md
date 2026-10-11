# Little learning games

Four buildless games, linked from the Grade 1 and Grade 4 topic homes:

- Picture word hunt: six local illustrations and three word choices.
- Count the little things: six quantities sampled from 1–10, each with three distinct choices.
- Times table pairs: four multiplication/answer pairs from tables 1–10. Products are unique on each board.
- Capital city pairs: four of Canada's ten province/capital pairs. The unit test checks them against the sourced Grade 4 facts.

Turns are untimed, with no sounds, accounts or negative scores. Two revealed memory cards remain visible until the child taps Next. Browser Back/Forward preserve the game during the page visit. Reload starts a new game. Games do not change the flashcard or quiz progress stores.

All six SVG pictures are original local artwork. No fonts, frameworks or remote image requests are needed. The service worker has its own `learning-games-` cache and `/games/` scope. Open online once to prepare offline play; cache cleanup may remove it. Updates wait for old tabs to close.

Run `npm test` here for the game rules and content checks. From the repository root, serve with `python3 -m http.server 8765`, then run `PLAYWRIGHT_MODULE_PATH=/path/to/playwright node tests/learning-browser.cjs` using an existing Playwright installation for browser regression checks. The site itself has no installation or build step.

[Ontario curriculum connections and limits](../curriculum/).
