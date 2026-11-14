import { Button as UnifiedButton } from '@/shared/ui/Button';
import { useState } from 'react';
import { Download } from '@/shared/icons';
import { downloadFile } from '@/shared/download';

export default function DownloadButton({projectId,path}:{projectId?:string;path:string}) {
  const [error,setError]=useState('');
  return <span className="shrink-0"><UnifiedButton variant="ghost" size="compact" type="button" aria-label="下载" title="下载" disabled={!projectId} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded p-2 hover:bg-accent" onClick={()=>{setError('');if(projectId)void downloadFile(projectId,path).catch(e=>setError(String(e.message)));}}><Download size={16}/></UnifiedButton>{error&&<span role="alert" className="text-xs text-destructive">{error}</span>}</span>;
}
