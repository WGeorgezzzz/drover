import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../core/index.ts';
import type { Trigger } from '../core/index.ts';
import { SuperagentStore } from '../store.js';
import { SuperagentSettings } from '../settings.js';
import { OutboundLedger } from '../outbound-ledger.js';
import { OutboxDispatcher } from '../outbox-dispatcher.js';
import { SourceIngress } from '../source-ingress.js';
const connections:Database.Database[]=[];
const directories:string[]=[];
afterEach(()=>{for(const db of connections.splice(0))db.close();for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});});
function harness(file=':memory:') {
  const db=new Database(file);connections.push(db);
  const store=new SuperagentStore(db),settings=new SuperagentSettings(store),ledger=new OutboundLedger(store);
  const current=settings.current();current.enabled=true;
  for(const name of ['github','wechat','feishu'] as const)current.sources[name].enabled=true;
  settings.save(current,0);
  const engine=new Engine({repo:store,scope:settings.scope,policy:()=>settings.policy(),outbox:store,assessor:{request:c=>store.enqueue('eval',c.evalId,c)},executor:{start:(t,a)=>store.enqueue('launch',a.id,{ticketId:t.id}),deliver:()=>{},stop:()=>{}}});
  return {db,store,settings,ledger,engine,ingress:new SourceIngress(engine,ledger)};
}
function trigger(id:string,source='github',text='\u9a6d\u624b test',thread='issue:1'):Trigger {
 return {id,source,threads:[{source,id:thread}],actor:{source,id:source==='wechat'?'wangqiaozhi123':'WGeorgezzzz'},human:true,addressed:'mention',at:new Date().toISOString(),text,channel:{source,thread,address:{}},meta:{repository:'WGeorgezzzz/drover',platformId:id}};
}
function queue(h:ReturnType<typeof harness>,id='a',source='github',text='\u9a6d\u624b result',thread='issue:1') {
 h.store.send({id,kind:'reply',channel:{source,thread,address:{}},text});
}
describe('durable source identity and outbox',()=>{
 it('sends the exact body without a prefix or hidden marker and ignores its platform ID even when it mentions the agent',async()=>{
  const h=harness(),text='\u9a6d\u624b result';queue(h,'a','github',text);
  const bodies:string[]=[];
  await new OutboxDispatcher(h.store,h.ledger,{enabled:()=>true,actor:()=> 'WGeorgezzzz',send:async m=>{bodies.push(m.text);return {platformId:'comment-7'};}}).pass();
  expect(bodies).toEqual([text]);expect(h.ingress.receive(trigger('comment-7','github',text))).toEqual({kind:'own_outbound'});
  h.engine.evaluateDue();expect(h.store.tickets.list()).toEqual([]);expect(h.store.list('trigger')).toEqual([]);
 });
 it('accepts the same account human request, without treating the account itself as the agent',()=>{
  const h=harness();expect(h.ingress.receive(trigger('human-1'))).toBe('stored');h.engine.evaluateDue();expect(h.store.effects().some(e=>e.kind==='eval')).toBe(true);
 });
 it('does not suppress an identical GitHub body with a different platform ID',()=>{
  const h=harness();queue(h);h.ledger.begin('a','WGeorgezzzz');h.ledger.sent('a','comment-7');expect(h.ledger.isOwn(trigger('human-2','github','\u9a6d\u624b result'))).toBe(false);
 });
 it('recognizes Feishu user messages by returned ID',()=>{
  const h=harness();queue(h,'a','feishu');h.ledger.begin('a','owner-open-id');h.ledger.sent('a','om_7');const t=trigger('om_7','feishu','\u9a6d\u624b result');t.actor.id='owner-open-id';expect(h.ledger.isOwn(t)).toBe(true);
 });
 it('binds WeChat fallback hashes to conversation, sender, time and one immutable event',()=>{
  const h=harness();queue(h,'a','wechat','\u9a6d\u624b result','filehelper');h.ledger.begin('a','wangqiaozhi123');h.ledger.sent('a');
  const t=trigger('wx7','wechat','\u9a6d\u624b result','filehelper');expect(h.ingress.receive(t)).toEqual({kind:'own_outbound'});expect(h.ledger.isOwn(t)).toBe(true);
  expect(h.ledger.isOwn({...t,id:'wx8'})).toBe(false);
  expect(h.ledger.isOwn({...t,channel:{source:'wechat',thread:'other',address:{}}})).toBe(false);
  expect(h.ledger.isOwn({...t,actor:{source:'wechat',id:'guest'}})).toBe(false);
  expect(h.ledger.isOwn({...t,at:new Date(Date.now()+180000).toISOString()})).toBe(false);
 });
 it('recovers WeChat sent-before-receipt crashes from the durable send intent',()=>{
  const h=harness();queue(h,'a','wechat','\u9a6d\u624b result','filehelper');h.ledger.begin('a','wangqiaozhi123');
  expect(h.ledger.isOwn(trigger('wx7','wechat','\u9a6d\u624b result','filehelper'))).toBe(true);expect(h.store.status('a')).toBe('sent');
 });
 it('retains receipts across restart and never sends them again',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'drover-outbox-'));directories.push(dir);const file=join(dir,'test.db');const h=harness(file);queue(h);h.ledger.begin('a','WGeorgezzzz');h.ledger.sent('a','comment-7');
  h.db.close();connections.splice(connections.indexOf(h.db),1);
  const db=new Database(file);connections.push(db);const store=new SuperagentStore(db),ledger=new OutboundLedger(store);let calls=0;
  await new OutboxDispatcher(store,ledger,{enabled:()=>true,actor:()=> 'WGeorgezzzz',send:async()=>{calls++;return {};}}).pass();
  expect(calls).toBe(0);expect(ledger.isOwn(trigger('comment-7','github','\u9a6d\u624b result'))).toBe(true);
 });
 it('serializes a conversation, continues other conversations, and blocks ambiguous sends for reconciliation',async()=>{
  const h=harness();queue(h,'a');queue(h,'b');queue(h,'c','github','other','issue:2');const sent:string[]=[];
  const dispatcher=new OutboxDispatcher(h.store,h.ledger,{enabled:()=>true,actor:()=> 'WGeorgezzzz',send:async m=>{sent.push(m.id);if(m.id==='a')throw new Error('transport interrupted');return {platformId:m.id};}});
  await dispatcher.pass();await dispatcher.pass();expect(sent).toEqual(['a','c']);expect(h.store.receipt('a')?.sending).toBe(1);expect(h.store.status('b')).toBe('pending');
 });
 it('retries explicitly rejected sends with backoff',async()=>{
  const h=harness();queue(h);await new OutboxDispatcher(h.store,h.ledger,{enabled:()=>true,actor:()=> 'WGeorgezzzz',send:async()=>{throw Object.assign(new Error('not sent'),{definitelyNotSent:true});}}).pass();
  expect(h.store.receipt('a')?.sending).toBe(0);expect(h.store.effects()).toEqual([]);const row=h.db.prepare('SELECT attempts,due FROM effect').get() as {attempts:number;due:number};expect(row.attempts).toBe(1);expect(row.due).toBeGreaterThan(Date.now());
 });
 it('moves the fallback time window to the most recent definite retry',()=>{
  const h=harness();queue(h,'a','wechat','\u9a6d\u624b result','filehelper');h.ledger.begin('a','wangqiaozhi123',Date.now()-600000);h.store.sendFailed('a','definitely rejected',false);h.ledger.begin('a','wangqiaozhi123');h.ledger.sent('a');expect(h.ledger.isOwn(trigger('wx-new','wechat','\u9a6d\u624b result','filehelper'))).toBe(true);
 });
 it('rolls back domain state and queued side effects together',()=>{
  const h=harness();expect(()=>h.store.atomic(()=>{h.store.triggers.save(trigger('1'));queue(h);throw new Error('rollback');})).toThrow('rollback');expect(h.store.triggers.get('1')).toBeUndefined();expect(h.store.outbox()).toEqual([]);expect(h.store.effects()).toEqual([]);
 });
 it('rejects unlisted actors and other repositories before any semantic evaluation',()=>{
  const h=harness();h.ingress.receive({...trigger('1'),actor:{source:'github',id:'guest'}});h.engine.evaluateDue();expect(h.store.effects().filter(e=>e.kind==='eval')).toEqual([]);expect(h.store.decisions.byThread('github:issue:1')[0].kind).toBe('ignore');expect(h.ingress.receive({...trigger('2'),meta:{repository:'someone/other'}})).toBe('filtered');
 });
 it('preserves the first idempotent outbox body and schema on repeated opens',()=>{
  const h=harness();queue(h);queue(h,'a','github','replacement');expect(h.store.receipt('a')?.message.text).toBe('\u9a6d\u624b result');new SuperagentStore(h.db);expect(h.store.outbox()).toHaveLength(1);
 });
 it('refuses newer schemas and stale setting revisions',()=>{
  const h=harness();expect(()=>h.settings.save(h.settings.current(),0)).toThrow('reload');h.store.set('superagent-schema-version',99);expect(()=>new SuperagentStore(h.db)).toThrow('newer');
 });
});
