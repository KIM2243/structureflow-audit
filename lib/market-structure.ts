import type { Candle, Pivot, StructureEvent } from './engine';

export type ConfirmedRange = { high: number; low: number; equilibrium: number; confirmedAt: number };
export type StructureMap = {
  pivots: Pivot[];
  events: StructureEvent[];
  trend: 'BULLISH' | 'BEARISH' | 'TRANSITION';
  protectedLevel?: Pivot;
  weakLevel?: Pivot;
  range: ConfirmedRange | null;
};

// Conservative operational model: wick levels, CLOSE confirmation. A seed
// range initializes the map; thereafter only a break promotes a pullback origin.
// Every decision uses this bar and older bars, never right-hand/future pivots.
export function mapMarketStructure(data: readonly Candle[]): StructureMap {
  const points: Pivot[] = [];
  const events: StructureEvent[] = [];
  let trend: StructureMap['trend'] = 'TRANSITION';
  let direction: 'BULLISH' | 'BEARISH' | undefined;
  let protectedLevel: Pivot | undefined;
  let weakLevel: Pivot | undefined;
  let range: ConfirmedRange | null = null;
  if (data.length < 3) return { pivots: points, events, trend, range };
  const point = (index: number, kind: Pivot['kind']): Pivot => ({
    index, kind, price: data[index][kind], label: kind === 'high' ? 'H' : 'L',
  });
  let high = point(0, 'high');
  let low = point(0, 'low');
  let pullback: Pivot | undefined;
  let retracing = false;
  const confirm = (p: Pivot, index: number) => {
    if (points.some((old) => old.index === p.index && old.kind === p.kind)) return;
    const previous = points.findLast((old) => old.kind === p.kind);
    points.push({ ...p, confirmedAt: index, label: !previous ? p.label :
      p.kind === 'high' ? (p.price > previous.price ? 'HH' : 'LH') : (p.price > previous.price ? 'HL' : 'LL') });
  };
  const emit = (index: number, level: Pivot, next: 'BULLISH' | 'BEARISH', reversal: boolean) => {
    const kind = reversal ? 'CHOCH' : 'BOS';
    events.push({ index, pivotIndex: level.index, price: level.price, kind,
      direction: next, scope: 'SWING', label: `Swing ${kind} ${next === 'BULLISH' ? '↑' : '↓'}` });
    direction = next;
    // Breaking the protected side is a warning; continuation BOS confirms reversal.
    trend = reversal ? 'TRANSITION' : next;
  };
  for (let i = 1; i < data.length; i++) {
    const bar = data[i];
    if (!direction) {
      // Two completed seed bars avoid labelling the first fluctuation a BOS.
      if (i >= 2 && bar.close > high.price) {
        confirm(high, i); confirm(low, i); emit(i, high, 'BULLISH', false);
        protectedLevel = low; weakLevel = point(i, 'high');
      } else if (i >= 2 && bar.close < low.price) {
        confirm(high, i); confirm(low, i); emit(i, low, 'BEARISH', false);
        protectedLevel = high; weakLevel = point(i, 'low');
      } else {
        if (bar.high > high.price) high = point(i, 'high');
        if (bar.low < low.price) low = point(i, 'low');
      }
    } else if (protectedLevel && weakLevel) {
      const bullish = direction === 'BULLISH';
      const reverses = bullish ? bar.close < protectedLevel.price : bar.close > protectedLevel.price;
      if (reverses) {
        confirm(weakLevel, i);
        emit(i, protectedLevel, bullish ? 'BEARISH' : 'BULLISH', true);
        protectedLevel = weakLevel;
        weakLevel = point(i, bullish ? 'low' : 'high');
        pullback = undefined; retracing = false; range = null;
      } else {
        const continues = bullish ? bar.close > weakLevel.price : bar.close < weakLevel.price;
        if (retracing && continues && pullback) {
          confirm(weakLevel, i); confirm(pullback, i);
          emit(i, weakLevel, direction, false);
          protectedLevel = pullback;
          weakLevel = point(i, bullish ? 'high' : 'low');
          pullback = undefined; retracing = false; range = null;
        } else if (!retracing) {
          const extendsExtreme = bullish ? bar.high > weakLevel.price : bar.low < weakLevel.price;
          if (extendsExtreme) weakLevel = point(i, bullish ? 'high' : 'low');
          else {
            retracing = true;
            pullback = point(i, bullish ? 'low' : 'high');
            confirm(weakLevel, i);
          }
        } else if (pullback && (bullish ? bar.low < pullback.price : bar.high > pullback.price)) {
          pullback = point(i, bullish ? 'low' : 'high');
        }
      }
    }
    if (retracing && protectedLevel && weakLevel && !range) {
      const top = Math.max(protectedLevel.price, weakLevel.price);
      const bottom = Math.min(protectedLevel.price, weakLevel.price);
      if (top > bottom) range = { high: top, low: bottom, equilibrium: (top + bottom) / 2, confirmedAt: i };
    }
  }
  return { pivots: points.sort((a, b) => a.index - b.index), events, trend, protectedLevel, weakLevel, range };
}

// Single-candle failure to extend confirms an internal turning point on the
// following bar. This is kept distinct from the protected swing map.
export function mechanicalInternalPivots(data: readonly Candle[]): Pivot[] {
  const output: Pivot[] = [];
  for (let i = 1; i < data.length; i++) {
    for (const kind of ['high', 'low'] as const) {
      const fails = kind === 'high' ? data[i].high < data[i - 1].high : data[i].low > data[i - 1].low;
      if (!fails) continue;
      const previous = output.findLast((p) => p.kind === kind);
      const price = data[i - 1][kind];
      output.push({ index: i - 1, confirmedAt: i, price, kind,
        label: !previous ? (kind === 'high' ? 'H' : 'L') : kind === 'high' ? (price > previous.price ? 'HH' : 'LH') : (price > previous.price ? 'HL' : 'LL') });
    }
  }
  return output;
}
