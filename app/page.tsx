'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  ChevronDown,
  CircleAlert,
  Database,
  Download,
  Layers3,
  Loader2,
  Play,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UploadCloud,
  WalletCards,
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
  type Candle,
  type Snapshot,
} from '@/lib/engine';

type Market = 'US' | 'KR';
type Timeframe = '15m' | '1H' | '4H' | '1D';
type LayerKey = 'structure' | 'volumeProfile' | 'orderflow' | 'liquidity';

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
  source?: string;
  fetchedAt?: string;
  candles?: Candle[];
};

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

const timeframeSizes: Record<Timeframe, number> = {
  '15m': 1,
  '1H': 4,
  '4H': 16,
  '1D': 26,
};

const timeframeLabels: Record<Timeframe, string> = {
  '15m': '15분봉',
  '1H': '1시간봉',
  '4H': '4시간봉',
  '1D': '일봉',
};

const timeframeButtonLabels: Record<Timeframe, string> = {
  '15m': '15분',
  '1H': '1시간',
  '4H': '4시간',
  '1D': '일봉',
};

const backtestTimeframes: Timeframe[] = ['15m', '1H', '4H', '1D'];

const DEFAULT_PREFERENCES: Preferences = {
  capital: 10_000,
  riskPct: 1,
  feeBps: 5,
  slippageBps: 3,
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function formatLookbackDuration(bars: number, timeframe: Timeframe) {
  if (timeframe === '1D') return `${bars}거래일`;

  const minutes = bars * timeframeSizes[timeframe] * 15;
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
      date: new Date(Date.now() - (count - index) * 900_000).toISOString(),
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

function PriceChart({
  data,
  analysis,
  market,
  timeframe,
  layers,
}: {
  data: Candle[];
  analysis: Analysis;
  market: Market;
  timeframe: Timeframe;
  layers: Record<LayerKey, boolean>;
}) {
  const displayed = data.slice(-120);
  const width = 900;
  const height = 350;
  const padding = 28;
  const offset = Math.max(0, data.length - displayed.length);
  const visibleZones = [
    ...analysis.orderBlocks,
    ...analysis.fairValueGaps,
  ].filter((zone) => zone.endIndex >= offset);
  const extraHighs = [
    ...(layers.volumeProfile ? [analysis.vah] : []),
    ...(layers.orderflow ? visibleZones.map((zone) => zone.high) : []),
    ...(layers.liquidity ? analysis.liquidity.map((level) => level.price) : []),
  ];
  const extraLows = [
    ...(layers.volumeProfile ? [analysis.val] : []),
    ...(layers.orderflow ? visibleZones.map((zone) => zone.low) : []),
    ...(layers.liquidity ? analysis.liquidity.map((level) => level.price) : []),
  ];
  const maximum = Math.max(
    ...displayed.map((candle) => candle.high),
    ...extraHighs,
  );
  const minimum = Math.min(
    ...displayed.map((candle) => candle.low),
    ...extraLows,
  );
  const x = (index: number) =>
    padding +
    (index / Math.max(displayed.length - 1, 1)) * (width - padding * 2);
  const y = (value: number) =>
    padding +
    ((maximum - value) / Math.max(maximum - minimum, 1)) *
      (height - padding * 2);
  const profileMaximum = Math.max(...analysis.profile, 1);

  return (
    <div className="chart-wrap">
      <div className="chart-badges">
        <span>{timeframe}</span>
        <span className="soft">OHLCV · {displayed.length} bars</span>
        {layers.orderflow && (
          <span className="soft">
            OB/FVG · {visibleZones.filter((zone) => zone.active).length}
          </span>
        )}
        {layers.liquidity && (
          <span className="soft">Liquidity · {analysis.liquidity.length}</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        aria-label={`${timeframe} 가격 구조 차트`}
      >
        {layers.volumeProfile && (
          <rect
            x={padding}
            y={y(analysis.vah)}
            width={width - padding * 2}
            height={y(analysis.val) - y(analysis.vah)}
            fill="#6d5dfc"
            opacity=".08"
          />
        )}
        {[0, 1, 2, 3, 4].map((index) => (
          <line
            key={index}
            x1={padding}
            x2={width - padding}
            y1={padding + (index * (height - padding * 2)) / 4}
            y2={padding + (index * (height - padding * 2)) / 4}
            className="gridline"
          />
        ))}
        {layers.orderflow &&
          visibleZones.map((zone) => {
            const start = Math.max(0, zone.startIndex - offset);
            const zoneClass = zone.kind.toLowerCase().replace('_', '-');
            return (
              <g
                key={`${zone.kind}-${zone.startIndex}`}
                opacity={zone.active ? 1 : 0.35}
              >
                <rect
                  x={x(start)}
                  y={y(zone.high)}
                  width={Math.max(20, width - padding - x(start))}
                  height={Math.max(2, y(zone.low) - y(zone.high))}
                  className={`structure-zone ${zoneClass}`}
                />
                <text
                  x={x(start) + 4}
                  y={y(zone.high) - 4}
                  className="zone-label"
                >
                  {zone.label}
                </text>
              </g>
            );
          })}
        {layers.volumeProfile &&
          analysis.profile.map((volume, index) => {
            const barWidth = (volume / profileMaximum) * 105;
            const center =
              analysis.profileMin + (index + 0.5) * analysis.profileStep;
            return (
              <rect
                key={index}
                x={width - padding - barWidth}
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
            ((width - padding * 2) / displayed.length) * 0.58,
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
          [
            { value: analysis.vah, label: 'VAH' },
            { value: analysis.poc, label: 'POC' },
            { value: analysis.val, label: 'VAL' },
          ].map((level) => (
            <g key={level.label}>
              <line
                x1={padding}
                x2={width - padding}
                y1={y(level.value)}
                y2={y(level.value)}
                className={`level ${level.label.toLowerCase()}`}
              />
              <text
                x={width - padding - 4}
                y={y(level.value) - 5}
                textAnchor="end"
                className="level-label"
              >
                {level.label} {formatPrice(level.value, market)}
              </text>
            </g>
          ))}
        {layers.structure &&
          analysis.pivots
            .filter((pivot) => pivot.index >= offset)
            .slice(-12)
            .map((pivot) => (
              <text
                key={`${pivot.kind}-${pivot.index}`}
                x={x(pivot.index - offset)}
                y={y(pivot.price) + (pivot.kind === 'high' ? -8 : 15)}
                textAnchor="middle"
                className="structure"
              >
                {pivot.label}
              </text>
            ))}
        {layers.liquidity &&
          analysis.liquidity.map((level) => (
            <g key={`${level.kind}-${level.index}`}>
              <line
                x1={Math.max(padding, x(Math.max(0, level.index - offset)))}
                x2={width - padding}
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

export default function Home() {
  const [market, setMarket] = useState<Market>('US');
  const [symbol, setSymbol] = useState('ONDS');
  const [tab, setTab] = useState<'analysis' | 'backtest'>('analysis');
  const [data, setData] = useState<Candle[]>(() => demo());
  const [status, setStatus] = useState('예시 데이터 · 종목을 불러오세요');
  const [loading, setLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    structure: true,
    volumeProfile: true,
    orderflow: false,
    liquidity: false,
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [settingsDraft, setSettingsDraft] =
    useState<Preferences>(loadPreferences);
  const [lookback, setLookback] = useState(20);
  const [rewardRisk, setRewardRisk] = useState(2);
  const [direction, setDirection] = useState<BacktestDirection>('BOTH');
  const [backtestTimeframe, setBacktestTimeframe] = useState<Timeframe>('15m');
  const [appliedBacktestTimeframe, setAppliedBacktestTimeframe] =
    useState<Timeframe>('15m');
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

  const current =
    symbols[market].find((item) => item.code === symbol) ?? symbols[market][0];
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
  const maxLookback = Math.max(8, Math.min(50, draftBacktestData.length - 2));
  const canRunBacktest = draftBacktestData.length >= Math.max(lookback, 20) + 2;
  const last = chartData.at(-1)?.close ?? data.at(-1)!.close;
  const entryMidpoint = (analysis.entry[0] + analysis.entry[1]) / 2;
  const unitRisk = Math.max(Math.abs(entryMidpoint - analysis.stop), 0.000001);
  const riskBudget = preferences.capital * (preferences.riskPct / 100);
  const positionSize = Math.max(0, Math.floor(riskBudget / unitRisk));
  const positionNotional = positionSize * entryMidpoint;

  const loadMarketData = async (item = current) => {
    setLoading(true);
    setStatus('시장 데이터 불러오는 중…');
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
      setStatus(
        `${payload.source || '시장 데이터'} · ${payload.candles.length.toLocaleString()}개 캔들 · ${new Date(payload.fetchedAt || Date.now()).toLocaleString('ko-KR')}`,
      );
    } catch (error) {
      setStatus(
        `불러오기 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'} · CSV를 사용할 수 있습니다.`,
      );
    } finally {
      setLoading(false);
    }
  };

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

  const uploadCsv = async (file?: File) => {
    if (!file) return;
    try {
      const candles = parseCsv(await file.text());
      if (candles.length < 20) throw new Error('최소 20개 캔들이 필요합니다.');
      setData(candles);
      setTimeframe('15m');
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
            {symbols[market].map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} />
        </label>
        <button
          className="primary"
          onClick={() => loadMarketData()}
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
            {formatPrice(last, market)}
          </strong>
          <span>{analysis.bias}</span>
        </div>
        <div className="freshness" title={status}>
          {status}
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
                {analysis.score >= 75
                  ? '확인 진입 후보'
                  : analysis.score >= 60
                    ? '조건 충족 대기'
                    : '관망'}
              </h1>
              <p>
                {baseAnalysis.snapshots[timeframe].event} 확인 · 선택 시간대
                기준
              </p>
            </div>
            <div className="metric">
              <small>진입 후보</small>
              <strong>
                {current.currency}
                {formatPrice(analysis.entry[0], market)} –{' '}
                {formatPrice(analysis.entry[1], market)}
              </strong>
              <span>Value Area 경계</span>
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
              <article className="plan early">
                <header>
                  <span>
                    <Zap size={15} /> 조기 진입
                  </span>
                  <b>{preferences.riskPct.toFixed(1)}% RISK</b>
                </header>
                <h3>
                  {current.currency}
                  {formatPrice(analysis.entry[0], market)} –{' '}
                  {formatPrice(analysis.entry[1], market)}
                </h3>
                <p>Value Area + swing location</p>
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
                  <strong>리스크 원칙</strong> 자동 계산 결과를 주문 전 원본
                  차트에서 검증하세요.
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
                원본 15분봉을 {timeframeLabels[backtestTimeframe]}으로 묶어 계산
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
                        <th>청산</th>
                        <th>손익</th>
                        <th>R</th>
                        <th>사유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.tradeLog
                        .slice(-12)
                        .reverse()
                        .map((trade) => (
                          <tr key={trade.id}>
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
                              <small>
                                {trade.entryDate.slice(0, 16).replace('T', ' ')}
                              </small>
                            </td>
                            <td>
                              <b>{formatPrice(trade.exit, market)}</b>
                              <small>
                                {trade.exitDate.slice(0, 16).replace('T', ' ')}
                              </small>
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
                            <td>{trade.exitReason}</td>
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
