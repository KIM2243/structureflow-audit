import { mapMarketStructure, mechanicalInternalPivots, type ConfirmedRange } from './market-structure.ts';

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
  confirmedAt?: number;
  price: number;
  kind: 'high' | 'low';
  label: string;
};

export type StructureEvent = {
  index: number;
  pivotIndex: number;
  price: number;
  kind: 'BOS' | 'CHOCH';
  direction: 'BULLISH' | 'BEARISH';
  scope: 'SWING' | 'INTERNAL';
  label: string;
};

export type StructureState = {
  swingTrend: 'BULLISH' | 'BEARISH' | 'TRANSITION';
  internalTrend: 'BULLISH' | 'BEARISH' | 'TRANSITION';
  latestSwingEvent?: StructureEvent;
  latestInternalEvent?: StructureEvent;
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
  status?: 'UNTOUCHED' | 'SWEPT' | 'BROKEN';
};

export type ForecastReason = {
  label: string;
  state: 'PASS' | 'WAIT' | 'RISK';
  detail: string;
};

export type EntryForecast = {
  status: 'READY' | 'WAIT' | 'AVOID';
  side: 'LONG' | 'SHORT' | 'NEUTRAL';
  trigger: number;
  distancePct: number;
  reasons: ForecastReason[];
  zoneValid: boolean;
  locationConfirmed: boolean;
  zoneTouchTime?: string;
  reactionTime?: string;
  reactionConfirmed: boolean;
};

export type Analysis = {
  protectedPrice?: number;
  weakPrice?: number;
  confirmedRange: ConfirmedRange | null;
  marketPhase: string;
  score: number;
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  atr: number;
  pivots: Pivot[];
  internalPivots: Pivot[];
  structureEvents: StructureEvent[];
  structureState: StructureState;
  volumeStats: {
    current: number;
    average20: number;
    ratio: number;
  };
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
  entryForecast: EntryForecast;
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
  const candidates: Pivot[] = [];
  for (let index = window; index < data.length - window; index += 1) {
    const sample = data.slice(index - window, index + window + 1);
    if (data[index].high === Math.max(...sample.map((candle) => candle.high))) {
      candidates.push({
        index,
        price: data[index].high,
        kind: 'high',
        label: 'H',
      });
    }
    if (data[index].low === Math.min(...sample.map((candle) => candle.low))) {
      candidates.push({ index, price: data[index].low, kind: 'low', label: 'L' });
    }
  }

  // Consecutive highs or lows are collapsed to the more extreme point. This
  // produces the mechanical alternating swing map used by the chart.
  const output: Pivot[] = [];
  for (const candidate of candidates) {
    const previous = output.at(-1);
    if (previous?.kind === candidate.kind) {
      const isMoreExtreme =
        candidate.kind === 'high'
          ? candidate.price >= previous.price
          : candidate.price <= previous.price;
      if (isMoreExtreme) output[output.length - 1] = candidate;
    } else {
      output.push(candidate);
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

export function detectStructureEvents(
  data: Candle[],
  structure: Pivot[],
  scope: StructureEvent['scope'],
  confirmationWindow: number,
) {
  const events: StructureEvent[] = [];
  let cursor = 0;
  let latestHigh: Pivot | undefined;
  let latestLow: Pivot | undefined;
  let brokenHighIndex = -1;
  let brokenLowIndex = -1;
  let trend: StructureEvent['direction'] | 'TRANSITION' = 'TRANSITION';

  for (let index = 0; index < data.length; index += 1) {
    while (
      cursor < structure.length &&
      (structure[cursor].confirmedAt ?? structure[cursor].index + confirmationWindow) < index
    ) {
      const pivot = structure[cursor];
      if (pivot.kind === 'high') latestHigh = pivot;
      else latestLow = pivot;
      cursor += 1;
    }

    const close = data[index].close;
    const bullishBreak =
      latestHigh &&
      latestHigh.index !== brokenHighIndex &&
      close > latestHigh.price;
    const bearishBreak =
      latestLow && latestLow.index !== brokenLowIndex && close < latestLow.price;

    if (bullishBreak && latestHigh) {
      const kind = trend === 'BEARISH' ? 'CHOCH' : 'BOS';
      events.push({
        index,
        pivotIndex: latestHigh.index,
        price: latestHigh.price,
        kind,
        direction: 'BULLISH',
        scope,
        label: `${scope === 'SWING' ? 'Swing' : 'Internal'} ${kind} ↑`,
      });
      brokenHighIndex = latestHigh.index;
      trend = 'BULLISH';
    } else if (bearishBreak && latestLow) {
      const kind = trend === 'BULLISH' ? 'CHOCH' : 'BOS';
      events.push({
        index,
        pivotIndex: latestLow.index,
        price: latestLow.price,
        kind,
        direction: 'BEARISH',
        scope,
        label: `${scope === 'SWING' ? 'Swing' : 'Internal'} ${kind} ↓`,
      });
      brokenLowIndex = latestLow.index;
      trend = 'BEARISH';
    }
  }

  return events;
}

function trendFromEvents(events: StructureEvent[]) {
  return events.at(-1)?.direction ?? 'TRANSITION';
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
  const mapped = mapMarketStructure(data.slice(0, -1));
  const structure = mapped.pivots;
  const events = mapped.events;
  const recent = structure.slice(-4);
  const bullish = recent.filter(
    (pivot) => pivot.label === 'HH' || pivot.label === 'HL',
  ).length;
  const bearish = recent.filter(
    (pivot) => pivot.label === 'LH' || pivot.label === 'LL',
  ).length;
  const latestEvent = events.at(-1);
  const event = latestEvent?.label ?? '초기 구조 확인 대기';

  return {
    trend: mapped.trend,
    sequence: recent.map((pivot) => pivot.label).join(' · ') || '판정 중',
    event,
    score: Math.round(50 + Math.abs(bullish - bearish) * 10),
  };
}

export function structureSnapshot(data: Candle[]): Snapshot {
  return snapshot(data);
}

function detectZones(data: Candle[]) {
  const orderBlocks: StructureZone[] = [];
  const fairValueGaps: StructureZone[] = [];
  // One suffix pass replaces repeatedly copying/scanning every later candle.
  // Index i+1 excludes the formation candle, preserving the original rules.
  const lows = new Float64Array(data.length + 1);
  const highs = new Float64Array(data.length + 1);
  const closesLow = new Float64Array(data.length + 1);
  const closesHigh = new Float64Array(data.length + 1);
  lows[data.length] = closesLow[data.length] = Infinity;
  highs[data.length] = closesHigh[data.length] = -Infinity;
  for (let i = data.length - 1; i >= 0; i--) {
    const c = data[i];
    lows[i] = c.low < lows[i + 1] ? c.low : lows[i + 1];
    highs[i] = c.high > highs[i + 1] ? c.high : highs[i + 1];
    closesLow[i] = c.close < closesLow[i + 1] ? c.close : closesLow[i + 1];
    closesHigh[i] = c.close > closesHigh[i + 1] ? c.close : closesHigh[i + 1];
  }

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
        active: !(lows[index + 1] <= low),
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
        active: !(highs[index + 1] >= high),
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
          active: !(closesLow[index + 1] < source.low),
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
          active: !(closesHigh[index + 1] > source.high),
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

function detectLiquidity(structure: Pivot[], currentAtr: number, data: Candle[]) {
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
  for (const level of levels) {
    const crossed = data.slice(level.index + 1).find((bar) => level.kind === 'BUY_SIDE' ? bar.high > level.price : bar.low < level.price);
    level.status = !crossed ? 'UNTOUCHED' : (level.kind === 'BUY_SIDE' ? crossed.close <= level.price : crossed.close >= level.price) ? 'SWEPT' : 'BROKEN';
  }
  return (confirmed.length ? confirmed : levels)
    .sort(
      (left, right) => right.touches - left.touches || right.index - left.index,
    )
    .slice(0, 6);
}

export function analyze(data: Candle[]): Analysis {
  if (data.length < 20) return {
    confirmedRange:null,marketPhase:'데이터 부족 · 진입 대기',score:0,bias:'NEUTRAL',atr:0,
    pivots:[],internalPivots:[],structureEvents:[],structureState:{swingTrend:'TRANSITION',internalTrend:'TRANSITION'},
    volumeStats:{current:0,average20:0,ratio:0},poc:0,vah:0,val:0,hvn:[],lvn:[],profile:[],
    profileMin:0,profileStep:0,profileStart:0,entry:[0,0],stop:0,target:0,rr:0,snapshots:{},confidence:0,
    orderBlocks:[],fairValueGaps:[],liquidity:[],
    entryForecast:{status:'WAIT',side:'NEUTRAL',trigger:0,distancePct:0,zoneValid:false,locationConfirmed:false,reactionConfirmed:false,
      reasons:[{label:'원본 데이터',state:'WAIT',detail:'최소 20개 원본 캔들이 필요합니다. 다른 시간대 데이터로 대신 진입하지 않습니다.'}]},
  };

  const close = data.at(-1)!.close;
  const currentAtr = atr(data);
  // Last bar may still be forming. Only completed predecessors confirm structure.
  const completed = data.slice(0, -1);
  const mapped = mapMarketStructure(completed);
  const structure = mapped.pivots;
  const internalStructure = mechanicalInternalPivots(completed);
  const swingEvents = mapped.events;
  const internalEvents = detectStructureEvents(
    completed,
    internalStructure,
    'INTERNAL',
    1,
  );
  const structureEvents = [...swingEvents, ...internalEvents].sort(
    (left, right) => left.index - right.index,
  );
  const structureState: StructureState = {
    swingTrend: mapped.trend,
    internalTrend: trendFromEvents(internalEvents),
    latestSwingEvent: swingEvents.at(-1),
    latestInternalEvent: internalEvents.at(-1),
  };
  const recent = structure.slice(-8);
  const bias = mapped.trend === 'BULLISH' ? 'LONG' : mapped.trend === 'BEARISH' ? 'SHORT' : 'NEUTRAL';
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

  // Operational zone: BOS origin candle's wick-to-body, clipped to the
  // favourable half of the confirmed range. VP never selects an entry.
  const origin = mapped.protectedLevel ? completed[mapped.protectedLevel.index] : undefined;
  const range = mapped.range;
  const entry: [number, number] = origin && range && bias !== 'NEUTRAL'
    ? bias === 'LONG'
      ? [origin.low, Math.min(Math.max(origin.open, origin.close), range.equilibrium)]
      : [Math.max(Math.min(origin.open, origin.close), range.equilibrium), origin.high]
    : [close, close];
  const buffer = Math.max(currentAtr * 0.1, close * 0.00001);
  const stop = origin ? bias === 'SHORT' ? origin.high + buffer : origin.low - buffer : close;
  const target = mapped.weakLevel?.price ?? close;
  const zoneValid = !!range && bias !== 'NEUTRAL' && entry[1] > entry[0]
    && (bias === 'LONG' ? stop < entry[0] && target > entry[1] && close > stop : stop > entry[1] && target < entry[0] && close < stop);
  const risk = Math.abs(average(entry) - stop);
  const rewardToRisk = zoneValid && risk ? Math.abs(target - average(entry)) / risk : 0;
  const location = zoneValid && close >= entry[0] && close <= entry[1];
  const touchIndex = zoneValid ? completed.findLastIndex((bar, index) =>
    index >= range!.confirmedAt && bar.low <= entry[1] && bar.high >= entry[0]) : -1;
  const reaction = internalEvents.at(-1);
  const reactionConfirmed = !!reaction && reaction.index >= completed.length - 3
    && reaction.direction === mapped.trend;
  const reactedAfterTouch = reactionConfirmed && touchIndex >= 0 && reaction!.index > touchIndex;
  const score = [bias !== 'NEUTRAL', zoneValid, location, reactedAfterTouch, rewardToRisk >= 2].filter(Boolean).length * 20;
  const zones = detectZones(data);
  const averageVolume20 = average(
    data.slice(-20).map((candle) => candle.volume),
  );
  const volumeRatio = averageVolume20
    ? data.at(-1)!.volume / averageVolume20
    : 0;
  const entryMidpoint = average(entry);
  const distancePct = close ? ((entryMidpoint - close) / close) * 100 : 0;
  const entryStatus =
    !zoneValid || rewardToRisk < 2
      ? 'AVOID'
      : location && reactedAfterTouch
        ? 'READY'
        : 'WAIT';
  const snapshots = {
    '1D': snapshot(resample(data, 78)),
    '4H': snapshot(resample(data, 48)),
    '1H': snapshot(resample(data, 12)),
    '15m': snapshot(resample(data, 3)),
    '5m': snapshot(data),
  };

  return {
    protectedPrice: mapped.protectedLevel?.price,
    weakPrice: mapped.weakLevel?.price,
    confirmedRange: range,
    marketPhase: mapped.trend === 'TRANSITION' ? '스윙 전환 확인 대기'
      : structureState.internalTrend === mapped.trend ? '스윙·내부 동행' : '스윙 내부 조정',
    score: Math.round(score),
    bias,
    atr: currentAtr,
    pivots: structure,
    internalPivots: internalStructure,
    structureEvents,
    structureState,
    volumeStats: {
      current: data.at(-1)!.volume,
      average20: averageVolume20,
      ratio: volumeRatio,
    },
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
    snapshots,
    confidence: score,
    orderBlocks: zones.orderBlocks,
    fairValueGaps: zones.fairValueGaps,
    liquidity: detectLiquidity(internalStructure, currentAtr, completed),
    entryForecast: {
      zoneValid,
      locationConfirmed: location,
      zoneTouchTime: touchIndex >= 0 ? completed[touchIndex].date : undefined,
      reactionTime: reactionConfirmed ? completed[reaction!.index].date : undefined,
      reactionConfirmed,
      status: entryStatus,
      side: bias,
      trigger: entryMidpoint,
      distancePct,
      reasons: [
        {
          label: '시장 구조',
          state: bias === 'NEUTRAL' ? 'WAIT' : 'PASS',
          detail:
            bias === 'NEUTRAL'
              ? '보호 수준 이탈 또는 초기 구간: 후속 BOS 확인 전 대기합니다.'
              : `${bias} · 종가 BOS로 확인한 스윙 방향`,
        },
        {
          label: '진입 위치',
          state: location ? 'PASS' : 'WAIT',
          detail: location
            ? '현재가가 BOS 기원 영역과 유리한 반범위 안에 있습니다.'
            : !zoneValid ? '확정된 구조 영역이 없어 가격 계획을 보류합니다.' : `구조 영역까지 ${distancePct.toFixed(2)}% · 추격하지 않고 대기`,
        },
        {
          label: '구간 도달 후 구조 반응',
          state: reactedAfterTouch ? 'PASS' : 'WAIT',
          detail: reactedAfterTouch ? '구간 접촉 뒤 완료 봉의 내부 구조 돌파 확인' : '구간 접촉 이후의 새로운 내부 CHoCH/BOS를 기다립니다.',
        },
        {
          label: '거래량',
          state: volumeRatio >= 1.1 ? 'PASS' : 'WAIT',
          detail: `최근 거래량은 20봉 평균의 ${volumeRatio.toFixed(2)}배입니다.`,
        },
        {
          label: '손익비',
          state: rewardToRisk >= 2 ? 'PASS' : 'RISK',
          detail: `예상 목표까지 ${rewardToRisk.toFixed(2)}R · ${rewardToRisk >= 2 ? '기준 충족' : '2R 미달'}`,
        },
      ],
    },
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
