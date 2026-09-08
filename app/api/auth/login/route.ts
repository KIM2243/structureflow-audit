import { json, login, sessionCookie } from '@/lib/auth';
const text=(value:unknown)=>typeof value==='string'?value:'';
export async function POST(request:Request){const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const result=await login(text(body?.username).trim(),text(body?.password));if(!result)return json({error:'아이디 또는 비밀번호를 확인해주세요. 반복 실패 시 15분간 잠깁니다.'},401);return json({user:result.user},200,{'Set-Cookie':sessionCookie(result.token)});}
