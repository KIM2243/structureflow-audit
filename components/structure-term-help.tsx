'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { mapMarketStructure } from '@/lib/market-structure';
import type { Candle, Snapshot } from '@/lib/engine';

export function StructureTermHelp({ frame, snapshot, candles }: { frame: string; snapshot: Snapshot; candles: Candle[] }) {
  const [detail, setDetail] = useState<{ snapshot: Snapshot; reason: string; at: string } | null>(null);
  const meaning = (trend: string) => trend === 'BULLISH' ? '상승 구조' : trend === 'BEARISH' ? '하락 구조' : '방향 확인 중 / 전환 경고';
  function open() {
    const map = mapMarketStructure(candles.slice(0, -1));
    const event = map.events.at(-1);
    const price = event?.price.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
    const bar = event ? candles[event.index] : undefined;
    const reason = candles.length < 6 ? '이 시간대의 데이터가 6개 미만이어서 구조를 판단하지 않고 기다리고 있습니다. 실제 추세 전환이 확인됐다는 뜻은 아닙니다.'
      : !event ? '아직 종가로 확인된 구조 돌파가 없어 상승·하락 중 하나를 확정하지 않았습니다.'
      : `${bar ? new Date(bar.date).toLocaleString('ko-KR') + ' 봉에서 ' : ''}종가가 ${price} 수준을 ${event.direction === 'BULLISH' ? '위로' : '아래로'} 넘었습니다. ` + (event.kind === 'CHOCH'
        ? '기존 방향을 지키던 보호 수준이 깨져 TRANSITION으로 표시합니다. 반대 방향이 시작될 가능성을 알리는 경고이며, 이후 그 방향의 BOS가 확인되기 전에는 새 추세로 확정하지 않습니다.'
        : `${event.direction === 'BULLISH' ? '상승' : '하락'} 방향의 BOS가 가장 최근 구조 사건이어서 ${snapshot.trend}로 표시합니다. 그 뒤 반대 방향의 보호 수준 이탈은 아직 구조 사건으로 확인되지 않았습니다.`);
    setDetail({ snapshot: { ...snapshot }, reason, at: new Date().toLocaleString('ko-KR') });
  }
  return <>
    <button type="button" className={`structure-term-button ${snapshot.trend.toLowerCase()}`} onClick={open} aria-label={`${frame} ${snapshot.trend} 용어와 현재 판단 근거 보기`} aria-haspopup="dialog">{snapshot.trend}<span aria-hidden="true">?</span></button>
    <Dialog open={Boolean(detail)} onOpenChange={open => { if (!open) setDetail(null); }}>
      <DialogContent className="entry-reason-dialog structure-term-dialog">
        {detail && <><DialogHeader><DialogTitle>{frame} · {detail.snapshot.trend}</DialogTitle><DialogDescription>{meaning(detail.snapshot.trend)} · {detail.at}에 확인한 분석</DialogDescription></DialogHeader>
          <section><h3>쉽게 말하면</h3><p>{detail.snapshot.trend === 'BULLISH' ? '가격의 큰 굴곡이 상승 쪽으로 진행된다고 분류한 상태입니다. 매 봉이 오르거나 지금 바로 매수해야 한다는 뜻은 아닙니다.' : detail.snapshot.trend === 'BEARISH' ? '가격의 큰 굴곡이 하락 쪽으로 진행된다고 분류한 상태입니다. 중간에 반등할 수 있고, 지금 바로 숏에 진입하라는 뜻은 아닙니다.' : '기존 흐름이 흔들렸거나 아직 방향을 판단할 근거가 부족한 상태입니다. 횡보 또는 추세 반전이 확정됐다는 뜻은 아닙니다.'}</p></section>
          <section><h3>왜 지금 이 용어가 표시됐나요?</h3><p>{detail.reason}</p><p><b>최근 사건:</b> {detail.snapshot.event}</p><p><b>최근 고점·저점:</b> {detail.snapshot.sequence}</p><p>현재 진행 중인 마지막 봉은 제외하고 구조를 계산합니다. 고점·저점 네 글자의 다수결이 아니라 종가 돌파와 보호 수준을 기준으로 판단합니다.</p></section>
          <section><h3>함께 보이는 약어 읽기</h3><dl className="structure-term-definitions"><div><dt>HH / HL</dt><dd>이전보다 높은 고점 / 높은 저점. 올라가면서 쉬어 가는 모양을 읽는 말입니다.</dd></div><div><dt>LH / LL</dt><dd>이전보다 낮은 고점 / 낮은 저점. 반등해도 이전 높이에 못 미치거나 저점이 내려간 모양입니다.</dd></div><div><dt>BOS</dt><dd>Break of Structure, 구조 돌파. 이 엔진에서는 종가가 기준 고점·저점을 넘어 방향을 확인한 사건입니다.</dd></div><div><dt>CHoCH</dt><dd>Change of Character, 흐름 변화 경고. 기존 추세의 보호 수준이 반대로 깨진 사건입니다.</dd></div><div><dt>Swing / Internal</dt><dd>큰 굴곡의 구조 / 그 안의 작은 굴곡입니다. 위 배지는 Swing 기준이므로 내부 방향과 다를 수 있습니다.</dd></div><div><dt>↑ / ↓</dt><dd>해당 돌파 사건의 상승 / 하락 방향입니다. 미래 가격을 보장하는 화살표가 아닙니다.</dd></div></dl></section>
          <section><h3>어떻게 활용하나요?</h3><p>먼저 4시간봉 공통 계획의 방향·관심 구역·손절·목표를 확인하고, 1분/5분봉으로 진입을 정밀화합니다. 예를 들어 4시간봉이 BEARISH인데 1분봉이 BULLISH라면 큰 하락 안의 짧은 반등일 수 있습니다.</p><p>이 배지는 선택한 시간대의 구조 설명입니다. 실제 진입 조건은 옆의 롱·숏 우세 버튼과 공통 거래 계획에서 따로 확인하세요. 팝업은 클릭 시점 내용을 유지합니다.</p></section>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}

