# Grade 1

A buildless picture-card app for an iPad, served from `/grade1/`. Practice is untimed, with no points or score. The topic home groups ten activities into **Read & say**, **Count & notice** and **Our big world**.

## Cards and little sets

| Activity | Content |
| --- | --- |
| Alphabet | All 26 English letters, uppercase and lowercase, with the original letter pictures. |
| Popcorn words | The exact 118 distinct words from the supplied September–January school sheets, in 16 sets of at most ten words. |
| Numbers | 1–100, with number names, countable ten-frames and place value; choose a group of ten or all numbers. |
| Letter sounds | 17 cards in three sets: short vowels, beginning sounds, and sh/ch/th/ck. Say the example word together and listen for its sound. |
| Word families | 24 cards in six sets: -at, -an, -ig, -op, -ug and -en. Coloured letter chunks show the start and shared ending. |
| Little sums | 19 cards in three sets: make ten, addition and subtraction. Purple and gold dots show the parts; crossed-out dots show what is taken away. |
| Shapes & patterns | Six shapes and six repeating patterns. Trace the sides or say the repeating part and what comes next. |
| Canadian coins | Five everyday coin names and values, plus six small counting examples. Drawings are teaching illustrations, not actual-size coin images. |
| Days & seasons | Seven days, twelve months in two sets, and Canada's four seasons. |
| Living things | 19 cards in four sets: animals, plant parts, habitats and basic needs. Plant diagrams highlight the named part. |

There are **369 cards**, including **125 new cards in 24 small sets**. Each card shows its content immediately. Tap **Next** to move through a set; the last card loops back to the first. There is no flip, quiz, rating or results step, and no automatic sound. A grown-up can say words and letter sounds with the child. The compact **All topics** button returns to the topic home, and a single set selector leaves room for a large card.

## School words and saved practice

The seven school groups remain VC & CVC words, double consonants, open syllables, digraphs, blends, bossy e and heart words. Longer groups use balanced sets of at most ten cards. “All 118 words” visits each distinct word once. Repeated words across school groups share a card and history.

Next records that a card was practised, without claiming the child knows it. The original `letter-*`, `word-*` and `number-*` IDs and `grade1.flashcards.v1` / `grade1.flashcards.settings.v1` storage keys are preserved. Earlier matching practice stays saved, old invalid set selections fall back to the first set, and new topics save independently under those same Grade 1 keys. Grade 4 storage is untouched.

Progress stays in this browser on this device. There are no accounts, analytics or external dependencies. Clearing the site's browser data removes saved practice; it does not sync between devices or browsers.

## Preview and tests

From the `tayre.github.io` directory:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000/grade1/>. No build step is required. From the `grade1` directory, run:

```sh
npm test
```

Tests pin the supplied school words, all letter pairs and number names, card IDs and set sizes, arithmetic quantities, coin totals, calendar ordering, patterns, deck isolation and saved progress compatibility.

## Use on an iPad

Once published, open `https://tayre.github.io/grade1/` in Safari. Use Share, then **Add to Home Screen**, and tap **Add**. See [Apple's iPad instructions](https://support.apple.com/en-ie/guide/ipad/ipad8f1f7a29/ipados).

Open online once and let all files download. Cards can then work offline while the cached files remain on the device. The service worker needs HTTPS or localhost; plain HTTP through a computer's LAN address does not install the offline cache.

## Maintaining the app

`data.js` preserves the original school content; `learning-data.js` holds the added activities and small sets. `visuals.js` draws the local diagrams. Update `VERSION` in `sw.js` when changing app files, and include any new required files in `SHELL_FILES`.

The service worker uses only the `/grade1/` scope and `grade1-` cache prefix. It downloads the app shell before activation, waits for old tabs to close, uses online responses when available, and falls back to cached files offline. Close and reopen after loading an update if it is waiting to activate. Device cleanup can remove cached files and saved progress.

Artwork uses local SVG/CSS and the device's emoji. `icon.svg` is the source for the 192px, 512px and 180px home-screen icons. Content references include the [Royal Canadian Mint](https://www.mint.ca/en/discover/canadian-circulation), [Reading Rockets phonics guidance](https://www.readingrockets.org/reading-101/reading-and-writing-basics/phonics-and-decoding), [National Park Service animal needs](https://www.nps.gov/teachers/classrooms/food-water-shelter-space.htm) and [University of Illinois plant parts](https://web.extension.illinois.edu/gpe/case1/c1facts2a.html).
