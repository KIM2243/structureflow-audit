import type {AutoDecision} from './auto-paper';
export const reviewKinds={early:'성급한 진입',missed:'놓친 진입',zone:'구역 선택 차이',appropriate:'적절한 판단',uncertain:'자료 부족'} as const;
export type ReviewDraft={kind:keyof typeof reviewKinds;expected:'ENTER'|'WAIT'|'UNSURE';frame:'4H'|'15m'|'1m';low:number|null;high:number|null;reference:string;notes:string};
export type EntryReview={id:string;runId:string;at:number;decision:AutoDecision;draft:ReviewDraft;hasChart:boolean;revision:number;updatedAt:number};
export function validateReview(value:unknown):ReviewDraft {
  if(!value||typeof value!=='object')throw new Error('검토 내용을 확인하세요.');
  const d=value as ReviewDraft;
  if(!Object.hasOwn(reviewKinds,d.kind)||!['ENTER','WAIT','UNSURE'].includes(d.expected)||!['4H','15m','1m'].includes(d.frame)||typeof d.reference!=='string'||d.reference.length>500||typeof d.notes!=='string'||d.notes.length>5000)throw new Error('검토 항목 또는 메모 길이가 올바르지 않습니다.');
  if((d.low===null)!==(d.high===null)||(d.low!==null&&(!Number.isFinite(d.low)||!Number.isFinite(d.high)||d.low<=0||d.high!<=d.low)))throw new Error('기대 구역의 양수 하단·상단을 함께 입력하세요. 상단은 하단보다 커야 합니다.');
  if(d.kind==='zone'&&d.low===null)throw new Error('구역 차이를 검토하려면 기대 구역을 입력하세요.');
  if(!d.notes.trim())throw new Error('판정 근거를 한 줄 이상 입력하세요.');
  return {...d,notes:d.notes.trim(),reference:d.reference.trim()};
}
export function reviewEvidence(d:AutoDecision){
  const s=d.setup,entry=d.fills.some(f=>f.action==='ENTRY');
  const sequence=s?.touch&&s.m15&&s.retest&&s.m1? s.touch<s.m15.at&&s.m15.at<s.retest&&s.retest<s.m1.at&&s.m1.at<d.at:null;
  return {entry,sequence,inside:d.checks?.insideM1??null,rr:d.checks?.weightedR??null,blocked:d.health?.issues.filter(i=>i.level==='block').map(i=>i.message)||[]};
}
export function zoneDifference(d:AutoDecision,draft:ReviewDraft){
  const actual=d.setup?.[draft.frame==='4H'?'zone':draft.frame==='15m'?'m15':'m1'];
  if(!actual||draft.low===null||draft.high===null||!Number.isFinite(draft.low)||!Number.isFinite(draft.high)||draft.low<=0||draft.high<=draft.low)return null;
  const overlap=Math.max(0,Math.min(actual.high,draft.high)-Math.max(actual.low,draft.low));
  return {actual,lowDelta:draft.low-actual.low,highDelta:draft.high-actual.high,overlapPct:overlap/(Math.max(actual.high,draft.high)-Math.min(actual.low,draft.low))*100};
}
