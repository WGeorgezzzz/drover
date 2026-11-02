import { superagentEnabled, emitCompatibilityTrigger } from '@/modules/superagent/index.js';
import path from 'node:path';
import {z} from 'zod';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash,randomUUID } from 'node:crypto';

import { withUserContext } from '@/modules/auth/index.js';
import { getConnection, projectsDb } from '@/modules/database/index.js';
import { assertContextPath } from '@/modules/access-control/index.js';
import { getCloudCliHomeDir } from '@/shared/index.js';

import { taskmasterWorkspace } from './taskmaster-auto.service.js';
import { infohubRecord, infohubTopics, remoteStatus } from './taskmaster-infohub.model.js';
import type { InfohubUnit } from '@/shared/types.js';
import { createInfohubLifecycle, launchInfohubProcess } from './taskmaster-infohub-lifecycle.service.js';

type SyncStatus={online:boolean;lastSyncedAt:string|null;error:string|null;imported:number;merged:unknown[];unmatchedLegacy:unknown[];tags:unknown[]};
const states=new Map<number,SyncStatus>(),pending=new Map<number,Promise<SyncStatus>>();
let timer:ReturnType<typeof setInterval>|undefined;
/** Inbox rendering and sources status restore the last successful reconciliation without contacting or launching info-hub. */
export const infohubSyncStatus=(userId:number):SyncStatus=>{
  const current=states.get(userId);if(current)return current;
  let saved:Partial<SyncStatus>={};try{saved=JSON.parse(readFileSync(syncMetadataPath(userId),'utf8'));}catch{/* No completed synchronization yet. */}
  const initial={online:false,lastSyncedAt:saved.lastSyncedAt||null,error:null,imported:saved.imported||0,merged:[],unmatchedLegacy:[],tags:[]};states.set(userId,initial);return initial;
};
function syncMetadataPath(user:number){return path.join(getCloudCliHomeDir(),'taskmaster','infohub-'+user+'-'+createHash('sha256').update(baseUrl().href).digest('hex').slice(0,12)+'.json');}

function baseUrl(){const base=new URL(process.env.INFOHUB_BASE_URL||'http://127.0.0.1:8765');if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw Error('信息看板仅支持本机连接');return base;}
/** Sources health, evidence retrieval and reconciliation use the authenticated loopback API with bounded waits. */
export async function infohubRequest(endpoint:string,body?:unknown,timeout=10000):Promise<unknown> {
  let token=process.env.INFOHUB_API_TOKEN;
  if(!token)try{token=JSON.parse(await fs.readFile(path.join(getCloudCliHomeDir(),'secrets','infohub-tasks.json'),'utf8')).token;}catch{/* An unauthenticated local info-hub needs no additional account. */}
  const response=await fetch(new URL(endpoint,baseUrl()),{method:body?'POST':'GET',headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout),redirect:'error'});
  if(!response.ok)throw Object.assign(Error(response.status===401?'信息看板连接未授权，请配置 INFOHUB_API_TOKEN':response.status===409?'信息看板内容已改变，本次未覆盖来源状态；请刷新核对':'信息看板请求失败（'+response.status+'）'),{statusCode:response.status});
  return response.json();
}

const sourceUnitSchema=z.object({id:z.number().int().positive(),kind:z.string(),title:z.string(),status:z.string(),updated_at:z.number()}).passthrough();
const snapshotSchema=z.object({schema:z.literal(1),revision:z.string().regex(/^[a-f0-9]{64}$/),units:z.array(sourceUnitSchema),parents:z.array(sourceUnitSchema),tags:z.array(z.unknown()),missing_ids:z.array(z.number())});
const snapshots=new Map<string,{revision:string;units:InfohubUnit[];parents:InfohubUnit[];tags:unknown[]}>();
async function batchSnapshot(user:number,ids:string[]){
 const key=user+':'+baseUrl().href,cached=snapshots.get(key);
 let value:unknown;
 try{value=await infohubRequest('/api/task-snapshot',{linked_ids:ids.map(Number),known_revision:cached?.revision});}
 catch(error){if([404,405].includes((error as {statusCode?:number}).statusCode||0))return null;throw error;}
 const unchanged=value as {schema?:number;unchanged?:boolean;revision?:string};
 if(unchanged?.schema===1&&unchanged.unchanged&&cached&&unchanged.revision===cached.revision)return cached;
 const parsed=snapshotSchema.parse(value),result={revision:parsed.revision,units:parsed.units as InfohubUnit[],parents:parsed.parents as InfohubUnit[],tags:parsed.tags};
 snapshots.set(key,result);return result;
}
async function readProgress(endpoint:string):Promise<unknown>{
 for(let attempt=0;;attempt++)try{return await infohubRequest(endpoint,undefined,10000);}
 catch(error){const status=(error as {statusCode?:number}).statusCode;if(attempt>=2||status&&status<500&&status!==408&&status!==429)throw error;await new Promise(resolve=>setTimeout(resolve,250*2**attempt));}
}
async function collectInfohub(){
 try{
  let state=await infohubRequest('/api/collect',{},10000) as {running:boolean;error?:string|null};
  while(state.running){await new Promise(resolve=>setTimeout(resolve,1000));state=await readProgress('/api/collect/status') as typeof state;}
  if(state.error)throw Error(state.error);return state;
 }catch(error){if([404,405].includes((error as {statusCode?:number}).statusCode||0))return infohubRequest('/api/poll',{},180000);throw error;}
}

/** Sources routes explicitly start collection; the automatic reconciler never launches a service. */
export const infohubLifecycle=createInfohubLifecycle({
  probe:()=>infohubRequest('/api/health',undefined,1500),
  launch:launchInfohubProcess,
  collect:collectInfohub,
  organize:async report=>{
    try {
      let state=await infohubRequest('/api/organize',{},10000) as {running:boolean;remaining?:number|null;error?:string|null;reason?:string|null};
      report(state);
      while(state.running){await new Promise(resolve=>setTimeout(resolve,2000));state=await readProgress('/api/organize/status') as typeof state;report(state);}
      return state;
    } catch(error) {return {error:error instanceof Error?error.message:String(error)};}
  },
  reconcile:syncInfohubTasks,
  isBusy:()=>pending.size>0,
  isRemoteBusy:async()=>{
    const status=async(endpoint:string)=>{try{return z.object({running:z.boolean()}).parse(await readProgress(endpoint));}catch(error){if((error as {statusCode?:number}).statusCode===404)return {running:false};throw error;}};
    const jobs=await Promise.all([status('/api/collect/status'),status('/api/organize/status')]);
    return jobs.some(job=>job.running);
  },
});

/** One serial HTTP reconciliation per account; task rendering never waits for this connection. */
export function syncInfohubTasks(userId:number):Promise<SyncStatus> {
  const current=pending.get(userId);if(current)return current;
  const job=withUserContext(userId,async()=>{
    const previous=infohubSyncStatus(userId);
    try{
      if(superagentEnabled()){const units=await infohubRequest('/api/units?limit=10000&order=activity') as InfohubUnit[];for(const unit of units)emitCompatibilityTrigger(userId,'infohub',String(unit.id),String(unit.id)+':'+unit.updated_at,[unit.title,unit.summary].filter(Boolean).join('\n'),new Date(unit.updated_at*1000).toISOString(),{unitId:unit.id,provenance:'inferred summary; no human authorship assumed'});const next={...previous,online:true,lastSyncedAt:new Date().toISOString(),error:null,imported:0};states.set(userId,next);return next;}
      const root=path.resolve(process.env.TASKMASTER_INBOX_ROOT||'D:/embodied/inbox-todos');
      assertContextPath(root);assertContextPath(path.join(root,'.taskmaster'));
      const project=projectsDb.createProjectPath(root,'收件箱待办').project;if(!project)throw Error('无法注册任务项目');
      const existing=(await taskmasterWorkspace.list(root,userId)).tasks;
      const linked=new Map(existing.filter(t=>t.source==='infohub').map(t=>[String(t.sourceId),t]));
      const batch=await batchSnapshot(userId,[...linked.keys()]);
      const units=batch?.units||await infohubRequest('/api/units?limit=10000&order=activity') as InfohubUnit[];
      if(!Array.isArray(units)||units.length>=10000)throw Error('信息看板单元超出单次范围，请缩小同步范围后重试');
      const tags=batch?.tags||await infohubRequest('/api/tags') as unknown[];
      const selected=units.filter(u=>(u.for_me||u.tags?.includes('type:deadline'))&&(u.kind==='todo'||!!u.due_at&&u.tags?.includes('type:deadline')));
      const all:InfohubUnit[]=batch?[...batch.units]:[],preserveHistoryStatus=new Set<string>();
      for(const unit of all)if(unit.status==='dropped'&&['done','cancelled'].includes(String(linked.get(String(unit.id))?.status)))preserveHistoryStatus.add(String(unit.id));
      // Compatibility reads stay fresh; old servers do not expose an edge revision.
      const load=(unit:InfohubUnit)=>infohubRequest('/api/unit/'+unit.id+'?depth=2') as Promise<InfohubUnit>;
      if(!batch)for(const unit of selected)all.push(await load(unit));
      // Reconcile already linked records even if they lose their "for me" flag or drop out of the todo view.
      if(!batch)for(const id of linked.keys())if(!all.some(u=>String(u.id)===id)){
        const listed=units.find(u=>String(u.id)===id);
        if(listed)all.push(await load(listed));
        else try{
          // The ordinary units feed omits dropped records. Read only already-linked history, without resurrecting it.
          const hidden=await infohubRequest('/api/unit/'+encodeURIComponent(id)+'?depth=2') as InfohubUnit;
          all.push(hidden);
          if(['done','cancelled'].includes(String(linked.get(id)?.status)))preserveHistoryStatus.add(id);
        }catch(error){if((error as {statusCode?:number}).statusCode!==404)throw error;}
      }
      const parents:InfohubUnit[]=batch?[...batch.parents]:[];const visited=new Set(all.map(u=>u.id));
      const addParents=async(unit:InfohubUnit,depth=0)=>{if(depth>20)throw Error('信息看板主题层级过深');for(const parent of unit.parents||[]){if(visited.has(parent.id))continue;visited.add(parent.id);const full=await infohubRequest('/api/unit/'+parent.id+'?depth=2') as InfohubUnit;parents.push(full);await addParents(full,depth+1);}};
      if(!batch)for(const unit of all)await addParents(unit);
      const records=()=>all.map(unit=>({...infohubRecord(unit,[...parents,...all]),preserveStatus:preserveHistoryStatus.has(String(unit.id))}));
      let result=await taskmasterWorkspace.reconcileInfohub(root,userId,records(),infohubTopics([...parents,...all]));
      const merges=[...result.merges];
      for(const write of result.writes){
        const latest=await infohubRequest('/api/unit/'+write.unitId+'?depth=2') as InfohubUnit;
        const original=all.find(unit=>String(unit.id)===write.unitId);
        if(latest.updated_at*1000>write.expectedUpdatedAt||original?.revision&&latest.revision!==original.revision)throw Error('信息看板内容已改变，本次未覆盖来源状态；请刷新核对');
        await infohubRequest('/api/unit/'+write.unitId,{status:remoteStatus(write.status),...(latest.revision?{expected_revision:latest.revision}:{})});
        const confirmed=await infohubRequest('/api/unit/'+write.unitId+'?depth=2') as InfohubUnit;
        if(confirmed.status!==remoteStatus(write.status))throw Error('信息看板状态写回未确认，稍后重试');
        const index=all.findIndex(u=>u.id===confirmed.id);if(index>=0)all[index]=confirmed;
      }
      if(result.writes.length)result=await taskmasterWorkspace.reconcileInfohub(root,userId,records(),infohubTopics([...parents,...all]));
      const next={online:true,lastSyncedAt:new Date().toISOString(),error:null,imported:result.imported,merged:[...previous.merged,...merges],unmatchedLegacy:result.unmatchedLegacy,tags};
      const file=syncMetadataPath(userId);await fs.mkdir(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,JSON.stringify({lastSyncedAt:next.lastSyncedAt,imported:next.imported}));await fs.rename(temporary,file);
      states.set(userId,next);return next;
    }catch(error){const next={...previous,online:false,error:error instanceof Error?error.message:'信息看板离线，稍后同步'};states.set(userId,next);return next;}
  }).finally(()=>pending.delete(userId));
  pending.set(userId,job);return job;
}

/** The personal local info-hub belongs to the primary administrator, never member accounts. */
export function initializeInfohubTaskSync(){
  if(timer||process.env.CLAUDEX_PASSIVE_INSTANCE==='1')return;
  const poll=()=>{if(!infohubLifecycle.active()||infohubLifecycle.busy())return;const admin=getConnection().prepare("SELECT id FROM users WHERE role='admin' AND deleted_at IS NULL ORDER BY id LIMIT 1").get() as {id:number}|undefined;if(admin)void syncInfohubTasks(admin.id).catch(error=>console.warn('[InfoHub tasks]',String(error)));};
  timer=setInterval(poll,30000);timer.unref();
}
/** Taskmaster shutdown stops polling and signals only an interpreter owned by this server instance. */
export function closeInfohubTaskSync(){clearInterval(timer);timer=undefined;void infohubLifecycle.stop().catch(error=>console.warn('[InfoHub stop]',String(error)));}
