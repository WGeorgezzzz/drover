import { useTranslation } from 'react-i18next';
import { Button as UnifiedButton } from '@/shared/ui/Button';
import { useRef, useState } from 'react';
import { DialogSurface } from '@/shared/ui/Dialog';
import { Activity, Clock3, Pause, TriangleAlert, X, ICON_SIZE } from '@/shared/icons';

import { api, readApiErrorMessage } from '@/shared/api';
import { describeMonitorSchedule } from '@/shared/utils';
import { useMonitorSummaries, refreshMonitorSummaries } from '@/shared/hooks/useMonitorSummaries';
import type { SessionMonitorSummary } from '@/shared/types';

/** Sidebar, workbench and conversation header expose thread-bound automation without navigating away. */
export function SessionMonitorBadge({sessionId}:{sessionId:string}) {
  const { t } = useTranslation('common');
  const stateLabel=(row:SessionMonitorSummary)=>row.status==='paused'?t('sessionMonitor.paused'):row.consecutive_failures>0?t('sessionMonitor.backoff'):row.running_id?t('sessionMonitor.running'):t('sessionMonitor.enabled');
  const resultLabel=(row:SessionMonitorSummary)=>row.last_error||({succeeded:t('sessionMonitor.succeeded'),failed:t('sessionMonitor.failed'),interrupted:t('sessionMonitor.interrupted'),running:t('sessionMonitor.running')}[row.last_result??'']??t('sessionMonitor.never'));
  const nextLabel=(row:SessionMonitorSummary)=>row.status==='paused'?t('sessionMonitor.pauseSchedule'):new Date(row.next_run_at).toLocaleString();
  const rows=useMonitorSummaries()[sessionId]??[];
  // Details stay attached to the clicked badge and do not change the selected conversation.
  const [open,setOpen]=useState(false);
  // Prevent repeated lifecycle writes and display permission/network failures.
  const [pending,setPending]=useState(false);
  // Preserve rejected action feedback until the next intentional action.
  const [error,setError]=useState('');
  const hold=useRef<ReturnType<typeof setTimeout>>();
  if(!rows.length)return null;
  const failed=rows.some(row=>row.consecutive_failures>0&&row.status==='active');
  const active=rows.some(row=>row.status==='active');
  const label=failed?t('sessionMonitor.badgeBackoff'):active?t('sessionMonitor.badgeEnabled'):t('sessionMonitor.badgePaused');
  const Icon=failed?TriangleAlert:active?Clock3:Pause;
  const action=async(id:string,value:string)=>{
    setPending(true);setError('');
    try{const response=await api.monitors.action(id,value);if(!response.ok)throw new Error(readApiErrorMessage(await response.json())||t('sessionMonitor.actionFailed'));await refreshMonitorSummaries();}
    catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setPending(false);}
  };
  const details=rows.map(row=>[row.name,stateLabel(row),describeMonitorSchedule(row),t('sessionMonitor.next')+nextLabel(row),t('sessionMonitor.result')+resultLabel(row)].join(' · ')).join('\n');
  return <>
    <UnifiedButton variant="ghost" size="compact" type="button" aria-label={label} title={details} data-monitor-session={sessionId} data-monitor-state={failed?'backoff':active?'active':'paused'} className={'mx-1 inline-flex shrink-0 rounded p-1 align-middle '+(failed?'text-warning':active?'text-success':'text-muted-foreground')}
      onPointerDown={event=>{event.stopPropagation();hold.current=setTimeout(()=>setOpen(true),500);}} onPointerUp={()=>clearTimeout(hold.current)} onPointerCancel={()=>clearTimeout(hold.current)} onPointerLeave={()=>clearTimeout(hold.current)}
      onClick={event=>{event.preventDefault();event.stopPropagation();setOpen(true);}} onKeyDown={event=>event.stopPropagation()}><Icon size={ICON_SIZE.compact}/></UnifiedButton>
    {open&&<DialogSurface aria-label={t('sessionMonitor.title')} onClose={()=>setOpen(false)}><div className="fixed inset-0 z-[11000] flex items-center justify-center bg-overlay/40 p-3" onClick={event=>{event.stopPropagation();if(event.target===event.currentTarget)setOpen(false);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape')setOpen(false);}}>
      <section aria-label={t('sessionMonitor.title')} className="max-h-[85dvh] w-full max-w-lg overflow-auto rounded-xl border border-border bg-background p-4 text-foreground shadow-xl">
        <header className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Activity size={16}/>{t('sessionMonitor.title')}</h2><UnifiedButton variant="ghost" size="compact" autoFocus aria-label={t('sessionMonitor.close')} onClick={()=>setOpen(false)}><X size={18}/></UnifiedButton></header>
        <p className="mb-3 text-xs text-muted-foreground">{t('sessionMonitor.hint')}</p>
        {rows.map(row=><article key={row.id} className="mb-2 space-y-2 rounded-lg border border-border p-3"><div className="flex justify-between gap-2"><strong className="text-sm">{row.name}</strong><span className="text-xs">{stateLabel(row)}</span></div>
          <p className="text-xs text-muted-foreground">{describeMonitorSchedule(row)}</p><p className="text-xs">{t('sessionMonitor.next')}{nextLabel(row)}</p><p className="break-words text-xs">{t('sessionMonitor.result')}{resultLabel(row)}</p>
          <div className="flex flex-wrap gap-2">{(row.status==='paused'?['resume','stop']:['pause','run-now','stop']).map(value=><UnifiedButton variant="ghost" size="compact" key={value} disabled={pending||(value==='run-now'&&!!row.running_id)} onClick={()=>void action(row.id,value)} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40">{{resume:t('sessionMonitor.resume'),pause:t('sessionMonitor.pause'),'run-now':t('sessionMonitor.runNow'),stop:t('sessionMonitor.stop')}[value]}</UnifiedButton>)}</div>
        </article>)}{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
      </section>
    </div></DialogSurface>}
  </>;
}
