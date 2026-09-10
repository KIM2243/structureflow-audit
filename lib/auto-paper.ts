import { mapMarketStructure, mechanicalInternalPivots } from './market-structure.ts';
import type { Candle } from './engine';

// A versioned, conservative LONG continuation experiment. No broker order API.
export const AUTO_VERSION = 'PP-H4-M15-M1-close-v1';
export type Zone = { low: number; high: number; at: number; id: string };
export type AutoConfig = { market: 'US'|'KR'; symbol: string; exchange: 'ND'|'NY'|'NA'; capital: number; riskPct: number; feeBps: number; slippageBps: number };
export type AutoFill = { id: string; side: 'BUY'|'SELL'; at: number; price: number; quantity: number; fee: number; reason: string; pnl: number; r: number; setupId: string; source: string; observedAt: number };
export type AutoState = {
  version: string; startedAt: number; cash: number; lastBar: number; lastChecked: number;
  stage: string; reason: string; source: string; mark: number; benchmarkStart: number;
  lastFreshAt?: number; chart?: Candle[];
  setup?: { id: string; zone: Zone; target: number; expires: number; touch?: number; m15?: Zone; retest?: number; m1?: Zone; used?: boolean };
  position?: { quantity: number; entry: number; fee: number; stop: number; target: number; at: number; risk: number; setupId: string };
  fills: AutoFill[]; audit: { at: number; stage: string; reason: string }[];
  closed: number; wins: number; netPnl: number; sumR: number; peak: number; maxDrawdown: number;
};
export type AutoFeed = { source: string; symbol: string; timeframes: { '1m'?: Candle[]; '15m': Candle[]; '1H': Candle[]; '4H': Candle[] }; price: number; observedAt: number };
export function newAutoState(config: AutoConfig, now: number): AutoState {
  return { version: AUTO_VERSION, startedAt: now, cash: config.capital, lastBar: now, lastChecked: 0, stage: 'WAIT_CONTEXT', reason: '4시간 상승 구조와 할인 구역 대기', source: '', mark: 0, benchmarkStart: 0, fills: [], audit: [], closed: 0, wins: 0, netPnl: 0, sumR: 0, peak: config.capital, maxDrawdown: 0 };
}
function status(s: AutoState, at: number, stage: string, reason: string) {
  if (s.stage !== stage || s.reason !== reason) s.audit.unshift({ at, stage, reason });
  s.audit = s.audit.slice(0, 100); s.stage = stage; s.reason = reason;
}
export function validBars(bars: Candle[]): boolean {
  return bars.every((b, i) => Number.isFinite(Date.parse(b.date)) && [b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite) && b.low > 0 && b.high >= Math.max(b.open,b.close,b.low) && b.low <= Math.min(b.open,b.close) && b.volume >= 0 && (!i || Date.parse(bars[i-1].date) < Date.parse(b.date)));
}
// Only bars followed by another bar and whose nominal duration elapsed are used.
// This deliberately defers shortened final-session H4 bars until the next session.
export function closedBars(bars: Candle[], minutes: number, at: number): Candle[] {
  return bars.filter((b,i) => i < bars.length - 1 && Date.parse(b.date) + minutes * 60_000 <= at);
}
function internalDirection(bars: Candle[]) {
  const pivots = mechanicalInternalPivots(bars);
  let direction = 0; let high = 0; let low = 0; let cursor = 0;
  for (let i=0; i<bars.length; i++) {
    while (cursor<pivots.length && (pivots[cursor].confirmedAt ?? Infinity)<i) {
      const p=pivots[cursor++]; if(p.kind==='high') high=p.price; else low=p.price;
    }
    if(high && bars[i].close>high) { direction=1; high=0; }
    else if(low && bars[i].close<low) { direction=-1; low=0; }
  }
  return direction;
}
export function qualifiedZone(bars: Candle[], minutes: number): { zone: Zone; target: number } | undefined {
  const m=mapMarketStructure(bars);
  if(m.trend!=='BULLISH' || !m.protectedLevel || !m.weakLevel || !m.range) return;
  const origin=bars[m.protectedLevel.index];
  const low=origin.low, high=Math.min(Math.max(origin.open,origin.close),m.range.equilibrium);
  const event=m.events.findLast(e=>e.kind==='BOS' && e.direction==='BULLISH');
  if(!event || high<=low || m.weakLevel.price<=high) return;
  const at=Math.max(Date.parse(bars[event.index].date),Date.parse(bars[m.range.confirmedAt].date))+minutes*60_000;
  return {zone:{low,high,at,id:`${minutes}:${origin.date}:${at}`},target:m.weakLevel.price};
}
export function shiftedZone(bars: Candle[], minutes: number, after: number, parent: Zone) {
  const m=mapMarketStructure(bars), event=m.events.at(-1);
  if(!event || event.direction!=='BULLISH') return;
  const at=Date.parse(bars[event.index].date)+minutes*60_000;
  if(at<=after) return;
  // A bullish CHoCH, or its following BOS, must originate after the parent touch.
  const reversal=m.events.findLast(e=>e.direction==='BULLISH' && e.kind==='CHOCH' && e.index<=event.index);
  if(!reversal || Date.parse(bars[reversal.index].date)+minutes*60_000<=after) return;
  const start=event.kind==='CHOCH' ? event.pivotIndex : reversal.index;
  let index=start;
  for(let i=start;i<=event.index;i++) if(bars[i].low<bars[index].low) index=i;
  const origin=bars[index], low=origin.low, high=Math.max(origin.open,origin.close);
  if(high<=low || low<parent.low || high>parent.high) return;
  return { low,high,at,id:`${minutes}:${origin.date}:${at}` };
}
export function entryTerms(price: number, stop: number, target: number, cash: number, config: AutoConfig) {
  if(![price,stop,target,cash,config.riskPct,config.feeBps,config.slippageBps].every(Number.isFinite) || !(stop>0&&stop<price&&price<target&&cash>0&&config.riskPct>0&&config.riskPct<=1&&config.feeBps>=0&&config.slippageBps>=0)) return {entry:0,unitRisk:0,quantity:0,rr:0};
  const fee=config.feeBps/10000, slip=config.slippageBps/10000;
  const entry=price*(1+slip), exitStop=stop*(1-slip), exitTarget=target*(1-slip);
  const unitRisk=entry-exitStop+(entry+exitStop)*fee;
  const reward=exitTarget-entry-(entry+exitTarget)*fee;
  const quantity=Math.floor(Math.min(cash*config.riskPct/100/unitRisk,cash/(entry*(1+fee))));
  return { entry, unitRisk, quantity, rr: reward/unitRisk };
}
export function exitPosition(s: AutoState, config: AutoConfig, price: number, at: number, reason: string, observedAt: number) {
  const p=s.position; if(!p) return;
  const execution=price*(1-config.slippageBps/10000), fee=execution*p.quantity*config.feeBps/10000;
  const pnl=(execution-p.entry)*p.quantity-p.fee-fee, r=pnl/p.risk;
  s.cash+=execution*p.quantity-fee; s.netPnl+=pnl; s.sumR+=r; s.closed++; if(pnl>0)s.wins++;
  s.fills.unshift({id:`${p.setupId}:SELL`,side:'SELL',at,price:execution,quantity:p.quantity,fee,reason,pnl,r,setupId:p.setupId,source:s.source,observedAt});
  delete s.position; if(s.setup)s.setup.used=true;
  status(s,observedAt,'CLOSED',reason);
}
export function advanceAuto(previous: AutoState, config: AutoConfig, feed: AutoFeed, now: number, enabled=true, closeRequested=false): AutoState {
  const s=structuredClone(previous); s.lastChecked=now;
  const one=feed.timeframes['1m'] || [];
  if(feed.symbol!==config.symbol || !feed.source.startsWith('Kiwoom REST API') || [one,feed.timeframes['15m'],feed.timeframes['1H'],feed.timeframes['4H']].some(b=>b.length<20 || !validBars(b))) {
    status(s,now,'DATA_WAIT','동일 종목의 키움 1분·15분·1시간·4시간 원본 데이터 대기'); return s;
  }
  const latest=Date.parse(one.at(-1)!.date);
  if(latest>now || now-latest>120_000 || now-feed.observedAt>30_000 || feed.observedAt>now || !Number.isFinite(feed.price) || feed.price<=0) {
    status(s,now,'DATA_WAIT','장 마감 또는 지연 시세: 새 체결 보류'); return s;
  }
  if(!s.position && ((s.lastFreshAt && now-s.lastFreshAt>180000) || (s.source && s.source!==feed.source))) delete s.setup;
  s.lastFreshAt=now;s.chart=one.slice(-90);
  s.source=feed.source; s.mark=feed.price; if(!s.benchmarkStart)s.benchmarkStart=feed.price;
  const h4=closedBars(feed.timeframes['4H'],240,now), h1=closedBars(feed.timeframes['1H'],60,now);
  const context=qualifiedZone(h4,240);
  const m1=closedBars(one,1,now);
  const newBars=m1.filter(b=>Date.parse(b.date)+60_000>s.lastBar);
  // Never backfill entries. Exit barriers on bars wholly after entry are conservative;
  // simultaneous stop+target selects stop, gap through stop executes at worse open.
  if(s.position) {
    for(const b of newBars) {
      if(Date.parse(b.date)<s.position.at) continue;
      const p=s.position;
      if(b.low<=p.stop) { exitPosition(s,config,Math.min(b.open,p.stop),Date.parse(b.date)+60_000,'구조 손절 (동일 봉 양방향 도달 시 손절 우선)',now); break; }
      if(b.high>=p.target) { exitPosition(s,config,p.target,Date.parse(b.date)+60_000,'4시간 약한 고점 목표 도달',now); break; }
    }
    if(s.position && (closeRequested || feed.price<=s.position.stop || feed.price>=s.position.target || mapMarketStructure(h4).trend!=='BULLISH'))
      exitPosition(s,config,feed.price,now,closeRequested?'사용자 청산 요청':feed.price<=s.position.stop?'구조 손절':feed.price>=s.position.target?'목표 도달':'4시간 상승 구조 무효화',now);
  }
  s.lastBar=Math.max(s.lastBar,Date.parse(m1.at(-1)?.date||'')+60_000||0);
  if(s.position) { status(s,now,'HOLDING','보유 중 · 고정 손절·목표 및 4시간 구조 감시'); return markEquity(s); }
  if(!enabled || closeRequested) { status(s,now,'PAUSED','신규 진입 중지'); return markEquity(s); }
  if(s.closed>=500) {status(s,now,'COMPLETE','500건 실험 완료 · 결과 검토 후 새 모델로 진행');return markEquity(s);}
  if(!context) { delete s.setup; status(s,now,'WAIT_CONTEXT','4시간 상승 BOS와 확정 할인 구역 대기'); return markEquity(s); }
  if(s.setup && s.setup.id!==context.zone.id) delete s.setup;
  if(!s.setup) s.setup={id:context.zone.id,zone:context.zone,target:context.target,expires:now+7*86400000};
  const setup=s.setup;
  if(s.fills.some(f=>f.setupId===setup.id))setup.used=true;
  if(setup.used) { status(s,now,'WAIT_NEW_SETUP','같은 설정 재진입 금지 · 새 4시간 구조 대기'); return markEquity(s); }
  const invalidZone=setup.m1||setup.m15||setup.zone;
  if(now>setup.expires || (m1.at(-1) && m1.at(-1)!.close<invalidZone.low)) {setup.used=true;status(s,now,'INVALIDATED','기원 구역 종가 이탈 또는 설정 유효시간 종료');return markEquity(s);}
  if(setup.m1) {const last=mapMarketStructure(m1).events.at(-1);if(last?.direction==='BEARISH' && Date.parse(m1[last.index].date)+60000>setup.m1.at){setup.used=true;status(s,now,'INVALIDATED','진입 전 1분 구조가 하락 전환');return markEquity(s);}}
  const inside=(z:Zone)=>feed.price>=z.low && feed.price<=z.high;
  if(!setup.touch) {
    if(inside(setup.zone) && now>setup.zone.at) {setup.touch=now;status(s,now,'WAIT_M15_SHIFT','4시간 할인 구역 접촉 확인 · 이후 15분 상승 전환 대기');}
    else status(s,now,'WAIT_H4_TOUCH','4시간 할인 구역 실제 시세 접촉 대기');
    return markEquity(s);
  }
  if(!setup.m15) {
    setup.m15=shiftedZone(closedBars(feed.timeframes['15m'],15,now),15,setup.touch,setup.zone);
    status(s,now,setup.m15?'WAIT_M15_RETEST':'WAIT_M15_SHIFT',setup.m15?'15분 상승 전환 확인 · 기원 구역 재접촉 대기':'접촉 이후 15분 종가 전환·구역 확정 대기'); return markEquity(s);
  }
  if(!setup.retest) {
    if(inside(setup.m15) && now>setup.m15.at) setup.retest=now;
    status(s,now,setup.retest?'WAIT_M1_SHIFT':'WAIT_M15_RETEST',setup.retest?'15분 재접촉 확인 · 이후 1분 상승 전환 대기':'15분 기원 구역 재접촉 대기'); return markEquity(s);
  }
  if(!setup.m1) {
    setup.m1=shiftedZone(m1,1,setup.retest,setup.m15);
    status(s,now,setup.m1?'WAIT_ENTRY':'WAIT_M1_SHIFT',setup.m1?'1분 상승 전환 확인 · 정제 구역 재접촉 대기':'15분 재접촉 이후 1분 종가 전환 대기'); return markEquity(s);
  }
  if(now-setup.m1.at>30*60000) {setup.used=true;status(s,now,'EXPIRED','1분 진입 대기 30분 만료');return markEquity(s);}
  if(internalDirection(h1)!==1) {status(s,now,'WAIT_PP','1시간 내부 상승 동행(PP) 대기');return markEquity(s);}
  const buffer=setup.m1.low*0.001; // explicit experimental policy, not an exchange tick rule
  const stop=setup.m1.low-buffer;
  const terms=entryTerms(feed.price,stop,setup.target,s.cash,config);
  if(!inside(setup.m1) || now<=setup.m1.at || !(terms.rr>=2) || terms.quantity<1) {
    status(s,now,'WAIT_ENTRY','1분 구역 재접촉·비용 차감 2R·위험 한도 확인 중');return markEquity(s);
  }
  const fee=terms.entry*terms.quantity*config.feeBps/10000;
  s.cash-=terms.entry*terms.quantity+fee;
  s.position={quantity:terms.quantity,entry:terms.entry,fee,stop,target:setup.target,at:now,risk:terms.unitRisk*terms.quantity,setupId:setup.id};
  s.fills.unshift({id:`${setup.id}:BUY`,side:'BUY',at:now,price:terms.entry,quantity:terms.quantity,fee,reason:'H4 할인 접촉 → M15 전환·재접촉 → M1 전환·재접촉 + H1 PP + 순 2R',pnl:0,r:0,setupId:setup.id,source:s.source,observedAt:feed.observedAt});
  setup.used=true; status(s,now,'HOLDING','조건 충족 · 현재 관측 시세로 모의 매수'); return markEquity(s);
}
function markEquity(s:AutoState) { const equity=s.cash+(s.position?s.position.quantity*s.mark:0);s.peak=Math.max(s.peak,equity);s.maxDrawdown=Math.max(s.maxDrawdown,(s.peak-equity)/s.peak*100); return s; }
