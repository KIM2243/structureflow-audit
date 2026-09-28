import {upperContext} from './upper-context.ts';
import {composeTradePlan,type TradePlan} from './trade-plan.ts';
import type { Analysis, Snapshot, Candle } from './engine';
import { closedBars, qualifiedZone, shiftedZone, internalDirection, entryTerms, gradeZone, validBars, upperStructurePlan } from './auto-paper.ts';

export type EntryTimeframe = '1D' | '4H' | '1H' | '15m' | '1m' | '5m';
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
  entryTimeframe: '1m'|'5m';
  tradePlan:TradePlan;
  summary: string;
  steps: MultiTimeframeEntryStep[];
  riskPlan?: ReturnType<typeof upperStructurePlan>;
};

type EntryInput = {
  entryFrame?:'1m'|'5m';
  snapshots: Record<EntryTimeframe, Snapshot>;
  analyses: Record<'5m' | '15m' | '1H', Analysis> & Partial<Record<'1m', Analysis>>;
  candles?: Partial<Record<EntryTimeframe, Candle[]>>;
  now?: number;
  capital?: number;
};

const trendDirection = (trend: string): EntryDirection =>
  trend === 'BULLISH' ? 'LONG' : trend === 'BEARISH' ? 'SHORT' : 'NEUTRAL';

const directionText = (direction: EntryDirection) =>
  direction === 'LONG' ? '롱' : direction === 'SHORT' ? '숏' : '중립';

export function evaluateMultiTimeframeEntry({
  snapshots,
  analyses,
  candles,
  now=Date.now(),
  capital=10000,
  entryFrame='1m',
}: EntryInput): MultiTimeframeEntry {
  const dailyDirection = trendDirection(snapshots['1D'].trend);
  const middleDirection = trendDirection(snapshots['4H'].trend);
  const direction = middleDirection;
  const upper=upperContext(candles??{},now,direction);
  const internal = upper.h1.internal==='BULLISH'?1:upper.h1.internal==='BEARISH'?-1:0;
  const confirmationDirection:EntryDirection = internal===1?'LONG':internal===-1?'SHORT':'NEUTRAL';
  const timingDirection = analyses['15m'].bias;
  const triggerDirection = analyses[entryFrame]?.bias||'NEUTRAL';
  const entryTimeframe = entryFrame;
  const entryMinutes=entryFrame==='5m'?5:1;
  const plan = analyses['15m'].entryForecast;
  const trigger = analyses[entryFrame]?.entryForecast;
  const touchTime = Date.parse(plan.zoneTouchTime ?? '');
  const reactionTime = Date.parse(trigger?.reactionTime ?? '');
  let triggered = !!trigger?.reactionConfirmed && Number.isFinite(touchTime)
    && Number.isFinite(reactionTime) && reactionTime > touchTime;
  // Chart review uses completed historical bars only. The paper engine separately
  // requires contacts observed after the run starts; this panel never places orders.
  const raw=candles?.['1m']||[], one=closedBars(candles?.[entryFrame]||[],entryMinutes,now), fifteen=closedBars(candles?.['15m']||[],15,now);
  const four=closedBars(candles?.['4H']||[],240,now), context=qualifiedZone(four,240);
  const nativeReady=[candles?.[entryFrame]||[],raw,candles?.['15m']||[],candles?.['1H']||[],candles?.['4H']||[]].every(b=>b.length>=20&&validBars(b));
  const current=raw.at(-1), fresh=!!current&&now-Date.parse(current.date)<=120000&&Date.parse(current.date)<=now;
  const contact=(bars:Candle[],z:{low:number;high:number;at:number})=>bars.find(b=>Date.parse(b.date)>=z.at&&b.low<=z.high&&b.high>=z.low);
  const h4Touch=context?contact(fifteen,context.zone):undefined;
  const m15=context&&h4Touch?shiftedZone(fifteen,15,Date.parse(h4Touch.date)+900000,context.zone,context.direction):undefined;
  const m15Touch=m15?contact(one,m15):undefined;
  const m1=m15&&m15Touch&&context?shiftedZone(one,entryMinutes,Date.parse(m15Touch.date)+entryMinutes*60000,m15,context.direction):undefined;
  const m1Touch=m1?contact(one,m1):undefined;
  const gradePass=!!context&&!!m15&&!!m1&&[context.zone.quality,gradeZone(fifteen,m15,context.direction,15,true),gradeZone(one,m1,context.direction,entryMinutes,true)].every(q=>q&&q.grade!=='C');
  const riskPlan=context&&m15?upperStructurePlan(m15,context.target,context.direction,m15.at):undefined;
  const terms=context&&m1&&current&&riskPlan?entryTerms(current.close,riskPlan.stop,riskPlan.target,capital,{market:'US',symbol:'PREVIEW',exchange:'ND',capital,riskPct:.5,feeBps:5,slippageBps:5},context.direction):undefined;
  const netR=terms&&terms.quantity?terms.rr:0;
  triggered=triggered&&nativeReady&&fresh&&!!m1Touch&&!!m1&&!!context&&context.direction===direction&&gradePass&&netR>=2&&now-m1.at<=1800000&&!!current&&current.close>=m1.low&&current.close<=m1.high;

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
        middleDirection === 'NEUTRAL' ? '4시간 방향이 미확정이므로 일봉과의 정렬을 판단하지 않습니다.' : dailyDirection === 'NEUTRAL' ? '일봉 구조가 전환 구간입니다.'
          : dailyDirection !== middleDirection
            ? `일봉 ${directionText(dailyDirection)} 추세 안의 4시간 ${directionText(middleDirection)} 풀백 가능성을 봅니다.`
            : `일봉과 4시간이 ${directionText(dailyDirection)} 방향으로 정렬됐습니다.`,
    },
    {
      timeframe: '4H',
      label: '셋업 정렬',
      state: middleDirection === 'NEUTRAL' || !h4Touch ? 'WAIT' : 'PASS',
      detail:
        middleDirection === 'NEUTRAL'
          ? '4시간 구조의 방향 확정을 기다립니다.'
          : dailyDirection !== 'NEUTRAL' && dailyDirection !== middleDirection
            ? `4시간 ${directionText(middleDirection)} 스윙은 일봉의 카운터트렌드 풀백 구간입니다.`
            : `4시간 ${directionText(middleDirection)} 스윙을 현재 진입 방향으로 삼습니다.`,
    },
    {
      timeframe: '1H',
      label: '상위 내부 CHoCH 확인',
      state:
        direction === 'NEUTRAL' || !upper.confirmed
          ? 'WAIT'
          : confirmationDirection === direction
            ? 'PASS'
            : 'WAIT',
      detail: upper.reason,
    },
    {
      timeframe: '15m',
      label: '진입 타이밍',
      state:
        direction === 'NEUTRAL' || timingDirection === 'NEUTRAL'
          ? 'WAIT'
          : timingDirection === direction
            ? m15Touch ? 'PASS' : 'WAIT'
            : 'BLOCK',
      detail:
        timingDirection === direction
          ? m15Touch
            ? '4시간 접촉 이후 15분 전환·구역 포함·재접촉 확인'
            : '4시간 접촉 이후 15분 전환과 기원 구역 재접촉을 기다립니다.'
          : timingDirection === 'NEUTRAL'
            ? '15분 진입 타이밍을 기다립니다.'
            : '15분 방향이 상위 추세와 반대입니다.',
    },
    {
      timeframe: entryFrame,
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
        direction === 'NEUTRAL' ? '4시간 방향 확정 후 하위 트리거를 판단합니다.' : triggerDirection !== direction && triggerDirection !== 'NEUTRAL' ? '1분 트리거가 상위 추세와 반대입니다.'
          : triggered
            ? '1분 전환·포함·재접촉 · A/B등급 · 상위 계획 순 2R 확인 (차트 후보)'
            : !nativeReady||!fresh?'원본 1분봉 부족 또는 지연 · 진입 보류':'15분 재접촉 이후 1분 전환·재접촉·등급·상위 계획 순 2R 대기',
    },
  ];

  const coreSteps = steps.filter((step) =>
    ['4H', '1H', '15m', entryFrame].includes(step.timeframe),
  );
  const status = coreSteps.some((step) => step.state === 'BLOCK')
    ? 'BLOCKED'
    : coreSteps.every((step) => step.state === 'PASS')
      ? 'READY'
      : 'WAIT';

  const tradePlan=composeTradePlan({direction,entryFrame,ready:status==='READY',stage:!nativeReady||!fresh?'데이터 확인 대기':!context?'4H 방향·구역 확정 대기':!h4Touch?'4H 관심 구역 접촉 대기':!m15?'15분 전환 대기':!m15Touch?'15분 재접촉 대기':!m1?'하위 전환·정제 대기':status!=='READY'?'재접촉·방향·등급·비용 확인 대기':'참고 진입 조건 충족',interest:context?.zone,refined:m1,risk:riskPlan,netR,asOf:now});
  tradePlan.upper=upper;
  if(!upper.confirmed&&nativeReady&&fresh)tradePlan.stage=upper.reason;
  const opposite=triggerDirection!=='NEUTRAL'&&direction!=='NEUTRAL'&&triggerDirection!==direction;
  tradePlan.context=direction==='NEUTRAL'?'상위 스윙 방향 미확정 → 신규 진입 대기':`4시간 ${directionText(direction)} 계획 · ${opposite?'하위 봉은 반대 방향의 반등·조정 중':triggerDirection==='NEUTRAL'?'하위 방향 확인 중':'하위 흐름도 같은 방향'} → ${tradePlan.ready?'참고 진입 조건 충족':'진입 대기'}`;
  tradePlan.blockers=[
    ...(!upper.confirmed?[upper.reason]:[]),
    ...(!nativeReady?['데이터: 필요한 원본 봉 부족·오류']:[]),
    ...(!fresh?['데이터: 현재 1분봉 지연·시각 확인 필요']:[]),
    ...(!context?['구조: 4시간 방향·수요/공급 구역 미확정']:[]),
    ...(context&&!h4Touch?['구조: 상위 구역 실제 접촉 대기']:[]),
    ...(h4Touch&&!m15?['구조: 접촉 이후 15분 전환 구역 대기']:[]),
    ...(m15&&!m15Touch?['구조: 15분 구역 재접촉 대기']:[]),
    ...(m15Touch&&!m1?[`구조: ${entryMinutes}분 정제 구역 확정 대기`]:[]),
    ...(m1&&!m1Touch?['구조: 정제 구역 재접촉 대기']:[]),
    ...(m1&&current&&(current.close<m1.low||current.close>m1.high)?['실행: 현재 가격이 정제 구역 밖']:[]),
    ...(m1&&now-m1.at>1800000?['추가 설정: 하위 신호 30분 유효시간 초과']:[]),
    ...(m1&&!gradePass?['추가 설정: A/B 구역 등급 기준 미충족']:[]),
    ...(m1&&netR<2?['추가 설정: 비용·수량 반영 순 2R 기준 미충족']:[]),
    ...(confirmationDirection!==direction?['추가 설정: 1시간 내부 방향 동행 대기']:[]),
    ...steps.filter(step=>step.timeframe!=='1D'&&step.state!=='PASS').map(step=>step.timeframe+' 확인: '+step.detail),
  ];
  // A crossed parent stop/target is not an actionable prospective plan.
  if(tradePlan.candidate&&current&&(direction==='LONG'?(current.close<=tradePlan.candidate.stop||current.close>=tradePlan.candidate.target):(current.close>=tradePlan.candidate.stop||current.close<=tradePlan.candidate.target))){delete tradePlan.candidate;tradePlan.blockers.unshift('계획 무효: 가격이 상위 손절 또는 목표를 이미 통과함');}
  return {
    status,
    riskPlan,
    tradePlan,
    direction,
    entryTimeframe,
    summary:
      status === 'READY'
        ? `${directionText(direction)} 차트 후보 확인 · 자동 실험은 관측 순서 별도 검증`
        : status === 'BLOCKED'
          ? '시간대 방향 충돌로 진입 차단'
          : '시간대별 진입 조건 확인 중',
    steps:steps.map(step=>entryFrame==='5m'?{...step,detail:step.detail.replaceAll('1분','5분')}:step),
  };
}
