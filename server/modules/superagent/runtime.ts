import { existsSync } from 'node:fs';
import { createTicketWorktree } from '@/modules/worktrees/index.js';
import { sourceCommand } from './process-command.js';
import { SuperagentPrompts } from './prompts.js';
import { z } from 'zod';
import { setCompatibilityReceiver } from './compatibility.js';
import { SuperagentSources } from './sources.service.js';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { withUserContext } from '@/modules/auth/index.js';
import { getConnection, getDatabasePath } from '@/modules/database/index.js';
import { providerRuntimeService, sessionsService } from '@/modules/providers/index.js';
import type { AnyRecord, LLMProvider } from '@/shared/types.js';
import { Engine, latestAssignment, ticketStage } from './core/index.ts';
import type { Candidate, Outcome, ReplyRequest, WorkerReport } from './core/index.ts';
import { SuperagentStore } from './store.js';
import { SuperagentSettings } from './settings.js';
import { OutboundLedger } from './outbound-ledger.js';
import { SourceIngress } from './source-ingress.js';
import { createSuperagentProviderTools, parseSuperagentTool } from './provider-tools.js';

export class SuperagentRuntime {
  readonly store=new SuperagentStore(getConnection());
  readonly settings=new SuperagentSettings(this.store);
  readonly prompts=new SuperagentPrompts(this.store);
  readonly ledger=new OutboundLedger(this.store);
  readonly engine:Engine;
  readonly ingress:SourceIngress;
  readonly sources:SuperagentSources;
  private readonly capabilities=new Map<string,{role:'worker'|'orchestrator';ticketId?:string;assignmentId?:string}>();
  private readonly active=new Map<string,{sessionId:string;provider:LLMProvider}>();
  private timer:ReturnType<typeof setInterval>|undefined;
  private masterBusy=false;
  private masterSessionId:string|undefined;
  private readonly inFlight=new Set<Promise<unknown>>();
  private readonly delivering=new Set<number>();
  private stopped=false;
  readonly root=join(dirname(getDatabasePath()),'superagent');
  constructor(readonly ownerId:number,private readonly endpoint:string) {
    mkdirSync(this.root,{recursive:true});
    this.engine=new Engine({repo:this.store,scope:this.settings.scope,policy:()=>this.settings.policy(),outbox:this.store,
      assessor:{request:c=>this.store.enqueue('eval',c.evalId,c)},
      executor:{start:(t,a)=>this.store.enqueue('launch',a.id,{ticketId:t.id,assignmentId:a.id}),deliver:(t,a)=>this.store.enqueue('delivery',a.id+':'+t.undelivered.join(','),{ticketId:t.id,assignmentId:a.id}),stop:(t,a,reason)=>this.store.enqueue('stop',a.id,{ticketId:t.id,reason})},
      prepareTicket:(t,o)=>({...t,execution:{name:t.id,directory:join(this.root,'work',t.id),assignment:o.scope}}),
      emit:event=>this.store.enqueue('notice',event.type+':'+event.at+':'+JSON.stringify(event.data),event)});
    this.ingress=new SourceIngress(this.engine,this.ledger);
    this.sources=new SuperagentSources(this);
  }
  start():void {
    setCompatibilityReceiver(trigger=>{const sessionId=String(trigger.meta.sessionId??'');if(sessionId&&(sessionId===this.store.get('master-session')||this.store.database.prepare("SELECT 1 FROM kv WHERE key LIKE 'worker-session:%' AND value=?").get(JSON.stringify(sessionId))))return;return this.ingress.receive(trigger);});
    this.sources.start();
    for(const ticket of this.store.tickets.list().reverse()) {
      const assignment=latestAssignment(ticket);
      if(assignment?.state==='running')this.engine.assignmentInterrupted(ticket.id,assignment.id);
      const pending=latestAssignment(this.store.tickets.get(ticket.id)!);
      if(pending?.state==='pending')this.store.enqueue('launch',pending.id,{ticketId:ticket.id,assignmentId:pending.id});
    }
    if(this.timer)return;
    this.timer=setInterval(()=>{try{this.pass();}catch(error){console.error('[Superagent]',String(error));}},1000);this.timer.unref();this.pass();
  }
  pass():void {
    if(this.stopped)return;
    if(!this.settings.current().enabled)return;
    this.engine.evaluateDue();
    for(const effect of this.store.effects()) {
      const ticketId=String(effect.payload.ticketId??'');
      if(effect.kind==='launch'&&!this.settings.policy().paused&&this.active.size<this.settings.current().workers+(this.store.tickets.get(ticketId)?.undelivered.some(id=>this.store.tickets.get(ticketId)?.inputs.some(input=>input.id===id&&input.kind==='trigger'&&input.human))?1:0)) {
        const ticket=this.store.tickets.get(ticketId),assignment=ticket&&latestAssignment(ticket);
        if(!ticket||!assignment||ticket.ended||assignment.id!==effect.payload.assignmentId||assignment.state==='ended'){this.store.complete(effect.position);continue;}
        if(this.active.has(ticketId))continue;
        this.track(this.launch(ticketId,assignment.id,effect.position).catch(error=>this.store.fail(effect.position,error))); 
      }else if((effect.kind==='eval'||effect.kind==='relay')&&!this.masterBusy&&!this.settings.policy().paused) {
        this.masterBusy=true;
        this.track(this.master(effect.kind,effect.payload).then(()=>this.store.complete(effect.position),error=>this.store.fail(effect.position,error)).finally(()=>{this.masterBusy=false;}));
      }else if(effect.kind==='stop') {
        const active=this.active.get(ticketId);if(active)void providerRuntimeService.abort(active.provider,active.sessionId);
        this.store.complete(effect.position);
      }else if(effect.kind==='notice'){
        this.store.set('notice:last',effect.payload);this.store.complete(effect.position);
      }
      else if(effect.kind==='delivery'&&!this.settings.policy().paused) {
        const active=this.active.get(ticketId);
        if(active&&!this.delivering.has(effect.position)){
          const ticket=this.store.tickets.get(ticketId),assignment=ticket&&latestAssignment(ticket);
          if(!ticket||!assignment||ticket.ended||assignment.id!==effect.payload.assignmentId){this.store.complete(effect.position);continue;}
          const ids=[...ticket.undelivered];
          if(!ids.length){this.store.complete(effect.position);continue;}
          this.delivering.add(effect.position);
          try{withUserContext(this.ownerId,()=>providerRuntimeService.submitLiveInput(active.provider,active.sessionId,'superagent:'+effect.position,JSON.stringify({inputs:ticket.inputs.filter(input=>ids.includes(input.id)),triggers:ticket.inputs.filter(input=>ids.includes(input.id)&&input.kind==='trigger').map(input=>input.kind==='trigger'?this.store.triggers.get(input.triggerId):null)}),result=>{
            this.delivering.delete(effect.position);
            if(result.status==='succeeded'){this.engine.inputsDelivered(ticketId,assignment.id,ids);this.engine.inputsRead(ticketId,ids);this.store.complete(effect.position);}
            else {this.engine.deliveryFailed(ticketId,assignment.id,result.error??result.status);this.store.fail(effect.position,result.error??result.status);}
          }));}catch(error){this.delivering.delete(effect.position);this.store.fail(effect.position,error);}
        }else if(!active) {
          const ticket=this.store.tickets.get(ticketId),assignment=ticket&&latestAssignment(ticket);
          if(ticket&&!ticket.ended&&assignment?.state==='running'){if(this.active.size>=this.settings.current().workers+Number(ticket.undelivered.some(id=>ticket.inputs.some(input=>input.id===id&&input.kind==='trigger'&&input.human))))continue;this.track(this.launch(ticketId,assignment.id,effect.position).catch(error=>this.store.fail(effect.position,error)));}
          else this.store.complete(effect.position);
        }
      }
    }
  }
  ticketForSession(sessionId:string):string|undefined {return [...this.active].find(([,value])=>value.sessionId===sessionId)?.[0];}
  configureExecutor(ticketId:string,input:unknown){const ticket=this.store.tickets.get(ticketId);if(!ticket)throw new Error('Ticket not found');if(this.active.has(ticketId))throw new Error('Stop or wait for the current turn first');const value=z.object({provider:z.enum(['codex','claude','deepseek-harness']),model:z.string().min(1),effort:z.string().default('high')}).strict().parse(input);this.store.set('executor:'+ticketId,value);return value;}
  snapshot() {return {prompts:{orchestrator:this.prompts.read('orchestrator'),worker:this.prompts.read('worker')},sources:this.sources.snapshot(),settings:this.settings.current(),revision:this.settings.revision(),tickets:this.store.tickets.list().map(ticket=>({...ticket,stage:ticketStage(ticket),executor:this.store.get('executor:'+ticket.id)})),threads:this.store.threads.list(),decisions:this.store.list('decision'),outbox:this.store.outbox(),effects:this.store.effects(),active:[...this.active.keys()]};}
  mcpTools(token:string){const capability=this.capabilities.get(token);if(!capability)throw new Error('Expired capability');return createSuperagentProviderTools({endpoint:this.endpoint,token,role:capability.role});}
  async tool(token:string,name:string,input:unknown):Promise<unknown> {
    const capability=this.capabilities.get(token);if(!capability)throw new Error('Expired capability');
    const args=parseSuperagentTool(name,input) as AnyRecord;
    this.store.set('tool:last:'+name,{at:new Date().toISOString(),role:capability.role,ticketId:capability.ticketId,arguments:args});
    if(capability.role==='orchestrator') {
      if(name==='orchestrator_read')return args.resource&&this.store.tickets.get(args.resource)?{ticket:this.store.tickets.get(args.resource)}:this.snapshot();
      if(name==='orchestrator_ticket_attach')return this.engine.attach(args.ticketId,args.triggerId,args.note);
      if(name==='orchestrator_ticket_note')return this.engine.note(args.ticketId,args.text);
      if(name==='orchestrator_ticket_request_status')return this.engine.requestStatus(args.ticketId);
      if(name==='orchestrator_unsubscribe')return this.engine.unsubscribe(args.thread);
      if(name==='orchestrator_eval_decide') {
        const candidate=this.engine.candidate(args.triggerId);
        if(!candidate||candidate.evalId!==args.evalId)throw new Error('Stale evaluation');
        let outcome=args as Outcome;
        if(args.kind==='accept'&&candidate.strength==='inferred'&&this.settings.current().mode==='observe')outcome={kind:'ignore',evalId:args.evalId,reason:args.reason,audit:{verdict:'would_accept',proposed:args}};
        return this.engine.decide(args.triggerId,outcome);
      }
      if(name==='orchestrator_reply')return this.store.atomic(()=>{const ticket=this.store.tickets.get(args.ticketId);if(!ticket)throw new Error('Ticket not found');const key='result-reply:'+args.ticketId+':'+(latestAssignment(ticket!)?.id??'')+':'+(ticket?.ended?.at??latestAssignment(ticket!)?.report?.at??'');const previous=args.purpose==='result'?this.store.get<{id:string}>(key):undefined;if(previous)return {...previous,status:this.store.status(previous.id),reused:true};const result=this.engine.reply(args as ReplyRequest);if(args.purpose==='result')this.store.set(key,result);return result;});
      throw new Error('Tool is unavailable to orchestrator');
    }
    const ticketId=capability.ticketId!,ticket=this.store.tickets.get(ticketId),assignment=ticket&&latestAssignment(ticket);
    if(!ticket||!assignment||ticket.ended||assignment.id!==capability.assignmentId||assignment.state!=='running')throw new Error('Assignment ended');
    if(name==='orchestrator_read'){this.engine.inputsRead(ticketId,ticket.inputs.map(input=>input.id));return {ticket,triggers:ticket.inputs.filter(i=>i.kind==='trigger').map(i=>this.store.triggers.get(i.triggerId))};}
    if(name==='orchestrator_report') {
      const result=this.engine.report(ticketId,args as WorkerReport);
      if(args.state!=='progress')this.store.enqueue('relay',assignment.id+':'+result.updatedAt,{ticketId,report:args});
      return result;
    }
    if(name==='orchestrator_ack')return this.engine.reply({purpose:'acknowledgement',ticketId,triggerId:args.triggerId,text:args.text});
    if(name==='orchestrator_thread_follow')return this.engine.followForContext(ticketId,{source:args.source,id:args.thread});
    if(name==='orchestrator_thread_unrelated')return this.engine.markUnrelated(ticketId,args.thread,args.reason);
    if(name==='orchestrator_trigger_handback')return this.engine.handback(ticketId,args.triggerId,args.reason);
    throw new Error('Tool is unavailable to worker');
  }
  private capability(role:'worker'|'orchestrator',ticketId?:string,assignmentId?:string) {
    const token=randomBytes(32).toString('hex');this.capabilities.set(token,{role,ticketId,assignmentId});
    return {endpoint:this.endpoint,token,role};
  }
  private async run(provider:LLMProvider,sessionId:string,cwd:string,model:string,prompt:string,capability:ReturnType<SuperagentRuntime['capability']>,delivered:()=>void=()=>{},effort=this.settings.current().effort):Promise<void> {
    let failed='',didDeliver=false;
    try {
      await withUserContext(this.ownerId,()=>providerRuntimeService.run(provider,prompt,{sessionId,cwd,projectPath:cwd,model,effort,permissionMode:'bypassPermissions',cloudcliSuperagent:capability},{userId:this.ownerId,send:frame=>{const data=frame as AnyRecord;if(!didDeliver&&['text','tool_use','tool_result'].includes(data.kind)){didDeliver=true;delivered();}if(['error','complete'].includes(data.kind))this.store.set('provider:last:'+sessionId,{at:new Date().toISOString(),kind:data.kind,content:data.content??data.text,exitCode:data.exitCode,aborted:data.aborted});if(data.kind==='error'||data.kind==='complete'&&(data.exitCode||data.aborted))failed=String(data.content??data.text??'Provider turn failed');}}));
      if(failed)throw new Error(failed);
    }finally{this.capabilities.delete(capability.token);}
  }
  private async launch(ticketId:string,assignmentId:string,position:number):Promise<void> {try{await this.launchTurn(ticketId,assignmentId,position);}finally{this.active.delete(ticketId);}}
  private async launchTurn(ticketId:string,assignmentId:string,position:number):Promise<void> {
    const ticket=this.store.tickets.get(ticketId)!;
    const configuration=this.store.get<{provider:LLMProvider;model:string;effort:string}>('executor:'+ticketId);
    const provider=configuration?.provider??this.settings.current().workerProvider;
    let cwd=ticket.execution!.directory;
    // Reserve before any asynchronous filesystem/Git operation to enforce the global slot limit.
    this.active.set(ticketId,{sessionId:'',provider});
    const origin=this.store.triggers.get(ticket.origin.triggerId);
    const repository=String(origin?.meta.repository??'');
    const mapping=this.settings.current().repositories[repository];
    if(mapping){const cached=this.store.get<string>('workspace:'+ticketId);if(cached&&existsSync(cached))cwd=cached;else{const result=await createTicketWorktree({projectPath:mapping.path,branch:'superagent/'+ticketId,...mapping.baseBranch?{baseBranch:mapping.baseBranch}:{}},{fileSystem:{pathExists:async path=>existsSync(path)},runGit:async(args,dir)=>{const result=await sourceCommand(this.root,'git',args,{},60000,dir);if(result.code!==0)throw new Error(result.stderr||result.error||'Git failed');return {stdout:result.stdout,stderr:result.stderr};}});cwd=result.worktreePath;this.store.set('workspace:'+ticketId,cwd);}this.store.tickets.save({...ticket,execution:{...ticket.execution!,directory:cwd}});}
    mkdirSync(cwd,{recursive:true});
    const key='worker-session:'+assignmentId;
    let sessionId=this.store.get<string>(key);
    if(!sessionId){sessionId=withUserContext(this.ownerId,()=>sessionsService.createAppSession(provider,cwd,ticket.title).sessionId);this.store.set(key,sessionId);}
    this.active.set(ticketId,{sessionId,provider});
    this.engine.assignmentStarted(ticketId,assignmentId);
    const current=this.store.tickets.get(ticketId)!,ids=current.undelivered;

    try {
      const prompt=this.prompts.read('worker').text;
      await this.run(provider,sessionId,cwd,configuration?.model??this.settings.current().workerModel,prompt+'\nTicket and Inputs:\n'+JSON.stringify({ticket:current,triggers:current.inputs.filter(i=>i.kind==='trigger').map(i=>this.store.triggers.get(i.triggerId))}),this.capability('worker',ticketId,assignmentId),()=>{this.engine.inputsDelivered(ticketId,assignmentId,ids);},configuration?.effort??this.settings.current().effort);
      this.engine.turnEnded(ticketId,assignmentId);
      this.store.complete(position);
    }catch(error) {
      const latest=this.store.tickets.get(ticketId)!;
      if(!latest.ended){this.engine.report(ticketId,{state:'failed',summary:String(error),question:'Execution failed. Inspect the provider error and choose retry.'});this.store.enqueue('relay',assignmentId+':failed',{ticketId,report:{state:'failed',summary:String(error)}});}
      this.store.complete(position);
    }finally{this.active.delete(ticketId);}
  }
  private async master(kind:string,payload:Record<string,unknown>):Promise<void> {
    const cwd=join(this.root,'orchestrator');mkdirSync(cwd,{recursive:true});
    let sessionId=this.store.get<string>('master-session');
    if(!sessionId){sessionId=await withUserContext(this.ownerId,()=>sessionsService.createAppSession('codex',cwd,'Drover orchestrator').sessionId);this.store.set('master-session',sessionId);}
    this.masterSessionId=sessionId;
    if(kind==='eval') {
      const candidate=payload as unknown as Candidate;
      if(this.engine.candidate(candidate.triggers[0].id)?.evalId!==candidate.evalId)return;

    }
    const prompt=this.prompts.read('orchestrator').text;
    await this.run('codex',sessionId,cwd,this.settings.current().assessorModel,prompt+'\n'+kind+'\n'+JSON.stringify(payload),this.capability('orchestrator'),()=>{if(kind==='eval')this.engine.candidateDelivered(String(payload.evalId));});
  }
  private track(promise:Promise<unknown>):void{this.inFlight.add(promise);void promise.finally(()=>this.inFlight.delete(promise)).catch(()=>{});}
  async close():Promise<void> {
    setCompatibilityReceiver(undefined);
    this.stopped=true;if(this.timer)clearInterval(this.timer);
    await Promise.allSettled([...this.active.values(),...(this.masterBusy&&this.masterSessionId?[{provider:'codex' as const,sessionId:this.masterSessionId}]:[])].map(active=>withUserContext(this.ownerId,()=>providerRuntimeService.abort(active.provider,active.sessionId))));
    await this.sources.close();
    await Promise.allSettled([...this.inFlight]);this.capabilities.clear();
  }
}
