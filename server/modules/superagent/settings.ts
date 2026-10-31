import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Policy, SourceScope } from './core/index.ts';
import type { SuperagentStore } from './store.js';

const source = z.object({ enabled:z.boolean().default(false), allow:z.array(z.string().min(1)).default([]), conversations:z.array(z.string()).default([]) }).strict();
export const superagentSettingsSchema=z.object({
  enabled:z.boolean().default(false), paused:z.boolean().default(false), mode:z.enum(['off','observe','auto']).default('observe'),
  workers:z.number().int().min(1).max(32).default(4), workerProvider:z.enum(['codex','claude','deepseek-harness']).default('codex'),
  workerModel:z.string().min(1).default('gpt-6.1-sol'), effort:z.string().default('high'), assessorModel:z.string().min(1).default('gpt-6-luna'),
  evalTimeoutSeconds:z.number().int().min(10).max(3600).default(180),
  rules:z.array(z.object({id:z.string().min(1),enabled:z.boolean(),instruction:z.string().min(1)}).strict()).default([]),
  sources:z.object({
    feishu:source.extend({cli:z.string().default('lark-cli'),configDir:z.string().default(''),botId:z.string().default(''),userId:z.string().default('')}).prefault({}),
    wechat:source.extend({python:z.string().default(''),script:z.string().default(''),account:z.string().default('wangqiaozhi123')}).prefault({}),
    github:source.extend({cli:z.string().default('gh'),configDir:z.string().default(''),repository:z.string().default('WGeorgezzzz/drover'),account:z.string().default('WGeorgezzzz')}).prefault({}),
    monitor:source.prefault({}),
    conversation:source.prefault({enabled:true,allow:['1']}), infohub:source.prefault({enabled:true,allow:['1']}),
  }).prefault({}),
}).strict();

export class SuperagentSettings {
  constructor(private readonly store:SuperagentStore) {}
  current() {
    const saved=this.store.get<unknown>('superagent-settings');
    if(saved)return superagentSettingsSchema.parse(saved);
    return superagentSettingsSchema.parse({sources:{github:{allow:['WGeorgezzzz'],conversations:['WGeorgezzzz/drover']},feishu:{allow:['ou_6d5c3f4bef3510b36049813bf38848d1'],userId:'ou_6d5c3f4bef3510b36049813bf38848d1'},wechat:{allow:['wangqiaozhi123']}}});
  }
  revision():number {return this.store.get<number>('superagent-settings-revision')??0;}
  save(input:unknown,revision:number) {
    const settings=superagentSettingsSchema.parse(input);
    if(revision!==this.revision())throw new Error('Settings changed; reload before saving');
    this.store.atomic(()=>{this.store.set('superagent-settings',settings);this.store.set('superagent-settings-revision',revision+1);this.store.set('superagent-settings-version:'+(revision+1),{at:new Date().toISOString(),settings});});
    return settings;
  }
  scope:SourceScope={scope:({source,meta})=>{
    const settings=this.current(),config=settings.sources[source as keyof typeof settings.sources];
    if(!config?.enabled)return {listened:false,reason:'source_disabled'};
    const conversation=String(meta.conversation??meta.chatId??meta.repository??meta.monitorId??'');
    if(config.conversations.length&&!config.conversations.includes(conversation))return {listened:false,reason:'conversation_not_allowed'};
    return {listened:true,observed:true,row:conversation};
  }};
  policy():Policy {
    const settings=this.current();
    const version=createHash('sha256').update(JSON.stringify({mode:settings.mode,rules:settings.rules,sources:Object.fromEntries(Object.entries(settings.sources).map(([name,config])=>[name,config.allow]))})).digest('hex').slice(0,16);
    return {version,paused:settings.paused||!settings.enabled,evalTimeoutMs:settings.evalTimeoutSeconds*1000,
      gate:(trigger,thread,tickets)=>{
        const config=settings.sources[trigger.source as keyof typeof settings.sources];
        if(!trigger.human)return {admissible:false,reason:'not_human'};
        if(!config?.allow.includes(trigger.actor.id))return {admissible:false,reason:'not_a_member'};
        const recorded={source:trigger.source,scope:trigger.meta,sender:trigger.actor.id};
        if(trigger.addressed)return {admissible:true,strength:'explicit',basis:{...recorded,via:'addressed',addressed:trigger.addressed}};
        if(thread.subscriptions.some(id=>tickets.some(ticket=>ticket.id===id)))return {admissible:true,strength:'explicit',basis:{...recorded,via:'followup'}};
        if(settings.mode!=='off'&&settings.rules.some(rule=>rule.enabled))return {admissible:true,strength:'inferred',basis:{...recorded,via:'admission',cell:'listedUnaddressed',observation:{mode:settings.mode}}};
        return {admissible:false,reason:'no_mention'};
      },
      admitsInferred:rules=>settings.mode==='auto'&&rules.length>0&&rules.every(id=>settings.rules.some(rule=>rule.enabled&&rule.id===id)),
      revalidate:mandate=>{
        if(mandate.basis.source&&mandate.basis.scope&&!this.scope.scope({source:mandate.basis.source,meta:mandate.basis.scope}).listened)return false;
        if(mandate.basis.via==='followup'&&mandate.strength==='explicit')return true;
        const config=settings.sources[mandate.actor.source as keyof typeof settings.sources];
        return !!config?.allow.includes(mandate.actor.id)&&(mandate.strength==='explicit'||settings.mode==='auto'&&(mandate.basis.rules??[]).length>0&&(mandate.basis.rules??[]).every(id=>settings.rules.some(rule=>rule.enabled&&rule.id===id)));
      },
    };
  }
}
