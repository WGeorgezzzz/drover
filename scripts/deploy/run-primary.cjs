const fs=require('fs'),path=require('path'),http=require('http'),{spawn}=require('child_process');
const cfgPath=__dirname+'/primary-service.json',rotate=require('./rotating-log.cjs');
const healthy=port=>new Promise(resolve=>{const r=http.get({hostname:'127.0.0.1',port,path:'/health',agent:false,timeout:2000},res=>{res.resume();resolve(res.statusCode===200);});r.on('error',()=>resolve(false));r.on('timeout',()=>r.destroy());});
(async()=>{
 const cfg=JSON.parse(fs.readFileSync(cfgPath)),lock=__dirname+'/primary-launch.lock';
 if(await healthy(cfg.port)){console.log('Healthy primary already listening; duplicate launcher exits.');return;}
 let fd;try{fd=fs.openSync(lock,'wx');}catch{try{const old=JSON.parse(fs.readFileSync(lock));process.kill(old.pid,0);return;}catch{fs.unlinkSync(lock);fd=fs.openSync(lock,'wx');}}
 fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));
 const cleanup=()=>{try{fs.closeSync(fd);fs.unlinkSync(lock);}catch{}};process.on('exit',cleanup);
 if(await healthy(cfg.port))return;
 const access=JSON.parse(fs.readFileSync(__dirname+'/access-application.json'));
 const out=rotate(__dirname+'/primary-server.log'),err=rotate(__dirname+'/primary-error.log');
 const launchedAt=Date.now();
 const child=spawn('conhost.exe',['--headless',process.execPath,...(cfg.useEnvProxy?['--use-env-proxy']:[]),path.join(cfg.runtime,'dist-server/server/modules/cli/cli.js'),'start'],{cwd:cfg.runtime,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,...cfg.runtimeEnvironment,HOST:'127.0.0.1',SERVER_PORT:String(cfg.port),DATABASE_PATH:cfg.database,CLOUDCLI_HOME:cfg.home,CLOUDCLI_DISTRIBUTION:'workbench',CLOUDCLI_WORKBENCH_VERSION:cfg.version,CLOUDCLI_INSTANCE_ID:cfg.instanceId,CLAUDEX_LOCAL_IDENTITY:'1',CLAUDEX_PRIVATE_GATE:'1',CLAUDEX_PUBLIC_HOST:access.domain,CLAUDEX_ACCESS_TEAM:access.team,CLAUDEX_ACCESS_AUD:access.aud,CLAUDEX_ACCESS_EMAILS:access.email,CLAUDEX_ACCESS_SSO_EMAIL:access.ssoEmail||'',CLAUDE_CONFIG_DIR:path.join(process.env.USERPROFILE,'.claude-cc'),CLAUDE_CLI_PATH:cfg.legacy+'/wenclaude-cli.js'}});
 child.stdin.on('error',()=>{});child.stdout.on('data',x=>out.write(x));child.stderr.on('data',x=>err.write(x));
 const ready=setInterval(()=>{try{const marker=JSON.parse(fs.readFileSync(path.join(cfg.home,'local-server.json')));if(Date.parse(marker.updatedAt)>=launchedAt&&path.resolve(marker.appRoot).toLowerCase()===path.resolve(cfg.runtime).toLowerCase()&&marker.port===cfg.port){process.kill(marker.pid,0);const latest=JSON.parse(fs.readFileSync(cfgPath));fs.writeFileSync(cfgPath,JSON.stringify({...latest,pid:marker.pid},null,2));clearInterval(ready);}}catch{}},300);
 child.once('exit',code=>{clearInterval(ready);child.stdin.destroy();cleanup();process.exitCode=code??1;});child.once('error',e=>{clearInterval(ready);cleanup();console.error(e);process.exitCode=1;});
})().catch(e=>{console.error(e);process.exitCode=1;});
