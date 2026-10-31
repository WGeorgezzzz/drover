import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Trigger } from './core/index.ts';
const mention=(text:string)=>/(?:@?\u9a6d\u624b)/u.test(text);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex').slice(0,24);
// GitHub Source and tests normalize same-account human messages; only Outbox ledger suppresses sent comments.
export function githubTrigger(repository:string,value:unknown,issueNumber?:number):Trigger {
  const item=z.looseObject({id:z.number(),number:z.number().optional(),title:z.string().optional(),body:z.string().nullish(),created_at:z.string(),updated_at:z.string().optional(),html_url:z.string(),user:z.object({login:z.string(),type:z.string().optional()}).nullable(),pull_request:z.unknown().optional()}).parse(value);
  const number=issueNumber??item.number;if(!number)throw new Error('Missing GitHub issue number');
  const text=[item.title,item.body].filter(Boolean).join('\n\n'),thread=repository+'#'+number;
  return {id:'github:'+repository+':'+(issueNumber?'comment:':'issue:')+item.id+':'+hash(text),source:'github',threads:[{source:'github',id:thread}],actor:{source:'github',id:item.user?.login??'ghost'},human:!!item.user&&!/\[bot\]$/.test(item.user.login)&&(!item.user.type||item.user.type==='User'),...(mention(text)?{addressed:'mention'}:{}),at:item.updated_at??item.created_at,text,channel:{source:'github',thread,address:{repository,number:String(number)}},url:item.html_url,meta:{repository,number,isPr:!!item.pull_request,platformId:String(item.id)}};
}
// Live events and historical pages share stable platform IDs and conversation identity.
export function feishuTrigger(value:unknown):Trigger {
  const item=z.looseObject({message_id:z.string(),chat_id:z.string(),sender_id:z.string(),sender_type:z.string(),content:z.string(),create_time:z.string(),chat_type:z.string().optional(),root_id:z.string().optional(),thread_id:z.string().optional()}).parse(value);
  let text=item.content;try{const content=JSON.parse(text);if(typeof content.text==='string')text=content.text;}catch{/* Event compact format already contains plain text. */}
  const thread=item.chat_id+':'+(item.root_id??item.message_id);
  return {id:'feishu:'+item.message_id,source:'feishu',threads:[{source:'feishu',id:thread}],actor:{source:'feishu',id:item.sender_id},human:item.sender_type==='user',...(mention(text)?{addressed:'mention'}:{}),at:new Date(/^\d+$/.test(item.create_time)?Number(item.create_time):item.create_time).toISOString(),text,channel:{source:'feishu',thread:item.chat_id,address:{chatId:item.chat_id,messageId:item.message_id,...item.thread_id?{threadId:item.thread_id}:{}}},meta:{chatId:item.chat_id,platformId:item.message_id,...item.thread_id?{threadId:item.thread_id}:{}}};
}
// Database records retain sender usernames; forwarded text never becomes a separate authorizing message.
export function wechatTrigger(chat:string,value:unknown):Trigger {
  const item=z.looseObject({server_id:z.string(),local_id:z.number(),database:z.string(),time:z.string(),sender_username:z.string(),text:z.string()}).parse(value);
  return {id:'wechat:'+chat+':'+(item.server_id!=='0'?item.server_id:hash(item.database+':'+item.local_id)),source:'wechat',threads:[{source:'wechat',id:chat}],actor:{source:'wechat',id:item.sender_username},human:true,...(/^\s*@?\u9a6d\u624b/u.test(item.text)?{addressed:'mention'}:{}),at:new Date(item.time).toISOString(),text:item.text,channel:{source:'wechat',thread:chat,address:{chat}},meta:{conversation:chat,platformId:item.server_id}};
}
