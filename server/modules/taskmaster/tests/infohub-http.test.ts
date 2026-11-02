import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { installAuthorizationFixture,testUserId } from '@/test-support/authorization-fixture.js';
import { withUserContext } from '@/modules/auth/index.js';
import { syncInfohubTasks,infohubLifecycle } from '../taskmaster-infohub.service.js';
import { taskmasterWorkspace } from '../taskmaster-auto.service.js';
import { infohubRecord,infohubTopics } from '../taskmaster-infohub.model.js';
installAuthorizationFixture();
test('HTTP polling deduplicates source IDs, survives upstream shutdown and keeps existing tasks',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'infohub-http-'));process.env.TASKMASTER_INBOX_ROOT=root;
 const unit={id:941,kind:'todo',status:'open',title:'HTTP integration fixture',for_me:1,updated_at:Math.floor(Date.now()/1000),tags:['project:fixture'],parents:[],messages:[]};
 const server=createServer((req,res)=>{if(req.url==='/api/task-snapshot'){res.statusCode=404;res.end('{}');return;}res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url?.startsWith('/api/units')?[unit]:req.url?.startsWith('/api/tags')?[]:unit));});server.listen(0,'127.0.0.1');await once(server,'listening');process.env.INFOHUB_BASE_URL='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 try{const online=await syncInfohubTasks(testUserId());assert.equal(online.online,true);await syncInfohubTasks(testUserId());await withUserContext(testUserId(),async()=>assert.equal((await taskmasterWorkspace.list(root,testUserId())).tasks.length,1));await new Promise<void>(resolve=>server.close(()=>resolve()));const offline=await syncInfohubTasks(testUserId());assert.equal(offline.online,false);assert.equal(offline.lastSyncedAt!==null,true);await withUserContext(testUserId(),async()=>assert.equal((await taskmasterWorkspace.list(root,testUserId())).tasks.length,1));}finally{server.close();delete process.env.INFOHUB_BASE_URL;delete process.env.TASKMASTER_INBOX_ROOT;}
});


test('already-linked dropped units still supply topics without resurrecting or rewriting their completion',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'infohub-hidden-http-'));process.env.TASKMASTER_INBOX_ROOT=root;
 const unit={id:991,kind:'todo',status:'done',title:'Historical task',for_me:1,updated_at:Math.floor(Date.now()/1000)-10,tags:[],parents:[],messages:[]};
 await withUserContext(testUserId(),()=>taskmasterWorkspace.reconcileInfohub(root,testUserId(),[infohubRecord(unit)],infohubTopics([unit])));
 let writes=0;const server=createServer((req,res)=>{if(req.url==='/api/task-snapshot'){res.statusCode=404;res.end('{}');return;}if(req.method==='POST')writes++;res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url?.startsWith('/api/units')||req.url?.startsWith('/api/tags')?[]:req.url?.startsWith('/api/unit/992')?{...unit,id:992,kind:'topic',title:'Source history topic',parents:[]}:{...unit,status:'dropped',parents:[{id:992,title:'Source history topic',kind:'topic'}]}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');process.env.INFOHUB_BASE_URL='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 try{const result=await syncInfohubTasks(testUserId());assert.equal(result.online,true);await withUserContext(testUserId(),async()=>{const task=(await taskmasterWorkspace.list(root,testUserId())).tasks[0];assert.equal(task.status,'done');assert.equal((task.infohubGrouping as {groupName:string}).groupName,'Source history topic');});assert.equal(writes,0);}
 finally{await new Promise<void>(resolve=>server.close(()=>resolve()));delete process.env.INFOHUB_BASE_URL;delete process.env.TASKMASTER_INBOX_ROOT;}
});


test('batch snapshots use one request, reuse unchanged data and detect equal-size graph replacements',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'infohub-batch-http-'));process.env.TASKMASTER_INBOX_ROOT=root;
 let version='a'.repeat(64),parentId=5002,requests=0;
 const unit={id:5001,kind:'todo',status:'open',title:'Batch task',for_me:1,updated_at:Math.floor(Date.now()/1000)-60,tags:[],parents:[],messages:[]};
 const server=createServer(async(req,res)=>{requests++;res.setHeader('content-type','application/json');if(req.url!=='/api/task-snapshot'){res.statusCode=500;res.end('{}');return;}let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
  res.end(JSON.stringify(body.known_revision===version?{schema:1,revision:version,unchanged:true}:{schema:1,revision:version,unchanged:false,units:[{...unit,parents:[{id:parentId,title:'Topic '+parentId,kind:'topic'}]}],parents:[{...unit,id:parentId,kind:'topic',title:'Topic '+parentId,parents:[]}],tags:[],missing_ids:[]}));
 });server.listen(0,'127.0.0.1');await once(server,'listening');process.env.INFOHUB_BASE_URL='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 try{
  assert.equal((await syncInfohubTasks(testUserId())).online,true);assert.equal(requests,1);
  assert.equal((await syncInfohubTasks(testUserId())).imported,0);assert.equal(requests,2);
  version='b'.repeat(64);parentId=5003;assert.equal((await syncInfohubTasks(testUserId())).online,true);assert.equal(requests,3);
  await withUserContext(testUserId(),async()=>{const tasks=(await taskmasterWorkspace.list(root,testUserId())).tasks;assert.equal(tasks.length,1);assert.equal((tasks[0].infohubGrouping as {groupName:string}).groupName,'Topic 5003');});
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));delete process.env.INFOHUB_BASE_URL;delete process.env.TASKMASTER_INBOX_ROOT;}
});

test('status writeback carries a revision and a conflict retains the local change for review',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'infohub-cas-http-'));process.env.TASKMASTER_INBOX_ROOT=root;let expected:string|undefined,changed=false;
 const unit={id:6001,kind:'todo',status:'open',title:'CAS task',for_me:1,updated_at:Math.floor(Date.now()/1000)-60,revision:'c'.repeat(64),tags:[],parents:[],messages:[]};
 const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/api/task-snapshot'){res.end(JSON.stringify({schema:1,revision:'d'.repeat(64),units:[unit],parents:[],tags:[],missing_ids:[]}));return;}
 if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;expected=JSON.parse(raw).expected_revision;res.statusCode=409;res.end(JSON.stringify({error:'changed'}));return;}res.end(JSON.stringify({...unit,revision:changed?'f'.repeat(64):unit.revision}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');process.env.INFOHUB_BASE_URL='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 try{await syncInfohubTasks(testUserId());await withUserContext(testUserId(),async()=>{const task=(await taskmasterWorkspace.list(root,testUserId())).tasks[0];await taskmasterWorkspace.changeInboxTask(root,testUserId(),String(task.id),async()=>({status:'done'}));});
 const result=await syncInfohubTasks(testUserId());assert.equal(result.online,false);assert.ok(result.error);assert.equal(expected,unit.revision);expected=undefined;changed=true;assert.equal((await syncInfohubTasks(testUserId())).online,false);assert.equal(expected,undefined,'changed revisions must be rejected before POST even within the same timestamp');
 await withUserContext(testUserId(),async()=>assert.equal((await taskmasterWorkspace.list(root,testUserId())).tasks[0].status,'done'));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));delete process.env.INFOHUB_BASE_URL;delete process.env.TASKMASTER_INBOX_ROOT;}
});


test('temporary progress read failures resume the same collection and organizer without duplicate starts',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'infohub-progress-http-'));process.env.TASKMASTER_INBOX_ROOT=root;const calls:Record<string,number>={};
 const server=createServer((req,res)=>{const key=req.url!;calls[key]=(calls[key]||0)+1;res.setHeader('content-type','application/json');
  if(key.endsWith('/status')&&calls[key]===1){res.statusCode=503;res.end('{}');return;}
  res.end(JSON.stringify(key==='/api/task-snapshot'?{schema:1,revision:'e'.repeat(64),units:[],parents:[],tags:[],missing_ids:[]}:key==='/api/collect'||key==='/api/organize'?{running:true}:{running:false,remaining:0}));
 });server.listen(0,'127.0.0.1');await once(server,'listening');process.env.INFOHUB_BASE_URL='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 try{infohubLifecycle.start(testUserId());const state=await infohubLifecycle.settled();assert.equal(state.phase,'idle');assert.equal(calls['/api/collect'],1);assert.equal(calls['/api/organize'],1);assert.equal(calls['/api/collect/status'],2);assert.equal(calls['/api/organize/status'],2);}
 finally{await infohubLifecycle.stop();await new Promise<void>(resolve=>server.close(()=>resolve()));delete process.env.INFOHUB_BASE_URL;delete process.env.TASKMASTER_INBOX_ROOT;}
});
