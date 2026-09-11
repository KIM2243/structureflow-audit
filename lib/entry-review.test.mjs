import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReview,zoneDifference,reviewEvidence} from './entry-review.ts';
const draft={kind:'zone',expected:'WAIT',frame:'1m',low:11,high:13,reference:'6-8 12:46',notes:'구역 경계 비교'};
test('review requires valid ordered bounds and explicit rationale',()=>{assert.equal(validateReview(draft).kind,'zone');for(const patch of [{high:10},{low:null},{low:NaN},{notes:' '},{kind:'invented'},{reference:'a'.repeat(501)}])assert.throws(()=>validateReview({...draft,...patch}));});
test('zone comparison measures signed boundary difference and intersection-over-union',()=>{const d={setup:{m1:{low:10,high:12}}};const result=zoneDifference(d,draft);assert.equal(result.lowDelta,1);assert.equal(result.highDelta,1);assert.ok(Math.abs(result.overlapPct-100/3)<1e-10);assert.equal(zoneDifference(d,{...draft,high:9}),null);assert.equal(zoneDifference({},draft),null);});
test('missing records remain unknown and a wait is never inferred to be a missed trade',()=>{const e=reviewEvidence({fills:[]});assert.equal(e.entry,false);assert.equal(e.sequence,null);assert.equal(e.inside,null);assert.equal(e.rr,null);assert.equal('missed' in e,false);});
test('recorded chronology highlights reversed sequence without altering the original decision',()=>{const d={at:50,fills:[{action:'ENTRY'}],setup:{touch:10,m15:{at:20},retest:30,m1:{at:40}}};assert.equal(reviewEvidence(d).sequence,true);d.setup.retest=15;assert.equal(reviewEvidence(d).sequence,false);assert.equal(d.setup.retest,15);});
