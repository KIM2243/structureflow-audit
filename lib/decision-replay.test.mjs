import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDecisionReplay} from './decision-replay.ts';
const at=Date.UTC(2026,8,11,12);
const rows=[-3,-2,-1,0,1].map(m=>({date:new Date(at+m*60000).toISOString(),open:10,high:11,low:9,close:10,volume:1}));
const decision={at,symbol:'TEST',stage:'WAIT_ENTRY',setup:{zone:{low:9,high:10}}};
const feed={symbol:'TEST',timeframes:{'1m':rows,'15m':rows,'1H':rows,'4H':rows}};
test('replay stores only completed candles available at decision and copies input',()=>{const r=makeDecisionReplay(decision,feed);assert.equal(r.candles['1m'].length,3);assert.equal(r.candles['4H'].length,0);assert.ok(r.candles['1m'].every(b=>Date.parse(b.date)+60000<=at));r.candles['1m'][0].close=1;r.decision.setup.zone.low=1;assert.equal(rows[0].close,10);assert.equal(decision.setup.zone.low,9);});
test('replay does not invent history for unavailable or wrong-symbol data',()=>{assert.equal(makeDecisionReplay({...decision,stage:'DATA_WAIT'},feed),undefined);assert.equal(makeDecisionReplay(decision,{...feed,symbol:'OTHER'}),undefined);});
