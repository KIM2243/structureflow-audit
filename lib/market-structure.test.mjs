import assert from 'node:assert/strict';
import test from 'node:test';
import { mapMarketStructure, mechanicalInternalPivots } from './market-structure.ts';
import { analyze } from './engine.ts';

const bars = (rows) => rows.map(([high, low, close], i) => ({
  high, low, close, open: (high + low) / 2, volume: 100,
  date: new Date(Date.UTC(2026, 0, 1, 0, i * 5)).toISOString(),
}));
const sequence = bars([
  [10, 8, 9], [10, 8, 9], [12, 9, 11], [14, 10, 13],
  [13, 11, 12], [12, 10, 11], [14.5, 11, 13], // wick-only sweep of 14
  [13, 9, 12], [15, 10, 14.8], // BOS promotes index 7, not index 4
  [14, 11, 12], [12, 7, 8], // protected low 9 closes broken: CHoCH
  [11, 8, 10], [9, 6, 6.5], // continuation confirms bearish BOS
]);

test('internal lows are not promoted until a closing BOS, and the deepest origin wins', () => {
  const before = mapMarketStructure(sequence.slice(0, 8));
  assert.equal(before.protectedLevel.price, 8);
  assert.ok(!before.pivots.some((p) => p.kind === 'low' && p.index === 4));
  assert.equal(before.events.length, 1);
  const after = mapMarketStructure(sequence.slice(0, 9));
  assert.equal(after.protectedLevel.index, 7);
  assert.equal(after.events.at(-1).kind, 'BOS');
  assert.equal(after.pivots.find((p) => p.index === 7).confirmedAt, 8);
});

test('a protected-level breach warns of transition, a subsequent BOS confirms reversal', () => {
  const warning = mapMarketStructure(sequence.slice(0, 11));
  assert.equal(warning.trend, 'TRANSITION');
  assert.equal(warning.events.at(-1).kind, 'CHOCH');
  const confirmed = mapMarketStructure(sequence);
  assert.equal(confirmed.trend, 'BEARISH');
  assert.equal(confirmed.events.at(-1).kind, 'BOS');
});

test('confirmed events are prefix-stable: appending future bars never rewrites past events', () => {
  const full = mapMarketStructure(sequence);
  for (let length = 2; length <= sequence.length; length++) {
    assert.deepEqual(mapMarketStructure(sequence.slice(0, length)).events,
      full.events.filter((event) => event.index < length));
  }
});

test('dealing range uses protected origin and confirmed extreme, not a minor pullback pair', () => {
  const result = mapMarketStructure(sequence.slice(0, 8));
  assert.deepEqual(result.range, { high: 14, low: 8, equilibrium: 11, confirmedAt: 4 });
});

test('mechanical internal turns carry their next-bar confirmation time', () => {
  const result = mechanicalInternalPivots(sequence);
  assert.ok(result.length > 0);
  assert.ok(result.every((p) => p.confirmedAt === p.index + 1));
});

test('unfinished last bar cannot confirm a structural breakout', () => {
  const history = bars(Array.from({ length: 20 }, () => [10, 8, 9]));
  const last = bars([[100, 9, 99]])[0];
  const result = analyze([...history, last]);
  assert.equal(result.structureState.swingTrend, 'TRANSITION');
  assert.equal(result.entryForecast.zoneValid, false);
  assert.equal(result.entryForecast.status, 'AVOID');
  assert.equal(result.rr, 0);
});

test('rescaling prices preserves structure and scales plans without mixing currency units', () => {
  const history = [...bars(Array.from({ length: 20 }, () => [10, 8, 9])), ...sequence];
  const base = analyze(history);
  const scaled = analyze(history.map((b) => ({ ...b, open: b.open * 10000, high: b.high * 10000, low: b.low * 10000, close: b.close * 10000 })));
  assert.equal(base.bias, scaled.bias);
  assert.equal(base.entryForecast.status, scaled.entryForecast.status);
  assert.equal(scaled.entry[0], base.entry[0] * 10000);
  assert.equal(scaled.target, base.target * 10000);
  assert.ok(Math.abs(scaled.rr - base.rr) < 1e-8);
});
