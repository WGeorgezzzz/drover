import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {searchIndexedFilePaths} from '../indexed-file-search.js';

test('indexed lookup validates scope, literal suffix, exclusions and all ambiguous matches', async () => {
 const root=await mkdtemp(path.join(os.tmpdir(),'drover-index-'));
 const files=['one/paper-v[10]/main.pdf','two/paper-v[10]/main.pdf','node_modules/paper-v[10]/main.pdf','one/not-paper-v[10]/main.pdf'];
 try {
  for(const file of files){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),'pdf');}
  let args:string[]=[];
  const result=await searchIndexedFilePaths(root,'paper-v[10]/main.pdf',['node_modules'],async input=>{args=input;return files.map(file=>path.join(root,file)).join('\r\n');});
  assert.deepEqual(result?.files.map(f=>f.path).sort(),files.slice(0,2).map(f=>path.join(root,f)).sort());
  assert.equal(result?.truncated,false);
  assert(args.includes('-regex'));
  assert(args.includes('^main\\.pdf$'));
  assert(args.includes('-no-match-path'));
  assert.equal(await searchIndexedFilePaths(root,'paper-v[10]/main.pdf',[],async()=>path.join(root,'../outside/paper-v[10]/main.pdf')),null);
 } finally {await rm(root,{recursive:true,force:true});}
});

test('unavailable, stale, empty or capped indexes fall back instead of claiming uniqueness', async () => {
 const root=await mkdtemp(path.join(os.tmpdir(),'drover-index-'));
 try {
  for(const output of ['',path.join(root,'missing.pdf'),Array(101).fill(path.join(root,'missing.pdf')).join('\n')]){
   assert.equal(await searchIndexedFilePaths(root,'missing.pdf',[],async()=>output),null);
  }
  assert.equal(await searchIndexedFilePaths(root,'missing.pdf',[],async()=>{throw Error('IPC unavailable');}),null);
 } finally {await rm(root,{recursive:true,force:true});}
});
