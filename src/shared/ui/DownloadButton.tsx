import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadFile } from '@/shared/download';

export default function DownloadButton({projectId,path}:{projectId?:string;path:string}) {
  const [error,setError]=useState('');
  return <span className="shrink-0"><button type="button" aria-label="下载" title="下载" disabled={!projectId} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded p-2 hover:bg-accent" onClick={()=>{setError('');if(projectId)void downloadFile(projectId,path).catch(e=>setError(String(e.message)));}}><Download size={16}/></button>{error&&<span role="alert" className="text-xs text-red-600">{error}</span>}</span>;
}
