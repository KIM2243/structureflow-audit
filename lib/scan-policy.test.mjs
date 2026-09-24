import test from 'node:test';
import assert from 'node:assert/strict';
import {dueSession,resourceSafe,UNIVERSE,LIMITS} from './scan-policy.mjs';
test('KR runs after regular close, not NXT close; weekends excluded',()=>{assert.equal(dueSession('KR',Date.parse('2026-09-23T06:39:00Z')),null);assert.equal(dueSession('KR',Date.parse('2026-09-23T06:40:00Z')).closeAt,Date.parse('2026-09-23T06:30:00Z'));assert.equal(dueSession('KR',Date.parse('2026-09-26T06:40:00Z')),null);});
test('US close follows DST and published early close',()=>{assert.equal(dueSession('US',Date.parse('2026-09-23T20:10:00Z')).closeAt,Date.parse('2026-09-23T20:00:00Z'));assert.equal(dueSession('US',Date.parse('2026-12-01T21:10:00Z')).closeAt,Date.parse('2026-12-01T21:00:00Z'));assert.equal(dueSession('US',Date.parse('2026-11-27T18:10:00Z')).closeAt,Date.parse('2026-11-27T18:00:00Z'));});
test('resource floor blocks low memory, high load and low disk',()=>{const safe={availableMiB:160,freeBytes:3*1024**3,load:.2};assert.ok(resourceSafe(safe));for(const changes of [{availableMiB:127},{freeBytes:1024**3},{load:2}])assert.equal(resourceSafe({...safe,...changes}),false);});
test('bounded and unique coverage',()=>{for(const items of Object.values(UNIVERSE)){assert.equal(items.length,LIMITS.universe);assert.equal(new Set(items.map(i=>i.symbol)).size,items.length);}assert.equal(LIMITS.detailed,6);});
