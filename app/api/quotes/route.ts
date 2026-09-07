import {
  getCurrentPrice,
  KiwoomError,
  parseQuoteRequests,
  quoteRequestKey,
  type KiwoomQuoteRequest,
} from '@/lib/kiwoom';
import {
  fetchFromKiwoomBridge,
  isKiwoomBridgeConfigured,
} from '@/lib/bridge';
import { getUser } from '@/lib/auth';
import { getYahooCurrentPrice } from '@/lib/yahoo-market';

const REQUEST_STAGGER_MS = 1_100;

function redactSensitiveLogValue(value: string) {
  const configuredSecrets = [
    process.env.APP_KEY,
    process.env.APP_SECRET,
    process.env.APP_KEY_MOCK,
    process.env.APP_SECRET_MOCK,
  ].filter((secret): secret is string => Boolean(secret));
  let redacted = value;
  for (const secret of configuredSecrets) {
    redacted = redacted.replaceAll(secret, '[REDACTED]');
  }
  return redacted
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .slice(0, 500);
}

function delay(ms: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (!ms) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function publicError(error: unknown) {
  if (error instanceof KiwoomError) {
    return {
      error: error.message,
      code: error.code,
      httpStatus: error.status,
      retryable: error.retryable,
    };
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      error: '시세 요청이 취소되었습니다.',
      code: 'network',
      retryable: true,
    };
  }
  return {
    error: '시세를 불러오지 못했습니다.',
    code: 'api',
    retryable: false,
  };
}

async function fetchStaggeredQuote(
  item: KiwoomQuoteRequest,
  index: number,
  signal: AbortSignal,
) {
  await delay(index * REQUEST_STAGGER_MS, signal);
  return getCurrentPrice(item, signal);
}

type QuotePayload = {
  quotes?: Awaited<ReturnType<typeof getCurrentPrice>>[];
  errors?: Array<Record<string, unknown> & { key?: string }>;
  fetchedAt?: string;
  refreshAfterSeconds?: number;
};

async function fillMissingWithYahoo(
  items: KiwoomQuoteRequest[],
  payload: QuotePayload,
  signal: AbortSignal,
) {
  const quotes = payload.quotes || [];
  const quoteKeys = new Set(quotes.map((quote) => quote.key));
  const missing = items.filter((item) => !quoteKeys.has(quoteRequestKey(item)));
  if (!missing.length) return payload;

  const settled = await Promise.allSettled(
    missing.map((item) => getYahooCurrentPrice(item, signal)),
  );
  const fallbackQuotes = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const recoveredKeys = new Set(fallbackQuotes.map((quote) => quote.key));
  return {
    ...payload,
    quotes: [...quotes, ...fallbackQuotes],
    errors: (payload.errors || []).filter(
      (error) => !error.key || !recoveredKeys.has(error.key),
    ),
    fetchedAt: new Date().toISOString(),
    refreshAfterSeconds: payload.refreshAfterSeconds || 5,
  };
}

export async function GET(request: Request) {
  if (!await getUser(request)) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const url = new URL(request.url);
  let items: KiwoomQuoteRequest[];
  try {
    items = parseQuoteRequests(url.searchParams.get('items') || '');
  } catch (error) {
    return Response.json(
      { error: publicError(error).error },
      { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
  if (isKiwoomBridgeConfigured()) {
    try {
      const bridged = await fetchFromKiwoomBridge(
        '/api/quotes',
        url.searchParams,
        request.signal,
      );
      const bridgePayload = await bridged.json() as QuotePayload;
      const payload = await fillMissingWithYahoo(items, bridgePayload, request.signal);
      const quotes = payload.quotes || [];
      return Response.json(payload, {
        status: quotes.length ? 200 : bridged.status,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    } catch (error) {
      console.error(
        `[bridge] quote request failed message=${error instanceof Error ? error.message : 'unknown'}`,
      );
      const payload = await fillMissingWithYahoo(items, {}, request.signal);
      if (payload.quotes?.length) {
        return Response.json(payload, {
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
      }
      return Response.json({ error: '실시간 시세 제공처에 연결하지 못했습니다.' }, { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }
  }

  const settled = await Promise.allSettled(
    items.map((item, index) =>
      fetchStaggeredQuote(item, index, request.signal),
    ),
  );
  const quotes = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const errors = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const details = publicError(result.reason);
    const item = items[index];
    if (details.code !== 'configuration') {
      console.error(
        `[kiwoom] quote failed market=${item.market} symbol=${item.symbol} code=${details.code} status=${details.httpStatus || '-'} retryable=${details.retryable} message=${redactSensitiveLogValue(details.error)}`,
      );
    }
    return [
      {
        key: quoteRequestKey(item),
        market: item.market,
        symbol: item.symbol,
        status: 'error' as const,
        ...details,
      },
    ];
  });

  const configurationError = errors.some(
    (error) => error.code === 'configuration',
  );
  return Response.json(
    {
      quotes,
      errors,
      source: 'Kiwoom REST API',
      fetchedAt: new Date().toISOString(),
      refreshAfterSeconds: 5,
    },
    {
      status: quotes.length ? 200 : configurationError ? 503 : 502,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
