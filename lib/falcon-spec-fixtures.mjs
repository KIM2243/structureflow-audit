// Synthetic specification data, not extracted lecture examples or market history.
export const at = Date.UTC(2026, 8, 28);
export const bar = (index, high, low, close, complete = true) => ({
  index, observedAt: at + (index + 1) * 60000, complete,
  candle: { date: new Date(at + index * 60000).toISOString(), open: close, high, low, close, volume: 1 },
});
export const level = (pivotIndex, price, kind, confirmedAt = pivotIndex) => ({pivotIndex, price, kind, confirmedAt, observedAt: at + (confirmedAt + 1) * 60000});
export const bullishSwing = {direction:'BULLISH',strong:level(0,90,'low',1),weak:level(1,100,'high'),knownAt:1};
export const bearishInternal = {direction:'BEARISH',extreme:level(1,95,'low'),minor:level(0,100,'high',1),knownAt:1};
export const specificationCases = ['swing wick is not close break','swing close BOS','internal wick CHoCH','candidate cannot trigger','minor high confirmation','minor low confirmation','first opposite swing break','independent states','prefix stability','pivot and knowledge time','unfinished swing','one CHoCH per reversal','phase matrix'];
