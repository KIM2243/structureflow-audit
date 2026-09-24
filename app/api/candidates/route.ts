import {getUser} from '@/lib/auth';
import {fetchFromKiwoomBridge} from '@/lib/bridge';
export async function GET(request:Request){if(!await getUser(request))return Response.json({error:'로그인이 필요합니다.'},{status:401});try{return await fetchFromKiwoomBridge('/api/candidates',new URL(request.url).searchParams,request.signal);}catch{return Response.json({error:'후보 리포트를 불러오지 못했습니다. 잠시 후 다시 확인하세요.'},{status:503});}}
