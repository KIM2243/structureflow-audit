import { mapMarketStructure, mechanicalInternalPivots } from './market-structure.ts';
import type { Candle } from './engine';

// Paper-only continuation experiment. Grade weights and partial exits are policy, not lecture formulas.
export const AUTO_VERSION = 'PP-H4-M15-M1-long-short-partial-v2';
export type Direction = 'LONG' | 'SHORT';
export type ZoneGrade = { grade: 'A'|'B'|'C'; score: number; maximum: number; reasons: string[]; retests: number };
export type Zone = { low: number; high: number; at: number; id: string; quality?: ZoneGrade };
export type AutoConfig = { market: 'US'|'KR'; symbol: string; exchange: 'ND'|'NY'|'NA'; capital: number; riskPct: number; feeBps: number; slippageBps: number };
export type AutoFill = { id: string; side: 'BUY'|'SELL'; direction?: Direction; action?: 'ENTRY'|'PARTIAL'|'EXIT'; model?: string; at: number; price: number; quantity: number; fee: number; reason: string; pnl: number; r: number; setupId: string; source: string; observedAt: number };
export type AutoDecision = {
  replayKey?: string; replayError?: string;
  at: number; model: string; stage: string; reason: string; symbol: string;
  source: string; observedAt: number | null; price: number | null;
  config: AutoConfig; setup?: AutoState['setup']; position?: AutoState['position'];
  bars: { timeframe: string; received: number; completed: number; lastCompleted: string | null }[];
  checks?: { insideM1: boolean; afterM1: boolean; quantity: number; stop: number; target: number; netTargetR: number; weightedR: number; h1Direction: number };
  fills: AutoFill[];
};
export type AutoState = {
  version: string; startedAt: number; cash: number; lastBar: number; lastChecked: number;
  stage: string; reason: string; source: string; mark: number; benchmarkStart: number;
  lastFreshAt?: number; chart?: Candle[];
  decisions?: AutoDecision[];
  setup?: { id: string; direction?: Direction; zone: Zone; target: number; expires: number; touch?: number; m15?: Zone; retest?: number; m1?: Zone; used?: boolean };
  position?: { direction?: Direction; quantity: number; entry: number; fee: number; stop: number; target: number; at: number; risk: number; setupId: string; partialTarget?: number; partialQuantity?: number; partialDone?: boolean; realized?: number };
  fills: AutoFill[]; audit: { at: number; stage: string; reason: string }[];
  closed: number; wins: number; netPnl: number; sumR: number; peak: number; maxDrawdown: number;
};
export type AutoFeed = { source: string; symbol: string; timeframes: { '1m'?: Candle[]; '15m': Candle[]; '1H': Candle[]; '4H': Candle[] }; price: number; observedAt: number };
export function newAutoState(config: AutoConfig, now: number): AutoState {
  return { version: AUTO_VERSION, startedAt: now, cash: config.capital, lastBar: now, lastChecked: 0, stage: 'WAIT_CONTEXT', reason: '4시간 수요·공급 구역과 롱·숏 PP 조건 대기', source: '', mark: 0, benchmarkStart: 0, fills: [], audit: [], closed: 0, wins: 0, netPnl: 0, sumR: 0, peak: config.capital, maxDrawdown: 0 };
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
export function internalDirection(bars: Candle[]) {
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
export function gradeZone(bars: Candle[], zone: Zone, direction: Direction, minutes: number, nested=false): ZoneGrade {
  const width=zone.high-zone.low;
  const later=bars.filter(b=>Date.parse(b.date)+minutes*60000>zone.at);
  let retests=0, touching=false;
  for(const b of later) { const hit=b.low<=zone.high&&b.high>=zone.low; if(hit&&!touching)retests++; touching=hit; }
  const displacement=bars.filter(b=>Date.parse(b.date)+minutes*60000<=zone.at).slice(-3).some(b=>
    direction==='LONG'?b.close-zone.high>=width*1.5:zone.low-b.close>=width*1.5);
  const reasons=['확정 구조 돌파 +1','상위 범위의 유리한 반구간 +1',
    displacement?'구역 폭 1.5배 이상 이탈 +1':'구역 폭 1.5배 이탈 미확인 +0',
    retests===0?'확정 후 재접촉 없음 +1':`확정 후 재접촉 ${retests}회 +0`,
    retests<=1?'재접촉 1회 이하 +1':'반복 재접촉 +0'];
  if(nested)reasons.push('상위 구역 안에 포함 +1');
  const score=2+Number(displacement)+Number(retests===0)+Number(retests<=1)+Number(nested);
  return {grade:score>=4?'A':score>=3?'B':'C',score,maximum:nested?6:5,reasons,retests};
}
export function qualifiedZone(bars: Candle[], minutes: number): { zone: Zone; target: number; direction: Direction } | undefined {
  const m=mapMarketStructure(bars);
  if(!['BULLISH','BEARISH'].includes(m.trend) || !m.protectedLevel || !m.weakLevel || !m.range) return;
  const direction:Direction=m.trend==='BULLISH'?'LONG':'SHORT', long=direction==='LONG';
  const origin=bars[m.protectedLevel.index];
  const low=long?origin.low:Math.max(Math.min(origin.open,origin.close),m.range.equilibrium);
  const high=long?Math.min(Math.max(origin.open,origin.close),m.range.equilibrium):origin.high;
  const event=m.events.findLast(e=>e.kind==='BOS' && e.direction===m.trend);
  if(!event || high<=low || (long?m.weakLevel.price<=high:m.weakLevel.price>=low)) return;
  const at=Math.max(Date.parse(bars[event.index].date),Date.parse(bars[m.range.confirmedAt].date))+minutes*60_000;
  const zone:Zone={low,high,at,id:`${minutes}:${origin.date}:${at}`};
  zone.quality=gradeZone(bars,zone,direction,minutes);
  return {zone,target:m.weakLevel.price,direction};
}
export function shiftedZone(bars: Candle[], minutes: number, after: number, parent: Zone, direction:Direction='LONG') {
  const long=direction==='LONG', trend=long?'BULLISH':'BEARISH';
  const m=mapMarketStructure(bars), event=m.events.at(-1);
  if(!event || event.direction!==trend) return;
  const at=Date.parse(bars[event.index].date)+minutes*60_000;
  if(at<=after) return;
  // A bullish CHoCH, or its following BOS, must originate after the parent touch.
  const reversal=m.events.findLast(e=>e.direction===trend && e.kind==='CHOCH' && e.index<=event.index);
  if(!reversal || Date.parse(bars[reversal.index].date)+minutes*60_000<=after) return;
  const start=event.kind==='CHOCH' ? event.pivotIndex : reversal.index;
  let index=start;
  for(let i=start;i<=event.index;i++) if(long?bars[i].low<bars[index].low:bars[i].high>bars[index].high) index=i;
  const origin=bars[index], low=long?origin.low:Math.min(origin.open,origin.close), high=long?Math.max(origin.open,origin.close):origin.high;
  if(high<=low || low<parent.low || high>parent.high) return;
  const zone:Zone={low,high,at,id:`${minutes}:${origin.date}:${at}`};
  // Nesting is observed here; the parent already provides the location qualification.
  zone.quality=gradeZone(bars,zone,direction,minutes,true);
  return zone;
}
export function entryTerms(price: number, stop: number, target: number, cash: number, config: AutoConfig, direction:Direction='LONG') {
  const d=direction==='LONG'?1:-1;
  if(![price,stop,target,cash,config.riskPct,config.feeBps,config.slippageBps].every(Number.isFinite) || !(Math.min(stop,target,price)>0&&d*(price-stop)>0&&d*(target-price)>0&&cash>0&&config.riskPct>0&&config.riskPct<=1&&config.feeBps>=0&&config.slippageBps>=0&&config.slippageBps<10000&&config.feeBps<10000)) return {entry:0,unitRisk:0,quantity:0,rr:0};
  const fee=config.feeBps/10000, slip=config.slippageBps/10000;
  const entry=price*(1+d*slip), exitStop=stop*(1-d*slip), exitTarget=target*(1-d*slip);
  const unitRisk=d*(entry-exitStop)+(entry+exitStop)*fee;
  const reward=d*(exitTarget-entry)-(entry+exitTarget)*fee;
  const quantity=Math.floor(Math.min(cash*config.riskPct/100/unitRisk,cash/(entry*(1+fee))));
  return { entry, unitRisk, quantity, rr: reward/unitRisk };
}
export function exitPosition(s: AutoState, config: AutoConfig, price: number, at: number, reason: string, observedAt: number, quantity?: number) {
  const p=s.position; if(!p) return;
  const direction=p.direction||'LONG', d=direction==='LONG'?1:-1;
  const qty=Math.min(p.quantity,quantity??p.quantity); if(!Number.isInteger(qty)||qty<=0)return;
  const partial=qty<p.quantity;
  const execution=price*(1-d*config.slippageBps/10000), fee=execution*qty*config.feeBps/10000;
  const entryFee=p.fee*qty/p.quantity, pnl=d*(execution-p.entry)*qty-entryFee-fee, r=pnl/p.risk;
  // Fully funded paper shorts: release reserved entry notional plus trading P&L.
  s.cash+=(p.entry+d*(execution-p.entry))*qty-fee; s.netPnl+=pnl;
  s.fills.unshift({id:`${p.setupId}:${partial?'PARTIAL':'EXIT'}`,side:d===1?'SELL':'BUY',direction,action:partial?'PARTIAL':'EXIT',model:s.version,at,price:execution,quantity:qty,fee,reason,pnl,r,setupId:p.setupId,source:s.source,observedAt});
  p.realized=(p.realized||0)+pnl;
  if(partial) {p.quantity-=qty;p.fee-=entryFee;p.partialDone=true;return;}
  s.sumR+=p.realized/p.risk;s.closed++;if(p.realized>0)s.wins++;
  delete s.position; if(s.setup)s.setup.used=true;
  status(s,observedAt,'CLOSED',reason);
}
export function recordAutoDecision(previous: AutoState, s: AutoState, config: AutoConfig, now: number, feed?: AutoFeed): AutoState {
  const fills=s.fills.filter(f=>!previous.fills.some(old=>old.id===f.id));
  const latest=previous.decisions?.[0];
  // Capture transitions and one sample per minute, without growing every poll.
  if(latest && latest.stage===s.stage && latest.reason===s.reason && latest.setup?.id===s.setup?.id && !fills.length && Math.floor(latest.at/60000)===Math.floor(now/60000))return s;
  const bars=feed?Object.entries(feed.timeframes).map(([timeframe,rows])=>{
    const minutes=({'1m':1,'15m':15,'1H':60,'4H':240} as Record<string,number>)[timeframe];
    const completed=closedBars(rows||[],minutes,now);
    return {timeframe,received:rows?.length||0,completed:completed.length,lastCompleted:completed.at(-1)?.date||null};
  }):[];
  let checks:AutoDecision['checks'];
  if(feed && s.stage!=='DATA_WAIT' && s.setup?.m1) {
    const z=s.setup.m1, direction=s.setup.direction||'LONG', stop=direction==='LONG'?z.low*.999:z.high*1.001;
    const terms=entryTerms(feed.price,stop,s.setup.target,previous.cash,config,direction);
    const partial=s.version===AUTO_VERSION?Math.floor(terms.quantity/2):0;
    checks={insideM1:feed.price>=z.low&&feed.price<=z.high,afterM1:now>z.at,quantity:terms.quantity,stop,target:s.setup.target,netTargetR:terms.rr,weightedR:terms.quantity?(partial+(terms.quantity-partial)*terms.rr)/terms.quantity:0,h1Direction:internalDirection(closedBars(feed.timeframes['1H'],60,now))};
  }
  const decision:AutoDecision={at:now,model:s.version,stage:s.stage,reason:s.reason,symbol:config.symbol,config:structuredClone(config),source:feed?.source||'',observedAt:feed&&Number.isFinite(feed.observedAt)?feed.observedAt:null,price:feed&&Number.isFinite(feed.price)?feed.price:null,bars,checks,setup:structuredClone(s.setup),position:structuredClone(s.position),fills:structuredClone(fills)};
  s.decisions=[decision,...(previous.decisions||[])].slice(0,200);
  return s;
}
export function advanceAuto(previous: AutoState, config: AutoConfig, feed: AutoFeed, now: number, enabled=true, closeRequested=false): AutoState {
  return recordAutoDecision(previous,advanceAutoCore(previous,config,feed,now,enabled,closeRequested),config,now,feed);
}
function advanceAutoCore(previous: AutoState, config: AutoConfig, feed: AutoFeed, now: number, enabled=true, closeRequested=false): AutoState {
  const s=structuredClone(previous); s.lastChecked=now;
  const v2=s.version===AUTO_VERSION;
  const one=feed.timeframes['1m'] || [];
  if(feed.symbol!==config.symbol || !feed.source.startsWith('Kiwoom REST API') || [one,feed.timeframes['15m'],feed.timeframes['1H'],feed.timeframes['4H']].some(b=>b.length<20 || !validBars(b))) {
    status(s,now,'DATA_WAIT','동일 종목의 키움 1분·15분·1시간·4시간 원본 데이터 대기'); return s;
  }
  const latest=Date.parse(one.at(-1)!.date);
  if(!Number.isFinite(feed.observedAt) || latest>now || now-latest>120_000 || now-feed.observedAt>30_000 || feed.observedAt>now || !Number.isFinite(feed.price) || feed.price<=0) {
    status(s,now,'DATA_WAIT','장 마감 또는 지연 시세: 새 체결 보류'); return s;
  }
  if(!s.position && ((s.lastFreshAt && now-s.lastFreshAt>180000) || (s.source && s.source!==feed.source))) delete s.setup;
  s.lastFreshAt=now;s.chart=one.slice(-90);
  s.source=feed.source; s.mark=feed.price; if(!s.benchmarkStart)s.benchmarkStart=feed.price;
  const h4=closedBars(feed.timeframes['4H'],240,now), h1=closedBars(feed.timeframes['1H'],60,now);
  let context=qualifiedZone(h4,240);
  if(!v2 && context?.direction==='SHORT')context=undefined;
  const m1=closedBars(one,1,now);
  const newBars=m1.filter(b=>Date.parse(b.date)+60_000>s.lastBar);
  // Never backfill entries. Exit barriers on bars wholly after entry are conservative;
  // simultaneous stop+target selects stop, gap through stop executes at worse open.
  if(s.position) {
    for(const b of newBars) {
      if(Date.parse(b.date)<s.position.at) continue;
      const p=s.position;
      const long=p.direction!=='SHORT', at=Date.parse(b.date)+60000;
      if(long?b.low<=p.stop:b.high>=p.stop) { exitPosition(s,config,long?Math.min(b.open,p.stop):Math.max(b.open,p.stop),at,'구조 손절 (동일 봉 양방향 도달 시 손절 우선)',now); break; }
      if(!p.partialDone && p.partialTarget && p.partialQuantity && (long?b.high>=p.partialTarget:b.low<=p.partialTarget))exitPosition(s,config,p.partialTarget,at,'비용 차감 1R · 최초 수량 50% 부분청산',now,p.partialQuantity);
      if(long?b.high>=p.target:b.low<=p.target) { exitPosition(s,config,p.target,at,'4시간 약한 고점·저점 목표 도달',now); break; }
    }
    if(s.position) {
      const p=s.position, long=p.direction!=='SHORT';
      const stopped=long?feed.price<=p.stop:feed.price>=p.stop;
      const target=long?feed.price>=p.target:feed.price<=p.target;
      const invalid=mapMarketStructure(h4).trend!==(long?'BULLISH':'BEARISH');
      if(closeRequested||stopped||invalid)exitPosition(s,config,feed.price,now,closeRequested?'사용자 청산 요청':stopped?'구조 손절':'4시간 구조 무효화',now);
      else {
        if(!p.partialDone&&p.partialTarget&&p.partialQuantity&&(long?feed.price>=p.partialTarget:feed.price<=p.partialTarget))exitPosition(s,config,feed.price,now,'비용 차감 1R · 최초 수량 50% 부분청산',feed.observedAt,p.partialQuantity);
        if(target)exitPosition(s,config,feed.price,now,'목표 도달',feed.observedAt);
      }
    }
  }
  s.lastBar=Math.max(s.lastBar,Date.parse(m1.at(-1)?.date||'')+60_000||0);
  if(s.position) { status(s,now,'HOLDING','보유 중 · 고정 손절·목표 및 4시간 구조 감시'); return markEquity(s); }
  if(!enabled || closeRequested) { status(s,now,'PAUSED','신규 진입 중지'); return markEquity(s); }
  if(s.closed>=500) {status(s,now,'COMPLETE','500건 실험 완료 · 결과 검토 후 새 모델로 진행');return markEquity(s);}
  if(!context) { delete s.setup; status(s,now,'WAIT_CONTEXT','4시간 BOS와 확정 수요·공급 구역 대기'); return markEquity(s); }
  if(s.setup && s.setup.id!==context.zone.id) delete s.setup;
  if(!s.setup) s.setup={id:context.zone.id,direction:context.direction,zone:context.zone,target:context.target,expires:now+7*86400000};
  const setup=s.setup;
  const direction=setup.direction||'LONG', long=direction==='LONG';
  if(s.fills.some(f=>f.setupId===setup.id))setup.used=true;
  if(setup.used) { status(s,now,'WAIT_NEW_SETUP','같은 설정 재진입 금지 · 새 4시간 구조 대기'); return markEquity(s); }
  const invalidZone=setup.m1||setup.m15||setup.zone;
  if(now>setup.expires || (m1.at(-1) && (long?m1.at(-1)!.close<invalidZone.low:m1.at(-1)!.close>invalidZone.high))) {setup.used=true;status(s,now,'INVALIDATED','기원 구역 종가 이탈 또는 설정 유효시간 종료');return markEquity(s);}
  if(setup.m1) {const last=mapMarketStructure(m1).events.at(-1);if(last?.direction===(long?'BEARISH':'BULLISH') && Date.parse(m1[last.index].date)+60000>setup.m1.at){setup.used=true;status(s,now,'INVALIDATED','진입 전 1분 구조가 반대 방향으로 전환');return markEquity(s);}}
  const inside=(z:Zone)=>feed.price>=z.low && feed.price<=z.high;
  if(!setup.touch) {
    if(inside(setup.zone) && now>setup.zone.at) {setup.touch=now;status(s,now,'WAIT_M15_SHIFT','4시간 수요·공급 구역 접촉 확인 · 이후 15분 진입 방향 전환 대기');}
    else status(s,now,'WAIT_H4_TOUCH','4시간 수요·공급 구역 실제 시세 접촉 대기');
    return markEquity(s);
  }
  if(!setup.m15) {
    setup.m15=shiftedZone(closedBars(feed.timeframes['15m'],15,now),15,setup.touch,setup.zone,direction);
    status(s,now,setup.m15?'WAIT_M15_RETEST':'WAIT_M15_SHIFT',setup.m15?'15분 진입 방향 전환 확인 · 기원 구역 재접촉 대기':'접촉 이후 15분 종가 전환·구역 확정 대기'); return markEquity(s);
  }
  if(!setup.retest) {
    if(inside(setup.m15) && now>setup.m15.at) setup.retest=now;
    status(s,now,setup.retest?'WAIT_M1_SHIFT':'WAIT_M15_RETEST',setup.retest?'15분 재접촉 확인 · 이후 1분 진입 방향 전환 대기':'15분 기원 구역 재접촉 대기'); return markEquity(s);
  }
  if(!setup.m1) {
    setup.m1=shiftedZone(m1,1,setup.retest,setup.m15,direction);
    status(s,now,setup.m1?'WAIT_ENTRY':'WAIT_M1_SHIFT',setup.m1?'1분 진입 방향 전환 확인 · 정제 구역 재접촉 대기':'15분 재접촉 이후 1분 종가 전환 대기'); return markEquity(s);
  }
  if(now-setup.m1.at>30*60000) {setup.used=true;status(s,now,'EXPIRED','1분 진입 대기 30분 만료');return markEquity(s);}
  if(internalDirection(h1)!==(long?1:-1)) {status(s,now,'WAIT_PP','1시간 내부 구조의 진입 방향 동행(PP) 대기');return markEquity(s);}
  if(v2) {
    setup.zone.quality=gradeZone(h4,setup.zone,direction,240);
    setup.m15.quality=gradeZone(closedBars(feed.timeframes['15m'],15,now),setup.m15,direction,15,true);
    setup.m1.quality=gradeZone(m1,setup.m1,direction,1,true);
    if([setup.zone,setup.m15,setup.m1].some(z=>z.quality?.grade==='C')) {status(s,now,'WAIT_GRADE','C등급 구역 제외 · A/B등급 기회 대기');return markEquity(s);}
  }
  const stop=long?setup.m1.low*.999:setup.m1.high*1.001;
  const terms=entryTerms(feed.price,stop,setup.target,s.cash,config,direction);
  const partialQuantity=v2?Math.floor(terms.quantity/2):0;
  const blendedR=terms.quantity?(partialQuantity+(terms.quantity-partialQuantity)*terms.rr)/terms.quantity:0;
  if(!inside(setup.m1) || now<=setup.m1.at || !(blendedR>=2) || terms.quantity<1) {
    status(s,now,'WAIT_ENTRY','1분 구역 재접촉·비용 차감 2R·위험 한도 확인 중');return markEquity(s);
  }
  const fee=terms.entry*terms.quantity*config.feeBps/10000;
  s.cash-=terms.entry*terms.quantity+fee;
  const d=long?1:-1, rate=config.feeBps/10000;
  const partialTarget=(terms.unitRisk+terms.entry*(d+rate))/(d-rate)/(1-d*config.slippageBps/10000);
  s.position={direction,quantity:terms.quantity,entry:terms.entry,fee,stop,target:setup.target,at:now,risk:terms.unitRisk*terms.quantity,setupId:setup.id,...(partialQuantity?{partialQuantity,partialTarget}: {})};
  s.fills.unshift({id:`${setup.id}:ENTRY`,side:long?'BUY':'SELL',direction,action:'ENTRY',model:s.version,at:now,price:terms.entry,quantity:terms.quantity,fee,reason:`${direction} · H4 접촉 → M15 전환·재접촉 → M1 전환·재접촉 + H1 PP + 부분청산 반영 순 2R`,pnl:0,r:0,setupId:setup.id,source:s.source,observedAt:feed.observedAt});
  setup.used=true; status(s,now,'HOLDING',`조건 충족 · 현재 관측 시세로 ${long?'롱':'숏'} 모의 진입`); return markEquity(s);
}
export function autoEquity(s:AutoState) {const p=s.position;return s.cash+(p?p.quantity*(p.entry+(p.direction==='SHORT'?-1:1)*(s.mark-p.entry)):0);}
function markEquity(s:AutoState) { const equity=autoEquity(s);s.peak=Math.max(s.peak,equity);s.maxDrawdown=Math.max(s.maxDrawdown,(s.peak-equity)/s.peak*100); return s; }
