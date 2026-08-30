type YahooQuote = {
  open: Array<number | null>;
  high: Array<number | null>;
  low: Array<number | null>;
  close: Array<number | null>;
  volume: Array<number | null>;
};

type YahooResult = {
  timestamp: number[];
  indicators: { quote: YahooQuote[] };
  meta: {
    exchangeName?: string;
    currency?: string;
    regularMarketPrice?: number;
    shortName?: string;
    longName?: string;
  };
};

type YahooResponse = {
  chart?: { result?: YahooResult[] | null };
};

const validSymbol = (symbol: string) =>
  /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) || /^\d{6}\.(KS|KQ)$/.test(symbol);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get('symbol') || 'ONDS').toUpperCase();
  if (!validSymbol(symbol)) {
    return Response.json(
      { error: '올바른 미국 티커 또는 한국 종목 코드를 입력하세요.' },
      { status: 400 },
    );
  }

  try {
    const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=60d&interval=15m&includePrePost=false&events=div%2Csplits`;
    const response = await fetch(endpoint, {
      headers: { 'User-Agent': 'Mozilla/5.0 StructureFlow/1.0' },
    });
    if (!response.ok) throw new Error(`데이터 제공처 오류 ${response.status}`);

    const json = (await response.json()) as YahooResponse;
    const result = json.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    if (!result || !quote) throw new Error('가격 데이터가 없습니다.');

    const candles = result.timestamp
      .map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString(),
        open: quote.open[index],
        high: quote.high[index],
        low: quote.low[index],
        close: quote.close[index],
        volume: quote.volume[index] || 0,
      }))
      .filter(
        (
          candle,
        ): candle is {
          date: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        } =>
          typeof candle.open === 'number' &&
          typeof candle.high === 'number' &&
          typeof candle.low === 'number' &&
          typeof candle.close === 'number' &&
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close),
      );

    return Response.json(
      {
        symbol,
        exchange: result.meta.exchangeName,
        currency: result.meta.currency,
        name: result.meta.shortName || result.meta.longName || symbol,
        regularMarketPrice: result.meta.regularMarketPrice,
        candles,
        source: 'Yahoo Finance chart feed',
        fetchedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : '시세를 불러오지 못했습니다.',
      },
      { status: 502 },
    );
  }
}
