import type {Candle} from './engine';
import {detectStructureEvents} from './engine.ts';
import {closedBars,validBars} from './confirmed-bars.ts';
import {mapMarketStructure,mechanicalInternalPivots} from './market-structure.ts';
import {marketPhaseTimeline,phaseAt,classifyPhase,type PhaseEvidence,type Phase} from './market-phases.ts';
type Trend='BULLISH'|'BEARISH'|'TRANSITION';
export type UpperFrame={swing:Trend;internal:Trend;lastBreak?:PhaseEvidence;choch?:PhaseEvidence};
export type UpperContext={asOf:number;h4:UpperFrame;h1:UpperFrame;phase:Phase|null;oppositePhase:Phase|null;confirmation?:PhaseEvidence;confirmed:boolean;reason:string};
function frameContext(rows:Candle[],frame:'4H'|'1H',now:number):UpperFrame{
 const minutes=frame==='4H'?240:60;
 if(!validBars(rows))return {swing:'TRANSITION',internal:'TRANSITION'};
 const bars=closedBars(rows,minutes,now);if(bars.length<6)return {swing:'TRANSITION',internal:'TRANSITION'};
 const events=detectStructureEvents(bars,mechanicalInternalPivots(bars),'INTERNAL',1);
 const evidence=(e:typeof events[number]):PhaseEvidence=>({at:Date.parse(bars[e.index].date)+minutes*60000,frame,scope:'INTERNAL',kind:e.kind,direction:e.direction,price:e.price});
 const last=events.at(-1),choch=events.findLast(e=>e.kind==='CHOCH');
 return {swing:mapMarketStructure(bars).trend,internal:last?.direction??'TRANSITION',lastBreak:last?evidence(last):undefined,choch:choch?evidence(choch):undefined};
}
export function confirmUpperContext(direction:'LONG'|'SHORT'|'NEUTRAL',h4:UpperFrame,h1:UpperFrame){
 const trend=direction==='LONG'?'BULLISH':direction==='SHORT'?'BEARISH':'TRANSITION';
 const evidence=[h4,h1].filter(f=>f.internal===trend&&f.choch?.direction===trend).map(f=>f.choch!).sort((a,b)=>b.at-a.at||(a.frame==='4H'?-1:1))[0];
 const confirmed=direction!=='NEUTRAL'&&h4.swing===trend&&h1.internal===trend&&!!evidence;
 const reason=direction==='NEUTRAL'||h4.swing!==trend?'4시간 스윙 방향 확인 대기':h1.internal!==trend?'1시간 내부 흐름이 계획 방향과 달라 전환 확인 대기':!evidence?'4시간 또는 1시간 내부 CHoCH 확인 대기 · BOS 방향 일치만으로 전환을 확인하지 않습니다.':`${evidence.frame} 내부 CHoCH와 1시간 내부 방향 확인 · 하위 진입 조건을 이어서 확인합니다.`;
 return {confirmed,confirmation:evidence,reason};
}
export function upperContext(data:Partial<Record<'4H'|'1H',Candle[]>>,now:number,direction:'LONG'|'SHORT'|'NEUTRAL'):UpperContext{
 const h4=frameContext(data['4H']??[],'4H',now),h1=frameContext(data['1H']??[],'1H',now);
 const point=phaseAt(marketPhaseTimeline(data,now),now);
 return {asOf:now,h4,h1,phase:point&&direction!=='NEUTRAL'?classifyPhase(direction,point.swing,point.internal):null,oppositePhase:point&&direction!=='NEUTRAL'?classifyPhase(direction==='LONG'?'SHORT':'LONG',point.swing,point.internal):null,...confirmUpperContext(direction,h4,h1)};
}
