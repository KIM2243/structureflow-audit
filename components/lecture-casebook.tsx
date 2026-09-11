'use client';
import {useState} from 'react';
import {lectureCases} from '@/lib/lecture-cases';
import type {AutoState} from '@/lib/auto-paper';
import {DecisionReplayPanel} from './decision-replay';
type Run={id:string;config:{symbol:string;market:string};state:AutoState};
const time=(at?:number)=>at?new Date(at).toLocaleString('ko-KR'):'미확인';
export function LectureCasebook(){
  const [caseId,setCaseId]=useState<string>(lectureCases[0].id),[runs,setRuns]=useState<Run[]>([]),[selection,setSelection]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[showChart,setShowChart]=useState(false);
  const [verdicts,setVerdicts]=useState<Record<string,string>>({}),[notes,setNotes]=useState('');
  const item=lectureCases.find(c=>c.id===caseId)!;
  const candidates=runs.flatMap(r=>(r.state.decisions||[]).map(d=>({run:r,d,key:`${r.id}:${d.at}`})));
  const chosen=candidates.find(c=>c.key===selection),d=chosen?.d;
  async function load(){setBusy(true);setError('');try{const r=await fetch('/api/paper/auto',{cache:'no-store'});const p=await r.json() as {runs:Run[];error?:string};if(!r.ok)throw new Error(p.error);setRuns(p.runs);setLoaded(true);}catch(e){setError(e instanceof Error?e.message:'불러오기 실패');}finally{setBusy(false);}}
  function resetReview(){setVerdicts({});setNotes('');setShowChart(false);}
  function download(){const review={schema:'lecture-comparison-v1',exportedAt:new Date().toISOString(),case:item,evidenceBasis:'기존 검토 메모 기반 · 원본 장면 재검증 미완료',runId:chosen?.run.id||null,decision:d||null,reviewerVerdicts:verdicts,notes};const url=URL.createObjectURL(new Blob([JSON.stringify(review,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`lecture-case-${item.id}.json`;a.click();URL.revokeObjectURL(url);}
  return <section className="lecture-casebook">
    <h2>강의 비교 기준 사례집</h2>
    <p>기존에 검토한 장면을 찾아보고 실제 자동매매 판단과 비교하는 검토용 사례입니다. 정확한 종목·거래일·가격과 진입 정답은 확보되지 않았으므로, 검증 완료 사례나 승률 표본으로 집계하지 않습니다.</p>
    <div className="casebook-tabs">{lectureCases.map(c=><button key={c.id} aria-pressed={c.id===caseId} onClick={()=>{setCaseId(c.id);resetReview();}}>{c.lecture} · {c.time}<br/>{c.title}</button>)}</div>
    <div className="casebook-columns"><article><h3>{item.title}</h3><a href={`https://www.youtube.com/watch?v=${item.video}&t=${item.seconds}s`} target="_blank" rel="noreferrer">강의 {item.lecture} · {item.time} 장면 열기</a><p>{item.evidence}</p><p>{item.principle}</p><p><b>시스템 가정과 구분</b><br/>{item.boundary}</p><p>출처 상태: 과거 검토 메모 기반 · 이번 업데이트에서 영상 전체를 다시 검증한 것은 아닙니다.</p></article>
    <article><h3>비교할 자동매매 판단</h3><button disabled={busy} onClick={()=>void load()}>{busy?'불러오는 중…':'판단 기록 불러오기'}</button>{error&&<p role="alert">{error}</p>}
      <label>실험·판단 선택<select value={selection} onChange={e=>{setSelection(e.target.value);resetReview();}}><option value="">기록을 선택하세요</option>{candidates.map(c=><option key={c.key} value={c.key}>{c.run.config.market} {c.run.config.symbol} · {time(c.d.at)} · {c.d.reason}</option>)}</select></label>
      {loaded&&!candidates.length&&<p>저장된 판단이 없습니다. 자동 실험에서 기록이 쌓인 뒤 비교할 수 있습니다.</p>}
      {d?<><p><b>{d.symbol} · {d.stage}</b><br/>{d.reason}</p><p>모델 {d.model} · 방향 {d.setup?.direction||d.position?.direction||'미확정'} · 관측가 {d.price??'없음'}</p><p>4H 접촉 {time(d.setup?.touch)}<br/>15분 확정 {time(d.setup?.m15?.at)}<br/>15분 재접촉 {time(d.setup?.retest)}<br/>1분 확정 {time(d.setup?.m1?.at)}</p>
      {(['zone','m15','m1'] as const).map((key,i)=>{const z=d.setup?.[key];return z?<p key={key}>{['4H','15m','1m'][i]} 구역 {z.low}–{z.high} · {z.quality?`${z.quality.grade}등급 ${z.quality.score}/${z.quality.maximum}`:'등급 미확인'}</p>:null;})}
      {d.checks&&<p>1분 구역 안: {d.checks.insideM1?'예':'아니오'} · 확정 이후: {d.checks.afterM1?'예':'아니오'} · 가중 목표 {d.checks.weightedR.toFixed(2)}R · 후보 수량 {d.checks.quantity}주</p>}
      <p>이번 판단 체결 {d.fills.length}건 · 출처 {d.source||'없음'} · 시세 시각 {time(d.observedAt||undefined)}</p>
      {d.replayKey?<button onClick={()=>setShowChart(p=>!p)}>{showChart?'차트 닫기':'저장 차트로 확인'}</button>:<p>당시 저장 차트 없음 · 현재 차트로 대체하지 않습니다.</p>}</>:<p>강의와 같은 거래를 재현한 데이터가 아닌, 선택한 실험의 구조·순서 비교입니다.</p>}
    </article></div>
    {chosen&&showChart&&<DecisionReplayPanel key={selection} runId={chosen.run.id} at={chosen.d.at} onClose={()=>setShowChart(false)}/>}
    <h3>항목별 검토</h3><p>아래 판정은 사용자가 원본 장면과 기록을 보고 작성합니다. 자동으로 ‘강의와 일치’ 판정을 내리지 않습니다.</p>
    {item.questions.map(([title,question])=><div className="casebook-question" key={title}><div><b>{title}</b><p>{question}</p></div><label>검토 결과<select value={verdicts[title]||'미검토'} onChange={e=>setVerdicts(v=>({...v,[title]:e.target.value}))}>{['미검토','원칙에 부합','차이 발견','자료 부족','해당 없음'].map(v=><option key={v}>{v}</option>)}</select></label></div>)}
    <label>차이와 후속 확인 메모<textarea value={notes} maxLength={5000} onChange={e=>setNotes(e.target.value)} placeholder="강의에서 확인한 근거, 선택한 구역의 차이, 놓친 진입 또는 성급한 진입 등을 기록하세요."/></label>
    <p>검토 메모는 이 화면에서만 유지됩니다. 사례·판단을 바꾸거나 화면을 나가기 전에 내려받으세요. 자동 판단 기록과 차트는 기존 최근 200건 보관 정책을 따릅니다.</p>
    <button onClick={download}>사례·판단·검토 메모 내려받기</button>
    <details><summary>확정 기준 사례로 발전시키려면</summary><p>원본 장면의 종목·거래일·시간대·구역 경계·진입/대기 시점이 필요합니다. 같은 기간의 원본 OHLCV와 일치시키고, 강사의 선택과 프로그램 결과를 대조한 뒤 기준값을 확정합니다. 수익 여부와 구조 판단의 일치 여부는 따로 기록합니다.</p></details>
  </section>;
}
