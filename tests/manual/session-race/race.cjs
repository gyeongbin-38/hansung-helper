const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto'),cp=require('node:child_process');
if (!require('node:fs').existsSync('.session-race-fixture')) throw new Error('Run only in the isolated fixture copy');
const base='http://127.0.0.1:18788';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const hmac=x=>crypto.createHmac('sha256','fixture-key-'.repeat(4)).update('hansung:student-id:'+x).digest('hex');
let notify, held;
const gate=http.createServer((req,res)=>{held=res;notify?.();});
const headers=c=>({origin:base,'content-type':'application/json',cookie:'__Host-hansung_session='+c.repeat(64)});
const query=(sql)=>{const p=cp.spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','site-creator-d1','--local','--config','dist/server/wrangler.json','--command',sql,'--json'],{encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);return JSON.parse(p.stdout)[0].results};
const get=(id)=>query(`SELECT profile, snapshot FROM academic_accounts WHERE id='${id}'`)[0];
(async()=>{
 await new Promise(r=>gate.listen(18889,'127.0.0.1',r));
 for(const [index,c] of ['a','b','c'].entries()){
  const id='12345'+(index+1),legacy=hash('hansung:'+id),fresh=hmac(id);
  const priorOld=get(legacy),priorNew=get(fresh);
  let reached=new Promise(resolve=>notify=resolve);
  let refresh=fetch(base+'/api/account/lms-refresh',{method:'POST',headers:headers(c),body:JSON.stringify({studentId:id,password:'fixture'})});
  await Promise.race([reached,new Promise((_,rej)=>setTimeout(()=>rej(Error('gate not reached')),15000))]);
  if(c!=='c'){
    const closed=await fetch(base+(c==='a'?'/api/account/logout':'/api/account'),{method:c==='a'?'POST':'DELETE',headers:headers(c),body:'{}'});
    assert.equal(closed.status,200);
  }
  held.end('ok'); const response=await refresh;
  assert.equal(response.status,c==='c'?200:401, c+' refresh status');
  const afterOld=get(legacy),afterNew=get(fresh);
  if(c==='a'){assert.deepEqual(afterOld,priorOld);assert.deepEqual(afterNew,priorNew);}
  if(c==='b'){assert.equal(afterOld,undefined);assert.equal(afterNew,undefined);}
  if(c==='c'){assert.equal(afterOld,undefined);assert.ok(afterNew);assert.equal(JSON.parse(afterNew.profile).name,'legacy-c');}
  console.log('PASS '+({a:'logout with legacy and current accounts',b:'withdrawal with legacy account',c:'active session migration control'}[c]));
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>gate.close());
