import { env } from 'cloudflare:workers';
import { advanceAuto, newAutoState, recordAutoDecision, type AutoConfig, type AutoState } from './auto-paper';
import { fetchFromKiwoomBridge } from './bridge';
import type { KiwoomChart, KiwoomQuote } from './kiwoom';

type Row={id:string;user_id:string;instrument:string;config:string;state:string;enabled:number;has_position:number;close_requested:number;revision:number;checked_at:number};
const view=(r:Row)=>({id:r.id,instrument:r.instrument,config:JSON.parse(r.config) as AutoConfig,state:JSON.parse(r.state) as AutoState,enabled:!!r.enabled,closeRequested:!!r.close_requested,revision:r.revision});
export async function autoRuntime() {
  const row=await env.DB.prepare("SELECT heartbeat_at FROM auto_paper_runtime WHERE id='runner'").first<{heartbeat_at:number}>();
  return {ready:!!row && Date.now()-row.heartbeat_at<180000,heartbeatAt:row?.heartbeat_at||0};
}
export async function listAutoRuns(userId:string) {
  const rows=await env.DB.prepare('SELECT * FROM auto_paper_runs WHERE user_id=? ORDER BY created_at').bind(userId).all<Row>();
  return rows.results.map(view);
}
export async function createAutoRun(userId:string,config:AutoConfig) {
  if(!(await autoRuntime()).ready)throw new Error('자동 실행 서버 연결을 기다리고 있습니다.');
  const instrument=`${config.market}:${config.exchange}:${config.symbol}`, now=Date.now();
  await env.DB.prepare(`INSERT INTO auto_paper_runs(id,user_id,instrument,config,state,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM auto_paper_runs WHERE user_id=?)<6 ON CONFLICT(user_id,instrument) DO NOTHING`).bind(crypto.randomUUID(),userId,instrument,JSON.stringify(config),JSON.stringify(newAutoState(config,now)),now,userId).run();
  return listAutoRuns(userId);
}
export async function controlAutoRun(userId:string,id:string,action:'pause'|'resume'|'close') {
  const row=await env.DB.prepare('SELECT * FROM auto_paper_runs WHERE id=? AND user_id=?').bind(id,userId).first<Row>();
  if(!row)throw new Error('실험 계좌를 찾을 수 없습니다.');
  const state=JSON.parse(row.state) as AutoState;
  if(action==='resume' && !state.position) { delete state.setup;state.lastBar=Date.now();state.reason='재개 시점 이후 새 조건 대기';state.stage='WAIT_CONTEXT'; }
  const result=await env.DB.prepare('UPDATE auto_paper_runs SET enabled=?,close_requested=?,state=?,revision=revision+1 WHERE id=? AND user_id=? AND revision=?').bind(action==='resume'?1:0,action==='close'?1:0,JSON.stringify(state),id,userId,row.revision).run();
  if(!result.meta.changes)throw new Error('시세 처리 중입니다. 잠시 후 다시 시도하세요.');
  return listAutoRuns(userId);
}
export async function runAutoTick() {
  await env.DB.prepare("INSERT INTO auto_paper_runtime(id,heartbeat_at) VALUES('runner',?) ON CONFLICT(id) DO UPDATE SET heartbeat_at=excluded.heartbeat_at").bind(Date.now()).run();
  // One oldest account per tick bounds the Worker request and serializes no I/O globally.
  const row=await env.DB.prepare(`SELECT r.* FROM auto_paper_runs r JOIN users u ON u.id=r.user_id WHERE u.status='active' AND (r.enabled=1 OR r.has_position=1) AND r.checked_at<? ORDER BY r.checked_at LIMIT 1`).bind(Date.now()-15000).first<Row>();
  if(!row)return {checked:0};
  const config=JSON.parse(row.config) as AutoConfig, previous=JSON.parse(row.state) as AutoState;
  let state:AutoState;
  try {
    const query=new URLSearchParams({market:config.market,symbol:config.symbol,exchange:config.exchange,auto:'1'});
    const response=await fetchFromKiwoomBridge('/api/market',query);
    if(!response.ok)throw new Error('차트 원본 응답 대기');
    const chart=await response.json() as KiwoomChart;
    const key=config.market==='KR'?`KR:${config.symbol}`:`US:${config.exchange}:${config.symbol}`;
    const qres=await fetchFromKiwoomBridge('/api/quotes',new URLSearchParams({items:key}));
    if(!qres.ok)throw new Error('현재 시세 응답 대기');
    const q=await qres.json() as {quotes:KiwoomQuote[]};
    const quote=q.quotes.find(x=>x.key===key && x.status==='ok');
    if(!quote)throw new Error('같은 종목의 현재가 대기');
    state=advanceAuto(previous,config,{source:chart.source,symbol:chart.symbol,timeframes:chart.timeframes,price:quote.price,observedAt:Date.parse(quote.timestamp)},Date.now(),!!row.enabled,!!row.close_requested);
  } catch {
    const now=Date.now();
    state=recordAutoDecision(previous,{...previous,lastChecked:now,stage:'DATA_WAIT',reason:'원본 시세 연결 대기 · 신규 체결 보류'},config,now);
  }
  // Compare-and-swap makes concurrent ticks/control requests idempotent. All fills,
  // cash, barriers and sequence milestones commit in the same atomic row update.
  const result=await env.DB.prepare('UPDATE auto_paper_runs SET state=?,has_position=?,checked_at=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(state),state.position?1:0,Date.now(),row.id,row.revision).run();
  return {checked:result.meta.changes?1:0};
}
