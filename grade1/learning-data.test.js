import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARNING_TOPICS, LEARNING_CARDS, LEARNING_PACKS, CONTENT_SOURCES } from './learning-data.js';
import { numberFrames, renderVisual } from './visuals.js';

const counts = {phonics:17,families:24,arithmetic:19,shapes:12,money:11,calendar:23,nature:19};
test('new topics have small, complete sets and readable pictures or diagrams',()=>{
  assert.equal(LEARNING_CARDS.length,125);
  assert.equal(LEARNING_PACKS.length,24);
  assert.equal(new Set(LEARNING_PACKS.map(pack=>pack.id)).size,24);
  for(const topic of LEARNING_TOPICS){
    assert.equal(LEARNING_CARDS.filter(card=>card.topic===topic.id).length,counts[topic.id]);
    assert.ok(topic.title && topic.category && topic.prompt);
  }
  const byId=new Map(LEARNING_CARDS.map(card=>[card.id,card]));
  assert.equal(new Set(LEARNING_PACKS.flatMap(pack=>pack.ids)).size,LEARNING_CARDS.length);
  for(const pack of LEARNING_PACKS){
    assert.ok(pack.ids.length>=4 && pack.ids.length<=9);
    assert.ok(pack.ids.every(id=>byId.get(id)?.topic===pack.topic));
  }
  for(const card of LEARNING_CARDS){
    assert.ok(card.picture || card.visual,card.id);
    assert.ok(card.front.length<=28,card.id);
    assert.ok(card.back.length<=100,card.id);
    if(card.visual) assert.ok(renderVisual(card.visual).length>20,card.id);
  }
  for(const {url} of CONTENT_SOURCES) assert.equal(new URL(url).protocol,'https:');
});

test('make-ten, addition and subtraction diagrams show the correct quantities',()=>{
  const sums=LEARNING_CARDS.filter(card=>card.topic==='arithmetic');
  for(const card of sums){
    const {first,second,operation}=card.visual;
    assert.ok(Number.isInteger(first) && Number.isInteger(second));
    assert.ok(first>=1 && second>=1 && first<=10 && second<=10);
    const result=operation==='subtract'?first-second:first+second;
    assert.ok(result>=0 && result<=10);
    assert.equal(Number(card.front.split(' = ')[1]),result);
    const html=renderVisual(card.visual);
    assert.equal((html.match(/class="dot(?: |")/g)||[]).length,10);
    assert.equal((html.match(/class="dot filled/g)||[]).length,operation==='subtract'?first:result);
    assert.equal((html.match(/class="dot filled removed/g)||[]).length,operation==='subtract'?second:0);
    if(operation==='make10') assert.equal(result,10);
  }
  assert.deepEqual(sums.filter(card=>card.visual.operation==='make10').map(card=>card.visual.first),[1,2,3,4,5,6,7,8,9]);
  for(let number=1;number<=100;number++){
    const html=numberFrames(number);
    assert.equal((html.match(/class="dot filled"/g)||[]).length,number);
    assert.equal((html.match(/class="ten-frame"/g)||[]).length,Math.ceil(number/10));
  }
});

test('word families preserve letter order and one shared ending per set',()=>{
  for(const pack of LEARNING_PACKS.filter(pack=>pack.topic==='families')){
    const ending=pack.id.replace('families-','');
    for(const card of LEARNING_CARDS.filter(card=>pack.ids.includes(card.id))){
      assert.equal(card.wordParts.join(''),card.front);
      assert.equal(card.wordParts[1],ending);
      assert.equal(card.front.length,3);
    }
  }
});

test('Canadian coins have valid denominations and correct combined values',()=>{
  const coins=LEARNING_CARDS.filter(card=>card.topic==='money');
  assert.deepEqual(coins.filter(card=>card.visual.type==='coin').map(card=>card.visual.cents),[5,10,25,100,200]);
  for(const card of coins.filter(card=>card.visual.type==='coins')){
    assert.ok(card.visual.coins.every(value=>[5,10,25,100,200].includes(value)));
    const total=card.visual.coins.reduce((sum,value)=>sum+value,0);
    const displayed=Number(card.front.split(' ')[0])*(card.front.includes('dollar')?100:1);
    assert.equal(displayed,total);
  }
});

test('calendar sequences wrap correctly and patterns continue their repeating unit',()=>{
  const cards=id=>LEARNING_CARDS.filter(card=>card.id.startsWith(id));
  const days=cards('calendar-days-');
  assert.equal(days.length,7);
  for(let i=0;i<days.length;i++){
    assert.ok(days[i].back.startsWith(days[(i+1)%7].front));
    assert.equal(days[i].visual.position,i+1);
    assert.equal(days[i].visual.label,days[i].front);
  }
  const months=[...cards('calendar-months1-'),...cards('calendar-months2-')];
  assert.equal(months.length,12);
  for(let i=0;i<months.length;i++){
    assert.ok(months[i].back.includes(`month ${i+1}.`));
    assert.equal(months[i].visual.position,i+1);
    assert.equal(months[i].visual.label,months[i].front);
    assert.ok(months[i].back.includes(`${months[(i+1)%12].front} comes next.`));
  }
  for(const [index,card] of cards('shapes-patterns-').entries()){
    const {items,next}=card.visual;
    const unit=items.slice(0,[2,2,3,3,3,2][index]);
    assert.deepEqual(items,Array.from({length:items.length},(_,i)=>unit[i%unit.length]));
    assert.equal(next,unit[items.length%unit.length]);
  }
});
