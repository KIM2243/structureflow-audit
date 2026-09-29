import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {validateDataset,validateShadow,notRun,auditStep,auditFrame} from '../scripts/falcon-realdata-validate.mjs';
import {bar} from './falcon-spec-fixtures.mjs';
import {mapFalconSwingStructure} from './falcon-structure.ts';
import {mapFalconInternalStructure} from './falcon-internal.ts';
const frames=['4H','1H','15m','5m','1m'];
function dataset(){return {symbol:'SYNTHETIC',source:'SYNTHETIC_TEST_ONLY',synthetic:true,timezone:'UTC',capturedAt:'2026-09-29T00:00:00Z',timeframes:Object.fromEntries(frames.map(f=>[f,[bar(0,102,98,100),bar(1,101,95,98),bar(2,100,96,98),bar(3,99,94,95),bar(4,101,95,100)].map(r=>r.candle)]))};}
test('realdata harness accepts JSON shape without inventing source provenance',()=>{
 const result=validateDataset(JSON.parse(JSON.stringify(dataset())));
 assert.equal(result.coverage['4H'].count,5);assert.equal(result.metadata['4H'].derived,null);
 assert.ok(result.warnings.some(w=>w.code==='PROVENANCE_UNKNOWN'));
});
test('realdata harness rejects reversed timestamps',()=>{const d=dataset();d.timeframes['1m'].reverse();assert.throws(()=>validateDataset(d),/non-increasing/);});
test('realdata harness rejects duplicate timestamps',()=>{const d=dataset();d.timeframes['5m'][1].date=d.timeframes['5m'][0].date;assert.throws(()=>validateDataset(d),/Duplicate/);});
test('realdata harness rejects every invalid OHLCV instead of dropping bars',()=>{
 for(const changes of [{high:1},{low:0},{close:NaN},{open:Infinity},{volume:-1},{volume:Infinity},{date:'invalid'},{date:'2026-09-28T00:00:00'}]){
 const d=dataset();Object.assign(d.timeframes['1H'][1],changes);assert.throws(()=>validateDataset(d),/Invalid/);
 }
});
test('realdata harness rejects missing timeframe and insufficient bars',()=>{const d=dataset();delete d.timeframes['15m'];assert.throws(()=>validateDataset(d),/Missing/);d.timeframes['15m']=[];assert.throws(()=>validateDataset(d),/fewer/);});
test('realdata harness rejects future candles and future captures',()=>{
 const d=dataset();d.timeframes['1m'].at(-1).date='2099-01-01T00:00:00Z';assert.throws(()=>validateDataset(d),/Future/);
 d.capturedAt='2099-01-02T00:00:00Z';assert.throws(()=>validateDataset(d),/future captured/);
});
test('no actual dataset reports NOT_RUN, never zero empirical violations',()=>{
 assert.equal(notRun().REAL_DATA_VALIDATION,'NOT_RUN');assert.equal(notRun().recommendation,'NOT READY');assert.equal(notRun().violations,undefined);
 const r=validateShadow(dataset());assert.equal(r.REAL_DATA_VALIDATION,'NOT_RUN');assert.equal(r.synthetic,true);
});
test('audit scripts are not imported by production and contain no trading IO',async()=>{
 const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+e.name;if(e.isDirectory())await walk(path);else if(/\.(ts|tsx|mjs)$/.test(e.name)&&!e.name.endsWith('.test.mjs'))files.push(path);}}
 for(const dir of ['app','components','lib'])await walk(dir);
 for(const p of files)assert.doesNotMatch(await readFile(p,'utf8'),/from\s+['"][^'"]*falcon-realdata-validate/);
 const script=await readFile('scripts/falcon-realdata-validate.mjs','utf8');assert.doesNotMatch(script,/from\s+['"][^'"]*(?:auto-paper|upper-context|multi-timeframe|auth|kiwoom|bridge|db)[^'"]*['"]/);assert.doesNotMatch(script,/\bfetch\s*\(/);
});
test('metadata mismatch and disjoint timeframe coverage fail',()=>{
 for(const key of ['symbol','source','timezone']){const d=dataset();d.frameMetadata={'4H':{[key]:'OTHER'}};assert.throws(()=>validateDataset(d),/Inconsistent/);}
 const d=dataset();d.timeframes['4H']=d.timeframes['4H'].map(b=>({...b,date:b.date.replace('09-28','09-27')}));assert.throws(()=>validateDataset(d),/overlapping/);
});
test('derived H4 is distinguished from native H4, optional 1D supported',()=>{
 const d=dataset();d.frameMetadata={'4H':{derived:true,derivedFrom:'1H',aggregation:'StructureFlow session aggregation'}};d.timeframes['1D']=structuredClone(d.timeframes['4H']);
 assert.equal(validateDataset(d).metadata['4H'].derived,true);assert.equal(validateDataset(d).coverage['1D'].count,5);
 d.frameMetadata['4H']={derived:false};assert.equal(validateDataset(d).metadata['4H'].derived,false);
 d.frameMetadata['4H']={derived:true};assert.throws(()=>validateDataset(d),/aggregation/);
});
test('invariant checker detects corrupted event timing and target, not just happy paths',()=>{
 const rows=[bar(0,102,98,100),bar(1,101,95,98),bar(2,100,96,98),bar(3,99,94,95),bar(4,101,95,100)];
 const compute=r=>({swing:mapFalconSwingStructure(r),internal:mapFalconInternalStructure(r)}),before=compute(rows.slice(0,-1)),after=compute(rows);
 assert.equal(auditStep(before,after,rows.at(-1)).length,0);
 after.internal.events.at(-1).confirmedAt=99;
 const errors=auditStep(before,after,rows.at(-1));assert.ok(errors.some(e=>e.rule==='EVENT_INDEX_ORDER'));assert.ok(errors.some(e=>e.rule==='NO_SAME_BAR_MINOR'));
});
test('format example executes nonempty prefix checks and coherent phase output but stays synthetic',async()=>{
 const d=JSON.parse(await readFile('docs/examples/falcon-dataset.example.json','utf8')),r=validateShadow(d);
 assert.equal(r.REAL_DATA_VALIDATION,'NOT_RUN');
 for(const phase of ['CC','CP','PC','PP'])assert.ok(r.phaseExamples[phase].length>0);
 for(const f of Object.values(r.frames)){assert.ok(f.records.length>3);assert.deepEqual(f.prefixViolations,[]);assert.deepEqual(f.violations,[]);}
 for(const row of r.mtf)for(const position of ['LONG','SHORT']){
  const s=row.states['4H']?.swing,i=row.states['1H']?.internal;
  const direction=position==='LONG'?'BULLISH':'BEARISH';
  const expected=!s||!i||s==='TRANSITION'||i==='TRANSITION'?null:(s===direction?'P':'C')+(i===direction?'P':'C');
  assert.equal(row[position],expected);
 }
});
test('start-offset audit uses original bar indices and reports all applicable probes',()=>{
 const rows=Array.from({length:105},(_,i)=>bar(i,102+(i%7),90+(i%5),100));
 const r=auditFrame(rows,'1m');assert.deepEqual(r.sensitivity.map(s=>s.offset),[20,50,100]);
 assert.deepEqual(r.prefixViolations,[]);
 for(const s of r.sensitivity)assert.ok(s.lastMismatchIndex===null||s.lastMismatchIndex>=s.offset);
});
