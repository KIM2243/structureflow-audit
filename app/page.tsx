'use client';

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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  Layers3,
  Loader2,
  Plus,
  Play,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
  UploadCloud,
  WalletCards,
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
  resample,
  type Analysis,
  type BacktestDirection,
  type BacktestOptions,
  type BacktestTrade,
  type Candle,
  type Snapshot,
} from '@/lib/engine';

type Market = 'US' | 'KR';
type Timeframe = '5m' | '15m' | '1H' | '4H' | '1D';
type LayerKey =
  | 'structure'
  | 'volumeProfile'
  | 'orderflow'
  | 'liquidity'
  | 'forecast';

type SymbolItem = {
  code: string;
  feed: string;
  name: string;
  currency: '$' | '₩';
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
};

type WatchlistEntry = {
  market: Market;
  ticker: string;
};

type LiveQuote = {
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  timestamp: string;
  marketState: string;
  candle: Candle;
};

type QuotesResponse = {
  error?: string;
  quotes?: LiveQuote[];
  errors?: Array<{ symbol: string; error: string }>;
  fetchedAt?: string;
  refreshAfterSeconds?: number;
};

type WatchedSymbol = SymbolItem & { market: Market };

const symbols: Record<Market, SymbolItem[]> = {
  US: [
    { code: 'ONDS', feed: 'ONDS', name: 'Ondas Holdings', currency: '$' },
    { code: 'NVDA', feed: 'NVDA', name: 'NVIDIA', currency: '$' },
    { code: 'TSLA', feed: 'TSLA', name: 'Tesla', currency: '$' },
  ],
  KR: [
    { code: '005930', feed: '005930.KS', name: '삼성전자', currency: '₩' },
    { code: '000660', feed: '000660.KS', name: 'SK하이닉스', currency: '₩' },
    { code: '035420', feed: '035420.KS', name: 'NAVER', currency: '₩' },
  ],
};

const DEFAULT_WATCHLIST: WatchlistEntry[] = [
  { market: 'US', ticker: 'ONDS' },
  { market: 'US', ticker: 'NVDA' },
  { market: 'US', ticker: 'TSLA' },
];

const timeframeSizes: Record<Timeframe, number> = {
  '5m': 1,
  '15m': 3,
  '1H': 12,
  '4H': 48,
  '1D': 78,
};

const timeframeLabels: Record<Timeframe, string> = {
  '5m': '5분봉',
  '15m': '15분봉',
  '1H': '1시간봉',
  '4H': '4시간봉',
  '1D': '일봉',
};

const timeframeButtonLabels: Record<Timeframe, string> = {
  '5m': '5분',
  '15m': '15분',
  '1H': '1시간',
  '4H': '4시간',
  '1D': '일봉',
};

const backtestTimeframes: Timeframe[] = ['5m', '15m', '1H', '4H', '1D'];

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
    return {
      market: 'US',
      code: ticker,
      feed: ticker,
      name: known?.name || ticker,
      currency: '$',
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

function loadWatchlist() {
  if (typeof window === 'undefined') return DEFAULT_WATCHLIST;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem('structureflow:watchlist') || '[]',
    ) as WatchlistEntry[];
    const valid = saved
      .slice(0, 3)
      .filter((entry) => normalizeWatchlistEntry(entry));
    return valid.length ? valid : DEFAULT_WATCHLIST;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

function marketStateLabel(state: string) {
  if (state === 'REGULAR') return '장중';
  if (state === 'PRE') return '프리마켓';
  if (state === 'POST' || state === 'POSTPOST') return '애프터마켓';
  if (state === 'CLOSED') return '장 종료';
  return '시세 수신';
}

function mergeLiveCandle(candles: Candle[], quote: LiveQuote) {
  if (!candles.length) return candles;
  const quoteTime = Date.parse(quote.timestamp);
  const lastTime = Date.parse(candles.at(-1)!.date);
  if (!Number.isFinite(quoteTime) || !Number.isFinite(lastTime)) return candles;

  const bucketMs = 5 * 60 * 1_000;
  const quoteBucket = Math.floor(quoteTime / bucketMs) * bucketMs;
  const lastBucket = Math.floor(lastTime / bucketMs) * bucketMs;
  if (quoteBucket < lastBucket) return candles;

  const liveHigh = Math.max(quote.price, quote.candle.high);
  const liveLow = Math.min(quote.price, quote.candle.low);
  if (quoteBucket === lastBucket) {
    const next = [...candles];
    const last = next.at(-1)!;
    next[next.length - 1] = {
      ...last,
      high: Math.max(last.high, liveHigh),
      low: Math.min(last.low, liveLow),
      close: quote.price,
      volume: Math.max(last.volume, quote.candle.volume),
    };
    return next;
  }

  const previousClose = candles.at(-1)!.close;
  return [
    ...candles.slice(-1_999),
    {
      date: new Date(quoteBucket).toISOString(),
      open: previousClose,
      high: Math.max(previousClose, liveHigh),
      low: Math.min(previousClose, liveLow),
      close: quote.price,
      volume: quote.candle.volume,
    },
  ];
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

function demo(base = 10, count = 1_200): Candle[] {
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
      date: new Date(Date.now() - (count - index) * 300_000).toISOString(),
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
const MIN_CHART_BARS = 18;
const MAX_CHART_BARS = 360;

function clampChartValue(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
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
) {
  const gap = 19;
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

function PriceChart({
  data,
  analysis,
  market,
  timeframe,
  layers,
  seriesKey,
}: {
  data: Candle[];
  analysis: Analysis;
  market: Market;
  timeframe: Timeframe;
  layers: Record<LayerKey, boolean>;
  seriesKey: string;
}) {
  const defaultBars = Math.min(DEFAULT_CHART_BARS, Math.max(1, data.length));
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
          bars: Math.min(DEFAULT_CHART_BARS, Math.max(1, data.length)),
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
  }, [data.length, seriesKey]);

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
      bars: Math.min(DEFAULT_CHART_BARS, Math.max(1, data.length)),
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

  const width = 900;
  const height = 350;
  const padding = 28;
  const labelRailWidth = 132;
  const plotRight = width - padding - labelRailWidth;
  const chartBottom = height - padding;
  const visibleZones = [
    ...analysis.orderBlocks,
    ...analysis.fairValueGaps,
  ].filter((zone) => zone.endIndex >= offset && zone.startIndex < endIndex);
  const visibleLiquidity = analysis.liquidity.filter(
    (level) => level.index >= offset && level.index < endIndex,
  );
  const showForecast = layers.forecast && isViewingLatest;
  const candleMaximum = Math.max(...displayed.map((candle) => candle.high));
  const candleMinimum = Math.min(...displayed.map((candle) => candle.low));
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
      ? [analysis.entry[0], analysis.entry[1], analysis.stop, analysis.target]
      : []),
  ].filter((value) => value >= autoFitMinimum && value <= autoFitMaximum);
  const fittedMaximum = Math.max(candleMaximum, ...nearbyOverlayValues);
  const fittedMinimum = Math.min(candleMinimum, ...nearbyOverlayValues);
  const fittedSpan = Math.max(fittedMaximum - fittedMinimum, visiblePriceSpan);
  const verticalPadding = fittedSpan * 0.12;
  const maximum = fittedMaximum + verticalPadding;
  const minimum = fittedMinimum - verticalPadding;
  const isPriceOnScale = (value: number) =>
    value >= minimum && value <= maximum;
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
  const profileMaximum = Math.max(...analysis.profile, 1);
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
      ...(showForecast
        ? [
            {
              key: 'forecast-entry',
              label: `진입 ${formatPrice(analysis.entryForecast.trigger, market)}`,
              value: analysis.entryForecast.trigger,
              tone: 'entry' as const,
            },
            {
              key: 'forecast-stop',
              label: `무효화 ${formatPrice(analysis.stop, market)}`,
              value: analysis.stop,
              tone: 'stop' as const,
            },
            {
              key: 'forecast-target',
              label: `목표 ${formatPrice(analysis.target, market)}`,
              value: analysis.target,
              tone: 'target' as const,
            },
          ]
        : []),
    ],
    y,
    padding + 8,
    chartBottom - 8,
  );
  const structurePivots = selectChartPivots(
    analysis.pivots,
    offset,
    endIndex,
    displayed.length,
  );

  return (
    <div className="chart-wrap">
      <div className="chart-badges">
        <span>{timeframe}</span>
        <span className="soft">OHLCV · {displayed.length}봉</span>
        <span className="soft">
          {isViewingLatest ? '최신 구간' : `${offset + 1}–${endIndex}봉`}
        </span>
        <span className="soft">Y축 · 화면 맞춤</span>
        {layers.orderflow && (
          <span className="soft">
            OB/FVG · {visibleZones.filter((zone) => zone.active).length}
          </span>
        )}
        {layers.liquidity && (
          <span className="soft">Liquidity · {visibleLiquidity.length}</span>
        )}
        {layers.forecast && (
          <span
            className={`forecast-badge ${analysis.entryForecast.status.toLowerCase()}`}
          >
            {showForecast
              ? `진입 예측 · ${analysis.entryForecast.status}`
              : '진입 예측 · 최신 구간에서 표시'}
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
          title="120봉 최신 구간으로 초기화"
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
        {[0, 1, 2, 3, 4].map((index) => (
          <line
            key={index}
            x1={padding}
            x2={plotRight}
            y1={padding + (index * (height - padding * 2)) / 4}
            y2={padding + (index * (height - padding * 2)) / 4}
            className="gridline"
          />
        ))}
        {showForecast && (
          <g className="entry-forecast-layer">
            <rect
              x={x(Math.max(0, displayed.length - 46))}
              y={Math.min(
                clampedY(analysis.entry[0]),
                clampedY(analysis.entry[1]),
              )}
              width={plotRight - x(Math.max(0, displayed.length - 46))}
              height={Math.max(
                2,
                Math.abs(
                  clampedY(analysis.entry[0]) - clampedY(analysis.entry[1]),
                ),
              )}
              className="entry-forecast-zone"
            />
            <line
              x1={x(Math.max(0, displayed.length - 46))}
              x2={plotRight}
              y1={clampedY(analysis.entryForecast.trigger)}
              y2={clampedY(analysis.entryForecast.trigger)}
              className="entry-trigger-line"
            />
            <line
              x1={x(Math.max(0, displayed.length - 46))}
              x2={plotRight}
              y1={clampedY(analysis.stop)}
              y2={clampedY(analysis.stop)}
              className="entry-invalidation-line"
            />
            <line
              x1={x(Math.max(0, displayed.length - 46))}
              x2={plotRight}
              y1={clampedY(analysis.target)}
              y2={clampedY(analysis.target)}
              className="entry-target-line"
            />
          </g>
        )}
        {layers.orderflow &&
          scaledZones.map((zone) => {
            const start = Math.max(0, zone.startIndex - offset);
            const zoneClass = zone.kind.toLowerCase().replace('_', '-');
            return (
              <g
                key={`${zone.kind}-${zone.startIndex}`}
                opacity={zone.active ? 1 : 0.35}
              >
                <rect
                  x={x(start)}
                  y={clampedY(zone.high)}
                  width={Math.max(20, plotRight - x(start))}
                  height={Math.max(2, clampedY(zone.low) - clampedY(zone.high))}
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
                height={Math.max(1, Math.abs(y(candle.open) - y(candle.close)))}
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
        {layers.structure &&
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
              <title>
                {pivot.label} · {formatPrice(pivot.price, market)} ·{' '}
                {data[pivot.index]?.date.slice(0, 16)}
              </title>
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
                {level.kind === 'BUY_SIDE' ? 'BSL' : 'SSL'} ×{level.touches}
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
            const railEnd = width - padding;
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
                >
                  {edgePrefix}
                  {label.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
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

export default function Home() {
  const [market, setMarket] = useState<Market>('US');
  const [symbol, setSymbol] = useState('ONDS');
  const [tab, setTab] = useState<'analysis' | 'backtest'>('analysis');
  const [data, setData] = useState<Candle[]>(() => demo());
  const [status, setStatus] = useState('예시 데이터 · 종목을 불러오세요');
  const [loading, setLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    structure: true,
    volumeProfile: true,
    orderflow: false,
    liquidity: false,
    forecast: true,
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(loadWatchlist);
  const [watchlistDraft, setWatchlistDraft] =
    useState<WatchlistEntry[]>(loadWatchlist);
  const [watchlistError, setWatchlistError] = useState('');
  const [liveQuotes, setLiveQuotes] = useState<Record<string, LiveQuote>>({});
  const [liveErrors, setLiveErrors] = useState<Record<string, string>>({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState('');
  const [liveError, setLiveError] = useState('');
  const [loadedFeed, setLoadedFeed] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [settingsDraft, setSettingsDraft] =
    useState<Preferences>(loadPreferences);
  const [lookback, setLookback] = useState(20);
  const [rewardRisk, setRewardRisk] = useState(2);
  const [direction, setDirection] = useState<BacktestDirection>('BOTH');
  const [backtestTimeframe, setBacktestTimeframe] = useState<Timeframe>('5m');
  const [appliedBacktestTimeframe, setAppliedBacktestTimeframe] =
    useState<Timeframe>('5m');
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [appliedBacktest, setAppliedBacktest] = useState<BacktestOptions>(
    () => ({
      minRR: 2,
      lookback: 20,
      initialCapital: loadPreferences().capital,
      riskPct: loadPreferences().riskPct,
      feeBps: loadPreferences().feeBps,
      slippageBps: loadPreferences().slippageBps,
      direction: 'BOTH',
    }),
  );
  const [lastRun, setLastRun] = useState('초기 계산');
  const fileInput = useRef<HTMLInputElement>(null);
  const liveRequestInFlight = useRef(false);
  const initialLoadStarted = useRef(false);

  const watchedSymbols = useMemo(
    () =>
      watchlist
        .map(normalizeWatchlistEntry)
        .filter((item): item is WatchedSymbol => Boolean(item)),
    [watchlist],
  );
  const availableSymbols = useMemo(() => {
    const byFeed = new Map<string, SymbolItem>();
    for (const item of symbols[market]) byFeed.set(item.feed, item);
    for (const item of watchedSymbols) {
      if (item.market !== market) continue;
      byFeed.set(item.feed, {
        ...item,
        name: liveQuotes[item.feed]?.name || item.name,
      });
    }
    return Array.from(byFeed.values());
  }, [liveQuotes, market, watchedSymbols]);
  const current =
    availableSymbols.find((item) => item.code === symbol) ??
    availableSymbols[0];
  const baseAnalysis = useMemo(() => analyze(data), [data]);
  const chartData = useMemo(
    () => resample(data, timeframeSizes[timeframe]),
    [data, timeframe],
  );
  const analysisData = chartData.length >= 20 ? chartData : data;
  const analysis = useMemo(() => analyze(analysisData), [analysisData]);
  const draftBacktestData = useMemo(
    () => resample(data, timeframeSizes[backtestTimeframe]),
    [backtestTimeframe, data],
  );
  const backtestData = useMemo(
    () => resample(data, timeframeSizes[appliedBacktestTimeframe]),
    [appliedBacktestTimeframe, data],
  );
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
  const activeLiveQuote = liveQuotes[current.feed];
  const displayedPrice = activeLiveQuote?.price ?? last;
  const entryMidpoint = (analysis.entry[0] + analysis.entry[1]) / 2;
  const unitRisk = Math.max(Math.abs(entryMidpoint - analysis.stop), 0.000001);
  const riskBudget = preferences.capital * (preferences.riskPct / 100);
  const positionSize = Math.max(0, Math.floor(riskBudget / unitRisk));
  const positionNotional = positionSize * entryMidpoint;

  const loadMarketData = useCallback(async (item: SymbolItem) => {
    setLoading(true);
    setStatus(`${item.code} 분석 데이터 불러오는 중…`);
    try {
      const response = await fetch(
        `/api/market?symbol=${encodeURIComponent(item.feed)}`,
      );
      const payload = (await response.json()) as MarketResponse;
      if (!response.ok)
        throw new Error(
          payload.error || `데이터 제공처 오류 ${response.status}`,
        );
      if (!payload.candles || payload.candles.length < 40) {
        throw new Error('분석 가능한 데이터가 부족합니다.');
      }
      setData(payload.candles);
      setLoadedFeed(item.feed);
      setStatus(
        `${payload.name || item.name} · ${payload.source || '시장 데이터'} · ${payload.candles.length.toLocaleString()}개 캔들 · ${new Date(payload.fetchedAt || Date.now()).toLocaleString('ko-KR')}`,
      );
    } catch (error) {
      setStatus(
        `불러오기 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'} · CSV를 사용할 수 있습니다.`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLiveQuotes = useCallback(async () => {
    if (!watchedSymbols.length || liveRequestInFlight.current) return;
    liveRequestInFlight.current = true;
    setLiveLoading(true);
    try {
      const feeds = watchedSymbols.map((item) => item.feed).join(',');
      const response = await fetch(
        `/api/quotes?symbols=${encodeURIComponent(feeds)}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as QuotesResponse;
      const errors = Object.fromEntries(
        (payload.errors || []).map((item) => [item.symbol, item.error]),
      );
      setLiveErrors(errors);
      if (!response.ok && !payload.quotes?.length) {
        throw new Error(payload.error || '실시간 시세를 받지 못했습니다.');
      }

      const quotes = payload.quotes || [];
      setLiveQuotes((previous) => ({
        ...previous,
        ...Object.fromEntries(quotes.map((quote) => [quote.symbol, quote])),
      }));
      setLiveUpdatedAt(payload.fetchedAt || new Date().toISOString());
      setLiveError('');

      const activeQuote = quotes.find((quote) => quote.symbol === current.feed);
      if (activeQuote && loadedFeed === current.feed) {
        setData((candles) => mergeLiveCandle(candles, activeQuote));
      }
    } catch (error) {
      setLiveError(
        error instanceof Error ? error.message : '실시간 시세 연결 오류',
      );
    } finally {
      setLiveLoading(false);
      liveRequestInFlight.current = false;
    }
  }, [current.feed, loadedFeed, watchedSymbols]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshLiveQuotes();
    }, 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshLiveQuotes();
    }, 5_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refreshLiveQuotes]);

  useEffect(() => {
    if (initialLoadStarted.current || !watchedSymbols.length) return;
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
  }, [current.feed, loadMarketData, watchedSymbols]);

  const chooseMarket = (nextMarket: Market) => {
    setMarket(nextMarket);
    const next = symbols[nextMarket][0];
    setSymbol(next.code);
    setStatus('종목 선택 후 데이터 불러오기를 누르세요');
  };

  const chooseSymbol = (code: string) => {
    setSymbol(code);
    setStatus('데이터 불러오기를 누르세요');
  };

  const activateWatchedSymbol = (item: WatchedSymbol) => {
    setMarket(item.market);
    setSymbol(item.code);
    void loadMarketData(item);
  };

  const openWatchlistSettings = () => {
    setWatchlistDraft(watchlist.length ? watchlist : DEFAULT_WATCHLIST);
    setWatchlistError('');
    setWatchlistOpen(true);
  };

  const saveWatchlist = () => {
    const cleaned = watchlistDraft
      .map((entry) => ({ ...entry, ticker: entry.ticker.trim().toUpperCase() }))
      .filter((entry) => entry.ticker);
    const normalized = cleaned.map(normalizeWatchlistEntry);
    if (cleaned.length < 1 || cleaned.length > 3) {
      setWatchlistError('관심종목은 1개에서 3개까지 지정할 수 있습니다.');
      return;
    }
    if (normalized.some((item) => !item)) {
      setWatchlistError(
        '미국은 영문 티커, 한국은 6자리 코드 또는 .KS/.KQ 형식으로 입력하세요.',
      );
      return;
    }
    const feeds = normalized.map((item) => item!.feed);
    if (new Set(feeds).size !== feeds.length) {
      setWatchlistError('같은 종목이 중복되어 있습니다.');
      return;
    }

    const saved = normalized.map((item) => ({
      market: item!.market,
      ticker: item!.feed,
    }));
    setWatchlist(saved);
    setLiveQuotes({});
    setLiveErrors({});
    window.localStorage.setItem(
      'structureflow:watchlist',
      JSON.stringify(saved),
    );
    setWatchlistOpen(false);
    setStatus('실시간 관심종목을 저장했습니다.');
  };

  const uploadCsv = async (file?: File) => {
    if (!file) return;
    try {
      const candles = parseCsv(await file.text());
      if (candles.length < 20) throw new Error('최소 20개 캔들이 필요합니다.');
      setData(candles);
      setLoadedFeed(null);
      setTimeframe('5m');
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
    const availableBars = resample(data, timeframeSizes[nextTimeframe]).length;
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

  const timeframeRows = Object.entries(baseAnalysis.snapshots) as Array<
    [Timeframe, Snapshot]
  >;
  const layerOptions: Array<{ key: LayerKey; label: string }> = [
    { key: 'structure', label: '구조' },
    { key: 'volumeProfile', label: 'VP' },
    { key: 'orderflow', label: 'OB/FVG' },
    { key: 'liquidity', label: '유동성' },
    { key: 'forecast', label: '진입예측' },
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
            className={tab === 'backtest' ? 'active' : ''}
            onClick={() => setTab('backtest')}
          >
            백테스트
          </button>
        </nav>
        <div className="top-actions">
          <button
            className="icon-btn"
            onClick={openSettings}
            aria-label="위험관리 설정 열기"
          >
            <Settings2 size={17} />
          </button>
          <button
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
        </div>
      </header>

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
        <label className="symbol-picker">
          <Search size={16} />
          <select
            value={symbol}
            onChange={(event) => chooseSymbol(event.target.value)}
            aria-label="종목 선택"
          >
            {availableSymbols.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} />
        </label>
        <button
          className="primary"
          onClick={() => loadMarketData(current)}
          disabled={loading}
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
            {current.currency}
            {formatPrice(displayedPrice, market)}
          </strong>
          {activeLiveQuote ? (
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
            <span>LIVE WATCH</span>
          </div>
          <small>
            {liveUpdatedAt
              ? `${new Date(liveUpdatedAt).toLocaleTimeString('ko-KR')} 갱신`
              : '연결 중'}
          </small>
        </div>
        <div className="live-watch-cards">
          {watchedSymbols.map((item) => {
            const quote = liveQuotes[item.feed];
            const quoteError = liveErrors[item.feed];
            return (
              <button
                type="button"
                key={item.feed}
                className={current.feed === item.feed ? 'selected' : ''}
                onClick={() => activateWatchedSymbol(item)}
              >
                <div>
                  <b>{item.code}</b>
                  <span className={quote ? 'connected' : 'waiting'}>
                    {quote ? marketStateLabel(quote.marketState) : '대기'}
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
                    <small>{quote.name}</small>
                  </>
                ) : (
                  <>
                    <strong>--</strong>
                    <em className="quote-error">
                      {quoteError || liveError || '시세 수신 중'}
                    </em>
                    <small>{item.name}</small>
                  </>
                )}
              </button>
            );
          })}
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
          <small>5초 자동 갱신 · 제공처 지연 가능</small>
        </div>
      </section>

      {tab === 'analysis' ? (
        <>
          <section className="decision-strip">
            <div
              className="score-ring"
              style={{
                background: `radial-gradient(circle,#0d131b 55%,transparent 57%),conic-gradient(var(--green) ${analysis.score}%,#252d38 0)`,
              }}
            >
              <b>{analysis.score}</b>
              <span>/100</span>
            </div>
            <div className="directive">
              <div>
                <i /> {analysis.bias} · 신뢰도 {analysis.confidence}% ·{' '}
                {timeframe}
              </div>
              <h1>
                {analysis.entryForecast.status === 'READY'
                  ? '진입 조건 충족'
                  : analysis.entryForecast.status === 'WAIT'
                    ? '예측 구간 대기'
                    : '진입 보류'}
              </h1>
              <p>
                {baseAnalysis.snapshots[timeframe].event} ·
                구조·위치·추세·손익비 조건부 예측
              </p>
            </div>
            <div className="metric">
              <small>예측 진입 구간</small>
              <strong>
                {current.currency}
                {formatPrice(analysis.entry[0], market)} –{' '}
                {formatPrice(analysis.entry[1], market)}
              </strong>
              <span>
                현재가 대비 {analysis.entryForecast.distancePct >= 0 ? '+' : ''}
                {analysis.entryForecast.distancePct.toFixed(2)}%
              </span>
            </div>
            <div className="metric danger">
              <small>손절 / 무효화</small>
              <strong>
                {current.currency}
                {formatPrice(analysis.stop, market)}
              </strong>
              <span>{analysis.atr.toFixed(2)} ATR 기준</span>
            </div>
            <div className="metric">
              <small>목표가</small>
              <strong>
                {current.currency}
                {formatPrice(analysis.target, market)}
              </strong>
              <span>구조 목표 · {analysis.rr.toFixed(1)}R</span>
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
                <small>클릭하여 차트 전환</small>
              </div>
              {timeframeRows.map(([name, snapshot]) => (
                <button
                  className={`tf-row ${timeframe === name ? 'selected' : ''}`}
                  key={name}
                  onClick={() => setTimeframe(name)}
                  aria-pressed={timeframe === name}
                >
                  <div>
                    <b>{name}</b>
                    <em
                      className={
                        snapshot.trend === 'BULLISH'
                          ? 'bull'
                          : snapshot.trend === 'BEARISH'
                            ? 'wait'
                            : 'trans'
                      }
                    >
                      {snapshot.trend}
                    </em>
                  </div>
                  <strong>{snapshot.sequence}</strong>
                  <span>{snapshot.event}</span>
                  <i>{snapshot.score}</i>
                </button>
              ))}
              <div className="wyckoff">
                <small>VOLUME / WYCKOFF 단서</small>
                <strong>
                  {analysis.bias === 'LONG'
                    ? 'Accumulation / LPS 후보'
                    : 'Distribution / LPSY 후보'}
                </strong>
                <p>
                  구조와 거래량 프로파일 기반 가설이며 확정 판정이 아닙니다.
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
                <PriceChart
                  data={analysisData}
                  analysis={analysis}
                  market={market}
                  timeframe={timeframe}
                  layers={layers}
                  seriesKey={`${market}-${current.code}-${timeframe}`}
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
              <article className="plan early forecast-plan">
                <header>
                  <span>
                    <Zap size={15} /> 조건부 진입 예측
                  </span>
                  <b
                    className={`forecast-status ${analysis.entryForecast.status.toLowerCase()}`}
                  >
                    {analysis.entryForecast.status === 'READY'
                      ? '조건 충족'
                      : analysis.entryForecast.status === 'WAIT'
                        ? '대기'
                        : '보류'}
                  </b>
                </header>
                <h3>
                  {current.currency}
                  {formatPrice(analysis.entry[0], market)} –{' '}
                  {formatPrice(analysis.entry[1], market)}
                </h3>
                <p>구조 + Value Area + 20봉 추세 + ATR 기반</p>
                <ul className="forecast-reasons">
                  {analysis.entryForecast.reasons.map((reason) => (
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
                    <dd>{formatPrice(analysis.stop, market)}</dd>
                  </div>
                  <div>
                    <dt>목표</dt>
                    <dd>{formatPrice(analysis.target, market)}</dd>
                  </div>
                  <div>
                    <dt>R:R</dt>
                    <dd className="positive">{analysis.rr.toFixed(1)}R</dd>
                  </div>
                </dl>
              </article>
              <article className="plan confirm">
                <header>
                  <span>
                    <Target size={15} /> 확인 진입
                  </span>
                  <b>{analysis.score >= 70 ? '후보' : '대기'}</b>
                </header>
                <h3>{baseAnalysis.snapshots[timeframe].event}</h3>
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
                  <b>{baseAnalysis.snapshots['1D'].score}/100</b>
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
      ) : (
        <section className="backtest-layout">
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
                원본 5분봉을 {timeframeLabels[backtestTimeframe]}으로 묶어 계산
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
                <h1>{current.code} · 구조 돌파 전략</h1>
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

      <Dialog open={watchlistOpen} onOpenChange={setWatchlistOpen}>
        <DialogContent className="watchlist-dialog">
          <DialogHeader>
            <DialogTitle>실시간 관심종목 설정</DialogTitle>
            <DialogDescription>
              자동 갱신할 종목을 1개에서 3개까지 지정하세요. 미국은 영문 티커,
              한국은 6자리 종목 코드를 입력하면 됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="watchlist-editor">
            {watchlistDraft.map((entry, index) => (
              <div className="watchlist-editor-row" key={index}>
                <span>{index + 1}</span>
                <select
                  value={entry.market}
                  aria-label={`관심종목 ${index + 1} 시장`}
                  onChange={(event) =>
                    setWatchlistDraft((draft) =>
                      draft.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              market: event.target.value as Market,
                              ticker: '',
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="US">미국</option>
                  <option value="KR">한국</option>
                </select>
                <input
                  value={entry.ticker}
                  placeholder={
                    entry.market === 'US' ? '예: AAPL' : '예: 005930'
                  }
                  aria-label={`관심종목 ${index + 1} 코드`}
                  maxLength={entry.market === 'US' ? 10 : 9}
                  onChange={(event) =>
                    setWatchlistDraft((draft) =>
                      draft.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              ticker: event.target.value.toUpperCase(),
                            }
                          : item,
                      ),
                    )
                  }
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
          </div>
          <button
            type="button"
            className="add-watch-symbol"
            disabled={watchlistDraft.length >= 3}
            onClick={() =>
              setWatchlistDraft((draft) => [...draft, { market, ticker: '' }])
            }
          >
            <Plus size={14} /> 종목 추가
          </button>
          {watchlistError && (
            <p className="watchlist-error">{watchlistError}</p>
          )}
          <div className="watchlist-notice">
            <Wifi size={16} />
            <div>
              <strong>5초 자동 갱신</strong>
              <p>
                데이터 제공처의 무료 시세를 사용하므로 거래소 상황에 따라 지연될
                수 있습니다.
              </p>
            </div>
          </div>
          <DialogFooter className="settings-footer">
            <button type="button" className="primary" onClick={saveWatchlist}>
              관심종목 저장
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
