// Start a server at the repository root, then set PLAYWRIGHT_MODULE_PATH if needed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const app = `${base}/flip7/`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const visible = async selector => assert.ok(await page.locator(selector).isVisible(), `${selector} is visible`);
  const scores = async () => (await page.locator('.player-total').allTextContents()).map(Number);
  const route = async hash => page.waitForURL(`${app}${hash}`);
  async function manual(id, value) {
    await page.locator(`[data-score="${id}"]`).click();
    await page.locator('[data-mode="manual"]').click();
    await page.locator('[data-key="clear"]').click();
    for (const digit of String(value)) await page.locator(`[data-key="${digit}"]`).click();
    await page.locator('#use-score').click(); await route('#game');
  }
  async function fits(selector, withinViewport = false) {
    const issues = await page.locator(selector).evaluateAll((elements, within) => elements.filter(el => {
      const b = el.getBoundingClientRect();
      return b.width && b.height && (b.left < -1 || b.right > innerWidth + 1 || (within && (b.top < -1 || b.bottom > innerHeight + 1)) || el.scrollWidth > el.clientWidth + 2);
    }).map(el => ({ selector: el.id || el.className, box: el.getBoundingClientRect().toJSON() })), withinViewport);
    assert.deepEqual(issues, [], `${selector} fits`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no page horizontal overflow');
  }

  await page.goto(app);
  assert.equal(await page.locator('[data-name]').count(), 4);
  const names = ['Alex', 'Sam', 'Riley', 'Jordan'];
  for (const [index, name] of names.entries()) await page.locator(`[data-name="${index}"]`).fill(name);
  await page.locator('[data-emoji="0"]').click();
  await page.getByRole('button', { name: 'Rocket', exact: true }).click(); await route('#setup');
  assert.ok((await page.locator('[data-emoji="0"]').textContent()).includes('🚀'));
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.emoji), '0');
  await page.locator('#more-players').click();
  await page.locator('[data-name="4"]').fill('Taylor');
  await page.locator('#fewer-players').click(); await page.locator('#more-players').click();
  assert.equal(await page.locator('[data-name="4"]').inputValue(), 'Taylor');
  await page.locator('#fewer-players').click();
  await page.reload();
  assert.equal(await page.locator('[data-name="0"]').inputValue(), 'Alex');
  assert.ok((await page.locator('[data-emoji="0"]').textContent()).includes('🚀'));
  await page.screenshot({ path: '/private/tmp/flip7-setup-final.png', fullPage: true });
  await page.locator('#start-game').click(); await route('#game');
  assert.ok(await page.locator('#save-round').isDisabled());
  await fits('#scoreboard, #save-round', true);

  await page.locator('[data-score="p1"]').click();
  await page.locator('[data-key="8"]').click();
  await page.goBack(); await route('#game');
  assert.match(await page.locator('[data-score="p1"]').textContent(), /Add score/);
  await page.goForward(); await visible('#score-dialog');
  assert.equal(await page.locator('#manual-score').inputValue(), '');
  await page.locator('[data-mode="cards"]').click();
  for (const n of [0, 1, 2, 3, 4, 5, 6]) await page.locator(`[data-number="${n}"]`).click();
  await page.locator('[data-double]').click(); await page.locator('[data-modifier="10"]').click();
  assert.equal(await page.locator('#card-total').textContent(), '67');
  assert.ok(await page.locator('[data-number="7"]').isDisabled());
  await fits('#score-dialog, #use-score', true);
  await page.locator('#use-score').click(); await route('#game');
  await manual('p2', 35);
  await page.locator('[data-bust="p3"]').click();
  await manual('p4', 0);
  assert.deepEqual(await scores(), [0, 0, 0, 0]);
  await page.reload();
  assert.match(await page.locator('[data-score="p1"]').textContent(), /67/);
  assert.equal(await page.locator('#recorded-count').textContent(), '4 / 4 ready');
  await page.locator('#save-round').click();
  assert.deepEqual(await scores(), [67, 35, 0, 0]);
  assert.match(await page.locator('#game-title').textContent(), /Round 2/);
  await manual('p1', 12);
  await page.locator('#undo-round').click(); await visible('#confirm-dialog');
  await page.locator('#confirm-dialog [data-dismiss]').first().click();
  assert.deepEqual(await scores(), [67, 35, 0, 0]);
  await page.locator('#undo-round').click(); await page.locator('#confirm-action').click();
  assert.deepEqual(await scores(), [0, 0, 0, 0]);
  await page.locator('[data-score="p1"]').click();
  assert.equal(await page.locator('#card-total').textContent(), '67');
  assert.equal(await page.locator('[data-number][aria-pressed="true"]').count(), 7);
  await page.locator('#score-dialog [data-close]').click(); await route('#game');
  await manual('p2', 40); await page.locator('#save-round').click();
  assert.deepEqual(await scores(), [67, 40, 0, 0]);
  assert.equal(await page.locator('#round-history tbody tr').count(), 1);
  await page.reload(); assert.deepEqual(await scores(), [67, 40, 0, 0]);
  console.log('PASS setup, emoji profiles, round entry, calculator, bust, zero, Back/Forward, reload and undo');

  // An early 200 does not end the round. Ties continue with every player.
  for (const [id, value] of [['p1',133],['p2',160],['p3',190],['p4',50]]) await manual(id,value);
  assert.ok(await page.locator('#result-banner').isHidden());
  await page.locator('#save-round').click();
  assert.match(await page.locator('#result-banner').textContent(), /tie at 200/);
  assert.equal(await page.locator('[data-score]').count(), 4);
  for (const id of ['p1','p2','p4']) await page.locator(`[data-bust="${id}"]`).click();
  await manual('p3', 25); await page.locator('#save-round').click();
  assert.match(await page.locator('#result-banner').textContent(), /Riley takes the table/);
  assert.deepEqual(await scores(), [200,200,215,50]);
  await visible('#play-again');
  assert.equal(await page.locator('[data-score]').count(), 0);
  await page.reload(); await visible('#play-again');
  await page.screenshot({ path: '/private/tmp/flip7-winner-final.png', fullPage: true });
  await page.locator('#undo-round').click();
  assert.equal(await page.locator('[data-score]').count(), 4);
  await page.locator('#save-round').click();
  await page.locator('#play-again').click(); await page.locator('#confirm-action').click();
  assert.deepEqual(await scores(), [0,0,0,0]);
  assert.deepEqual(await page.locator('.player-card h2').allTextContents(), names);
  console.log('PASS winner timing, 200-point ties, trailing player winning, undoing a win and rematch');

  for (const [width,height] of [[1024,768],[768,1024],[820,1180],[390,844],[320,568]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(() => window.scrollTo(0,0));
    await fits('.player-card, #round-bar');
    if (width>=700) await fits('#scoreboard, #save-round', true);
    await page.screenshot({ path:`/private/tmp/flip7-board-${width}.png`, fullPage:true });
    await page.locator('[data-score="p1"]').click();
    await fits('#score-dialog, .keypad button');
    await page.locator('[data-mode="cards"]').click();
    await fits('#score-dialog, .number-cards, .modifier-cards');
    if (width>=700) {
      await fits('#use-score', true);
      const small=await page.locator('#score-dialog button').evaluateAll(buttons=>buttons.filter(b=>{const r=b.getBoundingClientRect();return r.width>0 && (r.width<44||r.height<44);}).map(b=>b.textContent));
      assert.deepEqual(small, [], 'iPad score buttons have 44px touch targets');
    }
    await page.screenshot({ path:`/private/tmp/flip7-cards-${width}.png` });
    await page.locator('#score-dialog [data-close]').click(); await route('#game');
    await page.locator('#new-game').click(); await route('#setup');
    await fits('#setup-view, .player-field, .stepper');
    await page.locator('[data-emoji="0"]').click(); await fits('#emoji-dialog, #emoji-grid');
    await page.locator('#emoji-dialog [data-close]').click(); await route('#setup');
    await page.locator('#resume-game').click(); await route('#game');
  }
  console.log('PASS iPad portrait/landscape and phone layouts, scoring controls and emoji picker');

  await page.setViewportSize({width:1024,height:768});
  await manual('p1', 37);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true); await page.reload();
  assert.match(await page.locator('[data-score="p1"]').textContent(), /37/);
  await manual('p2', 22);
  await page.locator('[data-bust="p3"]').click(); await page.locator('[data-bust="p4"]').click();
  await page.locator('#save-round').click();
  await page.reload(); assert.deepEqual(await scores(), [37,22,0,0]);
  await context.setOffline(false);
  await page.locator('#new-game').click();
  for (let n=4;n<18;n++) await page.locator('#more-players').click();
  assert.equal(await page.locator('[data-name]').count(),18);
  assert.ok(await page.locator('#more-players').isDisabled());
  await page.locator('[data-name="17"]').fill('<img src=x onerror=oops>');
  await page.locator('#start-game').click(); await page.locator('#confirm-action').click();
  assert.equal(await page.locator('.player-card').count(),18);
  assert.equal(await page.locator('#scoreboard img').count(),0);
  await fits('.player-card');
  await page.locator('#new-game').click();
  for(let n=18;n>1;n--) await page.locator('#fewer-players').click();
  assert.ok(await page.locator('#fewer-players').isDisabled());
  await page.locator('#start-game').click();
  assert.equal(await page.locator('.player-card').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS offline play/reload, 1–18 players, literal name rendering and no browser errors');

  const blocked = await browser.newContext();
  await blocked.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage disabled'); }; });
  const blockedPage=await blocked.newPage(); await blockedPage.goto(app); await blockedPage.locator('#start-game').click();
  assert.ok(await blockedPage.locator('#storage-warning').isVisible());
  assert.ok(await blockedPage.locator('#game-view').isVisible());
  const corrupt = await browser.newContext();
  await corrupt.addInitScript(() => localStorage.setItem('flip7.scorekeeper.v1', '{broken'));
  const corruptPage=await corrupt.newPage(); await corruptPage.goto(app);
  assert.ok(await corruptPage.locator('#storage-warning').isVisible());
  await corruptPage.locator('#start-game').click(); assert.ok(await corruptPage.locator('#game-view').isVisible());
  console.log('PASS storage failure and corrupt-save recovery');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
