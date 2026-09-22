import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPhase,phaseStates,marketPhaseTimeline,phaseAt} from './market-phases.ts';
const event=(at,scope,direction,kind='BOS',frame='4H')=>({at,scope,direction,kind,frame,price:100});
test('lecture bullish and bearish examples depend on proposed position',()=>{
 for(const [swing,internal,long,short] of [['BULLISH','BULLISH','PP','CC'],['BULLISH','BEARISH','PC','CP'],['BEARISH','BULLISH','CP','PC'],['BEARISH','BEARISH','CC','PP']]){
 assert.equal(classifyPhase('LONG',swing,internal),long); assert.equal(classifyPhase('SHORT',swing,internal),short);
 }
 assert.equal(classifyPhase('LONG','TRANSITION','BULLISH'),null);
 assert.equal(classifyPhase('SHORT','BEARISH','TRANSITION'),null);
});
test('1H CHoCH can start pullback without 4H CHoCH and later 4H CHoCH can end it',()=>{
 const points=phaseStates([event(1,'SWING','BULLISH'),event(1,'INTERNAL','BULLISH'),event(2,'INTERNAL','BEARISH','CHOCH','1H'),event(3,'INTERNAL','BULLISH','BOS'),event(4,'INTERNAL','BULLISH','CHOCH')]);
 assert.equal(classifyPhase('SHORT',points[1].swing,points[1].internal),'CP');
 assert.equal(points[2].internal,'BEARISH'); // BOS alone does not erase the lower CHoCH.
 assert.equal(points[3].internal,'BULLISH');
 assert.equal(points[1].conflict,true);
});
test('broken swing protection suspends classification until opposite BOS',()=>{
 const p=phaseStates([event(1,'SWING','BULLISH'),event(1,'INTERNAL','BEARISH'),event(2,'SWING','BEARISH','CHOCH'),event(3,'SWING','BEARISH')]);
 assert.equal(classifyPhase('LONG',p[1].swing,p[1].internal),null);
 assert.equal(classifyPhase('LONG',p[2].swing,p[2].internal),'CC');
});
test('simultaneous internal CHoCH gives 4H priority regardless input order',()=>{
 const e=[event(2,'INTERNAL','BULLISH','CHOCH'),event(2,'INTERNAL','BEARISH','CHOCH','1H')];
 for(const a of [e,[...e].reverse()])assert.equal(phaseStates(a).at(-1).internalEvidence.frame,'4H');
});
const start=Date.UTC(2026,8,1);
const rows=(minutes)=>Array.from({length:40},(_,i)=>({date:new Date(start+i*minutes*60000).toISOString(),open:100+i,close:101+i,high:102+i,low:99+i,volume:100}));
test('in-progress and future changes cannot alter confirmed history',()=>{
 const data={'4H':rows(240),'1H':rows(60)},now=start+30*240*60000;
 const before=marketPhaseTimeline(data,now);
 const changed=structuredClone(data);
 for(const [frame,minutes] of [['4H',240],['1H',60]])for(const b of changed[frame])if(Date.parse(b.date)+minutes*60000>now){b.close=1000;b.high=1001;}
 assert.deepEqual(marketPhaseTimeline(changed,now),before);
 assert.ok(before.points.every(p=>p.at<=now));
 assert.equal(phaseAt(before,start),undefined);
});
test('missing or unordered native data does not invent phase',()=>{
 assert.ok(marketPhaseTimeline({'4H':rows(240)},start+1e9).error);
 assert.ok(marketPhaseTimeline({'4H':rows(240).reverse(),'1H':rows(60)},start+1e9).error);
});
