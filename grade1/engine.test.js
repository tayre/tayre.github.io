import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, WORD_PACKS, LEARNING_PACKS } from './data.js';
import { makeDeck, createProgress, normalizeProgress, recordCard, recordVisit, getStats } from './engine.js';

test('decks preserve teaching order and scope word packs and number ranges', () => {
  assert.equal(makeDeck().length, 26);
  assert.equal(makeDeck()[0].front, 'A a');
  assert.equal(makeDeck().at(-1).front, 'Z z');
  assert.equal(makeDeck({ topic: 'words' }).length, 118);
  for (const pack of WORD_PACKS) assert.deepEqual(makeDeck({ topic: 'words', selection: pack.id }).map(({ id }) => id), pack.ids);
  const allNumbers = [];
  for (let first = 1; first <= 91; first += 10) {
    const deck = makeDeck({ topic: 'numbers', selection: `${first}-${first + 9}` });
    assert.equal(deck.length, 10);
    assert.equal(deck[0].number, first);
    assert.equal(deck.at(-1).number, first + 9);
    allNumbers.push(...deck.map(({ number }) => number));
  }
  assert.deepEqual(allNumbers, makeDeck({ topic: 'numbers' }).map(({ number }) => number));
});

test('invalid topics and selections do not broaden the requested deck', () => {
  for (const options of [
    { topic: 'unknown' }, { topic: 'alphabet', selection: 'A-I' },
    { topic: 'words', selection: 'pack-4' }, { topic: 'words', selection: '1-10' },
    { topic: 'numbers', selection: '0-10' }, { topic: 'numbers', selection: '1-100' },
    { topic: 'numbers', selection: '91-101' }, { topic: 'numbers', selection: '01-10' },
  ]) assert.deepEqual(makeDeck(options), []);
});

test('shuffling retains each scoped card once without changing the source data', () => {
  const original = JSON.stringify(CARDS);
  const options = { topic: 'numbers', selection: '21-30' };
  const orderedIds = makeDeck(options).map(({ id }) => id);
  const shuffled = makeDeck({ ...options, shuffle: true, random: () => 0 });
  assert.notDeepEqual(shuffled.map(({ id }) => id), orderedIds);
  for (const random of [() => 0, () => 1, () => -1, () => NaN, () => Infinity]) {
    const deck = makeDeck({ ...options, shuffle: true, random });
    assert.equal(deck.length, 10);
    assert.equal(new Set(deck.map(({ id }) => id)).size, 10);
    assert.deepEqual(new Set(deck.map(({ id }) => id)), new Set(orderedIds));
    assert.ok(deck.every((card) => card !== CARDS.find(({ id }) => id === card.id)));
  }
  shuffled[0].front = 'Changed copy';
  assert.equal(JSON.stringify(CARDS), original);
});

test('latest responses update known status while counting every card review', () => {
  const progress = createProgress();
  assert.equal(recordCard(progress, { id: 'letter-a', known: true }), progress);
  assert.deepEqual(progress.cards['letter-a'], { attempts: 1, known: true });
  recordCard(progress, { id: 'letter-a', known: true });
  recordCard(progress, { id: 'letter-a', known: false });
  assert.deepEqual(progress.cards['letter-a'], { attempts: 3, known: false });
  recordCard(progress, { id: 'word-can', known: true });
  recordCard(progress, { id: 'number-23', known: false });
  assert.deepEqual(getStats(progress), { seen: 3, known: 1, total: CARDS.length });
  assert.deepEqual(getStats(progress, 'alphabet'), { seen: 1, known: 0, total: 26 });
  assert.deepEqual(getStats(progress, 'words'), { seen: 1, known: 1, total: 118 });
  assert.deepEqual(getStats(progress, 'numbers'), { seen: 1, known: 0, total: 100 });
  assert.deepEqual(getStats(progress, 'unknown'), { seen: 0, known: 0, total: 0 });
  assert.throws(() => recordCard(progress, { id: 'unknown', known: true }), RangeError);
  assert.equal(progress.cards.unknown, undefined);
});

test('normalization preserves saved history and rejects malformed or unknown entries', () => {
  const progress = createProgress();
  recordCard(progress, { id: 'number-100', known: true });
  assert.deepEqual(normalizeProgress(JSON.parse(JSON.stringify(progress))), progress);
  for (const raw of [undefined, null, false, [], 'broken', { cards: [] }]) assert.deepEqual(normalizeProgress(raw), createProgress());
  const normalized = normalizeProgress({ version: 99, cards: {
    'letter-a': { attempts: 3.9, known: true },
    'word-can': { attempts: -1, known: true },
    'number-23': { attempts: 2, known: 'true' },
    'number-24': { attempts: Infinity, known: true },
    'number-25': [],
    'unknown': { attempts: 99, known: true },
  } });
  assert.deepEqual(normalized, { version: 1, cards: {
    'letter-a': { attempts: 3, known: true },
    'word-can': { attempts: 0, known: false },
    'number-23': { attempts: 2, known: false },
    'number-24': { attempts: 0, known: false },
  } });
  assert.deepEqual(getStats(normalized), { seen: 2, known: 1, total: CARDS.length });
  const huge = normalizeProgress({ cards: { 'letter-z': { attempts: Number.MAX_VALUE, known: true } } });
  assert.equal(huge.cards['letter-z'].attempts, Number.MAX_SAFE_INTEGER);
  recordCard(huge, { id: 'letter-z', known: false });
  assert.equal(huge.cards['letter-z'].attempts, Number.MAX_SAFE_INTEGER);
  assert.equal(huge.cards['letter-z'].known, false);
});

test('Next records practice without claiming knowledge and preserves matching saved words', () => {
  const progress = normalizeProgress({version:1,cards:{'word-can':{attempts:2,known:true},'word-see':{attempts:4,known:true},'letter-a':{attempts:1,known:true}}});
  assert.deepEqual(progress.cards['word-can'],{attempts:2,known:true});
  assert.equal(progress.cards['word-see'],undefined);
  recordVisit(progress,{id:'word-can'});
  recordVisit(progress,{id:'word-its'});
  assert.deepEqual(progress.cards['word-can'],{attempts:3,known:true});
  assert.deepEqual(progress.cards['word-its'],{attempts:1,known:false});
  assert.deepEqual(progress.cards['letter-a'],{attempts:1,known:true});
  assert.throws(()=>recordVisit(progress,{id:'bad'}),RangeError);
});


test('every new small set is scoped to its own topic with independent diagram data', () => {
  for (const pack of LEARNING_PACKS) {
    const deck = makeDeck({topic:pack.topic, selection:pack.id});
    assert.deepEqual(deck.map(card=>card.id), pack.ids);
    assert.ok(deck.every(card=>card.topic===pack.topic));
    assert.deepEqual(makeDeck({topic:'alphabet',selection:pack.id}),[]);
    assert.deepEqual(makeDeck({topic:'numbers',selection:pack.id}),[]);
  }
  const deck = makeDeck({topic:'money',selection:'money-count'});
  deck[0].visual.coins[0] = 999;
  assert.equal(makeDeck({topic:'money',selection:'money-count'})[0].visual.coins[0],5);
  const prior = normalizeProgress({version:1,cards:{'word-can':{attempts:5,known:true},'number-100':{attempts:2,known:false}}});
  recordVisit(prior,{id:'arithmetic-ten-1'});
  assert.deepEqual(prior.cards['word-can'],{attempts:5,known:true});
  assert.deepEqual(prior.cards['number-100'],{attempts:2,known:false});
  assert.equal(getStats(prior,'arithmetic').seen,1);
});
