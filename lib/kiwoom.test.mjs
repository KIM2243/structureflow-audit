import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCurrentPrice,
  getMarketChart,
  KiwoomError,
  parseQuoteRequests,
  quoteRequestKey,
  resetKiwoomTokenCacheForTests,
} from './kiwoom.ts';

const originalFetch = globalThis.fetch;
const envNames = [
  'KIWOOM_MODE',
  'APP_KEY',
  'APP_SECRET',
  'APP_KEY_MOCK',
  'APP_SECRET_MOCK',
  'KIWOOM_TIMEOUT_MS',
];
const originalEnv = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]]),
);

function jsonResponse(body, status = 200, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function tokenResponse(token = 'test-token') {
  return jsonResponse({
    expires_dt: '20991231235959',
    token_type: 'bearer',
    token,
    return_code: 0,
    return_msg: '정상',
  });
}

function domesticResponse(overrides = {}) {
  return jsonResponse({
    stk_cd: '005930',
    stk_nm: '삼성전자',
    cur_prc: '+70000',
    pred_pre: '-1000',
    flu_rt: '-1.41',
    base_pric: '71000',
    open_pric: '+70500',
    high_pric: '+71000',
    low_pric: '-69500',
    return_code: 0,
    return_msg: '정상',
    ...overrides,
  });
}

function usResponse(overrides = {}) {
  return jsonResponse({
    stex_tp: 'ND',
    stk_cd: 'AAPL',
    stk_nm: '애플',
    cur_prc: '+230.1500',
    pred_pre: '+1.3200',
    flu_rt: '+0.58',
    base_close_pric: '228.8300',
    return_code: 0,
    return_msg: '정상',
    ...overrides,
  });
}

function prepare() {
  process.env.KIWOOM_MODE = 'demo';
  process.env.APP_KEY_MOCK = 'mock-key';
  process.env.APP_SECRET_MOCK = 'mock-secret';
  process.env.KIWOOM_TIMEOUT_MS = '6000';
  resetKiwoomTokenCacheForTests();
}

function restore() {
  globalThis.fetch = originalFetch;
  resetKiwoomTokenCacheForTests();
  for (const name of envNames) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test('1~3개의 한국/미국 혼합 종목을 파싱하고 4번째를 차단한다', () => {
  const one = parseQuoteRequests('KR:005930');
  assert.equal(one.length, 1);
  assert.equal(quoteRequestKey(one[0]), 'KR:005930');

  const mixed = parseQuoteRequests('KR:005930,US:ND:AAPL,US:NY:IBM');
  assert.deepEqual(mixed.map(quoteRequestKey), [
    'KR:005930',
    'US:ND:AAPL',
    'US:NY:IBM',
  ]);
  assert.throws(
    () => parseQuoteRequests('KR:005930,US:ND:AAPL,US:ND:NVDA,US:NY:IBM'),
    KiwoomError,
  );
});

test('동시 시세 요청에서도 인증 토큰을 한 번만 발급하고 재사용한다', async () => {
  prepare();
  let tokenCalls = 0;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: requestUrl(url), init });
    if (requestUrl(url).endsWith('/oauth2/token')) {
      tokenCalls += 1;
      return tokenResponse();
    }
    return requestUrl(url).includes('/api/us/')
      ? usResponse()
      : domesticResponse();
  };
  try {
    const [kr, us] = await Promise.all([
      getCurrentPrice({ market: 'KR', symbol: '005930' }),
      getCurrentPrice({ market: 'US', symbol: 'AAPL', exchange: 'ND' }),
    ]);
    assert.equal(tokenCalls, 1);
    assert.equal(kr.name, '삼성전자');
    assert.equal(kr.previousClose, 71000);
    assert.equal('candle' in kr, false);
    assert.equal(us.price, 230.15);
    assert.equal(us.previousClose, 228.83);

    const tokenCall = calls.find((call) => call.url.endsWith('/oauth2/token'));
    assert.equal(tokenCall.init.method, 'POST');
    assert.deepEqual(JSON.parse(tokenCall.init.body), {
      grant_type: 'client_credentials',
      appkey: 'mock-key',
      secretkey: 'mock-secret',
    });

    const domesticCall = calls.find((call) =>
      call.url.endsWith('/api/dostk/stkinfo'),
    );
    assert.equal(domesticCall.init.headers['api-id'], 'ka10001');
    assert.equal(domesticCall.init.headers.authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(domesticCall.init.body), { stk_cd: '005930' });

    const usCall = calls.find((call) => call.url.endsWith('/api/us/mrkcond'));
    assert.equal(usCall.init.headers['api-id'], 'usa20100');
    assert.equal(usCall.init.headers.authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(usCall.init.body), {
      stex_tp: 'ND',
      stk_cd: 'AAPL',
    });
  } finally {
    restore();
  }
});

test('한국 차트는 키움 5·15·60분봉과 일봉을 사용하고 4시간봉만 60분봉에서 만든다', async () => {
  prepare();
  const chartCalls = [];
  globalThis.fetch = async (url, init) => {
    if (requestUrl(url).endsWith('/oauth2/token')) return tokenResponse();
    const body = JSON.parse(init.body);
    chartCalls.push({ apiId: init.headers['api-id'], body });
    if (init.headers['api-id'] === 'ka10081') {
      return jsonResponse({
        stk_dt_pole_chart_qry: [
          {
            cur_prc: '+71000',
            trde_qty: '1200000',
            dt: '20260828',
            open_pric: '+70000',
            high_pric: '+71500',
            low_pric: '+69500',
          },
          {
            cur_prc: '+70000',
            trde_qty: '1100000',
            dt: '20260827',
            open_pric: '+69000',
            high_pric: '+70500',
            low_pric: '+68500',
          },
        ],
        return_code: 0,
      });
    }
    const scope = body.tic_scope;
    const rows = Array.from({ length: scope === '60' ? 8 : 3 }, (_, index) => {
      const hour = String(9 + index).padStart(2, '0');
      const price = 70000 + index * 100;
      return {
        cur_prc: `+${price}`,
        trde_qty: '1000',
        cntr_tm: `20260828${hour}0000`,
        open_pric: `+${price - 50}`,
        high_pric: `+${price + 100}`,
        low_pric: `+${price - 100}`,
      };
    }).reverse();
    return jsonResponse({ stk_min_pole_chart_qry: rows, return_code: 0 });
  };
  try {
    const chart = await getMarketChart({ market: 'KR', symbol: '005930' });
    assert.equal(chart.candles.length, 3);
    assert.equal(chart.timeframes['15m'].length, 3);
    assert.equal(chart.timeframes['1H'].length, 8);
    assert.equal(chart.timeframes['4H'].length, 2);
    assert.equal(chart.timeframes['1D'].length, 2);
    assert.ok(Date.parse(chart.candles[0].date) < Date.parse(chart.candles[2].date));
    assert.deepEqual(
      chartCalls.map((call) => call.apiId),
      ['ka10080', 'ka10080', 'ka10080', 'ka10081'],
    );
    assert.deepEqual(
      chartCalls.slice(0, 3).map((call) => call.body.tic_scope),
      ['5', '15', '60'],
    );
    assert.ok(chartCalls.every((call) => call.body.stk_cd === '005930'));
  } finally {
    restore();
  }
});

test('미국 차트는 거래소·달러 기준의 키움 분봉과 일봉 규격을 사용한다', async () => {
  prepare();
  const chartCalls = [];
  globalThis.fetch = async (url, init) => {
    if (requestUrl(url).endsWith('/oauth2/token')) return tokenResponse();
    const body = JSON.parse(init.body);
    chartCalls.push({ apiId: init.headers['api-id'], body });
    if (init.headers['api-id'] === 'usa06012') {
      return jsonResponse({
        result_list: [
          {
            cur_prc: '230.15',
            acc_trde_qty: '1200000',
            open_pric: '228.00',
            high_pric: '231.00',
            low_pric: '227.50',
            dt: '20260828',
          },
        ],
        return_code: 0,
      });
    }
    const count = body.tic_scope === '60' ? 8 : 3;
    return jsonResponse({
      result_list: Array.from({ length: count }, (_, index) => {
        const hour = String(9 + index).padStart(2, '0');
        const price = 228 + index * 0.25;
        return {
          cur_prc: price.toFixed(2),
          trde_qty: '500',
          open_pric: (price - 0.1).toFixed(2),
          high_pric: (price + 0.2).toFixed(2),
          low_pric: (price - 0.2).toFixed(2),
          cntr_tm: `${hour}3000`,
          bus_dt: '20260828',
        };
      }).reverse(),
      return_code: 0,
    });
  };
  try {
    const chart = await getMarketChart({
      market: 'US',
      symbol: 'AAPL',
      exchange: 'ND',
    });
    assert.equal(chart.currency, 'USD');
    assert.equal(chart.timeframes['4H'].length, 2);
    assert.ok(
      chartCalls.every(
        (call) =>
          call.body.stex_tp === 'ND' &&
          call.body.stk_cd === 'AAPL' &&
          call.body.exrt_appl_tp === '0' &&
          call.body.upd_stkpc_tp === '1',
      ),
    );
    assert.deepEqual(
      chartCalls.map((call) => call.apiId),
      ['usa06011', 'usa06011', 'usa06011', 'usa06012'],
    );
  } finally {
    restore();
  }
});

test('현재가가 차트보다 높아도 키움 원본 OHLC와 미완성 일봉을 변경하지 않는다', async () => {
  prepare();
  globalThis.fetch = async (url, init) => {
    if (requestUrl(url).endsWith('/oauth2/token')) return tokenResponse();
    const apiId = init.headers['api-id'];
    if (apiId === 'usa20100') {
      return usResponse({
        stk_cd: 'ONDS',
        stk_nm: 'Ondas Holdings',
        cur_prc: '8.20',
        pred_pre: '+0.35',
        flu_rt: '+4.46',
        base_close_pric: '7.85',
        open_pric: '8.10',
        high_pric: '8.50',
        low_pric: '7.70',
      });
    }
    if (apiId === 'usa06012') {
      return jsonResponse({
        result_list: [
          {
            cur_prc: '7.85',
            acc_trde_qty: '69966746',
            open_pric: '8.56',
            high_pric: '8.7099',
            low_pric: '7.8701',
            dt: '20260828',
          },
        ],
        return_code: 0,
      });
    }
    return jsonResponse({
      result_list: [
        {
          cur_prc: '7.86',
          trde_qty: '1352',
          open_pric: '7.84',
          high_pric: '7.86',
          low_pric: '7.84',
          cntr_tm: '20260828243000',
          bus_dt: '20260828',
        },
      ],
      return_code: 0,
    });
  };
  try {
    const chart = await getMarketChart({
      market: 'US',
      symbol: 'ONDS',
      exchange: 'ND',
    });
    const beforeQuote = structuredClone(chart);
    const quote = await getCurrentPrice({
      market: 'US',
      symbol: 'ONDS',
      exchange: 'ND',
    });
    const originalMinuteOhlc = {
      open: 7.84,
      high: 7.86,
      low: 7.84,
      close: 7.86,
    };
    for (const candle of [
      chart.candles[0],
      chart.timeframes['15m'][0],
      chart.timeframes['1H'][0],
    ]) {
      assert.deepEqual(
        {
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        },
        originalMinuteOhlc,
      );
    }
    assert.deepEqual(
      {
        open: chart.timeframes['1D'][0].open,
        high: chart.timeframes['1D'][0].high,
        low: chart.timeframes['1D'][0].low,
        close: chart.timeframes['1D'][0].close,
      },
      { open: 8.56, high: 8.7099, low: 7.8701, close: 7.85 },
    );
    assert.equal(quote.price, 8.2);
    assert.equal('candle' in quote, false);
    assert.deepEqual(chart, beforeQuote);
  } finally {
    restore();
  }
});

test('실전 국내 현재가는 차트와 같은 KRX+NXT 통합 코드를 요청한다', async () => {
  prepare();
  process.env.KIWOOM_MODE = 'real';
  process.env.APP_KEY = 'real-test-key';
  process.env.APP_SECRET = 'real-test-secret';
  globalThis.fetch = async (url, init) => {
    if (requestUrl(url).endsWith('/oauth2/token')) return tokenResponse();
    assert.equal(JSON.parse(init.body).stk_cd, '005930_AL');
    return domesticResponse();
  };
  try {
    const quote = await getCurrentPrice({ market: 'KR', symbol: '005930' });
    assert.equal(quote.key, 'KR:005930');
    assert.equal(quote.exchange, 'KRX+NXT (SOR)');
  } finally { restore(); }
});

test('HTTP 429는 제한된 횟수만 재시도한 뒤 정상 응답을 반환한다', async () => {
  prepare();
  let quoteCalls = 0;
  globalThis.fetch = async (url) => {
    if (requestUrl(url).endsWith('/oauth2/token')) return tokenResponse();
    quoteCalls += 1;
    if (quoteCalls === 1) {
      return jsonResponse({ return_msg: 'rate limited' }, 429, {
        'Retry-After': '0',
      });
    }
    return domesticResponse();
  };
  try {
    const quote = await getCurrentPrice({ market: 'KR', symbol: '005930' });
    assert.equal(quote.status, 'ok');
    assert.equal(quoteCalls, 2);
  } finally {
    restore();
  }
});

test('인증 실패 시 토큰을 한 번 갱신하고 시세 요청을 재시도한다', async () => {
  prepare();
  let tokenCalls = 0;
  let quoteCalls = 0;
  globalThis.fetch = async (url) => {
    if (requestUrl(url).endsWith('/oauth2/token')) {
      tokenCalls += 1;
      return tokenResponse(`test-token-${tokenCalls}`);
    }
    quoteCalls += 1;
    return quoteCalls === 1
      ? jsonResponse({ return_msg: 'unauthorized' }, 401)
      : usResponse();
  };
  try {
    const quote = await getCurrentPrice({
      market: 'US',
      symbol: 'AAPL',
      exchange: 'ND',
    });
    assert.equal(quote.symbol, 'AAPL');
    assert.equal(tokenCalls, 2);
    assert.equal(quoteCalls, 2);
  } finally {
    restore();
  }
});

test('만료된 토큰은 다음 요청에서 다시 발급한다', async () => {
  prepare();
  let tokenCalls = 0;
  globalThis.fetch = async (url) => {
    if (requestUrl(url).endsWith('/oauth2/token')) {
      tokenCalls += 1;
      return jsonResponse({
        expires_dt: '20200101000000',
        token_type: 'Bearer',
        token: `expired-token-${tokenCalls}`,
        return_code: 0,
        return_msg: '정상',
      });
    }
    return domesticResponse();
  };
  try {
    await getCurrentPrice({ market: 'KR', symbol: '005930' });
    await getCurrentPrice({ market: 'KR', symbol: '005930' });
    assert.equal(tokenCalls, 2);
  } finally {
    restore();
  }
});

test('한 종목 실패가 함께 조회하는 다른 종목의 성공을 막지 않는다', async () => {
  prepare();
  globalThis.fetch = async (url) => {
    if (requestUrl(url).endsWith('/oauth2/token')) return tokenResponse();
    if (requestUrl(url).includes('/api/us/')) return usResponse();
    return jsonResponse({ return_msg: '잘못된 종목' }, 400);
  };
  try {
    const settled = await Promise.allSettled([
      getCurrentPrice({ market: 'KR', symbol: '999999' }),
      getCurrentPrice({ market: 'US', symbol: 'AAPL', exchange: 'ND' }),
    ]);
    assert.equal(settled[0].status, 'rejected');
    assert.equal(settled[1].status, 'fulfilled');
  } finally {
    restore();
  }
});

test('응답 시간 초과는 무한 대기하지 않고 제한된 재시도 후 종료한다', async () => {
  prepare();
  process.env.KIWOOM_TIMEOUT_MS = '100';
  let quoteCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (requestUrl(url).endsWith('/oauth2/token')) return tokenResponse();
    quoteCalls += 1;
    return new Promise((_, reject) => {
      init.signal.addEventListener(
        'abort',
        () => reject(new DOMException('aborted', 'AbortError')),
        { once: true },
      );
    });
  };
  try {
    await assert.rejects(
      getCurrentPrice({ market: 'KR', symbol: '005930' }),
      (error) => error instanceof KiwoomError && error.code === 'timeout',
    );
    assert.equal(quoteCalls, 3);
  } finally {
    restore();
  }
});
