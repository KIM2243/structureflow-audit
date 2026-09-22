'use client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { classifyPhase, phaseMarkers, phaseInfo, type Phase, type PhasePoint, type PhaseSide, type PhaseTimeline } from '@/lib/market-phases';
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
    <p>단계가 바뀐 확인 봉에 테두리와 라벨을 표시합니다. 롱 기준은 봉 아래, 숏 기준은 봉 위입니다. 라벨을 누르면 확인 시각과 근거를 볼 수 있습니다. 큰 봉 안의 여러 변화는 1시간 이하에서 더 정확히 구분하세요. 진입·체결 표시는 아닙니다.</p>
  </section>;
}

export function MarketPhaseOverlay({timeline,side,enabled,data,offset,endIndex,x,y,minutes,top,bottom,left,right,onSelect}:{timeline:PhaseTimeline;side:PhaseSide;enabled:Record<Phase,boolean>;data:Candle[];offset:number;endIndex:number;x:(index:number)=>number;y:(price:number)=>number;minutes:number;top:number;bottom:number;left:number;right:number;onSelect:(s:PhaseSelection)=>void}) {
  const occupied: {x:number;y:number}[]=[];
  const markers=phaseMarkers(timeline,side,data,minutes).filter(m=>m.index>=offset&&m.index<endIndex&&enabled[m.phase]);
  return <g aria-label={side==='LONG'?'롱 기준 시장 단계 확인 봉':'숏 기준 시장 단계 확인 봉'}>{markers.map((m,n)=>{
    const bar=data[m.index], cx=x(m.index-offset), color=phaseInfo[m.phase].color;
    const high=y(bar.high), low=y(bar.low);
    if(low<top||high>bottom)return null;
    const anchor=Math.max(top,Math.min(bottom,side==='LONG'?low:high));
    const labelX=Math.max(left+23,Math.min(right-23,cx));
    let labelY=Math.max(top+13,Math.min(bottom-13,anchor+(side==='LONG'?24:-24)));
    for(let lane=0;lane<16&&occupied.some(p=>Math.abs(p.x-labelX)<49&&Math.abs(p.y-labelY)<27);lane++) {
      const distance=24+27*(Math.floor(lane/2)+1);
      const sign=(lane%2===0?1:-1)*(side==='LONG'?1:-1);
      labelY=Math.max(top+13,Math.min(bottom-13,anchor+distance*sign));
    }
    occupied.push({x:labelX,y:labelY});
    const half=Math.max(2,Math.min(11,Math.abs(x(1)-x(0))*.4));
    const open=()=>onSelect({phase:m.phase,side,point:structuredClone(m.point)});
    return <g key={m.point.at+'-'+n} className="market-phase-marker" role="button" tabIndex={0} aria-label={time(m.point.at)+' '+side+' '+m.phase+' 확인 봉 근거'} onPointerDown={e=>e.stopPropagation()} onClick={open} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}}} style={{cursor:'pointer'}}>
      <title>{side+' '+m.phase+' · '+time(m.point.at)+' 확인 · 봉 시작 '+time(Date.parse(bar.date))+' · 진입 체결 아님'}</title>
      <rect x={cx-half-2} y={Math.max(top,high)-2} width={half*2+4} height={Math.max(5,Math.min(bottom,low)-Math.max(top,high)+4)} fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.3"/>
      <line x1={cx} y1={anchor} x2={labelX} y2={labelY} stroke={color} strokeWidth="1.2"/>
      <circle cx={cx} cy={anchor} r="3" fill={color}/>
      <rect x={labelX-22} y={labelY-12} width="44" height="24" rx="5" fill="#101922" stroke={color}/>
      <text x={labelX} y={labelY+4.5} textAnchor="middle" fill={color} fontSize="14" fontWeight="700">{m.phase}</text>
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
