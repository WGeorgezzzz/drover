import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CodexPermissionBridge } from '@/modules/providers/list/codex/codex-permissions.provider.js';
import { closeConnection, getConnection, initializeDatabase, sessionsDb, userDb } from '@/modules/database/index.js';
import { listDecisions } from '@/modules/always-on/index.js';
import { providerRuntimeService } from '@/modules/providers/index.js';
import { chatRunRegistry } from '@/modules/websocket/index.js';

test('P0: capturing a live Ask must keep its native run waiting', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ask-p0-'));
  process.env.DATABASE_PATH = path.join(root, 'test.db'); process.env.DROVER_ALWAYS_ON = '1';
  await initializeDatabase();
  const sessionId='ask-p0-'+Date.now();
  const user = Number(userDb.createUser(sessionId, 'hash').id);
  sessionsDb.createAppSession(sessionId, 'claude', root, 'Ask');
  const run = chatRunRegistry.startRun({appSessionId:sessionId,provider:'claude',providerSessionId:null,connection:null,userId:user})!;
  let aborted = 0;
  const original = providerRuntimeService.abort;
  providerRuntimeService.abort = async () => { aborted++; return true; };
  try {
    run.writer.send({kind:'permission_request',requestId:'ask-1',toolName:'AskUserQuestion',input:{questions:[{question:'Color?'}]},permissionMode:'bypassPermissions'});
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(aborted, 0);
    assert.equal(run.status, 'running');
    assert.equal(listDecisions(user).length, 0);
    for (const provider of ['claude','codex'] as const) {
      for (const toolName of ['AskUserQuestion','ExitPlanMode','Bash','CodexCommand']) {
        run.writer.send({kind:'permission_request',requestId:provider+toolName,toolName,provider,input:{}});
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(aborted, 0);
    assert.equal(run.status, 'running');
    assert.equal(listDecisions(user).length, 0);
    assert.equal((getConnection().prepare("SELECT COUNT(*) n FROM agent_inbox").get() as {n:number}).n, 0);
    const bridge = new CodexPermissionBridge();
    const events: any[] = [], replies: any[] = [];
    getConnection().prepare('INSERT INTO agent_decision_grants(decision_id,user_id,target,tool,input,allowed) VALUES(?,?,?,?,?,?)').run('legacy',user,sessionId,'CodexCommand','{}',1);
    bridge.request(sessionId,{id:1,method:'item/commandExecution/requestApproval',params:{}},{userId:user,send:e=>events.push(e)},r=>replies.push(r),'legacy');
    assert.equal(replies.length,0,'old deferred grants must not bypass native approval');
    bridge.resolve(events[0].requestId,{allow:true});
    assert.equal(replies[0].decision,'accept');
    bridge.request(sessionId,{id:2,method:'item/commandExecution/requestApproval',params:{}},{send:e=>events.push(e)},r=>replies.push(r));
    bridge.resolve(events.at(-1).requestId,{allow:false});
    assert.equal(replies[1].decision,'decline');
    bridge.request(sessionId,{id:3,method:'item/tool/requestUserInput',params:{questions:[{id:'color',question:'Color?'}]}},{send:e=>events.push(e)},r=>replies.push(r));
    bridge.resolve(events.at(-1).requestId,{allow:true,updatedInput:{answers:{'Color?':'Blue'}}});
    assert.deepEqual(replies[2],{answers:{color:{answers:['Blue']}}});
  } finally { providerRuntimeService.abort = original; chatRunRegistry.clearAll(); closeConnection(); }
});
