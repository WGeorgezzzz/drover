import { mkdirSync, readFileSync, openSync, writeFileSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { getCurrentUserContext } from '@/modules/auth/index.js';
import { getConnection, getDatabasePath } from '@/modules/database/index.js';
import { SuperagentMigration } from './migration.js';
import { superagentEnabled } from './compatibility.js';
export { superagentEnabled };
import { SuperagentRuntime } from './runtime.js';
import { SuperagentStore } from './store.js';

let runtime:SuperagentRuntime|undefined;
let releaseLock:(()=>void)|undefined;
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
route.use((_req,res,next)=>{if(!runtime){res.status(503).json({error:'SUPERAGENT_STARTING'});return;}const user=getCurrentUserContext();if(!user||user.role!=='admin'||user.userId!==current().ownerId){res.status(403).json({error:'SUPERAGENT_OWNER_REQUIRED'});return;}next();});
route.get('/',(_req,res)=>{res.json(current().snapshot());});
route.put('/settings',(req,res,next)=>{try{const input=z.object({settings:z.unknown(),revision:z.number().int().nonnegative()}).strict().parse(req.body);const host=current(),before=host.settings.policy().version;host.settings.save(input.settings,input.revision);host.engine.policyChanged(before,host.settings.policy().version);host.pass();res.json(host.snapshot());}catch(error){next(error);}});
route.put('/prompts/:name',(req,res,next)=>{try{const name=z.enum(['worker','orchestrator']).parse(req.params.name),input=z.object({text:z.string().min(20).max(50000),revision:z.number().int().nonnegative()}).strict().parse(req.body);res.json(current().prompts.save(name,input.text,input.revision));}catch(error){next(error);}});
route.put('/tickets/:id/executor',(req,res,next)=>{try{res.json(current().configureExecutor(req.params.id,req.body));}catch(error){next(error);}});
route.post('/outbox/:id/reconcile',(req,res,next)=>{try{const host=current(),input=z.object({status:z.enum(['sent','dropped']),platformId:z.string().optional()}).strict().parse(req.body),receipt=host.store.receipt(req.params.id);if(!receipt||receipt.status!=='pending'||!receipt.sending)throw new Error('Only uncertain sends can be reconciled after checking the platform');if(input.status==='sent')host.ledger.sent(req.params.id,input.platformId);else host.store.database.prepare("UPDATE outbox SET status='dropped',sending=0 WHERE id=?").run(req.params.id);res.json(host.store.receipt(req.params.id));}catch(error){next(error);}});
route.post('/tickets/:id/:action',(req,res,next)=>{try{const host=current(),id=z.string().min(1).parse(req.params.id),action=z.enum(['stop','retry','status','note','approve','reject']).parse(req.params.action);const result=action==='stop'?host.engine.stopTicket(id):action==='retry'?host.engine.retryTicket(id):action==='status'?host.engine.requestStatus(id):action==='approve'?host.decideApproval(id,true):action==='reject'?host.decideApproval(id,false):host.engine.note(id,z.string().min(1).parse(req.body.text));host.pass();res.json(result);}catch(error){next(error);}});
route.post('/decisions/:id/dismiss',(req,res,next)=>{try{res.json(current().engine.dismiss(req.params.id));}catch(error){next(error);}});
route.post('/triggers/:id/reevaluate',(req,res,next)=>{try{res.json({queued:current().engine.reevaluate(req.params.id)});}catch(error){next(error);}});
route.post('/migration/:action',async(req,res,next)=>{try{const host=current(),action=z.enum(['preview','apply','rollback']).parse(req.params.action),roots=z.array(z.string()).default([]).parse(req.body.roots);const migration=new SuperagentMigration(host.store,host.ownerId,host.root);if(action!=='preview')await host.store.database.backup(getDatabasePath()+'.superagent-'+Date.now()+'.bak');res.json(action==='preview'?migration.preview(roots):action==='apply'?migration.apply(roots):migration.rollback());}catch(error){next(error);}});
// Only the isolated acceptance instance exposes constructed Trigger injection, still behind owner authentication.
route.post('/test/shutdown',async(_req,res,next)=>{if(process.env.SUPERAGENT_TEST_INGRESS!=='1'){res.sendStatus(404);return;}try{await closeSuperagent();res.json({closed:true});setTimeout(()=>process.exit(0),100).unref();}catch(error){next(error);}});
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
internal.post('/mcp',async(req,res)=>{
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'')){res.sendStatus(403);return;}
 const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization??'')?.[1];if(!token){res.sendStatus(401);return;}
 try{const tools=current().mcpTools(token),{id,method,params}=req.body;if(id===undefined){res.sendStatus(202);return;}let result:unknown;
 if(method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'drover-superagent',version:'1.0.0'}};
 else if(method==='tools/list')result={tools:tools.map(tool=>tool.specification)};
 else if(method==='tools/call'){const tool=tools.find(tool=>tool.name===params?.name);if(!tool)throw new Error('Unknown or unauthorized tool');result={content:[{type:'text',text:JSON.stringify(await current().tool(token,tool.name,params.arguments))}]};}
 else if(method==='ping')result={};else throw new Error('Unsupported MCP method');res.json({jsonrpc:'2.0',id,result});
 }catch(error){res.status(400).json({jsonrpc:'2.0',id:req.body.id,error:{code:-32602,message:String(error)}});}
});
// Entrypoint mounts loopback-only, random per-turn capabilities outside browser JWT routes.
export const superagentInternalRoutes=internal;
