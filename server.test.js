import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('CRUD, ownership, validation, and same-origin protection', async () => {
  const dir=mkdtempSync(join(tmpdir(),'lab-test-'));
  const child=spawn(process.execPath,['server.js'],{env:{...process.env,DATA_DIR:dir,PORT:'0'},stdio:['ignore','pipe','pipe']});
  // Port 0 is used only by tests; discover the bound port from the server output below.
  try {
    let line='';for await (const chunk of child.stdout){line+=chunk;if(line.includes('Lab running at'))break}
    const port=Number(/:(\d+)\s*$/.exec(line)?.[1]);assert.ok(port);
    const base=`http://127.0.0.1:${port}`;let cookie;
    const call=async(path,method='GET',data,asOther=false,origin=base)=>{const headers={};if(method!=='GET')headers.Origin=origin;if(data)headers['Content-Type']='application/json';if(cookie&&!asOther)headers.Cookie=cookie;const response=await fetch(base+path,{method,headers,body:data&&JSON.stringify(data)});if(!cookie&&!asOther)cookie=response.headers.get('set-cookie')?.split(';')[0];return {status:response.status,body:await response.json()}};
    assert.equal((await call('/api/notes','POST',{title:'First',body:'Hello'})).status,201);
    assert.equal((await call('/api/notes')).body.length,1);
    assert.equal((await call('/api/notes/1','GET',null,true)).status,404);
    assert.equal((await call('/api/notes/1','PUT',{title:'Changed',body:'World'})).body.title,'Changed');
    assert.equal((await call('/api/notes','POST',{title:'',body:'x'})).status,400);
    assert.equal((await call('/api/notes','POST',{title:'x',body:'x'},false,'https://evil.example')).status,403);
    assert.equal((await call('/api/notes/1','DELETE')).status,200);
    assert.equal((await call('/api/notes')).body.length,0);
    assert.equal((await call('/server.js')).status,404);
  } finally {child.kill();await once(child,'exit');rmSync(dir,{recursive:true,force:true})}
});
