import { api, readApiJson } from '@/shared/api';

async function launchDownload(response: Promise<Response>) {
  const {url}=await readApiJson<{url:string}>(await response);
  if(!url.startsWith('/api/downloads/')) throw new Error('Invalid download URL');
  const anchor=document.createElement('a');
  anchor.href=url; anchor.download=''; anchor.rel='noreferrer';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
}
/** Native navigation lets the browser stream bytes to its download manager. */
export const downloadFile=(projectId:string,path:string,directory=false)=>launchDownload(api.downloads.fileTicket(projectId,path,directory));
export const downloadAttachment=(filename:string,name:string)=>launchDownload(api.downloads.attachmentTicket(filename,name));
