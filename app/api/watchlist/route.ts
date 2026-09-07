import { getUser, json } from '@/lib/auth';
import { DEFAULT_WATCHLIST, getWatchlist, replaceWatchlist, validateWatchlist } from '@/lib/watchlist';

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  const result = await getWatchlist(user.id);
  return json({ items: result.configured ? result.items : DEFAULT_WATCHLIST, configured: result.configured });
}

export async function PUT(request: Request) {
  const user = await getUser(request);
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const body = await request.json() as { items?: unknown };
    const items = validateWatchlist(body.items);
    return json({ items: await replaceWatchlist(user.id, items), configured: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '관심종목을 저장하지 못했습니다.' }, 400);
  }
}
