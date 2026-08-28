const allowed=new Set(['ONDS','NVDA','TSLA','005930.KS','000660.KS','035420.KS']);
export async function GET(req:Request){
  const url=new URL(req.url),symbol=(url.searchParams.get('symbol')||'ONDS').toUpperCase();
  if(!allowed.has(symbol)) return Response.json({error:'지원하지 않는 종목입니다.'},{status:400});
  try{
    const endpoint=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=60d&interval=15m&includePrePost=false&events=div%2Csplits`;
    const response=await fetch(endpoint,{headers:{'User-Agent':'Mozilla/5.0 StructureFlow/1.0'}});
    if(!response.ok) throw Error(`데이터 제공처 오류 ${response.status}`);
    const json:any=await response.json(),r=json.chart?.result?.[0],q=r?.indicators?.quote?.[0];
    if(!r||!q) throw Error('가격 데이터가 없습니다.');
    const candles=r.timestamp.map((t:number,i:number)=>({date:new Date(t*1000).toISOString(),open:q.open[i],high:q.high[i],low:q.low[i],close:q.close[i],volume:q.volume[i]||0})).filter((c:any)=>[c.open,c.high,c.low,c.close].every(Number.isFinite));
    return Response.json({symbol,exchange:r.meta.exchangeName,currency:r.meta.currency,regularMarketPrice:r.meta.regularMarketPrice,candles,source:'Yahoo Finance chart feed',fetchedAt:new Date().toISOString()},{headers:{'Cache-Control':'public, max-age=300'}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'시세를 불러오지 못했습니다.'},{status:502})}
}
