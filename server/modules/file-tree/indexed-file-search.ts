import {execFile} from 'node:child_process';
import {realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

import type {FileTreeNode} from '@/shared/types.js';

const execute=promisify(execFile);
const queryEverything=async(args:string[])=>{
 const {stdout}=await execute('es.exe',args,{windowsHide:true,timeout:2500,maxBuffer:256*1024,encoding:'utf8'});
 return stdout;
};

/** Used by file-tree suffix discovery on Windows; an unavailable or inconclusive index falls back to disk discovery. */
export async function searchIndexedFilePaths(root:string,suffix:string,excluded:readonly string[],query=queryEverything):Promise<{files:FileTreeNode[];truncated:boolean}|null> {
 try {
  const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const absoluteRoot=path.resolve(root);
  // Indexed basename filtering is much faster than a regex over every full path.
  // Validate the complete suffix below; the basename alone never selects a file.
  const pattern='^'+escape(suffix.split('/').pop()!)+'$';
  const output=await query(['-timeout','500','-n','101','-full-path-and-name','-path',absoluteRoot.replaceAll('\\','/'),'-no-match-path','-regex',pattern,'/a-d']);
  const candidates=output.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  // A capped index cannot establish uniqueness; let the normal discovery enforce its limit.
  if(!candidates.length||candidates.length>=101)return null;
  const files:FileTreeNode[]=[];
  const seen=new Set<string>();
  for(const candidate of candidates){
   if(!path.isAbsolute(candidate))return null;
   const relative=path.relative(absoluteRoot,candidate).replaceAll('\\','/');
   if(relative==='..'||relative.startsWith('../')||path.isAbsolute(relative))continue;
   const normalized=relative.toLowerCase(),needle=suffix.toLowerCase();
   if(normalized!==needle&&!normalized.endsWith('/'+needle))continue;
   if(relative.split('/').slice(0,-1).some(part=>excluded.includes(part.toLowerCase())))continue;
   // Do not trust stale index entries or traverse indexed junctions/symlinks.
   const actual=await realpath(candidate);
   if(actual.toLowerCase()!==path.resolve(candidate).toLowerCase())return null;
   const info=await stat(actual);
   if(!info.isFile())return null;
   const key=actual.toLowerCase();
   if(seen.has(key))continue;
   seen.add(key);
   files.push({name:path.basename(actual),path:actual,type:'file',size:info.size,modified:null,permissions:'000',permissionsRwx:'---------'});
  }
  return files.length?{files,truncated:false}:null;
 } catch {return null;}
}
