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
  const direction =
    middleDirection === 'NEUTRAL' ? dailyDirection : middleDirection;
  const confirmationDirection = analyses['1H'].bias;
  const timingDirection = analyses['15m'].bias;
  const triggerDirection = analyses['5m'].bias;
  const entryTimeframe =
    analyses['5m'].entryForecast.status === 'READY' ? '5m' : '15m';

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
            ? 'PASS'
            : 'BLOCK',
      detail:
        timingDirection === direction
          ? `15분 분석이 ${directionText(direction)} 타이밍을 지지합니다.`
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
            : analyses['5m'].entryForecast.status === 'READY'
              ? 'PASS'
              : 'WAIT',
      detail:
        triggerDirection !== direction && triggerDirection !== 'NEUTRAL'
          ? '5분 트리거가 상위 추세와 반대입니다.'
          : analyses['5m'].entryForecast.status === 'READY'
            ? '5분 조건부 진입 트리거가 충족됐습니다.'
            : '5분 가격이 예측 구간과 트리거에 도달하기를 기다립니다.',
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
