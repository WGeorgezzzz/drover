import { randomUUID, createHash } from 'node:crypto';

import { getConnection } from '@/modules/database/index.js';
import { withUserContext } from '@/modules/auth/index.js';
import type { InboxEvent } from '@/shared/types.js';

const handlers = new Map<string, (events: InboxEvent[]) => Promise<void>>();
const owner = randomUUID();
let timer: ReturnType<typeof setInterval> | undefined;
const running = new Set<string>();
const maxAttempts = 5;
const leaseMs = () => Math.max(3000, Number(process.env.DROVER_INBOX_LEASE_MS) || 30000);
const windowMs = () => Math.max(0, Number(process.env.DROVER_INBOX_BATCH_MS ?? 3000));

/** Dispatchers use this runtime switch; disabling retains durable events for later recovery. */
export const alwaysOnEnabled = () => process.env.DROVER_ALWAYS_ON !== '0';

/** Execution adapters defer occupied targets without spending an execution retry. */
export class InboxTargetBusy extends Error {}

/** Startup installs additive tables after its SQLite pre-migration backup. */
export function initializeInboxSchema(): void {
  getConnection().exec(`
    CREATE TABLE IF NOT EXISTS agent_inbox (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, source TEXT NOT NULL, source_id TEXT NOT NULL,
      target TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed','dead')),
      attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL,
      lease_owner TEXT, lease_until INTEGER, error TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(user_id,source,source_id)
    );
    CREATE INDEX IF NOT EXISTS agent_inbox_due ON agent_inbox(status,available_at);
    CREATE INDEX IF NOT EXISTS agent_inbox_target ON agent_inbox(user_id,target,status);
    CREATE TABLE IF NOT EXISTS agent_queue_batches (
      member_id TEXT PRIMARY KEY, leader_id TEXT NOT NULL, leader_run_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_monitor_events (
      event_id TEXT PRIMARY KEY, run_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_target_leases (
      user_id INTEGER NOT NULL, target TEXT NOT NULL, owner TEXT NOT NULL, lease_until INTEGER NOT NULL,
      PRIMARY KEY(user_id,target)
    );
    CREATE TABLE IF NOT EXISTS agent_decision_grants (
      decision_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, target TEXT NOT NULL, tool TEXT NOT NULL,
      input TEXT NOT NULL, allowed INTEGER NOT NULL, consumed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS agent_decisions (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, target TEXT NOT NULL, request_id TEXT NOT NULL,
      question TEXT NOT NULL, options TEXT NOT NULL, context TEXT NOT NULL, physical INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', answer TEXT, answered_via TEXT,
      created_at INTEGER NOT NULL, answered_at INTEGER, reminded_at INTEGER,
      UNIQUE(user_id,target,request_id)
    );
  `);
}

/** Queue, timers and authenticated ingress append before acknowledging the source. */
export function enqueueInbox(input: { userId: number; source: string; sourceId: string; target: string; payload: unknown }): InboxEvent {
  const db = getConnection(), now = Date.now(), payload = JSON.stringify(input.payload);
  const hash = createHash('sha256').update(JSON.stringify([input.target, payload])).digest('hex');
  return db.transaction(() => {
    const existing = db.prepare('SELECT * FROM agent_inbox WHERE user_id=? AND source=? AND source_id=?')
      .get(input.userId, input.source, input.sourceId) as InboxEvent | undefined;
    if (existing) {
      if (existing.payload_hash !== hash) throw new Error('Event identity already used for different input');
      return existing;
    }
    const id = randomUUID();
    db.prepare(`INSERT INTO agent_inbox(id,user_id,source,source_id,target,payload,payload_hash,available_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id,input.userId,input.source,input.sourceId,input.target,payload,hash,now+windowMs(),now,now);
    return db.prepare('SELECT * FROM agent_inbox WHERE id=?').get(id) as InboxEvent;
  })();
}

/** Composition and feature dispatchers register their execution adapter, without starting a run in ingress. */
export function registerInboxHandler(source: string, handler: (events: InboxEvent[]) => Promise<void>): void {
  handlers.set(source, handler);
}

/** API reads expose failed/dead events alongside pending/processing; ownership is always explicit. */
export function listInbox(userId: number, target?: string): InboxEvent[] {
  return getConnection().prepare(`SELECT * FROM agent_inbox WHERE user_id=? ${target ? 'AND target=?' : ''}
    ORDER BY CASE WHEN status='done' THEN 1 ELSE 0 END,created_at DESC LIMIT 2000`).all(...(target ? [userId,target] : [userId])) as InboxEvent[];
}

/** Startup and periodic passes recover only expired leases; completion updates are fenced by lease owner. */
export function recoverInbox(now = Date.now()): void {
  const db=getConnection();
  db.transaction(() => {
    db.prepare(`UPDATE agent_inbox SET status=CASE WHEN attempts>=? THEN 'dead' ELSE 'pending' END,
      lease_owner=NULL,lease_until=NULL,available_at=?,updated_at=?,error='租约过期，执行结果待核对后恢复'
      WHERE status='processing' AND lease_until<=?`).run(maxAttempts,now,now,now);
    db.prepare('DELETE FROM agent_target_leases WHERE lease_until<=?').run(now);
  })();
}

async function processTarget(userId:number,target:string):Promise<void> {
  const db=getConnection(), now=Date.now(), token=owner+':'+randomUUID();
  const events=db.transaction(() => {
    const acquired=db.prepare(`INSERT INTO agent_target_leases(user_id,target,owner,lease_until) VALUES(?,?,?,?)
      ON CONFLICT(user_id,target) DO UPDATE SET owner=excluded.owner,lease_until=excluded.lease_until
      WHERE agent_target_leases.lease_until<=?`).run(userId,target,token,now+leaseMs(),now);
    if (!acquired.changes) return [];
    const rows=db.prepare(`SELECT * FROM agent_inbox WHERE user_id=? AND target=? AND status IN ('pending','failed')
      AND (available_at<=? OR (status='pending' AND created_at<=?)) ORDER BY created_at,id LIMIT 100`).all(userId,target,now,now) as InboxEvent[];
    const selected=rows.filter(row=>handlers.has(row.source));
    for(const row of selected) db.prepare(`UPDATE agent_inbox SET status='processing',attempts=attempts+1,
      lease_owner=?,lease_until=?,updated_at=? WHERE id=?`).run(token,now+leaseMs(),now,row.id);
    return selected;
  })();
  if(!events.length){db.prepare('DELETE FROM agent_target_leases WHERE user_id=? AND target=? AND owner=?').run(userId,target,token);return;}
  const heartbeat=setInterval(()=>{
    const at=Date.now();
    db.transaction(()=>{
      const changed=db.prepare('UPDATE agent_target_leases SET lease_until=? WHERE user_id=? AND target=? AND owner=? AND lease_until>?')
        .run(at+leaseMs(),userId,target,token,at);
      if(changed.changes)db.prepare("UPDATE agent_inbox SET lease_until=?,updated_at=? WHERE lease_owner=? AND status='processing'").run(at+leaseMs(),at,token);
    })();
  },Math.floor(leaseMs()/3));
  heartbeat.unref();
  try {
    const sources=[...new Set(events.map(row=>row.source))];
    for(const source of sources){
      const batch=events.filter(row=>row.source===source);
      try {
        await withUserContext(userId,()=>handlers.get(source)!(batch));
        db.prepare("UPDATE agent_inbox SET status='done',lease_owner=NULL,lease_until=NULL,error=NULL,updated_at=? WHERE lease_owner=? AND source=? AND status='processing'").run(Date.now(),token,source);
      } catch(error) {
        if(error instanceof InboxTargetBusy) {
          db.prepare(`UPDATE agent_inbox SET status='pending',attempts=MAX(0,attempts-1),available_at=?,
            lease_owner=NULL,lease_until=NULL,error=?,updated_at=? WHERE lease_owner=? AND source=? AND status='processing'`)
            .run(Date.now()+3000,error.message,Date.now(),token,source);
          continue;
        }
        for(const event of batch)db.prepare(`UPDATE agent_inbox SET status=CASE WHEN attempts>=? THEN 'dead' ELSE 'failed' END,
          available_at=?,lease_owner=NULL,lease_until=NULL,error=?,updated_at=? WHERE id=? AND lease_owner=? AND status='processing'`)
          .run(maxAttempts,Date.now()+Math.min(300000,1000*2**(event.attempts+1)),String(error).slice(0,2000),Date.now(),event.id,token);
      }
    }
  } finally {clearInterval(heartbeat);db.prepare('DELETE FROM agent_target_leases WHERE user_id=? AND target=? AND owner=?').run(userId,target,token);}
}

/** Server lifecycle and integration tests drive the same worker pass, one lease per user/target. */
export async function dispatchInbox():Promise<void> {
  if(!alwaysOnEnabled())return;
  recoverInbox();
  const targets=getConnection().prepare(`SELECT DISTINCT user_id,target FROM agent_inbox
    WHERE status IN ('pending','failed') AND available_at<=? LIMIT 32`).all(Date.now()) as {user_id:number;target:string}[];
  await Promise.all(targets.map(async row=>{
    const key=row.user_id+':'+row.target;if(running.has(key))return;
    running.add(key);try{await processTarget(row.user_id,row.target);}finally{running.delete(key);}
  }));
}

/** Composition starts the persistent worker independently of browser connections. */
export function initializeInbox():void {
  if(timer)return;
  timer=setInterval(()=>{void dispatchInbox().catch(error=>console.error('[Inbox]',error));},500);timer.unref();
}

/** Composition stops claiming work while provider shutdown handles active runs. */
export function closeInbox():void {if(timer)clearInterval(timer);timer=undefined;}
