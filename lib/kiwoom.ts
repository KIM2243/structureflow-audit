export type KiwoomMarket = 'KR' | 'US';
export type KiwoomUsExchange = 'NA' | 'ND' | 'NY';

export type KiwoomQuoteRequest = {
  market: KiwoomMarket;
  symbol: string;
  exchange?: KiwoomUsExchange;
};

export type KiwoomCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type KiwoomChart = {
  symbol: string;
  market: KiwoomMarket;
  exchange: string;
  currency: 'KRW' | 'USD';
  source: string;
  candles: KiwoomCandle[];
  timeframes: {
    '15m': KiwoomCandle[];
    '1H': KiwoomCandle[];
    '4H': KiwoomCandle[];
    '1D': KiwoomCandle[];
  };
};

export type KiwoomQuote = {
  key: string;
  market: KiwoomMarket;
  symbol: string;
  name: string;
  exchange: string;
  currency: 'KRW' | 'USD';
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  timestamp: string;
  lastUpdated: string;
  marketState: 'UNKNOWN';
  status: 'ok';
};

type KiwoomMode = 'real' | 'demo';

type KiwoomConfig = {
  mode: KiwoomMode;
  baseUrl: string;
  appKey: string;
  appSecret: string;
  timeoutMs: number;
};

type TokenResponse = {
  expires_dt?: string;
  token_type?: string;
  token?: string;
  return_code?: number;
  return_msg?: string;
};

type DomesticQuoteResponse = {
  stk_cd?: string;
  stk_nm?: string;
  cur_prc?: string;
  pred_pre?: string;
  flu_rt?: string;
  base_pric?: string;
  open_pric?: string;
  high_pric?: string;
  low_pric?: string;
  return_code?: number;
  return_msg?: string;
};

type UsQuoteResponse = DomesticQuoteResponse & {
  stex_tp?: KiwoomUsExchange;
  stk_enm?: string;
  base_close_pric?: string;
  curr_unit?: string;
};

type ChartRecord = {
  cur_prc?: string;
  trde_qty?: string;
  acc_trde_qty?: string;
  cntr_tm?: string;
  bus_dt?: string;
  dt?: string;
  open_pric?: string;
  high_pric?: string;
  low_pric?: string;
};

type DomesticMinuteChartResponse = {
  stk_cd?: string;
  stk_min_pole_chart_qry?: Array<ChartRecord | unknown[]>;
  return_code?: number;
  return_msg?: string;
};

type DomesticDailyChartResponse = {
  stk_cd?: string;
  stk_dt_pole_chart_qry?: Array<ChartRecord | unknown[]>;
  return_code?: number;
  return_msg?: string;
};

type UsChartResponse = {
  result_list?: Array<ChartRecord | unknown[]>;
  return_code?: number;
  return_msg?: string;
};

type ApiPayload = {
  return_code?: number;
  return_msg?: string;
};

type Continuation = {
  contYn: string;
  nextKey: string;
};

type CachedToken = {
  token: string;
  tokenType: string;
  expiresAt: number;
  cacheKey: string;
};

export type KiwoomErrorCode =
  | 'configuration'
  | 'authentication'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'server'
  | 'api'
  | 'invalid_response';

export class KiwoomError extends Error {
  readonly code: KiwoomErrorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      code: KiwoomErrorCode;
      status?: number;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'KiwoomError';
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

const REAL_BASE_URL = 'https://api.kiwoom.com';
const DEMO_BASE_URL = 'https://mockapi.kiwoom.com';
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;
const CHART_REQUEST_DELAY_MS = 250;
const MAX_CHART_PAGES = 20;
const MAX_CHART_RECORDS = 2_000;
const CHART_CANDLE_LIMIT = 400;

let cachedToken: CachedToken | null = null;
let tokenRequest: Promise<CachedToken> | null = null;

function readConfig(): KiwoomConfig {
  const modeValue = (process.env.KIWOOM_MODE || 'demo').toLowerCase();
  if (modeValue !== 'real' && modeValue !== 'demo') {
    throw new KiwoomError('KIWOOM_MODE는 real 또는 demo여야 합니다.', {
      code: 'configuration',
    });
  }

  const mode = modeValue as KiwoomMode;
  const appKey =
    mode === 'real' ? process.env.APP_KEY : process.env.APP_KEY_MOCK;
  const appSecret =
    mode === 'real' ? process.env.APP_SECRET : process.env.APP_SECRET_MOCK;
  if (!appKey || !appSecret) {
    const names =
      mode === 'real'
        ? 'APP_KEY와 APP_SECRET'
        : 'APP_KEY_MOCK과 APP_SECRET_MOCK';
    throw new KiwoomError(
      `키움 ${mode === 'real' ? '운영' : '모의투자'}용 ${names}을 환경변수에 설정하세요.`,
      { code: 'configuration' },
    );
  }

  const configuredTimeout = Number(process.env.KIWOOM_TIMEOUT_MS);
  return {
    mode,
    baseUrl: mode === 'real' ? REAL_BASE_URL : DEMO_BASE_URL,
    appKey,
    appSecret,
    timeoutMs:
      Number.isFinite(configuredTimeout) && configuredTimeout >= 100
        ? configuredTimeout
        : DEFAULT_TIMEOUT_MS,
  };
}

function parseExpiry(value?: string) {
  if (!value || !/^\d{14}$/.test(value)) return Date.now() + 23 * 60 * 60_000;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+09:00`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Date.now() + 23 * 60 * 60_000;
}

function numeric(value: unknown, fieldName: string) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new KiwoomError(`키움 응답에 ${fieldName} 값이 없습니다.`, {
      code: 'invalid_response',
    });
  }
  const parsed = Number(String(value).replaceAll(',', '').trim());
  if (!Number.isFinite(parsed)) {
    throw new KiwoomError(`키움 응답의 ${fieldName} 값이 올바르지 않습니다.`, {
      code: 'invalid_response',
    });
  }
  return parsed;
}

function optionalAbsolute(value: unknown, fallback: number) {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const parsed = Number(String(value).replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? Math.abs(parsed) : fallback;
}

function retryAfterMs(response: Response, retryIndex: number) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1_000, 5_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date))
      return Math.min(Math.max(date - Date.now(), 0), 5_000);
  }
  return RETRY_BASE_DELAY_MS * 2 ** retryIndex;
}

function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  if (externalSignal?.aborted) abortFromExternal();
  const timer = setTimeout(
    () =>
      controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    timeoutMs,
  );
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    if (controller.signal.aborted) {
      throw new KiwoomError('키움 API 응답 시간이 초과되었습니다.', {
        code: 'timeout',
        retryable: true,
        cause: error,
      });
    }
    throw new KiwoomError('키움 API 네트워크 연결에 실패했습니다.', {
      code: 'network',
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  config: KiwoomConfig,
  signal?: AbortSignal,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        init,
        config.timeoutMs,
        signal,
      );
      if (response.status === 429 || response.status >= 500) {
        const code = response.status === 429 ? 'rate_limit' : 'server';
        const message =
          response.status === 429
            ? '키움 API 호출 한도에 도달했습니다.'
            : `키움 API 서버 오류가 발생했습니다. (${response.status})`;
        const error = new KiwoomError(message, {
          code,
          status: response.status,
          retryable: true,
        });
        if (attempt === MAX_RETRIES) throw error;
        console.warn(
          `[kiwoom] ${code} status=${response.status} retry=${attempt + 1}/${MAX_RETRIES}`,
        );
        await sleep(retryAfterMs(response, attempt), signal);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof KiwoomError && error.retryable;
      if (!retryable || attempt === MAX_RETRIES) throw error;
      console.warn(
        `[kiwoom] ${error.code} retry=${attempt + 1}/${MAX_RETRIES}`,
      );
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt, signal);
    }
  }
  throw lastError;
}

function assertApiSuccess(payload: {
  return_code?: number;
  return_msg?: string;
}) {
  if (payload.return_code === undefined || payload.return_code === 0) return;
  const message = payload.return_msg || '키움 API 요청이 거절되었습니다.';
  const authentication = /토큰|인증|접근.?권한/i.test(message);
  throw new KiwoomError(message, {
    code: authentication ? 'authentication' : 'api',
  });
}

async function issueToken(config: KiwoomConfig) {
  const response = await requestWithRetry(
    `${config.baseUrl}/oauth2/token`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: config.appKey,
        secretkey: config.appSecret,
      }),
    },
    config,
  );
  if (!response.ok) {
    throw new KiwoomError(
      `키움 인증 토큰 발급에 실패했습니다. (${response.status})`,
      {
        code: 'authentication',
        status: response.status,
      },
    );
  }
  const payload = (await response.json()) as TokenResponse;
  assertApiSuccess(payload);
  if (!payload.token) {
    throw new KiwoomError('키움 인증 응답에 접근 토큰이 없습니다.', {
      code: 'invalid_response',
    });
  }
  const nextToken: CachedToken = {
    token: payload.token,
    tokenType: 'Bearer',
    expiresAt: parseExpiry(payload.expires_dt),
    cacheKey: `${config.mode}:${config.appKey}`,
  };
  console.info(
    `[kiwoom] token refreshed mode=${config.mode} expires=${new Date(nextToken.expiresAt).toISOString()}`,
  );
  return nextToken;
}

async function getToken(config: KiwoomConfig) {
  const cacheKey = `${config.mode}:${config.appKey}`;
  if (
    cachedToken?.cacheKey === cacheKey &&
    cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()
  ) {
    return cachedToken;
  }
  if (!tokenRequest) {
    tokenRequest = issueToken(config)
      .then((token) => {
        cachedToken = token;
        return token;
      })
      .finally(() => {
        tokenRequest = null;
      });
  }
  return tokenRequest;
}

function invalidateToken(tokenUsed: string) {
  if (cachedToken?.token === tokenUsed) cachedToken = null;
}

function exchangeName(exchange?: KiwoomUsExchange) {
  if (exchange === 'ND') return 'NASDAQ';
  if (exchange === 'NY') return 'NYSE';
  if (exchange === 'NA') return 'AMEX';
  return 'KRX';
}

export function quoteRequestKey(request: KiwoomQuoteRequest) {
  return request.market === 'KR'
    ? `KR:${request.symbol}`
    : `US:${request.exchange || 'ND'}:${request.symbol}`;
}

export function parseQuoteRequests(value: string) {
  const rawItems = value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const parsed = rawItems.map<KiwoomQuoteRequest>((item) => {
    const domestic = item.match(/^KR:(\d{6})$/);
    if (domestic) return { market: 'KR', symbol: domestic[1] };
    const us = item.match(/^US:(NA|ND|NY):([A-Z][A-Z0-9.-]{0,9})$/);
    if (us) {
      return {
        market: 'US',
        exchange: us[1] as KiwoomUsExchange,
        symbol: us[2],
      };
    }
    throw new KiwoomError('종목 형식이 올바르지 않습니다.', {
      code: 'api',
    });
  });
  const unique = Array.from(
    new Map(parsed.map((item) => [quoteRequestKey(item), item])).values(),
  );
  if (!unique.length || unique.length > 3) {
    throw new KiwoomError(
      '관심종목은 한국/미국 합산 1개에서 3개까지 지정하세요.',
      {
        code: 'api',
      },
    );
  }
  return unique;
}

async function requestQuotePayload<T extends DomesticQuoteResponse>(
  request: KiwoomQuoteRequest,
  config: KiwoomConfig,
  signal?: AbortSignal,
) {
  const endpoint =
    request.market === 'KR' ? '/api/dostk/stkinfo' : '/api/us/mrkcond';
  const apiId = request.market === 'KR' ? 'ka10001' : 'usa20100';
  const body: Record<string, string> = { stk_cd: request.symbol };
  if (request.market === 'US') body.stex_tp = request.exchange || 'ND';

  const page = await requestPayloadPage<T>({
    endpoint,
    apiId,
    body,
    config,
    signal,
  });
  return page.payload;
}

async function requestPayloadPage<T extends ApiPayload>({
  endpoint,
  apiId,
  body,
  config,
  continuation,
  signal,
}: {
  endpoint: string;
  apiId: string;
  body: Record<string, string>;
  config: KiwoomConfig;
  continuation?: Continuation;
  signal?: AbortSignal;
}) {
  for (
    let authenticationAttempt = 0;
    authenticationAttempt < 2;
    authenticationAttempt += 1
  ) {
    const token = await getToken(config);
    const response = await requestWithRetry(
      `${config.baseUrl}${endpoint}`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          authorization: `${token.tokenType} ${token.token}`,
          'api-id': apiId,
          ...(continuation
            ? {
                'cont-yn': continuation.contYn,
                'next-key': continuation.nextKey,
              }
            : {}),
        },
        body: JSON.stringify(body),
      },
      config,
      signal,
    );

    if (response.status === 401 || response.status === 403) {
      invalidateToken(token.token);
      if (authenticationAttempt === 0) {
        console.warn(`[kiwoom] authentication retry api-id=${apiId}`);
        continue;
      }
      throw new KiwoomError('키움 API 인증에 실패했습니다.', {
        code: 'authentication',
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new KiwoomError(
        `키움 API 요청에 실패했습니다. (${response.status})`,
        {
          code: 'api',
          status: response.status,
        },
      );
    }

    const payload = (await response.json()) as T;
    try {
      assertApiSuccess(payload);
      return {
        payload,
        continuation: {
          contYn: response.headers.get('cont-yn') || '',
          nextKey: response.headers.get('next-key') || '',
        },
      };
    } catch (error) {
      if (
        authenticationAttempt === 0 &&
        error instanceof KiwoomError &&
        error.code === 'authentication'
      ) {
        invalidateToken(token.token);
        console.warn(`[kiwoom] authentication response retry api-id=${apiId}`);
        continue;
      }
      throw error;
    }
  }
  throw new KiwoomError('키움 API 인증에 실패했습니다.', {
    code: 'authentication',
  });
}

const DOMESTIC_MINUTE_COLUMNS = [
  'cur_prc',
  'trde_qty',
  'cntr_tm',
  'open_pric',
  'high_pric',
  'low_pric',
];
const DOMESTIC_DAILY_COLUMNS = [
  'cur_prc',
  'trde_qty',
  'trde_prica',
  'dt',
  'open_pric',
  'high_pric',
  'low_pric',
];
const US_MINUTE_COLUMNS = [
  'cur_prc',
  'trde_qty',
  'open_pric',
  'high_pric',
  'low_pric',
  'cntr_tm',
  'bus_dt',
];
const US_DAILY_COLUMNS = [
  'cur_prc',
  'pred_pre',
  'flu_rt',
  'acc_trde_qty',
  'acc_trde_prica',
  'open_pric',
  'high_pric',
  'low_pric',
  'dt',
];

function chartRecord(row: ChartRecord | unknown[], columns: string[]) {
  if (!Array.isArray(row)) return row;
  return Object.fromEntries(
    columns.map((column, index) => [column, row[index]]),
  ) as ChartRecord;
}

function compactDate(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\D/g, '');
}

const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(timeZone: string) {
  let formatter = zonedFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    zonedFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedDateTimeToIso(value: string, timeZone: string) {
  const compact = compactDate(value);
  if (compact.length !== 14) {
    throw new KiwoomError('키움 차트 응답의 시간이 올바르지 않습니다.', {
      code: 'invalid_response',
    });
  }
  const target = Date.UTC(
    Number(compact.slice(0, 4)),
    Number(compact.slice(4, 6)) - 1,
    Number(compact.slice(6, 8)),
    Number(compact.slice(8, 10)),
    Number(compact.slice(10, 12)),
    Number(compact.slice(12, 14)),
  );
  let utc = target;
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(
      zonedFormatter(timeZone)
        .formatToParts(new Date(utc))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const correction = target - represented;
    utc += correction;
    if (correction === 0) break;
  }
  return new Date(utc).toISOString();
}

function dateKey(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    zonedFormatter(timeZone)
      .formatToParts(date)
      .filter((part) =>
        part.type === 'year' || part.type === 'month' || part.type === 'day',
      )
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}${parts.month}${parts.day}`;
}

function daysAgoKey(days: number, timeZone: string) {
  return dateKey(new Date(Date.now() - days * 24 * 60 * 60_000), timeZone);
}

function parseChartRows(
  rows: Array<ChartRecord | unknown[]>,
  kind: 'kr-minute' | 'kr-daily' | 'us-minute' | 'us-daily',
) {
  const columns =
    kind === 'kr-minute'
      ? DOMESTIC_MINUTE_COLUMNS
      : kind === 'kr-daily'
        ? DOMESTIC_DAILY_COLUMNS
        : kind === 'us-minute'
          ? US_MINUTE_COLUMNS
          : US_DAILY_COLUMNS;
  const timeZone = kind.startsWith('kr') ? 'Asia/Seoul' : 'America/New_York';
  const candles = rows.flatMap<KiwoomCandle>((row) => {
    const record = chartRecord(row, columns);
    try {
      let timestamp: string;
      if (kind === 'kr-minute') {
        timestamp = zonedDateTimeToIso(compactDate(record.cntr_tm), timeZone);
      } else if (kind === 'us-minute') {
        const time = compactDate(record.cntr_tm);
        const full =
          time.length === 14
            ? time
            : `${compactDate(record.bus_dt)}${time.padStart(6, '0')}`;
        timestamp = zonedDateTimeToIso(full, timeZone);
      } else {
        timestamp = zonedDateTimeToIso(
          `${compactDate(record.dt)}000000`,
          timeZone,
        );
      }
      const close = Math.abs(numeric(record.cur_prc, '종가'));
      const open = Math.abs(numeric(record.open_pric, '시가'));
      const high = Math.abs(numeric(record.high_pric, '고가'));
      const low = Math.abs(numeric(record.low_pric, '저가'));
      return [
        {
          date: timestamp,
          open,
          high,
          low,
          close,
          volume: optionalAbsolute(
            record.trde_qty ?? record.acc_trde_qty,
            0,
          ),
        },
      ];
    } catch (error) {
      if (error instanceof KiwoomError) return [];
      throw error;
    }
  });
  const unique = new Map(candles.map((candle) => [candle.date, candle]));
  return Array.from(unique.values()).sort(
    (left, right) => Date.parse(left.date) - Date.parse(right.date),
  );
}

async function collectChartRows<T extends ApiPayload>({
  endpoint,
  apiId,
  body,
  listKey,
  target,
  config,
  signal,
}: {
  endpoint: string;
  apiId: string;
  body: Record<string, string>;
  listKey: string;
  target: number;
  config: KiwoomConfig;
  signal?: AbortSignal;
}) {
  const rows: Array<ChartRecord | unknown[]> = [];
  let continuation: Continuation | undefined;
  for (let pageNumber = 0; pageNumber < MAX_CHART_PAGES; pageNumber += 1) {
    const page = await requestPayloadPage<T>({
      endpoint,
      apiId,
      body,
      config,
      continuation,
      signal,
    });
    const pageRows = (page.payload as T & Record<string, unknown>)[listKey];
    if (Array.isArray(pageRows)) {
      rows.push(...(pageRows as Array<ChartRecord | unknown[]>));
    }
    const hasMore =
      page.continuation.contYn.toUpperCase() === 'Y' &&
      Boolean(page.continuation.nextKey);
    if (
      rows.length >= target ||
      rows.length >= MAX_CHART_RECORDS ||
      !hasMore
    ) {
      break;
    }
    continuation = page.continuation;
    await sleep(CHART_REQUEST_DELAY_MS, signal);
  }
  return rows.slice(0, MAX_CHART_RECORDS);
}

function aggregateCandles(candles: KiwoomCandle[]) {
  const first = candles[0];
  const last = candles.at(-1);
  if (!first || !last) return null;
  return {
    date: first.date,
    open: first.open,
    high: Math.max(...candles.map((candle) => candle.high)),
    low: Math.min(...candles.map((candle) => candle.low)),
    close: last.close,
    volume: candles.reduce((total, candle) => total + candle.volume, 0),
  };
}

function toFourHourCandles(candles: KiwoomCandle[], market: KiwoomMarket) {
  const timeZone = market === 'KR' ? 'Asia/Seoul' : 'America/New_York';
  const sessions = new Map<string, KiwoomCandle[]>();
  for (const candle of candles) {
    const session = dateKey(new Date(candle.date), timeZone);
    const existing = sessions.get(session) || [];
    existing.push(candle);
    sessions.set(session, existing);
  }
  return Array.from(sessions.values()).flatMap((session) => {
    const result: KiwoomCandle[] = [];
    for (let index = 0; index < session.length; index += 4) {
      const candle = aggregateCandles(session.slice(index, index + 4));
      if (candle) result.push(candle);
    }
    return result;
  });
}

function lastCandles(candles: KiwoomCandle[], count = CHART_CANDLE_LIMIT) {
  return candles.slice(Math.max(candles.length - count, 0));
}

async function loadDomesticChart(
  symbol: string,
  scope: '5' | '15' | '60' | '1D',
  target: number,
  config: KiwoomConfig,
  signal?: AbortSignal,
) {
  const isDaily = scope === '1D';
  const chartSymbol =
    config.mode === 'real' ? `${symbol}_AL` : symbol;
  const body: Record<string, string> = {
    stk_cd: chartSymbol,
    base_dt: daysAgoKey(0, 'Asia/Seoul'),
    upd_stkpc_tp: '1',
  };
  if (!isDaily) body.tic_scope = scope;
  const rows = await collectChartRows<
    DomesticMinuteChartResponse | DomesticDailyChartResponse
  >({
    endpoint: '/api/dostk/chart',
    apiId: isDaily ? 'ka10081' : 'ka10080',
    body,
    listKey: isDaily ? 'stk_dt_pole_chart_qry' : 'stk_min_pole_chart_qry',
    target,
    config,
    signal,
  });
  return parseChartRows(rows, isDaily ? 'kr-daily' : 'kr-minute');
}

async function loadUsChart(
  request: KiwoomQuoteRequest,
  scope: '5' | '15' | '60' | '1D',
  target: number,
  config: KiwoomConfig,
  signal?: AbortSignal,
) {
  const isDaily = scope === '1D';
  const body = {
    stex_tp: request.exchange || 'ND',
    stk_cd: request.symbol,
    strt_dt: daysAgoKey(0, 'America/New_York'),
    ...(isDaily ? {} : { tic_scope: scope }),
    upd_stkpc_tp: '1',
    exrt_appl_tp: '0',
  };
  const rows = await collectChartRows<UsChartResponse>({
    endpoint: '/api/us/chart',
    apiId: isDaily ? 'usa06012' : 'usa06011',
    body,
    listKey: 'result_list',
    target,
    config,
    signal,
  });
  return parseChartRows(rows, isDaily ? 'us-daily' : 'us-minute');
}

export async function getMarketChart(
  request: KiwoomQuoteRequest,
  signal?: AbortSignal,
): Promise<KiwoomChart> {
  const config = readConfig();
  const load = (scope: '5' | '15' | '60' | '1D', target: number) =>
    request.market === 'KR'
      ? loadDomesticChart(request.symbol, scope, target, config, signal)
      : loadUsChart(request, scope, target, config, signal);

  // The four native series are independent. Start them with a small stagger
  // so symbol switches do not wait for four full round trips in sequence,
  // while still avoiding a burst of simultaneous requests.
  const chartRequests = [
    { scope: '5' as const, target: 440 },
    { scope: '15' as const, target: 440 },
    { scope: '60' as const, target: 1_800 },
    { scope: '1D' as const, target: 440 },
  ];
  const [fiveMinute, fifteenMinute, hourlyForAggregation, daily] =
    await Promise.all(
      chartRequests.map(async ({ scope, target }, index) => {
        if (index > 0) {
          await sleep(index * CHART_REQUEST_DELAY_MS, signal);
        }
        return load(scope, target);
      }),
    );

  if (!fiveMinute.length) {
    throw new KiwoomError('키움 분봉 응답에 표시할 5분봉이 없습니다.', {
      code: 'invalid_response',
    });
  }

  const chart: KiwoomChart = {
    symbol: request.symbol,
    market: request.market,
    exchange: exchangeName(request.exchange),
    currency: request.market === 'KR' ? 'KRW' : 'USD',
    source:
      request.market === 'KR'
        ? `Kiwoom REST API · ${config.mode === 'real' ? '통합(SOR)' : 'KRX'}`
        : 'Kiwoom REST API',
    candles: lastCandles(fiveMinute),
    timeframes: {
      '15m': lastCandles(fifteenMinute),
      '1H': lastCandles(hourlyForAggregation),
      '4H': lastCandles(toFourHourCandles(hourlyForAggregation, request.market)),
      '1D': lastCandles(daily),
    },
  };
  console.info(
    `[kiwoom] chart loaded market=${request.market} symbol=${request.symbol} counts=5m:${chart.candles.length},15m:${chart.timeframes['15m'].length},1h:${chart.timeframes['1H'].length},4h:${chart.timeframes['4H'].length},1d:${chart.timeframes['1D'].length}`,
  );
  return chart;
}

export async function getCurrentPrice(
  request: KiwoomQuoteRequest,
  signal?: AbortSignal,
): Promise<KiwoomQuote> {
  const config = readConfig();
  const payload =
    request.market === 'KR'
      ? await requestQuotePayload<DomesticQuoteResponse>(
          request,
          config,
          signal,
        )
      : await requestQuotePayload<UsQuoteResponse>(request, config, signal);

  const price = Math.abs(numeric(payload.cur_prc, '현재가'));
  const change = numeric(payload.pred_pre ?? 0, '전일대비');
  const reportedChangePct = numeric(payload.flu_rt ?? 0, '등락률');
  const usPreviousClose =
    request.market === 'US'
      ? Math.abs(
          numeric((payload as UsQuoteResponse).base_close_pric, '전일종가'),
        )
      : undefined;
  const domesticPreviousClose =
    request.market === 'KR'
      ? optionalAbsolute(payload.base_pric, Math.max(price - change, 0))
      : undefined;
  const previousClose =
    usPreviousClose || domesticPreviousClose || Math.max(price - change, 0);
  const changePct =
    Number.isFinite(reportedChangePct) && reportedChangePct !== 0
      ? reportedChangePct
      : previousClose
        ? (change / previousClose) * 100
        : 0;
  const timestamp = new Date().toISOString();
  const name =
    payload.stk_nm ||
    (request.market === 'US'
      ? (payload as UsQuoteResponse).stk_enm
      : undefined) ||
    request.symbol;

  return {
    key: quoteRequestKey(request),
    market: request.market,
    symbol: request.symbol,
    name,
    exchange: exchangeName(request.exchange),
    currency: request.market === 'KR' ? 'KRW' : 'USD',
    price,
    previousClose,
    change,
    changePct,
    timestamp,
    lastUpdated: timestamp,
    marketState: 'UNKNOWN',
    status: 'ok',
  };
}

export function resetKiwoomTokenCacheForTests() {
  cachedToken = null;
  tokenRequest = null;
}
