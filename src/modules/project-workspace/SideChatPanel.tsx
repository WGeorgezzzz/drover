import { Input as UnifiedInput } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Select';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowUpRight, Check, Loader2, MessageSquarePlus, Pencil, Plus, RotateCcw, X } from '@/shared/icons';
import { useTranslation } from 'react-i18next';

import { ChatInterface } from '@/modules/chat';
import { api, readApiErrorMessage } from '@/shared/api';
import type { Project, ProjectSession, SessionNavigationOptions, SideConversation } from '@/shared/types';

const defaultRequests=new Map<string,Promise<SideConversation>>();
async function result<T>(response:Response):Promise<T> {
  const body=await response.json();
  if (!response.ok) throw new Error(readApiErrorMessage(body)||`HTTP ${response.status}`);
  return body.data as T;
}
async function loadInitial(parentId:string,title:string):Promise<SideConversation[]> {
  let rows=await result<SideConversation[]>(await api.sideChats.list(parentId));
  const legacyKey=`cloudcli-side-chat:${parentId}`;
  const legacyId=localStorage.getItem(legacyKey);
  if (legacyId && !rows.some(row=>row.child_session_id===legacyId)) {
    await result(await api.sideChats.adopt(parentId,legacyId));
    rows=await result<SideConversation[]>(await api.sideChats.list(parentId));
  }
  if (legacyId) localStorage.removeItem(legacyKey);
  if (!rows.length) {
    let pending=defaultRequests.get(parentId);
    if (!pending) {
      pending=api.sideChats.create({parentSessionId:parentId,title,requestId:crypto.randomUUID(),ensureDefault:true})
        .then(response=>result<SideConversation>(response));
      defaultRequests.set(parentId,pending);
      void pending.finally(()=>defaultRequests.delete(parentId)).catch(()=>{});
    }
    await pending;
    rows=await result<SideConversation[]>(await api.sideChats.list(parentId));
  }
  return rows;
}

type SideChatPanelProps = {
  parent: ProjectSession;
  project: Project;
  ws: WebSocket|null;
  sendMessage: (message:unknown)=>void;
  draft?: {id:number;text:string};
  onDraftConsumed?: ()=>void;
  onClose: ()=>void;
  onPromote: (id:string,options?:SessionNavigationOptions)=>void;
  onReturnReply: (text:string)=>void;
  onShowSettings: ()=>void;
  showThinking: boolean;
  showRawParameters: boolean;
  sendByCtrlEnter: boolean;
};

/** WorkspaceMain hosts server-owned child conversations; closing only detaches this view. */
export function SideChatPanel({parent,project,ws,sendMessage,draft,onDraftConsumed,onClose,onPromote,
  onReturnReply,onShowSettings,showThinking,showRawParameters,sendByCtrlEnter}:SideChatPanelProps) {
  const {t}=useTranslation('chat');
  const parentId=parent.id;
  // All relationships come from the server. Selection is only a local view preference.
  const [rows,setRows]=useState<SideConversation[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  // Retain a failed creation's opaque request ID until its outcome is acknowledged.
  const pendingCreate=useRef<{requestId:string;title:string}|null>(null);
  // Loading, action and error states keep incomplete operations visible instead of silently forking twice.
  const [loading,setLoading]=useState(true);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  // Rename text remains local until the service acknowledges it.
  const [rename,setRename]=useState<{id:string;text:string}|null>(null);
  const panelRef=useRef<HTMLElement>(null);
  const activeRows=rows.filter(row=>row.status==='active');
  const selected=activeRows.find(row=>row.id===selectedId) ?? activeRows[activeRows.length-1];
  const session=useMemo<ProjectSession|null>(()=>selected
    ? {id:selected.child_session_id,__provider:'claude',summary:selected.title}:null,
  [selected?.child_session_id,selected?.title]);
  const reload=useCallback(async()=>{
    const next=await result<SideConversation[]>(await api.sideChats.list(parentId));
    setRows(next);
  },[parentId]);
  useEffect(()=>{
    let active=true;
    void loadInitial(parentId,t('sideChat.defaultName',{number:1})).then(next=>{
      if (active) {setRows(next);setLoading(false);}
    }).catch(reason=>{if(active){setError(String(reason.message));setLoading(false);}});
    const timer=setInterval(()=>void api.sideChats.list(parentId).then(response=>result<SideConversation[]>(response))
      .then(next=>{if(active)setRows(next);}).catch(reason=>{if(active)setError(String(reason.message));}),3000);
    return()=>{active=false;clearInterval(timer);};
  },[parentId,attempt,t]);
  useEffect(()=>{panelRef.current?.focus();},[]);
  const action=async(row:SideConversation,body:{title?:string;action?:'archive'|'restore'|'promote'})=>{
    setPending(true);setError('');
    try {
      await result(await api.sideChats.update(row.id,body));
      setRename(null);
      await reload();
      if (body.action==='promote') onPromote(row.child_session_id);
    } catch(reason) {setError(reason instanceof Error?reason.message:String(reason));}
    finally {setPending(false);}
  };
  const create=async()=>{
    setPending(true);setError('');
    pendingCreate.current??={requestId:crypto.randomUUID(),title:t('sideChat.defaultName',{number:rows.length+1})};
    try {
      const row=await result<SideConversation>(await api.sideChats.create({parentSessionId:parentId,...pendingCreate.current}));
      if (row.status==='failed') {
        // This outcome is known. A new explicit create uses a new ticket;
        // unknown network outcomes keep the original ticket below.
        pendingCreate.current=null;
        throw new Error(row.error||t('sideChat.failed'));
      }
      pendingCreate.current=null;
      setSelectedId(row.id);
      await reload();
    } catch(reason) {setError(reason instanceof Error?reason.message:String(reason));}
    finally {setPending(false);}
  };
  return <aside ref={panelRef} tabIndex={-1} aria-label={t('sideChat.title')} data-claude-side-pane data-side-chat
    className="side-chat-panel flex h-full min-h-0 min-w-0 flex-col outline-none"
    onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();onClose();}}}>
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-3">
      <MessageSquarePlus size={16} className="shrink-0 text-muted-foreground"/>
      <h2 className="shrink-0 text-sm font-medium">{t('sideChat.title')}</h2>
      <Select aria-label={t('sideChat.choose')} className="ml-auto min-w-0 max-w-36 rounded-md bg-transparent p-1 text-xs"
        value={selected?.id||''} onChange={event=>setSelectedId(event.target.value)}>
        {!selected&&<option value="">{t('sideChat.noActive')}</option>}
        {activeRows.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}
      </Select>
      <Button variant="ghost" size="compact" disabled={pending} className="workspace-icon-button shrink-0" aria-label={t('sideChat.new')} onClick={()=>void create()}><Plus size={16}/></Button>
      <Button variant="ghost" size="compact" className="workspace-icon-button shrink-0" aria-label={t('sideChat.close')} onClick={onClose}><X size={16}/></Button>
    </header>
    <div className="shrink-0 border-b border-border/60 px-3 py-2">
      <p className="text-xs leading-relaxed text-muted-foreground">{t('sideChat.context')}</p>
      {selected&&<div className="mt-1 flex items-center justify-end gap-1">
        <Button variant="ghost" size="compact" className="workspace-icon-button" disabled={pending} aria-label={t('sideChat.rename')} onClick={()=>setRename({id:selected.id,text:selected.title})}><Pencil size={13}/></Button>
        <Button variant="ghost" size="compact" className="workspace-icon-button" disabled={pending} aria-label={t('sideChat.archive')} onClick={()=>void action(selected,{action:'archive'})}><Archive size={13}/></Button>
        <Button variant="ghost" size="compact" className="workspace-icon-button" disabled={pending} aria-label={t('sideChat.openFull')} onClick={()=>void action(selected,{action:'promote'})}><ArrowUpRight size={14}/></Button>
      </div>}
      {rename&&<form className="mt-2 flex gap-1" onSubmit={event=>{event.preventDefault();const row=rows.find(value=>value.id===rename.id);if(row)void action(row,{title:rename.text});}}>
        <UnifiedInput aria-label={t('sideChat.rename')} maxLength={120} className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs"
          value={rename.text} onChange={event=>setRename({...rename,text:event.target.value})}/>
        <Button variant="ghost" size="compact" disabled={pending||!rename.text.trim()} aria-label={t('sideChat.save')}><Check size={16}/></Button>
      </form>}
      {rows.some(row=>row.status!=='active')&&<details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t('sideChat.history')}</summary>
        <div className="max-h-24 overflow-auto">{rows.filter(row=>row.status!=='active').map(row=><div key={row.id} className="mt-2 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{row.title} · {t(`sideChat.status.${row.status}`)}</span>
          {row.status==='archived'&&<Button variant="ghost" size="compact" aria-label={t('sideChat.restore')} onClick={()=>void action(row,{action:'restore'})}><RotateCcw size={13}/></Button>}
          {row.status==='promoted'&&<Button variant="ghost" size="compact" aria-label={t('sideChat.openFull')} onClick={()=>onPromote(row.child_session_id)}><ArrowUpRight size={13}/></Button>}
          {row.status==='failed'&&<span title={row.error||''}>{t('sideChat.failed')}</span>}
        </div>)}</div>
      </details>}
    </div>
    {error&&<div role="alert" className="m-3 rounded-lg border border-destructive/20 p-3 text-xs">
      <p>{error}</p><Button variant="ghost" size="compact" className="mt-2 rounded border px-2 py-1" onClick={()=>{setError('');setAttempt(value=>value+1);}}>{t('sideChat.retry')}</Button>
    </div>}
    {loading?<div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin"/>{t('sideChat.loading')}</div>
      :selected?<div className="min-h-0 flex-1"><ChatInterface key={selected.child_session_id} isSideChat isActive
        selectedProject={project} selectedSession={session}
        contextCutoff={selected.context_frozen_at||undefined} ws={ws} sendMessage={sendMessage} onShowSettings={onShowSettings}
        onNavigateToSession={onPromote} draftInsertion={draft} onDraftInserted={onDraftConsumed} onReturnReply={onReturnReply}
        showThinking={showThinking} showRawParameters={showRawParameters} sendByCtrlEnter={sendByCtrlEnter}/></div>
      :<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
        <p>{t('sideChat.noActive')}</p><Button variant="ghost" size="compact" className="rounded-lg border px-3 py-2" disabled={pending} onClick={()=>void create()}>{t('sideChat.new')}</Button>
      </div>}
  </aside>;
}
