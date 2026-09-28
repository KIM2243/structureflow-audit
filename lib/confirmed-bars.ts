import type { Candle } from './engine';
export function validBars(bars: Candle[]): boolean {
  return bars.every((b, i) => Number.isFinite(Date.parse(b.date)) && [b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite) && b.low > 0 && b.high >= Math.max(b.open,b.close,b.low) && b.low <= Math.min(b.open,b.close) && b.volume >= 0 && (!i || Date.parse(bars[i-1].date) < Date.parse(b.date)));
}
// Only bars followed by another bar and whose nominal duration elapsed are used.
// This deliberately defers shortened final-session H4 bars until the next session.
export function closedBars(bars: Candle[], minutes: number, at: number): Candle[] {
  return bars.filter((b,i) => i < bars.length - 1 && Date.parse(b.date) + minutes * 60_000 <= at);
}
