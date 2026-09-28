import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPhase} from './market-phases.ts';
import {mapFalconSwingStructure} from './falcon-structure.ts';
import {mapFalconInternalStructure} from './falcon-internal.ts';
import {historicalFalconObservations,falconDifferential,falconMtfShadow} from './falcon-shadow.ts';
import {bar,at} from './falcon-spec-fixtures.mjs';
const rows=[bar(0,102,98,100),bar(1,101,95,98),bar(2,100,96,98),bar(3,99,94,95),bar(4,101,96,99),bar(5,102,97,101),bar(6,101,98,100),bar(7,103,99,102)];
test('all eight CC/CP/PC/PP combinations retain unchanged classification',()=>{
 for(const [s,i,long,short]of [['BULLISH','BULLISH','PP','CC'],['BULLISH','BEARISH','PC','CP'],['BEARISH','BULLISH','CP','PC'],['BEARISH','BEARISH','CC','PP']]){assert.equal(classifyPhase('LONG',s,i),long);assert.equal(classifyPhase('SHORT',s,i),short);}
 const swing=mapFalconSwingStructure(rows),internal=mapFalconInternalStructure(rows);
 assert.equal(classifyPhase('LONG',swing.trend,internal.trend),swing.trend==='TRANSITION'||internal.trend==='TRANSITION'?null:(swing.trend==='BULLISH'?'P':'C')+(internal.trend==='BULLISH'?'P':'C'));
});
test('historical wick signal appears at close availability, not candle-open',()=>{
 const candles=rows.map(r=>r.candle),now=at+4*60000;
 const before=historicalFalconObservations(candles,1,now+30000),after=historicalFalconObservations(candles,1,now+60000);
 assert.equal(mapFalconInternalStructure(before).events.filter(e=>e.kind==='CHOCH').length,0);
 const event=mapFalconInternalStructure(after).events.find(e=>e.kind==='CHOCH');assert.equal(event.eventIndex,4);assert.equal(event.observedAt,at+5*60000);
});
test('future high/low/close poisoning cannot alter historical output',()=>{
 const original=rows.map(r=>r.candle),cutoff=at+4*60000,changed=structuredClone(original);
 for(const c of changed)if(Date.parse(c.date)+60000>cutoff){c.high=9999;c.low=.01;c.close=9000;}
 assert.deepEqual(historicalFalconObservations(original,1,cutoff),historicalFalconObservations(changed,1,cutoff));
});
test('historical adapter retains the existing deferred last-bar contract',()=>{
 assert.equal(historicalFalconObservations(rows.map(r=>r.candle),1,at+100*60000).length,rows.length-1);
});
test('differential harness exposes both legacy and Falcon states without modifying input',()=>{
 const saved=structuredClone(rows),result=falconDifferential(rows);
 assert.deepEqual(rows,saved);assert.equal(result.length,rows.length);assert.ok(result.some(r=>r.difference));
 for(const r of result){assert.equal(typeof r.legacySwingDirection,'string');assert.equal(typeof r.falconInternalDirection,'string');assert.ok('confirmedMinorHigh'in r);}
});
test('data-start sensitivity remains visible, aligned confirmed-seed replay is stable',()=>{
 const counts=[0,1,2].map(offset=>{const r=mapFalconInternalStructure(rows.slice(offset));return {offset,initial:r.initialDirection?.index??null,events:r.events.map(e=>e.eventIndex)};});
 assert.equal(counts.length,3);assert.equal(counts[0].initial,3);assert.notDeepEqual(counts[0],counts[2]);
 const warm=mapFalconInternalStructure(rows.slice(0,4));const seed={direction:warm.trend,extreme:{pivotIndex:warm.currentExtreme.pivotIndex,price:warm.currentExtreme.price,kind:'low',confirmedAt:3,observedAt:rows[3].observedAt},minor:warm.confirmedMinorHigh,knownAt:3};
 assert.deepEqual(mapFalconInternalStructure(rows.slice(4),seed).events,mapFalconInternalStructure(rows).events);
});
test('MTF shadow keeps production gates untouched and future evidence invisible',()=>{
 const data=Object.fromEntries(['4H','1H','15m','5m','1m'].map(f=>[f,rows.map(r=>r.candle)]));
 const r=falconMtfShadow(data,at+4*60000);assert.equal(r.mode,'SHADOW_ONLY');assert.equal(r.productionGateChanged,false);assert.equal(r.structuralCandidate,false);assert.equal(r.frames['4H'].falconSwingDirection,'TRANSITION');
});
