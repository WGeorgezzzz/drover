import { randomUUID, createHash } from 'node:crypto';

import { withUserContext } from '@/modules/auth/index.js';
import { getConnection, getSessionOwnerId, sessionsDb } from '@/modules/database/index.js';
import { AppError } from '@/shared/index.js';

import { enqueueInbox, registerInboxHandler, alwaysOnEnabled } from './inbox.service.js';

/** Authenticated ingress only validates its envelope; heavy queue/provider checks happen in the worker. */
export function acceptIngress(userId:number,input:Record<string,unknown>) {
  const source=String(input.source||''),sourceId=String(input.sourceId||''),target=String(input.target||'');
  if(!['feishu','receipt'].includes(source)||!sourceId||sourceId.length>128||typeof input.content!=='string'||!input.content.trim()||input.content.length>200000)throw new AppError('事件格式无效',{statusCode:400});
  if(getSessionOwnerId(target)!==userId)throw new AppError('会话不可用',{statusCode:403});
  if(!alwaysOnEnabled())throw new AppError('统一收件箱已关闭，请使用旧消息入口',{statusCode:409});
  return enqueueInbox({userId,source,sourceId,target,payload:{content:input.content}});
}

/** Feishu creates a stable, per-user conversation without launching a model during the handshake. */
export function bridgeConversation(userId:number,reset=false) {
  const db=getConnection();
  db.exec('CREATE TABLE IF NOT EXISTS agent_bridge_sessions(user_id INTEGER PRIMARY KEY,session_id TEXT NOT NULL)');
  return db.transaction(()=>{
    const existing=db.prepare('SELECT session_id FROM agent_bridge_sessions WHERE user_id=?').get(userId) as {session_id:string}|undefined;
    if(!reset&&existing&&getSessionOwnerId(existing.session_id)===userId)return {sessionId:existing.session_id};
    const sessionId=randomUUID();
    withUserContext(userId,()=>sessionsDb.createAppSession(sessionId,'claude','D:/embodied','飞书常驻会话'));
    db.prepare('INSERT OR REPLACE INTO agent_bridge_sessions(user_id,session_id) VALUES(?,?)').run(userId,sessionId);
    return {sessionId};
  })();
}

/** Composition hands accepted external triggers to the same durable/coalescing queue adapter. */
export function initializeIngress():void {
  for(const source of ['feishu','receipt'])registerInboxHandler(source,async events=>{
    const { messageQueueService }=await import('@/modules/message-queue/index.js');
    for(const event of events)messageQueueService.enqueue(event.user_id,{sessionId:event.target,requestId:source+':'+createHash('sha256').update(event.source_id).digest('hex'),content:JSON.parse(event.payload).content});
  });
}
