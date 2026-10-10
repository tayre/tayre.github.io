# Grade 4

A small, buildless learning app for an iPad, served from `/grade4/` on this static site. It covers the 1–10 times tables, basic geography and science with short practice rounds, gradual help, points and a chance to revisit mistakes. The broader name leaves room for future lessons such as basic French.

## Finding an activity

- **Math:** choose one or more times tables and answer using the number pad.
- **Facts:** choose Geography, Science or a mix for a 10-question round. Each question has four large answer choices to tap. The library includes 15 Canadian and world capital questions and 15 science questions about space, plants, water, magnets, the body and living things.
- **Tables:** explore the multiplication grid and see facts shown as rows of dots.
- **Progress:** see math and facts practice history, mastery stars and points.

Open a topic in **Meet the facts** to learn before a quiz. Read its questions, answers and short explanations. Each study card includes a clickable source link, which opens in a new tab. Reading the library has no timer and awards no points.

## Saved progress

Math and facts have separate saved progress and point totals. Math continues to use its existing `grade4.multiplication.v1`, `grade4.multiplication.tables.v1` and `grade4.multiplication.points.v1` storage keys, preserving earlier practice. Facts use `grade4.facts.v1`.

Everything is stored locally in the browser, with no accounts or analytics. Progress does not sync between devices or browsers. **Reset progress** clears practice history and points for both math and facts after confirmation. Clearing this site's browser data also removes saved progress.

## Practice and points

Each question starts with 100 possible points. Facts add 3 seconds of reading time to the same scoring and help schedule used for math:

| Milestone | Math | Facts |
| --- | --- | --- |
| Full 100 points, before any help or mistakes | First 2 seconds | First 5 seconds |
| Automatic hint appears | 5 seconds | 8 seconds |
| Answer begins fading in | 10 seconds | 13 seconds |
| Answer fully visible; time-based value reaches 20 points | 15 seconds | 18 seconds |

Earlier correct answers earn more as the time-based value falls. A hint caps the question at 60 points; once the answer starts appearing, the cap is 40 points. Each wrong answer subtracts 20 points after these caps, with a minimum award of 10 points for eventually answering correctly.

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

Open the app online once so its files can finish downloading. Both activities and the study library can then work offline while those cached files remain on the device. The linked source websites need an internet connection. The service worker requires HTTPS or localhost; a plain HTTP preview opened through a computer's LAN address does not install the offline cache.

## Maintaining offline support

`sw.js` caches only Grade 4's own files and uses network responses when available, with the saved app as the offline fallback. Its scope is `/grade4/`, so it does not control the other site apps. Update `VERSION` in `sw.js` whenever app files change, and add new required assets to `SHELL_FILES`.

The new cache is prepared before activation. A new worker waits until tabs using the previous worker close, so an update does not force a reload during practice. Close and reopen the app after loading an update online if it is waiting to activate. Device storage cleanup can remove offline files and local progress.

All app code and artwork are local static files. `icon.svg` is the source artwork for the three PNG home-screen icons.
