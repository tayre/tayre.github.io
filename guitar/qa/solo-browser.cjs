const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const url = process.env.TEST_URL || 'http://127.0.0.1:8089/guitar/';
const output = process.env.ARTIFACTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'solo-qa-'));
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(() => {
      window.starts = []; window.audioCount = 0;
      const NativeAudio = window.AudioContext;
      window.AudioContext = class extends NativeAudio {
        constructor(...args) { super(...args); window.audioCount++; }
        createOscillator() {
          const o = super.createOscillator(), start = o.start.bind(o);
          o.start = time => { window.starts.push({ time, frequency: o.frequency.value }); start(time); };
          return o;
        }
      };
    });
    await page.goto(url + '#solo');
    await page.locator('#solo-panel').waitFor();
    assert.equal(await page.evaluate(() => window.audioCount), 0);
    assert.equal(await page.locator('#solo-board button').count(), 12);
    assert.equal(await page.locator('#solo-chord').textContent(), 'Am');
    await page.locator('#solo-key').selectOption('8');
    await page.locator('#solo-shape').selectOption({ value: '4' });
    assert.match(await page.locator('#solo-map-title').textContent(), /F minor · shape 5/);
    await page.locator('#solo-degrees').check();
    assert.ok((await page.locator('#solo-board button').allTextContents()).includes('♭3'));
    await page.locator('#solo-key').selectOption('0');
    await page.locator('#solo-shape').selectOption('0');
    await page.locator('#solo-degrees').uncheck();
    await page.locator('#solo-mode').selectOption('answer');
    await page.locator('#solo-backing').selectOption('changes');
    await page.locator('#solo-tempo').fill('140');
    await page.locator('#solo-start').click();
    await page.waitForFunction(() => document.querySelector('#solo-turn').textContent === 'Listen to the lick');
    assert.equal(await page.locator('#solo-chord').textContent(), 'Am');
    await page.waitForFunction(() => document.querySelector('#solo-turn').textContent === 'Your turn · answer it');
    assert.equal(await page.locator('#solo-chord').textContent(), 'F');
    assert.match(await page.locator('#solo-targets').textContent(), /A or C/);
    assert.deepEqual([...new Set(await page.locator('#solo-board .landing-note').allTextContents())].sort(), ['A', 'C']);
    await page.waitForFunction(() => document.querySelector('#solo-chord').textContent === 'G');
    assert.match(await page.locator('#solo-targets').textContent(), /D or G/);
    await page.locator('#solo-start').click();
    const stoppedCount = await page.evaluate(() => window.starts.length);
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.starts.length), stoppedCount);
    await page.locator('#solo-start').click();
    await page.locator('#chords-tab').click();
    assert.equal(await page.locator('#solo-start').getAttribute('aria-pressed'), 'false');
    await page.locator('#solo-tab').click();
    await page.locator('#solo-demo').click();
    assert.match(await page.locator('#solo-status').textContent(), /Example lick in A minor/);
    await page.locator('#solo-start').click();
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('#solo-start').getAttribute('aria-pressed'), 'false');
    await page.reload();
    await page.locator('#solo-panel').waitFor();
    await page.locator('#solo-mode').selectOption('free');
    await page.locator('#solo-backing').selectOption('vamp');
    await page.locator('#solo-tempo').fill('72');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px fits`);
      await page.screenshot({ path: path.join(output, `solo-${width}.png`), fullPage: true });
    }
    await page.reload();
    await page.locator('#solo-panel').waitFor();
    assert.equal(await page.evaluate(() => window.audioCount), 0);
    await page.evaluate(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
    await page.locator('#solo-start').click();
    await page.waitForFunction(() => document.querySelector('#solo-status').textContent.includes('isn’t supported'));
    assert.equal(await page.locator('#solo-start').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(errors, []);
    console.log('PASS: solo keys/shapes, intervals, audio count-in, listen/answer, chord changes and targets, stop/tab/visibility, demo, reload, mobile layouts, audio fallback. Screenshots:', output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
