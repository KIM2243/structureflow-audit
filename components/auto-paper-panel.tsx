'use client';
import { useCallback, useEffect, useState } from 'react';
import { Play, Pause, Download, Activity } from 'lucide-react';
import { autoEquity, AUTO_VERSION, type AutoConfig, type AutoState } from '@/lib/auto-paper';
import { DecisionReplayPanel } from './decision-replay';
type Run={id:string;instrument:string;config:AutoConfig;state:AutoState;enabled:boolean;closeRequested:boolean};
type Props={market:'US'|'KR';symbol:string;exchange?:'NA'|'ND'|'NY';name:string;active:boolean};
const fillLabel=(f:AutoState['fills'][number])=>f.action?`${f.direction==='SHORT'?'숏':'롱'} ${f.action==='ENTRY'?'진입':f.action==='PARTIAL'?'부분청산':'청산'}`:f.side==='BUY'?'매수':'매도';
const time=(n:number)=>n?new Date(n).toLocaleString('ko-KR'):'대기';
function ExecutionChart({state:s}:{state:AutoState}) {
  const bars=s.chart||[];if(bars.length<2)return null;
  const levels=[...bars.flatMap(b=>[b.low,b.high]),...(s.position?[s.position.stop,s.position.target]:[])];
  const lo=Math.min(...levels),hi=Math.max(...levels),range=hi-lo||1;
  const y=(p:number)=>230-(p-lo)/range*195,x=(i:number)=>18+i*690/bars.length;
  const start=Date.parse(bars[0].date),end=Date.parse(bars.at(-1)!.date)+60000;
  return <div className="auto-execution-chart"><h3>자동 실험 · 1분 실제 차트</h3><div className="paper-table-scroll"><svg viewBox="0 0 830 280" role="img" aria-label="키움 1분봉과 자동 매수·매도 체결 위치">
    {[0,.25,.5,.75,1].map(f=><g key={f}><line x1="10" x2="710" y1={y(lo+range*f)} y2={y(lo+range*f)} stroke="#263341"/><text x="717" y={y(lo+range*f)+4} fill="#9eb1c8" fontSize="13">{(lo+range*f).toLocaleString('ko-KR',{maximumFractionDigits:3})}</text></g>)}
    {bars.map((b,i)=>{const color=b.close>=b.open?'#56cbae':'#ed8490';return <g key={b.date}><title>{time(Date.parse(b.date))} O {b.open} H {b.high} L {b.low} C {b.close}</title><line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={color}/><rect x={x(i)-2} y={Math.min(y(b.open),y(b.close))} width="4" height={Math.max(1,Math.abs(y(b.open)-y(b.close)))} fill={color}/></g>;})}
    {s.position&&[[s.position.stop,'손절','#ed8490'],[s.position.target,'목표','#56cbae']].map(([price,label,color])=><g key={label}><line x1="10" x2="708" y1={y(Number(price))} y2={y(Number(price))} stroke={String(color)} strokeDasharray="5 4"/><text x="635" y={y(Number(price))-5} fill={String(color)} fontSize="14">{label}</text></g>)}
    {s.fills.filter(f=>f.at>=start&&f.at<end).map(f=>{const i=Math.max(0,bars.findLastIndex(b=>Date.parse(b.date)<=f.at)),px=x(i),py=y(Math.max(lo,Math.min(hi,f.price))),buy=f.side==='BUY';return <g key={f.id}><title>{time(f.at)} {fillLabel(f)} {f.price} · {f.reason}</title><circle cx={px} cy={py} r="6" fill={buy?'#60d5ff':'#ffc16d'} stroke="#101a26" strokeWidth="2"/><text x={px} y={py+(buy?22:-12)} textAnchor="middle" fill={buy?'#60d5ff':'#ffc16d'} fontSize="14">{fillLabel(f)}</text></g>;})}
    <text x="14" y="263" fill="#9eb1c8" fontSize="13">{time(start)}</text><text x="706" y="263" textAnchor="end" fill="#9eb1c8" fontSize="13">{time(end-60000)}</text>
  </svg></div><p className="auto-paper-note">최근 90개 원본 1분봉 · 체결 점에 마우스를 올리면 가격과 근거를 확인할 수 있습니다.</p></div>;
}
export function AutoPaperPanel({market,symbol,exchange,name,active}:Props) {
  const [runs,setRuns]=useState<Run[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState('');
  const [runnerReady,setRunnerReady]=useState(false);
  const [heartbeat,setHeartbeat]=useState(0);
  const [replay,setReplay]=useState<{runId:string;at:number}|null>(null);
  const load=useCallback(async()=>{try{const r=await fetch('/api/paper/auto',{cache:'no-store'});const p=await r.json() as {runs:Run[];error?:string;runtime?:{ready:boolean;heartbeatAt:number}};if(!r.ok)throw new Error(p.error);setRuns(p.runs);setRunnerReady(!!p.runtime?.ready);setHeartbeat(p.runtime?.heartbeatAt||0);setError('');}catch{setRunnerReady(false);setError('자동 실험 계좌를 불러오지 못했습니다. 현재 상태는 확인되지 않았습니다.');}},[]);
  useEffect(()=>{if(!active)return;void load();const id=setInterval(()=>void load(),10000);return()=>clearInterval(id);},[active,load]);
  async function action(kind:string,id?:string){setBusy(true);setError('');try{const r=await fetch('/api/paper/auto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:kind,id,market,symbol,exchange:exchange||'ND'})});const p=await r.json() as {runs:Run[];error?:string};if(!r.ok)throw new Error(p.error);setRuns(p.runs);if(kind==='start'){const match=p.runs.find((x:Run)=>x.config.market===market&&x.config.symbol===symbol);if(match)setSelected(match.id);else setError('실험은 계정당 최대 6종목입니다.');}}catch(e){setError(e instanceof Error?e.message:'요청 실패');}finally{setBusy(false);}}
  const run=runs.find(r=>r.id===selected)||runs.find(r=>r.config.market===market&&r.config.symbol===symbol)||runs[0];
  const exists=runs.some(r=>r.config.market===market&&r.config.symbol===symbol);
  const s=run?.state;
  const money=(n:number)=>new Intl.NumberFormat('ko-KR',{style:'currency',currency:run?.config.market==='KR'?'KRW':'USD',maximumFractionDigits:run?.config.market==='KR'?0:2}).format(n);
  const equity=s?autoEquity(s):0;
  function downloadDecisions(){if(!run)return;const url=URL.createObjectURL(new Blob([JSON.stringify({schema:'decision-log-v1',exportedAt:new Date().toISOString(),runId:run.id,symbol:run.config.symbol,retention:200,decisions:run.state.decisions||[]},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${run.config.symbol}-decisions.json`;a.click();URL.revokeObjectURL(url);}
  function download(){if(!run)return;const rows=[['model','symbol','direction','action','side','filled_at','observed_at','price','quantity','fee','net_pnl','net_r','reason','source','setup'],...run.state.fills.map(f=>[f.model||run.state.version,run.config.symbol,f.direction||'LONG',f.action||f.side,f.side,new Date(f.at).toISOString(),new Date(f.observedAt).toISOString(),f.price,f.quantity,f.fee,f.pnl,f.r,f.reason,f.source,f.setupId])];const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${run.config.symbol}-auto-paper.csv`;a.click();URL.revokeObjectURL(url);}
  return <section className="panel auto-paper-panel" aria-label="이론 기반 자동 모의투자">
    <div className="auto-paper-heading"><div><h2><Activity size={20}/> 이론 기반 자동 모의투자</h2><p>4시간 수요·공급 구역 → 15분 전환·재접촉 → 1분 전환·재접촉</p></div><button className="primary" disabled={busy||exists||runs.length>=6||!runnerReady} onClick={()=>void action('start')}><Play size={17}/>{exists?`${symbol} 실험 등록됨`:`${name} 자동 실험 시작`}</button></div>
    {!runnerReady&&<p role="status" className="auto-paper-note">자동 실행 서버 연결 대기 중입니다. 서버 연결이 확인되면 실험을 시작할 수 있습니다.</p>}
    <p className="auto-paper-policy">롱·숏 PP · A/B등급 · 거래당 위험 0.5% · 1R에 최초 수량 50% 청산 · 잔여는 4시간 목표 · 부분청산 반영 최소 순 2R</p>
    <p className="auto-paper-note">등급 배점·부분청산 비율은 강의의 고정 공식이 아닌 실험 설정입니다. 1주는 부분청산 없이 관리하며 손절은 이동하지 않습니다. 편도 수수료·슬리피지는 각각 0.05%입니다. 숏은 진입금 전액을 예치하는 모의 계산이며 대차 가능 여부·대차료는 반영하지 않습니다.</p>
    <p className="auto-paper-note">종목마다 미국 $10,000 / 한국 ₩10,000,000으로 시작합니다. 수동 계좌와 별도로 저장되며 창을 닫아도 서버에서 순차 확인합니다. 시세가 지연되면 체결을 보류합니다.</p>
    {error&&<p role="alert" className="negative">{error}</p>}
    {run&&s?<>
      {s.version!==AUTO_VERSION&&<p className="auto-paper-note">기존 v1 실험입니다. 기존 롱·전량청산 규칙을 유지하며 v2와 결과를 섞지 않습니다. 새 종목 실험에 v2가 적용됩니다.</p>}
      <div className="auto-paper-controls"><label>실험 종목 <select value={run.id} onChange={e=>setSelected(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{r.config.market} · {r.config.symbol}</option>)}</select></label><button disabled={busy} onClick={()=>void action(run.enabled?'pause':'resume',run.id)}>{run.enabled?<Pause size={16}/>:<Play size={16}/>} {run.enabled?'신규 진입 중지':'실험 재개'}</button><button disabled={busy||!s.position||run.closeRequested} onClick={()=>void action('close',run.id)}>{run.closeRequested?'청산 대기':'보유분 청산 요청'}</button><button onClick={download} disabled={!s.fills.length}><Download size={16}/> 체결 CSV</button></div>
      <div className="auto-paper-status"><strong>{!runnerReady?'운영 서버 상태 확인 필요':s.lastChecked>0&&Date.now()-s.lastChecked>180000?'종목 처리 지연':run.enabled?'자동 확인 활성':s.position?'신규 진입 중지 · 보유분 확인':'중지됨'}</strong><span>{s.reason}</span><small>마지막 확인 {time(s.lastChecked)}{s.lastChecked>0&&Date.now()-s.lastChecked>180000?' · 서버 확인 지연':''}</small></div>
      <section className="auto-health" aria-label="운영·데이터 상태">
        <h3>운영·데이터 상태</h3><p>서버 신호: {runnerReady?'최근 3분 이내 응답':'없음·지연 또는 조회 실패'} · 마지막 신호 {time(heartbeat)}</p>
        <p>종목 마지막 처리 {time(s.lastChecked)} · 마지막 정상 원본 {time(s.lastFreshAt||0)}</p>
        {s.health?<><p>데이터 검사 {time(s.health.at)} · 당시 현재가 지연 {s.health.quoteAgeMs===null?'미확인':`${(s.health.quoteAgeMs/1000).toFixed(0)}초`} · 당시 1분봉 시작 이후 {s.health.m1AgeMs===null?'미확인':`${(s.health.m1AgeMs/1000).toFixed(0)}초`}</p>
          {s.health.issues.length?s.health.issues.map(i=><p key={i.code} className={i.level==='block'?'negative':''}>{i.level==='block'?'체결 보류':'확인 필요'} · {i.message}</p>):<p>마지막 검사에서 데이터 이상 미검출{Date.now()-s.health.at>180000?' · 오래된 검사이므로 현재 정상 여부는 미확인':''}</p>}</>:<p>다음 자동 확인부터 상세 데이터 검사를 표시합니다.</p>}
        {s.decisions?.[0]?.replayError&&<p className="negative">차트 보관: {s.decisions[0].replayError}</p>}
        <p>봉 간격은 무거래·거래정지·휴장으로도 벌어질 수 있습니다. 거래소 달력과 대조한 장애 확정은 아닙니다. 최근 간격 이상은 신규 진입을 보류하지만, 유효한 시세가 있으면 기존 보유분 관리는 계속합니다. 원본 시세 자체가 잘못되거나 지연되면 청산 계산도 대기합니다.</p>
      </section>
      <div className="auto-paper-metrics"><div><span>자동 계좌 평가액</span><b>{money(equity)}</b><small>{((equity/run.config.capital-1)*100).toFixed(2)}%</small></div><div><span>비용 차감 실현손익</span><b>{money(s.netPnl)}</b><small>완료 {s.closed}건 · 승률 {s.closed?(s.wins/s.closed*100).toFixed(1)+'%':'—'}</small></div><div><span>평균 실현 R</span><b>{s.closed?(s.sumR/s.closed).toFixed(2)+'R':'—'}</b><small>관측 최대 낙폭 {s.maxDrawdown.toFixed(2)}%</small></div><div><span>같은 기간 단순 보유</span><b>{s.benchmarkStart?((s.mark/s.benchmarkStart-1)*100).toFixed(2)+'%':'—'}</b><small>비용 전 가격 수익률</small></div></div>
      <p className="auto-paper-note">{s.closed<30?'표본 수집 중입니다. 적은 거래의 수익률·승률로 효과를 단정하지 않습니다.':'누적 결과는 해당 종목·기간·설정의 모의 체결 결과입니다.'} 모델 {s.version}</p>
      {s.position&&<div className="auto-paper-position"><strong>{s.position.direction==='SHORT'?'숏':'롱'} {s.position.quantity}주 보유</strong><span>진입 {money(s.position.entry)}</span><span>손절 {money(s.position.stop)}</span><span>목표 {money(s.position.target)}</span>{s.position.partialTarget&&<span>부분청산 {s.position.partialDone?'완료':`${money(s.position.partialTarget)} · ${s.position.partialQuantity}주`}</span>}</div>}
      <div className="auto-paper-levels">{s.setup?<><span>4시간 구역 {money(s.setup.zone.low)}–{money(s.setup.zone.high)}</span><span>15분 구역 {s.setup.m15?`${money(s.setup.m15.low)}–${money(s.setup.m15.high)}`:'전환 대기'}</span><span>1분 구역 {s.setup.m1?`${money(s.setup.m1.low)}–${money(s.setup.m1.high)}`:'전환 대기'}</span></>:<span>확정된 4시간 수요·공급 구역을 찾고 있습니다.</span>}</div>
      <div className="auto-zone-grades">{s.setup&&[['4H',s.setup.zone],['M15',s.setup.m15],['M1',s.setup.m1]].map(([label,z])=>{const zone=z as NonNullable<AutoState['setup']>['zone']|undefined;return zone?.quality?<details key={String(label)}><summary>{String(label)} {zone.quality.grade}등급 · {zone.quality.score}/{zone.quality.maximum}</summary><ul>{zone.quality.reasons.map(r=><li key={r}>{r}</li>)}</ul></details>:null;})}</div>
      <ExecutionChart state={s}/>
      {replay&&replay.runId===run.id&&<DecisionReplayPanel key={`${replay.runId}-${replay.at}`} runId={replay.runId} at={replay.at} onClose={()=>setReplay(null)}/>}
      <div className="paper-table-scroll"><table><thead><tr><th>시각</th><th>매수·매도</th><th>체결가</th><th>수량</th><th>비용 차감 손익</th><th>근거</th></tr></thead><tbody>{s.fills.slice(0,20).map(f=><tr key={f.id}><td>{time(f.at)}</td><td>{fillLabel(f)}</td><td>{money(f.price)}</td><td>{f.quantity}주</td><td>{(f.action?f.action!=='ENTRY':f.side==='SELL')?`${money(f.pnl)} (${f.r.toFixed(2)}R)`:'—'}</td><td>{f.reason}</td></tr>)}</tbody></table>{!s.fills.length&&<p className="auto-paper-note">아직 자동 체결이 없습니다. 조건을 충족할 때만 주문합니다.</p>}</div>
      <details><summary>진입·대기·차단 판단 기록 ({s.decisions?.length||0}건)</summary>
        <p className="auto-paper-note">단계·사유·설정 변경 및 체결 시 기록하고, 같은 상태는 분당 한 번 표본으로 남깁니다. 최근 200건만 보관하며 오래된 기록은 삭제됩니다. 중요한 기록은 내려받으세요. 업데이트 이전 판단은 소급 복원하지 않습니다.</p>
        <button disabled={!s.decisions?.length} onClick={downloadDecisions}><Download size={16}/> 판단 근거 내려받기 (JSON)</button>
        {(s.decisions||[]).map((a,i)=><details key={`${a.at}-${i}`} className="auto-decision"><summary>{time(a.at)} · {a.fills.length?'체결 · ':''}{a.reason}</summary>
          <p>단계 {a.stage} · 모델 {a.model} · 종목 {a.symbol}</p>
          {a.health?.issues.map(i=><p key={i.code}>{i.code} · {i.message}</p>)}
          {a.replayKey?<button onClick={()=>setReplay({runId:run.id,at:a.at})}>판단 당시 차트 재생</button>:<p>{a.replayError||'저장된 차트 없음 · 업데이트 이후 정상 시세 판단부터 재생할 수 있습니다.'}</p>}
          <p>관측 가격 {a.price===null?'없음':money(a.price)} · 시세 시각 {a.observedAt?time(a.observedAt):'없음'} · 출처 {a.source||'연결 실패'}</p>
          <p>위험 {a.config.riskPct}% · 편도 수수료 {a.config.feeBps}bp · 슬리피지 {a.config.slippageBps}bp</p>
          {a.bars.map(b=><p key={b.timeframe}>{b.timeframe} 수신 {b.received}봉 / 완료 {b.completed}봉 · 마지막 완료 봉 시작 {b.lastCompleted?time(Date.parse(b.lastCompleted)):'없음'}</p>)}
          {a.setup&&<><p>{a.setup.direction||'LONG'} 설정 · H4 접촉 {time(a.setup.touch||0)} · M15 재접촉 {time(a.setup.retest||0)}</p>{[['4H',a.setup.zone],['15m',a.setup.m15],['1m',a.setup.m1]].map(([frame,value])=>{const z=value as NonNullable<AutoState['setup']>['zone']|undefined;return z?<p key={String(frame)}>{String(frame)} {money(z.low)}–{money(z.high)} · {z.quality?`${z.quality.grade}등급 (${z.quality.score}/${z.quality.maximum}) · ${z.quality.reasons.join(' / ')}`:'등급 기록 없음'}</p>:null;})}</>}
          {a.checks&&<><p>진입 후보 참고 계산 (각 단계의 최종 통과 판정과는 구분)</p><p>1분 구역 안 {a.checks.insideM1?'예':'아니오'} · 구역 확정 이후 {a.checks.afterM1?'예':'아니오'} · H1 내부 방향 {a.checks.h1Direction===1?'상승':a.checks.h1Direction===-1?'하락':'미확정'}</p><p>후보 수량 {a.checks.quantity}주 · 손절 {money(a.checks.stop)} · 목표 {money(a.checks.target)} · 최종 순 목표 {a.checks.netTargetR.toFixed(2)}R · 부분청산 가중 {a.checks.weightedR.toFixed(2)}R</p></>}
          {a.fills.map(f=><p key={f.id}>{fillLabel(f)} {f.quantity}주 · {money(f.price)} · {f.reason}</p>)}
        </details>)}
        {!s.decisions?.length&&<p className="auto-paper-note">다음 자동 확인부터 상세 근거가 쌓입니다. 중지된 실험은 재개 후 기록합니다.</p>}
        <details><summary>기존 간단 기록</summary>{s.audit.slice(0,20).map((a,i)=><p key={`${a.at}-${i}`} className="auto-paper-note">{time(a.at)} · {a.reason}</p>)}</details>
      </details>
      <p className="auto-paper-note">체결은 서버가 관측한 시세를 사용합니다. 손절·목표는 이후 1분봉도 확인하며 같은 봉에서 둘 다 닿으면 손절을 우선합니다. 호가 대기열·부분 체결·세금은 반영하지 않습니다.</p>
    </>:<p className="auto-paper-note">위에서 종목을 선택한 뒤 자동 실험을 시작하세요. 시작 전의 과거 신호로 거래를 만들지 않습니다.</p>}
  </section>;
}
