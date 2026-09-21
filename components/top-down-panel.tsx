import type { MultiTimeframeEntry, MultiTimeframeEntryStep, EntryTimeframe } from '@/lib/multi-timeframe';

// Presentation only: never calculate a second signal, stop or target here.
export function TopDownPanel({ result, selected, onDrillDown, onExplain }: {
  result: MultiTimeframeEntry; selected: EntryTimeframe;
  onDrillDown: (frame: EntryTimeframe) => void;
  onExplain: (step: MultiTimeframeEntryStep) => void;
}) {
  return <article className={`plan multi-timeframe-entry ${result.status.toLowerCase()}`}>
    <header><span>Top-Down · 공통 계획 확인</span><b>{result.tradePlan.ready ? '참고 조건 충족' : '대기'}</b></header>
    <h3>{result.tradePlan.stage}</h3>
    <p>1D는 배경, 4H는 거래 방향입니다. 15분 구조로 손절을 정하고 {result.entryTimeframe === '5m' ? '5분' : '1분'}봉으로 진입을 정밀화합니다.</p>
    <ol className="entry-gate-steps unified-topdown">
      {result.steps.map(step => <li key={step.timeframe} className={step.state.toLowerCase()}>
        <button type="button" className="entry-gate-button" aria-pressed={selected === step.timeframe} onClick={() => onDrillDown(step.timeframe)} aria-label={`${step.timeframe} 차트로 이동`}>
          <strong>{step.timeframe}</strong><div><b>{step.label}{step.timeframe === '1D' ? ' · 배경' : ''}</b><small>{step.detail}</small></div>
          <span>{step.state === 'PASS' ? '충족' : step.state === 'BLOCK' ? '충돌' : '대기'}</span>
        </button>
        <button type="button" className="gate-explain" onClick={() => onExplain(step)} aria-label={`${step.timeframe} ${step.label} 근거 자세히 보기`}>판단 이유 보기 ?</button>
      </li>)}
    </ol>
    <p>각 단계를 눌러 차트를 확인하고, ‘판단 이유 보기’에서 설명을 읽으세요. 조건 충족은 체결 통지가 아닙니다. 자동 계좌는 시작 이후 관측 순서와 시세 상태를 별도로 검사합니다.</p>
  </article>;
}
