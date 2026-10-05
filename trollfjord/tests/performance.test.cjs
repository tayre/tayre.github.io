const test = require('node:test');
const assert = require('node:assert/strict');
const Data = require('../data.js');
test('nearby normalization reads only the endpoint and releases the original track', () => {
  const coordinates = new Proxy([[0,0],[1,1]], {get(target,key) { if(key === '0') throw Error('unnecessary history read'); return target[key]; }});
  const feature={properties:{mmsi:257000001,date_time_utc:'2026-10-05T00:00:00'},geometry:{type:'LineString',coordinates}};
  const result=Data.normalizeVesselFeature(feature,Date.parse('2026-10-05T00:00:00Z'),{includeTrack:false});
  assert.deepEqual(result.position,[1,1]); assert.deepEqual(result.track,[]); assert.equal(result.feature,undefined);
});
test('unchanged GeoJSON avoids worker updates; changes and replacement sources are sent', async () => {
 const {createSourceUpdater}=await import('../map-updates.mjs');
 let calls=0; let source={setData(){calls++;}};
 const update=createSourceUpdater({getSource:()=>source});
 update('ships',{features:[]}); update('ships',{features:[]}); assert.equal(calls,1);
 update('ships',{features:[{id:1}]}); assert.equal(calls,2);
 source={setData(){calls++;}}; update('ships',{features:[{id:1}]}); assert.equal(calls,3);
});
test('nearby cache expires stale ships during outages and reacts to moved positions', async () => {
 const {createNearbyCache}=await import('../map-updates.mjs');
 const {nearbyGeoJSON}=await import('../map-style.mjs');
 let calls=0;const cached=createNearbyCache((...args)=>{calls++;return nearbyGeoJSON(...args);});
 const now=Date.now(), ship={mmsi:1,position:[67,14],reportedAt:now};
 const reports=[{mmsi:2,position:[67,14],reportedAt:now-19*60000}];
 assert.equal(cached(reports,ship,now).features.length,1);
 cached(reports,ship,now+30000);assert.equal(calls,1);
 assert.equal(cached(reports,ship,now+60001).features.length,0);assert.equal(calls,2);
 cached(reports,{...ship,position:[68,14]},now+60002);assert.equal(calls,3);
});
