import {readFile,writeFile,rename,mkdir,readdir,stat,unlink,statfs} from 'node:fs/promises';
import os from 'node:os';
import {UNIVERSE,LIMITS,localParts,dueSession,resourceSafe,closingMinute} from '../lib/scan-policy.mjs';
import {evaluateScanChart} from '../lib/scan-evaluate.ts';
import {structureSnapshot} from '../lib/engine.ts';
import {validBars} from '../lib/auto-paper.ts';
const dir=process.env.SCAN_REPORT_DIR||'/var/lib/structureflow-scan';
const token=process.env.KIWOOM_BRIDGE_TOKEN;
if(!token)throw new Error('Scanner credential missing');
await mkdir(dir,{recursive:true});
const started=Date.now(),deadline=started+LIMITS.minutes*60000;
async function guard(){const mem=await readFile('/proc/meminfo','utf8'),available=Number(/MemAvailable:\s+(\d+)/.exec(mem)?.[1]||0)/1024,fs=await statfs(dir);if(Date.now()>deadline||!resourceSafe({availableMiB:available,freeBytes:fs.bavail*fs.bsize,load:os.loadavg()[0]}))throw new Error('RESOURCE_PAUSED');}
async function fetchData(item,kind){await guard();const u=new URL('http://127.0.0.1:8790/api/scan-source');u.search=new URLSearchParams({market:item.market,symbol:item.symbol,kind}).toString();const r=await fetch(u,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(Math.min(95000,deadline-Date.now()))});if(!r.ok)throw new Error(`DATA_${r.status}`);return r.json();}
async function persist(report){const files=(await readdir(dir)).filter(n=>/^report-(KR|US)-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();while(files.length>=LIMITS.reports)await unlink(`${dir}/${files.shift()}`);const sizes=await Promise.all((await readdir(dir)).map(async n=>(await stat(`${dir}/${n}`)).size));if(sizes.reduce((a,b)=>a+b,0)>LIMITS.storageBytes)throw new Error('REPORT_STORAGE_LIMIT');const body=JSON.stringify(report);if(Buffer.byteLength(body)>128*1024)throw new Error('REPORT_SIZE_LIMIT');for(const name of [`report-${report.market}-${report.date}.json`,`latest-${report.market}.json`]){await writeFile(`${dir}/${name}.tmp`,body,{mode:0o640});await rename(`${dir}/${name}.tmp`,`${dir}/${name}`);}}
for(const market of ['KR','US']){
 let session=dueSession(market);
 // Installation verification can explicitly run the most recent completed same-day close.
 if(process.argv.includes(`--once=${market}`)){const p=localParts(Date.now(),market),close=closingMinute(market,p.date);if(p.minute>=close+10&&!['Sat','Sun'].includes(p.weekday))session={...p,close,closeAt:Date.now()-(p.minute-close)*60000-(Date.now()%60000)};}
 if(!session)continue;
 let old;try{old=JSON.parse(await readFile(`${dir}/latest-${market}.json`,'utf8'));}catch{}
 if(old?.date===session.date&&(old.status==='complete'||old.attempts>=3))continue;
 const report={version:1,market,date:session.date,closeAt:new Date(session.closeAt).toISOString(),generatedAt:new Date().toISOString(),status:'complete',attempts:old?.date===session.date?(old.attempts||0)+1:1,screened:0,analyzed:0,stale:0,errors:[],candidates:[],coverage:'고정 20종목 · 일봉 사전선별 후 최대 6종목 공통 거래 계획 분석',note:'본장 마감 후 수집한 참고 후보입니다. 마감 직후 데이터 확정 지연·시간외 반영 가능성이 있으므로 다음 장 진입 전 다시 확인하세요.'};
 try{
  const shortlist=[];
  for(const item of UNIVERSE[market].slice(0,LIMITS.universe)){
   try{const bars=await fetchData(item,'daily');report.screened++;
    if(!Array.isArray(bars)||!validBars(bars)||bars.length<40)throw new Error('INVALID_DAILY');
    const latest=bars.at(-1);if(localParts(Date.parse(latest.date),market).date!==session.date){report.stale++;continue;}
    const trend=structureSnapshot(bars).trend;if(!['BULLISH','BEARISH'].includes(trend))continue;
    const recent=bars.slice(-20),volume=recent.reduce((s,b)=>s+b.volume,0)/recent.length;
    if(!volume||latest.volume<=0)continue;
    // Liquidity preselection only, never a profitability/confidence score.
    shortlist.push({item,liquidity:volume*latest.close});
   }catch(e){if(e.message==='RESOURCE_PAUSED')throw e;report.errors.push({symbol:item.symbol,reason:e.message});}
  }
  for(const {item} of shortlist.sort((a,b)=>b.liquidity-a.liquidity).slice(0,LIMITS.detailed)){
   try{const chart=await fetchData(item,'chart');const latest=chart.timeframes?.['1m']?.filter(b=>Date.parse(b.date)<session.closeAt).at(-1);
    if(!latest||session.closeAt-Date.parse(latest.date)>5*60000)throw new Error('마감 부근 1분봉 부족');
    const result=evaluateScanChart(chart,session.closeAt);report.analyzed++;
    if(result.plan.direction!=='NEUTRAL'&&result.plan.interest)report.candidates.push({...item,...result});
   }catch(e){if(e.message==='RESOURCE_PAUSED')throw e;report.errors.push({symbol:item.symbol,reason:e.message});}
  }
  report.candidates.sort((a,b)=>Number(b.plan.ready)-Number(a.plan.ready)||(a.distance??Infinity)-(b.distance??Infinity));
  if(report.errors.length)report.status='partial';
  if(report.stale===report.screened&&report.screened>0)report.status='no_session';
 }catch(e){report.status=e.message==='RESOURCE_PAUSED'?'resource_paused':'failed';report.errors.push({symbol:'SYSTEM',reason:e.message});}
 await persist(report);console.log(JSON.stringify({market,date:report.date,status:report.status,screened:report.screened,analyzed:report.analyzed,candidates:report.candidates.length}));
}
