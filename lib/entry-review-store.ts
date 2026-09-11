import {env} from 'cloudflare:workers';
import type {AutoState} from './auto-paper';
import {validateReview,type EntryReview} from './entry-review';
type Row={id:string;user_id:string;run_id:string;decision_at:number;decision:string;draft:string;replay_key:string|null;revision:number;updated_at:number};
const view=(r:Row):EntryReview=>({id:r.id,runId:r.run_id,at:r.decision_at,decision:JSON.parse(r.decision),draft:JSON.parse(r.draft),hasChart:!!r.replay_key,revision:r.revision,updatedAt:r.updated_at});
export async function listEntryReviews(userId:string){const rows=await env.DB.prepare('SELECT * FROM entry_reviews WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(userId).all<Row>();return rows.results.map(view);}
export async function reviewChart(userId:string,id:string){const r=await env.DB.prepare('SELECT * FROM entry_reviews WHERE id=? AND user_id=?').bind(id,userId).first<Row>();if(!r?.replay_key)return null;const obj=await env.FILES.get(r.replay_key);return obj?obj.json():null;}
export async function saveEntryReview(userId:string,body:Record<string,unknown>){
  const draft=validateReview(body.draft),now=Date.now();
  if(typeof body.id==='string'){
    if(!Number.isSafeInteger(body.revision))throw new Error('저장 버전을 확인하세요.');
    const result=await env.DB.prepare('UPDATE entry_reviews SET draft=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?').bind(JSON.stringify(draft),now,body.id,userId,body.revision).run();
    if(!result.meta.changes)throw new Error('다른 화면에서 수정되었거나 접근할 수 없습니다. 목록을 새로 불러오세요.');
    return listEntryReviews(userId);
  }
  if(typeof body.runId!=='string'||!Number.isSafeInteger(body.at))throw new Error('판단 기록을 선택하세요.');
  const run=await env.DB.prepare('SELECT state FROM auto_paper_runs WHERE id=? AND user_id=?').bind(body.runId,userId).first<{state:string}>();
  const decision=run?(JSON.parse(run.state) as AutoState).decisions?.find(d=>d.at===body.at):undefined;
  if(!decision)throw new Error('판단 기록이 없거나 보관 범위를 벗어났습니다. 다시 선택하세요.');
  const id=crypto.randomUUID();let replayKey:string|null=null;
  if(decision.replayKey){const original=await env.FILES.get(decision.replayKey);if(!original)throw new Error('당시 차트가 만료되었습니다. 판단 목록을 새로 확인하세요.');replayKey=`entry-reviews/${userId}/${id}.json`;await env.FILES.put(replayKey,await original.text(),{httpMetadata:{contentType:'application/json'}});}
  const snapshot={...decision};delete snapshot.replayKey;
  // Do not delete a copied chart after an ambiguous database error: the insert may have committed.
  const result=await env.DB.prepare('INSERT INTO entry_reviews(id,user_id,run_id,decision_at,decision,draft,replay_key,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,run_id,decision_at) DO NOTHING').bind(id,userId,body.runId,body.at,JSON.stringify(snapshot),JSON.stringify(draft),replayKey,now).run();
  if(!result.meta.changes){if(replayKey)try{await env.FILES.delete(replayKey);}catch{}throw new Error('이미 저장한 판단입니다. 저장 목록에서 열어 수정하세요.');}
  return listEntryReviews(userId);
}
