export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Pivot = {
  index: number;
  price: number;
  kind: 'high' | 'low';
  label: string;
};

export type Snapshot = {
  trend: string;
  sequence: string;
  event: string;
  score: number;
};

export type StructureZone = {
  startIndex: number;
  endIndex: number;
  low: number;
  high: number;
  kind: 'BULLISH_OB' | 'BEARISH_OB' | 'BULLISH_FVG' | 'BEARISH_FVG';
  label: string;
  active: boolean;
};

export type LiquidityLevel = {
  index: number;
  price: number;
  kind: 'BUY_SIDE' | 'SELL_SIDE';
  touches: number;
};

export type Analysis = {
  score: number;
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  atr: number;
  pivots: Pivot[];
  poc: number;
  vah: number;
  val: number;
  hvn: number[];
  lvn: number[];
  profile: number[];
  profileMin: number;
  profileStep: number;
  profileStart: number;
  entry: [number, number];
  stop: number;
  target: number;
  rr: number;
  snapshots: Record<string, Snapshot>;
  confidence: number;
  orderBlocks: StructureZone[];
  fairValueGaps: StructureZone[];
  liquidity: LiquidityLevel[];
};

export type BacktestDirection = 'LONG' | 'SHORT' | 'BOTH';

export type BacktestOptions = {
  minRR: number;
  lookback: number;
  initialCapital: number;
  riskPct: number;
  feeBps: number;
  slippageBps: number;
  direction: BacktestDirection;
};

export type BacktestTrade = {
  id: number;
  side: 'LONG' | 'SHORT';
  entryDate: string;
  exitDate: string;
  entryReason: 'LOOKBACK_HIGH_BREAKOUT' | 'LOOKBACK_LOW_BREAKDOWN';
  lookbackBars: number;
  triggerPrice: number;
  movingAverage: number;
  entryAtr: number;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  size: number;
  pnl: number;
  rMultiple: number;
  result: 'WIN' | 'LOSS';
  exitReason: 'TARGET' | 'STOP' | 'END';
};

export type Backtest = {
  trades: number;
  wins: number;
  winRate: number;
  returnPct: number;
  maxDrawdown: number;
  profitFactor: number;
  avgRR: number;
  equity: number[];
  buyHold: number;
  endingCapital: number;
  totalFees: number;
  tradeLog: BacktestTrade[];
};

const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

export function atr(data: Candle[], period = 14) {
  const ranges = data.map((candle, index) =>
    index
      ? Math.max(
          candle.high - candle.low,
          Math.abs(candle.high - data[index - 1].close),
          Math.abs(candle.low - data[index - 1].close),
        )
      : candle.high - candle.low,
  );
  return average(ranges.slice(-period));
}

export function pivots(data: Candle[], window = 3) {
  const output: Pivot[] = [];
  for (let index = window; index < data.length - window; index += 1) {
    const sample = data.slice(index - window, index + window + 1);
    if (data[index].high === Math.max(...sample.map((candle) => candle.high))) {
      output.push({ index, price: data[index].high, kind: 'high', label: 'H' });
    }
    if (data[index].low === Math.min(...sample.map((candle) => candle.low))) {
      output.push({ index, price: data[index].low, kind: 'low', label: 'L' });
    }
  }

  let previousHigh: number | undefined;
  let previousLow: number | undefined;
  for (const pivot of output) {
    if (pivot.kind === 'high') {
      pivot.label =
        previousHigh === undefined
          ? 'H'
          : pivot.price > previousHigh
            ? 'HH'
            : 'LH';
      previousHigh = pivot.price;
    } else {
      pivot.label =
        previousLow === undefined
          ? 'L'
          : pivot.price > previousLow
            ? 'HL'
            : 'LL';
      previousLow = pivot.price;
    }
  }
  return output;
}

export function resample(data: Candle[], size: number) {
  if (size <= 1) return data;
  const output: Candle[] = [];
  for (let index = 0; index < data.length; index += size) {
    const group = data.slice(index, index + size);
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
  return output;
}

function snapshot(data: Candle[]): Snapshot {
  if (data.length < 6) {
    return {
      trend: 'TRANSITION',
      sequence: '데이터 부족',
      event: '판정 대기',
      score: 50,
    };
  }
  const structure = pivots(
    data,
    Math.max(2, Math.min(4, Math.floor(data.length / 20))),
  );
  const recent = structure.slice(-4);
  const high = recent.filter((pivot) => pivot.kind === 'high').at(-1);
  const low = recent.filter((pivot) => pivot.kind === 'low').at(-1);
  const bullish = recent.filter(
    (pivot) => pivot.label === 'HH' || pivot.label === 'HL',
  ).length;
  const bearish = recent.filter(
    (pivot) => pivot.label === 'LH' || pivot.label === 'LL',
  ).length;
  const close = data.at(-1)!.close;
  const event =
    high && close > high.price
      ? 'External BOS ↑'
      : low && close < low.price
        ? 'External BOS ↓'
        : bullish >= bearish
          ? 'Internal structure ↑'
          : 'Internal structure ↓';

  return {
    trend:
      bullish > bearish
        ? 'BULLISH'
        : bearish > bullish
          ? 'BEARISH'
          : 'TRANSITION',
    sequence: recent.map((pivot) => pivot.label).join(' · ') || '판정 중',
    event,
    score: Math.round(50 + Math.abs(bullish - bearish) * 10),
  };
}

function detectZones(data: Candle[]) {
  const orderBlocks: StructureZone[] = [];
  const fairValueGaps: StructureZone[] = [];

  for (let index = 2; index < data.length; index += 1) {
    const candle = data[index];
    const earlier = data[index - 2];

    if (candle.low > earlier.high) {
      const low = earlier.high;
      const high = candle.low;
      fairValueGaps.push({
        startIndex: index - 2,
        endIndex: data.length - 1,
        low,
        high,
        kind: 'BULLISH_FVG',
        label: 'Bull FVG',
        active: !data.slice(index + 1).some((next) => next.low <= low),
      });
    }
    if (candle.high < earlier.low) {
      const low = candle.high;
      const high = earlier.low;
      fairValueGaps.push({
        startIndex: index - 2,
        endIndex: data.length - 1,
        low,
        high,
        kind: 'BEARISH_FVG',
        label: 'Bear FVG',
        active: !data.slice(index + 1).some((next) => next.high >= high),
      });
    }

    if (index < 8) continue;
    const comparison = data.slice(Math.max(0, index - 12), index);
    const previousHigh = Math.max(...comparison.map((item) => item.high));
    const previousLow = Math.min(...comparison.map((item) => item.low));

    if (candle.close > previousHigh) {
      for (
        let cursor = index - 1;
        cursor >= Math.max(0, index - 8);
        cursor -= 1
      ) {
        const source = data[cursor];
        if (source.close >= source.open) continue;
        orderBlocks.push({
          startIndex: cursor,
          endIndex: data.length - 1,
          low: source.low,
          high: Math.max(source.open, source.close),
          kind: 'BULLISH_OB',
          label: 'Bull OB',
          active: !data
            .slice(index + 1)
            .some((next) => next.close < source.low),
        });
        break;
      }
    }

    if (candle.close < previousLow) {
      for (
        let cursor = index - 1;
        cursor >= Math.max(0, index - 8);
        cursor -= 1
      ) {
        const source = data[cursor];
        if (source.close <= source.open) continue;
        orderBlocks.push({
          startIndex: cursor,
          endIndex: data.length - 1,
          low: Math.min(source.open, source.close),
          high: source.high,
          kind: 'BEARISH_OB',
          label: 'Bear OB',
          active: !data
            .slice(index + 1)
            .some((next) => next.close > source.high),
        });
        break;
      }
    }
  }

  const newestActiveFirst = (zones: StructureZone[]) =>
    zones
      .sort(
        (left, right) =>
          Number(right.active) - Number(left.active) ||
          right.startIndex - left.startIndex,
      )
      .slice(0, 6);

  return {
    orderBlocks: newestActiveFirst(orderBlocks),
    fairValueGaps: newestActiveFirst(fairValueGaps),
  };
}

function detectLiquidity(structure: Pivot[], currentAtr: number) {
  const threshold = Math.max(currentAtr * 0.35, 0.000001);
  const levels: LiquidityLevel[] = [];

  for (const pivot of structure.slice(-50)) {
    const kind = pivot.kind === 'high' ? 'BUY_SIDE' : 'SELL_SIDE';
    const existing = levels.find(
      (level) =>
        level.kind === kind && Math.abs(level.price - pivot.price) <= threshold,
    );
    if (existing) {
      existing.price =
        (existing.price * existing.touches + pivot.price) /
        (existing.touches + 1);
      existing.touches += 1;
      existing.index = pivot.index;
    } else {
      levels.push({ index: pivot.index, price: pivot.price, kind, touches: 1 });
    }
  }

  const confirmed = levels.filter((level) => level.touches >= 2);
  return (confirmed.length ? confirmed : levels)
    .sort(
      (left, right) => right.touches - left.touches || right.index - left.index,
    )
    .slice(0, 6);
}

export function analyze(data: Candle[]): Analysis {
  if (data.length < 20)
    throw new Error('분석에는 최소 20개 캔들이 필요합니다.');

  const close = data.at(-1)!.close;
  const currentAtr = atr(data);
  const structure = pivots(data);
  const recent = structure.slice(-8);
  const bullish = recent.filter(
    (pivot) => pivot.label === 'HH' || pivot.label === 'HL',
  ).length;
  const bearish = recent.filter(
    (pivot) => pivot.label === 'LH' || pivot.label === 'LL',
  ).length;
  const bias =
    bullish > bearish ? 'LONG' : bearish > bullish ? 'SHORT' : 'NEUTRAL';
  const anchor = recent.find(
    (pivot) => pivot.kind === (bias === 'SHORT' ? 'high' : 'low'),
  );
  const profileStart = Math.max(0, anchor?.index ?? data.length - 80);
  const profileRange = data.slice(profileStart);
  const profileMin = Math.min(...profileRange.map((candle) => candle.low));
  const profileMax = Math.max(...profileRange.map((candle) => candle.high));
  const bins = 24;
  const profileStep = Math.max((profileMax - profileMin) / bins, 0.000001);
  const profile = Array<number>(bins).fill(0);

  for (const candle of profileRange) {
    const typical = (candle.high + candle.low + candle.close) / 3;
    const index = Math.min(
      bins - 1,
      Math.max(0, Math.floor((typical - profileMin) / profileStep)),
    );
    profile[index] += candle.volume;
  }

  const totalVolume = profile.reduce((sum, value) => sum + value, 0);
  const pocIndex = profile.indexOf(Math.max(...profile));
  const selected = new Set([pocIndex]);
  let selectedVolume = profile[pocIndex];
  let up = pocIndex + 1;
  let down = pocIndex - 1;
  while (selectedVolume < totalVolume * 0.7 && (down >= 0 || up < bins)) {
    const upperVolume = up < bins ? profile[up] : -1;
    const lowerVolume = down >= 0 ? profile[down] : -1;
    if (upperVolume >= lowerVolume) {
      selected.add(up);
      selectedVolume += upperVolume;
      up += 1;
    } else {
      selected.add(down);
      selectedVolume += lowerVolume;
      down -= 1;
    }
  }

  const selectedIndexes = [...selected];
  const valueAreaLow = profileMin + Math.min(...selectedIndexes) * profileStep;
  const valueAreaHigh =
    profileMin + (Math.max(...selectedIndexes) + 1) * profileStep;
  const pointOfControl = profileMin + (pocIndex + 0.5) * profileStep;
  const rankedProfile = profile
    .map((value, index) => ({ value, index }))
    .sort((left, right) => right.value - left.value);
  const highVolumeNodes = rankedProfile
    .slice(0, 3)
    .map(({ index }) => profileMin + (index + 0.5) * profileStep);
  const lowVolumeNodes = rankedProfile
    .slice(-3)
    .map(({ index }) => profileMin + (index + 0.5) * profileStep);

  const entry: [number, number] =
    bias === 'SHORT'
      ? [valueAreaHigh - currentAtr * 0.2, valueAreaHigh + currentAtr * 0.2]
      : [valueAreaLow - currentAtr * 0.2, valueAreaLow + currentAtr * 0.2];
  const stop =
    bias === 'SHORT'
      ? valueAreaHigh + currentAtr * 1.35
      : valueAreaLow - currentAtr * 1.35;
  const targetCandidates = recent
    .filter((pivot) => pivot.kind === (bias === 'SHORT' ? 'low' : 'high'))
    .map((pivot) => pivot.price);
  const target =
    bias === 'SHORT'
      ? Math.min(...targetCandidates, close - currentAtr * 3)
      : Math.max(...targetCandidates, close + currentAtr * 3);
  const risk = Math.abs(average(entry) - stop);
  const rewardToRisk = risk ? Math.abs(target - average(entry)) / risk : 0;
  const location =
    bias === 'LONG'
      ? close >= valueAreaLow && close <= pointOfControl
      : close <= valueAreaHigh && close >= pointOfControl;
  const score = Math.max(
    35,
    Math.min(
      94,
      50 +
        (bullish - bearish) * (bias === 'SHORT' ? -5 : 5) +
        (location ? 12 : 0) +
        (rewardToRisk >= 2 ? 10 : 0),
    ),
  );
  const zones = detectZones(data);

  return {
    score: Math.round(score),
    bias,
    atr: currentAtr,
    pivots: structure,
    poc: pointOfControl,
    vah: valueAreaHigh,
    val: valueAreaLow,
    hvn: highVolumeNodes,
    lvn: lowVolumeNodes,
    profile,
    profileMin,
    profileStep,
    profileStart,
    entry,
    stop,
    target,
    rr: rewardToRisk,
    snapshots: {
      '1D': snapshot(resample(data, 26)),
      '4H': snapshot(resample(data, 16)),
      '1H': snapshot(resample(data, 4)),
      '15m': snapshot(data),
    },
    confidence: Math.min(95, 55 + Math.round(data.length / 8)),
    orderBlocks: zones.orderBlocks,
    fairValueGaps: zones.fairValueGaps,
    liquidity: detectLiquidity(structure, currentAtr),
  };
}

const DEFAULT_BACKTEST_OPTIONS: BacktestOptions = {
  minRR: 2,
  lookback: 20,
  initialCapital: 10_000,
  riskPct: 1,
  feeBps: 5,
  slippageBps: 3,
  direction: 'BOTH',
};

export function backtest(
  data: Candle[],
  overrides: Partial<BacktestOptions> = {},
): Backtest {
  const options = { ...DEFAULT_BACKTEST_OPTIONS, ...overrides };
  const feeRate = options.feeBps / 10_000;
  const slippageRate = options.slippageBps / 10_000;
  let cash = options.initialCapital;
  let peak = cash;
  let maxDrawdown = 0;
  let totalFees = 0;
  let wins = 0;
  let winSum = 0;
  let lossSum = 0;
  let position: null | {
    side: 'LONG' | 'SHORT';
    entryDate: string;
    entry: number;
    stop: number;
    target: number;
    size: number;
    riskAmount: number;
    entryFee: number;
    entryReason: BacktestTrade['entryReason'];
    lookbackBars: number;
    triggerPrice: number;
    movingAverage: number;
    entryAtr: number;
  } = null;
  const tradeLog: BacktestTrade[] = [];
  const equity = [cash];

  const closePosition = (
    exitRaw: number,
    exitDate: string,
    exitReason: BacktestTrade['exitReason'],
  ) => {
    if (!position) return;
    const exit =
      position.side === 'LONG'
        ? exitRaw * (1 - slippageRate)
        : exitRaw * (1 + slippageRate);
    const grossPnl =
      position.side === 'LONG'
        ? (exit - position.entry) * position.size
        : (position.entry - exit) * position.size;
    const exitFee = Math.abs(exit * position.size) * feeRate;
    const fees = position.entryFee + exitFee;
    const pnl = grossPnl - fees;
    cash += pnl;
    totalFees += fees;
    if (pnl > 0) {
      wins += 1;
      winSum += pnl;
    } else {
      lossSum += Math.abs(pnl);
    }
    tradeLog.push({
      id: tradeLog.length + 1,
      side: position.side,
      entryDate: position.entryDate,
      exitDate,
      entryReason: position.entryReason,
      lookbackBars: position.lookbackBars,
      triggerPrice: position.triggerPrice,
      movingAverage: position.movingAverage,
      entryAtr: position.entryAtr,
      entry: position.entry,
      exit,
      stop: position.stop,
      target: position.target,
      size: position.size,
      pnl,
      rMultiple: position.riskAmount ? pnl / position.riskAmount : 0,
      result: pnl > 0 ? 'WIN' : 'LOSS',
      exitReason,
    });
    position = null;
  };

  for (
    let index = Math.max(options.lookback, 20);
    index < data.length;
    index += 1
  ) {
    const candle = data[index];

    if (position?.side === 'LONG') {
      if (candle.low <= position.stop)
        closePosition(position.stop, candle.date, 'STOP');
      else if (candle.high >= position.target)
        closePosition(position.target, candle.date, 'TARGET');
    } else if (position?.side === 'SHORT') {
      if (candle.high >= position.stop)
        closePosition(position.stop, candle.date, 'STOP');
      else if (candle.low <= position.target)
        closePosition(position.target, candle.date, 'TARGET');
    }

    if (!position && index < data.length - 1) {
      const history = data.slice(index - options.lookback, index);
      const previousHigh = Math.max(...history.map((item) => item.high));
      const previousLow = Math.min(...history.map((item) => item.low));
      const movingAverage = average(
        data.slice(index - 20, index).map((item) => item.close),
      );
      const currentAtr = atr(data.slice(0, index + 1));
      const longSignal =
        candle.close > previousHigh && candle.close > movingAverage;
      const shortSignal =
        candle.close < previousLow && candle.close < movingAverage;
      const canLong =
        options.direction === 'LONG' || options.direction === 'BOTH';
      const canShort =
        options.direction === 'SHORT' || options.direction === 'BOTH';
      const side =
        canLong && longSignal
          ? 'LONG'
          : canShort && shortSignal
            ? 'SHORT'
            : null;

      if (side && currentAtr > 0) {
        const entry =
          side === 'LONG'
            ? candle.close * (1 + slippageRate)
            : candle.close * (1 - slippageRate);
        const riskPerUnit = currentAtr * 1.5;
        const riskAmount = cash * (options.riskPct / 100);
        const size = riskPerUnit ? riskAmount / riskPerUnit : 0;
        const stop =
          side === 'LONG' ? entry - riskPerUnit : entry + riskPerUnit;
        const target =
          side === 'LONG'
            ? entry + riskPerUnit * options.minRR
            : entry - riskPerUnit * options.minRR;
        position = {
          side,
          entryDate: candle.date,
          entry,
          stop,
          target,
          size,
          riskAmount,
          entryFee: Math.abs(entry * size) * feeRate,
          entryReason:
            side === 'LONG'
              ? 'LOOKBACK_HIGH_BREAKOUT'
              : 'LOOKBACK_LOW_BREAKDOWN',
          lookbackBars: options.lookback,
          triggerPrice: side === 'LONG' ? previousHigh : previousLow,
          movingAverage,
          entryAtr: currentAtr,
        };
      }
    }

    const unrealized = position
      ? position.side === 'LONG'
        ? (candle.close - position.entry) * position.size - position.entryFee
        : (position.entry - candle.close) * position.size - position.entryFee
      : 0;
    const markedEquity = cash + unrealized;
    peak = Math.max(peak, markedEquity);
    maxDrawdown = Math.min(maxDrawdown, ((markedEquity - peak) / peak) * 100);
    equity.push(markedEquity);
  }

  if (position) {
    const last = data.at(-1)!;
    closePosition(last.close, last.date, 'END');
    equity.push(cash);
  }

  const trades = tradeLog.length;
  const buyHold = (data.at(-1)!.close / data[0].close - 1) * 100;
  return {
    trades,
    wins,
    winRate: trades ? (wins / trades) * 100 : 0,
    returnPct: (cash / options.initialCapital - 1) * 100,
    maxDrawdown,
    profitFactor: lossSum ? winSum / lossSum : winSum ? 99 : 0,
    avgRR: trades ? average(tradeLog.map((trade) => trade.rMultiple)) : 0,
    equity,
    buyHold,
    endingCapital: cash,
    totalFees,
    tradeLog,
  };
}
