import { mkdirSync, readFileSync, openSync, writeFileSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { getCurrentUserContext } from '@/modules/auth/index.js';
import { getConnection, getDatabasePath } from '@/modules/database/index.js';
import { SuperagentRuntime } from './runtime.js';
import { SuperagentStore } from './store.js';

let runtime:SuperagentRuntime|undefined;
let releaseLock:(()=>void)|undefined;
// Server lifecycle and TaskMaster compatibility use this persisted switch without creating a second runtime.
export function superagentEnabled():boolean {
  try {const row=getConnection().prepare("SELECT value FROM kv WHERE key='superagent-settings'").get() as {value:string}|undefined;return row?JSON.parse(row.value).enabled===true:false;}catch{return false;}
}
// The HTTP server starts one host-owned engine; provider subprocesses only call its capability endpoint.
export function initializeSuperagent(port:number):void {
  if(runtime)return;
  const root=join(dirname(getDatabasePath()),'superagent');mkdirSync(root,{recursive:true});
  const lock=join(root,'writer.lock');
  try {const owner=JSON.parse(readFileSync(lock,'utf8')) as {pid:number};try{process.kill(owner.pid,0);throw new Error('Superagent already has a live writer: '+owner.pid);}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}unlinkSync(lock);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const fd=openSync(lock,'wx');writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));closeSync(fd);
  releaseLock=()=>{const owner=JSON.parse(readFileSync(lock,'utf8')) as {pid:number};if(owner.pid===process.pid)unlinkSync(lock);};
  const store=new SuperagentStore(getConnection());
  const ownerId=store.get<number>('superagent-owner')??Number(process.env.SUPERAGENT_OWNER_ID??1);store.set('superagent-owner',ownerId);
  try{runtime=new SuperagentRuntime(ownerId,'http://127.0.0.1:'+port+'/internal/superagent/tool');runtime.start();}catch(error){releaseLock();releaseLock=undefined;throw error;}
}
// Server shutdown drains sessions before releasing the single-writer lease.
export async function closeSuperagent():Promise<void>{try{await runtime?.close();}finally{runtime=undefined;releaseLock?.();releaseLock=undefined;}}
function current():SuperagentRuntime {if(!runtime)throw new Error('Superagent is not initialized');return runtime;}
const route=Router();
route.use((_req,res,next)=>{const user=getCurrentUserContext();if(!user||user.role!=='admin'||user.userId!==current().ownerId){res.status(403).json({error:'SUPERAGENT_OWNER_REQUIRED'});return;}next();});
route.get('/',(_req,res)=>{res.json(current().snapshot());});
route.put('/settings',(req,res,next)=>{try{const input=z.object({settings:z.unknown(),revision:z.number().int().nonnegative()}).strict().parse(req.body);const host=current(),before=host.settings.policy().version;host.settings.save(input.settings,input.revision);host.engine.policyChanged(before,host.settings.policy().version);host.pass();res.json(host.snapshot());}catch(error){next(error);}});
route.post('/tickets/:id/:action',(req,res,next)=>{try{const host=current(),id=z.string().min(1).parse(req.params.id),action=z.enum(['stop','retry','status','note']).parse(req.params.action);const result=action==='stop'?host.engine.stopTicket(id):action==='retry'?host.engine.retryTicket(id):action==='status'?host.engine.requestStatus(id):host.engine.note(id,z.string().min(1).parse(req.body.text));host.pass();res.json(result);}catch(error){next(error);}});
route.post('/decisions/:id/dismiss',(req,res,next)=>{try{res.json(current().engine.dismiss(req.params.id));}catch(error){next(error);}});
route.post('/triggers/:id/reevaluate',(req,res,next)=>{try{res.json({queued:current().engine.reevaluate(req.params.id)});}catch(error){next(error);}});
// Only the isolated acceptance instance exposes constructed Trigger injection, still behind owner authentication.
route.post('/test/trigger',(req,res,next)=>{if(process.env.SUPERAGENT_TEST_INGRESS!=='1'){res.sendStatus(404);return;}try{const trigger=z.object({id:z.string(),source:z.string(),threads:z.array(z.object({source:z.string(),id:z.string()})).min(1),actor:z.object({source:z.string(),id:z.string()}),human:z.boolean(),addressed:z.enum(['mention','direct']).optional(),at:z.string().datetime(),text:z.string(),channel:z.object({source:z.string(),thread:z.string(),address:z.record(z.string(),z.string())}).optional(),meta:z.record(z.string(),z.unknown()),url:z.string().optional()}).strict().parse(req.body);res.json({result:current().ingress.receive(trigger)});}catch(error){next(error);}});
// Entrypoint mounts this after JWT authentication. Capabilities never grant panel access.
export const superagentRoutes=route;
const internal=Router();
internal.post('/tool',async(req,res)=>{
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'')){res.sendStatus(403);return;}
  const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization??'')?.[1];
  if(!token){res.sendStatus(401);return;}
  try{const input=z.object({name:z.string(),arguments:z.unknown()}).strict().parse(req.body);res.json(await current().tool(token,input.name,input.arguments));}catch(error){res.status(400).json({error:String(error)});}
});
// Entrypoint mounts loopback-only, random per-turn capabilities outside browser JWT routes.
export const superagentInternalRoutes=internal;
