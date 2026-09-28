import test from 'node:test';
import assert from 'node:assert/strict';
import {mapFalconSwingStructure,type1Break} from './falcon-structure.ts';
import {bar,bullishSwing} from './falcon-spec-fixtures.mjs';
test('Type 1 ignores wick sweep, accepts strict close and ignores incomplete close',()=>{
 assert.equal(type1Break('BULLISH',100,bar(2,101,98,99)),false);
 assert.equal(type1Break('BULLISH',100,bar(2,101,98,100.5)),true);
 assert.equal(type1Break('BULLISH',100,bar(2,101,98,100)),false);
 assert.equal(type1Break('BULLISH',100,bar(2,101,98,100.5,false)),false);
 assert.equal(mapFalconSwingStructure([bar(2,101,98,99)],bullishSwing).events.length,0);
 assert.equal(mapFalconSwingStructure([bar(2,101,98,100.5)],bullishSwing).events[0].kind,'BOS');
});
test('first opposite strong close immediately reverses swing without another BOS',()=>{
 const r=mapFalconSwingStructure([bar(2,95,88,89)],bullishSwing);
 assert.equal(r.trend,'BEARISH');assert.equal(r.events[0].kind,'CHOCH');assert.equal(r.protectedLevel.price,100);
});
test('unfinished swing candle never changes confirmed state',()=>{
 const r=mapFalconSwingStructure([bar(2,101,88,89,false)],bullishSwing);
 assert.equal(r.trend,'BULLISH');assert.equal(r.events.length,0);
});
test('initial swing stays TRANSITION until separate pullback and close confirmation',()=>{
 const rows=[bar(0,100,90,95),bar(1,102,92,101),bar(2,101,94,98),bar(3,103,96,102.5)];
 for(let n=0;n<4;n++)assert.equal(mapFalconSwingStructure(rows.slice(0,n)).trend,'TRANSITION');
 const r=mapFalconSwingStructure(rows);assert.equal(r.trend,'BULLISH');assert.equal(r.initialDirection.index,3);assert.equal(r.events.length,0);
 assert.equal(r.protectedLevel.pivotIndex,2);assert.equal(r.protectedLevel.confirmedAt,3);
});
test('swing seed must use independent known wick points',()=>{
 assert.throws(()=>mapFalconSwingStructure([],{...bullishSwing,weak:{...bullishSwing.weak,pivotIndex:0}}));
 assert.throws(()=>mapFalconSwingStructure([],{...bullishSwing,strong:{...bullishSwing.strong,confirmedAt:10}}));
});
test('swing event prefixes are immutable as later bars arrive',()=>{
 const rows=[bar(2,101,96,100.5),bar(3,100,95,98),bar(4,104,97,103),bar(5,100,93,94)];
 const full=mapFalconSwingStructure(rows,bullishSwing);
 for(let n=1;n<=rows.length;n++)assert.deepEqual(mapFalconSwingStructure(rows.slice(0,n),bullishSwing).events,full.events.filter(e=>e.eventIndex<=rows[n-1].index));
});
test('failed wick beyond a confirmed swing level does not move its close threshold',()=>{
 const r=mapFalconSwingStructure([bar(2,102,97,99),bar(3,101,98,100.5)],bullishSwing);
 assert.equal(r.events.length,1);assert.equal(r.events[0].price,100);
});
