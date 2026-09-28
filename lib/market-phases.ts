import { detectStructureEvents, type Candle, type StructureEvent } from './engine.ts';
import { mapMarketStructure, mechanicalInternalPivots } from './market-structure.ts';
import { closedBars, validBars } from './confirmed-bars.ts';

export type Phase = 'CC' | 'CP' | 'PC' | 'PP';
export type PhaseSide = 'LONG' | 'SHORT';
type Trend = 'BULLISH' | 'BEARISH' | 'TRANSITION';
export type PhaseEvidence = { at: number; frame: '4H' | '1H'; kind: StructureEvent['kind']; direction: Trend; price: number; scope: StructureEvent['scope'] };
export type PhasePoint = { at: number; swing: Trend; internal: Trend; swingEvidence?: PhaseEvidence; internalEvidence?: PhaseEvidence; conflict: boolean };
export type PhaseTimeline = { points: PhasePoint[]; through: number; error?: string };

// A phase classifies a proposed position, not a chart independently of direction.
export function classifyPhase(side: PhaseSide, swing: Trend, internal: Trend): Phase | null {
  if (swing === 'TRANSITION' || internal === 'TRANSITION') return null;
  const direction = side === 'LONG' ? 'BULLISH' : 'BEARISH';
  return `${swing === direction ? 'P' : 'C'}${internal === direction ? 'P' : 'C'}` as Phase;
}

// Latest confirmed CHoCH wins across 4H/1H; simultaneous evidence prefers 4H.
// This tie/conflict policy is an explicit implementation choice, not a lecture formula.
export function phaseStates(events: PhaseEvidence[]): PhasePoint[] {
  const ordered = [...events].sort((a,b) => a.at-b.at || (a.frame === '1H' ? -1 : 1));
  let swing: Trend = 'TRANSITION';
  let swingEvidence: PhaseEvidence | undefined, internalEvidence: PhaseEvidence | undefined;
  const latest: Partial<Record<'4H'|'1H', PhaseEvidence>> = {};
  const points: PhasePoint[] = [];
  for (let i=0;i<ordered.length;) {
    const at=ordered[i].at;
    while (i<ordered.length && ordered[i].at===at) {
      const e=ordered[i++];
      if(e.scope==='SWING') { swing=e.kind==='BOS'?e.direction:'TRANSITION'; swingEvidence=e; }
      else {
        latest[e.frame]=e;
        if(e.kind==='CHOCH' || !internalEvidence || internalEvidence.kind!=='CHOCH' && e.frame==='4H') internalEvidence=e;
      }
    }
    points.push({at,swing,internal:internalEvidence?.direction??'TRANSITION',swingEvidence,internalEvidence,
      conflict:Boolean(latest['4H'] && latest['1H'] && latest['4H'].direction!==latest['1H'].direction)});
  }
  return points;
}

export function marketPhaseTimeline(data: Partial<Record<'4H'|'1H', Candle[]>>, now: number): PhaseTimeline {
  const h4=data['4H']??[], h1=data['1H']??[];
  if(!validBars(h4)||!validBars(h1)) return {points:[],through:now,error:'4H/1H 시각 또는 OHLCV 오류 · 단계 판정 보류'};
  const events: PhaseEvidence[]=[];
  for(const [frame,raw,minutes] of [['4H',h4,240],['1H',h1,60]] as const) {
    const bars=closedBars(raw,minutes,now);
    if(bars.length<6) return {points:[],through:now,error:`${frame} 확정 봉 부족 · 단계 판정 보류`};
    const internal=detectStructureEvents(bars,mechanicalInternalPivots(bars),'INTERNAL',1);
    const selected=frame==='4H'?[...mapMarketStructure(bars).events,...internal]:internal;
    for(const e of selected) events.push({at:Date.parse(bars[e.index].date)+minutes*60_000,frame,kind:e.kind,direction:e.direction,price:e.price,scope:e.scope});
  }
  return {points:phaseStates(events),through:now};
}

export function phaseAt(timeline: PhaseTimeline, at: number) {
  return timeline.points.findLast(point=>point.at<=Math.min(at,timeline.through));
}

export function phasePendingReasons(point?: PhasePoint, error?: string): string[] {
  if(error) return [error, '4H/1H 데이터가 정상적으로 준비된 뒤 다시 판정합니다.'];
  if(!point) return ['이 시점까지 확인된 4H 스윙·내부 구조 근거가 없습니다. 이후 봉의 정보를 과거에 적용하지 않습니다.'];
  const reasons: string[]=[];
  if(point.swing==='TRANSITION') reasons.push(point.swingEvidence?.kind==='CHOCH'
    ? '4H 스윙 CHoCH(기존 구조 변화)는 확인됐지만, 새 스윙 방향을 확정할 후속 BOS(구조 돌파)가 아직 없습니다. 사이트는 그때까지 스윙을 미확정으로 처리합니다.'
    : '4H 스윙 방향을 확정할 BOS(구조 돌파) 근거가 아직 없습니다.');
  if(point.internal==='TRANSITION') reasons.push('4H/1H 내부 방향이 미확정입니다. 완료된 봉에서 내부 구조 방향이 확인되어야 합니다.');
  return reasons;
}

export function marketPhaseSegments(timeline: PhaseTimeline, side: PhaseSide, data: Candle[], offset: number, endIndex: number) {
  const segments: {start:number;end:number;point?:PhasePoint;phase:Phase|null;at:number;error?:string}[]=[];
  for(let i=offset;i<endIndex;i++) {
    const at=Date.parse(data[i].date);
    const point=timeline.error?undefined:phaseAt(timeline,at);
    const phase=point?classifyPhase(side,point.swing,point.internal):null;
    const previous=segments.at(-1);
    // Preserve evidence changes even when the two-letter phase stays the same.
    if(previous&&previous.phase===phase&&previous.point===point) previous.end=i+1;
    else segments.push({start:i,end:i+1,point,phase,at:Math.min(at,timeline.through),error:timeline.error});
  }
  return segments;
}

export const phaseInfo: Record<Phase,{name:string;description:string;use:string;seconds:number;color:string}> = {
  CC:{name:'스윙 반대 · 내부 반대',description:'진입하려는 방향이 큰 스윙과 내부 흐름 모두에 역행합니다.',use:'강의에서는 가장 공격적인 단계로 설명합니다. 역추세 되돌림은 최소 1시간 CHoCH 확인을 기다리는 규칙을 제시합니다.',seconds:414,color:'#ef7887'},
  CP:{name:'스윙 반대 · 내부 동행',description:'큰 스윙과는 반대지만 내부 전환 방향을 따르는 되돌림 매매입니다.',use:'4H 또는 1H CHoCH 확인과 되돌릴 공간을 함께 봅니다. 상승 스윙의 디스카운트까지 내려온 뒤 숏을 계속 추격하는 것은 강의 사례의 취지와 다릅니다.',seconds:470,color:'#50d6b1'},
  PC:{name:'스윙 동행 · 내부 반대',description:'큰 추세 방향으로 진입하려 하지만 내부 되돌림은 아직 반대 방향입니다.',use:'강의의 롱 사례는 상승 스윙의 디스카운트입니다. 하락 스윙에서는 프리미엄을 봅니다. 내부 CHoCH를 더 기다리면 PP로 분류할 근거가 생깁니다.',seconds:523,color:'#edbb63'},
  PP:{name:'스윙 동행 · 내부 동행',description:'진입 방향이 큰 스윙과 내부 흐름 모두에 일치합니다.',use:'강의는 되돌림 후 4H/1H CHoCH와 약한 스윙 극점을 연결합니다. 방향 일치만으로 적절한 가격·손절·목표가 확보되거나 진입이 승인되지는 않습니다.',seconds:589,color:'#8ca9ff'},
};
