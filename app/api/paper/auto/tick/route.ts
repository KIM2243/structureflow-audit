import { runAutoTick } from '@/lib/auto-paper-store';
import { json } from '@/lib/auth';
export async function POST(request:Request) {
  const secret=process.env.KIWOOM_BRIDGE_TOKEN;
  const supplied=request.headers.get('authorization')||'';
  if(!secret || !supplied.startsWith('Bearer '))return json({error:'Unauthorized'},401);
  const encoder=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(supplied)),crypto.subtle.digest('SHA-256',encoder.encode(`Bearer ${secret}`))]);
  const aa=new Uint8Array(a),bb=new Uint8Array(b);let difference=0;for(let i=0;i<aa.length;i++)difference|=aa[i]^bb[i];
  if(difference)return json({error:'Unauthorized'},401);
  return json(await runAutoTick());
}
