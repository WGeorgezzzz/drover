import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { InfohubTaskGrouping } from '@/shared/types.js';
import type { TopicUnit } from './taskmaster-units.service.js';

export type InfohubUnit={id:number;title:string;kind:string;status:string;summary?:string;priority?:string;due_at?:number|null;updated_at:number;for_me?:number|boolean;tags?:string[];parents?:{id:number;title:string;kind?:string}[];messages?:{id:number;source:string;channel_name?:string;link?:string;text?:string}[]};
export type InfohubRecord={id:string;updatedAt:number;fingerprint:string;fieldsFingerprint:string;status:string;fields:Record<string,unknown>};
export const remoteStatus=(status:string)=>status==='done'?'done':status==='cancelled'?'dropped':'open';
const groupingSchema=z.object({groupId:z.string().min(1),groupName:z.string().min(1),project:z.string().min(1),topics:z.array(z.object({id:z.number(),title:z.string(),depth:z.number().int().positive()}))});

/** The intelligence service validates the persisted source projection instead of invoking a second classifier. */
export function infohubTaskGrouping(task:Record<string,unknown>):InfohubTaskGrouping|undefined {
  if(task.source!=='infohub')return undefined;
  const result=groupingSchema.safeParse(task.infohubGrouping);
  return result.success?result.data:undefined;
}

function sourceGrouping(unit:InfohubUnit,graph:InfohubUnit[]):InfohubTaskGrouping {
  const byId=new Map(graph.map(node=>[node.id,node])),seen=new Set([unit.id]);
  const frontier=(unit.parents||[]).map(node=>({...node,depth:1}));
  const topics:InfohubTaskGrouping['topics']=[],tags=new Set(unit.tags||[]);
  while(frontier.length&&seen.size<=200){
    const ref=frontier.shift()!;if(seen.has(ref.id))continue;seen.add(ref.id);
    const node=byId.get(ref.id)||ref;
    if(node.kind==='topic')topics.push({id:node.id,title:node.title,depth:ref.depth});
    if('tags' in node)for(const tag of node.tags||[])if(tag.startsWith('project:'))tags.add(tag);
    if('parents' in node)frontier.push(...(node.parents||[]).map(parent=>({...parent,depth:ref.depth+1})));
  }
  topics.sort((a,b)=>a.depth-b.depth||a.id-b.id);
  const project=[...tags].filter(tag=>tag.startsWith('project:')).sort()[0]?.slice(8)||'InfoHub';
  const topicTag=[...tags].filter(tag=>tag.startsWith('topic:')).sort()[0];
  return {project,topics,groupId:topics.length?'infohub:topic:'+topics[0].id:topicTag?'infohub:tag:'+topicTag:'infohub:unclassified',
    groupName:topics[0]?.title||topicTag?.slice(6)||'未归类待办'};
}

/** Task synchronization preserves stable unit IDs, evidence and the source topic graph in native task records. */
export function infohubRecord(unit:InfohubUnit,graph:InfohubUnit[]=[]):InfohubRecord {
  const tags=[...new Set([...(unit.tags||[]),'source:infohub','type:todo',...(unit.for_me?['person:me']:[])])].sort();
  const link='/infohub?unit='+unit.id;
  const fields={title:unit.title,description:unit.summary||'',details:unit.summary||'',source:'infohub',sourceId:String(unit.id),
    due:unit.due_at?new Date(unit.due_at*1000).toISOString():'',priority:unit.priority==='P0'||unit.priority==='P1'?'high':unit.priority==='P3'?'low':'medium',tags,
    parentIds:[...new Set([...(unit.parents||[]).map(p=>'infohub-unit:'+p.id),...tags.filter(t=>t.startsWith('topic:')||t.startsWith('project:'))])],
    evidenceLink:link,forMe:!!unit.for_me,infohubGrouping:sourceGrouping(unit,graph),infohubEvidence:[{unitId:unit.id,link},...(unit.messages||[]).map(m=>({messageId:m.id,source:m.source,channel:m.channel_name,link:m.link||link,evidence:m.text?.slice(0,1500)}))]};
  return {id:String(unit.id),updatedAt:unit.updated_at*1000,status:unit.status==='done'?'done':['dropped','ignored'].includes(unit.status)?'cancelled':'pending',
    fieldsFingerprint:createHash('sha256').update(JSON.stringify(fields)).digest('hex'),
    fingerprint:createHash('sha256').update(JSON.stringify({...fields,status:unit.status,updatedAt:unit.updated_at})).digest('hex'),fields};
}
export function infohubTopics(units:InfohubUnit[]):TopicUnit[] {
  const map=new Map<string,TopicUnit>();
  const referenced=new Set(units.flatMap(unit=>(unit.parents||[]).map(parent=>parent.id)));
  for(const unit of units){
    const tags=(unit.tags||[]).filter(t=>t.startsWith('topic:')||t.startsWith('project:'));
    for(const tag of tags)map.set(tag,{id:tag,title:tag.slice(tag.indexOf(':')+1),parentIds:[]});
    if(unit.kind!=='todo'||referenced.has(unit.id))map.set('infohub-unit:'+unit.id,{id:'infohub-unit:'+unit.id,title:unit.title,parentIds:(unit.parents||[]).map(p=>'infohub-unit:'+p.id)});
    for(const parent of unit.parents||[])if(!map.has('infohub-unit:'+parent.id))map.set('infohub-unit:'+parent.id,{id:'infohub-unit:'+parent.id,title:parent.title,parentIds:[]});
  }
  return [...map.values()];
}
