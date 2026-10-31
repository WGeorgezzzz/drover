import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import express from 'express';
import JSZip from 'jszip';
import { installAuthorizationFixture, testUserId } from '@/test-support/authorization-fixture.js';
import { withUserContext } from '@/modules/auth/index.js';
import { getConnection } from '@/modules/database/index.js';
import { AppError } from '@/shared/utils.js';
import { createDownloadGrants, attachmentDisposition, issueDownload, downloadRoutes } from '../downloads.js';
installAuthorizationFixture();
test('capabilities expire, reject forgery, and preserve one bound target',()=>{
 let now=1000;const grants=createDownloadGrants(()=>now);
 const a=grants.issue({userId:1,target:'a',directory:false,name:'a',validate:async p=>p});
 const b=grants.issue({userId:1,target:'b',directory:false,name:'b',validate:async p=>p});
 assert.equal(grants.get(a.url.split('/').pop()!).target,'a');
 assert.equal(grants.get(b.url.split('/').pop()!).target,'b');
 assert.throws(()=>grants.get('forged'));
 now+=120000;assert.throws(()=>grants.get(a.url.split('/').pop()!));
 assert.match(attachmentDisposition('中文.txt'),/filename\*=UTF-8''%E4%B8%AD%E6%96%87.txt/);
 assert(!attachmentDisposition('bad\r\nname').includes('\r'));
});
test('native downloads enforce permissions, preserve Chinese name and Range bytes, ZIP round trips',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'drover-download-'));
 const folder=path.join(root,'folder');fs.mkdirSync(folder);
 const target=path.join(folder,'中文.txt');fs.writeFileSync(target,'0123456789中文');
 let denied=false;
 const validate=async(p:string)=>{if(denied || !p.startsWith(root+path.sep)) throw new AppError('denied',{statusCode:403});return fs.realpathSync(p);};
 const app=express();app.use('/api/downloads',downloadRoutes);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try {
  const grant=await withUserContext(testUserId(),()=>issueDownload(target,false,validate));
  let r=await fetch(base+grant.url,{headers:{Range:'bytes=2-5'}});assert.equal(r.status,206);assert.equal(await r.text(),'2345');assert.match(r.headers.get('Content-Disposition')!,/filename\*=UTF-8''%E4/);
  r=await fetch(base+grant.url,{headers:{Range:'bytes=999-'}});assert.equal(r.status,416);assert.match(r.headers.get('Content-Range')!,/^bytes \*\//);
  r=await fetch(base+grant.url+'?path=other');assert.equal(r.status,403);
  assert.equal((await fetch(base+'/api/downloads/forged')).status,403);
  const full=await fetch(base+grant.url);assert.deepEqual(Buffer.from(await full.arrayBuffer()),fs.readFileSync(target));
  r=await fetch(base+grant.url,{method:'HEAD'});assert.equal(r.status,200);assert.equal(await r.text(),'');assert.equal(Number(r.headers.get('Content-Length')),fs.statSync(target).size);
  r=await fetch(base+grant.url,{headers:{Range:'bytes=-6'}});assert.equal(r.status,206);assert.deepEqual(Buffer.from(await r.arrayBuffer()),fs.readFileSync(target).subarray(-6));
  const zipGrant=await withUserContext(testUserId(),()=>issueDownload(folder,true,validate));
  const zip=await JSZip.loadAsync(await (await fetch(base+zipGrant.url)).arrayBuffer());assert.equal(await zip.file('中文.txt')!.async('string'),'0123456789中文');
  const outside=path.join(root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'secret.txt'),'secret');
  fs.symlinkSync(outside,path.join(folder,'escape'),process.platform==='win32'?'junction':'dir');
  r=await fetch(base+zipGrant.url);assert.equal(r.status,403,'ZIP must reject symlink escapes');
  getConnection().prepare('UPDATE users SET is_active=0 WHERE id=?').run(testUserId());
  try {r=await fetch(base+grant.url);assert.equal(r.status,403,'Existing capabilities must reject disabled users');}
  finally {getConnection().prepare('UPDATE users SET is_active=1 WHERE id=?').run(testUserId());}
  denied=true;r=await fetch(base+grant.url);assert.equal(r.status,403);
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
});

