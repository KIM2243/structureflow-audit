import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getMarketChart} from '../lib/kiwoom.ts';
import {fetchFromKiwoomBridge,isKiwoomBridgeConfigured} from '../lib/bridge.ts';
import {validateDataset} from './falcon-realdata-validate.mjs';

export function parseExportArgs(args){
 const options={days:60};
 for(let i=0;i<args.length;i+=2){const key=args[i];if(!['--symbol','--market','--exchange','--days','--output'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid arguments');options[key.slice(2)]=args[i+1];}
 options.days=Number(options.days);options.market??=/^\d{6}$/.test(options.symbol??'')?'KR':'US';options.exchange??='ND';
 if(!['KR','US'].includes(options.market)||!(options.market==='KR'?/^\d{6}$/:/^[A-Z][A-Z0-9.-]{0,9}$/).test(options.symbol??'')||!['NA','ND','NY'].includes(options.exchange)||!Number.isInteger(options.days)||options.days<1||options.days>3650)throw Error('Invalid symbol/market/exchange/days');
 options.output??=`data/falcon-validation/${options.market}-${options.symbol}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
 return options;
}

// Exact allowlist: never spread provider responses, metadata, headers or candles.
export function buildExport(chart,options,now=Date.now()){
 const {symbol,market,days}=parseExportArgs(['--symbol',options.symbol,'--market',options.market,'--days',String(options.days??60)]);
 if(chart?.symbol!==symbol||chart.market!==market||typeof chart.source!=='string'||!chart.source.startsWith('Kiwoom REST API'))throw Error('Unexpected provider identity');
 const raw={'4H':chart.timeframes?.['4H'],'1H':chart.timeframes?.['1H'],'15m':chart.timeframes?.['15m'],'5m':chart.candles,'1m':chart.timeframes?.['1m'],...(chart.timeframes?.['1D']?{'1D':chart.timeframes['1D']}:{})};
 const timeframes=Object.fromEntries(Object.entries(raw).map(([frame,bars])=>{
  if(!Array.isArray(bars))throw Error('Missing timeframe');
  return [frame,bars.map(b=>({date:b.date,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume}))];
 }));
 const frameMetadata=Object.fromEntries(Object.keys(timeframes).map(frame=>[frame,frame==='4H'?{derived:true,derivedFrom:'1H',aggregation:'Existing lib/kiwoom.ts toFourHourCandles: session-local date groups, consecutive groups of up to four H1 candles; final short group retained'}:{derived:false}]));
 const dataset={symbol,source:'KIWOOM',timezone:market==='KR'?'Asia/Seoul':'America/New_York',generatedAt:new Date(now).toISOString(),capturedAt:new Date(now).toISOString(),frameMetadata,timeframes};
 // Check ALL returned rows before applying the requested date window.
 validateDataset(dataset,now);
 const cutoff=now-days*86400000;
 dataset.timeframes=Object.fromEntries(Object.entries(timeframes).map(([frame,bars])=>[frame,bars.filter(b=>Date.parse(b.date)>=cutoff)]));
 const validation=validateDataset(dataset,now);
 const coverage=Object.fromEntries(Object.entries(dataset.timeframes).map(([frame,bars])=>[frame,{count:bars.length,start:bars[0].date,end:bars.at(-1).date,spanDays:(Date.parse(bars.at(-1).date)-Date.parse(bars[0].date))/86400000,requestedCalendarDays:days,requestedWindowCovered:Date.parse(timeframes[frame][0].date)<=cutoff}]));
 return {dataset,coverage,warnings:validation.warnings};
}

export async function loadExportChart(options,dependencies={isBridge:isKiwoomBridgeConfigured,bridge:fetchFromKiwoomBridge,direct:getMarketChart},env=process.env){
 const request={market:options.market,symbol:options.symbol,...(options.market==='US'?{exchange:options.exchange}:{})};
 if(dependencies.isBridge()){
  const response=await dependencies.bridge('/api/market',new URLSearchParams({...request,auto:'1'}));
  if(!response.ok)throw Error('Existing bridge unavailable');
  return response.json();
 }
 // Deliberately refuse demo mode for an actual-market export.
 if(env.KIWOOM_MODE!=='real'||!env.APP_KEY||!env.APP_SECRET)throw Error('Real Kiwoom configuration unavailable');
 return dependencies.direct(request,undefined,true,false);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const options=parseExportArgs(process.argv.slice(2));
  const chart=await loadExportChart(options);
  const {dataset,coverage,warnings}=buildExport(chart,options);
  await mkdir(dirname(options.output),{recursive:true});
  await writeFile(options.output,JSON.stringify(dataset,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({output:options.output,coverage,warnings,limit:'Existing provider route only; up to 800 candles/frame; no extra pagination. Missing 60-day coverage is not filled.'}));
 }catch{
  // Never echo provider exception bodies, URLs, headers or credential material.
  console.error('EXPORT_FAILED: check arguments, real Kiwoom/bridge configuration, provider availability, OHLCV coverage and whether the output already exists. No credentials are logged.');process.exitCode=1;
 }
}
