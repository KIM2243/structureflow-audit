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

const validKrSymbol = /^\d{6}$/;
const validUsSymbol = /^[A-Z][A-Z0-9.-]{0,9}$/;
const validUsExchanges = new Set<KiwoomUsExchange>(['NA', 'ND', 'NY']);

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (isKiwoomBridgeConfigured()) {
    try {
      return await fetchFromKiwoomBridge(
        '/api/market',
        url.searchParams,
        request.signal,
      );
    } catch (error) {
      console.error(
        `[bridge] market request failed message=${error instanceof Error ? error.message : 'unknown'}`,
      );
      return Response.json(
        { error: '키움 시세 브리지에 연결하지 못했습니다.' },
        { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
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
    const chart = await getMarketChart(
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
