import {readFile,readdir} from 'node:fs/promises';
export async function readCandidateHistory(dir,market,limit=28){
 let names;try{names=await readdir(dir);}catch(e){if(e.code==='ENOENT')return {reports:[],unavailable:0};throw e;}
 const files=names.filter(n=>new RegExp(`^report-${market}-\\d{4}-\\d{2}-\\d{2}\\.json$`).test(n)).sort().reverse().slice(0,limit);
 const reports=[];let unavailable=0;
 for(const file of files){try{const r=JSON.parse(await readFile(`${dir}/${file}`,'utf8'));if(r.market!==market||!Array.isArray(r.candidates))throw new Error('Invalid report');reports.push({date:r.date,status:r.status,generatedAt:r.generatedAt,candidates:r.candidates.map(c=>({symbol:c.symbol,name:c.name})),count:r.candidates.length});}catch{unavailable++;}}
 return {reports,unavailable};
}
