import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateMultiTimeframeEntry } from './multi-timeframe.ts';

const snapshot = (trend) => ({ trend, sequence: '', event: '', score: 70 });
const analysis = (bias, status = 'READY') => ({
  bias,
  rr: 3,
  entryForecast: { status, zoneValid: true, locationConfirmed: true, zoneTouchTime: '2026-09-01T10:00:00Z', reactionTime: '2026-09-01T10:05:00Z', reactionConfirmed: status === 'READY' },
});

const input = ({ daily = 'BULLISH', fourHour = 'BULLISH', hourly = 'LONG', fifteen = 'LONG', five = 'LONG', trigger = 'READY' } = {}) => ({
  snapshots: {
    '1D': snapshot(daily),
    '4H': snapshot(fourHour),
    '1H': snapshot('BULLISH'),
    '15m': snapshot('BULLISH'),
    '5m': snapshot('BULLISH'),
  },
  analyses: {
    '1H': analysis(hourly),
    '15m': analysis(fifteen),
    '5m': analysis(five, trigger),
  },
});

test('aligned snapshots alone cannot bypass native candles and contact sequence', () => {
  const result = evaluateMultiTimeframeEntry(input());
  assert.equal(result.status, 'WAIT');
  assert.equal(result.direction, 'LONG');
  assert.equal(result.steps.at(-1).timeframe,'1m');
  assert.equal(result.steps.at(-1).state,'WAIT');
});

test('daily countertrend keeps the H4 direction but still requires native M1', () => {
  const result = evaluateMultiTimeframeEntry(
    input({ fourHour: 'BEARISH', hourly: 'SHORT', fifteen: 'SHORT', five: 'SHORT' }),
  );
  assert.equal(result.status, 'WAIT');
  assert.equal(result.direction, 'SHORT');
  assert.equal(result.steps[0].state, 'WAIT');
  assert.equal(result.steps[1].state, 'WAIT');
});

test('an entry timeframe opposite to the four hour swing blocks entry', () => {
  const result = evaluateMultiTimeframeEntry(
    input({ fourHour: 'BEARISH', hourly: 'SHORT', fifteen: 'LONG', five: 'SHORT' }),
  );
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.steps[3].state, 'BLOCK');
});

test('five minute data cannot replace the missing one minute trigger', () => {
  const result = evaluateMultiTimeframeEntry(input({ trigger: 'WAIT' }));
  assert.equal(result.status, 'WAIT');
  assert.equal(result.steps.at(-1).state, 'WAIT');
  assert.equal(result.entryTimeframe, '1m');
});

test('a transition on the daily chart never produces a ready entry', () => {
  const result = evaluateMultiTimeframeEntry(
    input({ daily: 'TRANSITION', fourHour: 'TRANSITION' }),
  );
  assert.equal(result.status, 'WAIT');
  assert.equal(result.direction, 'NEUTRAL');
});

test('aligned directions without contact with the fifteen minute zone must wait', () => {
  const fixture = input();
  fixture.analyses['15m'].entryForecast.locationConfirmed = false;
  assert.equal(evaluateMultiTimeframeEntry(fixture).status, 'WAIT');
});

test('a five minute reaction before zone contact cannot trigger entry', () => {
  const fixture = input();
  fixture.analyses['5m'].entryForecast.reactionTime = '2026-09-01T09:55:00Z';
  assert.equal(evaluateMultiTimeframeEntry(fixture).status, 'WAIT');
});

test('the entry price timeframe is M1, with M15 reserved for the parent zone', () => {
  assert.equal(evaluateMultiTimeframeEntry(input()).entryTimeframe, '1m');
});

test('hourly bullish analysis without a confirmed native internal direction cannot pass PP',()=>{
  const result=evaluateMultiTimeframeEntry(input());
  assert.equal(result.steps.find(s=>s.timeframe==='1H').state,'WAIT');
});

test('an opposite native M1 bias blocks the chart candidate even when M5 agrees',()=>{
  const fixture=input();fixture.analyses['1m']=analysis('SHORT');
  const result=evaluateMultiTimeframeEntry(fixture);
  assert.equal(result.status,'BLOCKED');assert.equal(result.steps.at(-1).state,'BLOCK');
});

test('missing timestamps or invalid plan fail closed', () => {
  const fixture = input();
  fixture.analyses['15m'].entryForecast.zoneTouchTime = undefined;
  assert.equal(evaluateMultiTimeframeEntry(fixture).status, 'WAIT');
  fixture.analyses['15m'].entryForecast.zoneValid = false;
  assert.notEqual(evaluateMultiTimeframeEntry(fixture).status, 'READY');
});
