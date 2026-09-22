'use client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { classifyPhase, phaseInfo, type Phase, type PhasePoint, type PhaseSide, type PhaseTimeline } from '@/lib/market-phases';
import type { Candle } from '@/lib/engine';

export const phaseKeys: Phase[] = ['CC','CP','PC','PP'];
export type PhaseSelection = { phase: Phase; side: PhaseSide; point?: PhasePoint };
const direction = (value: string) => value==='BULLISH'?'상승':value==='BEARISH'?'하락':'미확정';
const time = (at: number) => new Date(at).toLocaleString('ko-KR');

export function MarketPhaseControls({side,onSide,enabled,onToggle,current,error,onExplain}:{side:PhaseSide;onSide:(s:PhaseSide)=>void;enabled:Record<Phase,boolean>;onToggle:(p:Phase)=>void;current?:PhasePoint;error?:string;onExplain:(s:PhaseSelection)=>void}) {
  const phase=current?classifyPhase(side,current.swing,current.internal):null;
  return <section className="market-phase-controls" aria-label="시장 단계 표시 설정">
    <div className="market-phase-toolbar"><strong>시장 단계</strong><label>분류할 방향 <select value={side} onChange={e=>onSide(e.target.value as PhaseSide)}><option value="LONG">롱 기준</option><option value="SHORT">숏 기준</option></select></label>
      {phaseKeys.map(p=><button key={p} type="button" aria-pressed={enabled[p]} onClick={()=>onToggle(p)} style={{borderColor:enabled[p]?phaseInfo[p].color:undefined,color:phaseInfo[p].color}}>{p} {enabled[p]?'표시':'숨김'}</button>)}
      <button type="button" onClick={()=>onExplain({phase:phase??'CC',side,point:current})}>단계 뜻·판정 근거 ?</button>
    </div>
    <p>{error??(current?`이 화면 끝 기준 · ${side==='LONG'?'롱':'숏'} ${phase??'판정 대기'} / 반대 방향 ${classifyPhase(side==='LONG'?'SHORT':'LONG',current.swing,current.internal)??'판정 대기'} · 4H 스윙 ${direction(current.swing)} · 내부 ${direction(current.internal)} (${current.internalEvidence?.frame??'미확정'})`:'이 구간에는 확정된 상위 구조가 없습니다.')}</p>
    <p>색 띠와 세로선은 단계가 확인된 시간입니다. 진입 가격·체결 표시가 아닙니다. 띠를 눌러 당시 근거를 확인하세요. 일봉·4시간봉에서는 봉 안의 세부 변화가 합쳐질 수 있으므로 1시간 이하에서 확인하세요.</p>
  </section>;
}

export function MarketPhaseOverlay({timeline,side,enabled,data,offset,endIndex,x,top,bottom,left,right,onSelect}:{timeline:PhaseTimeline;side:PhaseSide;enabled:Record<Phase,boolean>;data:Candle[];offset:number;endIndex:number;x:(index:number)=>number;top:number;bottom:number;left:number;right:number;onSelect:(s:PhaseSelection)=>void}) {
  // Each candle is classified using only evidence available at its OPEN. A later
  // confirmation is never painted backwards onto the signal/pivot candle.
  const segments:{start:number;end:number;point:PhasePoint;phase:Phase}[]=[];
  for(let i=offset;i<endIndex;i++) {
    const at=Date.parse(data[i].date);
    const point=timeline.points.findLast(p=>p.at<=Math.min(at,timeline.through));
    const phase=point?classifyPhase(side,point.swing,point.internal):null;
    if(!point||!phase||!enabled[phase])continue;
    const previous=segments.at(-1);
    if(previous&&previous.phase===phase&&previous.end===i)previous.end=i+1;
    else segments.push({start:i,end:i+1,point,phase});
  }
  return <g aria-label={`${side==='LONG'?'롱':'숏'} 기준 시장 단계 위치`}>{segments.map(s=>{
    const start=Math.max(left,x(s.start-offset)), end=s.end>=endIndex?right:Math.min(right,x(s.end-offset));
    const color=phaseInfo[s.phase].color;
    return <g key={s.start} role="button" tabIndex={0} aria-label={`${time(s.point.at)} ${side} ${s.phase} 근거`} onPointerDown={e=>e.stopPropagation()} onClick={()=>onSelect({phase:s.phase,side,point:structuredClone(s.point)})} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect({phase:s.phase,side,point:structuredClone(s.point)});}}} style={{cursor:'pointer'}}>
      <title>{`${side} ${s.phase} · ${phaseInfo[s.phase].name} · ${time(s.point.at)} 확인 · 클릭하여 근거 보기`}</title>
      <line x1={start} x2={start} y1={top} y2={bottom-26} stroke={color} strokeDasharray="3 6" opacity="0.35"/>
      <rect x={start} y={bottom-25} width={Math.max(1,end-start)} height={24} fill={color} fillOpacity="0.22" stroke={color} strokeWidth="0.5"/>
      {end-start>35&&<text x={(start+end)/2} y={bottom-8} textAnchor="middle" fill={color} fontSize="13">{s.phase}</text>}
    </g>;
  })}</g>;
}

export function MarketPhaseHelp({selection,onClose}:{selection:PhaseSelection|null;onClose:()=>void}) {
  const p=selection?.point;
  return <Dialog open={Boolean(selection)} onOpenChange={v=>{if(!v)onClose();}}><DialogContent className="entry-reason-dialog"><DialogHeader><DialogTitle>시장 단계 · {selection?.side==='LONG'?'롱':'숏'} 기준</DialogTitle><DialogDescription>앞 글자는 스윙, 뒤 글자는 내부입니다. P는 같은 방향, C는 반대 방향입니다.</DialogDescription></DialogHeader>
    {selection&&<><section><h3>{selection.phase} · {phaseInfo[selection.phase].name}</h3><p>{phaseInfo[selection.phase].description}</p><p>{phaseInfo[selection.phase].use}</p><a href={`https://www.youtube.com/watch?v=ZQbf_ezRj4E&t=${phaseInfo[selection.phase].seconds}s`} target="_blank" rel="noreferrer">강의의 해당 사례 보기 ↗</a></section>
    <section><h3>이 구간은 왜 이렇게 분류됐나요?</h3>{p?<><p>{time(p.at)}까지 확인된 정보 · 4H 스윙 {direction(p.swing)}, 내부 {direction(p.internal)}. {selection.side==='LONG'?'롱은 상승':'숏은 하락'} 방향이므로 {classifyPhase(selection.side,p.swing,p.internal)??'구조 미확정으로 판정 보류'}입니다.</p>{[p.swingEvidence,p.internalEvidence].map((e,i)=>e?<p key={i}><b>{i===0?'스윙':'내부'} 근거:</b> {e.frame} {e.kind==='CHOCH'?'CHoCH':'BOS'} {direction(e.direction)} · 기준 수준 {e.price.toLocaleString('ko-KR',{maximumFractionDigits:4})} · {time(e.at)} 확정</p>:null)}{p.conflict&&<p>4H와 1H 내부 방향이 다릅니다. 사이트는 더 최근 확정 CHoCH를 적용하고, 동시 확인이면 4H를 우선합니다. 이 충돌 처리 방식은 구현 규칙이며 강의의 고정 공식이 아닙니다.</p>}{p.internalEvidence?.kind!=='CHOCH'&&<p>현재 내부 방향은 BOS로 초기화했습니다. 강의 사례의 ‘되돌림 후 CHoCH 확인’까지 갖췄다는 뜻은 아닙니다.</p>}</>:<p>확정된 4H/1H 정보가 없어 현재 단계는 판정하지 않았습니다. 아래는 용어 설명입니다.</p>}</section>
    <section><h3>네 단계를 함께 읽기</h3>{phaseKeys.map(k=><p key={k}><b style={{color:phaseInfo[k].color}}>{k} · {phaseInfo[k].name}</b><br/>{phaseInfo[k].description}</p>)}</section>
    <section><h3>가격 위치와 거래 계획도 확인하세요</h3><p>상승 스윙에서는 디스카운트의 롱, 하락 스윙에서는 프리미엄의 숏이라는 위치 맥락을 함께 봅니다. 단계는 방향 관계를 분류할 뿐, 그 위치에 도달했거나 승률이 검증됐다는 뜻은 아닙니다. Premium/Discount와 공통 거래 계획을 함께 확인하세요.</p><p>강의는 시장 단계를 필수 진입 조건이 아닌 분류·기록 도구로 소개합니다. 이 버튼은 차트 표시용이며 기존 자동 모의매매의 진입·손절·익절 규칙을 바꾸지 않습니다. 완료된 봉의 확인 시각 이후부터 표시하며, 구조 미확정 구간은 네 단계로 억지 분류하지 않습니다.</p></section></>}
  </DialogContent></Dialog>;
}
