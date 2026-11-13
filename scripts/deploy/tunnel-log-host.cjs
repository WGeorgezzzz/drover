'use strict';
// The task owns this host; a live stdin pipe keeps headless conhost attached.
const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const rotate=require('./rotating-log.cjs');
const directory=path.resolve(process.env.TUNNEL_LOG_DIR||__dirname);
fs.mkdirSync(directory,{recursive:true});
const output=rotate(path.join(directory,'tunnel-service.log'));
const ssh=process.env.TUNNEL_SSH_EXE||'C:/Windows/System32/OpenSSH/ssh.exe';
const args=['-N','-T','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-o','ConnectTimeout=10','-R','127.0.0.1:18376:127.0.0.1:18376','root@217.216.47.235'];
let stopping=false,child,retry;
function run(){
 if(stopping)return;
 child=spawn('conhost.exe',['--headless',ssh,...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stdin.on('error',()=>{});
 child.stdout.on('data',chunk=>output.write(chunk));child.stderr.on('data',chunk=>output.write(chunk));
 const reconnect=()=>{child.stdin.destroy();if(!stopping)retry=setTimeout(run,3000);};
 child.once('exit',reconnect);
 child.once('error',error=>{output.write(Buffer.from(new Date().toISOString()+' '+error.message+'\n'));reconnect();});
}
function stop(){stopping=true;clearTimeout(retry);child?.kill();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
run();
