// Offline audit only. Pure legacy analysis imports; no network, trading or database side effects.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {mapFalconSwingStructure} from '../lib/falcon-structure.ts';
import {mapFalconInternalStructure} from '../lib/falcon-internal.ts';
import {historicalFalconObservations,falconFrames} from '../lib/falcon-shadow.ts';
import {mapMarketStructure,mechanicalInternalPivots} from '../lib/market-structure.ts';
import {detectStructureEvents} from '../lib/engine.ts';
import {validBars} from '../lib/confirmed-bars.ts';
import {classifyPhase} from '../lib/market-phases.ts';

export const ENGINE_HEAD='208cfb37290f263ba06e129d8b96e5bd20fc3846';
export const BASELINE='88214a4a097c95cbfd66dbf5deeeb7ada1f017e5';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const crossing=(direction,bar,price,wick=false)=>direction==='BULLISH'?(wick?bar.high:bar.close)>price:(wick?bar.low:bar.close)<price;
const opposite=d=>d==='BULLISH'?'BEARISH':'BULLISH';
const known=d=>d==='BULLISH'||d==='BEARISH';
const latest=(events,index)=>events.filter(e=>(e.eventIndex??e.index)===index);
const compact=s=>({swing:s.swing.trend,protected:s.swing.protectedLevel??null,weak:s.swing.weakLevel??null,internal:s.internal.trend,minorHigh:s.internal.confirmedMinorHigh??null,minorLow:s.internal.confirmedMinorLow??null,choch:s.internal.events.findLast(e=>e.kind==='CHOCH')??null});

export function validateDataset(data,now=Date.now()){
 if(!data||typeof data.symbol!=='string'||!data.symbol.trim()||typeof data.source!=='string'||!data.source.trim()||typeof data.timezone!=='string')throw Error('Require symbol, source and timezone');
 try{new Intl.DateTimeFormat('en',{timeZone:data.timezone}).format();}catch{throw Error('Invalid timezone');}
 const captured= data.capturedAt===undefined?now:Date.parse(data.capturedAt);
 if(!Number.isFinite(captured)||captured>now)throw Error('Invalid/future capturedAt');
 const warnings=[],coverage={},metadata={},durations={...falconFrames,...(data.timeframes?.['1D']?{'1D':1440}:{})};
 for(const [frame,minutes] of Object.entries(durations)){
  const bars=data.timeframes?.[frame],meta=data.frameMetadata?.[frame]??{};
  if(!Array.isArray(bars)||bars.length<3)throw Error('Missing timeframe or fewer than 3 bars: '+frame);
  for(const key of ['symbol','source','timezone'])if(meta[key]!==undefined&&meta[key]!==data[key])throw Error('Inconsistent '+key+': '+frame);
  if(meta.derived!==undefined&&typeof meta.derived!=='boolean')throw Error('Invalid derived flag: '+frame);
  if(meta.derived===true&&(!meta.derivedFrom||!meta.aggregation))throw Error('Derived frame requires derivedFrom and aggregation: '+frame);
  if(meta.derived===undefined)warnings.push({frame,code:'PROVENANCE_UNKNOWN',message:'Native/derived provenance not supplied; cannot claim native validation.'});
  for(let i=0;i<bars.length;i++){
   const bar=bars[i],t=Date.parse(bar?.date);
   for(const key of ['symbol','source','timezone'])if(bar?.[key]!==undefined&&bar[key]!==data[key])throw Error('Inconsistent candle '+key+': '+frame+' bar '+i);
   if(!bar||typeof bar.date!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(bar.date)||!Number.isFinite(t)||!validBars([bar]))throw Error('Invalid OHLCV/timestamp: '+frame+' bar '+i);
   if(t>captured||t>now)throw Error('Future timestamp: '+frame+' bar '+i);
   if(i&&Date.parse(bars[i-1].date)>=t)throw Error('Duplicate or non-increasing timestamp: '+frame+' bar '+i);
  }
  const residues=new Set(bars.map(bar=>Date.parse(bar.date)%(minutes*60000)));
  if(residues.size>1||bars.some(bar=>Date.parse(bar.date)%60000!==0))warnings.push({frame,code:'ALIGNMENT_REVIEW',message:'Nonuniform nominal grid; review exchange/session anchors, DST and shortened bars. No automatic repair.'});
  coverage[frame]={start:bars[0].date,end:bars.at(-1).date,count:bars.length};
  metadata[frame]={...meta,derived:meta.derived??null};
 }
 for(const key of Object.keys(data.timeframes??{}))if(!(key in durations))throw Error('Unsupported timeframe: '+key);
 for(const [higher,lower] of [['4H','1H'],['1H','15m'],['15m','5m'],['5m','1m']]){
  const grid=falconFrames[lower]*60000,residues=new Set(data.timeframes[lower].map(b=>Date.parse(b.date)%grid));
  if(data.timeframes[higher].some(b=>!residues.has(Date.parse(b.date)%grid)))warnings.push({frame:higher,code:'CROSS_FRAME_ALIGNMENT_REVIEW',message:'Higher-frame timestamps do not match lower-frame nominal grid; inspect session anchoring.'});
 }
 const commonStart=Math.max(...Object.values(coverage).map(c=>Date.parse(c.start)));
 const commonEnd=Math.min(captured,...Object.values(coverage).map(c=>Date.parse(c.end)));
 if(commonStart>=commonEnd)throw Error('No overlapping timeframe period');
 const start=data.period?.start===undefined?commonStart:Date.parse(data.period.start),end=data.period?.end===undefined?commonEnd:Date.parse(data.period.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||start<commonStart||end>commonEnd)throw Error('Requested period outside shared coverage');
 if(end-start<4*60*60000)warnings.push({code:'SHORT_MTF_OVERLAP',message:'Shared period shorter than one H4 duration; MTF evidence is insufficient.'});
 for(const [frame,minutes]of Object.entries(durations)){
  const eligible=historicalFalconObservations(data.timeframes[frame],minutes,end);
  if(!eligible.some(r=>r.observedAt>=start))warnings.push({frame,code:'NO_COMPLETED_BAR_IN_OVERLAP',message:'No completed observable bar inside shared period.'});
 }
 return {start,end,captured,warnings,coverage,metadata,durations};
}

// Evidence labels describe local mechanisms, not causal certainty for divergent histories.
export function categorize(previous,state,row){
 const index=row.index,freshS=latest(state.swing.events,index),freshI=latest(state.internal.events,index),legacyI=latest(state.legacyInternalEvents,index);
 if(state.internal.ambiguities.some(a=>a.eventIndex===index))return {category:'SAME_BAR_AMBIGUITY',reason:'New Minor confirmed on an ambiguous OHLC bar; no same-bar CHoCH against it.'};
 if(freshI.some(e=>e.kind==='CHOCH'&&!crossing(e.direction,row.candle,e.price))&&!legacyI.some(e=>e.kind==='CHOCH'))return {category:'TYPE2_WICK_DIFFERENCE',reason:'Falcon confirmed-Minor wick CHoCH without a close through its target; no current legacy CHoCH.'};
 if(freshS.some(e=>e.kind==='CHOCH')&&state.legacy.trend==='TRANSITION')return {category:'SWING_REVERSAL_DIFFERENCE',reason:'First protected close break reverses Falcon; legacy remains TRANSITION.'};
 if(!state.swing.initialDirection||!state.internal.initialDirection)return {category:'INITIALIZATION_DIFFERENCE',reason:'At least one unseeded Falcon scope has not established its initial direction; attribution is provisional.'};
 if(legacyI.length&&!freshI.length&&(state.internal.candidate||state.internal.points.length!==previous.internal.points.length))return {category:'MINOR_CONFIRMATION_DIFFERENCE',reason:'Legacy event while Falcon candidate/confirmation state differs; not a proof of equivalent targets.'};
 if(freshS.length||latest(state.legacy.events,index).length)return {category:'SWING_VALIDATION_DIFFERENCE',reason:'Swing event/anchor differs after initialization; inspect both target histories before assigning a root cause.'};
 return {category:'OTHER',reason:'Persisting state or anchor divergence with no directly evidenced current-bar mechanism. Prior differing events are retained in the record; causal origin unresolved.'};
}

export function auditStep(previous,state,row){
 const errors=[],check=(ok,rule)=>{if(!ok)errors.push({index:row.index,rule});};
 for(const [scope,result,before] of [['SWING',state.swing,previous.swing],['INTERNAL',state.internal,previous.internal]]){
  const points=[...result.points,...(scope==='SWING'?[result.protectedLevel,result.weakLevel]:[result.currentExtreme,result.confirmedMinorHigh,result.confirmedMinorLow])].filter(Boolean);
  for(const p of points){check(p.pivotIndex<=p.confirmedAt&&p.confirmedAt<=row.index,'POINT_INDEX_ORDER');check(p.observedAt<=row.observedAt,'POINT_OBSERVED_ORDER');}
  for(const e of latest(result.events,row.index)){
   check(e.pivotIndex<=e.confirmedAt&&e.confirmedAt<=e.eventIndex,'EVENT_INDEX_ORDER');
   check(e.observedAt===row.observedAt,'EVENT_OBSERVED_ORDER');
   const target=scope==='SWING'?(e.kind==='CHOCH'?before.protectedLevel:before.weakLevel):e.kind==='BOS'?before.currentExtreme:e.direction==='BULLISH'?before.confirmedMinorHigh:before.confirmedMinorLow;
   check(!!target&&e.pivotIndex===target.pivotIndex&&e.confirmedAt===target.confirmedAt&&e.price===target.price,scope==='INTERNAL'&&e.kind==='CHOCH'?'CONFIRMED_MINOR_TARGET':'TARGET_IDENTITY');
   check(!!target&&target.observedAt<=e.observedAt,'TARGET_OBSERVED_ORDER');
   check(crossing(e.direction,row.candle,e.price,scope==='INTERNAL'),'BREAK_PREDICATE');
   check(result.trend===e.direction,'IMMEDIATE_DIRECTION');
   if(scope==='SWING'){check(row.complete,'SWING_COMPLETED');if(e.kind==='BOS')check(crossing(e.direction,row.candle,e.price),'SWING_BOS_CLOSE');}
   if(scope==='INTERNAL'&&e.kind==='CHOCH'){check(e.confirmedAt<row.index,'NO_SAME_BAR_MINOR');check(known(before.trend)&&before.trend!==e.direction,'CHOCH_CHANGES_DIRECTION');}
  }
  if(scope==='SWING'&&known(before.trend)&&before.protectedLevel&&row.complete&&crossing(opposite(before.trend),row.candle,before.protectedLevel.price)){
   check(latest(result.events,row.index).some(e=>e.kind==='CHOCH'&&e.direction===opposite(before.trend)),'PROTECTED_BREAK_NOT_IGNORED');
  }
  if(scope==='INTERNAL'&&known(before.trend)){
   const target=before.trend==='BULLISH'?before.confirmedMinorLow:before.confirmedMinorHigh;
   if(target&&target.confirmedAt<row.index&&crossing(opposite(before.trend),row.candle,target.price,true))check(latest(result.events,row.index).some(e=>e.kind==='CHOCH'),'MINOR_WICK_NOT_IGNORED');
  }
 }
 return errors;
}

function calculate(rows){const candles=rows.map(r=>r.candle);return {swing:mapFalconSwingStructure(rows),internal:mapFalconInternalStructure(rows),legacy:mapMarketStructure(candles),legacyInternalEvents:detectStructureEvents(candles,mechanicalInternalPivots(candles),'INTERNAL',1)};}
export function auditFrame(rows,frame){
 const full=calculate(rows),records=[],violations=[],prefixViolations=[],states=[];let previous=calculate([]);
 for(let n=1;n<=rows.length;n++){
  const row=rows[n-1],state=calculate(rows.slice(0,n));
  violations.push(...auditStep(previous,state,row));
  for(const scope of ['swing','internal']){
   if(!equal(state[scope].events,full[scope].events.filter(e=>e.eventIndex<=row.index)))prefixViolations.push({index:row.index,scope,field:'events'});
   if(!equal(state[scope].points,full[scope].points.filter(p=>p.confirmedAt<=row.index)))prefixViolations.push({index:row.index,scope,field:'points'});
   const events=full[scope].events.filter(e=>e.eventIndex<=row.index),initial=full[scope].initialDirection;
   const reconstructed=events.at(-1)?.direction??(initial&&initial.index<=row.index?calculate(rows.filter(r=>r.index<=initial.index))[scope].trend:'TRANSITION');
   if(state[scope].trend!==reconstructed)prefixViolations.push({index:row.index,scope,field:'trend'});
  }
  const legacyInternal=state.legacyInternalEvents.at(-1)?.direction??'TRANSITION';
  const legacy={swing:state.legacy.trend,protected:state.legacy.protectedLevel??null,weak:state.legacy.weakLevel??null,internal:legacyInternal,swingEvent:state.legacy.events.at(-1)??null,internalEvent:state.legacyInternalEvents.at(-1)??null};
  const falcon={...compact(state),currentExtreme:state.internal.currentExtreme??null,candidate:state.internal.candidate??null,swingEvent:state.swing.events.at(-1)??null,internalEvent:state.internal.events.at(-1)??null,sameBarAmbiguity:state.internal.ambiguities.filter(a=>a.eventIndex===row.index)};
  const anchor=p=>p?{price:p.price,index:p.pivotIndex??p.index}:null;
  const swingDifference=legacy.swing!==falcon.swing,internalDifference=legacy.internal!==falcon.internal;
  const chochTimingDifference=!equal(latest(state.legacyInternalEvents,row.index).filter(e=>e.kind==='CHOCH').map(e=>[e.direction,e.price]),latest(state.internal.events,row.index).filter(e=>e.kind==='CHOCH').map(e=>[e.direction,e.price]));
  const difference=swingDifference||internalDifference||!equal(anchor(legacy.protected),anchor(falcon.protected))||!equal(anchor(legacy.weak),anchor(falcon.weak))||!equal(latest(state.legacy.events,row.index).map(e=>[e.kind,e.direction,e.price]),latest(state.swing.events,row.index).map(e=>[e.kind,e.direction,e.price]))||!equal(latest(state.legacyInternalEvents,row.index).map(e=>[e.kind,e.direction,e.price]),latest(state.internal.events,row.index).map(e=>[e.kind,e.direction,e.price]));
  records.push({timeframe:frame,timestamp:row.candle.date,observedAt:row.observedAt,legacySwing:legacy.swing,falconSwing:falcon.swing,legacyInternal,falconInternal:falcon.internal,legacyEvent:legacy.internalEvent,falconEvent:falcon.internalEvent,legacy,falcon,swingDifference,internalDifference,chochTimingDifference,difference,...(difference?categorize(previous,state,row):{category:null,reason:null})});
  states.push(state);previous=state;
 }
 const sensitivity=[20,50,100].filter(n=>rows.length>n+1).map(offset=>{
  const shifted=calculate(rows.slice(offset));const mismatches=[];
  for(let n=offset+1;n<=rows.length;n++)if(!equal(compact(calculate(rows.slice(offset,n))),compact(states[n-1])))mismatches.push(rows[n-1].index);
  return {offset,final:compact(shifted),reference:compact(full),finalEqual:equal(compact(shifted),compact(full)),mismatchBars:mismatches.length,lastMismatchIndex:mismatches.at(-1)??null,stableSuffixBars:mismatches.length?rows.filter(r=>r.index>mismatches.at(-1)).length:rows.length-offset};
 });
 return {frame,records,violations,prefixViolations,sensitivity,summary:{totalBars:rows.length,swingDifferences:records.filter(r=>r.swingDifference).length,internalDifferences:records.filter(r=>r.internalDifference).length,chochTimingDifferences:records.filter(r=>r.chochTimingDifference).length,type2WickDifferences:records.filter(r=>r.category==='TYPE2_WICK_DIFFERENCE').length,reversalDifferences:records.filter(r=>r.category==='SWING_REVERSAL_DIFFERENCE').length,initializationDifferences:records.filter(r=>r.category==='INITIALIZATION_DIFFERENCE').length,prefixViolations:prefixViolations.length,timestampViolations:violations.filter(v=>/ORDER/.test(v.rule)).length,candidateTargetViolations:violations.filter(v=>v.rule==='CONFIRMED_MINOR_TARGET').length,wickOnlySwingBosViolations:violations.filter(v=>v.rule==='SWING_BOS_CLOSE').length,sameBarLookAheadViolations:violations.filter(v=>v.rule==='NO_SAME_BAR_MINOR').length,categories:Object.fromEntries(['TYPE1_CLOSE_DIFFERENCE','TYPE2_WICK_DIFFERENCE','MINOR_CONFIRMATION_DIFFERENCE','SWING_REVERSAL_DIFFERENCE','INITIALIZATION_DIFFERENCE','SAME_BAR_AMBIGUITY','SWING_VALIDATION_DIFFERENCE','OTHER'].map(k=>[k,records.filter(r=>r.category===k).length])),sameBarAmbiguities:full.internal.ambiguities.length}};
}

export function validateShadow(data){
 const input=validateDataset(data),{start,end}=input,frames={};
 for(const [frame,minutes]of Object.entries(input.durations)){
  const rows=historicalFalconObservations(data.timeframes[frame],minutes,input.captured).filter(r=>r.observedAt<=end);
  frames[frame]=auditFrame(rows,frame);
 }
 const times=[...new Set(Object.values(frames).flatMap(f=>f.records.map(r=>r.observedAt)))].filter(t=>t>=start&&t<=end).sort((a,b)=>a-b);
 const mtf=times.map(timestamp=>{
  const states=Object.fromEntries(Object.entries(frames).map(([k,f])=>[k,f.records.findLast(r=>r.observedAt<=timestamp)?.falcon??null]));
  const swing=states['4H']?.swing??'TRANSITION',internal=states['1H']?.internal??'TRANSITION';
  const contexts=Object.fromEntries(['1H','15m','5m','1m'].map(k=>[k,!known(swing)||!known(states[k]?.internal)?'UNCONFIRMED':swing===states[k].internal?'PRO_TREND_ALIGNMENT':'HTF_PULLBACK_CONTEXT']));
  return {timestamp:new Date(timestamp).toISOString(),states,contexts,LONG:classifyPhase('LONG',swing,internal),SHORT:classifyPhase('SHORT',swing,internal)};
 });
 const phaseExamples=Object.fromEntries(['CC','CP','PC','PP'].map(phase=>[phase,mtf.flatMap(r=>['LONG','SHORT'].filter(position=>r[position]===phase).map(position=>({timestamp:r.timestamp,swing:r.states['4H'].swing,internal:r.states['1H'].internal,position,phase}))).slice(0,3)]));
 return {phaseExamples,REAL_DATA_VALIDATION:data.synthetic===true?'NOT_RUN':'EXECUTED_UNVERIFIED_PROVENANCE',synthetic:data.synthetic===true,status:Object.values(frames).some(f=>f.violations.length||f.prefixViolations.length)?'RULE_VIOLATIONS':'REQUIRES_EXTERNAL_REVIEW',recommendation:'NOT READY',reason:'Harness output requires coverage and lecture-case review; no automatic production approval.',engineHead:ENGINE_HEAD,baseline:BASELINE,inputValidation:input,dataset:{symbol:data.symbol,source:data.source,timezone:data.timezone,period:{start:new Date(start).toISOString(),end:new Date(end).toISOString()},capturedAt:new Date(input.captured).toISOString(),sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')},frames,mtf,limitations:['TYPE1_CLOSE_DIFFERENCE is reserved; no causal label assigned without equivalent target evidence.','General Swing valid continuation eligibility requires external case review; emitted BOS and protected reversal are checked.','MTF contexts describe states, not validated chronological pullback onset/end or profitability.','No empirical READY decision is automated.'],productionChanged:false};
}
export const notRun=()=>({REAL_DATA_VALIDATION:'NOT_RUN',recommendation:'NOT READY',reason:'No actual Kiwoom OHLCV supplied. Harness preparation only; real-data correctness is unverified.',engineHead:ENGINE_HEAD,baseline:BASELINE,productionChanged:false});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output='artifacts/falcon-shadow-validation.json']=process.argv.slice(2);
 let result;
 try{result=input?validateShadow(JSON.parse(await readFile(input,'utf8'))):notRun();}
 catch(error){result={REAL_DATA_VALIDATION:'NOT_RUN',status:'INPUT_VALIDATION_FAILED',error:error.message,productionChanged:false};process.exitCode=1;}
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2));
 console.log(JSON.stringify({output,REAL_DATA_VALIDATION:result.REAL_DATA_VALIDATION,status:result.status,frames:Object.fromEntries(Object.entries(result.frames??{}).map(([k,v])=>[k,v.summary])),recommendation:result.recommendation,error:result.error}));
}
