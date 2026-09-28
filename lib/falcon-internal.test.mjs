import test from 'node:test';
import assert from 'node:assert/strict';
import {mapFalconInternalStructure,type2Break} from './falcon-internal.ts';
import {mapFalconSwingStructure} from './falcon-structure.ts';
import {bar,level,bearishInternal,bullishSwing} from './falcon-spec-fixtures.mjs';
const unconfirmed={direction:'BEARISH',extreme:level(1,95,'low'),knownAt:1};
test('previously confirmed minor wick break emits CHoCH despite close returning',()=>{
 const r=mapFalconInternalStructure([bar(2,100.1,96,99)],bearishInternal);
 assert.equal(r.events[0].kind,'CHOCH');assert.equal(r.trend,'BULLISH');assert.equal(r.events[0].confirmedAt,1);assert.equal(r.events[0].eventIndex,2);
});
test('candidate wick crossing is not CHoCH before extension confirms it',()=>{
 const r=mapFalconInternalStructure([bar(2,100,96,98),bar(3,101,96,99)],unconfirmed);
 assert.equal(r.events.length,0);assert.equal(r.candidate.price,101);assert.equal(r.confirmedMinorHigh,undefined);
});
test('minor high confirmation stores distinct location and knowledge indices',()=>{
 const r=mapFalconInternalStructure([bar(2,100,96,98),bar(3,99,94,95)],unconfirmed);
 assert.equal(r.confirmedMinorHigh.pivotIndex,2);assert.equal(r.confirmedMinorHigh.confirmedAt,3);assert.equal(r.events[0].kind,'BOS');
});
test('minor low confirmation mirrors minor high',()=>{
 const seed={direction:'BULLISH',extreme:level(1,105,'high'),knownAt:1};
 const r=mapFalconInternalStructure([bar(2,104,100,102),bar(3,106,101,105)],seed);
 assert.equal(r.confirmedMinorLow.price,100);assert.equal(r.confirmedMinorLow.confirmedAt,3);
 const next=mapFalconInternalStructure([bar(2,104,100,102),bar(3,106,101,105),bar(4,105,99,102)],seed);
 assert.equal(next.events.at(-1).kind,'CHOCH');assert.equal(next.trend,'BEARISH');
});
test('same-bar candidate confirm and opposite wick defers CHoCH until next bar',()=>{
 const rows=[bar(2,100,96,98),bar(3,101,94,99),bar(4,100.5,95,99)];
 const first=mapFalconInternalStructure(rows.slice(0,2),unconfirmed);
 assert.equal(first.confirmedMinorHigh.confirmedAt,3);assert.equal(first.events.filter(e=>e.kind==='CHOCH').length,0);assert.equal(first.ambiguities[0].reason,'SAME_BAR_AMBIGUOUS');
 const full=mapFalconInternalStructure(rows,unconfirmed);assert.equal(full.events.at(-1).kind,'CHOCH');assert.equal(full.events.at(-1).eventIndex,4);
});
test('already-confirmed minor still breaks when the same candle also extends the old leg',()=>{
 const r=mapFalconInternalStructure([bar(2,101,94,99)],bearishInternal);
 assert.equal(r.events[0].kind,'CHOCH');assert.equal(r.trend,'BULLISH');
});
test('only first direction change is CHoCH; subsequent extensions are not repeated reversals',()=>{
 const r=mapFalconInternalStructure([bar(2,101,96,99),bar(3,102,97,101),bar(4,103,98,102),bar(5,102,99,101),bar(6,104,100,103)],bearishInternal);
 assert.equal(r.events.filter(e=>e.kind==='CHOCH').length,1);assert.equal(r.events.at(-1).kind,'BOS');
});
test('internal initialization stays TRANSITION until confirmed minor; no initial CHoCH',()=>{
 const rows=[bar(0,102,98,100),bar(1,101,95,98),bar(2,100,96,98),bar(3,99,94,95)];
 for(let n=0;n<4;n++)assert.equal(mapFalconInternalStructure(rows.slice(0,n)).trend,'TRANSITION');
 const r=mapFalconInternalStructure(rows);assert.equal(r.trend,'BEARISH');assert.equal(r.initialDirection.index,3);assert.equal(r.events.length,0);
});
test('internal reversal is independent of swing reversal',()=>{
 const rows=[bar(2,100,94,99)];const seed={direction:'BULLISH',extreme:level(1,105,'high'),minor:level(0,95,'low',1),knownAt:1};
 assert.equal(mapFalconInternalStructure(rows,seed).trend,'BEARISH');assert.equal(mapFalconSwingStructure(rows,bullishSwing).trend,'BULLISH');
});
test('ambiguous prefixes never gain retroactive events or confirmed points',()=>{
 const rows=[bar(2,100,96,98),bar(3,101,94,99),bar(4,102,95,101),bar(5,101,96,100),bar(6,103,97,102)];
 const full=mapFalconInternalStructure(rows,unconfirmed);
 for(let n=1;n<=rows.length;n++){const r=mapFalconInternalStructure(rows.slice(0,n),unconfirmed),index=rows[n-1].index;assert.deepEqual(r.events,full.events.filter(e=>e.eventIndex<=index));assert.deepEqual(r.points,full.points.filter(p=>p.confirmedAt<=index));}
});
test('live incomplete wick may break known minor, never a same-bar confirmed minor',()=>{
 assert.equal(mapFalconInternalStructure([bar(2,101,96,99,false)],bearishInternal).events[0].kind,'CHOCH');
 assert.equal(type2Break('BULLISH',level(1,100,'high',2),bar(2,101,95,99)),false);
});
