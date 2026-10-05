const test = require('node:test');
const assert = require('node:assert/strict');
const NOW = Date.parse('2026-10-12T12:00:00Z');
async function setup(storage = new Map()) {
 const {createCrossingWatcher} = await import('../arctic-celebration.mjs');
 let count=0, visible=true;
 const options={storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},now:()=>NOW,visible:()=>visible,celebrate:()=>count++,lock:fn=>Promise.resolve(fn())};
 return {storage,options,watch:createCrossingWatcher(options),get count(){return count;},hide(){visible=false;},show(){visible=true;}};
}
const report=(lat,age=0)=>({position:[lat,14],reportedAt:NOW-age});
test('first load north and southbound travel do not celebrate; northbound crossing does once across reloads',async()=>{
 const h=await setup();
 await h.watch(report(67,4000)); assert.equal(h.count,0);
 await h.watch(report(66,3000)); assert.equal(h.count,0);
 await h.watch(report(66.57,2000));assert.equal(h.count,1);
 await h.watch(report(66,1000));await h.watch(report(67));assert.equal(h.count,1);
 const reloaded=await setup(h.storage);await reloaded.watch(report(67));assert.equal(reloaded.count,0);
});
test('an earlier south-side visit is remembered, but celebration waits for visibility',async()=>{
 const before=await setup();await before.watch(report(66,10000));
 const h=await setup(before.storage);h.hide();await h.watch(report(66.6));assert.equal(h.count,0);
 h.show();await h.watch(report(66.6));assert.equal(h.count,1);
});
test('stale, regressing, and future AIS reports cannot create a crossing',async()=>{
 const h=await setup();await h.watch(report(66,1000));
 await h.watch(report(67,21*60000));await h.watch(report(67,2000));await h.watch(report(67,-6*60000));assert.equal(h.count,0);
 await h.watch(report(67));assert.equal(h.count,1);
});
test('shared browser state prevents another tab replay, and blocked storage skips the effect',async()=>{
 const h=await setup(), other=await setup(h.storage);await h.watch(report(66,1000));
 await Promise.all([h.watch(report(67)),other.watch(report(67))]);assert.equal(h.count+other.count,1);
 const {createCrossingWatcher}=await import('../arctic-celebration.mjs');
 const blocked=createCrossingWatcher({...h.options,storage:{getItem:()=>JSON.stringify({latitude:66,lastAt:NOW-1000}),setItem(){throw Error('blocked');}}});
 await blocked(report(66,1000));await blocked(report(67));assert.equal(h.count+other.count,1);
});

test('hiding preserves the earlier south-side observation',async()=>{
 const h=await setup();await h.watch(report(66,1000));h.watch.reset();await h.watch(report(67));assert.equal(h.count,1);
});
test('a south-side report from a previous day triggers on a fresh north-side report',async()=>{
 const storage=new Map([['trollfjord-arctic-celebration-v1',JSON.stringify({latitude:66,lastAt:NOW-3*86400000})]]);
 const h=await setup(storage);await h.watch(report(67));assert.equal(h.count,1);
});
