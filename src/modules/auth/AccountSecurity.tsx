import { useTranslation } from 'react-i18next';
import { Dialog as UnifiedDialog, DialogContent as UnifiedDialogContent } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield, X } from '@/shared/icons';

import { readAuthErrorMessage } from '@/modules/auth/utils/authErrorMessage';
import { api } from '@/shared/api';
import { useAuth } from '@/modules/auth/context/AuthContext';

type Device={id:string;kind:string;created_at:number;expires_at:number};
async function read(response:Response){const b=await response.json();if(!response.ok)throw Error(readAuthErrorMessage(b)||'账号操作失败');return b;}

/** Settings account tab exposes device revocation and the local/remote account boundary without revealing secrets. */
export function AccountSecurity(){
  const {t}=useTranslation('settings');
  const {user,logout}=useAuth();
  // Keep security management separate from the current chat's state.
  const [open,setOpen]=useState(false);
  // Show server-owned device sessions, refreshed after each revocation.
  const [devices,setDevices]=useState<Device[]>([]);
  // Display only the remote account's configured status, never its password or OTP seed.
  const [remote,setRemote]=useState<{configured:boolean;username?:string}>({configured:false});
  // Prevent overlapping account mutations and retain any failure for the user.
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const load=async()=>{const [d,r]=await Promise.all([api.auth.devices().then(read),api.auth.remoteAccount().then(read)]);setDevices(d.devices);setRemote(r);};
  useEffect(()=>{if(!open)return;void load().catch(e=>setError(e.message));const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open]);
  const revoke=async(id:string)=>{setBusy(true);setError('');try{await read(await api.auth.revokeDevice(id));if(id===user?.authSessionId){logout();setOpen(false);}else await load();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  return <><Button variant="ghost" size="compact" type="button" className="mb-3 gap-2" aria-label={t('accountDevices.title')} onClick={()=>setOpen(true)}><Shield size={16}/>{t('accountDevices.title')}</Button>{open&&createPortal(<UnifiedDialog open onOpenChange={(open) => { if (!open) { setOpen(false); } }}><UnifiedDialogContent wrapperClassName="z-[10000]"  aria-label={t('accountDevices.title')} className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-2xl border bg-background p-5 text-foreground shadow-xl"><header className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{t('accountDevices.title')}</h2><Button variant="ghost" size="compact" type="button" aria-label={t('common:buttons.close')} onClick={()=>setOpen(false)}><X size={20}/></Button></header><p className="text-sm">{t('accountDevices.currentUser',{name:user?.username})}</p><p className="mt-2 text-sm text-muted-foreground">{t('accountDevices.boundary')}</p><p className="my-4 rounded-lg bg-muted p-3 text-sm">{t('accountDevices.remoteAccount',{name:remote.configured?remote.username:t('accountDevices.unconfigured')})}</p>{error&&<p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}<h3 className="mb-3 font-medium">{t('accountDevices.devices')}</h3>{devices.map(d=><div key={d.id} className="mb-2 flex items-center gap-2 rounded-lg border p-3"><div className="min-w-0 flex-1 text-sm"><p>{t(`accountDevices.${d.kind==='local'?'local':d.kind==='remote'?'remote':'password'}`)}{d.id===user?.authSessionId?t('accountDevices.currentDevice'):''}</p><p className="text-xs text-muted-foreground">{t('accountDevices.loggedIn',{time:new Date(d.created_at).toLocaleString()})}</p></div><Button variant="ghost" size="compact" type="button" disabled={busy} className="rounded-md border px-3 py-1 text-sm" onClick={()=>void revoke(d.id)}>{t('accountDevices.revoke')}</Button></div>)}<p className="mt-3 text-xs text-muted-foreground">{t('accountDevices.revokeHint')}</p></UnifiedDialogContent></UnifiedDialog>,document.body)}</>;
}
