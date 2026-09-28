import type {FalconDirection,FalconEvent,FalconObservation,FalconPoint} from './falcon-structure';
import {validateObservations,validFalconPoint} from './falcon-structure.ts';
export type InternalCandidate={pivotIndex:number;price:number;kind:'high'|'low';detectedAt:number;observedAt:number};
export type FalconInternalSeed={direction:FalconDirection;extreme:FalconPoint;minor?:FalconPoint;knownAt:number};
export type FalconInternalResult={trend:FalconDirection|'TRANSITION';activeLeg?:FalconDirection;currentExtreme?:{pivotIndex:number;price:number};pullbackDetected:boolean;candidate?:InternalCandidate;confirmedMinorHigh?:FalconPoint;confirmedMinorLow?:FalconPoint;points:FalconPoint[];events:FalconEvent[];initialDirection?:{index:number;observedAt:number};ambiguities:{eventIndex:number;reason:'SAME_BAR_AMBIGUOUS'}[]};
export function type2Break(direction:FalconDirection, point:FalconPoint, observation:FalconObservation){
 return point.confirmedAt<observation.index&&point.observedAt<=observation.observedAt&&(direction==='BULLISH'?observation.candle.high>point.price:observation.candle.low<point.price);
}
export function mapFalconInternalStructure(rows:readonly FalconObservation[],seed?:FalconInternalSeed):FalconInternalResult{
 if(seed){const p=seed.minor,e=seed.extreme;if(!validFalconPoint(e,seed.knownAt)||p&&!validFalconPoint(p,seed.knownAt)||e.confirmedAt>seed.knownAt||e.confirmedAt<e.pivotIndex||e.kind!==(seed.direction==='BULLISH'?'high':'low')||!Number.isFinite(e.price)||e.price<=0||p&&(p.confirmedAt>seed.knownAt||p.confirmedAt<p.pivotIndex||p.kind===e.kind||!Number.isFinite(p.price)||p.price<=0))throw new Error('Known internal seed required');}
 validateObservations(rows,seed?.knownAt??-1,seed?Math.max(seed.extreme.observedAt,seed.minor?.observedAt??-Infinity):-Infinity);
 let trend:FalconInternalResult['trend']=seed?.direction??'TRANSITION',leg=seed?.direction,extreme=seed?{pivotIndex:seed.extreme.pivotIndex,price:seed.extreme.price}:undefined;
 let candidate:InternalCandidate|undefined,high=seed?.minor?.kind==='high'?{...seed.minor}:undefined,low=seed?.minor?.kind==='low'?{...seed.minor}:undefined,initialDirection:FalconInternalResult['initialDirection'];
 const points:FalconPoint[]=[],events:FalconEvent[]=[],ambiguities:FalconInternalResult['ambiguities']=[];
 for(let n=0;n<rows.length;n++){const r=rows[n],b=r.candle;
  if(!leg){const prev=rows[n-1];if(!prev)continue;const up=b.high>prev.candle.high,down=b.low<prev.candle.low;if(up===down)continue;leg=up?'BULLISH':'BEARISH';extreme={pivotIndex:r.index,price:up?b.high:b.low};continue;}
  if(!extreme)continue;
  const bullish=leg==='BULLISH',next=bullish?'BEARISH':'BULLISH',minor=bullish?low:high;
  // Only a point known before this bar is eligible. Evaluate before promotion.
  if(trend!=='TRANSITION'&&minor&&type2Break(next,minor,r)){
   events.push({scope:'INTERNAL',kind:'CHOCH',direction:next,pivotIndex:minor.pivotIndex,confirmedAt:minor.confirmedAt,eventIndex:r.index,observedAt:r.observedAt,price:minor.price});
   trend=next;leg=next;extreme={pivotIndex:r.index,price:next==='BULLISH'?b.high:b.low};candidate=undefined;high=undefined;low=undefined;continue;
  }
  const extendsExtreme=bullish?b.high>extreme.price:b.low<extreme.price;
  if(extendsExtreme){
   if(candidate){const p:FalconPoint={pivotIndex:candidate.pivotIndex,price:candidate.price,kind:candidate.kind,confirmedAt:r.index,observedAt:r.observedAt};points.push(p);if(p.kind==='high')high=p;else low=p;
    if(bullish?b.low<p.price:b.high>p.price)ambiguities.push({eventIndex:r.index,reason:'SAME_BAR_AMBIGUOUS'});
    if(trend==='TRANSITION'){trend=leg;initialDirection={index:r.index,observedAt:r.observedAt};}
    else events.push({scope:'INTERNAL',kind:'BOS',direction:leg,pivotIndex:extreme.pivotIndex,confirmedAt:candidate.detectedAt,eventIndex:r.index,observedAt:r.observedAt,price:extreme.price});
   }
   extreme={pivotIndex:r.index,price:bullish?b.high:b.low};candidate=undefined;
  }else{
   const price=bullish?b.low:b.high;
   // Implementation choice: candidate window starts on the failure bar and
   // ends before the extension/confirmation bar; no assumed intrabar ordering.
   if(!candidate||(bullish?price<candidate.price:price>candidate.price))candidate={pivotIndex:r.index,price,kind:bullish?'low':'high',detectedAt:candidate?.detectedAt??r.index,observedAt:r.observedAt};
  }
 }
 return {trend,activeLeg:leg,currentExtreme:extreme,pullbackDetected:!!candidate,candidate,confirmedMinorHigh:high,confirmedMinorLow:low,points,events,initialDirection,ambiguities};
}
