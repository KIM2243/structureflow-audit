import { env } from 'cloudflare:workers';
import { createUser, getUser, json, validPassword, validUsername } from '@/lib/auth';
const text=(value:unknown)=>typeof value==='string'?value:'';
async function admin(request:Request){const u=await getUser(request);return u?.role==='admin'?u:null;}
export async function GET(request:Request){if(!await admin(request))return json({error:'관리자 권한이 필요합니다.'},403);const rows=await env.DB.prepare('SELECT id,username,display_name AS displayName,role,status,created_at AS createdAt,last_login_at AS lastLoginAt FROM users ORDER BY created_at').all();return json({users:rows.results});}
export async function POST(request:Request){if(!await admin(request))return json({error:'관리자 권한이 필요합니다.'},403);const b=await request.json().catch(()=>null) as Record<string,unknown>|null;const username=text(b?.username).trim(),displayName=text(b?.displayName).trim(),password=text(b?.password),role=b?.role==='admin'?'admin':'member';if(!validUsername(username)||!displayName||!validPassword(password))return json({error:'아이디는 영문·숫자 3자 이상, 비밀번호는 영문과 숫자를 포함한 12자 이상이어야 합니다.'},400);try{await createUser({username,displayName,password,role});return json({ok:true},201);}catch{return json({error:'이미 사용 중인 아이디입니다.'},409);}}
export async function PATCH(request:Request){const me=await admin(request);if(!me)return json({error:'관리자 권한이 필요합니다.'},403);const b=await request.json().catch(()=>null) as Record<string,unknown>|null;const id=text(b?.id);if(!id)return json({error:'회원이 지정되지 않았습니다.'},400);if(!await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(id).first())return json({error:'존재하지 않는 회원입니다.'},404);if(b?.action==='status'){if(id===me.id&&b.status==='disabled')return json({error:'자기 계정은 비활성화할 수 없습니다.'},400);await env.DB.prepare('UPDATE users SET status=?,updated_at=? WHERE id=?').bind(b.status==='disabled'?'disabled':'active',Date.now(),id).run();if(b.status==='disabled')await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();return json({ok:true});}if(b?.action==='password'){const password=text(b?.password);if(!validPassword(password))return json({error:'새 비밀번호는 영문과 숫자를 포함한 12자 이상이어야 합니다.'},400);const salt=crypto.randomUUID().replaceAll('-','');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);const hash=Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,'0')).join('');await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=100000,failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?').bind(hash,salt,Date.now(),id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id)]);return json({ok:true});}return json({error:'지원하지 않는 작업입니다.'},400);}

export async function DELETE(request:Request){
  const me=await admin(request);if(!me)return json({error:'관리자 권한이 필요합니다.'},403);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const id=text(b?.id);if(!id)return json({error:'회원이 지정되지 않았습니다.'},400);
  if(id===me.id)return json({error:'현재 로그인한 관리자 계정은 삭제할 수 없습니다.'},400);
  const target=await env.DB.prepare('SELECT username FROM users WHERE id=?').bind(id).first<{username:string}>();
  if(!target)return json({error:'존재하지 않는 회원입니다.'},404);
  if(text(b?.confirmUsername)!==target.username)return json({error:'삭제할 회원의 아이디를 정확히 입력하세요.'},400);
  const result=await env.DB.prepare("DELETE FROM users WHERE id=? AND (role!='admin' OR status!='active' OR (SELECT COUNT(*) FROM users WHERE role='admin' AND status='active')>1)").bind(id).run();
  if(!result.meta.changes)return json({error:'마지막 활성 관리자 계정은 삭제할 수 없습니다.'},409);
  return json({ok:true});
}
