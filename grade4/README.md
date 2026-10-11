# Grade 4

A buildless learning app for an iPad, served from `/grade4/` on this static site. A colourful topic home screen opens multiplication, division, fractions, time and money, beginner French, reading, geography, science and Canadian history. Short lessons, large touch controls, gradual hints and opportunities to review mistakes keep practice manageable.

## Finding an activity

- **Home:** choose a topic from the illustrated lesson tiles.
- **Math:** choose times tables, then use the default **Learn 3 facts** lesson or switch to **Quick practice**. Answer using the number pad.
- **Facts:** choose Geography, Science, Canadian history or a mix for a 10-question round. Each question has four large answer choices to tap. The library includes 21 Canadian and world capital questions, 15 science questions about space, plants, water, magnets, the body and living things, and 12 Canadian history questions. History covers Indigenous peoples, Confederation, the name Canada, the fur trade, Québec, the railway, the flag, Nunavut, Newfoundland and the Charter, with Government of Canada and Parks Canada sources.
  **Canadian provinces** starts a focused round covering all 10 provincial capitals. Another round and review keep that scope. The geography study list includes each capital and its source.
- **Tables:** explore the multiplication grid and see facts shown as rows of dots.
- **Progress:** see math and facts practice history, mastery stars and points.

Open a topic in **Meet the facts** to learn before a quiz. Read its questions, answers and short explanations. Each study card includes a clickable source link, which opens in a new tab. Reading the library has no timer and awards no points.

## New discovery lessons

- **Division:** all 100 division facts related to the 1–10 multiplication tables, with equal-group diagrams and a multiplication connection.
- **Fractions:** shaded equal-part models for naming, comparing and finding equivalent fractions.
- **Time and money:** analog clocks, elapsed time, Canadian coins, prices and change.
- **French:** greetings, colours, numbers, animals and classroom words. **Hear the French** uses the browser’s speech voices, when available; pronunciation playback may depend on voices installed on the device.
- **Reading:** three original short passages, each with three comprehension questions. Read a passage once in study, then keep it visible while answering. Each question has an **I’m ready** step before the timer starts.
- **More science:** food chains, habitats, light, sound, rocks and minerals, with links to primary sources.

A discovery lesson contains up to five different cards from one topic. Study each idea with no timer, then answer four-choice questions. Reading lessons keep all questions tied to one passage. Review contains only the cards that needed help. First submitted answers update progress once; retrying the same question cannot inflate mastery. Three consecutive unassisted correct answers across lessons earn a star.

Discovery practice uses the same slower pacing as multiplication learning: full points for four seconds, hints at ten seconds, and answer fade from twenty to thirty seconds. The clock pauses in the background and while a leave-confirmation dialog is open. A wrong answer offers a hint and another try, with no timeout.

Diagrams are local SVG/CSS: fraction bars keep the same whole width, clocks move the hour hand with the minutes, and coin labels use Canadian values. Colours accompany labels and symbols rather than being the sole source of meaning. Motion respects the device’s reduced-motion preference.

## Learning multiplication

**Learn 3 facts** focuses on one of the selected tables at a time. It prioritizes tables with unfinished or troublesome facts, then chooses up to three facts to practise. Start with a study preview showing each answer, a visual model, a useful shortcut and the flipped equation—for example, how `6 × 7` and `7 × 6` have the same answer.

After the preview, recall each of the three facts three times: `A B C A B C A B C`. The nine tries put two other questions between repeats. This gives the child a chance to retrieve an answer again after thinking about something else. A review containing only two eligible facts uses `A B A B`; a single eligible fact appears once.

**Quick practice** keeps the original 10 unique questions drawn from the selected tables. It uses the faster help schedule below. Both modes give extra practice to unfamiliar facts and earlier mistakes.

A mastery star requires clean recalls across three different rounds. In a learning lesson, a fact can advance its mastery streak only once. Its first wrong or assisted response uses up that lesson's opportunity; later correct repeats still count as practice but cannot restore it. A wrong answer or help on a later repeat also resets the streak. A new lesson gives the fact another opportunity to advance.

## Saved progress

Math and facts have separate saved progress and point totals. Math continues to use its existing `grade4.multiplication.v1`, `grade4.multiplication.tables.v1` and `grade4.multiplication.points.v1` storage keys, preserving earlier practice. Facts use `grade4.facts.v1`. Discovery lessons use `grade4.discovery.v1`, independently of the existing progress keys.

Everything is stored locally in the browser, with no accounts or analytics. Progress does not sync between devices or browsers. **Reset progress** clears practice history and points for all Grade 4 lessons after confirmation. Clearing this site's browser data also removes saved progress.

## Practice and points

Each question starts with 100 possible points. Learning lessons use a slower clock, giving twice as much time as quick math practice. Facts add 3 seconds of reading time to the quick-practice schedule:

| Milestone | Learn 3 facts | Quick practice | Facts |
| --- | --- | --- | --- |
| Full 100 points, before any help or mistakes | First 4 seconds | First 2 seconds | First 5 seconds |
| Automatic hint appears | 10 seconds | 5 seconds | 8 seconds |
| Answer begins fading in | 20 seconds | 10 seconds | 13 seconds |
| Answer fully visible; time-based value reaches 20 points | 30 seconds | 15 seconds | 18 seconds |

Earlier correct answers earn more as the time-based value falls. A hint caps the question at 60 points; once the answer starts appearing, the cap is 40 points. Each wrong answer subtracts 20 points after these caps, with a minimum award of 10 points for eventually answering correctly.

The child can ask for a hint earlier. Displaying a hint or the answer marks the question as assisted, so it cannot count toward an unassisted mastery star. There is no timeout: the child can keep learning and submit the correct answer even after it is fully shown. The question clock pauses while the app is hidden or the break dialog is open.

## Preview locally

From the `tayre.github.io` directory:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000/grade4/>. No build step or package installation is required.

Run the automated tests from the `grade4` directory (Node.js required):

```sh
npm test
```

The tests cover multiplication and fact selection, spaced learning lessons, per-lesson mastery credit, discovery topic and passage selection, content consistency, visual model values, saved-progress recovery and scoring. No dependencies need installing.

## Use on an iPad

Once this directory is published on the site, open `https://tayre.github.io/grade4/` in Safari. Use Share, then **Add to Home Screen** (under **More** or **View More** if needed), and tap **Add**. If Safari offers **Open as Web App**, leave it enabled. See [Apple's iPad instructions](https://support.apple.com/en-ie/guide/ipad/ipad8f1f7a29/ipados).

Open the app online once so its files can finish downloading. All activities and the study library can then work offline while those cached files remain on the device. The linked source websites need an internet connection. The service worker requires HTTPS or localhost; a plain HTTP preview opened through a computer's LAN address does not install the offline cache.

## Maintaining offline support

`sw.js` caches only Grade 4's own files and uses network responses when available, with the saved app as the offline fallback. Its scope is `/grade4/`, so it does not control the other site apps. Update `VERSION` in `sw.js` whenever app files change, and add new required assets to `SHELL_FILES`.

The new cache is prepared before activation. A new worker waits until tabs using the previous worker close, so an update does not force a reload during practice. Close and reopen the app after loading an update online if it is waiting to activate. Device storage cleanup can remove offline files and local progress.

All app code and artwork are local static files. `icon.svg` is the source artwork for the three PNG home-screen icons.

The matching [Grade 1 app](../grade1/) offers alphabet pictures, the school popcorn words, numbers 1–100, word families, early arithmetic, shapes, calendar cards, Canadian coins and living things. Its saved progress and offline cache are separate.
