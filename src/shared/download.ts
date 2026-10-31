import { authenticatedFetch } from '@/shared/api';

async function launchDownload(endpoint:string, body:Record<string, unknown>) {
  const response=await authenticatedFetch(endpoint,{method:'POST',body:JSON.stringify(body)});
  if(!response.ok) throw new Error((await response.json().catch(()=>null))?.error || '下载失败，请重试');
  const {url}=await response.json() as {url:string};
  if(!url.startsWith('/api/downloads/')) throw new Error('Invalid download URL');
  const anchor=document.createElement('a');
  anchor.href=url; anchor.download=''; anchor.rel='noreferrer';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
}
/** Native navigation lets the browser stream bytes to its download manager. */
export const downloadFile=(projectId:string,path:string,directory=false)=>launchDownload('/api/file-tree/projects/'+encodeURIComponent(projectId)+'/download-ticket',{path,directory});
export const downloadAttachment=(filename:string,name:string)=>launchDownload('/api/assets/files/'+encodeURIComponent(filename)+'/download-ticket',{name});
