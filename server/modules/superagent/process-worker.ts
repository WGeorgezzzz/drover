import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// Dedicated headless child. It never receives or prints credentials in command arguments.
const job=JSON.parse(readFileSync(process.argv[2],'utf8')) as {file:string;args:string[];env:NodeJS.ProcessEnv;timeout:number;cwd:string};
const result=spawnSync(job.file,job.args,{env:{...process.env,...job.env},cwd:job.cwd,encoding:'utf8',windowsHide:true,timeout:job.timeout,maxBuffer:8*1024*1024});
writeFileSync(process.argv[2]+'.tmp',JSON.stringify({code:result.status,stdout:result.stdout??'',stderr:result.stderr??'',error:result.error?.message}));renameSync(process.argv[2]+'.tmp',process.argv[2]+'.result');
