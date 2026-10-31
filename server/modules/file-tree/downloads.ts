import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import express from 'express';
import JSZip from 'jszip';
import { getCurrentUserContext, withUserContext } from '@/modules/auth/index.js';
import { AppError } from '@/shared/utils.js';
import { parseByteRange } from './file-tree.service.js';

type Grant = {userId:number; target:string; directory:boolean; name:string; expires:number; validate:(p:string)=>Promise<string>};
/** Opaque capability: no account credential or client-controlled path travels in the URL. */
export function createDownloadGrants(now = Date.now) {
  const grants = new Map<string, Grant>();
  return {
    issue(value: Omit<Grant, 'expires'>) {
      for (const [key,g] of grants) if(g.expires <= now()) grants.delete(key);
      if(grants.size >= 4096) throw new AppError('Too many downloads; retry shortly', {statusCode:429});
      const token=randomBytes(32).toString('base64url');
      grants.set(token,{...value,expires:now()+120000});
      return {url:'/api/downloads/'+token,expiresAt:new Date(now()+120000).toISOString()};
    },
    get(token:string) {
      const g=grants.get(token);
      if(!g || g.expires <= now()) {grants.delete(token);throw new AppError('Download link expired', {statusCode:403});}
      return g;
    },
  };
}
const grants=createDownloadGrants();
export function attachmentDisposition(name:string) {
  const base=path.basename(name.replace(/\\/g,'/')).replace(/[\x00-\x1f\x7f]/g,'_') || 'download';
  const fallback=base.replace(/[^\x20-\x7e]|["\\]/g,'_');
  const encoded=encodeURIComponent(base).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
export async function issueDownload(target:string,directory:boolean,validate:Grant['validate'],name?:string) {
  const userId=getCurrentUserContext()?.userId;
  if(!userId) throw new AppError('Authentication required', {statusCode:401});
  const stats=await fs.promises.stat(target);
  if(stats.isDirectory() !== directory || (!directory && !stats.isFile())) throw new AppError('Download type mismatch', {statusCode:400});
  return grants.issue({userId,target,directory,validate,name:(name || path.basename(target))+(directory?'.zip':'')});
}

/** ZIP stores file data as streams; only bounded directory metadata is retained. Symlinks are rejected. */
export async function directoryArchive(target:string,validate:Grant['validate']) {
  const zip=new JSZip();let count=0;
  async function walk(dir:string,relative:string) {
    for await(const entry of await fs.promises.opendir(dir)) {
      if(++count>10000) throw new AppError('Directory exceeds 10000 entries', {statusCode:413});
      const p=path.join(dir,entry.name), name=relative+entry.name;
      const checked=await validate(p), canonical=await fs.promises.realpath(p);
      if(checked!==canonical || !canonical.startsWith(target+path.sep) || entry.isSymbolicLink()) throw new AppError('Archive path forbidden', {statusCode:403});
      if(entry.isDirectory()) {zip.folder(name);await walk(p,name+'/');}
      else if(entry.isFile()) zip.file(name,Readable.from((async function*(){
        const current=await validate(p);
        if(current!==canonical || await fs.promises.realpath(p)!==canonical) throw new AppError('Archive path changed',{statusCode:403});
        for await (const chunk of fs.createReadStream(p)) yield chunk;
      })()),{binary:true});
    }
  }
  await walk(target,'');
  return zip.generateNodeStream({streamFiles:true,compression:'STORE'});
}
export const downloadRoutes=express.Router();
downloadRoutes.get('/:token',async(req,res)=>{
  try {
    if(Object.keys(req.query).length) throw new AppError('Download target cannot be overridden', {statusCode:403});
    const grant=grants.get(req.params.token);
    await withUserContext(grant.userId,async()=>{
      const checked=await grant.validate(grant.target);
      if(await fs.promises.realpath(checked)!==grant.target) throw new AppError('Download target changed', {statusCode:403});
      res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Disposition':attachmentDisposition(grant.name)});
      if(grant.directory) {
        res.type('application/zip');
        if(req.method==='HEAD') {res.end();return;}
        const stream=await directoryArchive(grant.target,grant.validate);
        await pipeline(stream,res);return;
      }
      const stat=await fs.promises.stat(grant.target);
      const range=req.headers.range?parseByteRange(req.headers.range,stat.size):null;
      res.set('Accept-Ranges','bytes');
      if(range==='unsatisfiable') {res.set('Content-Range',`bytes */${stat.size}`);res.status(416).end();return;}
      res.type('application/octet-stream');
      if(range) {res.status(206).set('Content-Range',`bytes ${range.start}-${range.end}/${stat.size}`).set('Content-Length',String(range.end-range.start+1));}
      else res.set('Content-Length',String(stat.size));
      if(req.method==='HEAD') {res.end();return;}
      await pipeline(fs.createReadStream(grant.target,range || undefined),res);
    });
  } catch(e) {
    if(res.headersSent) {res.destroy();return;}
    res.status(e instanceof AppError?e.statusCode:(e as NodeJS.ErrnoException).code==='ENOENT'?404:500).json({error:e instanceof AppError?e.message:'Download unavailable'});
  }
});
