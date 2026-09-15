'use client';
import {useState} from 'react';
import {runAutoBacktest,type AutoBacktestResult,type HistoricalInput} from '@/lib/auto-backtest';
import {autoEquity,AUTO_VERSION,type AutoConfig} from '@/lib/auto-paper';
export function AutoBacktestPanel({market,symbol,exchange}:{market:'US'|'KR';symbol:string;exchange?:'NA'|'ND'|'NY'}){
  const [entryTimeframe,setEntryTimeframe]=useState<'1m'|'5m'>('1m');
  const [result,setResult]=useState<AutoBacktestResult|null>(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
  async function run(){setBusy(true);setError('');setProgress(0);setResult(null);try{
    const response=await fetch(`/api/market?${new URLSearchParams({market,symbol,exchange:exchange||'ND',auto:'1'})}`,{cache:'no-store'});
    const input=await response.json() as HistoricalInput&{error?:string;candles?:import('@/lib/engine').Candle[]};if(!response.ok)throw new Error(input.error||'시세 불러오기 실패');
    const config:AutoConfig={market,symbol,exchange:exchange||'ND',capital:market==='KR'?10000000:10000,riskPct:.5,feeBps:5,slippageBps:5,entryTimeframe};
    setResult(await runAutoBacktest({...input,timeframes:{...input.timeframes,'5m':input.candles}},config,setProgress));
  }catch(e){setError(e instanceof Error?e.message:'백테스트 실행 실패');}finally{setBusy(false);}}
  function download(){if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify({schema:'auto-engine-backtest-v1',sampling:'one-minute-open',...result},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${result.config.symbol}-auto-engine-backtest.json`;a.click();URL.revokeObjectURL(url);}
  const s=result?.state;
  return <section className="panel auto-engine-backtest">
    <h2>자동매매 엔진 백테스트</h2><p>현재 자동 모의매매와 동일한 {AUTO_VERSION} 엔진을 시간순으로 실행합니다.</p>
    <p>롱·숏 / 15분 손절·4시간 목표 사전 고정 / 하위 진입 확인 / 고정 부분익절 없음 / H1 PP / A·B등급 / 위험 0.5% / 순 2R / 편도 비용 각각 5bp</p>
    <p className="auto-paper-note">관측 시세는 매 1분봉 시작 시가로 대체합니다. 완료된 봉의 손절·목표는 기존 엔진이 처리합니다. 분봉 내부 접촉 순서와 실제 서버의 관측 주기는 재현하지 않으므로 실시간 모의체결과 결과가 같다는 뜻은 아닙니다. 진행 봉의 고가·저가·종가를 미리 사용하지 않습니다.</p>
    <div className="auto-paper-controls"><label>진입 확인 <select disabled={busy} value={entryTimeframe} onChange={e=>setEntryTimeframe(e.target.value as '1m'|'5m')}><option value="1m">1분 정제형</option><option value="5m">5분 확인형</option></select></label><button disabled={busy} onClick={()=>void run()}>{busy?`계산 중 ${progress}%`:`${symbol} 원본 불러와 실행`}</button>{result&&<button onClick={download}>결과·판단 기록 내려받기</button>}</div>
    {error&&<p role="alert">{error}</p>}
    {result&&s&&<><h3>{result.config.market} · {result.config.symbol} 결과</h3><p>{new Date(result.start).toLocaleString('ko-KR')} → {new Date(result.end).toLocaleString('ko-KR')} · 관측 {result.samples}회 · 준비 구간 제외 {result.skipped}봉</p>
      <div className="auto-paper-metrics"><div><span>평가액 / 초기 자본</span><b>{autoEquity(s).toFixed(2)} / {result.config.capital}</b></div><div><span>완료 거래 / 승률</span><b>{s.closed}건 / {s.closed?(s.wins/s.closed*100).toFixed(1)+'%':'—'}</b></div><div><span>실현손익 / 평균 R</span><b>{s.netPnl.toFixed(2)} / {s.closed?(s.sumR/s.closed).toFixed(2):'—'}</b></div><div><span>관측 최대 낙폭</span><b>{s.maxDrawdown.toFixed(2)}%</b></div></div>
      <p>종료 상태: {s.reason} · {s.position?`${s.position.direction||'LONG'} ${s.position.quantity}주 미청산 (마지막 시가 평가, 강제청산 없음)`:'미청산 포지션 없음'}</p>
      {!s.closed&&<p>완료 거래가 없습니다. 수익성 결론 대신 아래 대기 단계와 데이터 기간을 확인하세요.</p>}
      <details><summary>관측 단계별 횟수</summary>{Object.entries(result.stages).map(([stage,n])=><p key={stage}>{stage}: {n}회</p>)}</details>
      <div className="paper-table-scroll"><table><thead><tr><th>시각</th><th>방향·구분</th><th>가격</th><th>수량</th><th>실현손익</th><th>사유</th></tr></thead><tbody>{s.fills.map(f=><tr key={f.id}><td>{new Date(f.at).toLocaleString('ko-KR')}</td><td>{f.direction} · {f.action==='ENTRY'?'진입':f.action==='PARTIAL'?'부분청산':'청산'}</td><td>{f.price.toFixed(3)}</td><td>{f.quantity}</td><td>{f.pnl.toFixed(2)}</td><td>{f.reason}</td></tr>)}</tbody></table></div>
      <p className="auto-paper-note">제공처가 반환한 제한된 원본 이력으로 계산하며, 긴 기간의 성과 검증은 아닙니다. 체결은 전체, 상세 판단은 최근 200건을 내려받습니다. 실험 계좌나 실계좌에는 주문하지 않습니다.</p></>}
  </section>;
}
