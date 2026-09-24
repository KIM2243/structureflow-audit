// Observations during the scan, not a live health check or a billing guarantee.
export function newTelemetry(previous){
 return {samples:0,minAvailableMiB:null,minFreeGiB:null,maxLoad:0,requests:0,failedRequests:0,maxRequestMs:0,
  protectedEarlier:Boolean(previous?.protectedEarlier||previous?.state==='protected'),
  priorMinAvailableMiB:previous?.minAvailableMiB??null,priorMaxLoad:previous?.maxLoad??0};
}
export function observe(t,{availableMiB,freeBytes,load}){
 t.samples++;t.minAvailableMiB=Math.min(t.minAvailableMiB??Infinity,availableMiB);
 t.minFreeGiB=Math.min(t.minFreeGiB??Infinity,freeBytes/1024**3);t.maxLoad=Math.max(t.maxLoad,load);
}
export function finishTelemetry(t,{elapsedMs,cpuMs,status}){
 const protectedState=status==='resource_paused'||t.protectedEarlier;
 const state=protectedState?'protected':!t.samples?'unknown':status==='complete'&&t.minAvailableMiB>=192&&t.maxLoad<0.8&&elapsedMs<600000&&t.failedRequests===0?'headroom':'caution';
 return {...t,elapsedMs,cpuMs,state};
}
