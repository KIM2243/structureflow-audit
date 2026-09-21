'use client';
import { TopDownPanel } from '@/components/top-down-panel';
import { HigherContextOverlay } from '@/components/higher-context-overlay';
import { higherContexts, type HigherContext } from '@/lib/higher-context';
import type {TradePlan} from '@/lib/trade-plan';
import { ChartIndicatorGuide } from '@/components/chart-indicator-guide';
import { StructureTermHelp } from '@/components/structure-term-help';

import { qualifiedZone, closedBars } from '@/lib/auto-paper';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CheckCircle2,
  Database,
  Download,
  ArrowRight,
  Layers3,
  Loader2,
  Plus,
  Play,
  RefreshCw,
  Search,
  Settings2,
  UserCog,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
  UploadCloud,
  WalletCards,
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  ReceiptText,
  Wifi,
  WifiOff,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Zap,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  analyze,
  backtest,
  structureSnapshot,
  type Analysis,
  type BacktestDirection,
  type BacktestOptions,
  type BacktestTrade,
  type Candle,
  type Snapshot,
} from '@/lib/engine';
import {
  evaluateMultiTimeframeEntry,
  type EntryTimeframe,
  type MultiTimeframeEntryStep,
} from '@/lib/multi-timeframe';
import { mapMarketStructure } from '@/lib/market-structure';
import { AutoPaperPanel } from '@/components/auto-paper-panel';
import { AutoBacktestPanel } from '@/components/auto-backtest-panel';
import { LectureCasebook } from '@/components/lecture-casebook';
import { EntryReviewPanel } from '@/components/entry-review-panel';

type Market = 'US' | 'KR';
type AuthUser = { id: string; username: string; displayName: string; role: 'admin' | 'member' };
type AdminUser = AuthUser & {
  status: 'active' | 'disabled';
  createdAt: number;
  lastLoginAt: number | null;
};
type UsExchange = 'NA' | 'ND' | 'NY';
type Timeframe = '1m' | '5m' | '15m' | '1H' | '4H' | '1D';
type LayerKey =
  | 'supplyDemand'
  | 'structure'
  | 'choch'
  | 'swingLabels'
  | 'premiumDiscount'
  | 'internalStructure'
  | 'volume'
  | 'volumeProfile'
  | 'orderflow'
  | 'liquidity'
  | 'forecast'
  | 'htfPOI';

type SymbolItem = {
  code: string;
  feed: string;
  name: string;
  currency: '$' | '₩';
  exchange?: UsExchange;
};

type SymbolSearchResult = SymbolItem & {
  market: Market;
  type: string;
  exchangeLabel: string;
};

type Preferences = {
  capital: number;
  riskPct: number;
  feeBps: number;
  slippageBps: number;
};

type MarketResponse = {
  error?: string;
  name?: string;
  source?: string;
  fetchedAt?: string;
  candles?: Candle[];
  timeframes?: Partial<Record<Timeframe, Candle[]>>;
};

type MarketDataCacheEntry = {
  payload: MarketResponse & { candles: Candle[] };
  cachedAt: number;
};

type HigherTimeframeData = Partial<Record<Timeframe, Candle[]>>;

type WatchlistEntry = {
  market: Market;
  ticker: string;
  exchange?: UsExchange;
};

type LiveQuote = {
  key: string;
  market: Market;
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  timestamp: string;
  lastUpdated: string;
  marketState: string;
  status: 'ok';
};

type LiveQuoteError = {
  key: string;
  symbol: string;
  error: string;
  code?: string;
  retryable?: boolean;
  status: 'error';
};

type QuotesResponse = {
  error?: string;
  quotes?: LiveQuote[];
  errors?: LiveQuoteError[];
  fetchedAt?: string;
  refreshAfterSeconds?: number;
};

type WatchedSymbol = SymbolItem & { market: Market };

type PaperPosition = {
  key: string;
  market: Market;
  symbol: string;
  name: string;
  currency: '$' | '₩';
  quantity: number;
  averagePrice: number;
};

type PaperFill = {
  id: string;
  market: Market;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fee: number;
  realizedPnl: number;
  filledAt: string;
};

type PaperAccount = {
  cash: Record<Market, number>;
  positions: PaperPosition[];
  fills: PaperFill[];
};

const DEFAULT_PAPER_ACCOUNT: PaperAccount = {
  cash: { US: 100_000, KR: 100_000_000 },
  positions: [],
  fills: [],
};

const symbols: Record<Market, SymbolItem[]> = {
  US: [
    {
      code: 'ONDS',
      feed: 'ONDS',
      name: 'Ondas Holdings',
      currency: '$',
      exchange: 'ND',
    },
    {
      code: 'NVDA',
      feed: 'NVDA',
      name: 'NVIDIA',
      currency: '$',
      exchange: 'ND',
    },
    {
      code: 'TSLA',
      feed: 'TSLA',
      name: 'Tesla',
      currency: '$',
      exchange: 'ND',
    },
    { code: 'AAPL', feed: 'AAPL', name: 'Apple 애플', currency: '$', exchange: 'ND' },
    { code: 'MSFT', feed: 'MSFT', name: 'Microsoft 마이크로소프트', currency: '$', exchange: 'ND' },
    { code: 'AMZN', feed: 'AMZN', name: 'Amazon 아마존', currency: '$', exchange: 'ND' },
    { code: 'GOOGL', feed: 'GOOGL', name: 'Alphabet 구글', currency: '$', exchange: 'ND' },
    { code: 'META', feed: 'META', name: 'Meta Platforms 메타', currency: '$', exchange: 'ND' },
    { code: 'AMD', feed: 'AMD', name: 'AMD', currency: '$', exchange: 'ND' },
    { code: 'NFLX', feed: 'NFLX', name: 'Netflix 넷플릭스', currency: '$', exchange: 'ND' },
    { code: 'AVGO', feed: 'AVGO', name: 'Broadcom 브로드컴', currency: '$', exchange: 'ND' },
    { code: 'PLTR', feed: 'PLTR', name: 'Palantir 팔란티어', currency: '$', exchange: 'ND' },
    { code: 'COIN', feed: 'COIN', name: 'Coinbase 코인베이스', currency: '$', exchange: 'ND' },
    { code: 'JPM', feed: 'JPM', name: 'JPMorgan 제이피모건', currency: '$', exchange: 'NY' },
    { code: 'BRK.B', feed: 'BRK.B', name: 'Berkshire Hathaway 버크셔', currency: '$', exchange: 'NY' },
    { code: 'DIS', feed: 'DIS', name: 'Walt Disney 디즈니', currency: '$', exchange: 'NY' },
    { code: 'NKE', feed: 'NKE', name: 'Nike 나이키', currency: '$', exchange: 'NY' },
    { code: 'KO', feed: 'KO', name: 'Coca-Cola 코카콜라', currency: '$', exchange: 'NY' },
  ],
  KR: [
    { code: '005930', feed: '005930.KS', name: '삼성전자', currency: '₩' },
    { code: '000660', feed: '000660.KS', name: 'SK하이닉스', currency: '₩' },
    { code: '035420', feed: '035420.KS', name: 'NAVER', currency: '₩' },
    { code: '035720', feed: '035720.KS', name: '카카오', currency: '₩' },
    { code: '005380', feed: '005380.KS', name: '현대차', currency: '₩' },
    { code: '000270', feed: '000270.KS', name: '기아', currency: '₩' },
    { code: '373220', feed: '373220.KS', name: 'LG에너지솔루션', currency: '₩' },
    { code: '051910', feed: '051910.KS', name: 'LG화학', currency: '₩' },
    { code: '006400', feed: '006400.KS', name: '삼성SDI', currency: '₩' },
    { code: '207940', feed: '207940.KS', name: '삼성바이오로직스', currency: '₩' },
    { code: '068270', feed: '068270.KS', name: '셀트리온', currency: '₩' },
    { code: '105560', feed: '105560.KS', name: 'KB금융', currency: '₩' },
    { code: '055550', feed: '055550.KS', name: '신한지주', currency: '₩' },
    { code: '012450', feed: '012450.KS', name: '한화에어로스페이스', currency: '₩' },
    { code: '042660', feed: '042660.KS', name: '한화오션', currency: '₩' },
    { code: '009540', feed: '009540.KS', name: 'HD한국조선해양', currency: '₩' },
    { code: '005490', feed: '005490.KS', name: 'POSCO홀딩스', currency: '₩' },
    { code: '034020', feed: '034020.KS', name: '두산에너빌리티', currency: '₩' },
  ],
};

const DEFAULT_WATCHLIST: WatchlistEntry[] = [
  { market: 'US', ticker: 'ONDS', exchange: 'ND' },
  { market: 'US', ticker: 'NVDA', exchange: 'ND' },
  { market: 'US', ticker: 'TSLA', exchange: 'ND' },
];

const MAX_WATCHLIST_PER_MARKET = 3;
const MAX_WATCHLIST_SIZE = MAX_WATCHLIST_PER_MARKET * 2;
const LIVE_QUOTE_STALE_MS = 15_000;
const MARKET_DATA_CACHE_TTL_MS = 30_000;

const timeframeSizes: Record<Timeframe, number> = {
  '1m': 0.2,
  '5m': 1,
  '15m': 3,
  '1H': 12,
  '4H': 48,
  '1D': 78,
};

function resampleBySession(data: Candle[], size: number) {
  if (size <= 1) return data;
  const output: Candle[] = [];
  let sessionDate = '';
  let session: Candle[] = [];

  const flushSession = () => {
    for (let index = 0; index < session.length; index += size) {
      const group = session.slice(index, index + size);
      if (!group.length) continue;
      output.push({
        date: group.at(-1)!.date,
        open: group[0].open,
        high: Math.max(...group.map((candle) => candle.high)),
        low: Math.min(...group.map((candle) => candle.low)),
        close: group.at(-1)!.close,
        volume: group.reduce((sum, candle) => sum + candle.volume, 0),
      });
    }
  };

  for (const candle of data) {
    const candleSessionDate = candle.date.slice(0, 10);
    if (sessionDate && candleSessionDate !== sessionDate) {
      flushSession();
      session = [];
    }
    sessionDate = candleSessionDate;
    session.push(candle);
  }
  flushSession();
  return output;
}

function buildTimeframeData(
  data: Candle[],
  higherTimeframeData: HigherTimeframeData,
  dataSource: 'demo' | 'kiwoom' | 'csv',
): Record<Timeframe, Candle[]> {
  const useNativeTimeframes = dataSource === 'kiwoom';
  const fifteenMinute = useNativeTimeframes
    ? higherTimeframeData['15m'] || []
    : higherTimeframeData['15m']?.length
      ? higherTimeframeData['15m']
      : resampleBySession(data, timeframeSizes['15m']);
  const hourly = useNativeTimeframes
    ? higherTimeframeData['1H'] || []
    : higherTimeframeData['1H']?.length
      ? higherTimeframeData['1H']
      : resampleBySession(data, timeframeSizes['1H']);
  const fourHour = useNativeTimeframes
    ? higherTimeframeData['4H'] || []
    : higherTimeframeData['4H']?.length
      ? higherTimeframeData['4H']
      : resampleBySession(hourly, 4);
  const daily = useNativeTimeframes
    ? higherTimeframeData['1D'] || []
    : higherTimeframeData['1D']?.length
      ? higherTimeframeData['1D']
      : resampleBySession(data, timeframeSizes['1D']);
  return { '1m': higherTimeframeData['1m'] || [], '5m': data, '15m': fifteenMinute, '1H': hourly, '4H': fourHour, '1D': daily };
}

const timeframeLabels: Record<Timeframe, string> = {
  '1m': '1분봉',
  '5m': '5분봉',
  '15m': '15분봉',
  '1H': '1시간봉',
  '4H': '4시간봉',
  '1D': '일봉',
};

const timeframeButtonLabels: Record<Timeframe, string> = {
  '1m': '1분',
  '5m': '5분',
  '15m': '15분',
  '1H': '1시간',
  '4H': '4시간',
  '1D': '일봉',
};

function timeframeRole(timeframe: Timeframe) {
  if (timeframe === '1D') return '상위 추세';
  if (timeframe === '4H') return '중간 추세';
  return '하위 구조';
}

function directionLabel(bias: Analysis['bias']) {
  if (bias === 'LONG') return '롱 우세';
  if (bias === 'SHORT') return '숏 우세';
  return '관망';
}

function multiTimeframeContext(
  higherTrend: Snapshot['trend'],
  middleTrend: Snapshot['trend'],
  entryBias: Analysis['bias'],
) {
  if (higherTrend === 'BULLISH' && entryBias === 'SHORT') {
    return '상승 추세 내 단기 조정';
  }
  if (higherTrend === 'BEARISH' && entryBias === 'LONG') {
    return '하락 추세 내 단기 반등';
  }
  if (
    middleTrend !== 'TRANSITION' &&
    ((middleTrend === 'BULLISH' && entryBias === 'LONG') ||
      (middleTrend === 'BEARISH' && entryBias === 'SHORT'))
  ) {
    return '상·중간 추세와 진입 방향 일치';
  }
  if (entryBias === 'NEUTRAL') return '방향성 확인 대기';
  return '시간대별 구조 확인 필요';
}

type EntryLesson = {
  role: string;
  principle: string;
  checks: string[];
  next: string;
  invalidation: string;
};

const entryLessons: Record<EntryTimeframe, EntryLesson> = {
  '1m': {
    role: '15분 기원 구역 안에서 진입 가격을 정제하는 실행 시간대',
    principle: '4시간 구역 접촉 → 이후 15분 전환·재접촉 → 이후 1분 종가 전환·재접촉 순서입니다. 원본 1분봉이 없으면 대기하며 5분봉을 나누어 만들지 않습니다.',
    checks: ['1분 구역이 15분 구역 안에 포함되는지 확인', '1시간 내부 방향 동행(PP)·구역 등급·상위 손절·목표로 비용 차감 순 2R 확인'],
    next: '하위 신호 전에 15분 구역 바깥 손절과 4시간 목표를 고정합니다. 1분·5분은 진입 확인에 쓰며 고정 1R 부분익절은 없습니다.',
    invalidation: '1분 기원 구역 종가 이탈·반대 전환·30분 대기 만료 시 취소합니다.',
  },
  '1D': {
    role: '큰 그림과 주요 가치 영역을 정하는 배경 시간대',
    principle:
      '일봉·주봉은 주요 지지·저항과 거래량이 쌓인 가치 영역을 찾는 데 사용합니다. 이 시간대는 정밀 진입보다 전체 이야기와 우선순위를 정합니다.',
    checks: [
      '고점·저점이 연속으로 높아지는지 또는 낮아지는지 확인',
      '현재 가격이 큰 구조의 프리미엄·디스카운트 중 어디에 있는지 확인',
    ],
    next: '일봉의 관심 구역 안에서 4시간 스윙 구조가 어떻게 발전하는지 확인합니다.',
    invalidation:
      '보호받던 스윙 고점·저점을 캔들 몸통으로 이탈하면 기존 편향을 재검토합니다.',
  },
  '4H': {
    role: '현재 진행 중인 스윙 추세를 해석하는 핵심 시간대',
    principle:
      '4시간봉은 현재 스윙 추세를 판단하는 핵심 시간대입니다. 프로트렌드 임펄스인지 카운터트렌드 풀백인지 큰 흐름을 정하고, 다음 높은 저점 또는 낮은 고점이 만들어질 위치를 찾습니다.',
    checks: [
      '스윙 구조가 HH·HL 또는 LH·LL 중 어느 순서인지 확인',
      '관심 구역이 강세의 디스카운트 또는 약세의 프리미엄에 있는지 확인',
    ],
    next: '15분 구조가 4시간 방향으로 전환·정렬되는 것을 기다립니다.',
    invalidation:
      '4시간 보호 스윙이 몸통 종가로 깨지면 기존 스윙 방향은 더 이상 우선 시나리오가 아닙니다.',
  },
  '1H': {
    role: '선택한 PP 실험의 내부 방향 확인 시간대',
    principle:
      '핵심 흐름은 4H·15m·1m입니다. 이번 PP 실험에서는 1시간 내부 구조가 진입 방향과 같을 때만 실행합니다. 이는 선택한 보수적 실험 조건입니다.',
    checks: [
      '4시간 방향과 같은 구조 이탈 또는 CHoCH가 나타나는지 확인',
      '1시간 신호 하나 때문에 4시간·15분의 명확한 이야기를 뒤집지 않기',
    ],
    next: '1시간 내부 방향이 다르거나 미확정이면 PP 진입을 보류합니다.',
    invalidation:
      '1시간 반대 구조가 지속되고 4시간 보호 스윙까지 위협하면 상위 편향을 재평가합니다.',
  },
  '15m': {
    role: '현재 구간이 프로트렌드인지 풀백인지 판단하는 방향 시간대',
    principle:
      '15분봉은 4시간 되돌림의 시작과 종료를 먼저 보여주는 방향 시간대입니다. 높은 시간대 관심 구역에서 15분 구조가 4시간 스윙과 같은 방향으로 정렬될 때 진입 후보로 검토합니다.',
    checks: [
      '높은 시간대 관심 구역에서 CHoCH·구조 이탈이 발생했는지 확인',
      '강세는 내부 디스카운트, 약세는 내부 프리미엄에서 기회 찾기',
    ],
    next: '15분 기원 구역 재접촉 이후 1분봉의 전환과 정제 구역 재접촉을 확인합니다.',
    invalidation:
      '15분이 높은 시간대 방향으로 정렬되지 않고 반대 구조를 계속 만들면 진입하지 않고 편향 변경 가능성을 열어 둡니다.',
  },
  '5m': {
    role: '15분과 1분 사이의 보조 관찰 시간대',
    principle: '5분봉은 움직임을 보조 확인하는 차트입니다. 자동 실험의 필수 1분 종가 전환·재접촉을 대신하지 않습니다.',
    checks: ['4시간·15분 구조의 전개 확인', '실제 진입 조건은 원본 1분봉에서 별도 확인'],
    next: '1분봉으로 이동하여 정제 구역과 무효화 가격을 확인합니다.',
    invalidation: '5분 신호만으로 자동 진입하지 않습니다.',
  },};

const backtestTimeframes: Timeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D'];

const DEFAULT_PREFERENCES: Preferences = {
  capital: 10_000,
  riskPct: 1,
  feeBps: 5,
  slippageBps: 3,
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function normalizeWatchlistEntry(entry: WatchlistEntry): WatchedSymbol | null {
  const ticker = entry.ticker.trim().toUpperCase();
  if (entry.market === 'US') {
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return null;
    const known = symbols.US.find((item) => item.feed === ticker);
    const exchange = entry.exchange || known?.exchange || 'ND';
    return {
      market: 'US',
      code: ticker,
      feed: ticker,
      name: known?.name || ticker,
      currency: '$',
      exchange,
    };
  }

  const match = ticker.match(/^(\d{6})(?:\.(KS|KQ))?$/);
  if (!match) return null;
  const feed = `${match[1]}.${match[2] || 'KS'}`;
  const known = symbols.KR.find((item) => item.feed === feed);
  return {
    market: 'KR',
    code: match[1],
    feed,
    name: known?.name || match[1],
    currency: '₩',
  };
}

function loadLegacyWatchlist() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('structureflow:watchlist');
    if (!raw) return null;
    const saved = JSON.parse(raw) as WatchlistEntry[];
    const marketCounts: Record<Market, number> = { US: 0, KR: 0 };
    const valid = saved
      .slice(0, MAX_WATCHLIST_SIZE)
      .filter((entry) => normalizeWatchlistEntry(entry))
      .filter((entry) => {
        if (marketCounts[entry.market] >= MAX_WATCHLIST_PER_MARKET) return false;
        marketCounts[entry.market] += 1;
        return true;
      });
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

function marketStateLabel(state: string) {
  if (state === 'REGULAR') return '장중';
  if (state === 'PRE') return '프리마켓';
  if (state === 'POST' || state === 'POSTPOST') return '애프터마켓';
  if (state === 'CLOSED') return '장 종료';
  return '키움 수신';
}

function formatLookbackDuration(bars: number, timeframe: Timeframe) {
  if (timeframe === '1D') return `${bars}거래일`;

  const minutes = bars * timeframeSizes[timeframe] * 5;
  if (minutes < 60) return `${minutes}분`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes
    ? `${hours}시간 ${remainingMinutes}분`
    : `${hours}시간`;
}

function loadPreferences(): Preferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem('structureflow:preferences') || '{}',
    ) as Partial<Preferences>;
    return {
      capital: clamp(
        Number(saved.capital) || DEFAULT_PREFERENCES.capital,
        100,
        100_000_000,
      ),
      riskPct: clamp(
        Number(saved.riskPct) || DEFAULT_PREFERENCES.riskPct,
        0.1,
        10,
      ),
      feeBps: clamp(Number(saved.feeBps) || DEFAULT_PREFERENCES.feeBps, 0, 100),
      slippageBps: clamp(
        Number(saved.slippageBps) || DEFAULT_PREFERENCES.slippageBps,
        0,
        100,
      ),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

const DEMO_END_TIMESTAMP = Date.UTC(2025, 0, 2, 0, 0, 0);

function demo(base = 10, count = 2_400): Candle[] {
  let last = base * 0.7;
  return Array.from({ length: count }, (_, index) => {
    const open = last;
    const cycle = Math.sin(index * 0.19) * base * 0.01;
    const impulse = index % 170 < 85 ? base * 0.0018 : -base * 0.0012;
    const close = Math.max(base * 0.3, open + cycle + impulse);
    const high = Math.max(open, close) + base * (0.006 + (index % 7) * 0.0004);
    const low = Math.min(open, close) - base * (0.006 + (index % 5) * 0.0004);
    last = close;
    return {
      date: new Date(
        DEMO_END_TIMESTAMP - (count - index) * 300_000,
      ).toISOString(),
      open,
      high,
      low,
      close,
      volume: 500_000 + ((index * 7_919) % 1_200_000),
    };
  });
}

const formatPrice = (value: number, market: Market) =>
  market === 'KR'
    ? Math.round(value).toLocaleString('ko-KR')
    : value.toFixed(2);

function formatVolume(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString('en-US');
}

function liveQuoteKey(
  item: Pick<WatchedSymbol, 'market' | 'code' | 'exchange'>,
) {
  return item.market === 'KR'
    ? `KR:${item.code}`
    : `US:${item.exchange || 'ND'}:${item.code}`;
}

function liveQuoteStatus(
  quote: LiveQuote | undefined,
  error: LiveQuoteError | undefined,
) {
  if (error) return '수신 중단';
  if (!quote) return '로딩 중';
  const updatedAt = Date.parse(quote.lastUpdated || quote.timestamp);
  if (
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt > LIVE_QUOTE_STALE_MS
  ) {
    return '오래됨';
  }
  return marketStateLabel(quote.marketState);
}

const formatMoney = (value: number, market: Market) =>
  market === 'KR'
    ? `₩${Math.round(value).toLocaleString('ko-KR')}`
    : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function parseCsv(text: string) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2)
    throw new Error('헤더와 최소 한 행의 데이터가 필요합니다.');
  const headers = rows[0]
    .toLowerCase()
    .split(',')
    .map((value) => value.trim());
  const indexOf = (key: string) => headers.indexOf(key);
  if (
    ['open', 'high', 'low', 'close', 'volume'].some((key) => indexOf(key) < 0)
  ) {
    throw new Error('date, open, high, low, close, volume 열이 필요합니다.');
  }

  return rows
    .slice(1)
    .map((row, index) => {
      const columns = row.split(',');
      return {
        date: columns[indexOf('date')] || String(index),
        open: Number(columns[indexOf('open')]),
        high: Number(columns[indexOf('high')]),
        low: Number(columns[indexOf('low')]),
        close: Number(columns[indexOf('close')]),
        volume: Number(columns[indexOf('volume')]),
      };
    })
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close, candle.volume].every(
        Number.isFinite,
      ),
    );
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const formatTradeDate = (value: string) => value.slice(0, 16).replace('T', ' ');

const DEFAULT_CHART_BARS = 120;
const HIGHER_TIMEFRAME_CHART_BARS = 200;
const MIN_CHART_BARS = 18;
const MAX_CHART_BARS = 400;

function clampChartValue(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function createPriceTicks(minimum: number, maximum: number, targetCount = 6) {
  const range = Math.max(maximum - minimum, 0.000001);
  const roughStep = range / Math.max(targetCount, 2);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const niceMultiplier =
    normalizedStep <= 1
      ? 1
      : normalizedStep <= 2
        ? 2
        : normalizedStep <= 2.5
          ? 2.5
          : normalizedStep <= 5
            ? 5
            : 10;
  const step = niceMultiplier * magnitude;
  const first = Math.ceil(minimum / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= maximum + step * 0.001; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}

function formatAxisPrice(value: number, market: Market) {
  if (market === 'KR') return Math.round(value).toLocaleString('ko-KR');
  const decimals = Math.abs(value) < 1 ? 3 : 2;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

type ChartPriceLabel = {
  key: string;
  label: string;
  value: number;
  tone: 'profile' | 'entry' | 'stop' | 'target';
};

function layoutChartPriceLabels(
  labels: ChartPriceLabel[],
  priceToY: (value: number) => number,
  top: number,
  bottom: number,
  avoidY?: number,
) {
  const gap = 22;
  const avoidGap = 25;
  const positioned = labels
    .map((label) => {
      const rawY = priceToY(label.value);
      return {
        ...label,
        rawY,
        lineY: clampChartValue(rawY, top, bottom),
        labelY: clampChartValue(rawY, top, bottom),
        edge:
          rawY < top
            ? ('above' as const)
            : rawY > bottom
              ? ('below' as const)
              : null,
      };
    })
    .sort((left, right) => left.labelY - right.labelY);

  const normalize = () => {
    for (let index = 1; index < positioned.length; index += 1) {
      positioned[index].labelY = Math.max(
        positioned[index].labelY,
        positioned[index - 1].labelY + gap,
      );
    }
    if (positioned.at(-1)?.labelY && positioned.at(-1)!.labelY > bottom) {
      positioned[positioned.length - 1].labelY = bottom;
      for (let index = positioned.length - 2; index >= 0; index -= 1) {
        positioned[index].labelY = Math.min(
          positioned[index].labelY,
          positioned[index + 1].labelY - gap,
        );
      }
    }
    if (positioned[0]?.labelY < top) {
      const shift = top - positioned[0].labelY;
      for (const label of positioned) label.labelY += shift;
    }
  };

  normalize();
  if (avoidY !== undefined) {
    for (const label of positioned) {
      if (Math.abs(label.labelY - avoidY) >= avoidGap) continue;
      const direction = label.rawY <= avoidY ? -1 : 1;
      label.labelY = clampChartValue(
        avoidY + direction * avoidGap,
        top,
        bottom,
      );
    }
    normalize();
  }
  return positioned;
}

function selectChartPivots(
  pivots: Analysis['pivots'],
  startIndex: number,
  endIndex: number,
  visibleCount: number,
) {
  const maximumLabels = visibleCount <= 24 ? 6 : visibleCount <= 60 ? 8 : 10;
  const minimumGap = Math.max(2, Math.floor(visibleCount / maximumLabels));
  const candidates = pivots.filter(
    (pivot) => pivot.index >= startIndex && pivot.index < endIndex,
  );
  const selected: Analysis['pivots'] = [];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const pivot = candidates[index];
    if (
      selected.length < maximumLabels &&
      selected.every((item) => Math.abs(item.index - pivot.index) >= minimumGap)
    ) {
      selected.push(pivot);
    }
  }
  return selected.sort((left, right) => left.index - right.index);
}

function describeEntryReason(trade: BacktestTrade, market: Market) {
  const direction = trade.side === 'LONG' ? '상향 돌파' : '하향 이탈';
  const averageSide = trade.side === 'LONG' ? '위' : '아래';
  return `직전 ${trade.lookbackBars}봉 기준가 ${formatPrice(trade.triggerPrice, market)} ${direction} + 20봉 평균선 ${formatPrice(trade.movingAverage, market)} ${averageSide}`;
}

function describeExitReason(trade: BacktestTrade, market: Market) {
  if (trade.exitReason === 'TARGET') {
    return `목표가 ${formatPrice(trade.target, market)} 도달`;
  }
  if (trade.exitReason === 'STOP') {
    return `손절가 ${formatPrice(trade.stop, market)} 도달`;
  }
  return `백테스트 마지막 봉 종가 ${formatPrice(trade.exit, market)}에서 청산`;
}


type TrendMap = {entry:[number,number];stop:number;target:number;caption:string;refined?:[number,number];entryFrame?:string};

function evaluateChartPlan(data:Record<Timeframe,Candle[]>,entryFrame:'1m'|'5m'='1m',capital=10000){
 return evaluateMultiTimeframeEntry({candles:data,entryFrame,capital,snapshots:Object.fromEntries(Object.entries(data).map(([f,rows])=>[f,structureSnapshot(rows)])) as Record<Timeframe,Snapshot>,analyses:{'1m':analyze(data['1m']),'5m':analyze(data['5m']),'15m':analyze(data['15m']),'1H':analyze(data['1H'])}});
}
function chartOverlay(plan:TradePlan):TrendMap|undefined{return plan.ready&&plan.entry&&plan.stop&&plan.target?{entry:plan.entry,stop:plan.stop,target:plan.target,caption:(plan.direction==='LONG'?'롱':'숏')+' · 공통 참고 계획 · '+plan.entryFrame+' 정제',entryFrame:plan.entryFrame}:undefined;}
function CommonPlanCard({plan,market}:{plan:TradePlan;market:Market}){
 const levels=plan.ready?{entry:plan.entry,stop:plan.stop!,target:plan.target!}:plan.candidate;
 const price=(n?:number)=>n===undefined?'미확정':formatPrice(n,market);
 return <details className="common-plan-card clear-action-plan collapsible-plan" aria-label="공통 거래 계획">
 <summary className="compact-plan-summary"><span className={plan.direction==='LONG'?'positive':plan.direction==='SHORT'?'negative':''}>{plan.direction==='LONG'?'롱':plan.direction==='SHORT'?'숏':'방향 미확정'}</span><span>{plan.ready?'진입 조건 충족 · 미체결':'진입 대기'}</span><span className="compact-entry-price">{plan.ready?'진입 가격':'진입 후보'}: {levels?.entry?levels.entry.map(n=>price(n)).join(' – '):'미확정'}</span><span className="plan-expand-label" aria-hidden="true" /></summary>
 <div className="plan-expanded-content">
 <header><strong>{plan.ready?'진입 조건 충족 · 체결 전 확인':'지금은 진입 대기'}</strong><span>{plan.direction==='LONG'?'매수 방향':plan.direction==='SHORT'?'숏 방향':'방향 미확정'} · {plan.stage}</span></header>
 <p className="plan-context">{plan.context}</p>
 <div className="common-plan-values">
 <div><small>① 기다릴 위치 · 4H 관심 구역</small><b>{plan.interest?plan.interest.map(n=>price(n)).join(' – '):'상위 구역 미확정'}</b></div>
 <div><small>② {plan.entryFrame} 진입 구역 · {plan.ready?'조건 충족':'조건부 후보'}</small><b>{levels?.entry?levels.entry.map(n=>price(n)).join(' – '):'하위 정제 전 · 진입가 없음'}</b></div>
 <div><small>③ 손절 기준 · 15분 상위 구조</small><b className="negative">{price(levels?.stop)}</b></div>
 <div><small>④ 익절 목표 · 4H 스윙 극점</small><b className="positive">{price(levels?.target)}</b></div>
 </div>
 <p>진입은 표시 구역에 재접촉하고 아래 조건을 확인한 뒤 판단합니다. 관심 구역의 중심을 진입가로 쓰지 않습니다. 작은 봉으로 이동해도 상위 손절·목표는 같은 계획을 봅니다.</p>
 <p><b>보유·청산:</b> 진입 후 최초 손절·목표를 유지하고 4시간 구조 무효화를 확인합니다. 1분/5분 반대 신호만으로 익절하지 않으며, 목표를 임의로 늘리거나 손절을 넓히지 않습니다.</p>
 {!plan.ready&&<p><b>다음 확인:</b> {plan.blockers?.[0]??plan.stage} · 후보 가격선은 주문·체결 표시가 아닙니다.</p>}
 <details><summary>왜 대기하나요? · 구조 조건과 추가 제한 구분</summary><ul>{plan.blockers?.map((reason,i)=><li key={i}>{reason}</li>)}</ul><p>15분 손절·4시간 목표, 0.1% 완충, A/B등급, H1 동행, 순 2R와 30분 제한은 현재 구현의 검증 설정입니다. 강의의 모든 거래에 적용되는 고정 공식으로 확인된 것은 아닙니다. 시세 오류·미래 데이터·중복 체결 방지는 별도 안전 검사입니다.</p></details>
 <p>이 화면은 차트 참고 계획입니다. 보유 중인 자동 계좌의 실제 진입·손절·목표는 모의투자에 저장된 값을 따릅니다.</p>
 </div></details>;
}

function PriceChart({
  data,
  analysis,
  market,
  timeframe,
  layers,
  seriesKey,
  livePrice,
  trendPlan,
  higherZones = [],
  referencePlan,
}: {
  data: Candle[];
  analysis: Analysis;
  market: Market;
  timeframe: Timeframe;
  layers: Record<LayerKey, boolean>;
  seriesKey: string;
  livePrice?: number;
  trendPlan?: TrendMap;
  higherZones?: HigherContext[];
  referencePlan?: TradePlan;
}) {
  const defaultTargetBars =
    timeframe === '1H' || timeframe === '4H' || timeframe === '1D'
      ? HIGHER_TIMEFRAME_CHART_BARS
      : DEFAULT_CHART_BARS;
  const defaultBars = Math.min(defaultTargetBars, Math.max(1, data.length));
  const [viewport, setViewport] = useState({
    bars: defaultBars,
    end: data.length,
  });
  const [dragging, setDragging] = useState(false);
  const seriesKeyRef = useRef(seriesKey);
  const dataLengthRef = useRef(data.length);
  const chartRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startEnd: number;
    bars: number;
  } | null>(null);

  useEffect(() => {
    const seriesChanged = seriesKeyRef.current !== seriesKey;
    const previousLength = dataLengthRef.current;
    seriesKeyRef.current = seriesKey;
    dataLengthRef.current = data.length;

    setViewport((previous) => {
      if (seriesChanged) {
        return {
          bars: Math.min(defaultTargetBars, Math.max(1, data.length)),
          end: data.length,
        };
      }

      const maximumBars = Math.min(MAX_CHART_BARS, Math.max(1, data.length));
      const bars = Math.min(previous.bars, maximumBars);
      const wasFollowingLatest = previous.end >= previousLength;
      const end = wasFollowingLatest
        ? data.length
        : clampChartValue(previous.end, bars, data.length);
      return { bars, end };
    });
  }, [data.length, defaultTargetBars, seriesKey]);

  const maximumBars = Math.min(MAX_CHART_BARS, Math.max(1, data.length));
  const minimumBars = Math.min(MIN_CHART_BARS, maximumBars);
  const visibleBars = clampChartValue(viewport.bars, minimumBars, maximumBars);
  const endIndex = clampChartValue(viewport.end, visibleBars, data.length);
  const offset = Math.max(0, endIndex - visibleBars);
  const displayed = data.slice(offset, endIndex);
  const isViewingLatest = endIndex >= data.length;

  const zoomBy = (factor: number, anchorRatio = 0.5) => {
    if (!data.length) return;
    setViewport((previous) => {
      const maxBars = Math.min(MAX_CHART_BARS, data.length);
      const minBars = Math.min(MIN_CHART_BARS, maxBars);
      const currentBars = clampChartValue(previous.bars, minBars, maxBars);
      const currentEnd = clampChartValue(
        previous.end,
        currentBars,
        data.length,
      );
      const nextBars = clampChartValue(
        Math.round(currentBars * factor),
        minBars,
        maxBars,
      );
      if (currentEnd >= data.length) {
        return { bars: nextBars, end: data.length };
      }
      const currentStart = currentEnd - currentBars;
      const anchorIndex = currentStart + currentBars * anchorRatio;
      const nextStart = clampChartValue(
        Math.round(anchorIndex - nextBars * anchorRatio),
        0,
        data.length - nextBars,
      );
      return { bars: nextBars, end: nextStart + nextBars };
    });
  };

  const resetViewport = () => {
    setViewport({
      bars: Math.min(defaultTargetBars, Math.max(1, data.length)),
      end: data.length,
    });
  };

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = chart.getBoundingClientRect();
      const anchorRatio = clampChartValue(
        (event.clientX - bounds.left) / Math.max(bounds.width, 1),
        0,
        1,
      );
      const factor = event.deltaY < 0 ? 0.82 : 1.22;
      setViewport((previous) => {
        const maxBars = Math.min(MAX_CHART_BARS, data.length);
        const minBars = Math.min(MIN_CHART_BARS, maxBars);
        const currentBars = clampChartValue(previous.bars, minBars, maxBars);
        const currentEnd = clampChartValue(
          previous.end,
          currentBars,
          data.length,
        );
        const nextBars = clampChartValue(
          Math.round(currentBars * factor),
          minBars,
          maxBars,
        );
        if (currentEnd >= data.length) {
          return { bars: nextBars, end: data.length };
        }
        const currentStart = currentEnd - currentBars;
        const anchorIndex = currentStart + currentBars * anchorRatio;
        const nextStart = clampChartValue(
          Math.round(anchorIndex - nextBars * anchorRatio),
          0,
          data.length - nextBars,
        );
        return { bars: nextBars, end: nextStart + nextBars };
      });
    };

    chart.addEventListener('wheel', handleWheel, { passive: false });
    return () => chart.removeEventListener('wheel', handleWheel);
  }, [data.length]);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startEnd: endIndex,
      bars: visibleBars,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const movedBars = Math.round(
      ((drag.startX - event.clientX) / Math.max(bounds.width, 1)) * drag.bars,
    );
    setViewport((previous) => ({
      ...previous,
      end: clampChartValue(drag.startEnd + movedBars, drag.bars, data.length),
    }));
  };

  const finishPointerDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  if (data.length < 2) return <div className="chart-data-wait" role="status"><strong>{timeframe==='1m'?'원본 1분봉을 기다리고 있습니다':'차트 데이터를 기다리고 있습니다'}</strong><p>{timeframe==='1m'?'1분봉이 제공되면 표시합니다. 5분봉을 분할하거나 대신 사용해 진입하지 않습니다.':'해당 시간대 데이터가 도착하면 구조를 표시합니다.'}</p></div>;

  const width = 900;
  const height = 430;
  const padding = 28;
  // Keep the chart body, annotation rail, and price axis as separate columns.
  // The extra axis breathing room prevents the live price badge from visually
  // intruding into the annotation table at the right edge of the chart.
  const labelRailWidth = 200;
  const axisWidth = 66;
  const plotRight = width - padding - labelRailWidth;
  const axisStart = width - padding - axisWidth;
  const volumeBottom = height - padding;
  const volumeTop = volumeBottom - 70;
  const chartBottom = layers.volume ? volumeTop - 20 : height - padding;
  const visibleZones = [
    ...analysis.orderBlocks,
    ...analysis.fairValueGaps,
  ].filter((zone) => zone.endIndex >= offset && zone.startIndex < endIndex);
  const visibleLiquidity = analysis.liquidity.filter(
    (level) => level.index >= offset && level.index < endIndex,
  );
  const showForecast =
    layers.forecast && isViewingLatest && !!trendPlan;
  const pendingPlan = layers.forecast && isViewingLatest && !referencePlan?.ready ? referencePlan?.candidate : undefined;
  const candleMaximum = Math.max(...displayed.map((candle) => candle.high));
  const candleMinimum = Math.min(...displayed.map((candle) => candle.low));
  const latestVisibleCandle = displayed.at(-1)!;
  const livePriceRatio = Number.isFinite(livePrice) && latestVisibleCandle.close > 0
    ? livePrice! / latestVisibleCandle.close
    : 0;
  const livePriceMatchesSeries = livePriceRatio >= 0.5 && livePriceRatio <= 2;
  const currentPrice =
    isViewingLatest && livePriceMatchesSeries
      ? livePrice!
      : latestVisibleCandle.close;
  const visiblePriceSpan = Math.max(
    candleMaximum - candleMinimum,
    Math.abs(candleMaximum) * 0.0015,
    0.0001,
  );
  const autoFitMinimum = candleMinimum - visiblePriceSpan * 0.75;
  const autoFitMaximum = candleMaximum + visiblePriceSpan * 0.75;
  const nearbyOverlayValues = [
    ...(layers.volumeProfile ? [analysis.vah, analysis.poc, analysis.val] : []),
    ...(layers.orderflow
      ? visibleZones.flatMap((zone) => [zone.high, zone.low])
      : []),
    ...(layers.liquidity ? visibleLiquidity.map((level) => level.price) : []),
    ...(showForecast
      ? [(trendPlan?.entry[0]??0), (trendPlan?.entry[1]??0), (trendPlan?.stop??0), (trendPlan?.target??0)]
      : []),
  ].filter((value) => value >= autoFitMinimum && value <= autoFitMaximum);
  const fittedMaximum = Math.max(candleMaximum, currentPrice, ...nearbyOverlayValues);
  const fittedMinimum = Math.min(candleMinimum, currentPrice, ...nearbyOverlayValues);
  const fittedSpan = Math.max(fittedMaximum - fittedMinimum, visiblePriceSpan);
  const verticalPadding = fittedSpan * 0.12;
  const maximum = fittedMaximum + verticalPadding;
  const minimum = fittedMinimum - verticalPadding;
  const isPriceOnScale = (value: number) =>
    value >= minimum && value <= maximum;
  const shownHigherZones = layers.htfPOI && isViewingLatest ? higherZones : [];
  const scaledZones = visibleZones.filter(
    (zone) => zone.low <= maximum && zone.high >= minimum,
  );
  const scaledLiquidity = visibleLiquidity.filter((level) =>
    isPriceOnScale(level.price),
  );
  const x = (index: number) =>
    padding +
    (index / Math.max(displayed.length - 1, 1)) * (plotRight - padding);
  const y = (value: number) =>
    padding +
    ((maximum - value) / Math.max(maximum - minimum, 0.000001)) *
      (chartBottom - padding);
  const clampedY = (value: number) =>
    clampChartValue(y(value), padding, chartBottom);
  const priceTicks = createPriceTicks(minimum, maximum);
  const currentPriceY = clampedY(currentPrice);
  const currentPriceDirection =
    currentPrice >= latestVisibleCandle.close ? 'up' : 'down';
  const profileMaximum = Math.max(...analysis.profile, 1);
  const volumeMaximum = Math.max(
    ...displayed.map((candle) => candle.volume),
    1,
  );
  const volumeY = (value: number) =>
    volumeBottom - (value / volumeMaximum) * (volumeBottom - volumeTop);
  const visibleVolumeAverages = displayed.map((_, index) => {
    const sourceIndex = offset + index;
    const sample = data.slice(Math.max(0, sourceIndex - 19), sourceIndex + 1);
    return (
      sample.reduce((sum, candle) => sum + candle.volume, 0) /
      Math.max(sample.length, 1)
    );
  });
  const volumeAveragePath = visibleVolumeAverages
    .map((value, index) => `${index ? 'L' : 'M'} ${x(index)} ${volumeY(value)}`)
    .join(' ');
  const volumeLevels = [
    { value: analysis.vah, label: 'VAH' },
    { value: analysis.poc, label: 'POC' },
    { value: analysis.val, label: 'VAL' },
  ];
  const priceLabels = layoutChartPriceLabels(
    [
      ...(layers.volumeProfile
        ? volumeLevels.map((level) => ({
            key: level.label,
            label: `${level.label} ${formatPrice(level.value, market)}`,
            value: level.value,
            tone: 'profile' as const,
          }))
        : []),
      ...(pendingPlan ? [
        ...(pendingPlan.entry?[{key:'pending-entry',label:'조건부 진입 '+pendingPlan.entry.map(n=>formatPrice(n,market)).join('–'),value:(pendingPlan.entry[0]+pendingPlan.entry[1])/2,tone:'entry' as const}]:[]),
        {key:'pending-stop',label:'계획 손절 '+formatPrice(pendingPlan.stop,market),value:pendingPlan.stop,tone:'stop' as const},
        {key:'pending-target',label:'계획 익절 '+formatPrice(pendingPlan.target,market),value:pendingPlan.target,tone:'target' as const},
      ] : []),
      ...(showForecast
        ? [
            {
              key: 'forecast-entry',
              label: `진입 후보 ${formatPrice((trendPlan?(trendPlan.entry[0]+trendPlan.entry[1])/2:0), market)}`,
              value: (trendPlan?(trendPlan.entry[0]+trendPlan.entry[1])/2:0),
              tone: 'entry' as const,
            },
            {
              key: 'forecast-stop',
              label: `무효화 ${formatPrice((trendPlan?.stop??0), market)}`,
              value: (trendPlan?.stop??0),
              tone: 'stop' as const,
            },
            {
              key: 'forecast-target',
              label: `목표 ${formatPrice((trendPlan?.target??0), market)}`,
              value: (trendPlan?.target??0),
              tone: 'target' as const,
            },
          ]
        : []),
    ],
    y,
    padding + 8,
    chartBottom - 8,
    currentPriceY,
  );
  const structurePivots = selectChartPivots(
    analysis.pivots,
    offset,
    endIndex,
    displayed.length,
  );
  const internalStructurePivots = selectChartPivots(
    analysis.internalPivots,
    offset,
    endIndex,
    Math.max(displayed.length, 80),
  );
  const visibleSwingMap = analysis.pivots.filter(
    (pivot) => pivot.index >= offset && pivot.index < endIndex,
  );
  const visibleInternalMap = analysis.internalPivots.filter(
    (pivot) => pivot.index >= offset && pivot.index < endIndex,
  );
  const swingMapPath = visibleSwingMap
    .map(
      (pivot, index) =>
        `${index ? 'L' : 'M'} ${x(pivot.index - offset)} ${y(pivot.price)}`,
    )
    .join(' ');
  const internalMapPath = visibleInternalMap
    .map(
      (pivot, index) =>
        `${index ? 'L' : 'M'} ${x(pivot.index - offset)} ${y(pivot.price)}`,
    )
    .join(' ');
  const visibleStructureEvents = analysis.structureEvents.filter(
    (event) =>
      event.index >= offset &&
      event.index < endIndex &&
      event.price >= minimum &&
      event.price <= maximum,
  );
  const dealingRange = isViewingLatest ? analysis.confirmedRange : mapMarketStructure(data.slice(0, Math.max(0, endIndex - 1))).range;
  const gradingBars = closedBars(data.slice(0, endIndex), timeframeSizes[timeframe]*5, Date.now());
  const supplyDemand = layers.supplyDemand ? qualifiedZone(gradingBars, timeframeSizes[timeframe]*5) : undefined;
  const zoneFirstBar=supplyDemand?data.findIndex(b=>Date.parse(b.date)>=supplyDemand.zone.at):-1;
  const zoneLeft=x(Math.max(0,(zoneFirstBar<0?endIndex-1:zoneFirstBar)-offset));
  const equilibriumY = dealingRange
    ? clampedY(dealingRange.equilibrium)
    : null;
  const rangeHighY = dealingRange ? clampedY(dealingRange.high) : null;
  const rangeLowY = dealingRange ? clampedY(dealingRange.low) : null;

  return (
    <>
      {supplyDemand && <details className="chart-zone-details"><summary>{supplyDemand.direction==='LONG'?'수요':'공급'} 구역 {supplyDemand.zone.quality?.grade}등급 · 평가 근거</summary><p>{supplyDemand.zone.quality?.reasons.join(' · ')}</p><p>A ≥ 4점 · B 3점 · C ≤ 2점. 관측한 구조를 분류하는 실험 점수이며 승률이 아닙니다. 자동 진입은 H4·M15·M1의 A/B등급만 사용합니다.</p></details>}
    <div className="chart-wrap">
      <div className="chart-badges">
        <span>{timeframe}</span>
        <span className="soft">OHLCV · {displayed.length}봉</span>
        {timeframe==='1m' && data.length<20 && <span role="status">원본 1분봉 부족 · 진입 대기 (5분봉 대체 없음)</span>}
        {supplyDemand && <span className="zone-grade" title={supplyDemand.zone.quality?.reasons.join(' · ')}>{supplyDemand.direction==='LONG'?'수요':'공급'} {supplyDemand.zone.quality?.grade} · {supplyDemand.zone.quality?.score}/{supplyDemand.zone.quality?.maximum}</span>}
        <span className="soft">
          {isViewingLatest ? '최신 구간' : `${offset + 1}–${endIndex}봉`}
        </span>
        <span className="soft">Y축 · 화면 맞춤</span>
        <span className="soft">{analysis.marketPhase}</span>
        {analysis.protectedPrice !== undefined && <span className="soft">보호 수준 {formatPrice(analysis.protectedPrice, market)} · 종가 이탈 시 전환 경고</span>}
        {layers.structure && (
          <span
            className={`structure-state ${analysis.structureState.swingTrend.toLowerCase()}`}
          >
            Swing {analysis.structureState.swingTrend}
          </span>
        )}
        {layers.internalStructure && (
          <span
            className={`structure-state internal ${analysis.structureState.internalTrend.toLowerCase()}`}
          >
            Internal {analysis.structureState.internalTrend}
          </span>
        )}
        {layers.volume && (
          <span
            className={`volume-ratio ${analysis.volumeStats.ratio >= 1.5 ? 'surge' : ''}`}
          >
            RVOL {analysis.volumeStats.ratio.toFixed(2)}×
          </span>
        )}
        {layers.orderflow && (
          <span className="soft">
            OB/FVG · {visibleZones.filter((zone) => zone.active).length}
          </span>
        )}
        {layers.liquidity && (
          <span className="soft">Liquidity · {visibleLiquidity.length}</span>
        )}
        {layers.htfPOI && (<> {shownHigherZones.map(zone => <span key={zone.frame} className="soft">HTF {zone.frame} {zone.direction==='LONG'?'수요':'공급'} · {zone.grade} · {formatPrice(zone.low,market)}–{formatPrice(zone.high,market)}{zone.low>maximum?' · 화면 위':zone.high<minimum?' · 화면 아래':''} · 진입가 아님</span>)}{!shownHigherZones.length && <span className="soft">{isViewingLatest?'상위 확정 구역 없음':'최신 구간에서 상위 구역 확인'}</span>}</>)}
        {layers.forecast && (
          <span
            className={`forecast-badge ${analysis.entryForecast.status.toLowerCase()}`}
          >
            {showForecast ? trendPlan?.caption : pendingPlan ? '조건부 계획 · 진입 대기 · 15분 손절 / 4H 익절' : !isViewingLatest?'최신 구간에서 상위 계획 표시':'공통 계획의 진입 조건 대기 · 가격선 없음'}
          </span>
        )}
      </div>
      <div className="chart-zoom-controls" aria-label="차트 확대 축소 도구">
        <button
          type="button"
          onClick={() => zoomBy(0.82)}
          disabled={visibleBars <= minimumBars}
          aria-label="차트 확대"
          title="확대"
        >
          <ZoomIn size={14} />
        </button>
        <span>{displayed.length}봉</span>
        <button
          type="button"
          onClick={() => zoomBy(1.22)}
          disabled={visibleBars >= maximumBars}
          aria-label="차트 축소"
          title="축소"
        >
          <ZoomOut size={14} />
        </button>
        <button
          type="button"
          onClick={resetViewport}
          aria-label="차트 범위 초기화"
          title={`${defaultTargetBars}봉 최신 구간으로 초기화`}
        >
          <RotateCcw size={13} />
          <span className="reset-label">초기화</span>
        </button>
      </div>
      <div className="chart-gesture-hint" aria-hidden="true">
        휠 확대·축소 · 드래그 이동 · 더블클릭 초기화
      </div>
      <svg
        ref={chartRef}
        className={dragging ? 'dragging' : ''}
        viewBox={`0 0 ${width} ${height}`}
        aria-label={`${timeframe} 가격 구조 차트`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onDoubleClick={resetViewport}
      >
        <g
          key={`viewport-${seriesKey}-${offset}-${endIndex}-${visibleBars}`}
          className="chart-viewport-layer"
        >
          <rect
            x={plotRight + 7}
            y={padding}
            width={axisStart - (plotRight + 7)}
            height={chartBottom - padding}
            className="price-label-rail-background"
          />
          <rect
            x={axisStart}
            y={padding}
            width={width - padding - axisStart}
            height={chartBottom - padding}
            className="price-axis-background"
          />
          {pendingPlan&&<g aria-label="조건부 진입 및 상위 손절 익절 계획" pointerEvents="none">{[pendingPlan.stop,pendingPlan.target,...(pendingPlan.entry??[])].map((price,i)=>isPriceOnScale(price)?<line key={i} x1={padding} x2={plotRight} y1={y(price)} y2={y(price)} stroke={i===0?'#f06774':i===1?'#28d59a':'#52cddd'} strokeDasharray="7 5" opacity="0.8"/>:null)}</g>}
          <HigherContextOverlay zones={shownHigherZones} minimum={minimum} maximum={maximum} left={padding} right={plotRight} top={padding} bottom={chartBottom} y={y} />
          {supplyDemand && supplyDemand.zone.high>=minimum && supplyDemand.zone.low<=maximum && <g aria-label="확정 수요 공급 구역과 실험 등급">
            <title>{supplyDemand.zone.quality?.reasons.join(' · ')} · A≥4 / B=3 / C≤2 · 승률 아님</title>
            <rect x={zoneLeft} y={clampedY(supplyDemand.zone.high)} width={Math.max(1,plotRight-zoneLeft)} height={Math.max(2,clampedY(supplyDemand.zone.low)-clampedY(supplyDemand.zone.high))} fill={supplyDemand.direction==='LONG'?'#36c5a2':'#eb788a'} fillOpacity="0.13" stroke={supplyDemand.direction==='LONG'?'#36c5a2':'#eb788a'} strokeDasharray="6 3"/>
            <text x={Math.min(zoneLeft+8,plotRight-120)} y={Math.max(padding+16,clampedY(supplyDemand.zone.high)+16)} fill={supplyDemand.direction==='LONG'?'#60dfbd':'#ffa4b3'} fontSize="14">{supplyDemand.direction==='LONG'?'수요':'공급'} · {supplyDemand.zone.quality?.grade}등급</text>
          </g>}
          {layers.premiumDiscount &&
            dealingRange &&
            equilibriumY !== null &&
            rangeHighY !== null &&
            rangeLowY !== null && (
            <g className="premium-discount-layer" aria-label="프리미엄 디스카운트 영역">
              <rect
                x={padding}
                y={rangeHighY}
                width={plotRight - padding}
                height={Math.max(0, equilibriumY - rangeHighY)}
                className="premium-zone"
              />
              <rect
                x={padding}
                y={equilibriumY}
                width={plotRight - padding}
                height={Math.max(0, rangeLowY - equilibriumY)}
                className="discount-zone"
              />
              <line
                x1={padding}
                x2={plotRight}
                y1={equilibriumY}
                y2={equilibriumY}
                className="equilibrium-line"
              />
              <text
                x={padding + 8}
                y={Math.min(equilibriumY - 4, rangeHighY + 14)}
                className="premium-label"
              >
                PREMIUM
              </text>
              <text
                x={padding + 8}
                y={Math.min(chartBottom - 8, equilibriumY + 15)}
                className="discount-label"
              >
                DISCOUNT
              </text>
            </g>
          )}
          {layers.volumeProfile &&
            analysis.val <= maximum &&
            analysis.vah >= minimum && (
              <rect
                x={padding}
                y={clampedY(analysis.vah)}
                width={plotRight - padding}
                height={Math.max(
                  2,
                  clampedY(analysis.val) - clampedY(analysis.vah),
                )}
                fill="#6d5dfc"
                opacity=".08"
              />
            )}
          {priceTicks.map((value) => (
            <line
              key={value}
              x1={padding}
              x2={plotRight}
              y1={y(value)}
              y2={y(value)}
              className="gridline"
            />
          ))}
          <line
            x1={padding}
            x2={axisStart}
            y1={currentPriceY}
            y2={currentPriceY}
            className={`current-price-line ${currentPriceDirection}`}
          />
          {showForecast && (
            <g className="entry-forecast-layer">
              {trendPlan?.refined&&<g><rect x={padding} y={Math.min(clampedY(trendPlan.refined[0]),clampedY(trendPlan.refined[1]))} width={plotRight-padding} height={Math.max(2,Math.abs(clampedY(trendPlan.refined[0])-clampedY(trendPlan.refined[1])))} fill="#30d6b0" fillOpacity=".15" stroke="#30d6b0" strokeDasharray="4 4"/><text x={padding+8} y={clampedY(trendPlan.refined[1])-6} fill="#30d6b0" fontSize="11">{trendPlan.entryFrame} 정제 후보 · 확정 주문 아님</text></g>}
              <rect
                x={x(Math.max(0, displayed.length - 46))}
                y={Math.min(
                  clampedY((trendPlan?.entry[0]??0)),
                  clampedY((trendPlan?.entry[1]??0)),
                )}
                width={plotRight - x(Math.max(0, displayed.length - 46))}
                height={Math.max(
                  2,
                  Math.abs(
                    clampedY((trendPlan?.entry[0]??0)) - clampedY((trendPlan?.entry[1]??0)),
                  ),
                )}
                className="entry-forecast-zone"
              />
              <line
                x1={x(Math.max(0, displayed.length - 46))}
                x2={plotRight}
                y1={clampedY((trendPlan?(trendPlan.entry[0]+trendPlan.entry[1])/2:0))}
                y2={clampedY((trendPlan?(trendPlan.entry[0]+trendPlan.entry[1])/2:0))}
                className="entry-trigger-line"
              />
              <line
                x1={x(Math.max(0, displayed.length - 46))}
                x2={plotRight}
                y1={clampedY((trendPlan?.stop??0))}
                y2={clampedY((trendPlan?.stop??0))}
                className="entry-invalidation-line"
              />
              <line
                x1={x(Math.max(0, displayed.length - 46))}
                x2={plotRight}
                y1={clampedY((trendPlan?.target??0))}
                y2={clampedY((trendPlan?.target??0))}
                className="entry-target-line"
              />
            </g>
          )}
          {layers.orderflow &&
            scaledZones.map((zone, zoneIndex) => {
              const start = Math.max(0, zone.startIndex - offset);
              const zoneClass = zone.kind.toLowerCase().replace('_', '-');
              return (
                <g
                  key={`${zone.kind}-${zone.startIndex}-${zone.endIndex}-${zoneIndex}`}
                  opacity={zone.active ? 1 : 0.35}
                >
                  <rect
                    x={x(start)}
                    y={clampedY(zone.high)}
                    width={Math.max(20, plotRight - x(start))}
                    height={Math.max(
                      2,
                      clampedY(zone.low) - clampedY(zone.high),
                    )}
                    className={`structure-zone ${zoneClass}`}
                  />
                  <text
                    x={x(start) + 4}
                    y={clampedY(zone.high) - 4}
                    className="zone-label"
                  >
                    {zone.label}
                  </text>
                </g>
              );
            })}
          {layers.volumeProfile &&
            analysis.profile.map((volume, index) => {
              const barWidth = (volume / profileMaximum) * 90;
              const center =
                analysis.profileMin + (index + 0.5) * analysis.profileStep;
              if (!isPriceOnScale(center)) return null;
              return (
                <rect
                  key={index}
                  x={plotRight - barWidth}
                  y={y(center) - 2}
                  width={barWidth}
                  height={4}
                  className="profile-bar"
                />
              );
            })}
          {layers.structure && swingMapPath && (
            <path d={swingMapPath} className="structure-map swing" />
          )}
          {layers.internalStructure && internalMapPath && (
            <path d={internalMapPath} className="structure-map internal" />
          )}
          {visibleStructureEvents
            .filter(
              (event) =>
                (event.scope === 'SWING' &&
                  (event.kind === 'CHOCH' ? layers.choch : layers.structure)) ||
                (event.scope === 'INTERNAL' && layers.internalStructure),
            )
            .map((event) => {
              const startX = x(Math.max(0, event.pivotIndex - offset));
              const endX = x(event.index - offset);
              const labelX = Math.min(
                plotRight - 34,
                Math.max(startX, endX - 8),
              );
              const lowImportanceDiscountChoch =
                event.kind === 'CHOCH' &&
                event.direction === 'BEARISH' &&
                dealingRange !== null &&
                event.price < dealingRange.equilibrium;
              const eventLabel =
                event.kind === 'CHOCH'
                  ? `${event.scope === 'SWING' ? 'Swing' : 'Internal'} ${event.direction === 'BULLISH' ? '강세' : '약세'} CHOCH ${event.direction === 'BULLISH' ? '↑' : '↓'}${lowImportanceDiscountChoch ? ' · 낮은 중요도' : ''}`
                  : event.label;
              return (
                <g
                  key={`${event.scope}-${event.kind}-${event.index}`}
                  className={`structure-event ${event.scope.toLowerCase()} ${event.kind.toLowerCase()} ${event.direction.toLowerCase()}${lowImportanceDiscountChoch ? ' low-importance' : ''}`}
                >
                  <line
                    x1={startX}
                    x2={endX}
                    y1={y(event.price)}
                    y2={y(event.price)}
                  />
                  <circle cx={endX} cy={y(event.price)} r="2.5" />
                  <text x={labelX} y={y(event.price) - 5} textAnchor="end">
                    {eventLabel}
                  </text>
                  <title>{`${event.label} · 종가 기준 구조 이탈 · ${data[event.index]?.date.slice(0, 16) ?? ''}`}</title>
                </g>
              );
            })}
          {displayed.map((candle, index) => {
            const upward = candle.close >= candle.open;
            const candleWidth = Math.max(
              2,
              ((plotRight - padding) / displayed.length) * 0.58,
            );
            return (
              <g key={`${candle.date}-${index}`}>
                <line
                  x1={x(index)}
                  x2={x(index)}
                  y1={y(candle.high)}
                  y2={y(candle.low)}
                  className={upward ? 'wick up' : 'wick down'}
                />
                <rect
                  x={x(index) - candleWidth / 2}
                  y={Math.min(y(candle.open), y(candle.close))}
                  width={candleWidth}
                  height={Math.max(
                    1,
                    Math.abs(y(candle.open) - y(candle.close)),
                  )}
                  className={upward ? 'candle up' : 'candle down'}
                />
              </g>
            );
          })}
          {layers.volumeProfile &&
            volumeLevels
              .filter((level) => isPriceOnScale(level.value))
              .map((level) => (
                <g key={level.label}>
                  <line
                    x1={padding}
                    x2={plotRight}
                    y1={y(level.value)}
                    y2={y(level.value)}
                    className={`level ${level.label.toLowerCase()}`}
                  />
                </g>
              ))}
          {layers.swingLabels &&
            structurePivots.map((pivot) => (
              <g
                key={`${pivot.kind}-${pivot.index}`}
                className={`structure-marker ${pivot.kind}`}
              >
                <circle
                  cx={x(pivot.index - offset)}
                  cy={y(pivot.price)}
                  r="2.5"
                />
                <text
                  x={x(pivot.index - offset)}
                  y={y(pivot.price) + (pivot.kind === 'high' ? -10 : 17)}
                  textAnchor="middle"
                  className="structure"
                >
                  {pivot.label}
                </text>
                <title>{`${pivot.label} · ${formatPrice(pivot.price, market)} · ${data[pivot.index]?.date.slice(0, 16) ?? ''}`}</title>
              </g>
            ))}
          {layers.internalStructure &&
            internalStructurePivots.map((pivot) => (
              <g
                key={`internal-${pivot.kind}-${pivot.index}`}
                className={`internal-structure-marker ${pivot.kind}`}
              >
                <circle
                  cx={x(pivot.index - offset)}
                  cy={y(pivot.price)}
                  r="1.8"
                />
                <text
                  x={x(pivot.index - offset)}
                  y={y(pivot.price) + (pivot.kind === 'high' ? -6 : 11)}
                  textAnchor="middle"
                >
                  {pivot.label}
                </text>
                <title>{`Internal ${pivot.label} · ${formatPrice(pivot.price, market)}`}</title>
              </g>
            ))}
          {layers.liquidity &&
            scaledLiquidity.map((level) => (
              <g key={`${level.kind}-${level.index}`}>
                <line
                  x1={Math.max(padding, x(Math.max(0, level.index - offset)))}
                  x2={plotRight}
                  y1={y(level.price)}
                  y2={y(level.price)}
                  className={`liquidity-level ${level.kind === 'BUY_SIDE' ? 'buy-side' : 'sell-side'}`}
                />
                <text
                  x={padding + 4}
                  y={y(level.price) - 4}
                  className="liquidity-label"
                >
                  {level.kind === 'BUY_SIDE' ? 'BSL' : 'SSL'} ×{level.touches} · {level.status === 'SWEPT' ? '스윕 후보' : level.status === 'BROKEN' ? '돌파됨' : '미소진 후보'}
                </text>
              </g>
            ))}
          <line
            x1={plotRight + 7}
            x2={plotRight + 7}
            y1={padding}
            y2={chartBottom}
            className="price-rail-divider"
          />
          <g className="price-label-rail">
            {priceLabels.map((label) => {
              const edgePrefix =
                label.edge === 'above'
                  ? '↑ '
                  : label.edge === 'below'
                    ? '↓ '
                    : '';
              const railStart = plotRight + 14;
              const railEnd = axisStart - 9;
              return (
                <g key={label.key} className={`price-label-item ${label.tone}`}>
                  <path
                    d={`M ${plotRight - 3} ${label.lineY} L ${railStart - 5} ${label.labelY} L ${railStart} ${label.labelY}`}
                    className="price-label-connector"
                  />
                  <rect
                    x={railStart}
                    y={label.labelY - 9}
                    width={railEnd - railStart}
                    height="18"
                    rx="3"
                    className="price-label-badge"
                  />
                  <text
                    x={railEnd - 5}
                    y={label.labelY + 3}
                    textAnchor="end"
                    className="price-label-text"
                    textLength={label.label.length>16?railEnd-railStart-12:undefined}
                    lengthAdjust="spacingAndGlyphs"
                  >
                    {edgePrefix}
                    {label.label}
                  </text>
                </g>
              );
            })}
          </g>
          <line
            x1={axisStart}
            x2={axisStart}
            y1={padding}
            y2={chartBottom}
            className="price-axis-divider"
          />
          <g className="price-axis" aria-label="가격 눈금">
            {priceTicks
              .filter((value) => Math.abs(y(value) - currentPriceY) >= 12)
              .map((value) => (
                <g key={value}>
                  <line
                    x1={axisStart}
                    x2={axisStart + 5}
                    y1={y(value)}
                    y2={y(value)}
                    className="price-axis-tick"
                  />
                  <text
                    x={width - padding - 4}
                    y={y(value) + 3}
                    textAnchor="end"
                    className="price-axis-text"
                  >
                    {formatAxisPrice(value, market)}
                  </text>
                </g>
              ))}
            <g className={`current-price-badge ${currentPriceDirection}`}>
              <rect
                x={axisStart + 3}
                y={currentPriceY - 9}
                width={width - padding - axisStart - 3}
                height="18"
                rx="2"
              />
              <text
                x={width - padding - 4}
                y={currentPriceY + 3}
                textAnchor="end"
              >
                {formatAxisPrice(currentPrice, market)}
              </text>
              <title>{`현재가 ${formatPrice(currentPrice, market)}`}</title>
            </g>
          </g>
          {layers.volume && (
            <g className="volume-pane" aria-label="거래량">
              <line
                x1={padding}
                x2={axisStart}
                y1={volumeTop - 10}
                y2={volumeTop - 10}
                className="volume-divider"
              />
              <line
                x1={padding}
                x2={plotRight}
                y1={volumeY(volumeMaximum * 0.5)}
                y2={volumeY(volumeMaximum * 0.5)}
                className="volume-gridline"
              />
              {displayed.map((candle, index) => {
                const upward = candle.close >= candle.open;
                const barWidth = Math.max(
                  2,
                  ((plotRight - padding) / displayed.length) * 0.58,
                );
                return (
                  <rect
                    key={`volume-${candle.date}-${index}`}
                    x={x(index) - barWidth / 2}
                    y={volumeY(candle.volume)}
                    width={barWidth}
                    height={Math.max(1, volumeBottom - volumeY(candle.volume))}
                    className={`volume-bar ${upward ? 'up' : 'down'}`}
                  >
                    <title>{`${candle.date.slice(0, 16)} · 거래량 ${formatVolume(candle.volume)}`}</title>
                  </rect>
                );
              })}
              <path d={volumeAveragePath} className="volume-average" />
              <text x={padding + 4} y={volumeTop + 11} className="volume-label">
                VOL {formatVolume(latestVisibleCandle.volume)}
              </text>
              <text
                x={padding + 4}
                y={volumeTop + 24}
                className="volume-average-label"
              >
                MA20 {formatVolume(visibleVolumeAverages.at(-1) ?? 0)} · RVOL{' '}
                {analysis.volumeStats.ratio.toFixed(2)}×
              </text>
              <text
                x={width - padding - 4}
                y={volumeTop + 11}
                textAnchor="end"
                className="volume-scale-label"
              >
                {formatVolume(volumeMaximum)}
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
    </>
  );
}

function Equity({ values }: { values: number[] }) {
  const data = values.length ? values : [10_000];
  const width = 900;
  const height = 240;
  const padding = 20;
  const maximum = Math.max(...data);
  const minimum = Math.min(...data);
  const x = (index: number) =>
    padding + (index / Math.max(data.length - 1, 1)) * (width - padding * 2);
  const y = (value: number) =>
    padding +
    ((maximum - value) / Math.max(maximum - minimum, 1)) *
      (height - padding * 2);
  const path = data
    .map((value, index) => `${index ? 'L' : 'M'}${x(index)} ${y(value)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-label="백테스트 자산 곡선">
      <path d={path} fill="none" stroke="#26d69b" strokeWidth="3" />
      {[60, 110, 160, 210].map((value) => (
        <line
          key={value}
          x1="20"
          x2="880"
          y1={value}
          y2={value}
          className="gridline"
        />
      ))}
    </svg>
  );
}

function BacktestTradeChart({
  data,
  trades,
  selectedTrade,
  market,
  onSelect,
}: {
  data: Candle[];
  trades: BacktestTrade[];
  selectedTrade: BacktestTrade | null;
  market: Market;
  onSelect: (tradeId: number) => void;
}) {
  if (!selectedTrade) {
    return (
      <div className="trade-chart-empty">
        표시할 거래가 없습니다. 조건을 조정해 백테스트를 다시 실행하세요.
      </div>
    );
  }

  const tradeIndex = trades.findIndex((trade) => trade.id === selectedTrade.id);
  const entryIndex = Math.max(
    0,
    data.findIndex((candle) => candle.date === selectedTrade.entryDate),
  );
  const resolvedExitIndex = data.findIndex(
    (candle) => candle.date === selectedTrade.exitDate,
  );
  const exitIndex = Math.max(entryIndex, resolvedExitIndex);
  const startIndex = Math.max(0, entryIndex - 18);
  const endIndex = Math.min(data.length - 1, exitIndex + 18);
  const displayed = data.slice(startIndex, endIndex + 1);
  const width = 900;
  const height = 330;
  const padding = { top: 25, right: 22, bottom: 34, left: 58 };
  const rawMaximum = Math.max(
    ...displayed.map((candle) => candle.high),
    selectedTrade.entry,
    selectedTrade.exit,
    selectedTrade.stop,
    selectedTrade.target,
  );
  const rawMinimum = Math.min(
    ...displayed.map((candle) => candle.low),
    selectedTrade.entry,
    selectedTrade.exit,
    selectedTrade.stop,
    selectedTrade.target,
  );
  const pricePadding = Math.max((rawMaximum - rawMinimum) * 0.1, 0.0001);
  const maximum = rawMaximum + pricePadding;
  const minimum = rawMinimum - pricePadding;
  const x = (absoluteIndex: number) =>
    padding.left +
    ((absoluteIndex - startIndex) / Math.max(endIndex - startIndex, 1)) *
      (width - padding.left - padding.right);
  const y = (value: number) =>
    padding.top +
    ((maximum - value) / Math.max(maximum - minimum, 0.000001)) *
      (height - padding.top - padding.bottom);
  const candleWidth = Math.max(
    1.5,
    Math.min(
      8,
      ((width - padding.left - padding.right) / displayed.length) * 0.6,
    ),
  );
  const entryX = x(entryIndex);
  const exitX = x(exitIndex);
  const entryY = y(selectedTrade.entry);
  const exitY = y(selectedTrade.exit);
  const previousTrade = tradeIndex > 0 ? trades[tradeIndex - 1] : null;
  const nextTrade =
    tradeIndex >= 0 && tradeIndex < trades.length - 1
      ? trades[tradeIndex + 1]
      : null;

  return (
    <div className="trade-chart-shell">
      <div className="trade-chart-toolbar">
        <div className="trade-navigator">
          <button
            type="button"
            disabled={!previousTrade}
            onClick={() => previousTrade && onSelect(previousTrade.id)}
            aria-label="이전 거래"
          >
            <ChevronLeft size={14} /> 이전
          </button>
          <strong>
            거래 #{selectedTrade.id} · {selectedTrade.side}
          </strong>
          <button
            type="button"
            disabled={!nextTrade}
            onClick={() => nextTrade && onSelect(nextTrade.id)}
            aria-label="다음 거래"
          >
            다음 <ChevronRight size={14} />
          </button>
        </div>
        <div className="trade-chart-legend">
          <span className="entry-key">진입</span>
          <span className="exit-key">청산</span>
          <span className="target-key">목표가</span>
          <span className="stop-key">손절가</span>
        </div>
      </div>
      <div className="trade-chart-canvas">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          aria-label={`거래 ${selectedTrade.id} 진입 및 청산 가격 차트`}
        >
          {[0, 1, 2, 3, 4].map((gridIndex) => {
            const price = maximum - ((maximum - minimum) * gridIndex) / 4;
            const gridY = y(price);
            return (
              <g key={gridIndex}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={gridY}
                  y2={gridY}
                  className="gridline"
                />
                <text
                  x={padding.left - 7}
                  y={gridY + 3}
                  textAnchor="end"
                  className="trade-axis-label"
                >
                  {formatPrice(price, market)}
                </text>
              </g>
            );
          })}
          <rect
            x={Math.min(entryX, exitX)}
            y={Math.min(y(selectedTrade.target), y(selectedTrade.stop))}
            width={Math.max(2, Math.abs(exitX - entryX))}
            height={Math.abs(y(selectedTrade.stop) - y(selectedTrade.target))}
            className="trade-risk-zone"
          />
          <line
            x1={entryX}
            x2={exitX}
            y1={y(selectedTrade.target)}
            y2={y(selectedTrade.target)}
            className="trade-target-line"
          />
          <line
            x1={entryX}
            x2={exitX}
            y1={y(selectedTrade.stop)}
            y2={y(selectedTrade.stop)}
            className="trade-stop-line"
          />
          {displayed.map((candle, index) => {
            const absoluteIndex = startIndex + index;
            const candleX = x(absoluteIndex);
            const upward = candle.close >= candle.open;
            return (
              <g key={`${candle.date}-${absoluteIndex}`}>
                <line
                  x1={candleX}
                  x2={candleX}
                  y1={y(candle.high)}
                  y2={y(candle.low)}
                  className={upward ? 'wick up' : 'wick down'}
                />
                <rect
                  x={candleX - candleWidth / 2}
                  y={Math.min(y(candle.open), y(candle.close))}
                  width={candleWidth}
                  height={Math.max(
                    1,
                    Math.abs(y(candle.open) - y(candle.close)),
                  )}
                  className={upward ? 'candle up' : 'candle down'}
                />
              </g>
            );
          })}
          <line
            x1={entryX}
            x2={entryX}
            y1={entryY}
            y2={height - padding.bottom}
            className="trade-marker-guide entry"
          />
          <g
            className={`trade-marker entry ${selectedTrade.side.toLowerCase()}`}
          >
            <circle cx={entryX} cy={entryY} r="7" />
            <text x={entryX} y={entryY - 13} textAnchor="middle">
              진입 {formatPrice(selectedTrade.entry, market)}
            </text>
            <title>{describeEntryReason(selectedTrade, market)}</title>
          </g>
          <line
            x1={exitX}
            x2={exitX}
            y1={exitY}
            y2={height - padding.bottom}
            className="trade-marker-guide exit"
          />
          <g
            className={`trade-marker exit ${selectedTrade.result.toLowerCase()}`}
          >
            <circle cx={exitX} cy={exitY} r="7" />
            <text x={exitX} y={exitY + 21} textAnchor="middle">
              청산 {formatPrice(selectedTrade.exit, market)}
            </text>
            <title>{describeExitReason(selectedTrade, market)}</title>
          </g>
          <text x={padding.left} y={height - 10} className="trade-date-label">
            {formatTradeDate(displayed[0].date)}
          </text>
          <text
            x={width - padding.right}
            y={height - 10}
            textAnchor="end"
            className="trade-date-label"
          >
            {formatTradeDate(displayed.at(-1)!.date)}
          </text>
        </svg>
      </div>
      <div className="trade-reason-grid">
        <article className="trade-reason-card entry">
          <header>
            <span>진입 근거</span>
            <b>{formatTradeDate(selectedTrade.entryDate)}</b>
          </header>
          <p>{describeEntryReason(selectedTrade, market)}</p>
          <div>
            <span>진입 {formatPrice(selectedTrade.entry, market)}</span>
            <span>ATR {formatPrice(selectedTrade.entryAtr, market)}</span>
          </div>
        </article>
        <article className="trade-reason-card exit">
          <header>
            <span>청산 근거</span>
            <b>{formatTradeDate(selectedTrade.exitDate)}</b>
          </header>
          <p>{describeExitReason(selectedTrade, market)}</p>
          <div>
            <span className={selectedTrade.pnl >= 0 ? 'positive' : 'negative'}>
              손익 {formatMoney(selectedTrade.pnl, market)}
            </span>
            <span
              className={selectedTrade.rMultiple >= 0 ? 'positive' : 'negative'}
            >
              {selectedTrade.rMultiple.toFixed(2)}R
            </span>
          </div>
        </article>
      </div>
    </div>
  );
}

function PaperTrading({
  preferences,
  viewerId,
  active,
}: {
  preferences: Preferences;
  viewerId: string;
  active: boolean;
}) {
  const [market, setMarket] = useState<Market>('US');
  const [current, setCurrent] = useState<SymbolItem>(symbols.US[0]);
  const [symbolQuery, setSymbolQuery] = useState('');
  const [data, setData] = useState<Candle[]>(() => demo());
  const [higherTimeframeData, setHigherTimeframeData] = useState<HigherTimeframeData>({});
  const [dataSource, setDataSource] = useState<'demo' | 'kiwoom'>('demo');
  const [status, setStatus] = useState('모의투자 전용 종목을 검색해 불러오세요.');
  const [loading, setLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    supplyDemand: false,
    structure: false,
    choch: false,
    swingLabels: false,
    premiumDiscount: false,
    internalStructure: false,
    volume: false,
    volumeProfile: false,
    orderflow: false,
    liquidity: false,
    forecast: false,
    htfPOI: false,
  });
  const requestId = useRef(0);
  const timeframeData = useMemo(
    () => buildTimeframeData(data, higherTimeframeData, dataSource),
    [data, dataSource, higherTimeframeData],
  );
  const chartData = timeframeData[timeframe];
  const chartAnalysis = useMemo(() => analyze(chartData), [chartData]);
  const price = quote?.price ?? chartData.at(-1)?.close ?? data.at(-1)?.close ?? 0;
  const liveQuotes = quote ? { [quote.key]: quote } : {};

  const refreshQuote = useCallback(async (item: SymbolItem, itemMarket: Market) => {
    const key = itemMarket === 'KR'
      ? `KR:${item.code}`
      : `US:${item.exchange || 'ND'}:${item.code}`;
    try {
      const response = await fetch(`/api/quotes?items=${encodeURIComponent(key)}`, { cache: 'no-store' });
      const payload = await response.json() as QuotesResponse;
      const nextQuote = payload.quotes?.[0];
      if (response.ok && nextQuote) setQuote(nextQuote);
    } catch {
      // 차트 종가를 유지하므로 시세 한 번의 실패가 모의주문을 막지 않습니다.
    }
  }, []);

  const loadPaperMarketData = async (item: SymbolItem, itemMarket: Market) => {
    const activeRequest = ++requestId.current;
    setLoading(true);
    setStatus(`${item.code} 모의투자 차트 불러오는 중…`);
    try {
      const query = new URLSearchParams({
        market: itemMarket,
        symbol: item.code,
        ...(itemMarket === 'US' ? { exchange: item.exchange || 'ND' } : {}),
      });
      const response = await fetch(`/api/market?${query.toString()}`, { cache: 'no-store' });
      const payload = await response.json() as MarketResponse;
      if (!response.ok) throw new Error(payload.error || `데이터 제공처 오류 ${response.status}`);
      if (!payload.candles || payload.candles.length < 40) throw new Error('분석 가능한 데이터가 부족합니다.');
      const required: Timeframe[] = ['15m', '1H', '4H', '1D'];
      if (required.some((name) => (payload.timeframes?.[name]?.length || 0) < 20)) {
        throw new Error('모든 시간대 차트 데이터가 준비되지 않았습니다.');
      }
      if (activeRequest !== requestId.current) return;
      setCurrent({ ...item, name: payload.name || item.name });
      setMarket(itemMarket);
      setData(payload.candles);
      setHigherTimeframeData(payload.timeframes || {});
      setDataSource('kiwoom');
      setTimeframe('1D');
      setStatus(`${payload.name || item.name} · ${payload.source || '시장 데이터'} · ${payload.candles.length.toLocaleString()}개 캔들`);
      void refreshQuote(item, itemMarket);
    } catch (error) {
      if (activeRequest === requestId.current) {
        setStatus(`불러오기 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      }
    } finally {
      if (activeRequest === requestId.current) setLoading(false);
    }
  };

  const selectMarket = (nextMarket: Market) => {
    requestId.current += 1;
    setMarket(nextMarket);
    setCurrent(symbols[nextMarket][0]);
    setSymbolQuery('');
    setQuote(null);
    setData(demo());
    setHigherTimeframeData({});
    setDataSource('demo');
    setTimeframe('1D');
    setStatus(`${nextMarket === 'US' ? '미국' : '한국'} 종목을 검색해 불러오세요.`);
  };

  const selectSymbol = (item: SymbolSearchResult) => {
    setCurrent(item);
    setMarket(item.market);
    setSymbolQuery('');
    void loadPaperMarketData(item, item.market);
  };

  useEffect(() => {
    if (dataSource !== 'kiwoom') return;
    const timer = window.setInterval(() => void refreshQuote(current, market), 5_000);
    return () => window.clearInterval(timer);
  }, [current, dataSource, market, refreshQuote]);

  useEffect(() => {
    if (!active) return;
    document.title = `${current.name} 모의투자 / ${current.currency}${formatPrice(price, market)}`;
  }, [active, current.currency, current.name, market, price]);

  const [account, setAccount] = useState<PaperAccount>(DEFAULT_PAPER_ACCOUNT);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('주문할 수량을 입력하세요.');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const accountKey = `structureflow:paper-account:${viewerId}`;
        const saved = window.localStorage.getItem(accountKey) || window.localStorage.getItem('structureflow:paper-account');
        if (saved) setAccount(JSON.parse(saved) as PaperAccount);
        if (!window.localStorage.getItem(accountKey) && saved) {
          window.localStorage.setItem(accountKey, saved);
          window.localStorage.removeItem('structureflow:paper-account');
        }
      } catch {
        setMessage('저장된 모의계좌를 불러오지 못해 새 계좌로 시작합니다.');
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [viewerId]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(
      `structureflow:paper-account:${viewerId}`,
      JSON.stringify(account),
    );
  }, [account, ready, viewerId]);

  const currentKey = market === 'KR' ? `KR:${current.code}` : `US:${current.exchange || 'ND'}:${current.code}`;
  const position = account.positions.find((item) => item.key === currentKey);
  const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const slippageRate = preferences.slippageBps / 10_000;
  const feeRate = preferences.feeBps / 10_000;
  const buyPrice = price * (1 + slippageRate);
  const sellPrice = price * (1 - slippageRate);
  const estimatedBuyFee = buyPrice * safeQuantity * feeRate;
  const estimatedBuyTotal = buyPrice * safeQuantity + estimatedBuyFee;
  const canBuy = account.cash[market] >= estimatedBuyTotal;
  const canSell = (position?.quantity || 0) >= safeQuantity;

  const positionRows = account.positions.map((item) => {
    const quote = liveQuotes[item.key];
    const mark = item.key === currentKey ? price : quote?.price || item.averagePrice;
    const value = mark * item.quantity;
    const pnl = (mark - item.averagePrice) * item.quantity;
    return { ...item, mark, value, pnl };
  });
  const marketPositions = positionRows.filter((item) => item.market === market);
  const positionValue = marketPositions.reduce((sum, item) => sum + item.value, 0);
  const unrealizedPnl = marketPositions.reduce((sum, item) => sum + item.pnl, 0);
  const equity = account.cash[market] + positionValue;
  const initialCapital = DEFAULT_PAPER_ACCOUNT.cash[market];
  const totalReturn = ((equity - initialCapital) / initialCapital) * 100;

  const submitOrder = (side: 'BUY' | 'SELL') => {
    const executionPrice = side === 'BUY' ? buyPrice : sellPrice;
    const notional = executionPrice * safeQuantity;
    const fee = notional * feeRate;
    if (side === 'BUY' && !canBuy) {
      setMessage('주문 가능 현금이 부족합니다.');
      return;
    }
    if (side === 'SELL' && !canSell) {
      setMessage('보유 수량을 초과해 매도할 수 없습니다.');
      return;
    }
    setAccount((previous) => {
      const existing = previous.positions.find((item) => item.key === currentKey);
      const oldQuantity = existing?.quantity || 0;
      const nextQuantity = side === 'BUY' ? oldQuantity + safeQuantity : oldQuantity - safeQuantity;
      const realizedPnl = side === 'SELL' && existing
        ? (executionPrice - existing.averagePrice) * safeQuantity - fee
        : 0;
      const averagePrice = side === 'BUY'
        ? ((existing?.averagePrice || 0) * oldQuantity + executionPrice * safeQuantity) / nextQuantity
        : existing?.averagePrice || executionPrice;
      const nextPosition: PaperPosition = {
        key: currentKey,
        market,
        symbol: current.code,
        name: current.name,
        currency: current.currency,
        quantity: nextQuantity,
        averagePrice,
      };
      const positions = previous.positions
        .filter((item) => item.key !== currentKey)
        .concat(nextQuantity > 0 ? [nextPosition] : []);
      const fill: PaperFill = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        market,
        symbol: current.code,
        side,
        quantity: safeQuantity,
        price: executionPrice,
        fee,
        realizedPnl,
        filledAt: new Date().toISOString(),
      };
      return {
        cash: {
          ...previous.cash,
          [market]: previous.cash[market] + (side === 'BUY' ? -notional - fee : notional - fee),
        },
        positions,
        fills: [fill, ...previous.fills].slice(0, 100),
      };
    });
    setMessage(`${current.code} ${safeQuantity.toLocaleString()}주 ${side === 'BUY' ? '매수' : '매도'} 체결`);
  };

  const resetAccount = () => {
    if (!window.confirm('모든 모의 포지션과 체결 기록을 초기화할까요?')) return;
    setAccount(DEFAULT_PAPER_ACCOUNT);
    setMessage('모의계좌를 초기 상태로 되돌렸습니다.');
  };

  return (
    <section className="paper-layout">
      <AutoPaperPanel market={market} symbol={current.code} exchange={current.exchange} name={current.name} active={active}/>
      <section className="paper-workspace-bar" aria-label="모의투자 종목 선택">
        <div className="segmented" aria-label="모의투자 시장 선택">
          <button className={market === 'US' ? 'on' : ''} onClick={() => selectMarket('US')}>🇺🇸 미국</button>
          <button className={market === 'KR' ? 'on' : ''} onClick={() => selectMarket('KR')}>🇰🇷 한국</button>
        </div>
        <div className="paper-symbol-search">
          <SymbolSearchBox
            market={market}
            value={symbolQuery}
            onValueChange={setSymbolQuery}
            onSelect={selectSymbol}
            placeholder={`${current.code} · ${current.name}`}
          />
        </div>
        <button
          type="button"
          className="primary paper-load-button"
          disabled={loading}
          onClick={() => void loadPaperMarketData(current, market)}
        >
          {loading ? <Loader2 className="spin" size={16}/> : <Database size={16}/>}
          차트 불러오기
        </button>
        <div className="paper-live-price">
          <strong>{current.currency}{formatPrice(price, market)}</strong>
          {quote && <small className={quote.change >= 0 ? 'positive' : 'negative'}>{quote.change >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%</small>}
        </div>
        <p title={status}>{status}</p>
      </section>

      <section className="panel paper-chart-panel">
        <div className="paper-chart-heading">
          <div>
            <small>PAPER TRADING CHART</small>
            <strong>{current.code} · {current.name}</strong>
          </div>
          <div className="paper-timeframes" aria-label="모의투자 차트 시간대">
            {(['1D', '4H', '1H', '15m', '5m', '1m'] as Timeframe[]).map((item) => (
              <button
                type="button"
                key={item}
                className={timeframe === item ? 'on' : ''}
                onClick={() => setTimeframe(item)}
                disabled={!timeframeData[item].length}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="paper-layer-toggles" aria-label="모의투자 차트 레이어">
          {([
            ['structure', '1 스윙구조'], ['swingLabels', 'HH·HL·LH·LL'],
            ['premiumDiscount', '2 Premium/Discount'], ['supplyDemand', '3 수요·공급 등급'], ['liquidity', '4 유동성'],
            ['internalStructure', '5 내부구조'], ['choch', '6 CHoCH'], ['forecast', '7 상위 구역·손절·목표'],
            ['orderflow', '보조 OB/FVG'], ['volume', '보조 거래량'], ['volumeProfile', '보조 VP'],
          ] as Array<[LayerKey, string]>).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={layers[key] ? 'on' : ''}
              aria-pressed={layers[key]}
              onClick={() => setLayers((currentLayers) => ({ ...currentLayers, [key]: !currentLayers[key] }))}
            >
              {label}
            </button>
          ))}
        </div>
        <PriceChart
          data={chartData}
          analysis={chartAnalysis}
          trendPlan={chartOverlay(evaluateChartPlan(timeframeData).tradePlan)}
          market={market}
          timeframe={timeframe}
          layers={layers}
          seriesKey={`paper-${market}-${current.code}-${timeframe}`}
          livePrice={quote?.price}
        />
      </section>

      <div className="paper-summary-grid">
        <article className="paper-balance-card primary-card">
          <div><Landmark size={17} /><span>{market === 'US' ? '미국' : '한국'} 모의계좌</span></div>
          <strong>{formatMoney(equity, market)}</strong>
          <small>총 평가자산</small>
        </article>
        <article className="paper-balance-card"><span>주문 가능 현금</span><strong>{formatMoney(account.cash[market], market)}</strong><small>실제 자금과 무관</small></article>
        <article className="paper-balance-card"><span>보유자산</span><strong>{formatMoney(positionValue, market)}</strong><small>{marketPositions.length}개 종목</small></article>
        <article className="paper-balance-card"><span>평가손익</span><strong className={unrealizedPnl >= 0 ? 'positive' : 'negative'}>{formatMoney(unrealizedPnl, market)}</strong><small className={totalReturn >= 0 ? 'positive' : 'negative'}>{totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%</small></article>
      </div>

      <div className="paper-main-grid">
        <section className="panel paper-order-panel">
          <div className="panel-title"><span>시장가 모의주문</span><small>수수료·슬리피지 반영</small></div>
          <div className="paper-symbol-head">
            <div><b>{current.code}</b><span>{current.name}</span></div>
            <strong>{current.currency}{formatPrice(price, market)}</strong>
          </div>
          <label className="paper-quantity">주문 수량<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          <div className="paper-order-estimate">
            <div><span>예상 주문금액</span><b>{formatMoney(estimatedBuyTotal, market)}</b></div>
            <div><span>예상 수수료</span><b>{formatMoney(estimatedBuyFee, market)}</b></div>
            <div><span>보유 수량</span><b>{(position?.quantity || 0).toLocaleString()}주</b></div>
          </div>
          <div className="paper-order-actions">
            <button className="paper-buy" disabled={!canBuy} onClick={() => submitOrder('BUY')}><ArrowDownToLine size={16} /> 시장가 매수</button>
            <button className="paper-sell" disabled={!canSell} onClick={() => submitOrder('SELL')}><ArrowUpFromLine size={16} /> 시장가 매도</button>
          </div>
          <p className="paper-order-message">{message}</p>
          <div className="paper-safety"><ShieldCheck size={16} /><p><strong>모의 체결 전용</strong> 실제 증권사로 주문을 보내지 않으며, 현재 표시 시세에 설정된 비용을 더해 즉시 체결합니다.</p></div>
        </section>

        <section className="panel paper-portfolio-panel">
          <div className="panel-title"><span>보유 포지션</span><small>시세에 따라 자동 평가</small></div>
          {marketPositions.length ? <div className="paper-table-scroll"><table><thead><tr><th>종목</th><th>수량</th><th>평균단가</th><th>현재가</th><th>평가금액</th><th>평가손익</th></tr></thead><tbody>{marketPositions.map((item) => <tr key={item.key}><td><b>{item.symbol}</b><small>{item.name}</small></td><td>{item.quantity.toLocaleString()}주</td><td>{formatPrice(item.averagePrice, item.market)}</td><td>{formatPrice(item.mark, item.market)}</td><td>{formatMoney(item.value, item.market)}</td><td className={item.pnl >= 0 ? 'positive' : 'negative'}>{formatMoney(item.pnl, item.market)}</td></tr>)}</tbody></table></div> : <div className="paper-empty"><WalletCards size={28} /><strong>아직 보유 포지션이 없습니다</strong><p>왼쪽 주문창에서 첫 모의주문을 체결해보세요.</p></div>}
        </section>
      </div>

      <section className="panel paper-history-panel">
        <div className="panel-title"><span>최근 체결</span><button className="paper-reset" onClick={resetAccount}><RotateCcw size={13} /> 계좌 초기화</button></div>
        {account.fills.filter((fill) => fill.market === market).length ? <div className="paper-table-scroll"><table><thead><tr><th>체결시각</th><th>종목</th><th>구분</th><th>수량</th><th>체결가</th><th>수수료</th><th>실현손익</th></tr></thead><tbody>{account.fills.filter((fill) => fill.market === market).slice(0, 12).map((fill) => <tr key={fill.id}><td>{new Date(fill.filledAt).toLocaleString('ko-KR')}</td><td><b>{fill.symbol}</b></td><td><span className={fill.side === 'BUY' ? 'fill-buy' : 'fill-sell'}>{fill.side === 'BUY' ? '매수' : '매도'}</span></td><td>{fill.quantity.toLocaleString()}주</td><td>{formatPrice(fill.price, fill.market)}</td><td>{formatMoney(fill.fee, fill.market)}</td><td className={fill.realizedPnl >= 0 ? 'positive' : 'negative'}>{fill.side === 'SELL' ? formatMoney(fill.realizedPnl, fill.market) : '-'}</td></tr>)}</tbody></table></div> : <div className="paper-empty compact"><ReceiptText size={22} /><p>체결 기록이 없습니다.</p></div>}
      </section>
    </section>
  );
}

function AuthScreen({setup,onAuthenticated}:{setup:boolean;onAuthenticated:(user:AuthUser)=>void}){
  const [username,setUsername]=useState(''); const [displayName,setDisplayName]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(event:React.SyntheticEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');const response=await fetch(setup?'/api/auth/setup':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,displayName,password})});const payload=await response.json() as {user?:AuthUser;error?:string};setBusy(false);if(!response.ok||!payload.user){setError(payload.error||'로그인하지 못했습니다.');return;}onAuthenticated(payload.user);}
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><Activity size={24}/><div><strong>STRUCTURE<span>FLOW</span></strong><small>PRIVATE TRADING WORKSPACE</small></div></div><div className="auth-copy"><small>{setup?'OWNER SETUP':'MEMBER SIGN IN'}</small><h1>{setup?'관리자 계정을 설정하세요':'내 계정으로 로그인'}</h1><p>{setup?'기존 소유자 인증이 확인됐습니다. 이 계정 생성 후에는 ChatGPT 계정 없이 로그인합니다.':'관리자가 등록한 회원만 이용할 수 있습니다.'}</p></div><form onSubmit={submit}>{setup&&<label>표시 이름<input required value={displayName} onChange={e=>setDisplayName(e.target.value)} autoComplete="name"/></label>}<label>아이디<input required minLength={3} value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" placeholder="영문·숫자 3자 이상"/></label><label>비밀번호<input required minLength={12} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={setup?'new-password':'current-password'} placeholder="영문·숫자 포함 12자 이상"/></label>{error&&<p className="auth-error">{error}</p>}<button className="primary auth-submit" disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<ShieldCheck size={16}/>} {setup?'관리자 계정 만들기':'로그인'}</button></form><p className="auth-note">비밀번호는 암호화되어 저장되며 로그인 실패가 반복되면 계정이 잠시 보호됩니다.</p></section></main>;
}

function AdminPanel({viewer}:{viewer:AuthUser}){
  const [users,setUsers]=useState<AdminUser[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [draft,setDraft]=useState({username:'',displayName:'',password:'',role:'member'});
  const [editing,setEditing]=useState<{user:AdminUser;action:'password'|'delete'}|null>(null),[newPassword,setNewPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[saving,setSaving]=useState(false);
  function openEdit(user:AdminUser,action:'password'|'delete'){setEditing({user,action});setNewPassword('');setConfirmation('');setError('');setNotice('');}
  async function saveEdit(event:React.SyntheticEvent<HTMLFormElement>){event.preventDefault();if(!editing||saving)return;setError('');
    if(editing.action==='password'&&newPassword!==confirmation){setError('비밀번호 확인이 일치하지 않습니다.');return;}
    setSaving(true);try{const r=await fetch('/api/admin/users',{method:editing.action==='delete'?'DELETE':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editing.user.id,action:editing.action,password:newPassword,confirmUsername:confirmation})});const p=await r.json() as {error?:string};if(!r.ok)throw new Error(p.error||'변경하지 못했습니다.');
      if(editing.action==='password'&&editing.user.id===viewer.id){window.location.reload();return;}
      setNotice(editing.action==='delete'?'계정과 연결된 회원 기록을 삭제했습니다.':'비밀번호를 변경하고 해당 회원의 기존 로그인을 종료했습니다.');setEditing(null);setNewPassword('');setConfirmation('');await load();
    }catch(e){setError(e instanceof Error?e.message:'요청 실패');}finally{setSaving(false);}}

  const load=useCallback(async()=>{const r=await fetch('/api/admin/users');const p=await r.json() as {users?:AdminUser[];error?:string};if(r.ok)setUsers(p.users||[]);else setError(p.error||'회원 목록을 불러오지 못했습니다.');},[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  async function create(event:React.SyntheticEvent<HTMLFormElement>){event.preventDefault();setError('');setNotice('');const r=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});const p=await r.json() as {error?:string};if(!r.ok){setError(p.error||'회원을 등록하지 못했습니다.');return;}setDraft({username:'',displayName:'',password:'',role:'member'});setNotice('새 회원을 등록했습니다.');await load();}
  async function toggle(user:AdminUser){setError('');const r=await fetch('/api/admin/users',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:user.id,action:'status',status:user.status==='active'?'disabled':'active'})});const p=await r.json() as {error?:string};if(!r.ok){setError(p.error||'회원 상태를 변경하지 못했습니다.');return;}await load();}
  return <section className="admin-layout"><header><div><small>ACCESS CONTROL</small><h1>회원 관리</h1><p>현재 로그인: {viewer.displayName} · 관리자</p></div><span>{users.filter(u=>u.status==='active').length}명 활성</span></header><div className="admin-grid"><section className="panel member-create"><div className="panel-title"><span>새 회원 등록</span><small>관리자 승인 방식</small></div><form onSubmit={create}><label>표시 이름<input required value={draft.displayName} onChange={e=>setDraft({...draft,displayName:e.target.value})}/></label><label>아이디<input required minLength={3} value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value})}/></label><label>임시 비밀번호<input required minLength={12} type="password" value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/><small>영문과 숫자를 포함한 12자 이상</small></label><label>권한<select aria-label="신규 회원 권한" value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value})}><option value="member">일반 회원</option><option value="admin">관리자</option></select></label><button className="primary" aria-label="신규 회원 등록"><UserCog size={16}/> 회원 등록</button>{notice&&<p className="auth-success">{notice}</p>}{error&&<p className="auth-error">{error}</p>}</form></section><section className="panel member-list"><div className="panel-title"><span>등록 회원</span><small>비밀번호 변경 · 계정 삭제</small></div><div className="member-table"><table><thead><tr><th>회원</th><th>권한</th><th>상태</th><th>마지막 로그인</th><th>회원 작업</th></tr></thead><tbody>{users.map(user=><tr key={user.id}><td><b>{user.displayName}</b><small>{user.username}</small></td><td>{user.role==='admin'?'관리자':'회원'}</td><td><span className={`member-status ${user.status}`}>{user.status==='active'?'활성':'차단'}</span></td><td>{user.lastLoginAt?new Date(user.lastLoginAt).toLocaleString('ko-KR'):'-'}</td><td><button aria-label={`${user.displayName} ${user.status==='active'?'접근 차단':'다시 활성화'}`} disabled={user.id===viewer.id} onClick={()=>toggle(user)}>{user.status==='active'?'접근 차단':'다시 활성화'}</button> <button disabled={saving} onClick={()=>openEdit(user,'password')}>비밀번호 변경</button> <button disabled={saving||user.id===viewer.id} onClick={()=>openEdit(user,'delete')}>계정 삭제</button></td></tr>)}</tbody></table></div>
{editing&&<form className="member-edit-form" onSubmit={saveEdit}><h3>{editing.user.displayName} ({editing.user.username}) · {editing.action==='password'?'비밀번호 변경':'계정 삭제'}</h3>
{editing.action==='password'?<><p>영문과 숫자를 포함한 12자 이상입니다. 변경하면 이 회원의 모든 기기에서 로그아웃됩니다.</p><label>새 비밀번호<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>새 비밀번호 확인<input type="password" autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label></>:<><p>계정, 관심종목, 자동 모의투자와 검토 기록이 삭제되며 복구할 수 없습니다. 삭제할 아이디를 입력하세요.</p><label>삭제 확인 아이디<input autoComplete="off" required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label></>}
<button className="primary" disabled={saving||editing.action==='delete'&&confirmation!==editing.user.username}>{saving?'처리 중…':editing.action==='password'?'비밀번호 저장':'계정 영구 삭제'}</button> <button type="button" disabled={saving} onClick={()=>{setEditing(null);setNewPassword('');setConfirmation('');}}>취소</button>{error&&<p role="alert" className="auth-error">{error}</p>}</form>}
</section></div></section>;
}

function SymbolSearchBox({market,value,onValueChange,onSelect,placeholder,compact=false}:{market?:Market;value:string;onValueChange:(value:string)=>void;onSelect:(item:SymbolSearchResult)=>void;placeholder:string;compact?:boolean}){
  const [results,setResults]=useState<SymbolSearchResult[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [open,setOpen]=useState(false);
  const requestId=useRef(0);
  useEffect(()=>{
    const query=value.trim();
    const id=++requestId.current;
    const timer=window.setTimeout(async()=>{
      if(!open||!query){setResults([]);setLoading(false);setError('');return;}
      setLoading(true);setError('');
      try{
        const params=new URLSearchParams({q:query});
        if(market)params.set('market',market);
        const response=await fetch(`/api/symbols?${params.toString()}`);
        const payload=await response.json() as {results?:SymbolSearchResult[];error?:string};
        if(id!==requestId.current)return;
        if(!response.ok)throw new Error(payload.error||'종목을 검색하지 못했습니다.');
        setResults(payload.results||[]);
      }catch(reason){if(id===requestId.current){setResults([]);setError(reason instanceof Error?reason.message:'종목을 검색하지 못했습니다.');}}
      finally{if(id===requestId.current)setLoading(false);}
    },open&&query?250:0);
    return()=>window.clearTimeout(timer);
  },[market,open,value]);
  const choose=(item:SymbolSearchResult)=>{setOpen(false);setResults([]);onSelect(item);};
  return <div className={`symbol-search-box${compact?' compact':''}`}>
    <div className="symbol-search-input"><Search size={compact?14:16}/><input value={value} aria-label="종목 이름·티커·코드 검색" placeholder={placeholder} autoComplete="off" onFocus={()=>{if(value.trim())setOpen(true);}} onChange={event=>{onValueChange(event.target.value);setOpen(true);}} onKeyDown={event=>{if(event.key==='Enter'&&results[0]){event.preventDefault();choose(results[0]);}if(event.key==='Escape')setOpen(false);}}/>{loading&&<Loader2 className="spin" size={14}/>}</div>
    {open&&value.trim()&&<div className="symbol-search-results" role="listbox">
      {results.map(item=><button type="button" role="option" aria-selected={false} key={`${item.market}-${item.feed}`} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(item)}><b>{item.code}</b><span>{item.name}</span><small>{item.market==='US'?'🇺🇸 미국':'🇰🇷 한국'} · {item.exchangeLabel} · {item.type}</small></button>)}
      {!loading&&!results.length&&!error&&<p>검색 결과가 없습니다. 이름이나 티커를 다시 확인해주세요.</p>}
      {error&&<p className="search-error">{error}</p>}
    </div>}
  </div>;
}

export default function Home(){
  const [state,setState]=useState<{loading:boolean;setup:boolean;user:AuthUser|null}>({loading:true,setup:false,user:null});
  useEffect(()=>{fetch('/api/auth/status').then(r=>r.json()).then((p:unknown)=>{const payload=p&&typeof p==='object'?p as {setupRequired?:boolean;user?:AuthUser}:{};setState({loading:false,setup:Boolean(payload.setupRequired),user:payload.user||null});}).catch(()=>setState({loading:false,setup:false,user:null}));},[]);
  if(state.loading)return <main className="auth-page"><Loader2 className="spin"/></main>;
  if(!state.user)return <AuthScreen setup={state.setup} onAuthenticated={user=>setState({loading:false,setup:false,user})}/>;
  return <Dashboard viewer={state.user} onLogout={()=>setState({loading:false,setup:false,user:null})}/>;
}

function GuidePage() {
  const [guideTab, setGuideTab] = useState<'quick' | 'structure' | 'entry' | 'site' | 'cases' | 'review' | 'indicators'>('quick');
  const guideTabs = [
    ['quick', '빠른 시작', '분석 순서와 체크리스트'],
    ['structure', '시장 구조', 'Swing·BOS·CHoCH'],
    ['indicators', '차트 지표', '버튼별 의미·활용·주의점'],
    ['entry', '가격·진입', '가격 영역과 실행 규칙'],
    ['site', '사이트 사용법', '기능별 실제 이용 순서'],
    ['cases', '기준 사례집', '강의 장면과 판단 비교'],
    ['review', '진입 검토', '성급한·놓친 진입과 구역 차이'],
  ] as const;
  const roadmap = [
    ['1D', '큰 방향', '상승·하락·전환 중 어디에 있는지 먼저 확인'],
    ['4H', '셋업 방향', '일봉 안에서 실제로 거래할 스윙 방향을 결정'],
    ['1H', '구조 확인', '4시간 방향과 보조 구조가 맞는지 확인'],
    ['15m', '진입 계획', '진입 구간·손절·목표가를 하나로 계산'],
    ['1m', '진입 정제', '15분 재접촉 이후 전환·재접촉과 PP를 확인'],
  ] as const;
  const glossary = [
    ['HH / HL', '이전보다 높은 고점 / 높은 저점', '상승 구조가 이어지는 단서'],
    ['LH / LL', '이전보다 낮은 고점 / 낮은 저점', '하락 구조가 이어지는 단서'],
    ['BOS', '기존 구조 고점·저점을 추세 방향으로 돌파', '현재 구조의 지속을 확인'],
    ['CHoCH', '기존 흐름과 반대 방향으로 구조가 처음 변함', '전환 가능성 경고이며 단독 진입 신호는 아님'],
    ['Swing', '실제로 구조 돌파를 만들어낸 큰 파동', '주요 방향과 보호 고점·저점 판단'],
    ['Internal', '큰 스윙 안에서 생기는 작은 파동', '세부 타이밍 참고, 큰 방향보다 우선하지 않음'],
  ] as const;

  return (
    <section className="guide-page">
      <header className="guide-hero">
        <div className="guide-kicker"><BookOpen size={16} /> STRUCTUREFLOW GUIDE · 2026.09.15 업데이트</div>
        <h1>복잡한 지표보다, 보는 순서를 기억하세요</h1>
        <p>4시간 구역 접촉에서 출발해 15분과 1분의 전환·재접촉을 차례대로 확인합니다.</p>
        <p>강의 주요 장면에서 확인한 원칙을 보수적으로 구현했습니다. 전체 강의의 모든 예외를 재현한 인증된 전략은 아니며, 아래의 시스템 규칙은 강의 원문과 구분합니다.</p>
        <div className="guide-tabs" role="tablist" aria-label="트레이딩 가이드 분류">
          {guideTabs.map(([id, label, description]) => (
            <button
              type="button"
              role="tab"
              id={`guide-tab-${id}`}
              key={id}
              aria-selected={guideTab === id}
              aria-controls={`guide-panel-${id}`}
              className={guideTab === id ? 'active' : ''}
              onClick={() => setGuideTab(id)}
            >
              <strong>{label}</strong><span>{description}</span>
            </button>
          ))}
        </div>
      </header>

      {guideTab === 'indicators' && <div id="guide-panel-indicators" className="guide-tab-panel" role="tabpanel" aria-labelledby="guide-tab-indicators"><ChartIndicatorGuide/></div>}
      {guideTab === 'cases' && <div id="guide-panel-cases" className="guide-tab-panel" role="tabpanel" aria-labelledby="guide-tab-cases"><LectureCasebook/></div>}
      {guideTab === 'review' && <div id="guide-panel-review" className="guide-tab-panel" role="tabpanel" aria-labelledby="guide-tab-review"><EntryReviewPanel/></div>}
      {guideTab === 'quick' && <div id="guide-panel-quick" className="guide-tab-panel" role="tabpanel" aria-labelledby="guide-tab-quick">
      <section id="guide-flow" className="guide-section">
        <div className="guide-section-title"><span>01</span><div><h2>한 번에 보는 분석 순서</h2><p>아래에서 위로 되돌아가지 말고 왼쪽부터 차례대로 확인합니다.</p></div></div>
        <div className="guide-roadmap">
          {roadmap.map(([frame, title, detail], index) => (
            <article key={frame} className={frame === '15m' ? 'execution' : ''}>
              <b>{frame}</b><strong>{title}</strong><p>{detail}</p>
              {index < roadmap.length - 1 && <ArrowRight className="guide-arrow" size={16} />}
            </article>
          ))}
        </div>
        <div className="guide-memory-rule"><strong>한 줄 기억법</strong><span>1D·4H는 방향 → 1H는 확인 → 15m는 가격 → 1m는 실행</span></div>
      </section>

      <section id="guide-check" className="guide-section">
        <div className="guide-section-title"><span>02</span><div><h2>주문 전 30초 체크리스트</h2><p>하나라도 설명할 수 없다면 대기합니다.</p></div></div>
        <div className="guide-checklist">
          {[
            '1D·4H 방향과 1H 내부 구조가 진입 방향에 맞는가?',
            '현재 스윙이 BOS로 확정된 구조인지 확인했는가?',
            '15m 진입 구간과 무효화 가격을 확인했는가?',
            '1m에서 반대 구조가 아니라 진입 방향 트리거가 나왔는가?',
            'H4·15m·1m 구역이 모두 A/B등급이며 접촉·전환·재접촉 순서가 맞는가?',
            '사전에 정한 15분 손절과 4시간 목표 사이에서 비용 차감 순 2R 이상인가?',
            '손절 기준으로 계산된 수량이 감당 가능한가?',
          ].map((item) => <div key={item}><CheckCircle2 size={17} /><span>{item}</span></div>)}
        </div>
      </section>
      </div>}

      {guideTab === 'structure' && <div id="guide-panel-structure" className="guide-tab-panel" role="tabpanel" aria-labelledby="guide-tab-structure">
      <section id="guide-structure" className="guide-section">
        <div className="guide-section-title"><span>01</span><div><h2>시장 구조를 읽는 핵심 용어</h2><p>모든 지그재그를 스윙으로 세지 않는 것이 가장 중요합니다.</p></div></div>
        <div className="guide-glossary">
          {glossary.map(([term, meaning, use]) => <article key={term}><b>{term}</b><div><strong>{meaning}</strong><p>{use}</p></div></article>)}
        </div>
        <article className="guide-lesson-card">
          <div><span>강의에서 함께 확인한 핵심</span><h3>어느 저점이 새로운 HH를 만들었는가?</h3></div>
          <div className="guide-swing-example">
            <div><small>단순 로컬 저점</small><b>저점 → 반등 → 이전 고점 돌파 실패</b><span className="danger">내부 저점</span></div>
            <ArrowRight size={20} />
            <div><small>유효한 구조 저점</small><b>저점 → 상승 → 이전 고점 BOS</b><span className="positive">Protected Low</span></div>
          </div>
          <p>스윙 저점은 생기는 순간 확정되는 것이 아니라, 그 저점에서 시작한 상승이 이전 구조 고점을 돌파한 뒤에 확정됩니다.</p>
          <p>현재 구현: 꼬리 가격을 기준선으로 사용하되 종가 돌파만 인정합니다. 보호 수준을 깨면 전환 대기, 반대 방향 후속 BOS로 새 추세를 확정합니다. 초기 범위는 첫 두 봉에서 시작하는 시스템 초기화 규칙이므로 데이터 시작점에 영향을 받습니다.</p>
          <p>Internal은 직전 봉의 고점·저점 확장 실패를 다음 봉에서 확인하는 별도 지도입니다. 내부 CHoCH만으로 큰 스윙을 뒤집지 않습니다. 진행 중일 수 있는 마지막 봉은 구조 확정에서 제외합니다.</p>
        </article>
      </section>
      </div>}

      {guideTab === 'entry' && <div id="guide-panel-entry" className="guide-tab-panel" role="tabpanel" aria-labelledby="guide-tab-entry">
      <section id="guide-zones" className="guide-section guide-two-column">
        <div>
          <div className="guide-section-title"><span>01</span><div><h2>가격 영역</h2><p>진입 가격의 위치를 판단하는 도구입니다.</p></div></div>
          <div className="guide-concept-stack">
            <article><b>Premium / Discount</b><p>보호 수준과 조정 시작으로 확정한 스윙 극점 사이의 50%가 균형입니다. 위는 Premium, 아래는 Discount입니다. 범위가 아직 확정되지 않으면 표시하지 않습니다.</p></article>
            <article><b>VAH / POC / VAL · 보조 지표</b><p>봉의 대표가격에 거래량을 배분한 근사 분포입니다. 실제 체결가별 거래량이 아니며 진입·손절·목표를 결정하지 않습니다. 강의의 구조 영역과 같은 개념이 아닙니다.</p></article>
            <article><b>OB / FVG · 유동성</b><p>보조 후보이지 기관 주문의 증거가 아닙니다. 비슷한 고저점의 첫 이탈이 종가로 복귀하면 스윕 후보, 밖에서 마감하면 돌파로 구분합니다. 유인(Inducement)이나 주문 누적은 OHLCV만으로 확정하지 않습니다.</p></article>
          </div>
        </div>
        <aside className="guide-screen-map">
          <h3>화면에서 무엇을 믿어야 하나요?</h3>
          <dl>
            <div><dt>상단 진입·손절·목표</dt><dd><b>상위 계획 참고</b><span>확정값은 자동 계좌에서 확인</span></dd></div>
            <div><dt>1D·4H·1H 차트</dt><dd><b>방향 참고</b><span>진입 가격선 없음</span></dd></div>
            <div><dt>15m 차트</dt><dd><b>기원 구역</b><span>상위 접촉 이후 전환·재접촉 확인</span></dd></div>
            <div><dt>5m 차트</dt><dd><b>선택형 진입 확인</b><span>새 자동 실험에서 5분형 선택 가능</span></dd></div>
            <div><dt>1m 차트</dt><dd><b>진입 정제</b><span>완료 봉의 전환·재접촉 확인</span></dd></div>
          </dl>
        </aside>
      </section>

      <section id="guide-entry" className="guide-section">
        <div className="guide-section-title"><span>02</span><div><h2>진입은 가격 도달만으로 끝나지 않습니다</h2><p>StructureFlow의 진입 구간은 주문 명령이 아니라 관찰을 시작할 위치입니다.</p></div></div>
        <div className="guide-entry-flow">
          <article><span>1</span><strong>4H 구역 접촉</strong><p>롱은 상승·Discount 수요, 숏은 하락·Premium 공급 구역의 실제 접촉을 기다립니다.</p></article>
          <article><span>2</span><strong>15m 전환·재접촉</strong><p>4H 접촉 이후 CHoCH 또는 후속 BOS를 확인하고, 4H 안에 포함된 15분 기원 구역으로 돌아오는지 봅니다.</p></article>
          <article><span>3</span><strong>1m 전환·재접촉</strong><p>15분 재접촉 이후 완료된 1분봉의 전환과 정제 구역 재접촉을 확인합니다. 1분 구역은 15분 구역 안에 있어야 합니다.</p></article>
          <article><span>4</span><strong>등급·위험 검증</strong><p>1H 내부 방향의 동행, 세 구역의 A/B등급, 상위 계획의 비용 차감 순 2R과 허용 위험에 맞는 수량을 확인합니다.</p></article>
        </div>
        <div className="guide-note"><CircleAlert size={18} /><p><strong>눌림이 오지 않으면 거래하지 않는 전략입니다.</strong> 강한 추세의 돌파·재시험 진입은 별도의 시나리오로 구분해야 하며, 현재 기본 진입 구간과 섞지 않습니다.</p></div>
        <div className="guide-concept-stack">
          <article><b>강의 원칙 → 시스템의 구체적인 규칙</b><p>구역 경계는 기원 봉의 꼬리~몸통, H4는 유리한 반범위로 제한합니다. 새 v3는 상위 계획 후 하위 진입 확인 원칙을 사용합니다. 15분 손절 기준·완충 0.1%·위험 0.5%·A/B등급·최소 순 2R은 구현 설정이며 강의의 고정 공식이 아닙니다. 차트의 단일 시간대 참고 분석과 자동 체결 기록을 구분합니다.</p></article>
          <article><b>4H → 15m → 1m</b><p>4시간 수요·공급 접촉, 이후 15분 전환·재접촉, 이후 1분 전환·재접촉 순서입니다. PP 실험은 1시간 내부 방향도 확인합니다. 1분 원본이 없으면 대기합니다.</p></article>
          <article><b>숫자를 읽는 법</b><p>목표는 반대편 약한 스윙 극점 후보입니다. 영역이 없거나 2R 미만이면 보류합니다. 조건 충족 점수는 체크리스트 집계이지 승률이 아닙니다. 구간 안의 가격과 접촉 이후 새 구조 반응까지 확인해야 최종 준비 상태입니다.</p></article>
        </div>
      </section>
      <section className="guide-section">
        <div className="guide-section-title"><span>03</span><div><h2>수요·공급 구역 등급 읽기</h2><p>등급은 구조와 접촉 상태를 정리한 실험 점수이며 승률이 아닙니다.</p></div></div>
        <div className="guide-concept-stack">
          <article><b>배점과 A / B / C</b><p>확정 구조 돌파, 상위 범위의 유리한 반구간, 구역 폭 1.5배 이상 종가 이탈, 확정 후 재접촉 없음, 재접촉 1회 이하에 각각 1점입니다. 하위 정제 구역은 상위 구역 안에 포함되면 1점을 더합니다. A는 4점 이상, B는 3점, C는 2점 이하입니다.</p></article>
          <article><b>접촉 횟수와 평가 근거</b><p>구역에 연속으로 겹치는 봉은 한 번의 접촉으로 셉니다. 이탈 강도는 구역 확정 시점의 최근 완료 봉 3개로 평가합니다. 차트의 ‘수요·공급 등급’과 ‘평가 근거’를 펼쳐 확인하세요. 자동 진입은 H4·15m·1m 중 하나라도 C등급이면 대기합니다.</p></article>
        </div>
      </section>
      <section className="guide-section">
        <div className="guide-section-title"><span>04</span><div><h2>상위 손절·목표와 보유 관리</h2><p>새 자동 v3에 적용되는 규칙입니다. 기존 계좌는 해당 모델의 규칙을 유지합니다. R은 최초 거래의 위험금액을 기준으로 읽습니다.</p></div></div>
        <div className="guide-concept-stack">
          <article><b>롱과 숏의 반대 방향</b><p>롱은 매수 진입 후 매도로 청산하며 H4 약한 고점이 목표 후보입니다. 숏은 매도 진입 후 매수로 청산하며 H4 약한 저점이 목표 후보입니다. 숏도 진입 명목금액 전액을 예약하며, 매도 대금을 추가 매수 자금으로 재사용하지 않습니다.</p></article>
          <article><b>상위 계획을 먼저 고정</b><p>15분 전환 구역이 확정되면 구역 바깥의 손절과 4시간 약한 고점·저점 목표를 먼저 저장합니다. 그 뒤 1분 정제형 또는 5분 확인형으로 전환·재접촉을 기다립니다. 진입 후 손절을 넓히거나 작은 하위 구역으로 줄이지 않습니다.</p></article>
          <article><b>상위 목표까지 보유</b><p>새 v3에는 고정 1R 절반 익절이 없습니다. 사전 손절·목표, 4시간 구조 무효화 또는 사용자 청산 요청으로 종료합니다. 비용 차감 순 2R 미만이면 진입하지 않으며 목표를 억지로 늘리지 않습니다. 자동 추적 손절이나 목표 이후 잔여 보유는 아직 적용하지 않습니다.</p></article>
          <article><b>체결과 통계 확인</b><p>같은 완료 봉에서 손절과 목표·부분청산 가격에 모두 닿으면 손절을 먼저 적용합니다. 갭 손절은 더 불리한 시가로 계산합니다. 기존 v2의 부분청산 손익은 실현손익에 반영하되, 거래 수·승률·평균 R은 잔여 수량까지 모두 청산한 뒤 한 거래로 집계합니다.</p></article>
          <article><b>실험의 범위</b><p>15분 손절 기준·등급 배점·위험 0.5%·손절 완충 0.1%·최소 순 2R은 강의의 고정 공식이 아닌 검증용 설정입니다. 실계좌 주문은 전송하지 않으며 숏의 대차 가능 여부·대차료·세금·호가 대기열·실제 부분체결은 반영하지 않습니다.</p></article>
        </div>
      </section>
      </div>}

      {guideTab === 'site' && <div id="guide-panel-site" className="guide-tab-panel" role="tabpanel" aria-labelledby="guide-tab-site">
      <section id="guide-site" className="guide-section">
        <div className="guide-section-title"><span>01</span><div><h2>강의 개념을 사이트에서 확인하는 방법</h2><p>기능을 따로 외우기보다, 분석에서 연습까지 같은 판단 순서로 사용합니다.</p></div></div>

        <div className="guide-site-flow">
          {[
            ['1', '관심종목 등록', '미국·한국 탭을 먼저 고른 뒤 빈 카드의 ‘종목을 추가해 주세요’를 누릅니다. 이름이나 종목코드로 검색해 국가별 최대 3개를 저장하세요.'],
            ['2', '분석 데이터 불러오기', 'LIVE WATCH 카드에서 종목을 고르고 데이터 불러오기를 누릅니다. 다시 방문하면 마지막 차트를 복원하며, 관심종목 가격은 5초마다 갱신됩니다.'],
            ['3', '상단 결론 확인', '점수와 LONG·SHORT·관망 상태를 먼저 읽고, 상단 가격은 1분 진입 후보·15분 손절·4시간 목표의 참고 계획입니다. 자동 실험의 확정 손절·목표는 모의투자 패널에서 확인합니다.'],
            ['4', '시간대 순서대로 검증', '화면의 시간대는 1D → 4H → 1H → 15m → 5m → 1m 순서입니다. 5분봉은 움직임을 보조 확인하고, 필수 진입 정제는 1분봉에서 수행합니다.'],
            ['5', '차트 근거 켜고 끄기', '1 스윙구조·HH·HL·LH·LL → 2 Premium/Discount → 3 수요·공급 등급 → 4 유동성 → 5 내부구조 → 6 CHoCH → 7 진입·손절·목표 순서로 확인합니다. OB/FVG·거래량·VP는 보조입니다. 버튼은 화면 폭에 맞춰 줄바꿈되며 차트 정보와 확대·축소 도구도 아래로 배치됩니다.'],
            ['6', '실행 계획으로 최종 확인', '오른쪽 실행 계획에서 각 시간대가 충족·대기·차단 중인지 확인합니다. 가격이 구간에 닿았다는 이유만으로 주문하지 않습니다.'],
          ].map(([step, title, detail]) => (
            <article key={step} className="guide-use-step"><span>{step}</span><div><strong>{title}</strong><p>{detail}</p></div></article>
          ))}
        </div>

        <div className="guide-subtitle"><h3>강의 개념은 화면의 어디에서 보나요?</h3><p>버튼 이름과 확인 질문을 한 쌍으로 기억하세요.</p></div>
        <div className="guide-lecture-map" role="table" aria-label="강의 개념과 사이트 기능 연결표">
          <div className="guide-map-head" role="row"><b role="columnheader">강의 개념</b><b role="columnheader">사이트 위치</b><b role="columnheader">확인할 질문</b></div>
          {[
            ['유효한 Swing', '스윙구조 · HH·HL·LH·LL', '이 파동이 실제로 이전 구조를 BOS 했는가?'],
            ['BOS / CHoCH', 'CHOCH · 스윙구조', '추세 지속 확인인가, 첫 전환 경고인가?'],
            ['Internal Structure', '내부구조', '큰 스윙인가, 아직 범위 안의 작은 움직임인가?'],
            ['Premium / Discount', 'Premium/Discount', '비싼 곳을 추격하는가, 유리한 영역의 반응을 기다리는가?'],
            ['수요·공급 구역', '수요·공급 등급 · 평가 근거', '진입 방향에 맞는 구역인가? 반복 접촉과 이탈 강도는 어떠한가?'],
            ['실행과 거래 관리', '진입·손절·목표 · 자동 모의투자', '참고 후보와 실제 체결을 구분하고 사전 상위 계획과 보유분 손절·목표가 같은지 확인했는가?'],
            ['VAH / POC / VAL', 'VP', '현재 가격은 Value Area의 위·안·아래 중 어디인가?'],
            ['다중 시간대 분석', '왼쪽 시간대 구조 · 실행 계획', '1D 방향부터 1m 트리거까지 서로 충돌하지 않는가?'],
          ].map(([concept, location, question]) => (
            <div key={concept} className="guide-map-row" role="row"><strong role="cell">{concept}</strong><span role="cell">{location}</span><p role="cell">{question}</p></div>
          ))}
        </div>

        <div className="guide-site-columns">
          <article className="guide-walkthrough">
            <h3>롱 시나리오 예시</h3>
            <ol>
              <li><b>1D·4H</b><span>상승 방향과 Discount 수요 구역의 실제 접촉 확인</span></li>
              <li><b>1H</b><span>상위 방향을 거스르는 구조 변화가 없는지 확인</span></li>
              <li><b>15m</b><span>4H 접촉 이후 상승 전환과 포함된 기원 구역 재접촉 확인</span></li>
              <li><b>1m</b><span>15분 재접촉 이후 상승 전환·재접촉, A/B등급과 비용 반영 목표 확인</span></li>
              <li><b>모의투자</b><span>상위 계획 확정 → 하위 진입 확인 → 상위 손절·목표와 종료 사유 확인</span></li>
            </ol>
            <h3>숏 시나리오 예시</h3>
            <p>하락 방향의 H4 Premium 공급 구역 접촉 → 15분 하락 전환·재접촉 → 1분 하락 전환·재접촉을 확인합니다. 같은 등급·위험 조건을 통과하면 매도 진입하고, 하락 시 상위 목표에서 매수 청산합니다.</p>
          </article>
          <article className="guide-practice-tools">
            <h3>모의투자와 백테스트 활용법</h3>
            <div><b>모의투자</b><p>분석 대시보드와 별도의 종목·차트를 불러와 가상 주문을 연습합니다. 다른 메뉴를 보는 동안에도 불러온 종목의 5초 시세 조회는 계속됩니다.</p></div>
            <div><b>자동 모의투자 v3</b><p>새 실험은 15분 손절·4시간 목표 사전 고정과 1분·5분 진입 확인을 사용합니다. 같은 종목도 새 모델·진입형별로 별도 계좌를 생성하며 기존 v1/v2 기록과 보유 규칙은 유지합니다. 자동 패널에서 대기 사유, 추적 구역의 등급, 보유 수량, 진입·부분청산·청산 기록을 확인하고 CSV로 비교하세요. 버전이 다른 결과를 합쳐 해석하지 않습니다.</p></div>
            <div><b>1분봉 공급과 대기 상태</b><p>원본 1분봉만 사용하며 5분봉을 나누어 만들지 않습니다. 현재가·차트·자동 체결은 키움 원본만 사용하며 다른 제공처로 대체하지 않습니다. 국내 실전 데이터는 KRX+NXT 통합시장 기준입니다. 미국은 키움 API가 제공하는 세션의 원본을 시간대 필터 없이 사용합니다. 데이터가 부족하거나 지연되면 대기합니다. 차트가 보이는 동안 60초마다 갱신하며 선택한 시간대를 유지합니다.</p></div>
            <div><b>차트 후보와 자동 체결</b><p>차트 후보는 완료 봉으로 재구성한 검토 결과입니다. 자동 실험은 시작 이후 실제로 관측한 접촉 순서로 검증하며 과거 후보를 소급 체결하지 않습니다. 페이지가 열렸다는 사실만으로 백그라운드 실행을 판단하지 말고, 자동 패널의 최근 관측·상태 기록을 확인하세요.</p></div>
            <div><b>운영·데이터 이상 감지</b><p>자동 모의투자의 운영·데이터 상태에서 서버 신호, 종목 처리 시각, 마지막 정상 원본과 데이터 차단 사유를 확인합니다. 현재가 30초·1분봉 2분 초과 지연, 잘못된 종목·출처, 중복·역순·미래 시각 봉, 이전보다 오래된 시세 응답은 체결 계산을 보류합니다. 보유하지 않은 진입 후보는 초기화하고 정상 복구 이후 접촉부터 다시 관측합니다.</p><p>최근 10분 내 1분봉 간격 이상은 신규 진입을 보류합니다. 무거래·거래정지·휴장 가능성이 있으므로 장애 확정은 아닙니다. 유효한 시세가 있는 보유분은 계속 관리하지만 원본 자체가 잘못되거나 지연되면 청산도 대기합니다. 화면에 표시되는 상태 감지이며 외부 알림이나 서버 자동 복구 기능은 아닙니다.</p></div>
            <div><b>판단 당시 차트 재생</b><p>자동 모의투자의 ‘진입·대기·차단 판단 기록’을 펼쳐 기록별 ‘판단 당시 차트 재생’을 누릅니다. 4H·1H·15m·1m를 선택하고 이전·다음 봉, 재생, 탐색 막대로 당시 완료 봉을 확인합니다. 판단 근거는 마지막 시점에만 표시합니다. 이 기능은 저장 차트 열람이며 과거 봉마다 전략을 다시 실행하는 백테스트가 아닙니다.</p><p>업데이트 이후 정상 시세 판단부터 차트를 저장합니다. 최근 200건의 판단 기록과 함께 보관하며 오래된 차트는 삭제됩니다. 필요한 기록은 차트 재생 패널에서 내려받으세요. 저장하지 않은 과거 차트나 연결 실패 시점은 나중 데이터로 복원하지 않습니다.</p></div>
            <div><b>자동매매 엔진 백테스트</b><p>백테스트 상단에서 종목 원본을 불러와 실행합니다. 자동 모의매매와 동일한 엔진이 H4·M15 계획 이후 선택한 M1/M5 진입, H1 PP, 등급과 비용을 처리합니다. 새 모델에는 고정 1R 부분청산이 없습니다. 과거 시세는 매 1분봉 시가로 관측하므로 실제 틱 접촉과 서버 확인 주기를 재현하지 않습니다. 진행 봉의 최종 고가·저가·종가는 미리 쓰지 않습니다.</p><p>마지막 보유분은 강제청산하지 않고 평가액과 미청산 상태를 표시합니다. 거래가 없으면 대기 단계와 짧은 데이터 기간을 확인하세요. 아래의 기존 고저가 돌파+20MA 백테스트는 별도 전략이므로 두 결과를 섞지 않습니다.</p></div>
          </article>
        </div>

        <div className="guide-mistakes">
          <h3>자주 생기는 혼선</h3>
          <ul>
            <li>모든 지그재그를 유효 스윙으로 세지 않습니다.</li>
            <li>CHoCH 하나만 보고 바로 진입하지 않습니다.</li>
            <li>1D·4H의 구조 기준선을 실제 진입 가격으로 착각하지 않습니다.</li>
            <li>15분 기원 구역 재접촉과 이후 1분 전환·재접촉을 구분합니다.</li>
            <li>백테스트 결과를 다음 거래의 확정 예측으로 사용하지 않습니다.</li>
          </ul>
        </div>
      </section>
      </div>}
    </section>
  );
}

function Dashboard({viewer,onLogout}:{viewer:AuthUser;onLogout:()=>void}) {
  const [market, setMarket] = useState<Market>('US');
  const [symbol, setSymbol] = useState('ONDS');
  const [tab, setTab] = useState<'analysis' | 'paper' | 'backtest' | 'guide' | 'admin'>('analysis');
  const [symbolQuery,setSymbolQuery]=useState('');
  const [discoveredSymbols,setDiscoveredSymbols]=useState<SymbolSearchResult[]>([]);
  const [data, setData] = useState<Candle[]>(() => demo());
  const [higherTimeframeData, setHigherTimeframeData] =
    useState<HigherTimeframeData>({});
  const [dataSource, setDataSource] = useState<'demo' | 'kiwoom' | 'csv'>(
    'demo',
  );
  const [loadedInstrumentKey, setLoadedInstrumentKey] = useState('US:ONDS');
  const [status, setStatus] = useState('예시 데이터 · 종목을 불러오세요');
  const [loading, setLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    supplyDemand: false,
    structure: false,
    choch: false,
    swingLabels: false,
    premiumDiscount: false,
    internalStructure: false,
    volume: false,
    volumeProfile: false,
    orderflow: false,
    liquidity: false,
    forecast: false,
    htfPOI: false,
  });
  const [planEntryFrame,setPlanEntryFrame]=useState<'1m'|'5m'>('1m');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [signalHelp,setSignalHelp]=useState<{title:string;at:string;direction:string;sequence:string;event:string;protectedPrice?:number;weakPrice?:number;steps:{label:string;detail:string;state:string}[];source:string}|null>(null);
  const [selectedEntryStep, setSelectedEntryStep] =
    useState<MultiTimeframeEntryStep | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [watchlist, setWatchlist] =
    useState<WatchlistEntry[]>(DEFAULT_WATCHLIST);
  const [watchlistDraft, setWatchlistDraft] =
    useState<WatchlistEntry[]>(DEFAULT_WATCHLIST);
  const [watchlistMarket, setWatchlistMarket] = useState<Market>('US');
  const [watchlistError, setWatchlistError] = useState('');
  const [watchlistSaving, setWatchlistSaving] = useState(false);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, LiveQuote>>({});
  const [liveErrors, setLiveErrors] = useState<Record<string, LiveQuoteError>>(
    {},
  );
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState('');
  const [liveError, setLiveError] = useState('');
  const [preferences, setPreferences] =
    useState<Preferences>(DEFAULT_PREFERENCES);
  const [settingsDraft, setSettingsDraft] =
    useState<Preferences>(DEFAULT_PREFERENCES);
  const [storageReady, setStorageReady] = useState(false);
  const [lookback, setLookback] = useState(20);
  const [rewardRisk, setRewardRisk] = useState(2);
  const [direction, setDirection] = useState<BacktestDirection>('BOTH');
  const [backtestTimeframe, setBacktestTimeframe] = useState<Timeframe>('5m');
  const [appliedBacktestTimeframe, setAppliedBacktestTimeframe] =
    useState<Timeframe>('5m');
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [appliedBacktest, setAppliedBacktest] = useState<BacktestOptions>({
    minRR: 2,
    lookback: 20,
    initialCapital: DEFAULT_PREFERENCES.capital,
    riskPct: DEFAULT_PREFERENCES.riskPct,
    feeBps: DEFAULT_PREFERENCES.feeBps,
    slippageBps: DEFAULT_PREFERENCES.slippageBps,
    direction: 'BOTH',
  });
  const [lastRun, setLastRun] = useState('초기 계산');
  const fileInput = useRef<HTMLInputElement>(null);
  const liveRequestInFlight = useRef(false);
  const liveAbortController = useRef<AbortController | null>(null);
  const marketDataCache = useRef(new Map<string, MarketDataCacheEntry>());
  const marketAbortController = useRef<AbortController | null>(null);
  const marketRequestId = useRef(0);
  const initialLoadStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const restoreSavedSettings = async () => {
      const savedPreferences = loadPreferences();
      setPreferences(savedPreferences);
      setSettingsDraft(savedPreferences);
      setAppliedBacktest((currentOptions) => ({
        ...currentOptions,
        initialCapital: savedPreferences.capital,
        riskPct: savedPreferences.riskPct,
        feeBps: savedPreferences.feeBps,
        slippageBps: savedPreferences.slippageBps,
      }));
      try {
        const response = await fetch('/api/watchlist', { cache: 'no-store' });
        const payload = await response.json() as { items?: WatchlistEntry[]; configured?: boolean; error?: string };
        if (!response.ok || !payload.items) throw new Error(payload.error || '관심종목을 불러오지 못했습니다.');
        let savedWatchlist = payload.items;
        const legacy = !payload.configured ? loadLegacyWatchlist() : null;
        if (legacy) {
          const migration = await fetch('/api/watchlist', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: legacy }),
          });
          const migrated = await migration.json() as { items?: WatchlistEntry[] };
          if (migration.ok && migrated.items) {
            savedWatchlist = migrated.items;
            window.localStorage.removeItem('structureflow:watchlist');
          }
        }
        if (!cancelled) {
          setWatchlist(savedWatchlist);
          setWatchlistDraft(savedWatchlist);
        }
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : '관심종목을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    };
    void restoreSavedSettings();
    return () => { cancelled = true; };
  }, [viewer.id]);

  useEffect(
    () => () => {
      marketRequestId.current += 1;
      marketAbortController.current?.abort();
      marketAbortController.current = null;
    },
    [],
  );

  const watchedSymbols = useMemo(
    () =>
      watchlist
        .map(normalizeWatchlistEntry)
        .filter((item): item is WatchedSymbol => Boolean(item)),
    [watchlist],
  );
  const activeWatchedSymbols = useMemo(
    () => watchedSymbols.filter((item) => item.market === market),
    [market, watchedSymbols],
  );
  const availableSymbols = useMemo(() => {
    const byFeed = new Map<string, SymbolItem>();
    for (const item of symbols[market]) byFeed.set(item.feed, item);
    for (const item of discoveredSymbols) {
      if (item.market === market) byFeed.set(item.feed, item);
    }
    for (const item of watchedSymbols) {
      if (item.market !== market) continue;
      const quote = liveQuotes[liveQuoteKey(item)];
      byFeed.set(item.feed, {
        ...item,
        name:
          item.market === 'KR' && item.name !== item.code
            ? item.name
            : quote?.name || item.name,
      });
    }
    return Array.from(byFeed.values());
  }, [discoveredSymbols, liveQuotes, market, watchedSymbols]);
  const current =
    availableSymbols.find((item) => item.code === symbol) ??
    availableSymbols[0];
  const hasMarketSelection = Boolean(symbol);
  const currentInstrumentKey = `${market}:${current.code}`;
  const chartMatchesSelection =
    hasMarketSelection && loadedInstrumentKey === currentInstrumentKey;
  const timeframeData = useMemo(
    () => buildTimeframeData(data, higherTimeframeData, dataSource),
    [data, dataSource, higherTimeframeData],
  );
  const chartData = timeframeData[timeframe];
  const analysisData = chartData;
  const analysis = useMemo(() => analyze(analysisData), [analysisData]);
  const timeframeSnapshots = useMemo(
    () =>
      Object.fromEntries(
        (Object.entries(timeframeData) as Array<[Timeframe, Candle[]]>).map(
          ([name, candles]) => [name, structureSnapshot(candles)],
        ),
      ) as Record<Timeframe, Snapshot>,
    [timeframeData],
  );
  const entryAnalyses = useMemo(
    () => ({
      '1m': analyze(timeframeData['1m']),
      '5m': analyze(timeframeData['5m']),
      '15m': analyze(timeframeData['15m']),
      '1H': analyze(timeframeData['1H']),
    }),
    [timeframeData],
  );
  const multiTimeframeEntry = useMemo(
    () =>
      evaluateMultiTimeframeEntry({
        snapshots: timeframeSnapshots,
        analyses: entryAnalyses,
        candles: timeframeData,
        capital: market==='KR'?10000000:10000,
        entryFrame:planEntryFrame,
      }),
    [entryAnalyses, timeframeSnapshots, timeframeData, market, liveUpdatedAt,planEntryFrame],
  );
  const commonPlan=multiTimeframeEntry.tradePlan;
  const entryReference = entryAnalyses[planEntryFrame];
  const executionAnalysis = {...entryReference,bias:commonPlan.direction,entry:commonPlan.entry??[0,0] as [number,number],
    stop:commonPlan.stop??0,target:commonPlan.target??0,rr:commonPlan.netR,
    entryForecast:{...entryReference.entryForecast,zoneValid:commonPlan.ready,status:commonPlan.ready?'READY' as const:'WAIT' as const,reasons:multiTimeframeEntry.steps.map(step=>({...step,state:step.state==='BLOCK'?'RISK' as const:step.state}))},
  };
  const selectedDirection = commonPlan.direction==='NEUTRAL'?'방향 대기':(commonPlan.direction==='LONG'?'롱':'숏')+(commonPlan.ready?' 참고 조건 충족':' 계획 대기');
  function explainSignal(frame:Timeframe,label:string,bias:Analysis['bias']){
    const a=analyze(timeframeData[frame]), snap=timeframeSnapshots[frame];
    setSignalHelp({title:frame+' · '+label,at:new Date().toLocaleString('ko-KR'),direction:bias,sequence:snap.sequence,event:snap.event,protectedPrice:a.protectedPrice,weakPrice:a.weakPrice,steps:multiTimeframeEntry.steps.map(step=>({...step})),source:status});
  }

  const timeframeContext = multiTimeframeContext(
    timeframeSnapshots['1D'].trend,
    timeframeSnapshots['4H'].trend,
    executionAnalysis.bias,
  );
  const draftBacktestData = timeframeData[backtestTimeframe];
  const backtestData = timeframeData[appliedBacktestTimeframe];
  const result = useMemo(
    () => backtest(backtestData, appliedBacktest),
    [appliedBacktest, backtestData],
  );
  const selectedTrade =
    result.tradeLog.find((trade) => trade.id === selectedTradeId) ??
    result.tradeLog.at(-1) ??
    null;
  const maxLookback = Math.max(8, Math.min(50, draftBacktestData.length - 2));
  const canRunBacktest = draftBacktestData.length >= Math.max(lookback, 20) + 2;
  const last = chartData.at(-1)?.close ?? data.at(-1)!.close;
  const currentLiveQuoteKey = liveQuoteKey({ ...current, market });
  const activeLiveQuote = liveQuotes[currentLiveQuoteKey];
  const displayedPrice = activeLiveQuote?.price ?? last;
  const activeQuoteUnavailable = Boolean(liveError || liveErrors[currentLiveQuoteKey] || !activeLiveQuote || liveQuoteStatus(activeLiveQuote, undefined) === '오래됨');

  useEffect(() => {
    if (tab === 'analysis' || tab === 'backtest') {
      document.title = activeQuoteUnavailable ? `${current.name} / 시세 확인 대기` : `${current.name} / ${current.currency}${formatPrice(displayedPrice, market)}`;
    } else if (tab === 'admin') {
      document.title = '회원 관리 · StructureFlow';
    } else if (tab === 'guide') {
      document.title = '트레이딩 가이드 · StructureFlow';
    }
  }, [current.currency, current.name, displayedPrice, activeQuoteUnavailable, market, tab]);

  const entryMidpoint = (executionAnalysis.entry[0] + executionAnalysis.entry[1]) / 2;
  const unitRisk = Math.max(Math.abs(entryMidpoint - executionAnalysis.stop), 0.000001);
  const riskBudget = preferences.capital * (preferences.riskPct / 100);
  const positionSize = executionAnalysis.entryForecast.zoneValid ? Math.max(0, Math.floor(riskBudget / unitRisk)) : 0;
  const positionNotional = positionSize * entryMidpoint;

  const loadMarketData = useCallback(
    async (item: SymbolItem | WatchedSymbol, refresh=false) => {
      const itemMarket = 'market' in item ? item.market : market;
      const exchange = itemMarket === 'US' ? item.exchange || 'ND' : '';
      const cacheKey = `${itemMarket}:${item.code}:${exchange}`;
      const requestId = ++marketRequestId.current;
      marketAbortController.current?.abort();
      if(!refresh)setLoadedInstrumentKey('');

      const applyPayload = (payload: MarketDataCacheEntry['payload']) => {
        setData(payload.candles);
        setHigherTimeframeData(payload.timeframes || {});
        setDataSource('kiwoom');
        setLoadedInstrumentKey(`${itemMarket}:${item.code}`);
        if(!refresh)setTimeframe('1D');
        setStatus(
          `${payload.name || item.name} · ${payload.source || '시장 데이터'} · ${payload.candles.length.toLocaleString()}개 캔들 · ${new Date(payload.fetchedAt || Date.now()).toLocaleString('ko-KR')}`,
        );
      };

      const cached = marketDataCache.current.get(cacheKey);
      if (cached) {
        applyPayload(cached.payload);
        if (!refresh && Date.now() - cached.cachedAt < MARKET_DATA_CACHE_TTL_MS) {
          setLoading(false);
          return;
        }
      }

      const controller = new AbortController();
      marketAbortController.current = controller;
      setLoading(true);
      setStatus(
        cached
          ? `${item.code} 최신 데이터 확인 중…`
          : `${item.code} 분석 데이터 불러오는 중…`,
      );
      try {
        const query = new URLSearchParams({
          market: itemMarket,
          symbol: item.code,
          ...(itemMarket === 'US' ? { exchange } : {}),
        });
        const response = await fetch(`/api/market?${query.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = (await response.json()) as MarketResponse;
        if (!response.ok)
          throw new Error(
            payload.error || `데이터 제공처 오류 ${response.status}`,
          );
        if (!payload.candles || payload.candles.length < 40) {
          throw new Error('분석 가능한 데이터가 부족합니다.');
        }
        const nativeTimeframes: Timeframe[] = ['15m', '1H', '4H', '1D'];
        if (
          nativeTimeframes.some(
            (name) => (payload.timeframes?.[name]?.length || 0) < 20,
          )
        ) {
          throw new Error('키움 시간봉 데이터가 모두 준비되지 않았습니다.');
        }
        if (requestId !== marketRequestId.current) return;
        const cachePayload = payload as MarketDataCacheEntry['payload'];
        marketDataCache.current.set(cacheKey, {
          payload: cachePayload,
          cachedAt: Date.now(),
        });
        applyPayload(cachePayload);
      } catch (error) {
        if (controller.signal.aborted || requestId !== marketRequestId.current)
          return;
        setStatus(
          `불러오기 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'} · CSV를 사용할 수 있습니다.`,
        );
      } finally {
        if (marketAbortController.current === controller) {
          marketAbortController.current = null;
          setLoading(false);
        }
      }
    },
    [market],
  );

  useEffect(() => {
    if(dataSource!=='kiwoom'||!chartMatchesSelection)return;
    const timer=window.setInterval(()=>{
      if(document.visibilityState==='visible'&&!marketAbortController.current)void loadMarketData(current,true);
    },60_000);
    return ()=>window.clearInterval(timer);
  },[dataSource,chartMatchesSelection,current.code,current.exchange,loadMarketData]);

  const refreshLiveQuotes = useCallback(async () => {
    if (!storageReady || !activeWatchedSymbols.length || liveRequestInFlight.current)
      return;
    liveRequestInFlight.current = true;
    const controller = new AbortController();
    liveAbortController.current = controller;
    setLiveLoading(true);
    try {
      const items = activeWatchedSymbols.map(liveQuoteKey).join(',');
      const response = await fetch(
        `/api/quotes?items=${encodeURIComponent(items)}`,
        { cache: 'no-store', signal: controller.signal },
      );
      const payload = (await response.json()) as QuotesResponse;
      const errors = Object.fromEntries(
        (payload.errors || []).map((item) => [item.key, item]),
      );
      setLiveErrors(errors);
      if (!response.ok && !payload.quotes?.length) {
        throw new Error(
          payload.error ||
            payload.errors?.[0]?.error ||
            '실시간 시세를 받지 못했습니다.',
        );
      }

      const quotes = payload.quotes || [];
      setLiveQuotes((previous) => ({
        ...previous,
        ...Object.fromEntries(quotes.map((quote) => [quote.key, quote])),
      }));
      setLiveUpdatedAt(payload.fetchedAt || new Date().toISOString());
      setLiveError('');

    } catch (error) {
      if (controller.signal.aborted) return;
      setLiveError(
        error instanceof Error ? error.message : '실시간 시세 연결 오류',
      );
    } finally {
      if (liveAbortController.current === controller) {
        liveAbortController.current = null;
        setLiveLoading(false);
        liveRequestInFlight.current = false;
      }
    }
  }, [activeWatchedSymbols, storageReady]);

  useEffect(() => {
    let cancelled = false;
    let nextPoll: number | undefined;
    console.info(`[quotes] polling started market=${market} count=${activeWatchedSymbols.length}`);
    const poll = async () => {
      const startedAt = Date.now();
      if (document.visibilityState === 'visible') await refreshLiveQuotes();
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      nextPoll = window.setTimeout(poll, Math.max(250, 5_000 - elapsed));
    };
    nextPoll = window.setTimeout(poll, 0);
    return () => {
      cancelled = true;
      if (nextPoll !== undefined) window.clearTimeout(nextPoll);
      liveAbortController.current?.abort();
      liveAbortController.current = null;
      liveRequestInFlight.current = false;
      console.info('[quotes] polling stopped');
    };
  }, [activeWatchedSymbols.length, market, refreshLiveQuotes]);

  useEffect(() => {
    if (!storageReady || initialLoadStarted.current || !watchedSymbols.length)
      return;
    initialLoadStarted.current = true;
    const initial =
      watchedSymbols.find((item) => item.feed === current.feed) ??
      watchedSymbols[0];
    const initialLoad = window.setTimeout(() => {
      setMarket(initial.market);
      setSymbol(initial.code);
      void loadMarketData(initial);
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [current.feed, loadMarketData, storageReady, watchedSymbols]);

  const chooseMarket = (nextMarket: Market) => {
    setMarket(nextMarket);
    const next = watchedSymbols.find((item) => item.market === nextMarket);
    setSymbol(next?.code ?? '');
    setTimeframe('1D');
    if (next) {
      void loadMarketData(next);
      return;
    }
    setLoadedInstrumentKey('');
    setStatus(`${nextMarket === 'US' ? '미국' : '한국'} 관심종목을 먼저 추가하세요.`);
  };

  const chooseSearchedSymbol = (item: SymbolSearchResult) => {
    setDiscoveredSymbols((currentItems) => [
      item,
      ...currentItems.filter((candidate) => candidate.market !== item.market || candidate.feed !== item.feed),
    ].slice(0, 30));
    setMarket(item.market);
    setSymbol(item.code);
    setSymbolQuery('');
    void loadMarketData(item);
  };

  const chooseWatchlistSymbol = (index: number, item: SymbolSearchResult) => {
    if (item.market !== watchlistMarket) return;
    setWatchlistDraft((draft) => draft.map((entry, itemIndex) => itemIndex === index ? {
      market: watchlistMarket,
      ticker: item.feed,
      ...(watchlistMarket === 'US' ? { exchange: item.exchange || 'ND' } : {}),
    } : entry));
  };

  const activateWatchedSymbol = (item: WatchedSymbol) => {
    setMarket(item.market);
    setSymbol(item.code);
    void loadMarketData(item);
  };

  const openWatchlistSettings = () => {
    setWatchlistDraft(watchlist.length ? watchlist : DEFAULT_WATCHLIST);
    setWatchlistMarket(market);
    setWatchlistError('');
    setWatchlistOpen(true);
  };

  const saveWatchlist = async () => {
    const cleaned = watchlistDraft
      .map((entry) => ({ ...entry, ticker: entry.ticker.trim().toUpperCase() }))
      .filter((entry) => entry.ticker);
    const normalized = cleaned.map(normalizeWatchlistEntry);
    const usCount = cleaned.filter((entry) => entry.market === 'US').length;
    const krCount = cleaned.filter((entry) => entry.market === 'KR').length;
    if (cleaned.length < 1 || cleaned.length > MAX_WATCHLIST_SIZE || usCount > MAX_WATCHLIST_PER_MARKET || krCount > MAX_WATCHLIST_PER_MARKET) {
      setWatchlistError('관심종목은 미국 최대 3개, 한국 최대 3개까지 지정할 수 있습니다.');
      return;
    }
    if (normalized.some((item) => !item)) {
      setWatchlistError(
        '미국은 영문 티커, 한국은 6자리 코드 또는 .KS/.KQ 형식으로 입력하세요.',
      );
      return;
    }
    const quoteKeys = normalized.map((item) => liveQuoteKey(item!));
    if (new Set(quoteKeys).size !== quoteKeys.length) {
      setWatchlistError('같은 종목이 중복되어 있습니다.');
      return;
    }

    const saved = normalized.map((item) => ({
      market: item!.market,
      ticker: item!.feed,
      ...(item!.market === 'US' ? { exchange: item!.exchange || 'ND' } : {}),
    }));
    setWatchlistSaving(true);
    setWatchlistError('');
    try {
      const response = await fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: saved }),
      });
      const payload = await response.json() as { items?: WatchlistEntry[]; error?: string };
      if (!response.ok || !payload.items) throw new Error(payload.error || '관심종목을 저장하지 못했습니다.');
      setWatchlist(payload.items);
      setWatchlistDraft(payload.items);
      const savedForCurrentMarket = payload.items
        .map(normalizeWatchlistEntry)
        .filter((item): item is WatchedSymbol => item !== null)
        .filter((item) => item.market === market);
      const nextSelection = !savedForCurrentMarket.some((item) => item.code === symbol)
        ? savedForCurrentMarket[0]
        : undefined;
      if (nextSelection || !savedForCurrentMarket.length) {
        setSymbol(nextSelection?.code ?? '');
        setLoadedInstrumentKey('');
      }
      setLiveQuotes({});
      setLiveErrors({});
      setWatchlistOpen(false);
      setStatus(`${viewer.displayName} 계정의 관심종목을 저장했습니다.`);
      if (nextSelection) void loadMarketData(nextSelection);
    } catch (error) {
      setWatchlistError(error instanceof Error ? error.message : '관심종목을 저장하지 못했습니다.');
    } finally {
      setWatchlistSaving(false);
    }
  };

  const uploadCsv = async (file?: File) => {
    if (!file) return;
    try {
      const candles = parseCsv(await file.text());
      if (candles.length < 20) throw new Error('최소 20개 캔들이 필요합니다.');
      setData(candles);
      setHigherTimeframeData({});
      setDataSource('csv');
      setLoadedInstrumentKey(currentInstrumentKey);
      setTimeframe(
        resampleBySession(candles, timeframeSizes['1D']).length >= 20
          ? '1D'
          : '5m',
      );
      setStatus(
        `${file.name} · ${candles.length.toLocaleString()}개 캔들 · 계산 완료`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '파일 오류');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const toggleLayer = (key: LayerKey) => {
    setLayers((currentLayers) => ({
      ...currentLayers,
      [key]: !currentLayers[key],
    }));
  };

  const openSettings = () => {
    setSettingsDraft(preferences);
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const normalized = {
      capital: clamp(settingsDraft.capital, 100, 100_000_000),
      riskPct: clamp(settingsDraft.riskPct, 0.1, 10),
      feeBps: clamp(settingsDraft.feeBps, 0, 100),
      slippageBps: clamp(settingsDraft.slippageBps, 0, 100),
    };
    setPreferences(normalized);
    window.localStorage.setItem(
      'structureflow:preferences',
      JSON.stringify(normalized),
    );
    setSettingsOpen(false);
    setStatus('위험관리 설정을 이 기기에 저장했습니다.');
  };

  const runBacktest = () => {
    if (!canRunBacktest) return;
    setSelectedTradeId(null);
    setAppliedBacktest({
      minRR: rewardRisk,
      lookback,
      initialCapital: preferences.capital,
      riskPct: preferences.riskPct,
      feeBps: preferences.feeBps,
      slippageBps: preferences.slippageBps,
      direction,
    });
    setAppliedBacktestTimeframe(backtestTimeframe);
    setLastRun(new Date().toLocaleTimeString('ko-KR'));
  };

  const chooseBacktestTimeframe = (nextTimeframe: Timeframe) => {
    const availableBars = timeframeData[nextTimeframe].length;
    const nextMaximum = Math.max(8, Math.min(50, availableBars - 2));
    setBacktestTimeframe(nextTimeframe);
    setLookback((currentLookback) => clamp(currentLookback, 8, nextMaximum));
  };

  const exportTrades = () => {
    const header = [
      'id',
      'side',
      'entry_date',
      'entry_reason',
      'lookback_bars',
      'trigger_price',
      'moving_average',
      'entry_atr',
      'exit_date',
      'entry',
      'exit',
      'stop',
      'target',
      'size',
      'pnl',
      'r_multiple',
      'result',
      'exit_reason',
    ];
    const rows = result.tradeLog.map((trade) => [
      trade.id,
      trade.side,
      trade.entryDate,
      trade.entryReason,
      trade.lookbackBars,
      trade.triggerPrice,
      trade.movingAverage,
      trade.entryAtr,
      trade.exitDate,
      trade.entry,
      trade.exit,
      trade.stop,
      trade.target,
      trade.size,
      trade.pnl,
      trade.rMultiple,
      trade.result,
      trade.exitReason,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(','),
      )
      .join('\n');
    downloadTextFile(
      `structureflow-${current.code}-${appliedBacktestTimeframe}-backtest.csv`,
      `\uFEFF${csv}`,
    );
  };

  const timeframeRows = (['1D', '4H', '1H', '15m', '5m', '1m'] as Timeframe[]).map(
    (name) => [name, timeframeSnapshots[name]] as [Timeframe, Snapshot],
  );
  const layerOptions: Array<{ key: LayerKey; label: string }> = [
    { key: 'structure', label: '1 스윙구조' },
    { key: 'swingLabels', label: 'HH·HL·LH·LL' },
    { key: 'premiumDiscount', label: '2 Premium/Discount' },
    { key: 'supplyDemand', label: '3 수요·공급 등급' },
    { key: 'htfPOI', label: '상위 관심 구역' },
    { key: 'liquidity', label: '4 유동성' },
    { key: 'internalStructure', label: '5 내부구조' },
    { key: 'choch', label: '6 CHoCH' },
    { key: 'forecast', label: '7 진입·손절·목표' },
    { key: 'orderflow', label: '보조 OB/FVG' },
    { key: 'volume', label: '보조 거래량' },
    { key: 'volumeProfile', label: '보조 VP' },
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brandmark">
            <Activity size={18} />
          </div>
          <div>
            <strong>
              STRUCTURE<span>FLOW</span>
            </strong>
            <small>Trading Decision System</small>
          </div>
        </div>
        <nav aria-label="주요 화면">
          <button
            className={tab === 'analysis' ? 'active' : ''}
            onClick={() => setTab('analysis')}
          >
            분석 대시보드
          </button>
          <button
            className={tab === 'paper' ? 'active' : ''}
            onClick={() => setTab('paper')}
          >
            모의투자
          </button>
          <button
            className={tab === 'backtest' ? 'active' : ''}
            onClick={() => setTab('backtest')}
          >
            백테스트
          </button>
          <button
            className={tab === 'guide' ? 'active' : ''}
            onClick={() => setTab('guide')}
          >
            트레이딩 가이드
          </button>
          {viewer.role === 'admin' && <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>회원 관리</button>}
        </nav>
        <div className="top-actions">
          <span className="viewer-name">{viewer.displayName}</span>
          <button
            className="icon-btn"
            onClick={openSettings}
            aria-label="위험관리 설정 열기"
          >
            <Settings2 size={17} />
          </button>
          {tab !== 'paper' && tab !== 'guide' && tab !== 'admin' && <><button
            className="primary"
            onClick={() => fileInput.current?.click()}
          >
            <UploadCloud size={16} /> CSV 불러오기
          </button>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => uploadCsv(event.target.files?.[0])}
          />
          </>}
          <button className="icon-btn" aria-label="로그아웃" onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});onLogout();}}><LogOut size={16}/></button>
        </div>
      </header>

      {tab !== 'paper' && tab !== 'guide' && tab !== 'admin' && <>
      <section className="controlbar">
        <div className="segmented" aria-label="시장 선택">
          <button
            className={market === 'US' ? 'on' : ''}
            onClick={() => chooseMarket('US')}
          >
            🇺🇸 미국
          </button>
          <button
            className={market === 'KR' ? 'on' : ''}
            onClick={() => chooseMarket('KR')}
          >
            🇰🇷 한국
          </button>
        </div>
        <div className="symbol-picker searchable">
          <SymbolSearchBox value={symbolQuery} onValueChange={setSymbolQuery} onSelect={chooseSearchedSymbol} placeholder={hasMarketSelection ? `${current.code} · ${current.name}` : '종목 이름 또는 코드 검색'}/>
        </div>
        <button
          className="primary"
          onClick={() => loadMarketData(current,true)}
          disabled={loading || !hasMarketSelection}
        >
          {loading ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <Database size={16} />
          )}
          데이터 불러오기
        </button>
        <div className="price">
          <strong>
            {hasMarketSelection && activeLiveQuote ? `${current.currency}${formatPrice(activeLiveQuote.price, market)}` : '--'}
          </strong>
          {activeQuoteUnavailable ? <span>수신 중단 · 마지막 가격 참고</span> : activeLiveQuote ? (
            <span
              className={activeLiveQuote.change >= 0 ? 'positive' : 'negative'}
            >
              {activeLiveQuote.change >= 0 ? '+' : ''}
              {activeLiveQuote.changePct.toFixed(2)}%
            </span>
          ) : (
            <span>{analysis.bias}</span>
          )}
        </div>
        <div className="freshness" title={status}>
          {status}
        </div>
      </section>

      <section className="live-watchbar" aria-label="실시간 관심종목">
        <div className="live-watch-head">
          <div>
            {liveError ? <WifiOff size={15} /> : <Wifi size={15} />}
            <span>LIVE WATCH · {market === 'US' ? '미국' : '한국'}</span>
          </div>
          <small>
            {liveUpdatedAt
              ? `${new Date(liveUpdatedAt).toLocaleTimeString('ko-KR')} 갱신`
              : '연결 중'}
          </small>
        </div>
        <div className="live-watch-cards">
          {activeWatchedSymbols.map((item) => {
            const quoteKey = liveQuoteKey(item);
            const quote = liveQuotes[quoteKey];
            const quoteError = liveErrors[quoteKey];
            const quoteState = liveError ? '수신 중단' : liveQuoteStatus(quote, quoteError);
            const stale = quoteState === '오래됨' || quoteState === '수신 중단';
            const displayName =
              item.market === 'KR' && item.name !== item.code
                ? item.name
                : quote?.name || item.name;
            return (
              <button
                type="button"
                key={quoteKey}
                className={current.feed === item.feed ? 'selected' : ''}
                onClick={() => activateWatchedSymbol(item)}
                title={quoteError?.error}
              >
                <div>
                  <b>
                    {item.market === 'KR'
                      ? `${item.code} · ${displayName}`
                      : item.code}
                  </b>
                  <span
                    className={
                      quote && !quoteError && !stale ? 'connected' : 'waiting'
                    }
                  >
                    {quoteState}
                  </span>
                </div>
                {quote ? (
                  <>
                    <strong>
                      {item.currency}
                      {formatPrice(quote.price, item.market)}
                    </strong>
                    <em className={quote.change >= 0 ? 'positive' : 'negative'}>
                      {quote.change >= 0 ? '+' : ''}
                      {quote.changePct.toFixed(2)}%
                    </em>
                    <small>
                      {quoteError || liveError
                        ? `${displayName} · 마지막 수신 가격 (현재가 아님)`
                        : `${displayName} · ${quote.exchange || '키움'} · 수신 ${new Date(quote.lastUpdated).toLocaleTimeString('ko-KR')}`}
                    </small>
                  </>
                ) : (
                  <>
                    <strong>--</strong>
                    <em className="quote-error">
                      {quoteError?.error || liveError || '시세 수신 중'}
                    </em>
                    <small>{item.name}</small>
                  </>
                )}
              </button>
            );
          })}
          {Array.from(
            { length: MAX_WATCHLIST_PER_MARKET - activeWatchedSymbols.length },
            (_, index) => (
              <button
                type="button"
                className="watchlist-market-empty"
                key={`add-${market}-${index}`}
                onClick={openWatchlistSettings}
                aria-label={`${market === 'US' ? '미국' : '한국'} 관심종목 추가`}
              >
                <Plus size={15} />
                <span>종목을 추가해 주세요</span>
              </button>
            ),
          )}
        </div>
        <div className="live-watch-actions">
          <button
            type="button"
            onClick={() => void refreshLiveQuotes()}
            disabled={liveLoading}
            aria-label="실시간 시세 새로고침"
          >
            <RefreshCw className={liveLoading ? 'spin' : ''} size={14} />
            새로고침
          </button>
          <button type="button" onClick={openWatchlistSettings}>
            <Settings2 size={14} /> 종목 설정
          </button>
          <small>5초 주기 · 키움 전용 · 수신 시각 기준</small>
        </div>
      </section>
      </>}

      <div hidden={tab !== 'paper'}>
        <PaperTrading
          preferences={preferences}
          viewerId={viewer.id}
          active={tab === 'paper'}
        />
      </div>

      {tab === 'analysis' ? (
        !hasMarketSelection || !chartMatchesSelection ? (
        <section className="analysis-empty-state">
          {loading ? <Loader2 className="spin" size={34} /> : <Database size={34} />}
          <strong>
            {!hasMarketSelection
              ? `${market === 'US' ? '미국' : '한국'} 분석 종목이 없습니다`
              : loading
                ? `${current.name} 차트를 불러오는 중입니다`
                : `${current.name} 차트가 아직 준비되지 않았습니다`}
          </strong>
          <p>
            {!hasMarketSelection
              ? '위 관심종목 영역을 눌러 종목을 추가하거나, 이름 또는 종목코드로 검색하세요.'
              : status}
          </p>
          {!hasMarketSelection ? (
            <button type="button" className="primary" onClick={openWatchlistSettings}>
              <Plus size={15} /> 종목 설정 열기
            </button>
          ) : !loading ? (
            <button type="button" className="primary" onClick={() => void loadMarketData(current)}>
              <Database size={15} /> 다시 불러오기
            </button>
          ) : null}
        </section>
      ) : (
        <>
          <section className="decision-strip">
            <div
              className="score-ring"
              style={{
                background: `radial-gradient(circle,#0d131b 55%,transparent 57%),conic-gradient(var(--green) ${executionAnalysis.score}%,#252d38 0)`,
              }}
            >
              <b>{executionAnalysis.score}</b>
              <span>/100</span>
            </div>
            <div className="directive">
              <div>
                <i />
                <button type="button" onClick={()=>explainSignal('4H',selectedDirection,executionAnalysis.bias)} aria-label="종합 방향 신호의 판단 이유 보기"
                  className={`direction-chip ${executionAnalysis.bias.toLowerCase()}`}
                >
                  {selectedDirection} ⓘ
                </button>
                <span>
                  {executionAnalysis.bias} · 조건 충족 {executionAnalysis.confidence}/100 (승률 아님) · {planEntryFrame} 정제 · 4H 거래 방향 · 자동 계좌의 관측 순서는 별도 확인
                </span>
              </div>
              <h1>
                {commonPlan.stage}
              </h1>
              <p>
                {timeframeSnapshots[timeframe].event} · {timeframeContext} ·
                15m 기원 구역 · 1m 진입 정제
              </p>
            </div>
            <div className="metric">
              <small>예측 진입 구간</small>
              <strong>
                {executionAnalysis.entryForecast.zoneValid ? `${current.currency}${formatPrice(executionAnalysis.entry[0], market)} – ${formatPrice(executionAnalysis.entry[1], market)}` : '구조 영역 확인 대기'}
              </strong>
              <span>
                {executionAnalysis.entryForecast.zoneValid ? `현재가 대비 ${executionAnalysis.entryForecast.distancePct.toFixed(2)}%` : '임의의 진입 가격을 만들지 않습니다'}
              </span>
            </div>
            <div className="metric danger">
              <small>손절 / 무효화</small>
              <strong>
                {executionAnalysis.entryForecast.zoneValid ? `${current.currency}${formatPrice(executionAnalysis.stop, market)}` : '—'}
              </strong>
              <span>15분 구역 바깥 · 0.1% 완충</span>
            </div>
            <div className="metric">
              <small>목표가</small>
              <strong>
                {executionAnalysis.entryForecast.zoneValid ? `${current.currency}${formatPrice(executionAnalysis.target, market)}` : '—'}
              </strong>
              <span>구조 목표 · {commonPlan.ready?executionAnalysis.rr.toFixed(1)+'R':'미확정'}</span>
            </div>
            <button
              className="review"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
            >
              <ShieldCheck size={16} /> 계산 근거
            </button>
          </section>

          <section className="workspace">
            <aside className="tf-panel panel">
              <div className="panel-title">
                <span>시간대 구조</span>
                <small>각 봉의 흐름 · 거래 계획은 4H 기준</small>
              </div>
              {timeframeRows.map(([name, snapshot]) =>
                (() => {
                  const selected = timeframe === name;
                  const rowBias: Analysis['bias'] = snapshot.trend==='BULLISH'?'LONG':snapshot.trend==='BEARISH'?'SHORT':'NEUTRAL';
                  return (
                    <div
                      className={`tf-row ${selected ? 'selected' : ''}`}
                      key={name}
                    >
                      <div className="tf-term-heading">
                        <button type="button" className="tf-frame-button" onClick={()=>setTimeframe(name)} aria-pressed={selected} aria-label={`${name} 차트 보기`}><b>{name}</b></button>
                        <StructureTermHelp frame={name} snapshot={snapshot} candles={timeframeData[name]} />
                        <small className="tf-role">{timeframeRole(name)}</small>
                      </div>
                      <button className="tf-chart-select" onClick={()=>setTimeframe(name)} aria-pressed={selected} aria-label={`${name} 구조 차트 보기`}>
                      <strong>{snapshot.sequence}</strong>
                      <span>{snapshot.event}</span>
                      </button>
                      <button type="button" onClick={()=>explainSignal(name,directionLabel(rowBias),rowBias)} aria-label={`${name} ${directionLabel(rowBias)} 이유 보기`}
                        className={`tf-signal ${rowBias.toLowerCase()} ${selected ? 'selected' : ''}`}
                      >
                        {selected
                          ? directionLabel(rowBias)
                          : rowBias === 'LONG'
                            ? '롱 우세'
                            : rowBias === 'SHORT'
                              ? '숏 우세'
                              : '관망'}
                      </button>
                    </div>
                  );
                })(),
              )}
              <div className="wyckoff">
                <small>스윙 / 내부 시장 단계</small>
                <strong>{analysis.marketPhase}</strong>
                <p>
                  스윙과 내부 방향의 조합입니다. 실제 기관 주문이나 매집을 확인한 것은 아닙니다.
                </p>
                <div>
                  <span style={{ width: `${analysis.confidence}%` }} />
                </div>
              </div>
            </aside>

            <section className="center-stack">
              <div className="panel chart-panel">
                <div className="panel-title">
                  <span>
                    {current.code} · {current.name} · {timeframe}
                  </span>
                  <div className="layer-toggles" aria-label="차트 레이어">
                    {layerOptions.map((option) => (
                      <button
                        key={option.key}
                        className={layers[option.key] ? 'on' : ''}
                        onClick={() => toggleLayer(option.key)}
                        aria-pressed={layers[option.key]}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="trend-plan-note"><label>공통 계획의 진입 시간대 <select value={planEntryFrame} onChange={e=>setPlanEntryFrame(e.target.value as '1m'|'5m')}><option value="1m">1분 정제</option><option value="5m">5분 정제</option></select></label><p>차트 시간대는 관찰 배율입니다. 바꿔도 거래 방향은 4H 기준을 유지합니다. 먼 가격은 축을 늘리지 않고 화면 밖 안내로 표시합니다.</p></div>
                <CommonPlanCard plan={commonPlan} market={market}/>
                <PriceChart
                  referencePlan={commonPlan}
                  higherZones={higherContexts(timeframeData,commonPlan.asOf)}
                  data={analysisData}
                  analysis={analysis}
                  trendPlan={chartOverlay(commonPlan)}
                  market={market}
                  timeframe={timeframe}
                  layers={layers}
                  seriesKey={`${market}-${current.code}-${timeframe}`}
                  livePrice={activeLiveQuote?.price}
                />
                <div className="vp-suggestion">
                  <div className="vp-icon">
                    <Layers3 size={18} />
                  </div>
                  <div>
                    <strong>
                      Volume Profile · {analysis.profile.length}개 가격 구간
                    </strong>
                    <p>
                      <b>시작</b>{' '}
                      {analysisData[analysis.profileStart]?.date.slice(0, 16)}
                      <span> · </span>
                      <b>끝</b> {analysisData.at(-1)?.date.slice(0, 16)}
                    </p>
                  </div>
                  <button onClick={() => setDetailsOpen((open) => !open)}>
                    {detailsOpen ? '접기' : '범위 검토'}
                  </button>
                </div>
                {detailsOpen && (
                  <div className="vp-detail">
                    <b>
                      POC {formatPrice(analysis.poc, market)} · VAH{' '}
                      {formatPrice(analysis.vah, market)} · VAL{' '}
                      {formatPrice(analysis.val, market)}
                    </b>
                    <p>
                      HVN:{' '}
                      {analysis.hvn
                        .map((value) => formatPrice(value, market))
                        .join(', ')}{' '}
                      / LVN:{' '}
                      {analysis.lvn
                        .map((value) => formatPrice(value, market))
                        .join(', ')}
                    </p>
                    <p>
                      활성 Order Block{' '}
                      {
                        analysis.orderBlocks.filter((zone) => zone.active)
                          .length
                      }
                      개 · 활성 FVG{' '}
                      {
                        analysis.fairValueGaps.filter((zone) => zone.active)
                          .length
                      }
                      개 · 유동성 레벨 {analysis.liquidity.length}개
                    </p>
                  </div>
                )}
              </div>
            </section>

            <aside className="plan-panel panel">
              <div className="panel-title">
                <span>실행 계획</span>
                <small className="live">
                  <i /> CALCULATED
                </small>
              </div>
              <TopDownPanel result={multiTimeframeEntry} selected={timeframe} onDrillDown={setTimeframe} onExplain={setSelectedEntryStep} />
              <article className="plan early forecast-plan">
                <header>
                  <span>
                    <Zap size={15} /> 조건부 진입 예측
                  </span>
                  <b
                    className={`forecast-status ${executionAnalysis.entryForecast.status.toLowerCase()}`}
                  >
                    {multiTimeframeEntry.status === 'READY'
                      ? '조건 충족'
                      : executionAnalysis.entryForecast.status === 'WAIT'
                        ? '대기'
                        : '보류'}
                  </b>
                </header>
                <h3>
                  {executionAnalysis.entryForecast.zoneValid ? `${current.currency}${formatPrice(executionAnalysis.entry[0], market)} – ${formatPrice(executionAnalysis.entry[1], market)}` : '유효 구조 영역 대기'}
                </h3>
                <p>{planEntryFrame} 진입·15분 손절·4시간 목표 참고 · 자동 실험은 선택한 1분/5분 진입의 관측 순서와 H1 PP·등급·비용을 별도 검증합니다.</p>
                <ul className="forecast-reasons">
                  {executionAnalysis.entryForecast.reasons.map((reason) => (
                    <li
                      key={reason.label}
                      className={reason.state.toLowerCase()}
                    >
                      <div>
                        <span>{reason.label}</span>
                        <b>
                          {reason.state === 'PASS'
                            ? '충족'
                            : reason.state === 'RISK'
                              ? '위험'
                              : '대기'}
                        </b>
                      </div>
                      <p>{reason.detail}</p>
                    </li>
                  ))}
                </ul>
                <dl>
                  <div>
                    <dt>손절</dt>
                    <dd>{executionAnalysis.entryForecast.zoneValid ? formatPrice(executionAnalysis.stop, market) : '—'}</dd>
                  </div>
                  <div>
                    <dt>목표</dt>
                    <dd>{executionAnalysis.entryForecast.zoneValid ? formatPrice(executionAnalysis.target, market) : '—'}</dd>
                  </div>
                  <div>
                    <dt>R:R</dt>
                    <dd className="positive">{commonPlan.ready?executionAnalysis.rr.toFixed(1)+'R':'—'}</dd>
                  </div>
                </dl>
              </article>
              <article className="plan confirm">
                <header>
                  <span>
                    <Target size={15} /> 선택 봉 구조 참고
                  </span>
                  <b>{analysis.score >= 70 ? '후보' : '대기'}</b>
                </header>
                <h3>{timeframeSnapshots[timeframe].event}</h3>
                <p>돌파 종가와 리테스트 유지 필요</p>
                <dl>
                  <div>
                    <dt>ATR</dt>
                    <dd>{formatPrice(analysis.atr, market)}</dd>
                  </div>
                  <div>
                    <dt>POC</dt>
                    <dd>{formatPrice(analysis.poc, market)}</dd>
                  </div>
                  <div>
                    <dt>점수</dt>
                    <dd>{analysis.score}</dd>
                  </div>
                </dl>
              </article>
              <div className="position-card">
                <div>
                  <WalletCards size={16} />
                  <span>포지션 계산</span>
                </div>
                <strong>{positionSize.toLocaleString()}주</strong>
                <p>
                  위험 {formatMoney(riskBudget, market)} · 명목{' '}
                  {formatMoney(positionNotional, market)}
                </p>
              </div>
              <div className="warning">
                <CircleAlert size={16} />
                <p>
                  <strong>예측 해석</strong> 조건 충족 가능 위치이며 미래
                  가격이나 체결을 보장하지 않습니다. 주문 전 원본 차트에서
                  검증하세요.
                </p>
              </div>
              <div className="score-list">
                <div>
                  <span>HTF 구조</span>
                  <b>{timeframeSnapshots['1D'].score}/100</b>
                </div>
                <div>
                  <span>VP 위치</span>
                  <b>
                    {last > analysis.val && last < analysis.vah
                      ? 'Value 내부'
                      : 'Value 외부'}
                  </b>
                </div>
                <div>
                  <span>데이터</span>
                  <b>{analysisData.length} bars</b>
                </div>
              </div>
            </aside>
          </section>
        </>
      )
      ) : tab === 'paper' ? null : tab === 'guide' ? (
        <GuidePage />
      ) : tab === 'admin' ? (
        <AdminPanel viewer={viewer}/>
      ) : (
        <section className="backtest-layout">
          <AutoBacktestPanel key={`${market}-${current.code}-${current.exchange}`} market={market} symbol={current.code} exchange={current.exchange}/>
          <aside className="panel strategy">
            <div className="panel-title">
              <span>백테스트 설정</span>
              <small>마지막 실행 {lastRun}</small>
            </div>
            <div className="backtest-timeframe-control">
              <small>백테스트 기준 봉</small>
              <div className="segmented" aria-label="백테스트 봉 주기">
                {backtestTimeframes.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={backtestTimeframe === item ? 'on' : ''}
                    aria-pressed={backtestTimeframe === item}
                    onClick={() => chooseBacktestTimeframe(item)}
                  >
                    {timeframeButtonLabels[item]}
                  </button>
                ))}
              </div>
              <span>
                {backtestTimeframe==='1m'?'원본 1분봉만 사용 · 없으면 실행 불가':`보유한 ${timeframeLabels[backtestTimeframe]} 데이터로 계산`}
                · 사용 가능 {draftBacktestData.length.toLocaleString()}봉
              </span>
            </div>
            <label>
              돌파 Lookback
              <input
                type="range"
                min="8"
                max={maxLookback}
                value={lookback}
                onChange={(event) => setLookback(Number(event.target.value))}
              />
              <span className="range-value">{lookback}봉</span>
              <span className="lookback-duration">
                {timeframeLabels[backtestTimeframe]} 기준 ·{' '}
                {formatLookbackDuration(lookback, backtestTimeframe)} 범위
              </span>
            </label>
            <label>
              목표 R:R
              <input
                type="range"
                min="1"
                max="4"
                step=".25"
                value={rewardRisk}
                onChange={(event) => setRewardRisk(Number(event.target.value))}
              />
              <span className="range-value">{rewardRisk.toFixed(2)}R</span>
            </label>
            <div className="direction-control">
              <small>거래 방향</small>
              <div className="segmented">
                {(['LONG', 'SHORT', 'BOTH'] as BacktestDirection[]).map(
                  (item) => (
                    <button
                      key={item}
                      className={direction === item ? 'on' : ''}
                      onClick={() => setDirection(item)}
                    >
                      {item === 'BOTH' ? '양방향' : item}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="checks">
              <span>✓ 이전 고가·저가 돌파</span>
              <span>✓ 20봉 이동평균 추세 필터</span>
              <span>✓ ATR 1.5 손절</span>
              <span>
                ✓ 거래당 자본 {preferences.riskPct.toFixed(1)}% 리스크
              </span>
              <span>
                ✓ 수수료 {preferences.feeBps}bp + 슬리피지{' '}
                {preferences.slippageBps}bp
              </span>
            </div>
            {!canRunBacktest && (
              <p className="backtest-data-warning">
                이 봉 주기로 계산할 데이터가 부족합니다. 더 짧은 봉을 선택해
                주세요.
              </p>
            )}
            <button
              className="run"
              onClick={runBacktest}
              disabled={!canRunBacktest}
            >
              <Play size={16} /> 설정으로 백테스트 실행
            </button>
            <button className="secondary-action" onClick={openSettings}>
              <SlidersHorizontal size={15} /> 자본·비용 설정
            </button>
            <div className="warning">
              <CircleAlert size={15} />
              <p>
                동일 봉에서 손절과 목표가가 겹치면 보수적으로 손절을 우선합니다.
              </p>
            </div>
          </aside>

          <section className="results">
            <div className="result-head">
              <div>
                <small>CALCULATED BACKTEST</small>
                <h1>{current.code} · 기존 고저가 돌파 전략 (강의 전략과 별개)</h1>
                <p>
                  {backtestData.length.toLocaleString()}개{' '}
                  {timeframeLabels[appliedBacktestTimeframe]} · Lookback{' '}
                  {appliedBacktest.lookback}봉 (
                  {formatLookbackDuration(
                    appliedBacktest.lookback,
                    appliedBacktestTimeframe,
                  )}
                  ) · 비용 반영 · 미래 데이터 참조 없이 순차 계산
                </p>
              </div>
              <div className="result-actions">
                <span className="complete">실제 계산값</span>
                <button
                  onClick={exportTrades}
                  disabled={!result.tradeLog.length}
                >
                  <Download size={15} /> 거래 CSV
                </button>
              </div>
            </div>
            <div className="stat-grid">
              {[
                [
                  '총 수익률',
                  `${result.returnPct >= 0 ? '+' : ''}${result.returnPct.toFixed(1)}%`,
                  result.returnPct >= 0 ? 'positive' : 'negative',
                ],
                ['승률', `${result.winRate.toFixed(1)}%`, ''],
                ['Profit Factor', result.profitFactor.toFixed(2), ''],
                ['최대 낙폭', `${result.maxDrawdown.toFixed(1)}%`, 'negative'],
                [
                  '평균 기대값',
                  `${result.avgRR.toFixed(2)}R`,
                  result.avgRR >= 0 ? 'positive' : 'negative',
                ],
                ['총 거래', `${result.trades}회`, ''],
              ].map((stat) => (
                <div className="stat" key={stat[0]}>
                  <small>{stat[0]}</small>
                  <strong className={stat[2]}>{stat[1]}</strong>
                </div>
              ))}
            </div>
            <div className="panel trade-chart-panel" id="backtest-trade-chart">
              <div className="panel-title">
                <span>진입·청산 검증 차트</span>
                <small>
                  {selectedTrade
                    ? `거래 #${selectedTrade.id} · ${timeframeLabels[appliedBacktestTimeframe]}`
                    : '체결 거래 없음'}
                </small>
              </div>
              <BacktestTradeChart
                data={backtestData}
                trades={result.tradeLog}
                selectedTrade={selectedTrade}
                market={market}
                onSelect={setSelectedTradeId}
              />
            </div>
            <div className="panel equity">
              <div className="panel-title">
                <span>자산 곡선</span>
                <small>
                  {formatMoney(appliedBacktest.initialCapital, market)} →{' '}
                  {formatMoney(result.endingCapital, market)}
                </small>
              </div>
              <Equity values={result.equity} />
            </div>
            <div className="insight-row">
              <div className="panel">
                <TrendingUp />
                <div>
                  <strong>Buy & Hold 비교</strong>
                  <p>
                    동일 기간 {result.buyHold >= 0 ? '+' : ''}
                    {result.buyHold.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="panel">
                <BarChart3 />
                <div>
                  <strong>거래 비용</strong>
                  <p>총 {formatMoney(result.totalFees, market)} 반영</p>
                </div>
              </div>
            </div>
            <div className="panel trades-panel">
              <div className="panel-title">
                <span>거래 기록</span>
                <small>최근 {Math.min(result.tradeLog.length, 12)}건</small>
              </div>
              {result.tradeLog.length ? (
                <div className="trades-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>방향</th>
                        <th>진입</th>
                        <th>진입 근거</th>
                        <th>청산</th>
                        <th>손익</th>
                        <th>R</th>
                        <th>청산 근거</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.tradeLog
                        .slice(-12)
                        .reverse()
                        .map((trade) => (
                          <tr
                            key={trade.id}
                            className={
                              selectedTrade?.id === trade.id ? 'selected' : ''
                            }
                            tabIndex={0}
                            onClick={() => {
                              setSelectedTradeId(trade.id);
                              document
                                .getElementById('backtest-trade-chart')
                                ?.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'center',
                                });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelectedTradeId(trade.id);
                              }
                            }}
                          >
                            <td>{trade.id}</td>
                            <td>
                              <span
                                className={
                                  trade.side === 'LONG'
                                    ? 'trade-long'
                                    : 'trade-short'
                                }
                              >
                                {trade.side}
                              </span>
                            </td>
                            <td>
                              <b>{formatPrice(trade.entry, market)}</b>
                              <small>{formatTradeDate(trade.entryDate)}</small>
                            </td>
                            <td className="trade-reason-cell">
                              {describeEntryReason(trade, market)}
                            </td>
                            <td>
                              <b>{formatPrice(trade.exit, market)}</b>
                              <small>{formatTradeDate(trade.exitDate)}</small>
                            </td>
                            <td
                              className={
                                trade.pnl >= 0 ? 'positive' : 'negative'
                              }
                            >
                              {formatMoney(trade.pnl, market)}
                            </td>
                            <td
                              className={
                                trade.rMultiple >= 0 ? 'positive' : 'negative'
                              }
                            >
                              {trade.rMultiple.toFixed(2)}R
                            </td>
                            <td className="trade-reason-cell">
                              {describeExitReason(trade, market)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-trades">
                  현재 조건에서 체결된 거래가 없습니다. Lookback이나 목표 R:R을
                  조정해 다시 실행하세요.
                </div>
              )}
            </div>
          </section>
        </section>
      )}

      <footer>
        <span>STRUCTUREFLOW · 계산 기반 의사결정 지원</span>
        <span>투자 권유 또는 자동 주문 시스템이 아닙니다.</span>
      </footer>


      <Dialog open={Boolean(signalHelp)} onOpenChange={open=>{if(!open)setSignalHelp(null);}}>
        <DialogContent className="entry-reason-dialog signal-help-dialog">
          {signalHelp&&<><DialogHeader><DialogTitle>{signalHelp.title} · 왜 이렇게 판단했나요?</DialogTitle><DialogDescription>{signalHelp.at}에 클릭한 화면의 분석입니다. 아래 내용은 실제 체결 통지가 아닙니다.</DialogDescription></DialogHeader>
          <section><h3>공통 거래 계획과 비교</h3><p>{commonPlan.direction==='SHORT'?'상위 거래 계획은 숏입니다. 하위 봉의 롱 우세는 이 하락 흐름 안의 반등일 수 있으며 별도 롱 진입 허용이 아닙니다.':commonPlan.direction==='LONG'?'상위 거래 계획은 롱입니다. 하위 봉의 숏 우세는 이 상승 흐름 안의 조정일 수 있으며 별도 숏 진입 허용이 아닙니다.':'상위 거래 방향을 아직 확정하지 못했습니다.'}</p><p>{commonPlan.stage}</p></section>
          <section><h3>먼저, 신호의 뜻</h3><p>{signalHelp.direction==='LONG'?'롱은 가격 상승을 예상하는 방향입니다. 현재 선택한 시간대의 구조가 상승 쪽으로 분류되어 이 신호가 표시됐습니다.':signalHelp.direction==='SHORT'?'숏은 가격 하락을 예상하는 방향입니다. 현재 선택한 시간대의 구조가 하락 쪽으로 분류되어 이 신호가 표시됐습니다.':'관망은 현재 구조가 중립이거나 전환 중이어서 한 방향을 정하기 어렵다는 뜻입니다.'}</p><p>‘우세’는 방향이 유리해 보인다는 뜻입니다. 시간대를 선택해도 방향 표시의 뜻은 바뀌지 않습니다. ‘우세’는 모든 진입 조건 충족이나 주문 체결을 의미하지 않습니다.</p></section>
          <section><h3>이 신호의 실제 근거</h3><p><b>고점·저점 순서:</b> {signalHelp.sequence}</p><p>HH는 더 높은 고점, HL은 더 높은 저점, LH는 더 낮은 고점, LL은 더 낮은 저점입니다. 작은 한 봉의 색이 아니라 이 구조의 방향을 봅니다.</p><p><b>최근 구조 사건:</b> {signalHelp.event}</p><p>BOS는 구조 돌파, CHoCH는 반대 방향 전환 경고입니다. 화살표 ↑는 상승, ↓는 하락 방향입니다. 전환 경고만으로 새 추세를 확정하지 않습니다.</p><p><b>보호 수준:</b> {signalHelp.protectedPrice??'미확정'} · <b>약한 극점:</b> {signalHelp.weakPrice??'미확정'}</p><p>보호 수준은 현재 구조가 유지되는지 확인하는 가격, 약한 극점은 추세 방향의 목표 후보입니다. 이 숫자를 자동 계좌의 확정 손절·목표로 바로 사용하지 마세요.</p></section>
          <section><h3>그럼 지금 진입해도 되나요?</h3><p>방향과 진입 허용은 다릅니다. 아래에서 ‘대기’나 ‘충돌’이 남아 있으면 방향 신호만 보고 진입하면 안 됩니다.</p>{signalHelp.steps.map(step=><div className="signal-check" key={step.label}><b>{step.label} · {step.state==='PASS'?'충족':step.state==='BLOCK'?'충돌':'대기'}</b><p>{step.detail}</p></div>)}<p>큰 봉에서 방향·관심 구역을 정하고, 구역 접촉 뒤 작은 봉의 전환과 재접촉을 기다리는 순서입니다. PP는 1시간 내부 방향이 거래 방향과 함께 움직이는지 확인하는 조건입니다.</p></section>
          <section><h3>자동 모의매매와 연결해서 보기</h3><p>위 체크는 대시보드에서 선택한 진입 시간대의 공통 참고 분석입니다. 자동 계좌에서 선택한 1분/5분형의 실제 대기 사유와 저장된 계획을 따로 확인하세요. 새 모델은 15분 손절·4시간 목표를 먼저 정하고, 비용 차감 2R 이상과 위험 한도를 확인합니다. 2R은 계획한 손실 1에 비해 목표 이익이 2라는 의미입니다.</p><p>모든 참고 조건이 충족돼도 시세 지연, 관측 순서, 구역 등급, 수량 등의 검사로 자동 진입이 보류될 수 있습니다. 실제 진입 여부는 모의투자의 체결 기록으로 확인합니다.</p><p><b>현재 데이터 안내:</b> {signalHelp.source}</p><p>예시·지연 데이터의 방향은 실시간 매매 근거로 사용하지 마세요. 팝업은 클릭 시점 내용을 유지하며 최신 판단은 닫고 다시 눌러 확인합니다.</p></section>
          <DialogFooter><button onClick={()=>setSignalHelp(null)}>확인</button></DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedEntryStep)}
        onOpenChange={(open) => {
          if (!open) setSelectedEntryStep(null);
        }}
      >
        <DialogContent className="entry-reason-dialog">
          {selectedEntryStep && (
            <>
              <DialogHeader>
                <div className="entry-reason-heading">
                  <span>{selectedEntryStep.timeframe}</span>
                  <div>
                    <DialogTitle>{selectedEntryStep.label}</DialogTitle>
                    <DialogDescription>
                      {entryLessons[selectedEntryStep.timeframe].role}
                    </DialogDescription>
                  </div>
                  <b className={selectedEntryStep.state.toLowerCase()}>
                    {selectedEntryStep.state === 'PASS'
                      ? '충족'
                      : selectedEntryStep.state === 'BLOCK'
                        ? '차단'
                        : '대기'}
                  </b>
                </div>
              </DialogHeader>

              <div className="entry-reason-current">
                <div>
                  <small>현재 차트 판정</small>
                  <strong>{selectedEntryStep.detail}</strong>
                </div>
                <dl>
                  <div>
                    <dt>추세</dt>
                    <dd>
                      {timeframeSnapshots[selectedEntryStep.timeframe].trend}
                    </dd>
                  </div>
                  <div>
                    <dt>구조 이벤트</dt>
                    <dd>
                      {timeframeSnapshots[selectedEntryStep.timeframe].event}
                    </dd>
                  </div>
                  <div>
                    <dt>구조 점수</dt>
                    <dd>
                      {timeframeSnapshots[selectedEntryStep.timeframe].score}
                      /100
                    </dd>
                  </div>
                </dl>
              </div>

              <section className="entry-reason-section principle">
                <small>STRUCTUREFLOW 판단 기준</small>
                <h3>높은 시간대에서 이야기를 만들고 아래로 좁혀갑니다</h3>
                <p>{entryLessons[selectedEntryStep.timeframe].principle}</p>
              </section>

              <div className="entry-reason-grid">
                <section className="entry-reason-section">
                  <small>왜 지금 이 판정인가</small>
                  <h3>
                    {selectedEntryStep.state === 'PASS'
                      ? '현재 단계의 조건은 확인됐습니다'
                      : selectedEntryStep.state === 'BLOCK'
                        ? '시간대 방향 충돌로 진입하지 않습니다'
                        : '확인 전에는 예측 진입하지 않습니다'}
                  </h3>
                  <p>
                    {selectedEntryStep.state === 'PASS'
                      ? '이 단계는 통과했지만 전체 진입은 4H·1H(PP)·15m·1m의 순서·포함·재접촉과 등급·비용 조건을 확인해야 합니다.'
                      : selectedEntryStep.state === 'BLOCK'
                        ? '상위 편향에 집착하지 않고 하위 구조의 실제 발전을 관찰합니다. 반대 방향이 지속되면 편향 변경도 허용합니다.'
                        : '낮은 시간대가 높은 시간대 편향과 같은 방향으로 정렬되기를 기다린 뒤 진입합니다.'}
                  </p>
                </section>
                <section className="entry-reason-section">
                  <small>확인 체크리스트</small>
                  <ul>
                    {entryLessons[selectedEntryStep.timeframe].checks.map(
                      (check) => (
                        <li key={check}>{check}</li>
                      ),
                    )}
                  </ul>
                </section>
              </div>

              <div className="entry-reason-next">
                <div>
                  <small>다음 확인</small>
                  <p>{entryLessons[selectedEntryStep.timeframe].next}</p>
                </div>
                <div>
                  <small>무효화·재평가</small>
                  <p>{entryLessons[selectedEntryStep.timeframe].invalidation}</p>
                </div>
              </div>

            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={watchlistOpen} onOpenChange={setWatchlistOpen}>
        <DialogContent className="watchlist-dialog">
          <DialogHeader>
            <DialogTitle>실시간 관심종목 설정</DialogTitle>
            <DialogDescription>
              국가별로 최대 3개까지 지정할 수 있습니다. 현재 로그인한
              {` ${viewer.displayName}`} 계정에만 저장됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="watchlist-market-tabs" role="tablist" aria-label="관심종목 국가">
            {(['US', 'KR'] as const).map((tabMarket) => {
              const count = watchlistDraft.filter((entry) => entry.market === tabMarket).length;
              return (
                <button
                  key={tabMarket}
                  type="button"
                  role="tab"
                  aria-selected={watchlistMarket === tabMarket}
                  className={watchlistMarket === tabMarket ? 'active' : ''}
                  onClick={() => { setWatchlistMarket(tabMarket); setWatchlistError(''); }}
                >
                  <span>{tabMarket === 'US' ? 'US 미국' : 'KR 한국'}</span>
                  <small>{count}/3</small>
                </button>
              );
            })}
          </div>
          <div className="watchlist-country-lock">
            <span>{watchlistMarket === 'US' ? '미국 종목만 검색·저장' : '한국 종목만 검색·저장'}</span>
            <small>국가는 현재 탭으로 고정됩니다.</small>
          </div>
          <div className="watchlist-editor">
            {watchlistDraft.map((entry, index) => ({ entry, index }))
              .filter(({ entry }) => entry.market === watchlistMarket)
              .map(({ entry, index }, marketIndex) => (
              <div className="watchlist-editor-row" key={`${entry.market}-${index}`}>
                <span>{marketIndex + 1}</span>
                {entry.market === 'US' ? (
                  <select
                    value={entry.exchange || 'ND'}
                    aria-label={`관심종목 ${index + 1} 미국 거래소`}
                    onChange={(event) =>
                      setWatchlistDraft((draft) =>
                        draft.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                exchange: event.target.value as UsExchange,
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="ND">NASDAQ</option>
                    <option value="NY">NYSE</option>
                    <option value="NA">AMEX</option>
                  </select>
                ) : (
                  <select
                    aria-label={`관심종목 ${index + 1} 한국 거래소`}
                    disabled
                  >
                    <option>KRX</option>
                  </select>
                )}
                <SymbolSearchBox
                  compact
                  market={watchlistMarket}
                  value={entry.ticker}
                  placeholder="한글·영문 종목명 또는 티커"
                  onValueChange={(value) => setWatchlistDraft((draft) => draft.map((item,itemIndex) => itemIndex === index ? {...item,ticker:value.toUpperCase()} : item))}
                  onSelect={(item) => chooseWatchlistSymbol(index,item)}
                />
                <button
                  type="button"
                  disabled={watchlistDraft.length === 1}
                  onClick={() =>
                    setWatchlistDraft((draft) =>
                      draft.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  aria-label={`관심종목 ${index + 1} 삭제`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {!watchlistDraft.some((entry) => entry.market === watchlistMarket) && (
              <div className="watchlist-empty">등록된 {watchlistMarket === 'US' ? '미국' : '한국'} 종목이 없습니다.</div>
            )}
          </div>
          <button
            type="button"
            className="add-watch-symbol"
            disabled={watchlistDraft.length >= MAX_WATCHLIST_SIZE || watchlistDraft.filter((entry) => entry.market === watchlistMarket).length >= MAX_WATCHLIST_PER_MARKET}
            onClick={() =>
              setWatchlistDraft((draft) => [
                ...draft,
                watchlistMarket === 'US'
                  ? { market: 'US', ticker: '', exchange: 'ND' }
                  : { market: 'KR', ticker: '' },
              ])
            }
          >
            <Plus size={14} />
            {watchlistDraft.filter((entry) => entry.market === watchlistMarket).length >= MAX_WATCHLIST_PER_MARKET
              ? `${watchlistMarket === 'US' ? '미국' : '한국'} 3개 등록됨`
              : `${watchlistMarket === 'US' ? '미국' : '한국'} 종목 추가`}
          </button>
          {watchlistError && (
            <p className="watchlist-error">{watchlistError}</p>
          )}
          <div className="watchlist-notice">
            <Wifi size={16} />
            <div>
              <strong>5초마다 시세 확인</strong>
              <p>
                로컬 실행 여부와 관계없이 키움 REST API를 5초 주기로 조회합니다.
                장 마감 중에는 마지막 체결 가격이 유지될 수 있습니다.
              </p>
            </div>
          </div>
          <DialogFooter className="settings-footer">
            <button type="button" className="primary" disabled={watchlistSaving} onClick={() => void saveWatchlist()}>
              {watchlistSaving ? '저장 중…' : '계정에 관심종목 저장'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>위험관리 및 거래비용</DialogTitle>
            <DialogDescription>
              포지션 크기와 백테스트에 사용할 기본값입니다. 이 기기에만
              저장됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="settings-grid">
            <label>
              <span>기준 자본</span>
              <input
                type="number"
                min="100"
                step="100"
                value={settingsDraft.capital}
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    capital: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              <span>거래당 위험 (%)</span>
              <input
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                value={settingsDraft.riskPct}
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    riskPct: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              <span>왕복 계산 수수료 (bp/side)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={settingsDraft.feeBps}
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    feeBps: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              <span>예상 슬리피지 (bp/side)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={settingsDraft.slippageBps}
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    slippageBps: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
          <div className="settings-preview">
            <WalletCards size={18} />
            <div>
              <strong>
                1회 최대 위험{' '}
                {formatMoney(
                  (settingsDraft.capital * settingsDraft.riskPct) / 100,
                  market,
                )}
              </strong>
              <p>백테스트 실행 버튼을 누르면 변경된 비용 설정이 적용됩니다.</p>
            </div>
          </div>
          <DialogFooter className="settings-footer">
            <button
              type="button"
              className="reset-settings"
              onClick={() => setSettingsDraft(DEFAULT_PREFERENCES)}
            >
              기본값 복원
            </button>
            <button type="button" className="primary" onClick={saveSettings}>
              설정 저장
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
