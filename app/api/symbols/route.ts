import { getUser, json } from '@/lib/auth';

type Market = 'US' | 'KR';
type UsExchange = 'NA' | 'ND' | 'NY';

type YahooQuote = {
  exchange?: string;
  exchDisp?: string;
  longname?: string;
  quoteType?: string;
  shortname?: string;
  symbol?: string;
};

const US_EXCHANGES: Record<string, UsExchange> = {
  ASE: 'NA',
  BTS: 'NA',
  NCM: 'ND',
  NGM: 'ND',
  NMS: 'ND',
  NAS: 'ND',
  NYQ: 'NY',
  PCX: 'NA',
};

const SEARCH_ALIASES: Record<string, string> = {
  '타이거': 'TIGER',
  '티거': 'TIGER',
  '코덱스': 'KODEX',
  '에이스': 'ACE ETF',
  '솔': 'SOL ETF',
  '라이즈': 'RISE ETF',
  '플러스': 'PLUS ETF',
};

function normalizedQuery(query: string) {
  const compact = query.trim();
  return SEARCH_ALIASES[compact] || compact;
}

function normalizeQuote(quote: YahooQuote) {
  const raw = String(quote.symbol || '').toUpperCase();
  const kr = raw.match(/^(\d{6})\.(KS|KQ)$/);
  if (kr) {
    return {
      market: 'KR' as const,
      code: kr[1],
      feed: raw,
      name: quote.longname || quote.shortname || raw,
      currency: '₩' as const,
      type: quote.quoteType === 'ETF' ? 'ETF' : '주식',
      exchangeLabel: kr[2] === 'KQ' ? 'KOSDAQ' : 'KOSPI',
    };
  }

  const exchange = US_EXCHANGES[String(quote.exchange || '').toUpperCase()];
  if (!exchange || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(raw) || raw.includes('.')) return null;
  return {
    market: 'US' as const,
    code: raw,
    feed: raw,
    name: quote.longname || quote.shortname || raw,
    currency: '$' as const,
    exchange,
    type: quote.quoteType === 'ETF' ? 'ETF' : '주식',
    exchangeLabel: quote.exchDisp || (exchange === 'ND' ? 'NASDAQ' : exchange === 'NY' ? 'NYSE' : 'NYSE Arca/AMEX'),
  };
}

export async function GET(request: Request) {
  if (!await getUser(request)) return json({ error: '로그인이 필요합니다.' }, 401);
  const url = new URL(request.url);
  const query = String(url.searchParams.get('q') || '').trim().slice(0, 60);
  const market = String(url.searchParams.get('market') || '').toUpperCase() as Market | '';
  if (query.length < 1) return json({ results: [] });
  if (market && market !== 'US' && market !== 'KR') return json({ error: '시장 값이 올바르지 않습니다.' }, 400);

  const upstream = new URL('https://query1.finance.yahoo.com/v1/finance/search');
  upstream.searchParams.set('q', normalizedQuery(query));
  upstream.searchParams.set('quotesCount', '20');
  upstream.searchParams.set('newsCount', '0');
  upstream.searchParams.set('listsCount', '0');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(upstream, {
      headers: { Accept: 'application/json', 'User-Agent': 'StructureFlow/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) return json({ error: '종목 검색 서비스가 잠시 응답하지 않습니다.' }, 502);
    const payload = await response.json() as { quotes?: YahooQuote[] };
    const seen = new Set<string>();
    const results = (payload.quotes || [])
      .filter((quote) => quote.quoteType === 'EQUITY' || quote.quoteType === 'ETF')
      .map(normalizeQuote)
      .filter((item): item is NonNullable<ReturnType<typeof normalizeQuote>> => Boolean(item))
      .filter((item) => !market || item.market === market)
      .filter((item) => {
        const key = `${item.market}:${item.feed}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);
    return json({ results });
  } catch {
    return json({ error: '종목 검색 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.' }, 504);
  } finally {
    clearTimeout(timeout);
  }
}
