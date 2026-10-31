import { createHash } from 'node:crypto';
import type { SuperagentStore } from './store.js';
import type { Trigger } from './core/index.ts';

export class OutboundLedger {
  constructor(private readonly store:SuperagentStore) {
    store.database.exec('CREATE TABLE IF NOT EXISTS superagent_outbound_identity (outbox_id TEXT PRIMARY KEY, source TEXT NOT NULL, conversation TEXT NOT NULL, actor TEXT NOT NULL, content_hash TEXT NOT NULL, started_at INTEGER NOT NULL, sent_at INTEGER, platform_id TEXT, observed_id TEXT);CREATE INDEX IF NOT EXISTS superagent_outbound_platform ON superagent_outbound_identity(source,conversation,platform_id);CREATE INDEX IF NOT EXISTS superagent_outbound_hash ON superagent_outbound_identity(source,conversation,actor,content_hash,started_at)');
  }
  begin(id:string,actor:string,now=Date.now()):void {
    const receipt=this.store.receipt(id);
    if(!receipt||receipt.status!=='pending'||!this.store.canSend(id))throw new Error('Outbox message is not sendable');
    const message=receipt.message;
    this.store.atomic(()=>{
      this.store.database.prepare('INSERT INTO superagent_outbound_identity(outbox_id,source,conversation,actor,content_hash,started_at) VALUES (?,?,?,?,?,?) ON CONFLICT(outbox_id) DO UPDATE SET started_at=excluded.started_at').run(id,message.channel.source,message.channel.thread,actor,this.hash(message.text),now);
      this.store.sending(id);
    });
  }
  sent(id:string,platformId?:string,now=Date.now()):void {
    this.store.atomic(()=>{
      const updated=this.store.database.prepare('UPDATE superagent_outbound_identity SET sent_at=?,platform_id=? WHERE outbox_id=?').run(now,platformId??null,id);
      if(!updated.changes)throw new Error('No durable outbound send intent');
      this.store.sent(id);
    });
  }
  isOwn(trigger:Trigger):boolean {
    const conversation=trigger.channel?.thread??trigger.threads[0]?.id;
    if(!conversation)return false;
    const platformId=String(trigger.meta.platformId??'');
    if(platformId&&this.store.database.prepare('SELECT 1 FROM superagent_outbound_identity WHERE source=? AND conversation=? AND platform_id=? AND actor=?').get(trigger.source,conversation,platformId,trigger.actor.id))return true;
    if(trigger.source!=='wechat')return false;
    const at=Date.parse(trigger.at);
    if(!Number.isFinite(at))return false;
    const row=this.store.database.prepare('SELECT outbox_id,observed_id FROM superagent_outbound_identity WHERE source=? AND conversation=? AND actor=? AND content_hash=? AND started_at BETWEEN ? AND ? AND (observed_id IS NULL OR observed_id=?) ORDER BY started_at LIMIT 1').get(trigger.source,conversation,trigger.actor.id,this.hash(trigger.text),at-120000,at+10000,trigger.id) as {outbox_id:string;observed_id:string|null}|undefined;
    if(!row)return false;
    this.store.atomic(()=>{
      this.store.database.prepare('UPDATE superagent_outbound_identity SET observed_id=?,sent_at=COALESCE(sent_at,?) WHERE outbox_id=?').run(trigger.id,at,row.outbox_id);
      this.store.sent(row.outbox_id);
    });
    return true;
  }
  private hash(text:string):string {return createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');}
}
