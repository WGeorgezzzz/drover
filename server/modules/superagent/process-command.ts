import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Sources and Outbox run bounded CLI calls behind conhost so no Windows Terminal opens.
export async function sourceCommand(root:string,file:string,args:string[],env:NodeJS.ProcessEnv={},timeout=45000,cwd=root):Promise<{code:number|null;stdout:string;stderr:string;error?:string}> {
  const directory=await mkdtemp(join(root,'command-')),job=join(directory,'job.json');
  await writeFile(job,JSON.stringify({file,args,env,timeout,cwd}));
  const worker=fileURLToPath(new URL('./process-worker.js',import.meta.url));
  const child=process.platform==='win32'?spawn('conhost.exe',['--headless',process.execPath,worker,job],{stdio:'ignore',windowsHide:true}):spawn(process.execPath,[worker,job],{stdio:'ignore'});
  let launchError:Error|undefined;child.on('error',error=>{launchError=error;});
  try {const until=Date.now()+timeout+10000;while(Date.now()<until){if(launchError)throw launchError;try{return JSON.parse(await readFile(job+'.result','utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Headless CLI timeout');}finally{await rm(directory,{recursive:true,force:true});}
}
