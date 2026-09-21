import type {Zone} from './auto-paper';
export type TradePlan={direction:'LONG'|'SHORT'|'NEUTRAL';entryFrame:'1m'|'5m';stage:string;ready:boolean;interest?:[number,number];entry?:[number,number];stop?:number;target?:number;netR:number;asOf:number;candidate?:{entry?:[number,number];stop:number;target:number};blockers?:string[];context?:string};
// A reference plan never promotes an interest-zone midpoint to an entry price.
export function composeTradePlan(input:{direction:TradePlan['direction'];entryFrame:TradePlan['entryFrame'];stage:string;ready:boolean;interest?:Zone;refined?:Zone;risk?:{stop:number;target:number};netR:number;asOf:number}):TradePlan{
 const {direction,entryFrame,stage,netR,asOf}=input;
 const z=input.refined,r=input.risk;
 const ordered=!!z&&!!r&&[z.low,z.high,r.stop,r.target].every(n=>Number.isFinite(n)&&n>0)&&z.low<=z.high&&(direction==='LONG'?r.stop<z.low&&r.target>z.high:direction==='SHORT'?r.target<z.low&&r.stop>z.high:false);
 const ready=input.ready&&ordered&&netR>=2;
 const parent=input.interest;
 const riskValid=!!r&&!!parent&&[r.stop,r.target,parent.low,parent.high].every(n=>Number.isFinite(n)&&n>0)&&parent.low<=parent.high&&(direction==='LONG'?r.stop<r.target&&r.target>parent.high:direction==='SHORT'?r.target<r.stop&&r.target<parent.low:false);
 return {direction,entryFrame,stage:input.ready&&!ready?'가격 관계·손익비 재확인':stage,ready,interest:parent?[parent.low,parent.high]:undefined,...(riskValid?{candidate:{stop:r!.stop,target:r!.target,...(ordered?{entry:[z!.low,z!.high] as [number,number]}:{})}}:{}),...(ready?{entry:[z!.low,z!.high] as [number,number],stop:r!.stop,target:r!.target}:{}),netR:ready?netR:0,asOf};
}
