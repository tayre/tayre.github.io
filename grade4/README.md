# Grade 4

A small, buildless learning app for an iPad, served from `/grade4/` on this static site. Its first activity covers the 1–10 times tables with short practice rounds, gradual help, points and a chance to revisit mistakes. The broader name leaves room for future fact practice and basic French lessons.

Progress and table choices are stored locally in the browser. There are no accounts, third-party services or analytics. Clearing this site's browser data removes saved progress; progress does not sync between devices or browsers.

## Practice and points

Each question starts with 100 possible points, with a 2-second grace period before the score begins to fall. Earlier correct answers earn more: the time-based value gradually falls to 20 points by 15 seconds. Help arrives automatically while the child keeps working:

- After 5 seconds, a strategy hint appears. A hint limits that question to at most 60 points.
- After 10 seconds, the answer begins to fade in; it is fully visible at 15 seconds. Once the answer starts appearing, the question is worth at most 40 points.
- Each wrong answer subtracts 20 points, with a minimum award of 10 points for eventually answering correctly.

The child can ask for a hint earlier. Displaying a hint or the answer marks the question as assisted, so it cannot count toward an unassisted mastery star. There is no timeout: the child can keep learning and submit the correct answer even after it is fully shown. The question clock pauses while the app is hidden or the break dialog is open.

## Preview locally

From the `tayre.github.io` directory:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000/grade4/>. No build step or package installation is required.

Run the automated tests from the `grade4` directory:

```sh
node --test
```

## Use on an iPad

Once this directory is published on the site, open `https://tayre.github.io/grade4/` in Safari. Use Share, then **Add to Home Screen** (under **More** or **View More** if needed), and tap **Add**. If Safari offers **Open as Web App**, leave it enabled. See [Apple's iPad instructions](https://support.apple.com/en-ie/guide/ipad/ipad8f1f7a29/ipados).

Open the app online once so its files can finish downloading. It can then work offline while those cached files remain on the device. The service worker requires HTTPS or localhost; a plain HTTP preview opened through a computer's LAN address does not install the offline cache.

## Maintaining offline support

`sw.js` caches only Grade 4's own files and uses network responses when available, with the saved app as the offline fallback. Its scope is `/grade4/`, so it does not control the other site apps. Update `VERSION` in `sw.js` whenever app files change, and add new required assets to `SHELL_FILES`.

The new cache is prepared before activation. A new worker waits until tabs using the previous worker close, so an update does not force a reload during practice. Close and reopen the app after loading an update online if it is waiting to activate. Device storage cleanup can remove offline files and local progress.

All app code and artwork are local static files. `icon.svg` is the source artwork for the three PNG home-screen icons.
