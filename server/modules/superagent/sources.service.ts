import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { SuperagentMigration } from './migration.js';
import { nextMonitorCalendarRun } from '@/shared/index.js';
import { setMonitorSourceRegistration, setMonitorSourceHandler } from '@/modules/monitors/index.js';
import type { OutboundMessage, Trigger } from './core/index.ts';
import type { SuperagentRuntime } from './runtime.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';
import { sourceCommand } from './process-command.js';
import { githubTrigger, feishuTrigger, wechatTrigger } from './source-normalizers.js';

type SourceName='github'|'feishu'|'wechat'|'monitor';
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
// Runtime owns adapters and their cursors. No platform call happens inside an Engine transaction.
export class SuperagentSources {
  private timer:ReturnType<typeof setInterval>|undefined;
  private closing=false;
  private readonly busy=new Map<SourceName,Promise<void>>();
  private readonly status=new Map<string,unknown>();
  readonly outbox:OutboxDispatcher;
  constructor(private readonly host:SuperagentRuntime) {
    this.outbox=new OutboxDispatcher(host.store,host.ledger,{enabled:source=>this.enabled(source),actor:source=>this.actor(source),send:message=>this.send(message)});
  }
  private enabled(source:string):boolean {const settings=this.host.settings.current();return settings.enabled&&!settings.paused&&!!settings.sources[source as SourceName]?.enabled;}
  private actor(source:string):string {const sources=this.host.settings.current().sources;return source==='github'?sources.github.account:source==='feishu'?sources.feishu.userId:source==='wechat'?sources.wechat.account:'monitor';}
  start():void {
    setMonitorSourceRegistration((id,sessionId)=>{if(!this.host.settings.current().enabled)return;const ticketId=this.host.ticketForSession(sessionId);if(ticketId){this.host.store.set('migration:monitor:'+id,{ticketId,at:new Date().toISOString()});this.host.engine.followForContext(ticketId,{source:'monitor',id});}else if(sessionId!==this.host.store.get('master-session'))new SuperagentMigration(this.host.store,this.host.ownerId,this.host.root).apply([]);});
    setMonitorSourceHandler((id,event)=>{if(!this.ownsMonitor(id))return;const at=String(event.at??new Date().toISOString());this.receive({id:'monitor:'+id+':'+digest(JSON.stringify([event.at,event.signature,event.type])),source:'monitor',threads:[{source:'monitor',id}],actor:{source:'monitor',id:'probe'},human:false,at,text:JSON.stringify(event),meta:{monitorId:id,probe:true}});},id=>this.ownsMonitor(id));
    this.timer=setInterval(()=>this.pass(),5000);this.timer.unref();this.pass();
  }
  private ownsMonitor(id:string):boolean{const scope=this.host.settings.current().sources.monitor.conversations;return this.enabled('monitor')&&(!scope.length||scope.includes(id))&&!!this.host.store.get('migration:monitor:'+id);}
  snapshot():Record<string,unknown>{return Object.fromEntries(this.status);}
  pass():void {
    if(this.closing)return;
    for(const source of ['github','feishu','wechat','monitor'] as const){if(!this.enabled(source)||this.busy.has(source))continue;if(!this.host.store.get('cursor:initial:'+source))this.host.store.set('cursor:initial:'+source,new Date(Date.now()-60000).toISOString());const operation=(async()=>{try{await (source==='github'?this.github():source==='feishu'?this.feishu():source==='wechat'?this.wechat():this.monitor());this.status.set(source,{state:'ready',at:new Date().toISOString()});}catch(error){this.status.set(source,{state:'setup_or_error',error:String(error),at:new Date().toISOString()});}})().finally(()=>this.busy.delete(source));this.busy.set(source,operation);}
    void this.outbox.pass().catch(error=>this.status.set('outbox',{state:'error',error:String(error)}));
  }
  private receive(trigger:Trigger):void{const result=this.host.ingress.receive(trigger);this.host.store.set('source:last:'+trigger.source,{id:trigger.id,result,at:new Date().toISOString()});}
  private async command(file:string,args:string[],env:NodeJS.ProcessEnv={},timeout?:number) {const result=await sourceCommand(this.host.root,file,args,env,timeout);if(result.code!==0)throw new Error('CLI '+file.split(/[\\/]/).at(-1)+' exited '+result.code+': '+(result.stderr||result.error||'no diagnostic').slice(-3000));return result;}
  private async gh(endpoint:string,extra:string[]=[]):Promise<unknown> {
    const result=await this.command(this.host.settings.current().sources.github.cli,['api',endpoint,...extra]);return JSON.parse(result.stdout);
  }
  private async github():Promise<void> {
    const config=this.host.settings.current().sources.github;
    const me=z.object({login:z.string()}).parse(await this.gh('user'));if(me.login.toLowerCase()!==config.account.toLowerCase())throw new Error('GitHub identity differs from configured human account');
    const repositories=config.conversations.length?config.conversations:[config.repository];
    for(const repository of repositories){if(!/^WGeorgezzzz\/[\w.-]+$/i.test(repository))throw new Error('Repository must belong to WGeorgezzzz');
      const key='cursor:github:'+repository,since=this.host.store.get<string>(key)??this.host.store.get<string>('cursor:initial:github')!,until=new Date().toISOString();
      // Never advance the cursor until every issue/comment page is durable.
      for(const kind of ['issues','issues/comments'])for(let page=1;page<=100;page++){
        const endpoint='repos/'+repository+'/'+kind+'?state=all&sort=updated&direction=asc&since='+encodeURIComponent(since)+'&per_page=100&page='+page;
        const items=z.array(z.unknown()).parse(await this.gh(endpoint));
        for(const value of items){let number:number|undefined;if(kind==='issues/comments'){const comment=value as {issue_url?:string};number=Number(comment.issue_url?.split('/').at(-1));if(!number)throw new Error('Comment issue URL missing');}const trigger=githubTrigger(repository,value,number);this.receive(trigger);
          const issue=value as {number?:number;state?:string;closed_at?:string;pull_request?:unknown};if(!number&&issue.state==='closed')this.host.engine.threadClosed({source:'github',id:repository+'#'+issue.number},'closed',issue.closed_at??until);
        }
        if(items.length<100)break;if(page===100)throw new Error('GitHub pagination limit reached; cursor retained');
      }
      this.host.store.set(key,until);
    }
  }
  private larkEnvironment(bot:boolean):NodeJS.ProcessEnv {return {LARKSUITE_CLI_NO_UPDATE_NOTIFIER:'1',LARKSUITE_CLI_NO_SKILLS_NOTIFIER:'1',...(bot?{LARKSUITE_CLI_CONFIG_DIR:this.host.settings.current().sources.feishu.configDir}:{})};}
  private async lark(args:string[],bot:boolean,timeout?:number):Promise<unknown> {const result=await this.command(this.host.settings.current().sources.feishu.cli,args,this.larkEnvironment(bot),timeout);const parsed=JSON.parse(result.stdout) as {ok?:boolean;data?:unknown};if(parsed.ok===false)throw new Error('Lark operation rejected');return parsed.data??parsed;}
  private historyItem(value:unknown,chatId:string):Trigger|undefined {
    const item=value as Record<string,any>;if(item.deleted)return;const sender=item.sender??{};
    return feishuTrigger({message_id:item.message_id,chat_id:item.chat_id??chatId,sender_id:sender.id??sender.open_id??item.sender_id,sender_type:sender.sender_type??item.sender_type??'user',content:item.body?.content??item.content??'',create_time:item.create_time,chat_type:'p2p',...item.root_id?{root_id:item.root_id}:{},...item.thread_id?{thread_id:item.thread_id}:{}});
  }
  private async feishu():Promise<void> {
    const config=this.host.settings.current().sources.feishu;if(!config.configDir||!existsSync(config.configDir))throw new Error('Configure independent bot-only Lark directory first');
    const strict=await this.command(config.cli,['config','strict-mode'],this.larkEnvironment(true));if(!/bot/.test(strict.stdout))throw new Error('Receiving Lark configuration must enforce bot strict mode');
    const result=await this.command(config.cli,['event','consume','im.message.receive_v1','--as','bot','--timeout','20s'],this.larkEnvironment(true),45000);
    if(!/ready/i.test(result.stderr))throw new Error('Feishu event consumer did not confirm readiness');
    for(const line of result.stdout.split(/\r?\n/).filter(Boolean)){const envelope=JSON.parse(line),data=envelope.data??envelope.event??envelope;const trigger=feishuTrigger(data);this.receive(trigger);this.host.store.set('feishu-chat:'+trigger.channel!.thread,true);}
    const chats=new Set([...config.conversations,...(this.host.store.database.prepare("SELECT key FROM kv WHERE key LIKE 'feishu-chat:%'").all() as {key:string}[]).map(row=>row.key.slice('feishu-chat:'.length))]);
    for(const chatId of chats){const key='cursor:feishu:'+chatId,since=this.host.store.get<string>(key)??this.host.store.get<string>('cursor:initial:feishu')!,until=new Date().toISOString();const page=await this.lark(['im','+chat-messages-list','--as','bot','--chat-id',chatId,'--start',since,'--end',until,'--order','asc','--page-all','--page-limit','100','--no-reactions'],true) as Record<string,any>;if(page.has_more||page.truncated||page.truncations?.length)throw new Error('Feishu history incomplete; cursor retained');for(const item of page.items??page.messages??[]){const trigger=this.historyItem(item,chatId);if(trigger)this.receive(trigger);}this.host.store.set(key,until);}
    // Topic subscriptions are checked independently of event delivery for missed replies.
    for(const thread of this.host.store.threads.list().filter(thread=>thread.ref.source==='feishu'&&thread.subscriptions.length&&thread.meta.threadId)){const page=await this.lark(['im','+threads-messages-list','--as','bot','--thread',String(thread.meta.threadId),'--page-all','--no-reactions'],true) as Record<string,any>;if(page.has_more)throw new Error('Feishu topic history incomplete');for(const item of page.items??page.messages??[]){const trigger=this.historyItem(item,String(thread.meta.chatId));if(trigger)this.receive(trigger);}}
  }
  private async wechat():Promise<void> {
    const config=this.host.settings.current().sources.wechat;if(!config.python||!config.script)throw new Error('Configure installed wechat-skill runtime');
    for(const chat of config.conversations){const key='cursor:wechat:'+chat,since=this.host.store.get<string>(key)??this.host.store.get<string>('cursor:initial:wechat')!,until=new Date().toISOString();const result=await this.command(config.python,['-X','utf8',config.script,'dump-chat','--chat',chat,'--since',since,'--until',until,'--number','20000']);const page=JSON.parse(result.stdout) as Record<string,any>;if(page.has_more||page.coverage?.complete!==true||page.coverage?.failures?.length||page.coverage?.decode_errors)throw new Error('WeChat database coverage incomplete; cursor retained');for(const item of page.records??[])this.receive(wechatTrigger(chat,item));this.host.store.set(key,until);}
  }
  private async monitor():Promise<void> {
    const db=this.host.store.database,now=new Date();
    for(const row of db.prepare("SELECT * FROM monitors WHERE user_id=? AND status='active' AND running_id IS NULL").all(this.host.ownerId) as Record<string,any>[]){if(!this.host.store.get('migration:monitor:'+row.id)){const ticketId=this.host.ticketForSession(row.session_id),scope=this.host.settings.current().sources.monitor.conversations;if(ticketId&&(!scope.length||scope.includes(row.id))){this.host.store.set('migration:monitor:'+row.id,{ticketId,at:now.toISOString()});this.host.engine.followForContext(ticketId,{source:'monitor',id:row.id});}}if(!this.ownsMonitor(row.id))continue;
      if(row.last_event_json){const event=JSON.parse(row.last_event_json),at=String(event.at??now.toISOString());this.receive({id:'monitor:'+row.id+':'+digest(JSON.stringify([event.at,event.signature,event.type])),source:'monitor',threads:[{source:'monitor',id:row.id}],actor:{source:'monitor',id:'probe'},human:false,at,text:JSON.stringify(event),meta:{monitorId:row.id,probe:true}});db.prepare('UPDATE monitors SET last_event_json=NULL WHERE id=? AND last_event_json=?').run(row.id,row.last_event_json);}
      if(row.monitor_mode!=='event'){const key='monitor-clock:'+row.id,next=this.host.store.get<string>(key)??row.next_run_at;if(next>now.toISOString())continue;this.host.store.atomic(()=>{this.receive({id:'monitor:'+row.id+':clock:'+next,source:'monitor',threads:[{source:'monitor',id:row.id}],actor:{source:'monitor',id:'clock'},human:false,at:now.toISOString(),text:row.content,meta:{monitorId:row.id,scheduledAt:next}});this.host.store.set(key,row.schedule_json?nextMonitorCalendarRun(JSON.parse(row.schedule_json),now).toISOString():new Date(now.getTime()+row.interval_minutes*60000).toISOString());});}
    }
    const {pollMonitorProbes}=await import('@/modules/monitors/index.js');await pollMonitorProbes(now,true);
  }
  private async send(message:OutboundMessage):Promise<{platformId?:string}> {
    const {channel,text}=message;
    const meta=channel.source==='github'?{repository:channel.address.repository}:channel.source==='feishu'?{chatId:channel.address.chatId}:{conversation:channel.address.chat};
    if(!this.host.settings.scope.scope({source:channel.source,meta}).listened)throw Object.assign(new Error('Reply destination is outside current source scope'),{definitelyNotSent:true});
    if(channel.source==='github'){const repository=channel.address.repository,number=channel.address.number;if(!repository||!number)throw Object.assign(new Error('Missing original GitHub address'),{definitelyNotSent:true});const result=await this.gh('repos/'+repository+'/issues/'+number+'/comments',['--method','POST','-f','body='+text]) as {id:number};if(!result.id)throw new Error('GitHub send returned no comment ID');return {platformId:String(result.id)};}
    if(channel.source==='feishu'){const result=await this.lark(['im','+messages-send','--as','user','--chat-id',channel.address.chatId,'--text',text,'--idempotency-key',digest(message.id).slice(0,40)],false) as Record<string,any>;if(!result.message_id)throw new Error('Feishu send returned no message ID');return {platformId:String(result.message_id)};}
    if(channel.source==='wechat'){const config=this.host.settings.current().sources.wechat;await this.command(config.python,['-X','utf8',config.script,'send-message','--to',channel.address.chat,'--message',text],{},60000);return {};}
    throw Object.assign(new Error('Unsupported reply channel'),{definitelyNotSent:true});
  }
  async close():Promise<void>{this.closing=true;if(this.timer)clearInterval(this.timer);setMonitorSourceHandler(undefined);setMonitorSourceRegistration(undefined);await Promise.allSettled([...this.busy.values()]);await this.outbox.drain();}
}
