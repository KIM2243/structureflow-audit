import {
  getMarketChart,
  KiwoomError,
  type KiwoomMarket,
  type KiwoomUsExchange,
} from '@/lib/kiwoom';
import {
  fetchFromKiwoomBridge,
  isKiwoomBridgeConfigured,
} from '@/lib/bridge';
import { getUser } from '@/lib/auth';
import { getYahooMarketChart } from '@/lib/yahoo-market';

const validKrSymbol = /^\d{6}$/;
const validUsSymbol = /^[A-Z][A-Z0-9.-]{0,9}$/;
const validUsExchanges = new Set<KiwoomUsExchange>(['NA', 'ND', 'NY']);

export async function GET(request: Request) {
  if (!await getUser(request)) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const url = new URL(request.url);
  if (isKiwoomBridgeConfigured()) {
    try {
      const bridged = await fetchFromKiwoomBridge(
        '/api/market',
        url.searchParams,
        request.signal,
      );
      if (bridged.ok || bridged.status < 500) return bridged;
      console.warn(`[bridge] market fallback status=${bridged.status}`);
    } catch (error) {
      console.error(
        `[bridge] market request failed message=${error instanceof Error ? error.message : 'unknown'}`,
      );
      console.warn('[bridge] using market fallback');
    }
  }
  const market = (url.searchParams.get('market') || 'US').toUpperCase();
  const symbol = (url.searchParams.get('symbol') || 'ONDS').toUpperCase();
  const exchangeValue = (
    url.searchParams.get('exchange') || 'ND'
  ).toUpperCase();

  if (
    (market !== 'KR' && market !== 'US') ||
    (market === 'KR' && !validKrSymbol.test(symbol)) ||
    (market === 'US' && !validUsSymbol.test(symbol)) ||
    (market === 'US' &&
      !validUsExchanges.has(exchangeValue as KiwoomUsExchange))
  ) {
    return Response.json(
      { error: '시장, 종목 코드 또는 미국 거래소 값이 올바르지 않습니다.' },
      { status: 400 },
    );
  }

  try {
    const chart = isKiwoomBridgeConfigured()
      ? await getYahooMarketChart(market as KiwoomMarket, symbol)
      : await getMarketChart(
      {
        market: market as KiwoomMarket,
        symbol,
        ...(market === 'US'
          ? { exchange: exchangeValue as KiwoomUsExchange }
          : {}),
      },
      request.signal,
    );
    return Response.json(
      { ...chart, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const known = error instanceof KiwoomError;
    console.error(
      `[market-api] chart failed market=${market} symbol=${symbol} code=${known ? error.code : 'unknown'} status=${known ? error.status || '-' : '-'}`,
    );
    return Response.json(
      {
        error: known
          ? error.message
          : '키움 차트 시세를 불러오지 못했습니다.',
      },
      {
        status:
          known &&
          (error.code === 'configuration' || error.code === 'authentication')
            ? 503
            : 502,
      },
    );
  }
}
