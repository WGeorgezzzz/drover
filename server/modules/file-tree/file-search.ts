import { spawn } from 'node:child_process';
import path from 'node:path';
import { rgPath } from '@vscode/ripgrep';
import type { FileTreeNode } from '@/shared/types.js';
import {searchIndexedFilePaths} from './indexed-file-search.js';

const EXCLUDED = ['node_modules','.git','.svn','.hg','.venv','venv','__pycache__','dist','build','.next','.nuxt','.cache','.parcel-cache','.pytest_cache','.mypy_cache','.tox','target','vendor','.gradle','.idea','coverage','.nyc_output'];
/** File-tree service filename discovery: bounded time/count, no content reads or symlink traversal. */
export async function searchFilePaths(root: string, query: string, respectGitignore = true, exactSuffix = false): Promise<{files: FileTreeNode[]; truncated: boolean}> {
  const normalized = query.slice(0,512).replaceAll('\\','/');
  const needle = exactSuffix && process.platform !== 'win32' ? normalized : normalized.toLowerCase();
  if(exactSuffix && !respectGitignore && process.platform==='win32'){
    const indexed=await searchIndexedFilePaths(root,normalized,EXCLUDED);
    if(indexed)return indexed;
  }
  return new Promise((resolve,reject) => {
    const args = ['--files','--hidden','--null','--line-buffered','--no-ignore-parent','--no-require-git', ...(respectGitignore ? [] : ['--no-ignore']), ...EXCLUDED.flatMap(name => ['-g','!**/'+name+'/**'])];
    // Push the literal suffix into ripgrep so unrelated files never fill the pipe.
    if (exactSuffix) args.unshift(process.platform === 'win32' ? '--iglob' : '--glob', '**/' + normalized.replace(/[\\*?\[\]{}]/g, '\\$&'));
    const child = spawn(rgPath,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const files: FileTreeNode[] = []; let pending = '', truncated = false, error = '', settled = false;
    // Windows can take time to deliver the close event after termination. The
    // response budget includes that wait: settle before signalling the child.
    const finish = () => {if(settled)return;settled=true;clearTimeout(timer);resolve({files,truncated});};
    const timer = setTimeout(() => {truncated = true;finish();child.kill();},exactSuffix ? 60000 : 1100);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data',(chunk: string) => {
      if(settled)return;
      const parts = (pending + chunk).split('\0'); pending = parts.pop() || '';
      for (const relative of parts) {
        const candidate = exactSuffix && process.platform !== 'win32' ? relative.replaceAll('\\','/') : relative.replaceAll('\\','/').toLowerCase();
        if (exactSuffix ? candidate !== needle && !candidate.endsWith('/' + needle) : !candidate.includes(needle)) continue;
        if (files.length >= 100) {truncated = true;finish();child.kill();break;}
        files.push({name:path.basename(relative),path:path.resolve(root,relative),type:'file',size:0,modified:null,permissions:'000',permissionsRwx:'---------'});
      }
    });
    child.stderr.on('data',(chunk: string) => {error = (error + chunk).slice(0,1000);});
    child.on('error',cause => {if(settled)return;settled=true;clearTimeout(timer);reject(cause);});
    child.on('close',code => {if(settled)return;if(code && code > 1){settled=true;clearTimeout(timer);reject(Error(error || 'File search failed'));}else finish();});
  });
}
