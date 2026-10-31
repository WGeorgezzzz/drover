import type Database from 'better-sqlite3';
import { latestAssignment, threadKey } from './core/index.ts';
import type { Decision, OutboundMessage, Repositories, ReplyStatus, Thread, Ticket, Trigger, TriggerDisposition } from './core/index.ts';

export class SuperagentStore implements Repositories {
  constructor(readonly database: Database.Database) {
    database.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const version = this.get<number>('superagent-schema-version') ?? 0;
    if (version > 1) throw new Error('Superagent database was written by a newer release');
    this.atomic(() => {
      for (const table of ['trigger', 'disposition', 'thread', 'ticket', 'decision']) database.exec('CREATE TABLE IF NOT EXISTS "'+table+'" (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
      database.exec(
        'CREATE TABLE IF NOT EXISTS trigger_thread (trigger_id TEXT NOT NULL, thread_key TEXT NOT NULL, at TEXT NOT NULL, human INTEGER NOT NULL, PRIMARY KEY(trigger_id,thread_key));'+
        'CREATE INDEX IF NOT EXISTS trigger_thread_timeline ON trigger_thread(thread_key,at,trigger_id);'+
        'CREATE TABLE IF NOT EXISTS effect (position INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, due INTEGER NOT NULL DEFAULT 0, error TEXT, state TEXT NOT NULL DEFAULT \'pending\', UNIQUE(kind,key));'+
        'CREATE INDEX IF NOT EXISTS effect_due ON effect(state,due,position);'+
        'CREATE TABLE IF NOT EXISTS outbox (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, channel_key TEXT NOT NULL, value TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'pending\', sending INTEGER NOT NULL DEFAULT 0, error TEXT);'+
        'CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(status,channel_key,position);'
      );
      this.set('superagent-schema-version', 1);
    });
  }

  atomic<T>(work: () => T): T { return this.database.transaction(work)(); }
  get<T>(key: string): T | undefined {
    const row = this.database.prepare('SELECT value FROM kv WHERE key=?').get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : undefined;
  }
  set(key: string, value: unknown): void { this.database.prepare('INSERT INTO kv VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  private read<T>(table: string, id: string): T | undefined {
    const row = this.database.prepare('SELECT value FROM "'+table+'" WHERE id=?').get(id) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : undefined;
  }
  private write(table: string, id: string, value: unknown): void { this.database.prepare('INSERT INTO "'+table+'" VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id, JSON.stringify(value)); }
  list<T>(table: 'trigger' | 'thread' | 'ticket' | 'decision'): T[] { return (this.database.prepare('SELECT value FROM "'+table+'" ORDER BY rowid').all() as { value: string }[]).map(row => JSON.parse(row.value) as T); }

  triggers = {
    get: (id: string) => this.read<Trigger>('trigger', id),
    save: (trigger: Trigger) => {
      this.write('trigger', trigger.id, trigger);
      for (const thread of trigger.threads) this.database.prepare('INSERT OR IGNORE INTO trigger_thread VALUES (?,?,?,?)').run(trigger.id, threadKey(thread), trigger.at, Number(trigger.human));
    },
    disposition: (id: string) => this.read<TriggerDisposition>('disposition', id),
    saveDisposition: (id: string, value: TriggerDisposition) => this.write('disposition', id, value),
  };
  threads = {
    get: (id: string) => this.read<Thread>('thread', id),
    save: (thread: Thread) => this.write('thread', thread.key, thread),
    list: () => this.list<Thread>('thread'),
    active: () => this.list<Thread>('thread').filter(thread => thread.pending.length || thread.evaluating),
  };
  tickets = {
    get: (id: string) => this.read<Ticket>('ticket', id),
    save: (ticket: Ticket) => this.write('ticket', ticket.id, ticket),
    list: () => this.list<Ticket>('ticket').reverse(),
    open: () => this.list<Ticket>('ticket').reverse().filter(ticket => !ticket.ended),
    active: () => this.list<Ticket>('ticket').filter(ticket => ticket.undelivered.length || ['pending','running'].includes(latestAssignment(ticket)?.state ?? '')),
  };
  decisions = {
    get: (id: string) => this.read<Decision>('decision', id),
    save: (decision: Decision) => this.write('decision', decision.id, decision),
    byThread: (key: string) => this.list<Decision>('decision').filter(decision => decision.threadKey === key),
  };

  enqueue(kind: string, key: string, payload: unknown): void {
    this.database.prepare('INSERT OR IGNORE INTO effect(kind,key,payload) VALUES (?,?,?)').run(kind, key, JSON.stringify(payload));
  }
  effects() {
    return (this.database.prepare('SELECT * FROM effect WHERE state=\'pending\' AND due<=? ORDER BY position').all(Date.now()) as { position: number; kind: string; key: string; payload: string; attempts: number; due: number; error: string | null }[]).map(row => ({...row, payload: JSON.parse(row.payload) as Record<string, unknown>}));
  }
  complete(position: number): void { this.database.prepare('DELETE FROM effect WHERE position=?').run(position); }
  fail(position: number, error: unknown): void {
    this.database.prepare('UPDATE effect SET attempts=attempts+1,error=?,due=?+MIN(300000,1000*(1<<MIN(attempts,8))) WHERE position=?').run(String(error), Date.now(), position);
  }
  send(message: OutboundMessage): void {
    this.atomic(() => {
      const saved = this.database.prepare('INSERT OR IGNORE INTO outbox(id,channel_key,value) VALUES (?,?,?)').run(message.id, message.channel.source+':'+message.channel.thread, JSON.stringify(message));
      if (saved.changes) this.enqueue('reply', message.id, {id:message.id});
    });
  }
  status(id: string): ReplyStatus | undefined { return (this.database.prepare('SELECT status FROM outbox WHERE id=?').get(id) as {status: ReplyStatus} | undefined)?.status; }
  withdraw(id: string): void {
    this.database.prepare('UPDATE outbox SET status=\'dropped\' WHERE id=? AND status=\'pending\' AND sending=0').run(id);
  }
  receipt(id: string) {
    const row=this.database.prepare('SELECT * FROM outbox WHERE id=?').get(id) as {position:number;id:string;channel_key:string;value:string;status:ReplyStatus;sending:number;error:string|null}|undefined;
    return row ? {...row, message:JSON.parse(row.value) as OutboundMessage} : undefined;
  }
  canSend(id: string): boolean {
    const row=this.receipt(id);
    if (!row || row.status!=='pending' || row.sending) return false;
    return !(this.database.prepare('SELECT 1 FROM outbox WHERE channel_key=? AND position<? AND status=\'pending\' LIMIT 1').get(row.channel_key,row.position));
  }
  sending(id:string):void { this.database.prepare('UPDATE outbox SET sending=1,error=NULL WHERE id=?').run(id); }
  sent(id:string):void { this.database.prepare('UPDATE outbox SET status=\'sent\',sending=0,error=NULL WHERE id=?').run(id); }
  sendFailed(id:string,error:unknown,uncertain:boolean):void { this.database.prepare('UPDATE outbox SET sending=?,error=? WHERE id=?').run(Number(uncertain),String(error),id); }
  outbox() { return (this.database.prepare('SELECT id FROM outbox ORDER BY position').all() as {id:string}[]).map(row=>this.receipt(row.id)!); }
}
