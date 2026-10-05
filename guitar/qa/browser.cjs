const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { CHORDS, QUALITIES, tones, strings, frequency } = require('../chords.js');
const { SHAPES, notes: scaleNotes, phrase } = require('../scales.js');
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
          oscillator.start = time => { window.audioStarts.push({ frequency: oscillator.frequency.value, time, context: window.audioCreations }); return start(time); };
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
    assert.equal(await page.locator('#pentatonic-panel').isVisible(), false);
    await page.locator('#pentatonic-tab').click();
    assert.equal(await page.locator('#chords-panel').isVisible(), false);
    assert.equal(await page.locator('#pentatonic-panel').isVisible(), true);
    assert.equal(await page.locator('.scale-shape-button').count(), 6);
    assert.equal(await page.locator('.fretboard-note').count(), 42);
    assert.equal(await page.locator('.neck-shape-band').count(), 6);
    assert.equal(await page.locator('#connect-shapes').isDisabled(), true);
    assert.equal(await page.locator('.fretboard-fret').first().textContent(), '5');
    assert.equal(await page.locator('.fretboard-fret').last().textContent(), '20');
    assert.equal(await page.locator('script[src="backing.js"]').count(), 0);
    assert.equal(await page.evaluate(() => typeof window.ChordbookBacking), 'undefined');
    for (let index = 0; index < 5; index++) {
      await page.locator(`[data-scale-shape="${index + 1}"]`).click();
      await page.locator('#connect-shapes').uncheck();
      assert.equal(await page.locator('.fretboard-note').count(), 42, 'highlighting keeps the whole fretboard visible');
      assert.equal(await page.locator('.fretboard-note:not(.context-note)').count(), 12);
      assert.equal(await page.locator('.scale-shape-button[aria-pressed="true"]').count(), 1);
      assert.ok((await page.locator('.fretboard-note.is-root').count()) >= 2);
      assert.deepEqual(await page.locator('.phrase-note strong').allTextContents(), ['A', 'C', 'D', 'C', 'A']);
      await page.locator('#connect-shapes').check();
      assert.equal(await page.locator('.fretboard-note').count(), 42);
      assert.equal(await page.locator('.fretboard-note:not(.context-note)').count(), 18);
      assert.equal(await page.locator('.fretboard-note.shared-note').count(), 6);
      assert.equal(await page.locator('.fretboard-note.added-note').count(), 6);
      const actual = await page.locator('.fretboard-note').evaluateAll(buttons => buttons.map(button => ({ string: Number(button.dataset.string), fret: Number(button.dataset.fret), name: button.textContent })));
      for (const button of actual) {
        const pitch = ([40, 45, 50, 55, 59, 64][6 - button.string] + button.fret) % 12;
        assert.equal(button.name, { 9: 'A', 0: 'C', 2: 'D', 4: 'E', 7: 'G' }[pitch]);
      }
      assert.deepEqual(await page.locator('.phrase-note strong').allTextContents(), phrase(index, true).map(note => note.name));
      const before = await page.evaluate(() => window.audioStarts.length);
      await page.locator('#play-phrase').click();
      await page.waitForFunction(count => window.audioStarts.length > count, before);
      assert.deepEqual(await page.evaluate(count => window.audioStarts.slice(count).filter((_, i) => i % 3 === 0).map(item => Math.round(item.frequency)), before), phrase(index, true).map(note => Math.round(frequency(note.midi))));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.equal(await page.locator('.fretboard-fret').last().textContent(), '20');
    await page.locator('[data-scale-shape="1"]').click();
    const scaleBefore = await page.evaluate(() => window.audioStarts.length);
    await page.locator('#play-pentatonic').click();
    await page.waitForFunction(count => window.audioStarts.length > count, scaleBefore);
    const expectedScale = [...new Set(scaleNotes(0, true).map(note => note.midi))].sort((a, b) => a - b);
    assert.deepEqual(await page.evaluate(count => window.audioStarts.slice(count).filter((_, i) => i % 3 === 0).map(item => Math.round(item.frequency)), scaleBefore), expectedScale.map(midi => Math.round(frequency(midi))));
    await page.locator('[data-scale-shape="all"]').click();
    assert.equal(await page.locator('.fretboard-note').count(), 42);
    assert.equal(await page.locator('.context-note').count(), 0);
    await page.locator('#play-walk').click();
    assert.match(await page.locator('#scale-audio-status').textContent(), /along the B string/);
    await page.locator('.pentatonic').screenshot({ path: path.join(output, 'pentatonic-desktop.png') });
    await page.locator('#pentatonic-tab').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#chords-panel').isVisible(), true);
    assert.equal(await page.locator('#pentatonic-panel').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'chords-tab');
    assert.equal(await page.locator('.is-playing').count(), 0, 'switching lessons stops note playback');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#solo-panel').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'solo-tab');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#pentatonic-panel').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pentatonic-tab');
    await page.reload();
    assert.equal(await page.locator('#pentatonic-panel').isVisible(), true, 'the scale URL restores its tab');
    assert.equal(await page.locator('[data-scale-shape="all"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#chords-tab').click();
    await page.locator('[data-compare="minor"]').click();
    assert.match(await page.locator('#audio-status').textContent(), /C minor/);
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
      await mobile.page.locator('#pentatonic-tab').click();
      for (let index = 0; index < 5; index++) {
        await mobile.page.locator(`[data-scale-shape="${index + 1}"]`).click();
        await mobile.page.locator('#connect-shapes').check();
        assert.equal(await mobile.page.locator('.fretboard-note').count(), 42);
        assert.equal(await mobile.page.locator('.fretboard-note:not(.context-note)').count(), 18);
        assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px connected shape ${index + 1} fits`);
      }
      await mobile.page.locator('.fretboard-scroll').evaluate(el => { el.scrollLeft = el.scrollWidth; });
      const scrollBounds = await mobile.page.locator('.fretboard-scroll').boundingBox();
      const stringBounds = await mobile.page.locator('.fretboard-string').first().boundingBox();
      assert.ok(stringBounds.x >= scrollBounds.x && stringBounds.x <= scrollBounds.x + 6, 'string labels stay visible while scrolling along the neck');
      await mobile.page.locator('.fretboard-note[data-string="1"][data-fret="20"]').click();
      assert.match(await mobile.page.locator('#scale-audio-status').textContent(), /C on string 1, fret 20/);
      if (width === 390) {
        await mobile.page.locator('.pentatonic').screenshot({ path: path.join(output, 'pentatonic-phone.png') });
        await mobile.page.locator('#chords-tab').click();
        await mobile.page.evaluate(() => scrollTo(0, 0));
        await mobile.page.screenshot({ path: path.join(output, 'phone.png'), fullPage: true });
      }
      await mobile.context.close();
    }
    const unavailable = await open(390, '#invalid', true);
    assert.equal(await unavailable.page.locator('#chord-symbol').textContent(), 'C');
    await unavailable.page.locator('#strum').click();
    assert.match(await unavailable.page.locator('#audio-status').textContent(), /isn’t supported/);
    await unavailable.page.locator('#pentatonic-tab').click();
    await unavailable.page.locator('#play-pentatonic').click();
    assert.match(await unavailable.page.locator('#scale-audio-status').textContent(), /isn’t supported/);
    await unavailable.page.locator('#chords-tab').click();
    await select(unavailable.page, 'Em');
    assert.equal(await unavailable.page.locator('#chord-symbol').textContent(), 'Em');
    await unavailable.context.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    assert.deepEqual(external, [], 'no external asset or API requests');
    console.log('PASS: all chord lessons; three keyboard-accessible tabs and scale links; continuous 42-note fretboard, five shape spans, overlaps and highlights that preserve the full neck; note pitches, roots, shared notes, phrases and playback; 320/390/768/1440 layouts; no autoplay or external requests; audio fallback.');
    console.log('Screenshots:', output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
