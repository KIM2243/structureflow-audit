import type { Analysis, Snapshot } from './engine';

export type EntryTimeframe = '1D' | '4H' | '1H' | '15m' | '5m';
export type EntryDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export type MultiTimeframeEntryStep = {
  timeframe: EntryTimeframe;
  label: string;
  state: 'PASS' | 'WAIT' | 'BLOCK';
  detail: string;
};

export type MultiTimeframeEntry = {
  status: 'READY' | 'WAIT' | 'BLOCKED';
  direction: EntryDirection;
  entryTimeframe: '5m' | '15m';
  summary: string;
  steps: MultiTimeframeEntryStep[];
};

type EntryInput = {
  snapshots: Record<EntryTimeframe, Snapshot>;
  analyses: Record<'5m' | '15m' | '1H', Analysis>;
};

const trendDirection = (trend: string): EntryDirection =>
  trend === 'BULLISH' ? 'LONG' : trend === 'BEARISH' ? 'SHORT' : 'NEUTRAL';

const directionText = (direction: EntryDirection) =>
  direction === 'LONG' ? '롱' : direction === 'SHORT' ? '숏' : '중립';

export function evaluateMultiTimeframeEntry({
  snapshots,
  analyses,
}: EntryInput): MultiTimeframeEntry {
  const dailyDirection = trendDirection(snapshots['1D'].trend);
  const middleDirection = trendDirection(snapshots['4H'].trend);
  const direction = middleDirection;
  const confirmationDirection = analyses['1H'].bias;
  const timingDirection = analyses['15m'].bias;
  const triggerDirection = analyses['5m'].bias;
  const entryTimeframe = '15m';
  const plan = analyses['15m'].entryForecast;
  const trigger = analyses['5m'].entryForecast;
  const touchTime = Date.parse(plan.zoneTouchTime ?? '');
  const reactionTime = Date.parse(trigger.reactionTime ?? '');
  const triggered = trigger.reactionConfirmed && Number.isFinite(touchTime)
    && Number.isFinite(reactionTime) && reactionTime > touchTime;

  const steps: MultiTimeframeEntryStep[] = [
    {
      timeframe: '1D',
      label: '상위 방향',
      state:
        dailyDirection === 'NEUTRAL' || middleDirection === 'NEUTRAL'
          ? 'WAIT'
          : dailyDirection === middleDirection
            ? 'PASS'
            : 'WAIT',
      detail:
        dailyDirection === 'NEUTRAL'
          ? '일봉 구조가 전환 구간입니다.'
          : middleDirection !== 'NEUTRAL' &&
              dailyDirection !== middleDirection
            ? `일봉 ${directionText(dailyDirection)} 추세 안의 4시간 ${directionText(middleDirection)} 풀백 가능성을 봅니다.`
            : `일봉과 4시간이 ${directionText(dailyDirection)} 방향으로 정렬됐습니다.`,
    },
    {
      timeframe: '4H',
      label: '셋업 정렬',
      state: middleDirection === 'NEUTRAL' ? 'WAIT' : 'PASS',
      detail:
        middleDirection === 'NEUTRAL'
          ? '4시간 구조의 방향 확정을 기다립니다.'
          : dailyDirection !== 'NEUTRAL' && dailyDirection !== middleDirection
            ? `4시간 ${directionText(middleDirection)} 스윙은 일봉의 카운터트렌드 풀백 구간입니다.`
            : `4시간 ${directionText(middleDirection)} 스윙을 현재 진입 방향으로 삼습니다.`,
    },
    {
      timeframe: '1H',
      label: '구조 확인',
      state:
        direction === 'NEUTRAL' || confirmationDirection === 'NEUTRAL'
          ? 'WAIT'
          : confirmationDirection === direction
            ? 'PASS'
            : 'WAIT',
      detail:
        confirmationDirection === direction
          ? `1시간 분석이 ${directionText(direction)} 진입을 확인했습니다.`
          : confirmationDirection === 'NEUTRAL'
            ? '1시간 방향성 확인이 필요합니다.'
            : '1시간은 보조 구조가 아직 4시간 스윙 방향과 다릅니다.',
    },
    {
      timeframe: '15m',
      label: '진입 타이밍',
      state:
        direction === 'NEUTRAL' || timingDirection === 'NEUTRAL'
          ? 'WAIT'
          : timingDirection === direction
            ? plan.zoneValid && plan.locationConfirmed && analyses['15m'].rr >= 2 ? 'PASS' : 'WAIT'
            : 'BLOCK',
      detail:
        timingDirection === direction
          ? plan.zoneValid && plan.locationConfirmed && analyses['15m'].rr >= 2
            ? '15분 구조 영역 도달 · 유리한 반범위 · 2R 이상 확인'
            : '15분 구조 영역 도달과 유효한 2R 가격 계획을 기다립니다.'
          : timingDirection === 'NEUTRAL'
            ? '15분 진입 타이밍을 기다립니다.'
            : '15분 방향이 상위 추세와 반대입니다.',
    },
    {
      timeframe: '5m',
      label: '실행 트리거',
      state:
        direction === 'NEUTRAL' || triggerDirection === 'NEUTRAL'
          ? 'WAIT'
          : triggerDirection !== direction
            ? 'BLOCK'
            : triggered
              ? 'PASS'
              : 'WAIT',
      detail:
        triggerDirection !== direction && triggerDirection !== 'NEUTRAL'
          ? '5분 트리거가 상위 추세와 반대입니다.'
          : triggered
            ? '15분 영역 접촉 이후 5분 완료 봉의 내부 구조 돌파 확인'
            : '15분 영역 접촉 이후의 새로운 5분 구조 반응을 기다립니다. (강의 1분의 시스템 대안)',
    },
  ];

  const coreSteps = steps.filter((step) =>
    ['4H', '15m', '5m'].includes(step.timeframe),
  );
  const status = coreSteps.some((step) => step.state === 'BLOCK')
    ? 'BLOCKED'
    : coreSteps.every((step) => step.state === 'PASS')
      ? 'READY'
      : 'WAIT';

  return {
    status,
    direction,
    entryTimeframe,
    summary:
      status === 'READY'
        ? `${directionText(direction)} 멀티 타임프레임 진입 준비`
        : status === 'BLOCKED'
          ? '시간대 방향 충돌로 진입 차단'
          : '시간대별 진입 조건 확인 중',
    steps,
  };
}
