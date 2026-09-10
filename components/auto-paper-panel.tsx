'use client';
import { useCallback, useEffect, useState } from 'react';
import { Play, Pause, Download, Activity } from 'lucide-react';
import type { AutoConfig, AutoState } from '@/lib/auto-paper';
type Run={id:string;instrument:string;config:AutoConfig;state:AutoState;enabled:boolean;closeRequested:boolean};
type Props={market:'US'|'KR';symbol:string;exchange?:'NA'|'ND'|'NY';name:string;active:boolean};
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
    {s.fills.filter(f=>f.at>=start&&f.at<end).map(f=>{const i=Math.max(0,bars.findLastIndex(b=>Date.parse(b.date)<=f.at)),px=x(i),py=y(Math.max(lo,Math.min(hi,f.price))),buy=f.side==='BUY';return <g key={f.id}><title>{time(f.at)} {buy?'매수':'매도'} {f.price} · {f.reason}</title><circle cx={px} cy={py} r="6" fill={buy?'#60d5ff':'#ffc16d'} stroke="#101a26" strokeWidth="2"/><text x={px} y={py+(buy?22:-12)} textAnchor="middle" fill={buy?'#60d5ff':'#ffc16d'} fontSize="14">{buy?'매수':'매도'}</text></g>;})}
    <text x="14" y="263" fill="#9eb1c8" fontSize="13">{time(start)}</text><text x="706" y="263" textAnchor="end" fill="#9eb1c8" fontSize="13">{time(end-60000)}</text>
  </svg></div><p className="auto-paper-note">최근 90개 원본 1분봉 · 체결 점에 마우스를 올리면 가격과 근거를 확인할 수 있습니다.</p></div>;
}
export function AutoPaperPanel({market,symbol,exchange,name,active}:Props) {
  const [runs,setRuns]=useState<Run[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState('');
  const [runnerReady,setRunnerReady]=useState(false);
  const load=useCallback(async()=>{try{const r=await fetch('/api/paper/auto',{cache:'no-store'});const p=await r.json() as {runs:Run[];error?:string;runtime?:{ready:boolean}};if(!r.ok)throw new Error(p.error);setRuns(p.runs);setRunnerReady(!!p.runtime?.ready);setError('');}catch{setError('자동 실험 계좌를 불러오지 못했습니다.');}},[]);
  useEffect(()=>{if(!active)return;void load();const id=setInterval(()=>void load(),10000);return()=>clearInterval(id);},[active,load]);
  async function action(kind:string,id?:string){setBusy(true);setError('');try{const r=await fetch('/api/paper/auto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:kind,id,market,symbol,exchange:exchange||'ND'})});const p=await r.json() as {runs:Run[];error?:string};if(!r.ok)throw new Error(p.error);setRuns(p.runs);if(kind==='start'){const match=p.runs.find((x:Run)=>x.config.market===market&&x.config.symbol===symbol);if(match)setSelected(match.id);else setError('실험은 계정당 최대 6종목입니다.');}}catch(e){setError(e instanceof Error?e.message:'요청 실패');}finally{setBusy(false);}}
  const run=runs.find(r=>r.id===selected)||runs.find(r=>r.config.market===market&&r.config.symbol===symbol)||runs[0];
  const exists=runs.some(r=>r.config.market===market&&r.config.symbol===symbol);
  const s=run?.state;
  const money=(n:number)=>new Intl.NumberFormat('ko-KR',{style:'currency',currency:run?.config.market==='KR'?'KRW':'USD',maximumFractionDigits:run?.config.market==='KR'?0:2}).format(n);
  const equity=s?s.cash+(s.position?s.position.quantity*s.mark:0):0;
  function download(){if(!run)return;const rows=[['model','symbol','side','filled_at','observed_at','price','quantity','fee','net_pnl','net_r','reason','source','setup'],...run.state.fills.map(f=>[run.state.version,run.config.symbol,f.side,new Date(f.at).toISOString(),new Date(f.observedAt).toISOString(),f.price,f.quantity,f.fee,f.pnl,f.r,f.reason,f.source,f.setupId])];const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${run.config.symbol}-auto-paper.csv`;a.click();URL.revokeObjectURL(url);}
  return <section className="panel auto-paper-panel" aria-label="이론 기반 자동 모의투자">
    <div className="auto-paper-heading"><div><h2><Activity size={20}/> 이론 기반 자동 모의투자</h2><p>4시간 할인 구역 → 15분 전환·재접촉 → 1분 전환·재접촉</p></div><button className="primary" disabled={busy||exists||runs.length>=6||!runnerReady} onClick={()=>void action('start')}><Play size={17}/>{exists?`${symbol} 실험 등록됨`:`${name} 자동 실험 시작`}</button></div>
    {!runnerReady&&<p role="status" className="auto-paper-note">자동 실행 서버 연결 대기 중입니다. 서버 연결이 확인되면 실험을 시작할 수 있습니다.</p>}
    <p className="auto-paper-policy">매수·청산 전용 · 1시간 내부 상승 동행(PP) · 거래당 위험 0.5% · 최소 순 2R · 편도 수수료·슬리피지 각각 0.05%</p>
    <p className="auto-paper-note">종목마다 미국 $10,000 / 한국 ₩10,000,000으로 시작합니다. 수동 계좌와 별도로 저장되며 창을 닫아도 서버에서 순차 확인합니다. 시세가 지연되면 체결을 보류합니다.</p>
    {error&&<p role="alert" className="negative">{error}</p>}
    {run&&s?<>
      <div className="auto-paper-controls"><label>실험 종목 <select value={run.id} onChange={e=>setSelected(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{r.config.market} · {r.config.symbol}</option>)}</select></label><button disabled={busy} onClick={()=>void action(run.enabled?'pause':'resume',run.id)}>{run.enabled?<Pause size={16}/>:<Play size={16}/>} {run.enabled?'신규 진입 중지':'실험 재개'}</button><button disabled={busy||!s.position||run.closeRequested} onClick={()=>void action('close',run.id)}>{run.closeRequested?'청산 대기':'보유분 청산 요청'}</button><button onClick={download} disabled={!s.fills.length}><Download size={16}/> 체결 CSV</button></div>
      <div className="auto-paper-status"><strong>{run.enabled?'자동 감시 중':s.position?'신규 진입 중지 · 보유분 감시':'중지됨'}</strong><span>{s.reason}</span><small>마지막 확인 {time(s.lastChecked)}{s.lastChecked>0&&Date.now()-s.lastChecked>180000?' · 서버 확인 지연':''}</small></div>
      <div className="auto-paper-metrics"><div><span>자동 계좌 평가액</span><b>{money(equity)}</b><small>{((equity/run.config.capital-1)*100).toFixed(2)}%</small></div><div><span>비용 차감 실현손익</span><b>{money(s.netPnl)}</b><small>완료 {s.closed}건 · 승률 {s.closed?(s.wins/s.closed*100).toFixed(1)+'%':'—'}</small></div><div><span>평균 실현 R</span><b>{s.closed?(s.sumR/s.closed).toFixed(2)+'R':'—'}</b><small>관측 최대 낙폭 {s.maxDrawdown.toFixed(2)}%</small></div><div><span>같은 기간 단순 보유</span><b>{s.benchmarkStart?((s.mark/s.benchmarkStart-1)*100).toFixed(2)+'%':'—'}</b><small>비용 전 가격 수익률</small></div></div>
      <p className="auto-paper-note">{s.closed<30?'표본 수집 중입니다. 적은 거래의 수익률·승률로 효과를 단정하지 않습니다.':'누적 결과는 해당 종목·기간·설정의 모의 체결 결과입니다.'} 모델 {s.version}</p>
      {s.position&&<div className="auto-paper-position"><strong>{s.position.quantity}주 보유</strong><span>진입 {money(s.position.entry)}</span><span>손절 {money(s.position.stop)}</span><span>목표 {money(s.position.target)}</span></div>}
      <div className="auto-paper-levels">{s.setup?<><span>4시간 구역 {money(s.setup.zone.low)}–{money(s.setup.zone.high)}</span><span>15분 구역 {s.setup.m15?`${money(s.setup.m15.low)}–${money(s.setup.m15.high)}`:'전환 대기'}</span><span>1분 구역 {s.setup.m1?`${money(s.setup.m1.low)}–${money(s.setup.m1.high)}`:'전환 대기'}</span></>:<span>확정된 4시간 상승 구역을 찾고 있습니다.</span>}</div>
      <ExecutionChart state={s}/>
      <div className="paper-table-scroll"><table><thead><tr><th>시각</th><th>매수·매도</th><th>체결가</th><th>수량</th><th>비용 차감 손익</th><th>근거</th></tr></thead><tbody>{s.fills.slice(0,20).map(f=><tr key={f.id}><td>{time(f.at)}</td><td>{f.side==='BUY'?'매수':'매도'}</td><td>{money(f.price)}</td><td>{f.quantity}주</td><td>{f.side==='SELL'?`${money(f.pnl)} (${f.r.toFixed(2)}R)`:'—'}</td><td>{f.reason}</td></tr>)}</tbody></table>{!s.fills.length&&<p className="auto-paper-note">아직 자동 체결이 없습니다. 조건을 충족할 때만 주문합니다.</p>}</div>
      <details><summary>판단 단계 기록</summary>{s.audit.slice(0,20).map((a,i)=><p key={`${a.at}-${i}`} className="auto-paper-note">{time(a.at)} · {a.reason}</p>)}</details>
      <p className="auto-paper-note">체결은 서버가 관측한 시세를 사용합니다. 손절·목표는 이후 1분봉도 확인하며 같은 봉에서 둘 다 닿으면 손절을 우선합니다. 호가 대기열·부분 체결·세금은 반영하지 않습니다.</p>
    </>:<p className="auto-paper-note">위에서 종목을 선택한 뒤 자동 실험을 시작하세요. 시작 전의 과거 신호로 거래를 만들지 않습니다.</p>}
  </section>;
}
