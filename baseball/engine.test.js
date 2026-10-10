import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYS, newGame, derive, suggestedMoves, validateEvent } from './engine.js';

function add(game, code, overrides = {}) {
  const s = derive(game), p = PLAYS.find(p => p.code === code);
  const event = { kind: 'plate', code, hit: !!p.hit, error: !!p.error, moves: suggestedMoves(s,p), ...overrides };
  assert.equal(validateEvent(s,event), '');
  game.events.push(event);
  return derive(game);
}

test('bases-loaded walk forces one run without adding a hit', () => {
  const g = newGame();
  add(g,'BB');add(g,'BB');add(g,'BB');
  const s = add(g,'BB');
  assert.equal(s.runs[0][0],1);assert.equal(s.hits[0],0);
  assert.deepEqual(s.bases.map(r=>r.slot),[3,2,1]);
});
test('walk does not move an unforced runner at second', () => {
  const g=newGame();add(g,'2B');const s=add(g,'BB');
  assert.deepEqual(s.bases.map(r=>r?.slot ?? null),[1,0,null]);
});
test('grand slam records four runs and clears bases', () => {
  const g=newGame();add(g,'BB');add(g,'BB');add(g,'BB');const s=add(g,'HR');
  assert.equal(s.runs[0][0],4);assert.equal(s.hits[0],1);
  assert.deepEqual(s.bases,[null,null,null]);assert.equal(s.appearances.filter(a=>a.scored).length,4);
});
test('three outs change sides, clear runners, and preserve batting order', () => {
  const g=newGame();add(g,'1B');add(g,'K');add(g,'K');let s=add(g,'K');
  assert.equal(s.side,1);assert.equal(s.outs,0);assert.deepEqual(s.bases,[null,null,null]);
  add(g,'K');add(g,'K');s=add(g,'K');
  assert.equal(s.inning,2);assert.equal(s.side,0);assert.deepEqual(s.next,[4,3]);
});
test('runner plays move the original scorecard diamond without advancing batter', () => {
  const g=newGame();add(g,'1B');const event={kind:'runner',code:'SB',moves:[{from:'1',to:2}]};
  assert.equal(validateEvent(derive(g),event),'');g.events.push(event);const s=derive(g);
  assert.equal(s.next[0],1);assert.equal(s.appearances[0].maxBase,2);assert.equal(s.bases[1].slot,0);
});
test('double play counts both outs and closes the half-inning', () => {
  const g=newGame();add(g,'BB');add(g,'K');const s=add(g,'OTHER',{code:'6-4-3 DP',moves:[{from:'1',to:0},{from:'batter',to:0}]});
  assert.equal(s.side,1);assert.equal(s.appearances[0].outNumber,2);assert.equal(s.appearances[2].outNumber,3);
});
test('third-out force play excludes runs while timing play may count them', () => {
  const g=newGame();add(g,'3B');add(g,'K');add(g,'K');
  const moves=[{from:'3',to:4},{from:'batter',to:0}];
  let s=add(g,'6-3',{moves,countRuns:false});assert.equal(s.runs[0][0],0);assert.equal(s.appearances[0].scored,false);
  g.events.pop();s=add(g,'OTHER',{code:'timing play',moves,countRuns:true});assert.equal(s.runs[0][0],1);
});
test('errors are charged to the fielding team, not counted as hits', () => {
  const s=add(newGame(),'E6');assert.deepEqual(s.errors,[0,1]);assert.deepEqual(s.hits,[0,0]);
});
test('invalid shared bases, excess outs, and missing runners are rejected', () => {
  const g=newGame();add(g,'BB');const s=derive(g);
  assert.match(validateEvent(s,{kind:'plate',code:'1B',moves:[{from:'1',to:1},{from:'batter',to:1}]}),/same base/);
  assert.match(validateEvent(s,{kind:'plate',code:'K',moves:[{from:'batter',to:0}]}),/every runner/);
  add(g,'K');add(g,'K');assert.match(validateEvent(derive(g),{kind:'plate',code:'DP',moves:[{from:'1',to:0},{from:'batter',to:0}]}),/more than three/);
});
test('undo restores bases, totals, and the correct half-inning', () => {
  const g=newGame();add(g,'3B');add(g,'K');add(g,'K');const before=derive(g);
  add(g,'K');g.events.pop();assert.deepEqual(derive(g),before);
});
test('batting around and extra innings retain all appearances', () => {
  const g=newGame();for(let i=0;i<10;i++)add(g,'HR');let s=derive(g);
  assert.equal(s.next[0],1);assert.equal(s.runs[0][0],10);assert.equal(s.appearances.filter(a=>a.slot===0).length,2);
  for(let i=0;i<54;i++)add(g,'K');s=derive(g);assert.equal(s.inning,10);assert.equal(s.side,0);
});
test('save round trip is deterministic', () => {
  const g=newGame('Away','Home');add(g,'1B');add(g,'HR');assert.deepEqual(derive(JSON.parse(JSON.stringify(g))),derive(g));
});
