const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { CHORDS, FAMILIES, QUALITIES, tones, strings } = require('../chords.js');
const baseURL = process.env.TEST_URL || 'http://127.0.0.1:8089/guitar/';
const output = process.env.ARTIFACTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'chordbook-qa-'));
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [], failures = [], external = [];
  async function open(width, hash = '', audioUnavailable = false) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    page.on('request', request => { if (new URL(request.url()).origin !== new URL(baseURL).origin) external.push(request.url()); });
    await page.addInitScript(({ audioUnavailable }) => {
      window.audioStarts = [];
      window.audioCreations = 0;
      if (audioUnavailable) { window.AudioContext = undefined; window.webkitAudioContext = undefined; return; }
      const NativeAudio = window.AudioContext;
      if (NativeAudio) window.AudioContext = class extends NativeAudio {
        constructor(...args) { super(...args); window.audioCreations++; }
        createOscillator() {
          const oscillator = super.createOscillator();
          const start = oscillator.start.bind(oscillator);
          oscillator.start = time => { window.audioStarts.push({ frequency: oscillator.frequency.value, time }); return start(time); };
          return oscillator;
        }
      };
    }, { audioUnavailable });
    await page.goto(baseURL + hash);
    await page.locator('#diagram svg').waitFor();
    return { context, page };
  }
  async function select(page, id) {
    const chord = CHORDS.find(item => item.id === id);
    await page.locator(`[data-family="${QUALITIES[chord.quality].family}"]`).click();
    await page.locator(`[data-library-chord="${id}"]`).click();
    assert.equal(await page.locator('#chord-symbol').textContent(), id);
  }
  try {
    const desktop = await open(1440);
    const { page } = desktop;
    assert.equal(await page.locator('#chord-symbol').textContent(), 'C');
    assert.equal(await page.evaluate(() => window.audioCreations), 0, 'no audio context or autoplay on load');
    for (const chord of CHORDS) {
      await select(page, chord.id);
      assert.deepEqual(await page.locator('.ingredient-note').allTextContents(), tones(chord).map(tone => tone.name));
      assert.equal(await page.locator('.string-button:not(:disabled)').count(), strings(chord).filter(string => string.midi !== null).length);
      assert.equal(await page.locator('.barre').count(), chord.barre ? 1 : 0);
      assert.equal(await page.locator('#chord-list [aria-pressed="true"]').count(), 1);
      assert.equal(await page.locator('#families [aria-pressed="true"]').count(), 1);
      assert.match(await page.locator('#diagram-description').textContent(), /String 6/);
      assert.equal(await page.locator('.scale-note').count(), 7);
      assert.equal(await page.locator('.interval-tick').count(), 13);
      assert.deepEqual(await page.locator('.interval-tick.in-chord strong').allTextContents(), tones(chord).map(tone => tone.name));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await select(page, 'C');
    await page.locator('#strum').click();
    await page.waitForFunction(() => window.audioStarts.length === 15);
    assert.equal(await page.evaluate(() => window.audioCreations), 1);
    assert.deepEqual(await page.evaluate(() => window.audioStarts.filter((_, i) => i % 3 === 0).map(item => Math.round(item.frequency))), [131, 165, 196, 262, 330]);
    assert.match(await page.locator('#audio-status').textContent(), /Playing C/);
    await page.locator('#pick').click();
    await page.waitForFunction(() => window.audioStarts.length === 30);
    const picked = await page.evaluate(() => window.audioStarts.slice(15).filter((_, i) => i % 3 === 0));
    assert.ok(Math.abs(picked[1].time - picked[0].time - 0.4) < 0.001);
    await page.locator('.ingredient').nth(1).click();
    assert.equal(await page.locator('.ingredient[aria-pressed="true"]').textContent(), '3EMajor third4 semitones');
    assert.match(await page.locator('#audio-status').textContent(), /E: major third/);
    assert.ok(await page.locator('#diagram .tone-selected').count() > 0);
    await select(page, 'G');
    assert.equal(await page.locator('.is-playing').count(), 0, 'changing chords stops playback indication');
    await page.locator('[data-family="minor"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#chord-symbol').textContent(), 'Am');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.family), 'minor', 'keyboard focus survives rerender');
    await page.locator('.progression [data-chord="F"]').click();
    assert.equal(await page.locator('#chord-symbol').textContent(), 'F');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'explorer');
    await select(page, 'C');
    assert.equal(await page.locator('.fretboard-note').count(), 12);
    assert.equal(await page.locator('.fretboard-note.is-root').count(), 3);
    await page.locator('[data-box="connected"]').click();
    assert.equal(await page.locator('.fretboard-note').count(), 18);
    assert.equal(await page.locator('.fretboard-note.added-note').count(), 6);
    const scaleButtons = await page.locator('.fretboard-note').evaluateAll(buttons => buttons.map(button => ({ string: Number(button.dataset.string), fret: Number(button.dataset.fret), name: button.textContent })));
    for (const button of scaleButtons) {
      const pitch = ([40, 45, 50, 55, 59, 64][6 - button.string] + button.fret) % 12;
      assert.equal(button.name, { 9: 'A', 0: 'C', 2: 'D', 4: 'E', 7: 'G' }[pitch], 'every pentatonic marker must match its sounding pitch');
    }
    assert.deepEqual(await page.locator('.phrase-note strong').allTextContents(), ['C', 'D', 'E', 'G', 'A']);
    const startsBeforePhrase = await page.evaluate(() => window.audioStarts.length);
    await page.locator('#play-phrase').click();
    await page.waitForFunction(count => window.audioStarts.length === count + 15, startsBeforePhrase);
    assert.deepEqual(await page.evaluate(count => window.audioStarts.slice(count).filter((_, i) => i % 3 === 0).map(item => Math.round(item.frequency)), startsBeforePhrase), [262, 294, 330, 392, 440]);
    await page.locator('[data-compare="minor"]').click();
    assert.match(await page.locator('#audio-status').textContent(), /C minor/);
    await page.locator('#pentatonic-title').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'pentatonic-connected.png'), fullPage: false });
    await page.locator('[data-box="first"]').click();
    const startsBeforeScale = await page.evaluate(() => window.audioStarts.length);
    await page.locator('#play-pentatonic').click();
    await page.waitForFunction(count => window.audioStarts.length === count + 36, startsBeforeScale);
    assert.equal(await page.locator('.fretboard-note').count(), 12);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
    await desktop.context.close();

    for (const width of [320, 390, 768]) {
      const mobile = await open(width, '#Cmaj7');
      assert.equal(await mobile.page.locator('#chord-symbol').textContent(), 'Cmaj7');
      for (const id of ['Cmaj7', 'Bm', 'Dsus4', 'F', 'C']) {
        await select(mobile.page, id);
        assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px ${id} must fit`);
        const ingredientBounds = await mobile.page.locator('.ingredient').evaluateAll(buttons => buttons.map(button => ({ width: button.clientWidth, scroll: button.scrollWidth })));
        assert.ok(ingredientBounds.every(item => item.scroll <= item.width + 1), 'no clipped theory cards');
      }
      if (width === 390) {
        await mobile.page.locator('[data-box="connected"]').click();
        assert.equal(await mobile.page.locator('.fretboard-note').count(), 18);
        assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'connected fretboard stays within mobile page');
        await mobile.page.locator('.fretboard-scroll').evaluate(el => { el.scrollLeft = el.scrollWidth; });
        await mobile.page.locator('.fretboard-note[data-string="1"][data-fret="10"]').click();
        assert.match(await mobile.page.locator('#audio-status').textContent(), /D on string 1, fret 10/);
        await mobile.page.evaluate(() => scrollTo(0, 0));
        await mobile.page.screenshot({ path: path.join(output, 'phone.png'), fullPage: true });
      }
      await mobile.context.close();
    }
    const unavailable = await open(390, '#invalid', true);
    assert.equal(await unavailable.page.locator('#chord-symbol').textContent(), 'C');
    await unavailable.page.locator('#strum').click();
    assert.match(await unavailable.page.locator('#audio-status').textContent(), /isn’t supported/);
    await select(unavailable.page, 'Em');
    assert.equal(await unavailable.page.locator('#chord-symbol').textContent(), 'Em');
    await unavailable.context.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    assert.deepEqual(external, [], 'no external asset or API requests');
    console.log('PASS: all 17 chords, numbered scales, fret distances, both pentatonic boxes and pitches, scale/phrase playback, major/minor comparison, real audio scheduling, no autoplay, keyboard focus, links, 320/390/768/1440 layouts, no audio fallback, no external requests.');
    console.log('Screenshots:', output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
