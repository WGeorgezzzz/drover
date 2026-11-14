import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/modules/auth';
import { alwaysOnApi, readApiJson } from '@/shared/api';
import { Button, Input } from '@/shared/ui';
import type { AlwaysOnDecision, AlwaysOnSnapshot } from '@/shared/types';

type Memory={inventory:{indexes:{name:string;lineCount:number;bytes:number}[];candidates:unknown[];unindexed:string[]};history:{backups:string[];log:string}};

function DecisionForm({decision,onAnswer}:{decision:AlwaysOnDecision;onAnswer:(id:string,answer:unknown)=>Promise<void>}) {
  // An answer exists only as explicit user input; opening the page never selects an option.
  const [answer,setAnswer]=useState('');
  let options:unknown[]=[];try{options=JSON.parse(decision.options);}catch{/* Free-text decisions have no options. */}
  return <article id={'decision-'+decision.id} className="scroll-mt-4 space-y-3 rounded-lg border p-4">
    <div className="text-xs text-muted-foreground">{decision.id} · <Link className="underline" to={'/session/'+decision.target}>来源会话</Link> · {new Date(decision.created_at).toLocaleString()}{decision.physical?' · ⚠ 真机 / 物理动作审批':''}</div>
    <p className="whitespace-pre-wrap">{decision.question}</p>
    {decision.status==='pending'?<>
      {options.length>0&&<pre className="whitespace-pre-wrap text-xs">{JSON.stringify(options,null,2)}</pre>}
      <label className="block text-sm">你的答复<Input aria-label={'答复 '+decision.id} value={answer} onChange={event=>setAnswer(event.target.value)} placeholder="明确填写选项或答复" /></label>
      <Button disabled={!answer.trim()} onClick={()=>void onAnswer(decision.id,answer.trim())}>提交答复</Button>
    </>:<p className="text-sm text-muted-foreground">已处理</p>}
  </article>;
}

/** App routes expose persisted work and answers; ui-unify remains responsible for toast and system notifications. */
export function AlwaysOnInbox() {
  const {user}=useAuth();
  // Polling keeps persisted decisions and events visible across reconnects and service restarts.
  const [snapshot,setSnapshot]=useState<AlwaysOnSnapshot|null>(null);
  // Filesystem inventory is loaded only for administrators, on explicit request.
  const [memory,setMemory]=useState<Memory|null>(null);
  // Inline action results and request errors belong to this page, not a second toast system.
  const [message,setMessage]=useState('');
  const load=useCallback(async()=>{setSnapshot((await readApiJson<{data:AlwaysOnSnapshot}>(await alwaysOnApi.snapshot())).data);},[]);
  useEffect(()=>{void load().catch(error=>setMessage(String(error)));const timer=setInterval(()=>void load().catch(error=>setMessage(String(error))),3000);return()=>clearInterval(timer);},[load]);
  const answer=async(id:string,value:unknown)=>{try{const result=(await readApiJson<{data:{alreadyHandled:boolean}}>(await alwaysOnApi.answer(id,value))).data;setMessage(result.alreadyHandled?'此事项已由另一端处理':'答复已入队，将继续原会话');await load();}catch(error){setMessage(String(error));}};
  return <main className="mx-auto min-h-screen max-w-5xl space-y-6 bg-background p-5 text-foreground">
    <nav><Link className="underline" to="/">返回工作区</Link></nav>
    <h1 className="text-2xl font-semibold">常驻收件箱</h1>
    <p className="text-sm text-muted-foreground">{snapshot?.enabled?'已启用':'已关闭，使用旧调度路径'} · 待决事项会保留到你明确答复。</p>
    {message&&<p role="status" className="rounded border p-3">{message}</p>}
    <section className="space-y-3"><h2 className="text-lg font-medium">需要你决定</h2>
      {snapshot?.decisions.map(decision=><DecisionForm key={decision.id} decision={decision} onAnswer={answer}/>)}
      {snapshot?.decisions.length===0&&<p className="text-muted-foreground">暂无待决事项</p>}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-medium">会话事件</h2>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>来源 / 会话</th><th>状态</th><th>尝试</th><th>说明</th></tr></thead><tbody>
        {snapshot?.events.map(event=><tr key={event.id} className="border-b"><td className="py-3">{event.source} · <Link className="underline" to={'/session/'+event.target}>{event.target.slice(0,12)}</Link></td><td>{({pending:'待处理',processing:'处理中',done:'已完成',failed:'等待重试',dead:'失败，需处理'} as Record<string,string>)[event.status]||event.status}</td><td>{event.attempts}</td><td className="max-w-sm break-words">{event.error}</td></tr>)}
      </tbody></table></div>
    </section>
    {(user as {role?:string}|null)?.role==='admin'&&<section className="space-y-3"><h2 className="text-lg font-medium">记忆整理</h2><p>每天北京时间 04:30，使用 Claude Opus 整理索引。</p>
      <div className="flex gap-2"><Button variant="outline" onClick={()=>void alwaysOnApi.memory().then(readApiJson<{data:Memory}>).then(result=>setMemory(result.data)).catch(error=>setMessage(String(error)))}>查看清点与记录</Button>
      <Button disabled={!snapshot?.enabled} onClick={()=>void alwaysOnApi.consolidate().then(readApiJson).then(()=>{setMessage('记忆整理已入队');return load();}).catch(error=>setMessage(String(error)))}>手动整理</Button></div>
      {memory&&<><p>{memory.inventory.indexes.map(index=>`${index.name}：${index.lineCount} 行 / ${index.bytes} 字节`).join('；')} · 候选 {memory.inventory.candidates.length} · 未索引 {memory.inventory.unindexed.length}</p>
      {memory.history.backups.map(stamp=><div key={stamp} className="flex items-center gap-3 text-sm">{stamp}<Button variant="outline" size="sm" onClick={()=>void alwaysOnApi.rollback(stamp).then(readApiJson).then(()=>setMessage('已回滚 '+stamp)).catch(error=>setMessage(String(error)))}>回滚这次整理</Button></div>)}
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{memory.history.log}</pre></>}
    </section>}
  </main>;
}
