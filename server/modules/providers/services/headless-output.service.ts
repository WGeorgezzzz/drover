import { spawn, type SpawnOptions } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, openSync, closeSync, readSync, rmSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// File descriptors preserve exact provider NDJSON; a pseudoterminal would add terminal control bytes.
export function spawnHeadlessOutput(file:string,args:string[],options:SpawnOptions){
 if(process.platform!=='win32')return spawn(file,args,{...options,windowsHide:true});
 const root=mkdtempSync(join(tmpdir(),'drover-headless-'));
 writeFileSync(join(root,'job.json'),JSON.stringify({file,args,cwd:options.cwd}));
 const script=join(root,'run.cjs');
 writeFileSync(script,"const fs=require('fs'),p=require('path'),cp=require('child_process'),r=__dirname,j=JSON.parse(fs.readFileSync(p.join(r,'job.json'),'utf8')),o=fs.openSync(p.join(r,'stdout'),'a'),e=fs.openSync(p.join(r,'stderr'),'a');const c=cp.spawnSync(j.file,j.args,{cwd:j.cwd,env:process.env,windowsHide:true,stdio:['ignore',o,e]});if(c.error)fs.writeSync(e,String(c.error));fs.closeSync(o);fs.closeSync(e);fs.writeFileSync(p.join(r,'exit.json'),JSON.stringify({code:c.status??1}));process.exitCode=c.status??1;");
 const outFile=join(root,'stdout'),errFile=join(root,'stderr');writeFileSync(outFile,'');writeFileSync(errFile,'');
 const out=new PassThrough(),err=new PassThrough();const handles=[openSync(outFile,'r'),openSync(errFile,'r')],positions=[0,0];
 const flush=()=>{for(let index=0;index<2;index++){const buffer=Buffer.alloc(65536);let count;while((count=readSync(handles[index],buffer,0,buffer.length,positions[index]))>0){positions[index]+=count;(index?err:out).write(buffer.subarray(0,count));}}};
 const child=spawn('conhost.exe',['--headless',process.execPath,script],{...options,stdio:'pipe',windowsHide:true});child.stdout?.resume();child.stderr?.resume();Object.defineProperty(child,'stdout',{value:out});Object.defineProperty(child,'stderr',{value:err});
 // conhost can return zero for a failed hosted command. Publish the actual
 // command status before exit/close listeners determine turn success.
 const emit=child.emit;let result:number|null=null;
 child.emit=function(event:string|symbol,...values:any[]){
  if(event==='exit'||event==='close'){
   if(result===null){try{result=Number(JSON.parse(readFileSync(join(root,'exit.json'),'utf8')).code);}catch{result=typeof values[0]==='number'&&values[0]!==0?values[0]:1;}}
   values[0]=result;Object.defineProperty(child,'exitCode',{value:result,writable:true,configurable:true});
  }
  return Reflect.apply(emit,this,[event,...values]);
 };
 const timer=setInterval(flush,100);let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;clearInterval(timer);flush();out.end();err.end();handles.forEach(closeSync);rmSync(root,{recursive:true,force:true});};child.prependOnceListener('close',cleanup);return child;
}
