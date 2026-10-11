// Run against a local server: PLAYWRIGHT_MODULE_PATH=/path/to/playwright node tests/learning-browser.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  async function visible(selector) { assert.ok(await page.locator(selector).isVisible(), `${selector} visible`); }
  async function fits(selector) {
    const issues = await page.locator(selector).evaluateAll(elements => elements.filter(el => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && (b.x < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1 || el.scrollHeight > el.clientHeight + 2);
    }).map(el => ({ text: el.textContent, box: el.getBoundingClientRect().toJSON() })));
    assert.deepEqual(issues, [], `Fits viewport: ${selector}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.goto(`${base}/grade1/`);
  await page.locator('[data-topic="words"]').click();
  await page.locator('#next-card').click(); await page.locator('#next-card').click();
  const word = await page.locator('#card-face').textContent();
  await page.goBack(); await visible('#home-view');
  await page.goForward(); assert.equal(await page.locator('#card-face').textContent(), word);
  await page.reload(); assert.equal(await page.locator('#card-face').textContent(), word);
  await page.locator('[data-home]').click();
  await page.locator('[data-topic="money"]').click();
  for (const [width, height] of [[1024,768],[768,1024],[820,1180],[390,844]]) {
    await page.setViewportSize({width,height});
    await page.locator('#deck-selection').selectOption('all');
    for (let i=0; i<11; i++) {
      await page.waitForFunction(() => [...document.querySelectorAll('#card-visual img')].every(img => img.complete && img.naturalWidth > 0));
      await fits('#flashcard, #next-card');
      await page.locator('#next-card').click();
    }
  }
  await page.setViewportSize({width:1024,height:768});
  await page.screenshot({path:'/private/tmp/learning-real-coins.png'});
  console.log('PASS Grade 1 Back/Forward, reload and all real coin cards at four sizes');

  await page.goto(`${base}/grade4/`);
  assert.equal(await page.locator('#times-grid button').count(), 0);
  assert.equal(await page.locator('#fact-study .study-fact').count(), 0);
  await page.locator('.nav-link[data-view="progress"]').click();
  await page.locator('[data-explore-a="7"][data-explore-b="8"]').click();
  assert.equal(await page.locator('#explore-equation').textContent(), '7 × 8 = 56');
  assert.equal(await page.locator('#times-grid button').count(), 100);
  await page.goBack(); await visible('#progress-view');
  await page.locator('.nav-link[data-view="home"]').click();
  await page.locator('#quick-mode').click(); await page.locator('#start-round').click();
  const equation = await page.locator('#equation').getAttribute('aria-label');
  await page.locator('[data-key="9"]').click();
  await page.clock.runFor(2100);
  const pacing = await page.locator('#available-points').textContent();
  await page.goBack(); await visible('#home-view'); await page.clock.runFor(30000);
  await page.goForward(); assert.equal(await page.locator('#equation').getAttribute('aria-label'),equation);
  assert.equal(await page.locator('#answer').inputValue(),'9'); assert.equal(await page.locator('#available-points').textContent(),pacing);
  const [a,b]=equation.split(' times ').map(Number);
  await page.locator('[data-key="backspace"]').click();
  for (const digit of String(a*b)) await page.locator(`[data-key="${digit}"]`).click();
  await page.locator('#check-answer').click();
  const points=await page.evaluate(()=>localStorage.getItem('grade4.multiplication.points.v1'));
  await page.goBack(); await page.goForward(); await visible('#next-question');
  assert.equal(await page.evaluate(()=>localStorage.getItem('grade4.multiplication.points.v1')),points);
  await page.locator('#next-question').click();
  for(let i=1;i<10;i++) {
    const [a,b]=(await page.locator('#equation').getAttribute('aria-label')).split(' times ').map(Number);
    for(const digit of String(a*b)) await page.locator(`[data-key="${digit}"]`).click();
    await page.locator('#check-answer').click(); await page.locator('#next-question').click();
  }
  await visible('#results-view');
  const rounds=await page.evaluate(()=>JSON.parse(localStorage.getItem('grade4.multiplication.v1')).completedRounds);
  await page.goBack(); await page.goForward(); await visible('#results-view');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('grade4.multiplication.v1')).completedRounds),rounds);
  await page.locator('.nav-link[data-view="hub"]').click(); await page.locator('[data-extra-topic="division"]').first().click();
  await page.locator('#extra-next').click();
  const study = await page.locator('#extra-question').textContent();
  await page.goBack(); await page.goForward(); assert.equal(await page.locator('#extra-question').textContent(),study);
  while(await page.locator('#extra-view').evaluate(el=>el.classList.contains('is-studying'))) await page.locator('#extra-next').click();
  const extraCards=await page.evaluate(async()=> (await import('./extra-data.js')).EXTRA_CARDS);
  async function answerExtra(wrong=false) {
    const id=await page.locator('#extra-card').getAttribute('data-card-id'), c=extraCards.find(c=>c.id===id);
    const choice=await page.locator('.extra-choice').evaluateAll((els,data)=>els.findIndex(el=>data.wrong ? el.childNodes[1].textContent!==data.answer : el.childNodes[1].textContent===data.answer),{answer:c.answer,wrong});
    await page.locator('.extra-choice').nth(choice).click(); return choice;
  }
  const wrong=await answerExtra(true);
  await page.goBack(); await page.clock.runFor(30000); await page.goForward();
  assert.ok(await page.locator('.extra-choice').nth(wrong).isDisabled());
  await answerExtra();
  const extraProgress=await page.evaluate(()=>localStorage.getItem('grade4.discovery.v1'));
  await page.goBack(); await page.goForward();
  assert.equal(await page.evaluate(()=>localStorage.getItem('grade4.discovery.v1')),extraProgress);
  await visible('#extra-next');
  for(let i=1;i<5;i++){await page.locator('#extra-next').click();await answerExtra();}
  await page.locator('#extra-next').click(); await visible('#extra-results');
  const finished=await page.evaluate(()=>localStorage.getItem('grade4.discovery.v1'));
  await page.goBack(); await page.goForward(); await visible('#extra-results');
  assert.equal(await page.evaluate(()=>localStorage.getItem('grade4.discovery.v1')),finished);
  await page.goto(`${base}/grade4/#quiz/history`); await visible('#practice-view');
  const facts=await page.evaluate(async()=> (await import('./facts-data.js')).FACTS);
  const prompt=await page.locator('#equation').textContent(), answer=facts.find(f=>f.question===prompt).answer;
  const wrongFact=await page.locator('.fact-choice').evaluateAll((els,answer)=>els.findIndex(el=>el.children[1].textContent!==answer),answer);
  await page.locator('.fact-choice').nth(wrongFact).click();
  await page.locator('.nav-link[data-view="hub"]').click(); await page.locator('#confirm-break').click();
  await page.goBack(); assert.equal(await page.locator('#equation').textContent(),prompt);
  assert.ok(await page.locator('.fact-choice').nth(wrongFact).isDisabled());
  console.log('PASS Grade 4 restored inputs, paused clocks, incorrect/solved questions, completed rounds, extra lessons and fact quizzes without duplicate credit');

  for(const id of ['word-pictures','count-pictures']) {
    await page.goto(`${base}/games/#${id}`);
    for(let i=0;i<6;i++) {
      const answer=id==='word-pictures' ? await page.locator('.one-picture img').getAttribute('alt') : String(await page.locator('.counting-pictures img').count());
      await page.getByRole('button',{name:answer,exact:true}).click(); await page.locator('[data-next]').click();
    }
    await visible('.finish');
    await page.locator('#games-link').click(); await page.goBack(); await visible('.finish');
  }
  for(const id of ['multiplication-pairs','capital-pairs']) {
    await page.goto(`${base}/games/#${id}`);
    const cards=[];
    // Discover all eight cards through the visible interface, then match them.
    for(let i=0;i<8;i+=2){
      for(let j=i;j<i+2;j++) {
        const button=page.locator(`[data-flip="${j}"]`);
        if(!await button.isDisabled()) await button.click();
        cards[j]={index:j,text:await button.locator('strong').textContent(),label:await button.locator('small').textContent()};
      }
      if(await page.locator('[data-next]').isVisible()) await page.locator('[data-next]').click();
    }
    const capitals=(await import('../games/engine.js')).CAPITALS;
    for(const c of cards.filter(c=>c.label==='FACT'||c.label==='PROVINCE')) {
      if(await page.locator('.finish').isVisible()) break;
      if(await page.locator(`[data-flip="${c.index}"]`).isDisabled()) continue;
      const answer=c.label==='FACT' ? String(c.text.split(' × ').map(Number).reduce((a,b)=>a*b)) : capitals.find(pair=>pair[0]===c.text)[1];
      const partner=cards.find(card=>card.text===answer);
      await page.locator(`[data-flip="${c.index}"]`).click(); await page.locator(`[data-flip="${partner.index}"]`).click(); await page.locator('[data-next]').click();
    }
    await visible('.finish');
  }
  console.log('PASS all four complete games, including discovering and solving both matching boards');
  for(const [width,height] of [[1024,768],[768,1024],[820,1180]]) {
    await page.setViewportSize({width,height});
    for(const id of ['word-pictures','count-pictures','multiplication-pairs','capital-pairs']) {
      await page.goto(`${base}/games/#${id}`); await fits('.picture-card, .answer-choices button, .match-card, .turn-footer');
      await page.screenshot({path:`/private/tmp/learning-${id}-${width}.png`});
    }
  }
  await page.setViewportSize({width:390,height:844}); await page.goto(`${base}/games/#capital-pairs`);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.goto(`${base}/games/#count-pictures`); await page.evaluate(()=>navigator.serviceWorker.ready); await page.reload();
  await context.setOffline(true); await page.reload();
  await page.waitForFunction(()=>[...document.querySelectorAll('main img')].length>0 && [...document.querySelectorAll('main img')].every(img=>img.complete&&img.naturalWidth>0));
  await context.setOffline(false); await page.goto(`${base}/grade1/#money/all`);
  await page.evaluate(()=>navigator.serviceWorker.ready); await page.reload(); await context.setOffline(true); await page.reload();
  await page.waitForFunction(()=>document.querySelector('#card-visual img')?.naturalWidth>0);
  await context.setOffline(false);
  await page.goto(`${base}/grade1/images/coins/nickel.webp`);
  await context.setOffline(true);
  await page.goto(`${base}/grade1/#money/all`); await visible('#cards-view');
  assert.deepEqual(errors,[]);
  console.log('PASS iPad portrait/landscape layouts, phone width, offline game illustrations and real coins; no browser errors');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
