import { describe,it,expect } from 'vitest';
import Database from 'better-sqlite3';
import { SuperagentStore } from '../store.js';
import { SuperagentPrompts } from '../prompts.js';
import { githubTrigger } from '../source-normalizers.js';
describe('versioned execution configuration',()=>{
 it('preserves the original prompt and refuses stale updates',()=>{const db=new Database(':memory:');try{const prompts=new SuperagentPrompts(new SuperagentStore(db)),original=prompts.read('worker');const saved=prompts.save('worker','changed prompt',0);expect(saved.revision).toBe(1);expect(saved.history[0].text).toBe(original.text);expect(()=>prompts.save('worker','stale',0)).toThrow('changed');expect(prompts.read('worker').text).toBe('changed prompt');const restored=prompts.save('worker',saved.history[0].text,1);expect(restored.text).toBe(original.text);expect(restored.revision).toBe(2);expect(restored.history).toHaveLength(2);}finally{db.close();}});
 it('does not interpret issue updated_at from its own reply as a new human request',()=>{const item={id:1,number:1,title:'test',body:'驭手 write a file',created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z',html_url:'https://github.com/WGeorgezzzz/drover/issues/1',user:{login:'WGeorgezzzz'}};expect(githubTrigger('WGeorgezzzz/drover',item).id).toBe(githubTrigger('WGeorgezzzz/drover',{...item,updated_at:'2026-11-01T00:02:00Z'}).id);expect(githubTrigger('WGeorgezzzz/drover',{...item,body:'驭手 different request'}).id).not.toBe(githubTrigger('WGeorgezzzz/drover',item).id);});
});
