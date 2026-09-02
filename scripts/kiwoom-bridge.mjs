import { createServer } from 'node:http';
import {
  getCurrentPrice,
  getMarketChart,
  KiwoomError,
  parseQuoteRequests,
  quoteRequestKey,
} from '../lib/kiwoom.ts';

const host = process.env.KIWOOM_BRIDGE_HOST || '127.0.0.1';
const port = Number(process.env.KIWOOM_BRIDGE_PORT || 8790);
const bridgeToken = process.env.KIWOOM_BRIDGE_TOKEN?.trim();

if (!bridgeToken || bridgeToken.length < 32) {
  throw new Error('KIWOOM_BRIDGE_TOKEN은 32자 이상의 임의 문자열이어야 합니다.');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('KIWOOM_BRIDGE_PORT가 올바르지 않습니다.');
}

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json;charset=UTF-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function authorized(request) {
  return request.headers.authorization === `Bearer ${bridgeToken}`;
}

function publicError(error) {
  if (error instanceof KiwoomError) {
    return {
      error: error.message,
      code: error.code,
      httpStatus: error.status,
      retryable: error.retryable,
    };
  }
  return {
    error: '키움 데이터를 불러오지 못했습니다.',
    code: 'api',
    retryable: false,
  };
}

async function quotes(url, response) {
  let items;
  try {
    items = parseQuoteRequests(url.searchParams.get('items') || '');
  } catch (error) {
    json(response, 400, { error: publicError(error).error });
    return;
  }

  const settled = await Promise.allSettled(items.map((item) => getCurrentPrice(item)));
  const quoteValues = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const errors = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    return [{
      key: quoteRequestKey(items[index]),
      market: items[index].market,
      symbol: items[index].symbol,
      status: 'error',
      ...publicError(result.reason),
    }];
  });

  json(response, quoteValues.length ? 200 : 502, {
    quotes: quoteValues,
    errors,
    source: 'Kiwoom REST API · Local Bridge',
    fetchedAt: new Date().toISOString(),
    refreshAfterSeconds: 5,
  });
}

async function market(url, response) {
  const market = (url.searchParams.get('market') || 'US').toUpperCase();
  const symbol = (url.searchParams.get('symbol') || 'ONDS').toUpperCase();
  const exchange = (url.searchParams.get('exchange') || 'ND').toUpperCase();

  if (
    !['KR', 'US'].includes(market) ||
    (market === 'KR' && !/^\d{6}$/.test(symbol)) ||
    (market === 'US' && !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) ||
    (market === 'US' && !['NA', 'ND', 'NY'].includes(exchange))
  ) {
    json(response, 400, { error: '시장, 종목 코드 또는 미국 거래소 값이 올바르지 않습니다.' });
    return;
  }

  try {
    const chart = await getMarketChart({
      market,
      symbol,
      ...(market === 'US' ? { exchange } : {}),
    });
    json(response, 200, { ...chart, fetchedAt: new Date().toISOString() });
  } catch (error) {
    const details = publicError(error);
    json(response, details.code === 'authentication' ? 503 : 502, details);
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' || !request.url) {
      json(response, 405, { error: 'GET 요청만 허용됩니다.' });
      return;
    }

    const url = new URL(request.url, `http://${host}:${port}`);
    if (url.pathname === '/health') {
      json(response, 200, { status: 'ok', service: 'structureflow-kiwoom-bridge' });
      return;
    }
    if (!authorized(request)) {
      json(response, 401, { error: '브리지 인증에 실패했습니다.' });
      return;
    }
    if (url.pathname === '/api/quotes') {
      await quotes(url, response);
      return;
    }
    if (url.pathname === '/api/market') {
      await market(url, response);
      return;
    }
    json(response, 404, { error: '지원하지 않는 경로입니다.' });
  } catch (error) {
    console.error('[bridge] request failed', error instanceof Error ? error.message : error);
    if (!response.headersSent) json(response, 500, { error: '브리지 처리 중 오류가 발생했습니다.' });
    else response.end();
  }
});

server.listen(port, host, () => {
  console.log(`StructureFlow Kiwoom Bridge: http://${host}:${port}`);
});
