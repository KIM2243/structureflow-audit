type YahooQuote = {
  open: Array<number | null>;
  high: Array<number | null>;
  low: Array<number | null>;
  close: Array<number | null>;
  volume: Array<number | null>;
};

type YahooResult = {
  timestamp?: number[];
  indicators?: { quote?: YahooQuote[] };
  meta: {
    symbol?: string;
    exchangeName?: string;
    currency?: string;
    shortName?: string;
    longName?: string;
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    regularMarketTime?: number;
    marketState?: string;
  };
};

type YahooResponse = {
  chart?: { result?: YahooResult[] | null };
};

const validSymbol = (symbol: string) =>
  /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) || /^\d{6}\.(KS|KQ)$/.test(symbol);

async function fetchQuote(symbol: string) {
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m&includePrePost=true&events=div%2Csplits`;
  const response = await fetch(endpoint, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 StructureFlow/1.0' },
  });
  if (!response.ok) throw new Error(`데이터 제공처 오류 ${response.status}`);

  const json = (await response.json()) as YahooResponse;
  const result = json.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result || !quote) throw new Error('가격 데이터가 없습니다.');

  const timestamps = result.timestamp || [];
  let latestIndex = -1;
  for (let index = quote.close.length - 1; index >= 0; index -= 1) {
    if (typeof quote.close[index] === 'number') {
      latestIndex = index;
      break;
    }
  }

  const latestClose =
    latestIndex >= 0 ? (quote.close[latestIndex] as number) : undefined;
  const price = latestClose ?? result.meta.regularMarketPrice;
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new Error('현재 가격이 없습니다.');
  }

  const previousClose =
    result.meta.chartPreviousClose ?? result.meta.previousClose ?? price;
  const change = price - previousClose;
  const timestampSeconds =
    (latestIndex >= 0 ? timestamps[latestIndex] : undefined) ??
    result.meta.regularMarketTime ??
    Math.floor(Date.now() / 1000);
  const open = latestIndex >= 0 ? quote.open[latestIndex] : null;
  const high = latestIndex >= 0 ? quote.high[latestIndex] : null;
  const low = latestIndex >= 0 ? quote.low[latestIndex] : null;
  const volume = latestIndex >= 0 ? quote.volume[latestIndex] : null;

  return {
    symbol,
    name: result.meta.shortName || result.meta.longName || symbol,
    exchange: result.meta.exchangeName,
    currency: result.meta.currency,
    price,
    previousClose,
    change,
    changePct: previousClose ? (change / previousClose) * 100 : 0,
    timestamp: new Date(timestampSeconds * 1000).toISOString(),
    marketState: result.meta.marketState || 'UNKNOWN',
    candle: {
      date: new Date(timestampSeconds * 1000).toISOString(),
      open: typeof open === 'number' ? open : price,
      high: typeof high === 'number' ? high : price,
      low: typeof low === 'number' ? low : price,
      close: price,
      volume: typeof volume === 'number' ? volume : 0,
    },
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbols = Array.from(
    new Set(
      (url.searchParams.get('symbols') || '')
        .split(',')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  if (
    !symbols.length ||
    symbols.length > 3 ||
    symbols.some((symbol) => !validSymbol(symbol))
  ) {
    return Response.json(
      { error: '올바른 종목을 1개에서 3개까지 지정하세요.' },
      { status: 400 },
    );
  }

  const settled = await Promise.allSettled(symbols.map(fetchQuote));
  const quotes = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const errors = settled.flatMap((result, index) =>
    result.status === 'rejected'
      ? [
          {
            symbol: symbols[index],
            error:
              result.reason instanceof Error
                ? result.reason.message
                : '시세를 불러오지 못했습니다.',
          },
        ]
      : [],
  );

  return Response.json(
    {
      quotes,
      errors,
      source: 'Yahoo Finance chart feed',
      fetchedAt: new Date().toISOString(),
      refreshAfterSeconds: 15,
    },
    {
      status: quotes.length ? 200 : 502,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
