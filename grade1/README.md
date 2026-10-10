# Grade 1

A small, buildless flashcard app for an iPad, served from `/grade1/` on this static site. Practice is untimed, with no points or score.

## Practice cards

- **Letters:** all 26 English letters, with uppercase and lowercase forms.
- **Popcorn words:** 30 easy, common words arranged in three packs of 10.
- **Numbers:** 1–100, with a choice of groups of 10 or the whole set.

Look at a card, try to remember it, then flip it to check. Mark cards as known or for another try to track progress. An optional listening action uses the device’s speech support when available. Voice availability depends on the browser and device; listening may need an internet connection even when the cards work offline.

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
