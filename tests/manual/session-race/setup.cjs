const fs=require('node:fs'), crypto=require('node:crypto');
if (!fs.existsSync('.session-race-fixture')) throw new Error('Run only in the isolated fixture copy');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const hmac=x=>crypto.createHmac('sha256','fixture-key-'.repeat(4)).update('hansung:student-id:'+x).digest('hex');
let sql=[];
for(const [index,c] of ['a','b','c'].entries()){
 const id='12345'+(index+1), legacy=hash('hansung:'+id), fresh=hmac(id), token=hash(c.repeat(64));
 sql.push(`INSERT INTO academic_accounts VALUES ('${legacy}','fixture','{"name":"legacy-${c}","rev":0}','{"checkedAt":"old"}',0,1,1);`);
 sql.push(`INSERT INTO academic_sessions VALUES ('${token}','${legacy}',4102444800000);`);
 if(c==='a') sql.push(`INSERT INTO academic_accounts VALUES ('${fresh}','fixture','{"name":"current-a","rev":0}','{"checkedAt":"current"}',0,1,1);`);
}
fs.writeFileSync('fixture.sql',sql.join('\n'));
fs.writeFileSync('dist/server/.dev.vars','ACCOUNT_INDEX_HMAC_KEY='+ 'fixture-key-'.repeat(4)+'\n');
