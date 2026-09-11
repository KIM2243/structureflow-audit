import { getUser,json } from '@/lib/auth';
import { readDecisionReplay } from '@/lib/auto-paper-store';
export async function GET(request:Request){
  const user=await getUser(request);if(!user)return json({error:'로그인이 필요합니다.'},401);
  const q=new URL(request.url).searchParams,run=q.get('run'),at=Number(q.get('at'));
  if(!run||!Number.isSafeInteger(at)||at<=0)return json({error:'기록을 선택하세요.'},400);
  try {const replay=await readDecisionReplay(user.id,run,at);return replay?json(replay):json({error:'이 기록의 차트가 없거나 보관 기간이 지났습니다.'},404);}
  catch{return json({error:'차트를 불러오지 못했습니다. 다시 시도하세요.'},503);}
}
