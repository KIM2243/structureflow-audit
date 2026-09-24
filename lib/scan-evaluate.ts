import {analyze,structureSnapshot,type Candle} from './engine.ts';
import {evaluateMultiTimeframeEntry,type EntryTimeframe} from './multi-timeframe.ts';
import {validBars} from './auto-paper.ts';
import type {KiwoomChart} from './kiwoom.ts';
import {localParts,closingMinute} from './scan-policy.mjs';

// The existing chart plan is reused verbatim; an after-close report is never an order.
export function evaluateScanChart(chart:KiwoomChart,cutoff:number){
 const frames={...chart.timeframes,'5m':chart.candles,'1m':chart.timeframes['1m']||[]} as Record<EntryTimeframe,Candle[]>;
 const durations={'1m':1,'5m':5,'15m':15,'1H':60,'4H':240,'1D':0};
 for(const key of Object.keys(frames) as EntryTimeframe[])frames[key]=frames[key].filter(b=>Date.parse(b.date)+durations[key]*60000<=cutoff);
 const date=localParts(cutoff,chart.market).date,close=closingMinute(chart.market,date),open=chart.market==='KR'?540:570;
 const regular=frames['5m'].filter(b=>{const p=localParts(Date.parse(b.date),chart.market);return p.date===date&&p.minute>=open&&p.minute<close;});
 if(regular.length<(close-open)/5)throw new Error('본장 5분봉이 부족해 마감 기준 일봉을 확정할 수 없습니다.');
 const oldDaily=frames['1D'].find(b=>localParts(Date.parse(b.date),chart.market).date===date);
 if(!oldDaily)throw new Error('당일 일봉 없음');
 // Today's daily OHLC is reconstructed from regular-session M5 only, not extended-hours prices.
 frames['1D']=frames['1D'].map(b=>b===oldDaily?{date:b.date,open:regular[0].open,close:regular.at(-1)!.close,high:Math.max(...regular.map(c=>c.high)),low:Math.min(...regular.map(c=>c.low)),volume:regular.reduce((n,c)=>n+c.volume,0)}:b);
 if(Object.values(frames).some(b=>b.length<20||!validBars(b)))throw new Error('필수 시간대 원본 봉 부족 또는 오류');
 const snapshots=Object.fromEntries(Object.entries(frames).map(([k,b])=>[k,structureSnapshot(b)])) as Record<EntryTimeframe,ReturnType<typeof structureSnapshot>>;
 const result=evaluateMultiTimeframeEntry({candles:frames,snapshots,analyses:{'1m':analyze(frames['1m']),'5m':analyze(frames['5m']),'15m':analyze(frames['15m']),'1H':analyze(frames['1H'])},now:cutoff,entryFrame:'1m'});
 const p=result.tradePlan,price=frames['1m'].at(-1)!.close;
 const distance=p.interest?Math.max(p.interest[0]-price,price-p.interest[1],0)/price:null;
 return {plan:p,price,distance,steps:result.steps,summary:result.summary,source:chart.source,counts:Object.fromEntries(Object.entries(frames).map(([k,v])=>[k,v.length]))};
}
