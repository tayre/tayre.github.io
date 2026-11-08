/* Browser QA uses synthetic fixtures exclusively; it never publishes research data.
 * PLAYWRIGHT_MODULE_PATH and PLAYWRIGHT_EXECUTABLE_PATH may select installed tools.
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

(async () => {
  const { fixture } = await import('./test/fixtures.mjs');
  const { FEED_URL } = await import('./data.mjs');
  const project = path.resolve(__dirname, '..');
  const repo = path.resolve(project, '..');
  const allowed = new Map([
    ['/', [path.join(repo, 'index.html'), 'text/html']],
    ['/graceful-trees/', [path.join(project, 'index.html'), 'text/html']],
    ['/hellinger-stability/', [path.join(repo, 'hellinger-stability/index.html'), 'text/html']],
    ...['app.js', 'data.mjs', 'style.css', 'icon.svg'].map(name => [`/graceful-trees/site/${name}`, [path.join(__dirname, name), name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript']]),
  ]);
  const server = http.createServer(async (request, response) => {
    const resource = allowed.get(new URL(request.url, 'http://localhost').pathname);
    if (!resource) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', resource[1]); response.end(await fs.readFile(resource[0]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const dashboard = `${base}graceful-trees/`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let mode = 'success', current = fixture(45);
    current.finished_at = new Date().toISOString();
    await context.route(FEED_URL, route => mode === 'success' ? route.fulfill({ json: current }) : route.abort());
    await page.goto(base);
    assert.equal(await page.locator('h1').innerText(), 'Mathematical work');
    await page.screenshot({ path: '/tmp/math-index-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: '/tmp/math-index-mobile.png', fullPage: true });
    await page.getByRole('link', { name: 'A spectral remainder in the Hellinger-to-information implication', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/hellinger-stability/');
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('link', { name: 'Graceful trees', exact: true }).click();
    assert.equal(page.url(), dashboard);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('#dashboard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://tayre.github.io/graceful-trees/');
    assert.equal(await page.getByRole('link', { name: 'Mathematical work', exact: true }).getAttribute('href'), '../');
    assert.equal(await page.locator('#verified-total').innerText(), '448');
    assert.equal(await page.locator('#unknown-total').innerText(), '2');
    assert.equal(await page.locator('#freshness').innerText(), 'Audited cloud snapshot');
    assert.equal(await page.locator('#run-slider').getAttribute('max'), '29');
    await page.getByRole('button', { name: 'All runs', exact: true }).click();
    assert.equal(await page.locator('#run-slider').getAttribute('max'), '44');
    await page.locator('#run-slider').fill('0');
    assert.match(await page.locator('#selected-run').innerText(), /8 verified \/ 10 investigated/);
    await page.selectOption('#coverage-group', 'sizes');
    assert.match(await page.locator('#coverage-bars').innerText(), /35 vertices/);
    await page.locator('.example-details summary').click();
    await page.getByRole('button', { name: 'Complement labels' }).click();
    assert.deepEqual(await page.locator('[data-node]').allTextContents(), ['5', '0', '4', '3', '1', '2']);
    await page.locator('.example-details summary').click();
    await page.locator('.history-details summary').click();
    await page.waitForFunction(() => document.querySelectorAll('#history-rows tr').length === 45);
    assert.equal(await page.locator('#history-rows tr').count(), 45);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export history CSV' }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'graceful-nightly-history.csv');
    const csv = await fs.readFile(await download.path(), 'utf8');
    assert.equal(csv.trim().split('\r\n').length, 46);
    await page.locator('.history-details summary').click();
    await page.getByRole('button', { name: 'Last 30 runs', exact: true }).click();
    await page.locator('#run-slider').fill('29');
    await page.selectOption('#coverage-group', 'families');
    await page.locator('.example-details summary').click();
    await page.getByRole('button', { name: 'Complement labels' }).click();
    await page.locator('.example-details summary').click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/graceful-home-desktop.png', fullPage: true });
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(() => Math.abs(document.querySelector('#trend-chart').viewBox.baseVal.width - document.querySelector('#trend-chart').getBoundingClientRect().width) <= 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `horizontal overflow at ${width}`);
      assert.ok(await page.locator('#trend-chart .chart-axis-label').first().evaluate(node => parseFloat(getComputedStyle(node).fontSize) * node.getScreenCTM().a >= 11), `graph labels too small at ${width}`);
      if (width === 390) {
        await page.screenshot({ path: '/tmp/graceful-home-mobile.png', fullPage: true });
        await page.locator('#progress').scrollIntoViewIfNeeded();
        await page.screenshot({ path: '/tmp/graceful-home-mobile-progress.png' });
      }
    }
    // Failed refresh preserves the actual saved result and labels it as cached.
    mode = 'offline';
    await page.getByRole('button', { name: 'Refresh research results' }).click();
    await page.waitForFunction(() => document.querySelector('#freshness').dataset.state === 'cached');
    assert.equal(await page.locator('#verified-total').innerText(), '448');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#freshness').dataset.state === 'cached');
    assert.equal(await page.locator('#verified-total').innerText(), '448');
    // With no saved data, do not display zeros or synthetic success totals.
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.locator('#load-error').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#dashboard').isVisible(), false);
    // Sparse and untrusted-looking prose must remain text, without execution.
    current = fixture(1); current.findings = [{ kind: 'unrestricted_infeasibility', title: '<img src=x onerror="window.injected=1">', significance: 'Requires review; no certified counterexample.', next_step: 'Seek independent certification.' }];
    mode = 'success';
    await page.getByRole('button', { name: 'Refresh research results' }).click();
    await page.locator('#dashboard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#run-slider').isDisabled(), true);
    assert.equal(await page.locator('#findings img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.locator('#freshness').getAttribute('data-state'), 'stale');
    assert.deepEqual(errors, []);
    await context.close();
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await noJs.newPage(); await staticPage.goto(dashboard);
    assert.ok(await staticPage.locator('noscript').isVisible());
    assert.ok(await staticPage.locator('#project-title').isVisible());
    await noJs.close();
    console.log('Browser checks passed: index links to both projects, dashboard at /graceful-trees/, desktop/mobile layouts, history slider, range, coverage, CSV, example, cached/error/stale/one-run states, text safety, and no-JS explanation.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
