import {advanceAuto,newAutoState,validBars,autoEquity,type AutoConfig,type AutoFeed,type AutoState} from './auto-paper.ts';
import type {Candle} from './engine';
const durations={'1m':1,'5m':5,'15m':15,'1H':60,'4H':240} as const;
export type HistoricalInput={source:string;symbol:string;timeframes:AutoFeed['timeframes']};
// An unfinished historical candle exposes only its open, not its eventual H/L/C.
export function historicalFeed(input:HistoricalInput,now:number,price:number):AutoFeed {
  const timeframes={} as AutoFeed['timeframes'];
  for(const frame of Object.keys(durations) as (keyof typeof durations)[]){
    if(frame==='5m'&&!input.timeframes['5m'])continue;
    const rows=input.timeframes[frame]||[];
    timeframes[frame]=rows.filter(b=>Date.parse(b.date)<=now).map(b=>Date.parse(b.date)+durations[frame]*60000<=now?{...b}:{...b,high:b.open,low:b.open,close:b.open,volume:0});
  }
  return {source:input.source,symbol:input.symbol,timeframes,price,observedAt:now};
}
export type AutoBacktestResult={state:AutoState;start:number;end:number;samples:number;skipped:number;stages:Record<string,number>;equity:{at:number;value:number}[];config:AutoConfig;source:string};
export async function runAutoBacktest(input:HistoricalInput,config:AutoConfig,onProgress?:(percent:number)=>void):Promise<AutoBacktestResult>{
  if(input.symbol!==config.symbol||!input.source.startsWith('Kiwoom REST API'))throw new Error('동일 종목의 키움 원본 다중 시간대 데이터가 필요합니다.');
  for(const frame of Object.keys(durations) as (keyof typeof durations)[]){if(frame==='5m'&&config.entryTimeframe!=='5m')continue;const rows=input.timeframes[frame]||[];if(rows.length<20||!validBars(rows))throw new Error(`${frame} 원본 데이터가 부족하거나 올바르지 않습니다.`);}
  const one=input.timeframes['1m']!;
  if(one.length>2000)throw new Error('한 번에 원본 1분봉 2,000개까지 지원합니다.');
  let state:AutoState|undefined,start=0,end=0,samples=0,skipped=0;
  const stages:Record<string,number>={},equity:{at:number;value:number}[]=[];
  for(let i=0;i<one.length;i++){
    const now=Date.parse(one[i].date),feed=historicalFeed(input,now,one[i].open);
    if(Object.keys(durations).filter(frame=>frame!=='5m'||config.entryTimeframe==='5m').some(frame=>(feed.timeframes[frame as keyof typeof durations]?.length||0)<20)){skipped++;continue;}
    if(!state){state=newAutoState(config,now);start=now;}
    state=advanceAuto(state,config,feed,now);end=now;samples++;
    stages[state.stage]=(stages[state.stage]||0)+1;equity.push({at:now,value:autoEquity(state)});
    if(i%20===0){onProgress?.(Math.round((i+1)/one.length*100));await new Promise(resolve=>setTimeout(resolve,0));}
  }
  if(!state)throw new Error('시간대별 준비 데이터가 겹치는 구간이 없습니다. 더 긴 원본 이력이 필요합니다.');
  onProgress?.(100);return {state,start,end,samples,skipped,stages,equity,config:structuredClone(config),source:input.source};
}
