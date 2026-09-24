import { env } from 'cloudflare:workers';

export type AuthUser = { id: string; username: string; displayName: string; role: 'admin' | 'member' };
type LoginRow = AuthUser & {
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  status: 'active' | 'disabled';
  failedAttempts: number;
  lockedUntil: number | null;
};
const COOKIE = 'sf_session';
// Cloudflare Workers currently caps Web Crypto PBKDF2 at 100,000 iterations.
const ITERATIONS = 100_000;
const SESSION_SECONDS = 60 * 60 * 24 * 14;

const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (size: number) => { const b = new Uint8Array(size); crypto.getRandomValues(b); return hex(b); };
async function sha256(value: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))); }
async function passwordHash(password: string, salt: string, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations }, key, 256);
  return hex(new Uint8Array(bits));
}
function cookieValue(request: Request) {
  const raw = request.headers.get('cookie') || '';
  return raw.split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
}
export async function getUser(request: Request): Promise<AuthUser | null> {
  const token = cookieValue(request); if (!token) return null;
  const row = await env.DB.prepare(`SELECT u.id,u.username,u.display_name AS displayName,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`).bind(await sha256(token), Date.now()).first<AuthUser>();
  return row || null;
}
export async function userCount() {
  return Number((await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{count:number}>())?.count || 0);
}
export { validPassword } from './password-policy';
export function validUsername(username: string) { return /^[A-Za-z0-9._-]{3,40}$/.test(username); }
export async function createUser(input: { username: string; displayName: string; password: string; role: 'admin'|'member' }) {
  const salt=randomHex(16), now=Date.now(), id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,password_iterations,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,input.username.toLowerCase(),input.displayName.slice(0,60),await passwordHash(input.password,salt),salt,ITERATIONS,input.role,'active',now,now).run();
  return id;
}
export async function login(username: string, password: string) {
  const row=await env.DB.prepare('SELECT id,username,display_name AS displayName,password_hash AS passwordHash,password_salt AS passwordSalt,password_iterations AS passwordIterations,role,status,failed_attempts AS failedAttempts,locked_until AS lockedUntil FROM users WHERE username=? COLLATE NOCASE').bind(username).first<LoginRow>();
  const now=Date.now();
  if (!row || row.status!=='active' || (row.lockedUntil && row.lockedUntil>now)) return null;
  const ok=(await passwordHash(password,row.passwordSalt,row.passwordIterations))===row.passwordHash;
  if(!ok){ const failures=(row.failedAttempts||0)+1; await env.DB.prepare('UPDATE users SET failed_attempts=?,locked_until=?,updated_at=? WHERE id=?').bind(failures,failures>=5?now+15*60_000:null,now,row.id).run(); return null; }
  await env.DB.prepare('UPDATE users SET failed_attempts=0,locked_until=NULL,last_login_at=?,updated_at=? WHERE id=?').bind(now,now,row.id).run();
  const token=randomHex(32); await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(await sha256(token),row.id,now,now+SESSION_SECONDS*1000).run();
  return { token, user:{id:row.id,username:row.username,displayName:row.displayName,role:row.role} as AuthUser };
}
export function sessionCookie(token:string){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;}
export function clearCookie(){return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;}
export async function deleteSession(request:Request){const token=cookieValue(request);if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();}
export function json(data:unknown,status=200,headers:Record<string,string>={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});}
