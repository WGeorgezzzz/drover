import { describe,it,expect } from 'vitest';
import Database from 'better-sqlite3';
import { githubTrigger,feishuTrigger,wechatTrigger } from '../source-normalizers.js';
import { SuperagentStore } from '../store.js';
import { OutboundLedger } from '../outbound-ledger.js';
const now=new Date().toISOString();
describe('platform identity and no visible marker loop prevention',()=>{
  for(const source of ['github','feishu','wechat'] as const)it(source+' ignores only a sent receipt, even if reply contains the invocation',()=>{
    const text='\u9a6d\u624b result verified';
    const trigger=source==='github'?githubTrigger('WGeorgezzzz/drover',{id:37,body:text,user:{login:'WGeorgezzzz',type:'User'},created_at:now,html_url:'https://github.com/WGeorgezzzz/drover/issues/9#issuecomment-37'},9):source==='feishu'?feishuTrigger({message_id:'om_test',chat_id:'oc_test',sender_id:'own',sender_type:'user',content:JSON.stringify({text}),create_time:String(Date.now()),chat_type:'p2p'}):wechatTrigger('filehelper',{server_id:'37',local_id:3,database:'message_0',time:now,sender_username:'own',text});
    expect(trigger.human).toBe(true);expect(trigger.addressed).toBe('mention');
    const db=new Database(':memory:');try{const store=new SuperagentStore(db),ledger=new OutboundLedger(store);expect(ledger.isOwn(trigger)).toBe(false);store.send({id:'reply',ticketId:'ticket',kind:'reply',channel:trigger.channel!,text});ledger.begin('reply',trigger.actor.id);ledger.sent('reply',String(trigger.meta.platformId));expect(ledger.isOwn(trigger)).toBe(true);expect(store.receipt('reply')?.message.text).toBe(text);
      const human={...trigger,id:trigger.id+'human',meta:{...trigger.meta,platformId:'different'},at:new Date(Date.now()+180000).toISOString()};expect(ledger.isOwn(human)).toBe(false);
    }finally{db.close();}
  });
  it('GitHub threads are scoped by repository',()=>{const item={id:1,number:1,body:'\u9a6d\u624b please',user:{login:'WGeorgezzzz'},created_at:now,html_url:'https://github.com/WGeorgezzzz/drover/issues/1'};expect(githubTrigger('WGeorgezzzz/drover',item).threads).not.toEqual(githubTrigger('WGeorgezzzz/other',item).threads);});
  it('WeChat does not authorize an embedded invocation in casual conversation',()=>{const trigger=wechatTrigger('filehelper',{server_id:'1',local_id:1,database:'message_0',time:now,sender_username:'own',text:'result says \u9a6d\u624b'});expect(trigger.addressed).toBeUndefined();});
});
