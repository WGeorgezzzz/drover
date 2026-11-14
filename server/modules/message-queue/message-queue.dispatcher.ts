import { randomUUID, createHash } from 'node:crypto';

import { alwaysOnEnabled, enqueueInbox, registerInboxHandler, InboxTargetBusy } from '@/modules/always-on/index.js';
import { withUserContext } from '@/modules/auth/index.js';
import { getConnection, getSessionOwnerId, messageQueueDb, sessionDraftsDb, sessionsDb } from '@/modules/database/index.js';
import { sessionsService } from '@/modules/providers/index.js';
import { chatRunRegistry, runDetachedChatTurn } from '@/modules/websocket/index.js';
import type { ProviderRuntimeGateway } from '@/modules/websocket/index.js';
import { messageQueueService, notifyMessageQueueChanged, registerMessageQueueWakeup } from '@/modules/message-queue/message-queue.service.js';
import type { QueuedTurnRecord } from '@/shared/types.js';

let timer: ReturnType<typeof setTimeout>|null=null;
let activeRuntime: ProviderRuntimeGateway | null = null;
const invalidLegacy = new Set<string>();

/** Dispatcher and migration tests atomically import the old single-slot queue without losing its draft. */
export function importLegacyQueuedMessages(): void {
  for (const candidate of sessionDraftsDb.listQueuedMessages()) {
    try {
      const input=candidate.queuedMessage as {content?:unknown;options?:Record<string,unknown>;attachments?:unknown;images?:unknown}|null;
      if (!input || typeof input.content!=='string') throw new Error('Invalid legacy queue entry; original draft retained.');
      const key='legacy:'+createHash('sha256').update(`${candidate.userId}:${candidate.sessionId}:${candidate.claimToken}`).digest('hex');
      messageQueueDb.importLegacy(candidate,()=>messageQueueService.enqueue(candidate.userId,{
        sessionId:candidate.sessionId,requestId:key,content:input.content,
        options:{...input.options,attachments:input.attachments??input.images??[]},
      }));
    } catch (error) {
      const key=`${candidate.userId}:${candidate.sessionId}`;
      if (!invalidLegacy.has(key)) {
        invalidLegacy.add(key);
        console.warn('[MessageQueue] Legacy draft retained:',error instanceof Error?error.message:String(error));
      }
    }
  }
}

async function executeClaim(row: QueuedTurnRecord, runtime: ProviderRuntimeGateway): Promise<void> {
  let terminal=false, providerError: string|null=null;
  try {
    if (getSessionOwnerId(row.session_id)!==row.user_id) throw new Error('Conversation owner no longer matches queued message.');
    const session=withUserContext(row.user_id,()=>sessionsDb.getSessionById(row.session_id));
    if (!session || session.isArchived) throw new Error('Conversation was removed or archived before dispatch.');
    const observed: ProviderRuntimeGateway=Object.create(runtime);
    observed.run=async(provider,command,options,writer)=>runtime.run(provider,command,{...options,cloudcliQueueAttempt:row},{
      ...writer,
      userId:writer.userId, isWebSocketWriter:writer.isWebSocketWriter,
      setSessionId:writer.setSessionId?.bind(writer),
      send(data) {
        if (data && typeof data==='object' && !terminal) {
          const event=data as Record<string,unknown>;
          if (event.kind==='error') providerError=String(event.content||'Provider failed.').slice(0,1000);
          if (event.kind==='complete') {
            terminal=true;
            const failed=providerError || (event.success===false || (typeof event.exitCode==='number' && event.exitCode!==0) ? 'Provider reported a failed turn.' : null);
            messageQueueDb.finish(row,event.aborted?'interrupted':failed?'failed':'succeeded',
              event.aborted?'Turn was interrupted. Review before retrying.':failed);
          }
        }
        writer.send(data);
      },
    });
    const outcome=await withUserContext(row.user_id,()=>runDetachedChatTurn({
      sessionId:row.session_id,userId:row.user_id,content:row.content,
      options:JSON.parse(row.options),interruptActiveRun:false,
    },{runtime:observed}));
    if (!outcome.started && /run (?:was |is )already in progress/i.test(outcome.error||'')) {
      messageQueueDb.defer(row);
    } else if (!terminal) {
      messageQueueDb.finish(row,'failed',providerError||outcome.error||'Provider ended without a completion confirmation.');
    }
  } catch (error) {
    messageQueueDb.finish(row,'failed',(error instanceof Error?error.message:String(error)).slice(0,1000));
  } finally {
    notifyMessageQueueChanged();
    wakeMessageQueue();
  }
}

/** Startup polls this bounded pass; tests await it to verify exact outcomes and FIFO ordering. */
export async function dispatchMessageQueue(runtime: ProviderRuntimeGateway): Promise<number> {
  importLegacyQueuedMessages();
  if(alwaysOnEnabled()) {
    const rows=getConnection().prepare("SELECT * FROM message_queue WHERE status='queued' AND delivery_mode='queued' LIMIT 1000").all() as QueuedTurnRecord[];
    for(const row of rows)enqueueInbox({userId:row.user_id,source:'queue',sourceId:row.id+':'+row.revision,target:row.session_id,payload:{queueId:row.id}});
    return rows.length;
  }
  const candidates=messageQueueDb.heads();
  if (!candidates.length) return 0;
  // Respect a CLI session owned by another server or terminal, too.
  const externalBusy=new Set((await sessionsService.listRunningSessions(true)).map(session=>session.sessionId));
  const jobs: Promise<void>[]=[];
  for (const candidate of candidates) {
    const background = runtime.hasBackgroundWork(candidate.session_id);
    // A completed local turn retains its SDK while background tasks run. New
    // ordinary turns continue through that owner, even if CLI discovery also
    // sees the held process. Foreground turns and unrelated CLI owners stay busy.
    const retainedBackground = background && chatRunRegistry.getRun(candidate.session_id)?.status === 'completed';
    if (chatRunRegistry.isProcessing(candidate.session_id)
      || (!retainedBackground && (externalBusy.has(candidate.session_id) || background))) continue;
    const row=messageQueueDb.claim(candidate.id);
    if (row) jobs.push(executeClaim(row,runtime));
  }
  await Promise.all(jobs);
  return jobs.length;
}

function scheduleDispatch(delayMs: number): void {
  if (!activeRuntime) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const runtime = activeRuntime;
    if (!runtime) return;
    // Provider turns may run for hours. Keep independent sessions progressing;
    // durable claims remain the concurrency guard used by overlapping passes.
    scheduleDispatch(messageQueueDb.heads().length > 0 ? 1000 : 30_000);
    void dispatchMessageQueue(runtime)
      .catch((error) => {
        console.error('[MessageQueue]', error);
      });
  }, delayMs);
  timer.unref?.();
}

/** Queue enqueue/settlement and session-workspace resume wake an idle dispatcher immediately. */
export function wakeMessageQueue(): void {
  if (activeRuntime) scheduleDispatch(0);
}

/** Server startup recovers uncertain attempts without replay and dispatches independently of browser tabs. */
export function initializeMessageQueue(runtime: ProviderRuntimeGateway, protectedSessions: string[] = []): void {
  if (activeRuntime) return;
  activeRuntime = runtime;
  registerInboxHandler('queue',async events=>{
    const db=getConnection(), first=events[0];
    if(chatRunRegistry.isProcessing(first.target) || runtime.hasBackgroundWork(first.target)) throw new InboxTargetBusy('目标会话仍有模型任务，等待原执行者释放');
    if((await sessionsService.listRunningSessions(true)).some(session=>session.sessionId===first.target))throw new InboxTargetBusy('目标会话仍由外部 CLI 持有');
    if(db.prepare('SELECT 1 FROM session_workspace WHERE user_id=? AND session_id=? AND queue_paused=1').get(first.user_id,first.target))throw new InboxTargetBusy('用户已暂停此会话队列');
    const queueIds=[...new Set(events.map(event=>JSON.parse(event.payload).queueId as string))];
    const settleMembers=(leader:QueuedTurnRecord)=>db.transaction(()=>{
      if(!['succeeded','failed','interrupted'].includes(leader.status))return;
      const members=db.prepare('SELECT member_id FROM agent_queue_batches WHERE leader_id=? AND leader_run_id=?').all(leader.id,leader.run_id) as {member_id:string}[];
      for(const {member_id}of members){
        const member=messageQueueDb.get(first.user_id,member_id);
        if(!member||member.status!=='queued')continue;
        const runId=randomUUID(),at=leader.finished_at||new Date().toISOString();
        db.prepare('UPDATE message_queue SET status=?,run_id=?,attempt_count=attempt_count+1,started_at=?,finished_at=?,error=?,revision=revision+1 WHERE id=? AND status=\'queued\'')
          .run(leader.status,runId,leader.started_at,at,leader.error,member_id);
        db.prepare('INSERT INTO message_queue_attempts(id,message_id,attempt,status,started_at,finished_at,error) VALUES(?,?,?,?,?,?,?)')
          .run(runId,member_id,member.attempt_count+1,leader.status,leader.started_at||at,at,leader.error);
      }
    })();
    const rows=queueIds.flatMap(id=>{
      const row=messageQueueDb.get(first.user_id,id);
      if(!row || row.status==='succeeded' || row.status==='cancelled')return [];
      const batch=db.prepare('SELECT leader_id FROM agent_queue_batches WHERE member_id=?').get(id) as {leader_id:string}|undefined;
      if(batch){const leader=messageQueueDb.get(first.user_id,batch.leader_id);if(leader){settleMembers(leader);if(messageQueueDb.get(first.user_id,id)?.status==='succeeded')return [];}throw new Error('合并执行的原回执待核对，请显式重试');}
      if(row.status==='running')throw new InboxTargetBusy('原 provider 回执尚未确认，不重放');
      if(row.status!=='queued')throw new Error('先前模型执行结果不确定，请显式重试原消息');
      return [row];
    }).sort((a,b)=>a.position-b.position||a.sequence-b.sequence);
    // Merge only equivalent provider options; preserve models, attachments and provenance.
    for(let i=0;i<rows.length;) {
      const group=[rows[i++]];
      while(i<rows.length && rows[i].options===group[0].options)group.push(rows[i++]);
      const claimed=db.transaction(()=>{
        const runId=randomUUID(),at=new Date().toISOString();
        db.prepare("UPDATE message_queue SET status='running',run_id=?,attempt_count=attempt_count+1,started_at=?,revision=revision+1 WHERE id=? AND status='queued'").run(runId,at,group[0].id);
        db.prepare("INSERT INTO message_queue_attempts(id,message_id,attempt,status,started_at) VALUES(?,?,?,'running',?)").run(runId,group[0].id,group[0].attempt_count+1,at);
        for(const member of group.slice(1))db.prepare('INSERT INTO agent_queue_batches(member_id,leader_id,leader_run_id) VALUES(?,?,?)').run(member.id,group[0].id,runId);
        return messageQueueDb.get(first.user_id,group[0].id)!;
      })();
      const leader={...claimed,content:group.length===1?group[0].content:'以下是同一目标合并到达的事件列表，请逐项处理：\n'+JSON.stringify(group.map(row=>({id:row.id,content:row.content})))};
      await executeClaim(leader,runtime);
      const final=messageQueueDb.get(first.user_id,leader.id)!;
      settleMembers(final);
      if(final.status==='queued'){
        db.prepare('DELETE FROM agent_queue_batches WHERE leader_id=? AND leader_run_id=?').run(leader.id,leader.run_id);
        throw new InboxTargetBusy('尚未启动模型，等待会话释放');
      }
      if(final.status!=='succeeded')throw new Error(final.error||'模型未确认完成');
    }
  });
  registerMessageQueueWakeup(wakeMessageQueue);
  messageQueueDb.recover(protectedSessions);
  scheduleDispatch(0);
}

/** Server shutdown stops new claims; running work remains under its existing runtime owner. */
export function closeMessageQueue(): void {
  if (timer) clearTimeout(timer);
  timer=null;
  activeRuntime = null;
  registerMessageQueueWakeup(null);
}
