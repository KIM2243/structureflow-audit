import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestGate } from './kiwoom-request-gate.ts';
import { createRequestCache } from './bridge-request-cache.mjs';

test('concurrent quote/chart/retry starts share a spaced budget', async () => {
  const gate = new RequestGate(25);
  const starts = await Promise.all(Array.from({length: 5}, async () => {
    await gate.wait(); return Date.now();
  }));
  for (let i=1;i<starts.length;i++) assert.ok(starts[i]-starts[i-1]>=25);
});
test('rate-limit cooldown delays queued work and cancelled work does not poison queue', async () => {
  const gate = new RequestGate(5);
  gate.defer(40);
  const started=Date.now(), aborted=new AbortController(); aborted.abort();
  await assert.rejects(gate.wait(aborted.signal));
  await gate.wait();
  assert.ok(Date.now()-started>=40);
});
test('cache coalesces concurrent work, preserves timestamps, expires, and retries failures', async () => {
  let now=100, calls=0;
  const cached=createRequestCache(10,()=>now);
  const load=async()=>({timestamp:now,id:++calls});
  const [a,b]=await Promise.all([cached('q',load),cached('q',load)]);
  assert.equal(a,b); assert.equal(calls,1);
  now=105; assert.equal((await cached('q',load)).timestamp,100);
  now=111; assert.equal((await cached('q',load)).id,2);
  await assert.rejects(cached('bad',async()=>{throw new Error('429');}));
  assert.equal(await cached('bad',async()=> 'recovered'),'recovered');
});
