// Optional mocked browser QA: run like celebration-browser.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const output = process.env.ARTIFACTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'jays-stats-'));
fs.mkdirSync(output, { recursive: true });

const toronto = { id: 141, abbreviation: 'TOR', name: 'Toronto Blue Jays', teamName: 'Blue Jays' };
const athletics = { id: 133, abbreviation: 'ATH', name: 'Athletics', teamName: 'Athletics' };
function player(id, fullName, position, order, hand, batting, pitching) {
  return { person: { id, fullName, pitchHand: { code: hand } }, position: { abbreviation: position }, battingOrder: order,
    stats: { batting, pitching }, seasonStats: { batting: { hits: 999, homeRuns: 999 } } };
}
const bat = { atBats: 3, hits: 1, runs: 1, rbi: 2, homeRuns: 1, baseOnBalls: 0, strikeOuts: 1 };
const pitch = { inningsPitched: '4.2', hits: 5, runs: 3, earnedRuns: 2, baseOnBalls: 1, strikeOuts: 6, numberOfPitches: 72 };
function fixtures() {
  return {
    delay: 350, failBox: false,
    game: { gamePk: 824956, gameDate: '2026-09-09T19:05:00Z',
      status: { abstractGameState: 'Live', detailedState: 'In Progress' },
      teams: { away: { team: toronto, score: 3, leagueRecord: { wins: 73, losses: 73 } },
        home: { team: athletics, score: 1, leagueRecord: { wins: 58, losses: 88 } } },
      venue: { name: 'Sutter Health Park' },
      linescore: { currentInning: 5, currentInningOrdinal: '5th', inningState: 'Top', balls: 0, strikes: 0, outs: 0,
        offense: { batter: { id: 1, fullName: 'Ernie Clement' }, battingOrder: 7 },
        defense: { pitcher: { id: 2, fullName: 'Brady Basso' } },
        innings: [0, 0, 2, 1].map((runs, i) => ({ num: i + 1, away: { runs }, home: { runs: i === 2 ? 1 : 0 } })),
        teams: { away: { runs: 3, hits: 5, errors: 0 }, home: { runs: 1, hits: 2, errors: 1 } } } },
    box: { teams: {
      away: { players: { ID1: player(1, 'Ernie Clement', '2B', '700', 'R', bat, {}),
        ID3: player(3, 'Braydon Fisher', 'P', undefined, 'R', {}, pitch) }, pitchers: [3] },
      home: { players: { ID2: player(2, 'Brady Basso', 'P', undefined, 'L', {}, pitch),
        ID4: player(4, 'Lawrence Butler', 'RF', '200', 'R', { ...bat, hits: 0, rbi: 0, homeRuns: 0 }, {}),
        ID5: player(5, 'Relief Pitcher', 'P', undefined, 'R', {}, { ...pitch, inningsPitched: '0.0', numberOfPitches: 0 }) }, pitchers: [2] }
    } }
  };
}
const standings = { records: [{ teamRecords: [
  { team: { id: 147, abbreviation: 'NYY', name: 'Yankees' }, wildCardRank: '1', divisionRank: '2', wins: 82, losses: 64, wildCardGamesBack: '+5.0' },
  { team: { id: 111, abbreviation: 'BOS', name: 'Red Sox' }, wildCardRank: '2', divisionRank: '3', wins: 79, losses: 67, wildCardGamesBack: '+2.0' },
  { team: { id: 114, abbreviation: 'CLE', name: 'Guardians' }, wildCardRank: '3', divisionRank: '2', wins: 77, losses: 69, wildCardGamesBack: '–' },
  { team: toronto, wildCardRank: '4', divisionRank: '4', wins: 73, losses: 73, wildCardGamesBack: '4.0' }
] }] };

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [];
  async function open(viewport = { width: 1100, height: 1000 }, options = {}) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const fixture = Object.assign(fixtures(), options);
    const requests = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.route('https://statsapi.mlb.com/**', async route => {
      const url = new URL(route.request().url());
      requests.push(url);
      if (url.pathname.endsWith('/schedule')) {
        const date = url.searchParams.get('date');
        fixture.date ||= date;
        await route.fulfill({ json: { dates: [{ games: date === fixture.date ? [fixture.game] : [] }] } });
      } else if (url.pathname.endsWith('/standings')) await route.fulfill({ json: standings });
      else if (url.pathname.endsWith('/boxscore')) {
        await new Promise(resolve => setTimeout(resolve, fixture.delay));
        await route.fulfill(fixture.failBox ? { status: 503, json: {} } : { json: fixture.box });
      } else throw new Error(`Unexpected request ${url}`);
    });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8088/');
    await page.locator('#games .game').waitFor();
    return { context, page, fixture, requests };
  }
  const refresh = async page => {
    await page.locator('#refresh').click();
    await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
  };
  try {
    const desktop = await open(undefined, { delay: 1000 });
    const { page, fixture, requests } = desktop;
    assert.equal(await page.locator('.inning-table').count(), 1, 'innings paint before slow player stats');
    assert.equal(await page.locator('.player-stats').count(), 0);
    assert.match(await page.locator('#games').innerText(), /#7 in order/);
    assert.doesNotMatch(await page.locator('#games').innerText(), /Bases empty|0 balls|0 strikes|0 outs/);
    assert.match(await page.locator('#games .scorebug').getAttribute('aria-label'), /Bases empty; 0 balls, 0 strikes; 0 outs/);
    assert.doesNotMatch(await page.locator('#race').innerText(), /Standings as of|Scores follow|GB is relative|Division leaders excluded/);
    assert.deepEqual(await page.locator('.inning-table thead th').allTextContents(), ['Team', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'R', 'H', 'E']);
    assert.deepEqual(await page.locator('.inning-table tbody tr').first().locator('td').allTextContents(), ['0', '0', '2', '1', '–', '–', '–', '–', '–', '3', '5', '0']);
    await page.getByText('This game: 1-for-3 · 2 RBI · 1 HR · 0 BB', { exact: true }).waitFor();
    assert.match(await page.locator('.live-detail-text').innerText(), /Ernie Clement · #7 in order · 2B/);
    assert.match(await page.locator('.live-detail-text').innerText(), /Brady Basso · Throws left/);
    assert.match(await page.locator('.live-detail-text').innerText(), /4.2 IP · 5 H · 2 ER · 6 K · 1 BB · 72 pitches/);
    assert.equal(await page.locator('.player-table').count(), 4);
    assert.doesNotMatch(await page.locator('#games').innerText(), /999|Relief Pitcher/);
    assert.equal(requests.length, 3, 'only schedule, standings and one hydrated boxscore');
    assert.equal(requests[2].searchParams.get('hydrate'), 'person');
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });

    fixture.delay = 50;
    fixture.game.linescore.defense.pitcher = { id: 5, fullName: 'Relief Pitcher' };
    fixture.box.teams.home.pitchers.push(5);
    await refresh(page);
    await page.getByText('Pitching: Relief Pitcher · Throws right', { exact: true }).waitFor();
    assert.match(await page.locator('.live-detail-text').innerText(), /0.0 IP/);
    fixture.failBox = true;
    await refresh(page); await page.waitForTimeout(100);
    assert.match(await page.locator('.live-detail-text').innerText(), /Relief Pitcher · Throws right/);
    assert.equal(await page.locator('.inning-table').count(), 1, 'boxscore outage preserves primary data');
    await desktop.context.close();

    const mobile = await open({ width: 390, height: 844 });
    await mobile.page.locator('.player-stats').first().waitFor();
    assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page-level overflow');
    assert.equal(await mobile.page.locator('.inning-table').evaluate(table => table.scrollWidth <= innerWidth - 40), true, 'nine-inning scorecard fits phone');
    await mobile.page.screenshot({ path: path.join(output, 'phone.png'), fullPage: true });
    await mobile.context.close();

    const missing = await open(undefined, { failBox: true });
    await missing.page.waitForTimeout(450);
    assert.match(await missing.page.locator('.live-detail-text').innerText(), /Brady Basso/);
    assert.doesNotMatch(await missing.page.locator('.live-detail-text').innerText(), /Throws|This game:/);
    assert.equal(await missing.page.locator('.inning-table').count(), 1);
    await missing.context.close();

    const extraFixture = fixtures();
    extraFixture.game.status = { abstractGameState: 'Final', detailedState: 'Final' };
    extraFixture.game.linescore.currentInning = 11;
    extraFixture.game.linescore.innings.push({ num: 11, away: { runs: 1 }, home: {} });
    const extra = await open({ width: 320, height: 700 }, extraFixture);
    await extra.page.locator('.player-stats').first().waitFor();
    assert.equal(await extra.page.locator('.inning-table thead th').count(), 15);
    assert.equal(await extra.page.locator('.live-detail-text').count(), 0, 'no live matchup on final games');
    assert.equal(await extra.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await extra.context.close();

    const stale = await open(undefined, { delay: 600 });
    await stale.page.locator('#next').click();
    await stale.page.waitForTimeout(800);
    assert.equal(await stale.page.locator('.player-stats').count(), 0, 'late stats cannot paint on another date');
    assert.match(await stale.page.locator('#games').innerText(), /No Blue Jays game/);
    await stale.context.close();
    assert.deepEqual(errors, []);
    console.log('PASS: live details, lineup position, pitcher handedness, game-only individual stats, nine innings/RHE, extras, mobile, missing/late stats, secondary request performance.');
    console.log('Fixture screenshots:', output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
