import type { HigherContext } from '@/lib/higher-context';

export function HigherContextOverlay({ zones, minimum, maximum, left, right, top, bottom, y }: {
  zones: HigherContext[]; minimum: number; maximum: number; left: number; right: number; top: number; bottom: number; y: (value: number) => number;
}) {
  return <g aria-label="상위 확정 수요 공급 구역" pointerEvents="none">{zones.filter(z => z.low <= maximum && z.high >= minimum).map(z => {
    const upper = Math.max(top, y(z.high)), lower = Math.min(bottom, y(z.low));
    const color = z.direction === 'LONG' ? '#63dcbc' : '#f7a1af';
    return <g key={z.frame}><rect x={left} y={upper} width={right-left} height={Math.max(1,lower-upper)} fill={color} fillOpacity="0.06" stroke={color} strokeDasharray={z.frame==='1D'?'3 7':'8 5'}/><title>{z.frame} {z.direction==='LONG'?'수요':'공급'} · {z.grade}등급 · 관심 구역이며 진입가가 아닙니다.</title></g>;
  })}</g>;
}
