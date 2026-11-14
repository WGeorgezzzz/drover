import { Input as UnifiedInput } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { Button } from '@/shared/ui/Button';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Markdown, RemoteClaudeComposer } from '@/modules/chat';
import type { RemoteClaudeOptions } from '@/shared/types';
import { Folder, Plus, ChevronDown, ChevronRight } from '@/shared/icons';
import { useAuth } from '@/modules/auth';
import { api } from '@/shared/api';
import { usePlugins } from '@/modules/plugins/context/PluginsContext';

const DEFAULT_FOLDER = '/mnt/nas-h/wqz';
const DEFAULT_HOST = 'H200-1';
const CHANGE = 'drover:remote-sessions';
type FolderTarget = {host: string; cwd: string};
type Session = {id: string; title: string};
type Turn = {options?: RemoteClaudeOptions; modelsUsed?: string[]; id: string; prompt: string; result?: string; state: string; cwd: string};
type Transcript = {models: string[]; turns: Turn[]; older: boolean};
const defaultTarget = {host: DEFAULT_HOST, cwd: DEFAULT_FOLDER};

function stored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

function storageKey(target: FolderTarget) { return JSON.stringify([target.host, target.cwd]); }

async function request<T>(target: FolderTarget, action: string, args: Record<string,unknown> = {}): Promise<T> {
  const response = await api.plugins.rpc('h200-claude', 'POST', 'jobs', {
    ...target, action, view: 'sessions', token: localStorage.getItem('auth-token'), ...args,
  });
  if (!response.ok) throw Error('远程会话请求失败 (' + response.status + ')');
  const reply = await response.json();
  if (reply.error) throw Error(reply.error);
  return reply.data;
}

function link(target: FolderTarget, id: string) {
  return '/remote/h200/' + id + '?' + new URLSearchParams(target).toString();
}

function drafts(target: FolderTarget) {
  return stored<Session[]>('remote.drafts.' + storageKey(target), []);
}

/** The model picker and sidebar create independent drafts with stable remote session IDs. */
export function newRemoteSession(target: FolderTarget = defaultTarget) {
  const id = crypto.randomUUID();
  localStorage.setItem('remote.drafts.' + storageKey(target), JSON.stringify([{id,title:'新会话'}, ...drafts(target)]));
  window.dispatchEvent(new Event(CHANGE));
  return link(target, id);
}

function FolderRow({target}: {target: FolderTarget}) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const selectedFolder = location.pathname.startsWith('/remote/h200/') && params.get('host')===target.host && params.get('cwd')===target.cwd;
  const [open,setOpen] = useState(selectedFolder || (target.host === DEFAULT_HOST && target.cwd === DEFAULT_FOLDER));
  useEffect(()=>{if(selectedFolder)setOpen(true)},[selectedFolder]);
  const [sessions,setSessions] = useState<Session[]>([]);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  useEffect(() => {
    const update = () => setRevision(v=>v+1);
    window.addEventListener(CHANGE,update);
    return () => window.removeEventListener(CHANGE,update);
  },[]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    request<Session[]>(target,'list').then(rows=>{
      if (active) { setSessions(rows); setError(''); }
    }).catch(e=>{if(active)setError(String(e.message));});
    return () => {active=false};
  },[open,target.host,target.cwd,revision,location.pathname]);
  const rows = [...drafts(target).filter(d=>!sessions.some(s=>s.id===d.id)), ...sessions];
  return <div>
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="compact" className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={()=>setOpen(!open)} title={target.cwd}>
        {open?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<Folder size={14}/>
        <span className="truncate">{target.host} · {target.cwd}</span>
      </Button>
      <Button variant="ghost" size="compact" title="新建远程会话" aria-label={'新建远程会话 '+target.host+' '+target.cwd} onClick={()=>{setOpen(true);navigate(newRemoteSession(target))}}><Plus size={15}/></Button>
    </div>
    {open && <div className="ml-5 space-y-1 border-l pl-2">
      {error && <Button variant="ghost" size="compact" onClick={()=>setRevision(v=>v+1)}>{error} · 重试</Button>}
      {rows.map(row=><Button variant="ghost" size="compact" key={row.id} className={'block w-full truncate rounded px-1 text-left '+(location.pathname.endsWith('/'+row.id)?'bg-muted font-semibold':'')}
        title={row.title} onClick={()=>navigate(link(target,row.id))}>{row.title}</Button>)}
    </div>}
  </div>;
}

/** SidebarContent shows the owner's remote folders alongside local projects. */
export function RemoteFolders() {
  const {plugins}=usePlugins();
  const {user}=useAuth();
  const [folders,setFolders]=useState(()=>stored<FolderTarget[]>('remote.folders.v1',[defaultTarget]));
  const [adding,setAdding]=useState(false);
  const [host,setHost]=useState(DEFAULT_HOST);
  const [cwd,setCwd]=useState(DEFAULT_FOLDER);
  if(String(user?.id)!=='1' || !plugins.some(p=>p.enabled && p.name==='h200-claude'))return null;
  function add() {
    const path=cwd.trim().replace(/\/+$/,'') || '/';
    if(!path.startsWith('/'))return;
    const target={host,cwd:path};
    const next=folders.some(f=>storageKey(f)===storageKey(target))?folders:[...folders,target];
    setFolders(next); localStorage.setItem('remote.folders.v1',JSON.stringify(next));setAdding(false);
  }
  return <section className="space-y-2 px-3 py-2 text-xs" aria-label="远程目录">
    <div className="flex items-center justify-between"><strong>远程目录</strong><Button variant="ghost" size="compact" aria-label="添加远程目录" onClick={()=>setAdding(!adding)}><Plus aria-hidden="true" />添加目录</Button></div>
    {adding && <form className="grid gap-1" onSubmit={e=>{e.preventDefault();add()}}>
      <Select aria-label="远程主机" value={host} onChange={e=>setHost(e.target.value)}><option>H200-1</option><option>H200-2</option></Select>
      <UnifiedInput required pattern="/.*" aria-label="远程绝对路径" value={cwd} onChange={e=>setCwd(e.target.value)}/>
      <Button variant="ghost" size="compact" type="submit">添加</Button></form>}
    {folders.map(f=><FolderRow key={storageKey(f)} target={f}/>)}
  </section>;
}

/** ProjectMainRegion renders the transcript of the remote session selected in the sidebar. */
export function RemoteConversation({onMenu}: {onMenu:()=>void}) {
  const {remoteId=''}=useParams();
  const location=useLocation();
  const query=new URLSearchParams(location.search);
  const target={host:query.get('host') || DEFAULT_HOST,cwd:query.get('cwd') || DEFAULT_FOLDER};
  return <Conversation key={storageKey(target)+remoteId} target={target} id={remoteId} onMenu={onMenu}/>;
}

function Conversation({target,id,onMenu}: {target:FolderTarget;id:string;onMenu:()=>void}) {
  const key='remote.pending.'+storageKey(target)+id;
  const [pending,setPending]=useState(()=>stored<{id:string;prompt:string;after:string|null}|null>(key,null));
  const optionKey = 'remote.options.'+storageKey(target)+id;
  const [models,setModels]=useState<string[]>([]);
  const [options,setOptions]=useState<RemoteClaudeOptions|null>(()=>stored(optionKey,null));
  const [input,setInput]=useState(pending?.prompt || '');
  const [turns,setTurns]=useState<Turn[]>([]);
  const [older,setOlder]=useState(false);
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    let timer:ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const page=await request<Transcript>(target,'get',{thread:id});
        if(!active)return;
        setModels(page.models);
        setOptions(current=>{
          const saved=current || page.turns.at(-1)?.options;
          return {model:saved && page.models.includes(saved.model)?saved.model:page.models[0],effort:saved?.effort || 'default',permission:saved?.permission || 'acceptEdits'};
        });
        setTurns(previous=>{ const ids=new Set(page.turns.map(t=>t.id));return [...previous.filter(t=>!ids.has(t.id)),...page.turns]; });
        setOlder(previous=>ready?previous:page.older);
        setReady(true);setError('');
        if(page.turns.at(-1)?.state==='运行中')timer=setTimeout(read,4000);
      }catch(e){if(active)setError(String(e));}
    }
    void read();
    return ()=>{active=false;clearTimeout(timer)};
  },[id,revision]);
  const last=turns.at(-1);
  async function send() {
    if(!options || !input.trim() || busy || !ready || last?.state==='运行中')return;
    const turn=pending?.prompt===input?pending:{id:crypto.randomUUID(),prompt:input,options,after:last?.id??null};
    setBusy(true);setError('');setPending(turn);localStorage.setItem(key,JSON.stringify(turn));
    try{
      await request(target,'start',{...turn,thread:id});
      localStorage.removeItem(key);setPending(null);setInput('');
      const dk='remote.drafts.'+storageKey(target);
      localStorage.setItem(dk,JSON.stringify(drafts(target).filter(s=>s.id!==id)));
      window.dispatchEvent(new Event(CHANGE));setReady(false);setRevision(v=>v+1);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function earlier() {
    try {
      const page=await request<Transcript>(target,'get',{thread:id,before:turns[0].id});
      setTurns(prev=>[...page.turns.filter(t=>!prev.some(x=>x.id===t.id)),...prev]);setOlder(page.older);
    }catch(e){setError(String(e))}
  }
  return <main className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col gap-3 p-5">
    <header><Button variant="ghost" size="compact" onClick={onMenu} className="mr-2 md:hidden">会话列表</Button><strong>H200 Claude</strong> · {target.host}<div className="text-sm text-muted-foreground">{target.cwd}</div></header>
    <div className="min-h-0 flex-1 space-y-4 overflow-auto" aria-label="远程会话记录">
      {older && <Button variant="ghost" size="compact" onClick={earlier}>加载更早消息</Button>}
      {ready && !turns.length && <p>在此目录开始一个独立会话。</p>}
      {turns.map(turn=><article key={turn.id} className="space-y-2">
        <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3">{turn.prompt}</p>
        <Markdown className="prose prose-sm max-w-none break-words dark:prose-invert">{turn.result || turn.state}</Markdown>
        {turn.modelsUsed?.length ? <small className="text-muted-foreground">{turn.modelsUsed.join(' · ')}</small> : null}
      </article>)}
    </div>
    {error && <div role="alert">{error} <Button variant="ghost" size="compact" onClick={()=>setRevision(v=>v+1)}>刷新</Button></div>}
    {options && <RemoteClaudeComposer input={input} setInput={setInput} options={options} models={models}
      onOptions={next=>{setOptions(next);localStorage.setItem(optionKey,JSON.stringify(next))}}
      onSend={send} disabled={!ready || busy || !input.trim() || last?.state==='运行中'}/>}
  </main>;
}
