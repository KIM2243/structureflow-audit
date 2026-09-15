import { getUser,json } from '@/lib/auth';
import { listAutoRuns,createAutoRun,controlAutoRun,autoRuntime } from '@/lib/auto-paper-store';
import type { AutoConfig } from '@/lib/auto-paper';
export async function GET(request:Request) {
  const user=await getUser(request);if(!user)return json({error:'로그인이 필요합니다.'},401);
  return json({runs:await listAutoRuns(user.id),runtime:await autoRuntime()});
}
export async function POST(request:Request) {
  const user=await getUser(request);if(!user)return json({error:'로그인이 필요합니다.'},401);
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'요청 출처를 확인할 수 없습니다.'},403);
  try {
    const body=await request.json() as Record<string,unknown>;
    if(body.action==='start') {
      const market=body.market,symbol=String(body.symbol||'').toUpperCase(),exchange=body.exchange||'ND';
      if(!['KR','US'].includes(String(market)) || !(market==='KR'?/^\d{6}$/:/^[A-Z][A-Z0-9.-]{0,9}$/).test(symbol) || !['NA','ND','NY'].includes(String(exchange)))return json({error:'종목 정보가 올바르지 않습니다.'},400);
      if(body.entryTimeframe!==undefined&&!['1m','5m'].includes(String(body.entryTimeframe)))return json({error:'진입 확인 시간대를 확인하세요.'},400);
      const config:AutoConfig={market:market as 'US'|'KR',symbol,exchange:exchange as AutoConfig['exchange'],capital:market==='KR'?10000000:10000,riskPct:0.5,feeBps:5,slippageBps:5,entryTimeframe:body.entryTimeframe==='5m'?'5m':'1m'};
      return json({runs:await createAutoRun(user.id,config)});
    }
    if(!['pause','resume','close'].includes(String(body.action)) || typeof body.id!=='string')return json({error:'지원하지 않는 요청입니다.'},400);
    return json({runs:await controlAutoRun(user.id,body.id,body.action as 'pause'|'resume'|'close')});
  } catch {return json({error:'요청을 완료하지 못했습니다. 새로고침 후 다시 시도하세요.'},409);}
}
