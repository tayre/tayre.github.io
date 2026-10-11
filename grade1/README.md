# Grade 1

A small, buildless flashcard app for an iPad, served from `/grade1/` on this static site. Practice is untimed, with no points or score.

## Practice cards

- **Letters:** all 26 English letters, with uppercase and lowercase forms.
- **Popcorn words:** 118 distinct words transcribed from the supplied September–January school worksheets. The seven groups are VC & CVC words, double consonants, open syllables, digraphs, blends, bossy e and heart words. Longer groups are divided into balanced sets of at most 10 cards; “All 118 words” visits each word once.
- **Numbers:** 1–100, with a choice of groups of 10 or the whole set.

Each card shows its content immediately, including a large picture for every letter. Tap **Next** to move through the set; the last card loops back to the first. There is no flip, quiz, rating or results step. Compact Home, Letters, Words and Numbers navigation keeps the card large on an iPad. Word and number sets use a single selector.

Next records that a card was practised, without claiming the child knows it. Matching word IDs keep earlier saved practice. Repeated words across school groups share a card and history; repeated entries within a group are included once. Old starter-pack selections fall back to the first school set.

Progress is saved locally in this browser on this device. There are no accounts or analytics, and progress does not sync between devices or browsers. Clearing this site's browser data removes saved progress.

## Preview and tests

From the `tayre.github.io` directory:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000/grade1/>. No build step is required.

Run the tests from the `grade1` directory:

```sh
npm test
```

## Use on an iPad

Once the directory is published, open `https://tayre.github.io/grade1/` in Safari. Use Share, then **Add to Home Screen** (under **More** or **View More** if needed), and tap **Add**. If Safari offers **Open as Web App**, leave it enabled. See [Apple's iPad instructions](https://support.apple.com/en-ie/guide/ipad/ipad8f1f7a29/ipados).

Open the app online once and let its files finish downloading. The cards can then work offline while the cached files remain on the device. The service worker requires HTTPS or localhost; plain HTTP through a computer's LAN address does not install the offline cache.

## Maintaining offline support

`sw.js` caches only this app’s files in a `grade1-` cache. Its scope is `/grade1/`; Grade 4 and other site apps keep their own caches. Requests use online responses when available and saved files as the offline fallback.

Update `VERSION` in `sw.js` whenever app files change, and add new required files to `SHELL_FILES`. The worker downloads the complete app shell before activation and waits for tabs using the old version to close. Close and reopen the app after loading an update online if it is waiting to activate. Device storage cleanup can remove both cached files and saved progress.

All app files and artwork are local. `icon.svg` is the source for the 192px, 512px and 180px PNG home-screen icons.
