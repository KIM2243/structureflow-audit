'use client';
import { useEffect,useState } from 'react';
import { replayFrames,type DecisionReplay,type ReplayFrame } from '@/lib/decision-replay';
const stamp=(n:number)=>new Date(n).toLocaleString('ko-KR');
export function DecisionReplayPanel({runId,at,onClose,reviewId,expectedZone}:{runId:string;at:number;onClose:()=>void;reviewId?:string;expectedZone?:{frame:ReplayFrame;low:number;high:number}}){
  const [data,setData]=useState<DecisionReplay|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [frame,setFrame]=useState<ReplayFrame>('1m'),[cursor,setCursor]=useState(0),[playing,setPlaying]=useState(false);
  useEffect(()=>{const controller=new AbortController();setData(null);setError('');setPlaying(false);
    void fetch(reviewId?`/api/paper/reviews?${new URLSearchParams({chart:reviewId})}`:`/api/paper/auto/replay?${new URLSearchParams({run:runId,at:String(at)})}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const p=await r.json() as DecisionReplay&{error?:string};if(!r.ok)throw new Error(p.error);if(!controller.signal.aborted){setData(p);const initial=p.decision.config.entryTimeframe||'1m';setFrame(initial);setCursor(p.candles[initial]?.length||0);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message||'불러오기 실패');});return()=>controller.abort();
  },[runId,at,retry,reviewId]);
  const rows=data?.candles[frame]||[];
  useEffect(()=>{if(!playing)return;const id=setInterval(()=>setCursor(c=>Math.min(rows.length,c+1)),600);return()=>clearInterval(id);},[playing,rows.length]);
  useEffect(()=>{if(cursor>=rows.length)setPlaying(false);},[cursor,rows.length]);
  const d=data?.decision,visible=rows.slice(0,cursor).slice(-90),final=cursor===rows.length;
  const zone=d?.setup?(frame==='4H'?d.setup.zone:frame==='15m'?d.setup.m15:frame===(d.config.entryTimeframe||'1m')?d.setup.m1:undefined):undefined;
  const expected=expectedZone?.frame===frame?expectedZone:undefined;
  const levels=final?[...(zone?[zone.low,zone.high]:[]),...(expected?[expected.low,expected.high]:[]),...(d?.position?[d.position.stop,d.position.target]:[])]:[];
  const values=[...visible.flatMap(b=>[b.low,b.high]),...levels];const lo=Math.min(...values),hi=Math.max(...values),range=hi-lo||1;
  const y=(p:number)=>240-(p-lo)/range*200,x=(i:number)=>25+i*680/Math.max(visible.length,1);
  function download(){if(!data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${d?.symbol}-${at}-replay.json`;a.click();URL.revokeObjectURL(url);}
  return <section className="decision-replay" aria-label="판단 당시 차트 재생">
    <div className="auto-paper-controls"><h3>판단 당시 차트 재생</h3><button onClick={onClose}>닫기</button></div>
    {error?<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>다시 시도</button></p>:!data?<p role="status">저장한 차트를 불러오는 중입니다.</p>:<>
      <p>{d!.symbol} · {stamp(d!.at)} · {d!.reason}</p>
      <p className="auto-paper-note">당시 수신한 완료 봉만 재생합니다. 봉 내부의 틱 움직임·진행 봉은 재현하지 않습니다. 구역·손절·목표·체결은 판단 시점까지 재생한 뒤 표시하며, 앞선 봉에서 매매 규칙을 다시 계산하지 않습니다.</p>
      <div className="auto-paper-controls">{replayFrames.map(f=><button key={f} disabled={!data.candles[f]?.length} aria-pressed={frame===f} onClick={()=>{setFrame(f);setCursor(data.candles[f]?.length||0);setPlaying(false);}}>{f}</button>)}<button onClick={download}>차트 기록 내려받기</button></div>
      {!rows.length?<p>이 시간대의 완료 봉이 없습니다.</p>:<>
        <div className="auto-paper-controls"><button onClick={()=>{setPlaying(false);setCursor(1);}}>처음</button><button disabled={cursor<=1} onClick={()=>{setPlaying(false);setCursor(c=>c-1);}}>이전 봉</button><button onClick={()=>{if(final)setCursor(1);setPlaying(p=>!p);}}>{playing?'일시정지':'재생'}</button><button disabled={final} onClick={()=>{setPlaying(false);setCursor(c=>c+1);}}>다음 봉</button><button onClick={()=>{setPlaying(false);setCursor(rows.length);}}>판단 시점</button></div>
        <label className="replay-slider">봉 탐색 · {cursor}/{rows.length}<input aria-label="재생 봉 위치" type="range" min="1" max={rows.length} value={cursor} onChange={e=>{setPlaying(false);setCursor(Number(e.target.value));}}/></label>
        <p>{visible.at(-1)?`표시 봉 시작 ${stamp(Date.parse(visible.at(-1)!.date))}`:''} · {final?'판단 시점 근거 표시':'과거 봉 재생 중 · 판단 근거 숨김'}</p>
        <div className="paper-table-scroll"><svg viewBox="0 0 850 290" role="img" aria-label={`${frame} 판단 당시 완료 봉 재생`}>
          {[0,.25,.5,.75,1].map(f=><g key={f}><line x1="15" x2="710" y1={y(lo+range*f)} y2={y(lo+range*f)} stroke="#263341"/><text x="720" y={y(lo+range*f)+4} fill="#a9bbcc" fontSize="13">{(lo+range*f).toFixed(3)}</text></g>)}
          {final&&zone&&<g><rect x="15" y={y(zone.high)} width="695" height={Math.max(1,y(zone.low)-y(zone.high))} fill="#36cbaa" opacity=".15"/><text x="20" y={y(zone.high)-5} fill="#6fe8cf" fontSize="14">저장 구역 {zone.quality?.grade||''}</text></g>}
          {final&&expected&&<g><rect x="15" y={y(expected.high)} width="695" height={Math.max(1,y(expected.low)-y(expected.high))} fill="#b58aff" fillOpacity=".12" stroke="#b58aff" strokeDasharray="4 4"/><text x="390" y={y(expected.high)-5} fill="#cbb0ff" fontSize="14">검토자 기대 구역</text></g>}
          {visible.map((b,i)=>{const color=b.close>=b.open?'#56cbae':'#ed8490';return <g key={b.date}><title>{b.date} O {b.open} H {b.high} L {b.low} C {b.close}</title><line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={color}/><rect x={x(i)-2} y={Math.min(y(b.open),y(b.close))} width="4" height={Math.max(1,Math.abs(y(b.open)-y(b.close)))} fill={color}/></g>;})}
          {final&&d?.position&&[[d.position.stop,'손절'],[d.position.target,'목표']].map(([p,label])=><g key={label}><line x1="15" x2="710" y1={y(Number(p))} y2={y(Number(p))} stroke="#e9c783" strokeDasharray="5 4"/><text x="620" y={y(Number(p))-5} fill="#e9c783" fontSize="14">{label}</text></g>)}
          <text x="20" y="275" fill="#a9bbcc" fontSize="13">화면에는 최근 90봉까지 표시 · 전체 저장 봉은 탐색 막대로 이동</text>
        </svg></div>
        {final&&<div className="auto-paper-note"><p>판단 시점 관측가 {d!.price??'없음'} · 시세 시각 {d!.observedAt?stamp(d!.observedAt):'없음'}</p>{d!.fills.map(f=><p key={f.id}>{stamp(f.at)} · {f.direction} {f.action} · {f.quantity}주 @ {f.price} · {f.reason}</p>)}{!d!.fills.length&&<p>이 판단에서 신규 체결 없음</p>}</div>}
      </>}
    </>}
  </section>;
}
