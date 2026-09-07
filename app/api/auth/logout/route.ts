import { clearCookie, deleteSession, json } from '@/lib/auth';
export async function POST(request:Request){await deleteSession(request);return json({ok:true},200,{'Set-Cookie':clearCookie()});}
