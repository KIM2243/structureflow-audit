import { closedBars, validBars, type AutoDecision, type AutoFeed } from './auto-paper.ts';
import type { Candle } from './engine';
export const replayFrames = ['4H','1H','15m','5m','1m'] as const;
export type ReplayFrame = typeof replayFrames[number];
export type DecisionReplay = { schema: 'decision-replay-v1'; decision: AutoDecision; candles: Record<ReplayFrame,Candle[]> };
// Store the exact completed input, never fetch today's history to recreate yesterday.
export function makeDecisionReplay(decision: AutoDecision, feed: AutoFeed): DecisionReplay | undefined {
  if(decision.stage==='DATA_WAIT'||feed.symbol!==decision.symbol)return;
  const candles={} as DecisionReplay['candles'];
  for(const frame of replayFrames){
    const rows=feed.timeframes[frame]||[];
    if(frame==='5m'&&!rows.length){candles[frame]=[];continue;}
    if(!validBars(rows))return;
    candles[frame]=structuredClone(closedBars(rows,({'4H':240,'1H':60,'15m':15,'5m':5,'1m':1})[frame],decision.at));
  }
  return {schema:'decision-replay-v1',decision:structuredClone(decision),candles};
}
