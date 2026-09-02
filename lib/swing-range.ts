import type { Pivot } from './engine';

export type SwingRange = {
  high: number;
  low: number;
  equilibrium: number;
};

export function getRecentSwingRange(
  pivots: readonly Pivot[],
  endIndex: number,
): SwingRange | null {
  const confirmed = pivots.filter((pivot) => pivot.index < endIndex);
  const latest = confirmed.at(-1);
  if (!latest) return null;

  const opposite = confirmed
    .slice(0, -1)
    .findLast((pivot) => pivot.kind !== latest.kind);
  if (!opposite || opposite.price === latest.price) return null;

  const high = latest.kind === 'high' ? latest.price : opposite.price;
  const low = latest.kind === 'low' ? latest.price : opposite.price;
  if (high <= low) return null;

  return {
    high,
    low,
    equilibrium: (high + low) / 2,
  };
}
