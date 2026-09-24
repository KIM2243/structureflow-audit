import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionEvidence,selectDetailed,attachTracking} from './scan-selection.mjs';
const bars=()=>Array.from({length:40},(_,i)=>({open:100+i,high:102+i,low:99+i,close:101+i,volume:i>=35?150000:100000}));
test('persistent volume uses preceding baseline and accepts several rising days',()=>{
 const e=selectionEvidence(bars(),'US');assert.equal(e.volumeRatio,1.5);assert.equal(e.elevatedDays,5);assert.equal(e.interest,true);assert.equal(e.eligible,true);
});
test('one-day surge is not persistent attention; price+volume spike is held',()=>{
 const b=bars();for(const x of b)x.volume=100000;b.at(-1).volume=600000;
 assert.equal(selectionEvidence(b,'US').interest,false);
 b.at(-1).close=b.at(-2).close*1.2;
 assert.ok(selectionEvidence(b,'US').reasons.includes('하루 가격·거래량 동반 급변'));
});
test('low liquidity and inactive sessions cannot become candidates',()=>{
 const b=bars();for(const x of b)x.volume=1;assert.equal(selectionEvidence(b,'US').eligible,false);
 const c=bars();c.at(-3).volume=0;assert.equal(selectionEvidence(c,'US').eligible,false);
});
test('interest reserves three distinct slots even against liquid large names',()=>{
 const rows=Array.from({length:20},(_,i)=>({item:{symbol:String(i)},evidence:{eligible:true,interest:i>=15,turnover:100-i,elevatedDays:3,volumeRatio:2}}));
 const chosen=selectDetailed(rows);assert.equal(chosen.length,6);assert.equal(chosen.filter(c=>c.selection==='interest').length,3);assert.equal(new Set(chosen.map(c=>c.item.symbol)).size,6);
 assert.ok(chosen.some(c=>c.item.symbol==='0'));
});
test('unsafe names never fill slots and missing interest uses liquidity',()=>{
 const rows=[{item:{symbol:'a'},evidence:{eligible:false,interest:true,turnover:999}},{item:{symbol:'b'},evidence:{eligible:true,interest:false,turnover:10}}];
 assert.deepEqual(selectDetailed(rows).map(c=>c.item.symbol),['b']);
});
const candidate=(symbol,ready=false)=>({symbol,name:symbol,plan:{direction:'LONG',ready,stage:'눌림 대기'}});
test('history distinguishes trigger progress, direction change and unexamined names',()=>{
 const old={date:'2026-09-22',candidates:[candidate('a'),candidate('b')]};
 const r=attachTracking({date:'2026-09-23',candidates:[candidate('a',true),candidate('c')]},old);
 assert.equal(r.candidates[0].tracking.status,'진입 조건 확인');assert.equal(r.candidates[1].tracking.status,'신규 발견');
 assert.equal(r.candidates[0].tracking.firstSeen,'2026-09-22');assert.match(r.previousCandidates[0].status,/미재분석/);
 const next=attachTracking({date:'2026-09-24',candidates:[{...candidate('a'),plan:{direction:'SHORT',ready:false,stage:'대기'}}]},r);
 assert.equal(next.candidates[0].tracking.status,'방향 변경');assert.equal(next.candidates[0].tracking.history.length,3);
});
test('only explicit fresh outcomes mark exclusions; history bounded and same-date deduped',()=>{
 let prior={date:'2026-09-01',candidates:[candidate('a'),candidate('b')]};
 for(let day=2;day<=9;day++)prior=attachTracking({date:`2026-09-0${day}`,candidates:[candidate('a')]},prior);
 assert.equal(prior.candidates[0].tracking.history.length,5);
 assert.equal(attachTracking({date:'2026-09-10',candidates:[]},prior,{a:'계획 조건 해제'}).previousCandidates[0].status,'계획 조건 해제');
});
