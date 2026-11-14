import { randomUUID } from 'node:crypto';

import { getConnection, getSessionOwnerId, sessionsDb } from '@/modules/database/index.js';

import { AppError } from '@/shared/index.js';
import type { AnyRecord } from '@/shared/types.js';
import { alwaysOnEnabled, enqueueInbox, registerInboxHandler } from './inbox.service.js';

/** Websocket and monitor adapters persist a deferred decision before releasing a provider. */
export function deferDecision(userId:number,target:string,requestId:string,question:string,options:unknown,context:unknown):AnyRecord {
  if(getSessionOwnerId(target)!==userId)throw new AppError('会话不可用',{statusCode:403});
  const db=getConnection(),id=randomUUID().replaceAll('-','').slice(0,12);
  const physical=/真机|物理动作|robot|actuator|电机|机械臂/i.test(question+JSON.stringify(context));
  db.prepare(`INSERT OR IGNORE INTO agent_decisions(id,user_id,target,request_id,question,options,context,physical,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(id,userId,target,requestId,question,JSON.stringify(options),JSON.stringify(context),physical?1:0,Date.now());
  return db.prepare('SELECT * FROM agent_decisions WHERE user_id=? AND target=? AND request_id=?').get(userId,target,requestId) as AnyRecord;
}

/** Authenticated application and Feishu adapters share the same atomic first-answer-wins transition. */
export function answerDecision(userId:number,id:string,answer:unknown,via:string):AnyRecord {
  if(answer===undefined || answer===null || (typeof answer==='string' && !answer.trim()) || JSON.stringify(answer).length>20000)throw new AppError('请提供答复',{statusCode:400});
  const db=getConnection();
  return db.transaction(()=>{
    const row=db.prepare('SELECT * FROM agent_decisions WHERE user_id=? AND id=?').get(userId,id) as AnyRecord|undefined;
    if(!row)throw new AppError('待决事项不存在',{statusCode:404});
    if(row.status!=='pending')return {id,status:'answered',alreadyHandled:true};
    db.prepare("UPDATE agent_decisions SET status='answered',answer=?,answered_via=?,answered_at=? WHERE id=? AND status='pending'")
      .run(JSON.stringify(answer),via,Date.now(),id);
    const context=JSON.parse(row.context);
    const explicit=answer && typeof answer==='object' && 'allow' in answer?(answer as AnyRecord).allow:answer;
    const allow=explicit===true || (typeof explicit==='string' && /^(允许|批准|同意|allow|approve)$/i.test(explicit.trim()));
    const deny=explicit===false || (typeof explicit==='string' && /^(拒绝|不允许|deny|reject)$/i.test(explicit.trim()));
    const resumeTarget=context.monitorId && typeof context.sessionId==='string' && getSessionOwnerId(context.sessionId)===userId?context.sessionId:row.target;
    if((allow||deny) && context.toolName && context.toolName!=='AskUserQuestion')db.prepare('INSERT OR IGNORE INTO agent_decision_grants(decision_id,user_id,target,tool,input,allowed) VALUES(?,?,?,?,?,?)').run(id,userId,resumeTarget,context.toolName,permissionInput(context.input),allow?1:0);
    enqueueInbox({userId,source:'decision',sourceId:id,target:resumeTarget,payload:{id,answer,question:row.question,context:JSON.parse(row.context)}});
    return {id,status:'answered',alreadyHandled:false};
  })();
}

/** UI and bridge poll persistent decisions; waiting never supplies a default or timeout answer. */
export function listDecisions(userId:number):AnyRecord[] {
  return getConnection().prepare("SELECT * FROM agent_decisions WHERE user_id=? ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 500").all(userId) as AnyRecord[];
}

/** Registry captures the original tool payload, then cancels its run without granting tool permission. */
export function captureDeferredPermission(userId:number,target:string,event:AnyRecord):void {
  if(!alwaysOnEnabled())return;
  const input=event.input||{},questions=input.questions;
  const queue=getConnection().prepare("SELECT run_id FROM message_queue WHERE user_id=? AND session_id=? AND status='running' AND delivery_mode='queued'").get(userId,target) as {run_id:string}|undefined;
  if(queue)event.queueRunId=queue.run_id;
  const question=Array.isArray(questions)?questions.map((item:AnyRecord)=>item.question).join('\n'):String(input.question||event.toolName||'请求权限');
  const row=deferDecision(userId,target,String(event.requestId),question,questions||[{label:'允许'},{label:'拒绝'}],event);
  event.decisionId=row.id;
  // Defer abort until permission_request has been persisted and forwarded to the UI.
  setImmediate(()=>{void (async()=>{
    const { providerRuntimeService }=await import('@/modules/providers/index.js');
    const { chatRunRegistry }=await import('@/modules/websocket/index.js');
    const run=chatRunRegistry.getRun(target);
    if(!run || !run.events.some(item=>item.requestId===event.requestId))return;
    const provider=sessionsDb.getSessionById(target)?.provider;
    if(provider && run.status==='running'){
      await providerRuntimeService.abort(provider as 'claude'|'codex',target);
      chatRunRegistry.completeRunIfCurrent(run,{exitCode:0,aborted:true});
    }
  })().catch(error=>console.error('[Deferred decision]',row.id,error));});
}

/** Composition resumes the same provider transcript with explicit user input, through the durable queue. */
export function initializeDecisions():void {
  registerInboxHandler('decision',async events=>{
    const { messageQueueService }=await import('@/modules/message-queue/index.js');
    const { connectedClients,clientUserIds }=await import('@/modules/websocket/index.js');
    for(const event of events){
      const payload=JSON.parse(event.payload);
      messageQueueService.enqueue(event.user_id,{sessionId:event.target,requestId:'decision:'+payload.id,
        content:'用户已回答此前暂存的待决事项。仅将本答复用于此事项，继续原会话；不要扩大授权范围。\n'+JSON.stringify(payload),options:{permissionMode:'default'}},'queued',undefined,undefined,payload.id);
      const notice=JSON.stringify({kind:'permission_resolved',sessionId:event.target,requestId:payload.context.requestId,decisionId:payload.id,timestamp:new Date().toISOString()});
      for(const client of connectedClients)if(client.readyState===1&&clientUserIds.get(client)===event.user_id)client.send(notice);
    }
  });
  const reminder=setInterval(()=>{
    const db=getConnection(),cutoff=Date.now()-86400000;
    const rows=db.prepare("SELECT * FROM agent_decisions WHERE status='pending' AND reminded_at IS NULL AND created_at<?").all(cutoff) as AnyRecord[];
    for(const row of rows){
      db.prepare("UPDATE agent_decisions SET reminded_at=? WHERE id=? AND reminded_at IS NULL").run(Date.now(),row.id);
      void import('@/modules/websocket/index.js').then(({connectedClients,clientUserIds})=>{
        const notice=JSON.stringify({type:'session_notice',sessionId:row.target,event:{kind:'permission_request',requestId:row.request_id,sessionId:row.target,decisionId:row.id,reminder:true,toolName:'待决事项提醒',input:{question:row.question},timestamp:new Date().toISOString()}});
        for(const client of connectedClients)if(client.readyState===1&&clientUserIds.get(client)===row.user_id)client.send(notice);
      });
    }
  },60000);reminder.unref();
}

/** Match only an explicitly answered, single-use grant carried by an internal resume turn. */
function permissionInput(input:unknown):string {
  const normalize=(value:unknown):unknown=>Array.isArray(value)?value.map(normalize):value && typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['description','itemId','turnId','threadId','callId'].includes(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,normalize(item)])):value;
  return JSON.stringify(normalize(input??{}));
}
export function consumeDeferredPermission(userId:number,target:string,tool:string,input:unknown,decisionId?:string):boolean|undefined {
  if(!alwaysOnEnabled() || !decisionId)return undefined;
  const db=getConnection();
  return db.transaction(()=>{
    const row=db.prepare('SELECT * FROM agent_decision_grants WHERE decision_id=? AND user_id=? AND target=? AND tool=? AND input=? AND consumed_at IS NULL').get(decisionId,userId,target,tool,permissionInput(input)) as AnyRecord|undefined;
    if(!row)return undefined;
    db.prepare('UPDATE agent_decision_grants SET consumed_at=? WHERE decision_id=? AND consumed_at IS NULL').run(Date.now(),decisionId);
    return row.allowed===1;
  })();
}
