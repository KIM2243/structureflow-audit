'use client';
import { useState } from 'react';
import type { TradePlan } from '@/lib/trade-plan';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function PlanPriceHelp({ kind, plan }: { kind: 'interest'|'entry'|'stop'|'target'; plan: TradePlan }) {
  const [opened, setOpened] = useState<TradePlan|null>(null);
  const titles = { interest:'4H 관심 구역',entry:'하위 진입 구역',stop:'상위 구조 손절',target:'4H 스윙 익절 목표' };
  const p=opened??plan, long=p.direction==='LONG';
  const levels=p.ready?{entry:p.entry,stop:p.stop,target:p.target}:p.candidate;
  const number=(n:number)=>n.toLocaleString('ko-KR',{maximumFractionDigits:6});
  const range=(r:[number,number])=>r.map(number).join(' – ');
  const value=kind==='interest'?p.interest&&range(p.interest):kind==='entry'?levels?.entry&&range(levels.entry):kind==='stop'?levels?.stop&&number(levels.stop):levels?.target&&number(levels.target);
  const explain={
    interest:`4시간봉의 확정 스윙 구조에서 현재 방향을 지키는 기원 봉을 찾습니다. ${long?'롱은 그 봉의 저가부터 몸통 아래쪽까지를 수요 구역으로 잡고, 확정 스윙 범위의 중간값 이하로 제한합니다.':'숏은 그 봉의 몸통 위쪽부터 고가까지를 공급 구역으로 잡고, 확정 스윙 범위의 중간값 이상으로 제한합니다.'} 그래서 한 점이 아니라 기다릴 가격 범위가 표시됩니다.`,
    entry:`4시간 구역 접촉 → 15분 전환 구역과 재접촉 → ${p.entryFrame==='5m'?'5분':'1분'} 전환 이후의 기원 구역을 찾습니다. 상위 구역 안에 포함되는 정제 범위가 진입 후보입니다. 관심 구역의 중간값이나 현재가를 임의로 진입가로 쓰지 않습니다.`,
    stop:`진입을 정밀화하기 전에 확정한 15분 기원 구역의 ${long?'하단':'상단'} 바깥에 손절을 둡니다. ${long?'하단 × 0.999':'상단 × 1.001'}로 0.1% 완충을 적용합니다. 1분/5분 구역이 좁아져도 그 작은 구역의 끝으로 손절을 당기지 않습니다.`,
    target:`4시간 확정 스윙에서 ${long?'상승 방향의 약한 고점':'하락 방향의 약한 저점'} 가격을 목표로 사용합니다. ‘약한’은 돌파 대상 후보라는 구조 용어이며 도달을 보장한다는 뜻은 아닙니다. 원하는 손익비를 만들려고 ATR 배수로 목표를 늘리지 않습니다.`,
  };
  return <><button type="button" className="plan-price-help" aria-label={`${titles[kind]} 가격 산정 이유 보기`} aria-haspopup="dialog" onClick={()=>setOpened(structuredClone(plan))}>왜 이 가격인가요? <span aria-hidden="true">?</span></button>
  <Dialog open={!!opened} onOpenChange={open=>{if(!open)setOpened(null);}}><DialogContent className="entry-reason-dialog structure-term-dialog"><DialogHeader><DialogTitle>{titles[kind]} · 가격 산정 이유</DialogTitle><DialogDescription>클릭한 시점의 공통 참고 계획입니다. 가격은 현재 종목의 표시 통화 기준입니다.</DialogDescription></DialogHeader>
  <section><h3>{value?`표시 가격: ${value}`:'아직 가격이 미확정입니다'}</h3><p>{value?explain[kind]:kind==='interest'?'4시간 방향·보호 수준·확정 스윙 범위가 모두 갖춰진 유효 구역을 아직 찾지 못했습니다.':kind==='entry'?'상위 접촉 이후의 하위 정제 구역과 가격 관계가 아직 유효하지 않아 진입가를 만들지 않았습니다.':'유효한 상위 손절·목표 계획이 아직 없거나 현재 가격이 이미 손절·목표를 통과해 후보가 무효화됐습니다.'}</p>{!value&&<><p><b>계산 기준:</b> {explain[kind]}</p><p><b>현재 단계:</b> {p.stage}</p><p><b>다음 확인:</b> {p.blockers?.[0]??p.stage}</p></>}</section>
  {kind==='stop'&&levels?.stop&&<section><h3>이 숫자의 계산식</h3><p>{number(levels.stop/(long?0.999:1.001))} × {long?'0.999':'1.001'} = {number(levels.stop)}</p><p>왼쪽 값은 저장된 손절가에서 역산한 15분 구역 경계입니다. 화면 반올림으로 끝자리 차이가 날 수 있습니다.</p></section>}
  <section><h3>어떻게 활용하나요?</h3><p>{kind==='interest'?'이 구역에 접근했다고 바로 진입하지 않습니다. 접촉 이후 하위 구조가 실제로 전환되는지 확인합니다.':kind==='entry'?'이 범위에 재접촉해도 추가 조건이 남으면 대기합니다. 범위는 지정가 주문이 아니며 실제 모의 체결가는 관측 시세와 비용에 따라 달라집니다.':kind==='stop'?'손절 폭에 맞춰 수량을 줄여 위험을 관리합니다. 보유 중 실제 손절은 모의투자에 저장된 최초 계획을 확인하세요.': '목표 도달 또는 상위 구조 무효화로 청산합니다. 작은 봉의 반대 신호만으로 익절하지 않습니다. 실제 보유 포지션의 목표는 모의투자 기록이 기준입니다.'}</p><p>{p.ready?'참고 진입 조건은 충족했지만 실제 체결 통지는 아닙니다.':'현재는 조건부 계획입니다. 가격이 표시되어도 즉시 진입 허용을 뜻하지 않습니다.'}</p></section>
  <section><h3>강의 원칙과 구현 기준</h3><p>상위 구조를 먼저 정하고 하위 봉으로 진입을 정밀화하는 흐름을 따릅니다. 기원 봉 경계·중간값 제한·15분 손절·4시간 목표·0.1% 완충은 현재 시스템의 구체적인 구현 기준이며 강의 전체의 고정 공식으로 확인된 것은 아닙니다.</p></section>
  </DialogContent></Dialog></>;
}
