import type { Candle } from './engine';

export type FalconDirection = 'BULLISH' | 'BEARISH';
export type FalconPoint = { pivotIndex:number; price:number; kind:'high'|'low'; confirmedAt:number; observedAt:number };
export type FalconObservation = { index:number; candle:Candle; complete:boolean; observedAt:number };
export type FalconEvent = { scope:'SWING'|'INTERNAL'; kind:'BOS'|'CHOCH'; direction:FalconDirection; pivotIndex:number; confirmedAt:number; eventIndex:number; observedAt:number; price:number };
export type FalconSwingSeed = { direction:FalconDirection; strong:FalconPoint; weak:FalconPoint; knownAt:number };
export type FalconSwingResult = { trend:FalconDirection|'TRANSITION'; protectedLevel?:FalconPoint; weakLevel?:FalconPoint; initialDirection?:{index:number;observedAt:number}; events:FalconEvent[]; points:FalconPoint[] };

// Explicit, already-known anchors avoid inventing a lecture bootstrap rule.
function validPoint(p:FalconPoint, knownAt:number) {
 return Number.isInteger(p.pivotIndex)&&p.pivotIndex>=0&&Number.isInteger(p.confirmedAt)&&p.confirmedAt>=p.pivotIndex&&p.confirmedAt<=knownAt&&Number.isFinite(p.price)&&p.price>0&&Number.isFinite(p.observedAt);
}
export function validateObservations(rows:readonly FalconObservation[], knownAt:number, observedAt:number) {
 let index=knownAt, time=observedAt;
 for(const r of rows){const b=r.candle;
  if(!Number.isInteger(r.index)||r.index<=index||!Number.isFinite(r.observedAt)||r.observedAt<time||!Number.isFinite(Date.parse(b.date))||r.observedAt<Date.parse(b.date)||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close)||b.volume<0)throw new Error('Invalid or out-of-order Falcon observation');
  index=r.index;time=r.observedAt;
 }
}
export function type1Break(direction:FalconDirection, level:number, observation:FalconObservation) {
 return observation.complete&&(direction==='BULLISH'?observation.candle.close>level:observation.candle.close<level);
}
export function mapFalconSwingStructure(rows:readonly FalconObservation[], seed?:FalconSwingSeed):FalconSwingResult {
 if(!seed)return initializeFalconSwing(rows);
 if(!validPoint(seed.strong,seed.knownAt)||!validPoint(seed.weak,seed.knownAt)||seed.strong.pivotIndex===seed.weak.pivotIndex||seed.strong.kind!==(seed.direction==='BULLISH'?'low':'high')||seed.weak.kind===seed.strong.kind||(seed.direction==='BULLISH'?seed.strong.price>=seed.weak.price:seed.strong.price<=seed.weak.price))throw new Error('Independent confirmed swing seed required');
 validateObservations(rows,seed.knownAt,Math.max(seed.strong.observedAt,seed.weak.observedAt));
 let trend=seed.direction,strong={...seed.strong},weak={...seed.weak};
 let candidate:FalconPoint|undefined, weakConfirmed=true;
 const events:FalconEvent[]=[],points:FalconPoint[]=[];
 const point=(r:FalconObservation,kind:'high'|'low'):FalconPoint=>({pivotIndex:r.index,price:r.candle[kind],kind,confirmedAt:r.index,observedAt:r.observedAt});
 for(const r of rows){if(!r.complete)continue;
  const bullish=trend==='BULLISH',opposite=bullish?'BEARISH':'BULLISH';
  const reversal=type1Break(opposite,strong.price,r),continuation=type1Break(trend,weak.price,r);
  if(reversal||continuation&&(weakConfirmed||candidate)){
   const target=reversal?strong:weak;const next=reversal?opposite:trend;
   events.push({scope:'SWING',kind:reversal?'CHOCH':'BOS',direction:next,pivotIndex:target.pivotIndex,confirmedAt:target.confirmedAt,eventIndex:r.index,observedAt:r.observedAt,price:target.price});
   if(reversal){strong={...weak,confirmedAt:r.index,observedAt:r.observedAt};points.push({...strong});}
   else if(candidate){strong={...candidate,confirmedAt:r.index,observedAt:r.observedAt};points.push({...strong});}
   trend=next;weak=point(r,trend==='BULLISH'?'high':'low');weakConfirmed=false;candidate=undefined;
  }else{
   const extendsExtreme=bullish?r.candle.high>weak.price:r.candle.low<weak.price;
   if(!candidate&&extendsExtreme&&!weakConfirmed){weak=point(r,bullish?'high':'low');weakConfirmed=false;}
   else if(!extendsExtreme){const p=point(r,bullish?'low':'high');if(p.pivotIndex!==weak.pivotIndex&&(!candidate||(bullish?p.price<candidate.price:p.price>candidate.price)))candidate=p;}
  }
 }
 return {trend,protectedLevel:strong,weakLevel:weak,events,points};
}

// StructureFlow implementation choice: bootstrap needs a directional extension,
// a separate pullback candle, then a CLOSE through the pre-pullback extreme.
function initializeFalconSwing(rows:readonly FalconObservation[]):FalconSwingResult {
 validateObservations(rows,-1,-Infinity);
 const completed=rows.filter(r=>r.complete);
 const empty:FalconSwingResult={trend:'TRANSITION',events:[],points:[]};
 let leg:FalconDirection|undefined,extreme:FalconObservation|undefined,candidate:FalconObservation|undefined;
 for(let n=1;n<completed.length;n++){const r=completed[n],previous=completed[n-1];
  if(!leg){const up=r.candle.high>previous.candle.high,down=r.candle.low<previous.candle.low;if(up===down)continue;leg=up?'BULLISH':'BEARISH';extreme=r;continue;}
  if(!extreme)continue;const up=leg==='BULLISH';
  if(candidate&&type1Break(leg,extreme.candle[up?'high':'low'],r)){
   const mk=(o:FalconObservation,kind:'high'|'low'):FalconPoint=>({pivotIndex:o.index,price:o.candle[kind],kind,confirmedAt:r.index,observedAt:r.observedAt});
   const strong=mk(candidate,up?'low':'high'),weak=mk(r,up?'high':'low');
   const result=mapFalconSwingStructure(rows.filter(x=>x.index>r.index),{direction:leg,strong,weak,knownAt:r.index});
   return {...result,initialDirection:{index:r.index,observedAt:r.observedAt},points:[strong,...result.points]};
  }
  const extendsExtreme=up?r.candle.high>extreme.candle.high:r.candle.low<extreme.candle.low;
  if(!candidate&&extendsExtreme)extreme=r;
  else if(!extendsExtreme&&(!candidate||(up?r.candle.low<candidate.candle.low:r.candle.high>candidate.candle.high)))candidate=r;
 }
 return empty;
}
