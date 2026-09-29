import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildExport,loadExportChart,parseExportArgs} from '../scripts/export-falcon-market-data.mjs';
import {validateDataset} from '../scripts/falcon-realdata-validate.mjs';
const now=Date.parse('2026-09-22T00:00:00Z');
async function chart(){const d=JSON.parse(await readFile('docs/examples/falcon-dataset.example.json','utf8'));return {symbol:'005930',market:'KR',source:'Kiwoom REST API · 통합(SOR)',candles:d.timeframes['5m'],timeframes:d.timeframes};}
const options={symbol:'005930',market:'KR',days:60};
test('export allowlist excludes credential material at every response level',async()=>{
 const c=await chart(),secret={token:'SENSITIVE_SENTINEL',accountNumber:'SENSITIVE_SENTINEL',userId:'SENSITIVE_SENTINEL',cookie:'SENSITIVE_SENTINEL',authorization:'SENSITIVE_SENTINEL',apiKey:'SENSITIVE_SENTINEL',databaseCredentials:'SENSITIVE_SENTINEL'};
 Object.assign(c,secret);c.frameMetadata=secret;for(const bars of [c.candles,...Object.values(c.timeframes)])for(const b of bars)Object.assign(b,secret);
 const {dataset}=buildExport(c,options,now);assert.doesNotMatch(JSON.stringify(dataset),/SENSITIVE_SENTINEL|apiKey|token|accountNumber|userId|cookie|authorization|databaseCredentials/);
 assert.deepEqual(Object.keys(dataset).sort(),['symbol','source','timezone','generatedAt','capturedAt','frameMetadata','timeframes'].sort());
});
test('export retains production OHLCV and timestamps, passes validation, declares derived H4',async()=>{
 const c=await chart(),{dataset,coverage}=buildExport(c,options,now);validateDataset(dataset,now);
 for(const f of ['4H','1H','15m','5m','1m']){assert.deepEqual(dataset.timeframes[f],f==='5m'?c.candles:c.timeframes[f]);for(const b of dataset.timeframes[f])assert.deepEqual(Object.keys(b),['date','open','high','low','close','volume']);}
 assert.equal(dataset.frameMetadata['4H'].derived,true);assert.equal(dataset.frameMetadata['4H'].derivedFrom,'1H');assert.equal(dataset.frameMetadata['1m'].derived,false);assert.equal(coverage['1m'].requestedWindowCovered,false);
});
test('export rejects unsorted, duplicate, invalid or missing data rather than repairing it',async()=>{
 for(const mutate of [c=>c.candles.reverse(),c=>c.candles[1].date=c.candles[0].date,c=>c.candles[0].low=0,c=>delete c.timeframes['1m'],c=>c.symbol='NVDA']){const c=await chart();mutate(c);assert.throws(()=>buildExport(c,options,now));}
});
test('bridge export uses same market route and never falls back after failure',async()=>{
 let called=false;const data=await chart();const deps={isBridge:()=>true,bridge:async(path,query)=>{assert.equal(path,'/api/market');assert.equal(query.get('auto'),'1');assert.equal(query.get('symbol'),'005930');return Response.json(data);},direct:()=>{called=true;}};
 assert.deepEqual(await loadExportChart(options,deps,{}),data);assert.equal(called,false);
 deps.bridge=async()=>new Response('',{status:502});await assert.rejects(loadExportChart(options,deps,{}));assert.equal(called,false);
});
test('direct export reuses getMarketChart options including M1 and existing sessions',async()=>{
 const deps={isBridge:()=>false,direct:async(request,signal,m1,regular)=>{assert.equal(request.symbol,'005930');assert.equal(signal,undefined);assert.equal(m1,true);assert.equal(regular,false);return 'mock';}};
 assert.equal(await loadExportChart(options,deps,{KIWOOM_MODE:'real',APP_KEY:'mock',APP_SECRET:'mock'}),'mock');
 await assert.rejects(loadExportChart(options,deps,{}));await assert.rejects(loadExportChart(options,deps,{KIWOOM_MODE:'demo',APP_KEY:'mock',APP_SECRET:'mock'}));
});
test('export CLI validates symbol and bounded day window, defaults to ignored local path',()=>{
 const args=parseExportArgs(['--symbol','005930']);assert.equal(args.days,60);assert.equal(args.market,'KR');assert.ok(args.output.startsWith('data/falcon-validation/'));
 for(const a of [['--symbol','../../secret'],['--symbol','005930','--days','0'],['--symbol','005930','--days','Infinity'],['--token','secret']])assert.throws(()=>parseExportArgs(a));
 assert.equal(parseExportArgs(['--symbol','AAPL']).market,'US');
});
