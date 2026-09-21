import type { Candle } from './engine';
import { closedBars, qualifiedZone, validBars } from './auto-paper.ts';

export type HigherContext = { frame: '1D' | '4H'; low: number; high: number; at: number; direction: 'LONG' | 'SHORT'; grade: string };
// Uses the same confirmed structure and grading as the paper engine. No OB/FVG substitute.
export function higherContexts(data: Partial<Record<'1D' | '4H', Candle[]>>, now: number): HigherContext[] {
  return (['1D', '4H'] as const).flatMap(frame => {
    const raw = data[frame] ?? [], minutes = frame === '1D' ? 1440 : 240;
    if (!validBars(raw)) return [];
    const bars = closedBars(raw, minutes, now);
    if (bars.length < 20) return [];
    const context = qualifiedZone(bars, minutes);
    return context ? [{ frame, low: context.zone.low, high: context.zone.high, at: context.zone.at, direction: context.direction, grade: context.zone.quality?.grade ?? '미평가' }] : [];
  });
}
