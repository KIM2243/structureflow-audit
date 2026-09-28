import type {Candle} from './engine';
import {detectStructureEvents} from './engine.ts';
import {mapMarketStructure,mechanicalInternalPivots} from './market-structure.ts';
import {closedBars,validBars} from './confirmed-bars.ts';
import {mapFalconSwingStructure,type FalconObservation} from './falcon-structure.ts';
import {mapFalconInternalStructure} from './falcon-internal.ts';
import {classifyPhase} from './market-phases.ts';
export const falconFrames={'4H':240,'1H':60,'15m':15,'5m':5,'1m':1} as const;
export type FalconFrame=keyof typeof falconFrames;
// Same conservative completed-bar contract as production. Future OHLC is never
// handed to either shadow engine. observedAt is close, not candle-open time.
export function historicalFalconObservations(bars:Candle[],minutes:number,now:number):FalconObservation[]{
 if(!Number.isFinite(now)||!Number.isFinite(minutes)||minutes<=0)throw new Error('Invalid historical cutoff');
 const closed=closedBars(bars,minutes,now);
 if(!validBars(closed))throw new Error('Invalid completed OHLCV');
 return closed.map((candle,index)=>({index,candle,complete:true,observedAt:Date.parse(candle.date)+minutes*60000}));
}
export function compareFalconStructure(rows:readonly FalconObservation[]){
 const candles=rows.map(r=>r.candle),legacySwing=mapMarketStructure(candles),legacyEvents=detectStructureEvents(candles,mechanicalInternalPivots(candles),'INTERNAL',1);
 const swing=mapFalconSwingStructure(rows),internal=mapFalconInternalStructure(rows);
 return {legacySwingDirection:legacySwing.trend,legacyInternalDirection:legacyEvents.at(-1)?.direction??'TRANSITION',falconSwingDirection:swing.trend,falconInternalDirection:internal.trend,legacyEvent:legacyEvents.at(-1),falconEvent:internal.events.at(-1),protectedLevel:swing.protectedLevel,weakLevel:swing.weakLevel,confirmedMinorHigh:internal.confirmedMinorHigh,confirmedMinorLow:internal.confirmedMinorLow,swing,internal};
}
export function falconDifferential(rows:readonly FalconObservation[]){
 return rows.map((row,n)=>{const result=compareFalconStructure(rows.slice(0,n+1));return {barIndex:row.index,date:row.candle.date,observedAt:row.observedAt,...result,difference:result.legacySwingDirection!==result.falconSwingDirection||result.legacyInternalDirection!==result.falconInternalDirection};});
}
// Test/development context only. This does not grant trade readiness or call an
// account/DB/API. Legacy production gating is intentionally unchanged.
export function falconMtfShadow(data:Partial<Record<FalconFrame,Candle[]>>,now:number,entryFrame:'1m'|'5m'='1m'){
 const frames=Object.fromEntries(Object.entries(falconFrames).map(([frame,minutes])=>[frame,compareFalconStructure(historicalFalconObservations(data[frame as FalconFrame]??[],minutes,now))])) as Record<FalconFrame,ReturnType<typeof compareFalconStructure>>;
 const direction=frames['4H'].falconSwingDirection;
 const alignedChoch=(frame:FalconFrame)=>{const s=frames[frame].internal;return direction!=='TRANSITION'&&s.trend===direction&&s.events.findLast(e=>e.kind==='CHOCH')?.direction===direction;};
 const upperChoch=alignedChoch('4H')||alignedChoch('1H');
 const structuralCandidate=direction!=='TRANSITION'&&frames['1H'].falconInternalDirection===direction&&upperChoch&&alignedChoch('15m')&&alignedChoch(entryFrame);
 const differenceReason=Object.entries(frames).filter(([,v])=>v.legacySwingDirection!==v.falconSwingDirection||v.legacyInternalDirection!==v.falconInternalDirection).map(([frame])=>`${frame}: legacy/Falcon structure differs`);
 return {mode:'SHADOW_ONLY' as const,productionGateChanged:false,frames,structuralCandidate,upperChoch,phase:{LONG:classifyPhase('LONG',direction,frames['1H'].falconInternalDirection),SHORT:classifyPhase('SHORT',direction,frames['1H'].falconInternalDirection)},differenceReason};
}
