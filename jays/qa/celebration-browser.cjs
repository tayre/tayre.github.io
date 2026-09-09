// Optional browser QA. Run with PLAYWRIGHT_PATH pointing to an installed
// Playwright package and TEST_URL pointing to a local server for jays/.
// All MLB responses are fixtures; no test/preview switch ships in the app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const output = process.env.ARTIFACTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'jays-fireworks-'));
fs.mkdirSync(output, { recursive: true });
const teams = [
  [147, 'NYY', 'Yankees'], [111, 'BOS', 'Red Sox'], [114, 'CLE', 'Guardians'],
  [141, 'TOR', 'Blue Jays'], [136, 'SEA', 'Mariners']
].map(([id, abbreviation, teamName]) => ({ id, abbreviation, teamName, name: teamName }));
const standings = { records: [{ teamRecords: teams.map((team, i) => ({
  team, divisionRank: '2', wildCardRank: String(i + 1), wins: 82 - i * 2,
  losses: 60 + i * 2, wildCardGamesBack: ['+4.0', '+2.0', '–', '1.0', '3.0'][i]
})) }] };
function game({ id = 100001, state = 'Final', us = 5, them = 2, home = true } = {}) {
  const jays = { team: teams[3], score: us, leagueRecord: { wins: 76, losses: 66 } };
  const opponent = { team: teams[0], score: them, leagueRecord: { wins: 82, losses: 60 } };
  return {
    gamePk: id, gameDate: '2026-09-09T23:07:00Z', doubleHeader: 'N',
    status: { abstractGameState: state, detailedState: state === 'Live' ? 'In Progress' : state },
    teams: home ? { home: jays, away: opponent } : { home: opponent, away: jays },
    venue: { name: 'Rogers Centre' },
    linescore: { currentInning: 9, currentInningOrdinal: '9th', inningState: 'Bottom', balls: 1, strikes: 2, outs: 2,
      innings: [{ num: 1, away: { runs: 0 }, home: { runs: 1 } }],
      teams: { home: { hits: 9, errors: 0 }, away: { hits: 5, errors: 1 } } }
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [];
  async function open({ reducedMotion = 'no-preference', viewport = { width: 1280, height: 900 }, games = [game()], noCanvas = false } = {}) {
    const context = await browser.newContext({ viewport, reducedMotion });
    const page = await context.newPage();
    const fixture = { games, date: null };
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(({ noCanvas }) => {
      window.celebrationCount = 0;
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType === 1 && node.matches('.win-fireworks')) window.celebrationCount++;
        }
      }).observe(document, { childList: true, subtree: true });
      if (noCanvas) HTMLCanvasElement.prototype.getContext = () => null;
    }, { noCanvas });
    await page.route('https://statsapi.mlb.com/**', async route => {
      const url = new URL(route.request().url());
      let json;
      if (url.pathname.endsWith('/schedule')) {
        const date = url.searchParams.get('date');
        fixture.date ||= date;
        json = { dates: [{ date, games: date === fixture.date ? fixture.games : [] }] };
      } else if (url.pathname.endsWith('/standings')) json = standings;
      else {
        await new Promise(resolve => setTimeout(resolve, 250));
        json = { teams: { home: { teamStats: { batting: { homeRuns: 2 }, pitching: { inningsPitched: '9.0' } } },
          away: { teamStats: { batting: { homeRuns: 0 }, pitching: { inningsPitched: '8.0' } } } } };
      }
      await route.fulfill({ json });
    });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8088/');
    await page.locator('#games .game').first().waitFor();
    return { context, page, fixture };
  }
  const count = page => page.evaluate(() => window.celebrationCount);
  const canvasCount = page => page.locator('.win-fireworks').count();
  const refresh = async page => {
    await page.locator('#refresh').click();
    await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
  };
  try {
    const { page, fixture, context } = await open({ games: [game({ state: 'Live' })] });
    assert.equal(await canvasCount(page), 0, 'no celebration for a live lead');
    assert.equal(await page.locator('.win-label').count(), 0);
    fixture.games = [game()]; await refresh(page);
    await page.locator('.win-fireworks').waitFor();
    assert.equal(await page.locator('.win-label').textContent(), 'Jays win!');
    await page.waitForTimeout(600);
    assert.ok(await page.locator('canvas').evaluate(c => {
      const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      return pixels.some((v, i) => i % 4 === 3 && v > 0);
    }), 'fireworks paint visible pixels');
    assert.equal(await page.locator('#refresh').evaluate(button => {
      const r = button.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === button;
    }), true, 'overlay does not block controls');
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    await refresh(page); await page.waitForTimeout(350);
    assert.equal(await count(page), 1, 'manual refresh and late boxscores do not replay');
    await page.locator('.win-fireworks').waitFor({ state: 'detached', timeout: 5000 });
    await page.reload(); await page.locator('.win-label').waitFor();
    assert.equal(await count(page), 0, 'reload remembers the win in this tab');

    fixture.games = [game(), game({ id: 100002, home: false })]; await refresh(page);
    assert.equal(await page.locator('.win-label').count(), 2);
    assert.equal(await count(page), 1, 'second doubleheader win gets a new celebration');
    await page.locator('#next').click();
    assert.equal(await canvasCount(page), 0, 'date changes immediately stop fireworks');
    await page.locator('#games .empty').waitFor();
    await context.close();

    const phone = await open({ viewport: { width: 390, height: 844 }, games: [game({ id: 100003, home: false })] });
    await phone.page.locator('.win-fireworks').waitFor();
    await phone.page.waitForTimeout(600);
    assert.equal(await phone.page.locator('canvas').getAttribute('aria-hidden'), 'true');
    await phone.page.screenshot({ path: path.join(output, 'phone.png') });
    await phone.page.emulateMedia({ reducedMotion: 'reduce' });
    await phone.page.locator('.win-fireworks').waitFor({ state: 'detached', timeout: 1000 });
    assert.equal(await canvasCount(phone.page), 0, 'changing motion preference stops animation');
    assert.equal(await phone.page.locator('.win-label').count(), 1);
    await phone.context.close();

    for (const options of [
      { reducedMotion: 'reduce' }, { games: [game({ us: 1, them: 5 })] },
      { games: [game({ us: 2, them: 2 })] }, { noCanvas: true }
    ]) {
      const scenario = await open(options);
      await scenario.page.waitForTimeout(100);
      assert.equal(await canvasCount(scenario.page), 0, JSON.stringify(options));
      assert.doesNotMatch(await scenario.page.locator('#update').textContent(), /failed|unavailable/i);
      if (options.reducedMotion || options.noCanvas) assert.equal(await scenario.page.locator('.win-label').count(), 1);
      await scenario.context.close();
    }
    const hidden = await open({ games: [game({ id: 100004 })] });
    await hidden.page.locator('.win-fireworks').waitFor();
    await hidden.page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await canvasCount(hidden.page), 0, 'background tab stops animation');
    await hidden.context.close();
    assert.deepEqual(errors, []);
    console.log('PASS: live-to-final win, home/away, final-on-load, doubleheader, dedupe, late stats, expiry, navigation, reduced motion, losses/ties, unavailable canvas, hidden tab, desktop/mobile, non-blocking overlay.');
    console.log('Fixture screenshots:', output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
