import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceAuto,newAutoState,closedBars,validBars,entryTerms,qualifiedZone,shiftedZone,AUTO_VERSION,autoEquity,gradeZone } from './auto-paper.ts';
const now=Date.UTC(2026,8,10,12,0,30), minute=60000;
const config={market:'US',symbol:'TEST',exchange:'ND',capital:10000,riskPct:.5,feeBps:5,slippageBps:5};
function bars(rows,step=1,end=now-30000){return rows.map(([high,low,close],i)=>({date:new Date(end-(rows.length-1-i)*step*minute).toISOString(),open:(high+low)/2,high,low,close,volume:100}));}
const h4=bars([...Array(17).fill([10,8,9]),[12,9,11],[14,10,13],[13,11,12],[12,10,11]],240);
const h1=bars([...Array(17).fill([10,8,9]),[9.5,8,9],[12,9,11],[12,9,11],[12,9,11]],60);
function feed(){return {source:'Kiwoom REST API',symbol:'TEST',price:8.5,observedAt:now,timeframes:{'1m':bars(Array(25).fill([8.7,8.35,8.5])),'15m':bars(Array(25).fill([9,8.2,8.6]),15),'1H':h1,'4H':h4}};}
function ready(){const s=newAutoState(config,now-100*minute);s.version='PP-H4-M15-M1-close-v1';const c=qualifiedZone(closedBars(h4,240,now),240);assert.ok(c);s.setup={id:c.zone.id,zone:c.zone,target:c.target,expires:now+86400000,touch:now-60*minute,m15:{low:8.1,high:8.9,at:now-40*minute,id:'m15'},retest:now-20*minute,m1:{low:8.3,high:8.7,at:now-2*minute,id:'m1'}};return s;}
test('native completed bars exclude unfinished/future candles',()=>{const a=bars(Array(25).fill([10,8,9]));assert.equal(closedBars(a,1,now).length,24);assert.ok(closedBars(a,1,now).every(b=>Date.parse(b.date)+minute<=now));});
test('bounded bridge clock skew allows fresh quotes and preserves original evidence timestamps',()=>{for(const skew of [1,250,2000]){const s=advanceAuto(ready(),config,{...feed(),observedAt:now+skew},now);assert.equal(s.fills.length,1);assert.equal(s.fills[0].observedAt,now+skew);assert.ok(s.health.issues.some(i=>i.code==='QUOTE_CLOCK_SKEW'&&i.level==='warning'));}});
test('large future clocks, malformed timestamps and stale quotes remain blocked',()=>{for(const observedAt of [now+2001,now+9*60*minute,NaN,now-30001]){const s=advanceAuto(ready(),config,{...feed(),observedAt},now);assert.equal(s.stage,'DATA_WAIT');assert.equal(s.fills.length,0);}});
test('decision evidence captures entry and preserves historical zones without changing previous state',()=>{const old=ready(),f=feed(),s=advanceAuto(old,config,f,now);const d=s.decisions[0];assert.equal(d.fills[0].action,'ENTRY');assert.equal(d.checks.quantity,s.position.quantity);assert.equal(d.price,f.price);assert.equal(d.bars.find(b=>b.timeframe==='1m').completed,24);assert.equal(old.decisions,undefined);s.setup.m1.low=1;assert.equal(d.setup.m1.low,8.3);});
test('waiting evidence samples by minute and retains at most 200 records',()=>{const f={...feed(),source:'Yahoo Finance'};let s=advanceAuto(ready(),config,f,now);assert.equal(s.decisions[0].stage,'DATA_WAIT');s=advanceAuto(s,config,f,now+1000);assert.equal(s.decisions.length,1);for(let i=1;i<=205;i++)s=advanceAuto(s,config,f,now+i*minute);assert.equal(s.decisions.length,200);assert.equal(s.decisions[0].at,now+205*minute);assert.equal(s.fills.length,0);});
test('invalid OHLC and unordered timestamps fail data validation',()=>{const a=feed().timeframes['1m'];assert.equal(validBars(a),true);a[1].low=20;assert.equal(validBars(a),false);assert.equal(validBars([...a].reverse()),false);});
test('costed risk sizing caps loss and available cash',()=>{const t=entryTerms(100,98,110,10000,config);assert.ok(t.quantity*t.unitRisk<=50);assert.ok(t.quantity*t.entry*1.0005<=10000);assert.ok(t.rr<5);assert.equal(entryTerms(100,101,110,10000,config).quantity,0);});
test('missing M1 never silently substitutes M5',()=>{const f=feed();delete f.timeframes['1m'];const s=advanceAuto(ready(),config,f,now);assert.equal(s.stage,'DATA_WAIT');assert.equal(s.fills.length,0);});
test('stale/wrong instrument/fallback source cannot fill',()=>{for(const edit of [{symbol:'OTHER'},{source:'Yahoo Finance'},{observedAt:now-31000}]){const s=advanceAuto(ready(),config,{...feed(),...edit},now);assert.equal(s.stage,'DATA_WAIT');assert.equal(s.fills.length,0);}});
test('fresh confirmed sequence opens one costed position; duplicate tick cannot reenter',()=>{const s=advanceAuto(ready(),config,feed(),now);assert.equal(s.fills.length,1);assert.equal(s.fills[0].side,'BUY');assert.ok(s.position.entry>8.5);assert.ok(s.position.stop<8.3);const again=advanceAuto(s,config,feed(),now);assert.equal(again.fills.length,1);assert.equal(again.cash,s.cash);});
test('opening does not act on pre-entry bar extrema',()=>{const s=advanceAuto(ready(),config,feed(),now);assert.ok(s.position);const f=feed();f.timeframes['1m'][0].low=1;const again=advanceAuto(s,config,f,now);assert.equal(again.fills.length,1);});
test('new entry paused, existing stop still exits',()=>{assert.equal(advanceAuto(ready(),config,feed(),now,false).fills.length,0);const s=advanceAuto(ready(),config,feed(),now);const f={...feed(),price:8,observedAt:now+1000};const closed=advanceAuto(s,config,f,now+1000,false);assert.equal(closed.fills.length,2);assert.equal(closed.closed,1);assert.ok(closed.netPnl<0);assert.ok(!closed.position);});
test('fees on both sides count in realized P&L and R',()=>{const s=advanceAuto(ready(),config,feed(),now);const f={...feed(),price:14,observedAt:now+1000};const closed=advanceAuto(s,config,f,now+1000);const buy=closed.fills[1],sell=closed.fills[0];assert.ok(Math.abs(sell.pnl-((sell.price-buy.price)*buy.quantity-buy.fee-sell.fee))<1e-8);assert.ok(Math.abs(closed.cash-config.capital-sell.pnl)<1e-8);assert.equal(advanceAuto(closed,config,f,now+1000).fills.length,2);});
test('same candle stop and target selects stop; gap uses worse open',()=>{const s=advanceAuto(ready(),config,feed(),now);const f=feed();const bar={date:new Date(now+30000).toISOString(),open:8,high:15,low:7,close:9,volume:100};f.timeframes['1m'].push(bar,{...bar,date:new Date(now+90000).toISOString()});f.observedAt=now+95000;const closed=advanceAuto(s,config,f,now+95000);assert.equal(closed.fills[0].side,'SELL');assert.equal(closed.fills[0].price,8*.9995);assert.ok(closed.netPnl<0);});
test('entry cannot use expired M1 event or a non-PP upper internal direction',()=>{const a=ready();a.setup.m1.at=now-31*minute;assert.equal(advanceAuto(a,config,feed(),now).stage,'EXPIRED');const f=feed();f.timeframes['1H']=bars(Array(25).fill([10,8,9]),60);assert.equal(advanceAuto(ready(),config,f,now).stage,'WAIT_PP');});
test('fresh setup waits for live H4 touch instead of replaying old entries',()=>{const s=advanceAuto(newAutoState(config,now),config,feed(),now);assert.equal(s.stage,'WAIT_M15_SHIFT');assert.equal(s.fills.length,0);assert.equal(s.setup.touch,now);});
test('raw structure shift must follow parent contact and be contained in parent',()=>{const a=bars([[10,8,9],[10,8,9],[9,6,7],[8,5,6],[7,5.5,6],[11,6,10.5]]);const z=shiftedZone(a,1,Date.parse(a[2].date),{low:4,high:12,at:0,id:'parent'});assert.ok(z);assert.equal(shiftedZone(a,1,now+2*minute,{low:4,high:12,at:0,id:'p'}),undefined);assert.equal(shiftedZone(a,1,0,{low:8,high:9,at:0,id:'p'}),undefined);});
test('a persisted prior fill blocks re-entry after setup reset/restart',()=>{const s=advanceAuto(ready(),config,feed(),now);const c=advanceAuto(s,config,{...feed(),price:14,observedAt:now+1000},now+1000);delete c.setup;const r=advanceAuto(c,config,{...feed(),observedAt:now+2000},now+2000);assert.equal(r.fills.length,2);assert.equal(r.stage,'WAIT_NEW_SETUP');});
test('future upper-timeframe bars and duplicate M1 are blocked with diagnostic reasons',()=>{for(const change of [f=>{f.timeframes['4H'].at(-1).date=new Date(now+minute).toISOString();},f=>{f.timeframes['1m'][22].date=f.timeframes['1m'][21].date;}]){const f=structuredClone(feed());change(f);const s=advanceAuto(ready(),config,f,now);assert.equal(s.stage,'DATA_WAIT');assert.ok(s.health.issues.some(i=>i.level==='block'));assert.equal(s.fills.length,0);assert.equal(s.setup,undefined);}});
test('regressed quote cannot close a position and records the rejected response',()=>{const s=advanceAuto(ready(),config,feed(),now);const r=advanceAuto(s,config,{...feed(),price:8,observedAt:now-1000},now+1000);assert.equal(r.fills.length,s.fills.length);assert.ok(r.position);assert.ok(r.decisions[0].health.issues.some(i=>i.code==='QUOTE_REGRESSION'));});
test('recent M1 gap blocks new entry but valid current price still manages a held stop',()=>{const f=feed();f.timeframes['1m'].splice(22,1);const waiting=advanceAuto(ready(),config,f,now);assert.equal(waiting.stage,'DATA_GAP');assert.equal(waiting.fills.length,0);const held=advanceAuto(ready(),config,feed(),now);const exited=advanceAuto(held,config,{...f,price:8,observedAt:now+1000},now+1000);assert.equal(exited.position,undefined);assert.equal(exited.closed,1);});
test('recovery after invalid data starts a new observed setup, not the stale refined entry',()=>{const waiting=advanceAuto(ready(),config,{...feed(),observedAt:now-31000},now);const recovered=advanceAuto(waiting,config,{...feed(),observedAt:now+1000},now+1000);assert.equal(recovered.fills.length,0);assert.equal(recovered.stage,'WAIT_M15_SHIFT');assert.equal(recovered.setup.touch,now+1000);});

const mirror=b=>({...b,open:20-b.open,high:20-b.low,low:20-b.high,close:20-b.close});
function v2(short=false){
  const f=feed(),s=ready();s.version=AUTO_VERSION;s.setup.direction='LONG';
  if(short){f.price=20-f.price;for(const key of Object.keys(f.timeframes))f.timeframes[key]=f.timeframes[key].map(mirror);
    const c=qualifiedZone(closedBars(f.timeframes['4H'],240,now),240);assert.equal(c.direction,'SHORT');
    s.setup.id=c.zone.id;s.setup.zone=c.zone;s.setup.target=c.target;s.setup.direction='SHORT';
    for(const key of ['m15','m1']){const z=s.setup[key];s.setup[key]={...z,low:20-z.high,high:20-z.low};}}
  return {s,f};
}
test('v2 LONG and SHORT reserve cash and size risk symmetrically',()=>{
  for(const short of [false,true]){const {s,f}=v2(short),r=advanceAuto(s,config,f,now);
    assert.ok(r.position,`${r.stage}: ${r.reason}`);assert.equal(r.position.direction,short?'SHORT':'LONG');
    assert.equal(r.fills[0].side,short?'SELL':'BUY');assert.equal(r.fills[0].action,'ENTRY');
    assert.ok(r.position.risk<=50);assert.ok(r.cash>=0);assert.ok(autoEquity(r)<config.capital);
    assert.equal(r.position.partialQuantity,Math.floor(r.position.quantity/2));
    assert.ok(short?r.position.stop>r.position.entry:r.position.stop<r.position.entry);
  }
});
test('partial exits allocate both fees, preserve fixed stop and close one trade only',()=>{
  for(const short of [false,true]){const {s,f}=v2(short),opened=advanceAuto(s,config,f,now),p=opened.position;
    const after=advanceAuto(opened,config,{...f,price:p.partialTarget,observedAt:now+1000},now+1000);
    assert.equal(after.closed,0);assert.equal(after.sumR,0);assert.equal(after.fills[0].action,'PARTIAL');
    assert.equal(after.position.quantity,p.quantity-p.partialQuantity);assert.equal(after.position.stop,p.stop);
    assert.ok(Math.abs(after.fills[0].r-p.partialQuantity/p.quantity)<1e-9);
    const duplicate=advanceAuto(after,config,{...f,price:p.partialTarget,observedAt:now+1500},now+1500);
    assert.equal(duplicate.fills.length,2);
    const final=advanceAuto(duplicate,config,{...f,price:p.target,observedAt:now+2000},now+2000);
    assert.equal(final.closed,1);assert.equal(final.wins,1);assert.equal(final.position,undefined);
    const exits=final.fills.filter(x=>x.action!=='ENTRY');
    assert.ok(Math.abs(final.netPnl-exits.reduce((a,b)=>a+b.pnl,0))<1e-8);
    assert.ok(Math.abs(final.cash-config.capital-final.netPnl)<1e-8);
    assert.ok(Math.abs(final.sumR-final.netPnl/p.risk)<1e-8);
  }
});
test('SHORT simultaneous partial, target and gap stop uses worse stop without partial profit',()=>{
  const {s,f}=v2(true),opened=advanceAuto(s,config,f,now),p=opened.position;
  const b={date:new Date(now+30000).toISOString(),open:p.stop+1,high:p.stop+2,low:p.target-1,close:p.stop,volume:1};
  f.timeframes['1m'].push(b,{...b,date:new Date(now+90000).toISOString()});f.observedAt=now+95000;
  const result=advanceAuto(opened,config,f,now+95000);
  assert.equal(result.fills.length,2);assert.equal(result.fills[0].action,'EXIT');
  assert.equal(result.fills[0].price,b.open*1.0005);assert.ok(result.netPnl<0);
});
test('SHORT stop after partial counts total trade P&L and allocated fees once',()=>{
  const {s,f}=v2(true),a=advanceAuto(s,config,f,now),p=a.position;
  const b=advanceAuto(a,config,{...f,price:p.partialTarget,observedAt:now+1000},now+1000);
  const c=advanceAuto(b,config,{...f,price:p.stop,observedAt:now+2000},now+2000);
  assert.equal(c.closed,1);assert.ok(Math.abs(c.cash-config.capital-c.netPnl)<1e-8);
  assert.equal(c.wins,c.netPnl>0?1:0);assert.ok(Math.abs(c.sumR-c.netPnl/p.risk)<1e-8);
});
test('1-share positions skip partial liquidation and never create fractional quantities',()=>{
  const {s,f}=v2();s.cash=50;s.peak=50;const c={...config,capital:50};
  const r=advanceAuto(s,c,f,now);assert.equal(r.position.quantity,1);assert.equal(r.position.partialTarget,undefined);
});
test('partial-exit adjusted reward must reach 2R, even if full target alone passes',()=>{
  const {s,f}=v2();s.setup.target=9.1;
  const full=entryTerms(f.price,s.setup.m1.low*.999,9.1,s.cash,config);assert.ok(full.rr>=2&&full.rr<3);
  const r=advanceAuto(s,config,f,now);assert.equal(r.position,undefined);assert.equal(r.stage,'WAIT_ENTRY');
});
test('grades expose components and repeated retests reduce freshness without future bars',()=>{
  const zone={low:8,high:9,at:now-10*minute,id:'z'};
  const fresh=gradeZone([],zone,'LONG',1);
  const repeated=gradeZone(bars([[10,8,9],[11,10,10.5],[10,8,9],[11,10,10.5],[10,8,9]]),zone,'LONG',1);
  assert.equal(fresh.grade,'A');assert.equal(repeated.retests,3);assert.equal(repeated.grade,'C');assert.equal(repeated.reasons.length,5);
});
test('mirrored supply shift requires post-contact bearish CHoCH and containment',()=>{
  const a=bars([[10,8,9],[10,8,9],[9,6,7],[8,5,6],[7,5.5,6],[11,6,10.5]]).map(mirror);
  const z=shiftedZone(a,1,Date.parse(a[2].date),{low:8,high:16,at:0,id:'p'},'SHORT');assert.ok(z);
  assert.equal(shiftedZone(a,1,now+2*minute,{low:8,high:16,at:0,id:'p'},'SHORT'),undefined);
  assert.equal(shiftedZone(a,1,0,{low:8,high:9,at:0,id:'p'},'SHORT'),undefined);
});
