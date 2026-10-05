const test = require('node:test');
const assert = require('node:assert/strict');
const dot=(x,y,id='nearby-vessels')=>({geometry:{type:'Point',coordinates:[x,y]},layer:{id}});
const project=([x,y])=>({x,y});
test('mobile taps accept near misses and choose the closest ship regardless of render order',async()=>{
 const {pickMapFeature}=await import('../map-interaction.mjs');
 const near=dot(118,100),far=dot(122,100);
 assert.equal(pickMapFeature([far,near],{x:100,y:100},project,24),near);
 assert.equal(pickMapFeature([near],{x:100,y:100},project,8),null);
});
test('ships take precedence over place dots, while empty space and square-corner misses stay unselected',async()=>{
 const {pickMapFeature}=await import('../map-interaction.mjs');
 const ship=dot(115,100),place=dot(100,100,'places');
 assert.equal(pickMapFeature([place,ship],{x:100,y:100},project,24),ship);
 assert.equal(pickMapFeature([place],{x:100,y:100},project,24),place);
 assert.equal(pickMapFeature([dot(123,123)],{x:100,y:100},project,24),null);
 assert.equal(pickMapFeature([],{x:100,y:100},project,24),null);
});
