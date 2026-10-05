const test = require('node:test');
const assert = require('node:assert/strict');
const now = Date.parse('2026-10-04T23:30:00Z');
const payload = (extra={}) => ({timezone:'Europe/Oslo',daily:{time:['2026-10-05'],sunrise:['2026-10-05T07:30'],sunset:['2026-10-05T18:20'],daylight_duration:[39000],...extra}});
test('sunrise uses the location calendar date and local clock, not browser timezone or UTC day',async()=>{
 const {parseSunTimes}=await import('../sun-times.mjs');
 const result=parseSunTimes(payload(),now);
 assert.equal(result.date,'2026-10-05');assert.equal(result.sunrise,'07:30');assert.equal(result.sunset,'18:20');
 assert.throws(()=>parseSunTimes(payload({time:['2026-10-04']}),now));
});
test('polar day/night and unavailable readings are distinguished without showing epoch times',async()=>{
 const {parseSunTimes}=await import('../sun-times.mjs');
 const missing={sunrise:[null],sunset:[null]};
 assert.match(parseSunTimes(payload({...missing,daylight_duration:[86400]}),now).note,/Midnight sun/);
 assert.match(parseSunTimes(payload({...missing,daylight_duration:[0]}),now).note,/Polar night/);
 assert.throws(()=>parseSunTimes(payload({...missing,daylight_duration:[null]}),now));
 assert.throws(()=>parseSunTimes(payload({sunrise:['1970-01-01T00:00'],sunset:['1970-01-01T00:00']}),now));
});
