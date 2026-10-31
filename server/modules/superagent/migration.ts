import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import type { Ticket,Thread,Decision,Trigger } from './core/index.ts';
import type { SuperagentStore } from './store.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
type LegacyTask={id:string|number;title:string;status?:string;description?:string;details?:string;subtasks?:LegacyTask[];executionSessionId?:string};
type Entry={key:string;kind:'task'|'monitor';title:string;text:string;status:string;meta:Record<string,unknown>;source:string;thread:string;at:string;deferred?:string};
type Journal={key:string;ticketId:string;threadKey:string;triggerId:string;decisionId:string;fingerprint:string;threadFingerprint:string;kind:string;monitorId?:string;rolledBack?:boolean};
/** Migration reads historical records without replaying their side effects or modifying tasks.json. */
export class SuperagentMigration {
 constructor(private readonly store:SuperagentStore,private readonly owner:number,private readonly root:string){}
 preview(roots:string[]):{entries:Entry[];files:{path:string;sha256:string}[];errors:string[]} {
  const entries:Entry[]=[],files:{path:string;sha256:string}[]=[],errors:string[]=[];
  for(const root of new Set(roots.map(p=>resolve(p)))){const path=join(root,'.taskmaster','tasks','tasks.json');let raw:string;try{raw=readFileSync(path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;errors.push(path+': '+String(error));continue;}
   try{const doc=JSON.parse(raw.replace(/^\uFEFF/,''));files.push({path,sha256:hash(raw)});const groups=Array.isArray(doc)?{master:{tasks:doc}}:Array.isArray(doc.tasks)?{master:{tasks:doc.tasks}}:doc;
    const visit=(tasks:LegacyTask[],tag:string,parent='')=>{for(const task of tasks){if(task.id===undefined||typeof task.title!=='string')throw new Error('Invalid legacy task');const id=parent+String(task.id);entries.push({key:'task:'+path+':'+tag+':'+id,kind:'task',title:task.title,text:[task.description,task.details].filter(Boolean).join('\n'),status:task.status??'pending',meta:{legacyFile:path,projectPath:root,tag,taskId:id,executionSessionId:task.executionSessionId},source:'conversation',thread:'legacy:'+hash(path+tag+id).slice(0,24),at:new Date().toISOString()});if(task.subtasks)visit(task.subtasks,tag,id+'.');}};
    for(const [tag,group] of Object.entries(groups)){const tasks=(group as {tasks?:LegacyTask[]})?.tasks;if(Array.isArray(tasks))visit(tasks,tag);}
   }catch(error){errors.push(path+': '+String(error));}
  }
  if(this.store.database.prepare("SELECT 1 FROM sqlite_master WHERE name='monitors'").get())for(const row of this.store.database.prepare("SELECT * FROM monitors WHERE user_id=? AND status<>'stopped'").all(this.owner) as Record<string,any>[]){entries.push({key:'monitor:'+row.id,kind:'monitor',title:row.name,text:row.content,status:row.status==='paused'?'blocked':'waiting',meta:{monitorId:row.id,sessionId:row.session_id,options:JSON.parse(row.options||'{}'),probe:row.probe_json?JSON.parse(row.probe_json):null},source:'monitor',thread:row.id,at:row.created_at,...row.running_id?{deferred:'Existing monitor round is still running'}:{}});}
  return {entries,files,errors};
 }
 apply(roots:string[]) {
  const plan=this.preview(roots);if(plan.errors.length)throw new Error(plan.errors.join('\n'));
  let imported=0,skipped=0,deferred=0;
  this.store.atomic(()=>{for(const entry of plan.entries){const journalKey='migration:record:'+hash(entry.key),old=this.store.get<Journal>(journalKey);if(old&&!old.rolledBack){skipped++;continue;}if(entry.deferred){deferred++;continue;}
   const suffix=hash(entry.key).slice(0,24),id='legacy-'+suffix,threadKey=entry.source+':'+entry.thread,triggerId='legacy-trigger-'+suffix,decisionId='legacy-decision-'+suffix,at=new Date().toISOString();
   if(this.store.tickets.get(id)){skipped++;continue;}
   const trigger:Trigger={id:triggerId,source:entry.source,threads:[{source:entry.source,id:entry.thread}],actor:{source:'conversation',id:String(this.owner)},human:true,at:entry.at,text:entry.title+'\n'+entry.text,meta:{...entry.meta,legacy:true}};
   const ticket:Ticket={id,title:entry.title,decisionId,mandate:{strength:'explicit',policyVersion:'legacy-import-1',basis:{via:'listed',sender:String(this.owner),authority:'Historical task import; verify existing execution before continuing'},actor:trigger.actor,scope:trigger.text},channels:[],assignments:[{id:'legacy-assignment-'+suffix,state:'running',createdAt:at,startedAt:at,idleAt:at,report:{state:entry.status==='blocked'?'blocked':'waiting',summary:'Imported historical state: '+entry.status+'. Existing sessions and side effects have not been replayed.',at}}],inputs:[],undelivered:[],origin:{triggerId,triggerIds:[triggerId]},createdAt:entry.at,updatedAt:at,execution:{name:id,directory:join(this.root,'work',id),assignment:trigger.text}};
   if(['done','cancelled'].includes(entry.status)){ticket.ended={at,by:entry.status==='cancelled'?'human':'executor',outcome:entry.status==='cancelled'?'stopped':'completed'};ticket.assignments[0].state='ended';ticket.assignments[0].endedAt=at;}
   const thread:Thread={key:threadKey,ref:trigger.threads[0],createdAt:entry.at,subscriptions:[id],correlated:[],pending:[],meta:entry.meta};
   const decision:Decision={id:decisionId,evalId:'migration-'+suffix,threadKey,triggerIds:[triggerId],policyVersion:'legacy-import-1',at,kind:'accept',reason:[{code:'legacyImport'}],strength:'explicit',ticketId:id,mandate:ticket.mandate,audit:{legacy:entry.meta,originalStatus:entry.status}};
   this.store.triggers.save(trigger);this.store.triggers.saveDisposition(triggerId,{decisionId,fanout:[id],at});this.store.threads.save(thread);this.store.tickets.save(ticket);this.store.decisions.save(decision);
   this.store.set(journalKey,{key:entry.key,ticketId:id,threadKey,triggerId,decisionId,fingerprint:hash(JSON.stringify(ticket)),threadFingerprint:hash(JSON.stringify(thread)),kind:entry.kind,...entry.kind==='monitor'?{monitorId:entry.thread}:{}} satisfies Journal);
   if(entry.kind==='monitor')this.store.set('migration:monitor:'+entry.thread,{ticketId:id,at});imported++;
  }this.store.set('migration:last',{at:new Date().toISOString(),imported,skipped,deferred,files:plan.files});});
  return {imported,skipped,deferred,tasks:plan.entries.filter(e=>e.kind==='task').length,monitors:plan.entries.filter(e=>e.kind==='monitor').length,files:plan.files};
 }
 rollback(){let removed=0,retained=0;this.store.atomic(()=>{
  const settings=this.store.get<Record<string,unknown>>('superagent-settings');if(settings){this.store.set('superagent-settings',{...settings,enabled:false});this.store.set('superagent-settings-revision',(this.store.get<number>('superagent-settings-revision')??0)+1);}
  for(const row of this.store.database.prepare("SELECT key,value FROM kv WHERE key LIKE 'migration:record:%'").all() as {key:string;value:string}[]){const journal=JSON.parse(row.value) as Journal;if(journal.rolledBack)continue;const ticket=this.store.tickets.get(journal.ticketId);
   if(journal.monitorId)this.store.database.prepare('DELETE FROM kv WHERE key=?').run('migration:monitor:'+journal.monitorId);
   const thread=this.store.threads.get(journal.threadKey);if(ticket&&hash(JSON.stringify(ticket))!==journal.fingerprint||thread&&hash(JSON.stringify(thread))!==journal.threadFingerprint){retained++;continue;}
   for(const [table,id] of [['ticket',journal.ticketId],['thread',journal.threadKey],['trigger',journal.triggerId],['decision',journal.decisionId],['disposition',journal.triggerId]])this.store.database.prepare('DELETE FROM "'+table+'" WHERE id=?').run(id);
   this.store.database.prepare('DELETE FROM trigger_thread WHERE trigger_id=?').run(journal.triggerId);journal.rolledBack=true;this.store.set(row.key,journal);removed++;
  }this.store.set('migration:rollback',{at:new Date().toISOString(),removed,retained});});return {removed,retained,legacyFilesModified:0};}
}
