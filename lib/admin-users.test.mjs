import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
test('admin mutations enforce permissions, revoke sessions and cascade only target records',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0000_private_members.sql','0001_mighty_marvex.sql','0002_keen_blindfold.sql','0003_same_doctor_doom.sql','0004_bouncy_chameleon.sql'])db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const insert=db.prepare("INSERT INTO users(id,username,display_name,password_hash,password_salt,password_iterations,role,status,created_at,updated_at) VALUES(?,?,?,'old','salt',100000,?,'active',1,1)");insert.run('a','admin','Admin','admin');insert.run('m','member','Member','member');
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('token','m',1,9999999999999);
 db.prepare("INSERT INTO watchlist_items(id,user_id,market,ticker,position,created_at,updated_at) VALUES('w','m','US','TEST',0,1,1)").run();
 const DB={prepare(sql){let args=[];return {bind(...a){args=a;return this},async first(){return db.prepare(sql).get(...args)||null},async run(){return {meta:db.prepare(sql).run(...args)}},async all(){return {results:db.prepare(sql).all(...args)}}}},async batch(stmts){db.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}};
 let me={id:'a',role:'admin'};globalThis.__adminTest={env:{DB},getUser:async()=>me,json:(v,status=200)=>Response.json(v,{status}),validPassword:p=>p.length>=12&&/[A-Za-z]/.test(p)&&/\d/.test(p),validUsername:()=>true,createUser:()=>{}};
 const source=readFileSync(new URL('../app/api/admin/users/route.ts',import.meta.url),'utf8').replace(/import .*?;\r?\n/g,'');
 const route=await import('data:text/javascript;base64,'+Buffer.from('const {env,getUser,json,validPassword,validUsername,createUser}=globalThis.__adminTest;\n'+stripTypeScriptTypes(source)).toString('base64'));
 const req=(method,b)=>new Request('https://test/api/admin/users',{method,body:JSON.stringify(b),headers:{'Content-Type':'application/json'}});
 me={id:'m',role:'member'};assert.equal((await route.DELETE(req('DELETE',{id:'a',confirmUsername:'admin'}))).status,403);assert.equal((await route.PATCH(req('PATCH',{id:'a',action:'password',password:'Password12345'}))).status,403);
 me={id:'a',role:'admin'};assert.equal((await route.DELETE(req('DELETE',{id:'a',confirmUsername:'admin'}))).status,400);
 assert.equal((await route.PATCH(req('PATCH',{id:'missing',action:'password',password:'Password12345'}))).status,404);
 assert.equal((await route.PATCH(req('PATCH',{id:'m',action:'password',password:'short'}))).status,400);
 assert.equal((await route.PATCH(req('PATCH',{id:'m',action:'password',password:'Password12345'}))).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);assert.notEqual(db.prepare("SELECT password_hash FROM users WHERE id='m'").get().password_hash,'old');
 assert.equal((await route.DELETE(req('DELETE',{id:'m',confirmUsername:'wrong'}))).status,400);
 assert.equal((await route.DELETE(req('DELETE',{id:'m',confirmUsername:'member'}))).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM watchlist_items').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,1);
 delete globalThis.__adminTest;db.close();
});

