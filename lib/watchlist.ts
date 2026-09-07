import { env } from 'cloudflare:workers';

export type WatchlistItem = {
  market: 'US' | 'KR';
  ticker: string;
  exchange?: 'NA' | 'ND' | 'NY';
};

export const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { market: 'US', ticker: 'ONDS', exchange: 'ND' },
  { market: 'US', ticker: 'NVDA', exchange: 'ND' },
  { market: 'US', ticker: 'TSLA', exchange: 'ND' },
];

const MAX_PER_MARKET = 3;

function normalizeItem(value: unknown): WatchlistItem | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const market = input.market;
  const ticker = typeof input.ticker === 'string' ? input.ticker.trim().toUpperCase() : '';

  if (market === 'US') {
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return null;
    const exchange = input.exchange === 'NA' || input.exchange === 'NY' ? input.exchange : 'ND';
    return { market, ticker, exchange };
  }

  if (market === 'KR') {
    const match = ticker.match(/^(\d{6})(?:\.(KS|KQ))?$/);
    if (!match) return null;
    return { market, ticker: `${match[1]}.${match[2] || 'KS'}` };
  }

  return null;
}

export function validateWatchlist(value: unknown): WatchlistItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PER_MARKET * 2) {
    throw new Error('관심종목은 미국과 한국 각각 최대 3개까지 저장할 수 있습니다.');
  }

  const items = value.map(normalizeItem);
  if (items.some((item) => !item)) throw new Error('관심종목 형식이 올바르지 않습니다.');
  const validItems = items as WatchlistItem[];
  for (const market of ['US', 'KR'] as const) {
    if (validItems.filter((item) => item.market === market).length > MAX_PER_MARKET) {
      throw new Error(`${market === 'US' ? '미국' : '한국'} 관심종목은 최대 3개입니다.`);
    }
  }
  const keys = validItems.map((item) => `${item.market}:${item.ticker}`);
  if (new Set(keys).size !== keys.length) throw new Error('같은 종목이 중복되어 있습니다.');
  return validItems;
}

export async function getWatchlist(userId: string) {
  const rows = await env.DB.prepare(
    'SELECT market,ticker,exchange FROM watchlist_items WHERE user_id=? ORDER BY market,position',
  ).bind(userId).all<WatchlistItem>();
  return { items: rows.results || [], configured: Boolean(rows.results?.length) };
}

export async function replaceWatchlist(userId: string, items: WatchlistItem[]) {
  const now = Date.now();
  const positions = { US: 0, KR: 0 };
  const statements = [env.DB.prepare('DELETE FROM watchlist_items WHERE user_id=?').bind(userId)];
  for (const item of items) {
    statements.push(env.DB.prepare(
      'INSERT INTO watchlist_items(id,user_id,market,ticker,exchange,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    ).bind(
      crypto.randomUUID(), userId, item.market, item.ticker,
      item.market === 'US' ? item.exchange || 'ND' : null,
      positions[item.market]++, now, now,
    ));
  }
  await env.DB.batch(statements);
  return items;
}
