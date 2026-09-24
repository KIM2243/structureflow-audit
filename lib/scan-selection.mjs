// Exploration filters, NOT lecture entry rules or validated growth/meme labels.
export const SELECTION_POLICY = {version:2, minDailyBars:40, liquiditySlots:3, interestSlots:3,
  minTurnover:{KR:1e9,US:1e6}, relativeVolume:1.2, persistentDays:3, averageVolumeRatio:1.3,
  spikeVolumeRatio:5, spikeReturn:0.15, fiveDayOverheat:0.4};
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2;};
export function selectionEvidence(bars,market){
 if(bars.length<40)return {eligible:false,reasons:['일봉 40개 미만']};
 const recent=bars.slice(-5),baseline=bars.slice(-25,-5),last=bars.at(-1),previous=bars.at(-2);
 const baseVolume=mean(baseline.map(b=>b.volume));
 const ratio=baseVolume>0?mean(recent.map(b=>b.volume))/baseVolume:0;
 const elevatedDays=recent.filter(b=>baseVolume>0&&b.volume>=baseVolume*1.2).length;
 const turnover=median(bars.slice(-20).map(b=>b.close*b.volume));
 const return5=last.close/bars.at(-6).close-1,return20=last.close/bars.at(-21).close-1;
 const dailyReturn=last.close/previous.close-1,lastVolumeRatio=baseVolume>0?last.volume/baseVolume:0;
 const ma20=mean(bars.slice(-20).map(b=>b.close));
 const reasons=[];
 if(turnover<SELECTION_POLICY.minTurnover[market])reasons.push('최근 20일 중앙 거래대금 기준 미달');
 if(last.volume<=0||recent.filter(b=>b.volume>0).length<5)reasons.push('최근 5거래일 거래 지속성 부족');
 if(lastVolumeRatio>=5&&Math.abs(dailyReturn)>=0.15)reasons.push('하루 가격·거래량 동반 급변');
 if(Math.abs(return5)>=0.4)reasons.push('5거래일 가격 변동 과열');
 const interest=ratio>=1.3&&elevatedDays>=3&&return20>0&&last.close>=ma20;
 return {eligible:reasons.length===0,interest,turnover,volumeRatio:ratio,elevatedDays,return5,return20,
  aboveAverage:last.close>=ma20,reasons};
}
export function selectDetailed(rows,limit=6){
 const safe=rows.filter(r=>r.evidence.eligible),selected=[];
 // Reserve interest slots first, so overlap with liquid names cannot consume them twice.
 const rising=safe.filter(r=>r.evidence.interest).sort((a,b)=>b.evidence.elevatedDays-a.evidence.elevatedDays||b.evidence.volumeRatio-a.evidence.volumeRatio||a.item.symbol.localeCompare(b.item.symbol));
 for(const r of rising.slice(0,Math.min(3,limit)))selected.push({...r,selection:'interest'});
 const liquidity=[...safe].sort((a,b)=>b.evidence.turnover-a.evidence.turnover||a.item.symbol.localeCompare(b.item.symbol));
 for(const r of liquidity){if(selected.length>=limit)break;if(!selected.some(s=>s.item.symbol===r.item.symbol))selected.push({...r,selection:'liquidity'});}
 return selected;
}
export function attachTracking(report,previous,outcomes={}){
 const prior=new Map((previous?.candidates||[]).map(c=>[c.symbol,c]));
 for(const c of report.candidates){
  const old=prior.get(c.symbol),history=(old?.tracking?.history||[]).filter(h=>h.date<report.date);
  if(old&&!history.some(h=>h.date===previous.date))history.push({date:previous.date,direction:old.plan.direction,ready:old.plan.ready,stage:old.plan.stage});
  history.push({date:report.date,direction:c.plan.direction,ready:c.plan.ready,stage:c.plan.stage});
  c.tracking={firstSeen:old ? (old.tracking?.firstSeen || previous.date) : report.date,
   status:!old?'신규 발견':old.plan.direction!==c.plan.direction?'방향 변경':!old.plan.ready&&c.plan.ready?'진입 조건 확인':old.plan.ready&&!c.plan.ready?'진입 조건 해제':'계속 관찰',history:history.slice(-5)};
 }
 report.previousCandidates=[...prior.values()].filter(c=>!report.candidates.some(n=>n.symbol===c.symbol)).map(c=>({symbol:c.symbol,name:c.name,
  status:outcomes[c.symbol]||'이번 회차 미재분석 · 제외 확정 아님',previousDate:previous.date}));
 return report;
}
