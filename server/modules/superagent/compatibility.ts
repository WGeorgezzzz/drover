import { createHash } from 'node:crypto';
import { getConnection } from '@/modules/database/index.js';
import type { Trigger } from './core/index.ts';
let receiver:((trigger:Trigger)=>unknown)|undefined;
export function setCompatibilityReceiver(value:typeof receiver):void {receiver=value;}
export function superagentEnabled():boolean {try{const row=getConnection().prepare("SELECT value FROM kv WHERE key='superagent-settings'").get() as {value:string}|undefined;return !!row&&JSON.parse(row.value).enabled===true;}catch{return false;}}
export function legacyReadOnly():void {if(superagentEnabled())throw Object.assign(new Error('Legacy tasks are read-only while Superagent owns execution'),{statusCode:409,code:'SUPERAGENT_OWNS_TASKS'});}
export function emitCompatibilityTrigger(user:number,source:'conversation'|'infohub',thread:string,id:string,text:string,at:string,meta:Record<string,unknown>={}):void {
 if(!superagentEnabled()||!receiver)return;
 const hash=createHash('sha256').update(text).digest('hex');
 receiver({id:source+':'+id+':'+hash,source,threads:[{source,id:thread}],actor:{source,id:String(user)},human:source==='conversation',at,text,...source==='conversation'&&/(@?驭手)/u.test(text)?{addressed:'mention' as const}:{},meta:{...meta,conversation:thread}});
}
