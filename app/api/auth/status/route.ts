import { getUser, json, userCount } from '@/lib/auth';
export async function GET(request:Request){const count=await userCount();return json({setupRequired:count===0,user:await getUser(request)});}
