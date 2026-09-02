import assert from 'node:assert/strict';
import test from 'node:test';

import { getRecentSwingRange } from './swing-range.ts';

const pivots = [
  { index: 10, price: 100, kind: 'low', label: 'L' },
  { index: 20, price: 120, kind: 'high', label: 'H' },
  { index: 30, price: 108, kind: 'low', label: 'HL' },
  { index: 40, price: 132, kind: 'high', label: 'HH' },
];

test('uses the latest confirmed opposite swing pair', () => {
  assert.deepEqual(getRecentSwingRange(pivots, 50), {
    high: 132,
    low: 108,
    equilibrium: 120,
  });
});

test('respects the chart end index when reviewing an older range', () => {
  assert.deepEqual(getRecentSwingRange(pivots, 35), {
    high: 120,
    low: 108,
    equilibrium: 114,
  });
});

test('does not invent a range without two opposite confirmed pivots', () => {
  assert.equal(getRecentSwingRange(pivots, 20), null);
});
