import type { Candle } from '@/lib/engine';
import { quoteRequestKey, type KiwoomQuote, type KiwoomQuoteRequest } from '@/lib/kiwoom';

type YahooChart = {
  chart?: { result?: Array<{ meta?: Record<string, unknown>; timestamp?: number[]; indicators?: { quote?: Array<{ open?: Array<number|null>; high?: Array<number|null>; low?: Array<number|null>; close?: Array<number|null>; volume?: Array<number|null> }> } }> };
};

function metaText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

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

function yahooFeed(request: KiwoomQuoteRequest, suffix = 'KS') {
  return request.market === 'KR' ? `${request.symbol}.${suffix}` : request.symbol;
}

async function loadQuotePayload(request: KiwoomQuoteRequest, signal: AbortSignal) {
  if (request.market === 'US') return load(yahooFeed(request), '1m', '1d', signal);
  try {
    return await load(yahooFeed(request, 'KS'), '1m', '1d', signal);
  } catch {
    return load(yahooFeed(request, 'KQ'), '1m', '1d', signal);
  }
}

export async function getYahooCurrentPrice(
  request: KiwoomQuoteRequest,
  signal?: AbortSignal,
): Promise<KiwoomQuote> {
  const timeout = AbortSignal.timeout(10_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const payload = await loadQuotePayload(request, combinedSignal);
  const result = payload.chart?.result?.[0];
  const meta = result?.meta || {};
  const series = candles(payload);
  const latest = series.at(-1);
  const price = Number(meta.regularMarketPrice) || latest?.close || 0;
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('보조 시세에 현재가가 없습니다.');
  }
  const previousClose =
    Number(meta.regularMarketPreviousClose) ||
    Number(meta.chartPreviousClose) ||
    price;
  const change = price - previousClose;
  const timestamp = new Date().toISOString();
  return {
    key: quoteRequestKey(request),
    market: request.market,
    symbol: request.symbol,
    name: metaText(meta.longName, metaText(meta.shortName, request.symbol)),
    exchange: metaText(meta.exchangeName),
    currency: request.market === 'KR' ? 'KRW' : 'USD',
    price,
    previousClose,
    change,
    changePct: previousClose ? (change / previousClose) * 100 : 0,
    timestamp,
    lastUpdated: timestamp,
    marketState: 'UNKNOWN',
    status: 'ok',
  };
}

export async function getYahooMarketChart(market:'US'|'KR',symbol:string){
  const timeout=AbortSignal.timeout(15_000);
  const loadSeries=(feed:string)=>Promise.all([load(feed,'5m','5d',timeout),load(feed,'15m','1mo',timeout),load(feed,'60m','3mo',timeout),load(feed,'1d','1y',timeout),load(feed,'1m','5d',timeout).catch(()=>null)]);
  const [five,fifteen,hour,daily,one]=market==='KR'
    ? await loadSeries(`${symbol}.KS`).catch(()=>loadSeries(`${symbol}.KQ`))
    : await loadSeries(symbol);
  const fiveCandles=candles(five),fifteenCandles=candles(fifteen),hourCandles=candles(hour),dailyCandles=candles(daily);if(fiveCandles.length<40)throw new Error('보조 시세의 분석 데이터가 부족합니다.');
  const meta=five.chart!.result![0].meta||{};
  return {symbol,name:metaText(meta.longName,metaText(meta.shortName,symbol)),exchange:metaText(meta.exchangeName),currency:market==='KR'?'KRW':'USD',price:Number(meta.regularMarketPrice)||fiveCandles.at(-1)!.close,source:'Yahoo Finance 보조 시세',candles:fiveCandles,timeframes:{'1m':one?candles(one):[],'15m':fifteenCandles,'1H':hourCandles,'4H':fourHour(hourCandles),'1D':dailyCandles},fetchedAt:new Date().toISOString()};
}
