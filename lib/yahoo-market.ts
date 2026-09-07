import type { Candle } from '@/lib/engine';

type YahooChart = {
  chart?: { result?: Array<{ meta?: Record<string, unknown>; timestamp?: number[]; indicators?: { quote?: Array<{ open?: Array<number|null>; high?: Array<number|null>; low?: Array<number|null>; close?: Array<number|null>; volume?: Array<number|null> }> } }> };
};

function candles(payload: YahooChart) {
  const result=payload.chart?.result?.[0]; const quote=result?.indicators?.quote?.[0];
  if(!result?.timestamp||!quote)return [];
  return result.timestamp.flatMap((timestamp,index):Candle[]=>{
    const open=quote.open?.[index],high=quote.high?.[index],low=quote.low?.[index],close=quote.close?.[index],volume=quote.volume?.[index];
    if(![open,high,low,close].every(Number.isFinite))return [];
    return [{date:new Date(timestamp*1000).toISOString(),open:Number(open),high:Number(high),low:Number(low),close:Number(close),volume:Number(volume)||0}];
  }).slice(-400);
}

function fourHour(hourly:Candle[]){
  const output:Candle[]=[]; let day=''; let group:Candle[]=[];
  const flush=()=>{for(let i=0;i<group.length;i+=4){const part=group.slice(i,i+4);if(part.length)output.push({date:part.at(-1)!.date,open:part[0].open,high:Math.max(...part.map(x=>x.high)),low:Math.min(...part.map(x=>x.low)),close:part.at(-1)!.close,volume:part.reduce((sum,x)=>sum+x.volume,0)});}};
  for(const item of hourly){const next=item.date.slice(0,10);if(day&&next!==day){flush();group=[];}day=next;group.push(item);}flush();return output.slice(-400);
}

async function load(symbol:string,interval:string,range:string,signal:AbortSignal){
  const url=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);url.searchParams.set('interval',interval);url.searchParams.set('range',range);url.searchParams.set('includePrePost','false');url.searchParams.set('events','div,splits');
  const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'StructureFlow/1.0'},signal});
  if(!response.ok)throw new Error(`보조 시세 응답 오류 ${response.status}`);
  const payload=await response.json() as YahooChart;if(!payload.chart?.result?.[0])throw new Error('보조 시세에 해당 종목 데이터가 없습니다.');return payload;
}

export async function getYahooMarketChart(market:'US'|'KR',symbol:string){
  const feed=market==='KR'?`${symbol}.KS`:symbol; const timeout=AbortSignal.timeout(15_000);
  const [five,fifteen,hour,daily]=await Promise.all([load(feed,'5m','5d',timeout),load(feed,'15m','1mo',timeout),load(feed,'60m','3mo',timeout),load(feed,'1d','1y',timeout)]);
  const fiveCandles=candles(five),fifteenCandles=candles(fifteen),hourCandles=candles(hour),dailyCandles=candles(daily);if(fiveCandles.length<40)throw new Error('보조 시세의 분석 데이터가 부족합니다.');
  const meta=five.chart!.result![0].meta||{};
  return {symbol,name:String(meta.longName||meta.shortName||symbol),exchange:String(meta.exchangeName||''),currency:market==='KR'?'KRW':'USD',price:Number(meta.regularMarketPrice)||fiveCandles.at(-1)!.close,source:'Yahoo Finance 보조 시세',candles:fiveCandles,timeframes:{'15m':fifteenCandles,'1H':hourCandles,'4H':fourHour(hourCandles),'1D':dailyCandles},fetchedAt:new Date().toISOString()};
}
