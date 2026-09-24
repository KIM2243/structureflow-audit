import { createUser, json, login, userCount, validPassword, validUsername, sessionCookie } from '@/lib/auth';
const text=(value:unknown)=>typeof value==='string'?value:'';
export async function POST(request:Request){
  if(await userCount())return json({error:'초기 설정이 이미 완료되었습니다.'},409);
  if(!request.headers.get('oai-authenticated-user-id'))return json({error:'기존 소유자 인증이 필요합니다.'},403);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null; const username=text(body?.username).trim(); const displayName=text(body?.displayName).trim(); const password=text(body?.password);
  if(!validUsername(username)||!displayName||!validPassword(password))return json({error:'아이디는 영문·숫자 3자 이상, 비밀번호는 특수문자를 포함한 10자 이상이어야 합니다.'},400);
  await createUser({username,displayName,password,role:'admin'}); const result=await login(username,password);
  return json({user:result!.user},201,{'Set-Cookie':sessionCookie(result!.token)});
}
