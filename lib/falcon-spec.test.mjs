import test from 'node:test';
import assert from 'node:assert/strict';
import {bar,specificationCases} from './falcon-spec-fixtures.mjs';
test('Falcon specification fixtures retain all 13 requested cases and valid OHLC',()=>{
 assert.equal(new Set(specificationCases).size,13);
 const sample=bar(2,101,98,99);
 assert.ok(sample.candle.low<=sample.candle.close&&sample.candle.close<=sample.candle.high);
 assert.ok(sample.observedAt>Date.parse(sample.candle.date));
});
