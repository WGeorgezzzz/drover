import assert from 'node:assert/strict';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, test, vi} from 'vitest';
import {LocalFileLink} from '@/modules/chat/transcript/LocalFileLink';
import {MarkdownWorkspaceContext} from '@/modules/chat/context/MarkdownWorkspaceContext';

const {readFileBlob, resolveFileSuffix, preview} = vi.hoisted(() => ({readFileBlob:vi.fn(),resolveFileSuffix:vi.fn(),preview:vi.fn()}));
vi.mock('@/shared/api', () => ({api:{readFileBlob,resolveFileSuffix}}));
beforeEach(() => {readFileBlob.mockResolvedValue({ok:false,status:404});resolveFileSuffix.mockResolvedValue({ok:true,json:async()=>({files:[],truncated:false})});});
afterEach(() => {cleanup();vi.resetAllMocks();});
function show(cwd?: string, directories: string[] = []) {
 render(<MarkdownWorkspaceContext.Provider value={{projectId:'p',projectPath:'D:/embodied',cwd}}><LocalFileLink href="#" fileReference="paper-v10/main_zh.pdf" directories={directories} onPreview={preview}>paper</LocalFileLink></MarkdownWorkspaceContext.Provider>);
 fireEvent.click(screen.getByRole('link',{name:'paper'}));
}
test('missing relative PDF resolves by suffix even with no session cwd', async () => {
 const path='D:/embodied/ras-realign-crlb-20261031/paper-v10/main_zh.pdf';
 resolveFileSuffix.mockResolvedValue({ok:true,json:async()=>({files:[{path}],truncated:false})});
 show();
 await waitFor(()=>assert.equal(preview.mock.calls[0]?.[0],path));
 assert.equal(resolveFileSuffix.mock.calls[0][1],'paper-v10/main_zh.pdf');
});
test('overlapping directory hint avoids paper-v10/paper-v10 and exact matches skip search', async () => {
 const path='D:/embodied/task/paper-v10/main_zh.pdf';
 readFileBlob.mockImplementation(async (_id, candidate)=>({ok:candidate===path,status:candidate===path?200:404}));
 show('D:/embodied/task',['paper-v10/']);
 await waitFor(()=>assert.equal(preview.mock.calls[0]?.[0],path));
 assert.ok(readFileBlob.mock.calls.every(call=>!call[1].includes('paper-v10/paper-v10')));
 assert.equal(resolveFileSuffix.mock.calls.length,0);
});
test('multiple suffix matches require choosing a path', async () => {
 const paths=['D:/embodied/a/paper-v10/main_zh.pdf','D:/embodied/b/paper-v10/main_zh.pdf'];
 resolveFileSuffix.mockResolvedValue({ok:true,json:async()=>({files:paths.map(path=>({path})),truncated:false})});
 show();
 await waitFor(()=>assert.ok(screen.getByRole('button',{name:paths[1]})));
 assert.equal(preview.mock.calls.length,0);
 fireEvent.click(screen.getByRole('button',{name:paths[1]}));
 await waitFor(()=>assert.equal(preview.mock.calls[0]?.[0],paths[1]));
});
test('incomplete search never treats one partial match as unique', async () => {
 resolveFileSuffix.mockResolvedValue({ok:true,json:async()=>({files:[{path:'D:/embodied/a/paper-v10/main_zh.pdf'}],truncated:true})});
 show();
 await waitFor(()=>assert.match(screen.getByRole('alert').textContent??'',/未完成/));
 assert.equal(preview.mock.calls.length,0);
});

test('a genuinely nested same-name directory preserves exact relative-path semantics', async () => {
 const path='D:/embodied/paper-v10/paper-v10/main_zh.pdf';
 readFileBlob.mockResolvedValue({ok:true,status:200});
 show('D:/embodied/paper-v10');
 await waitFor(()=>assert.equal(preview.mock.calls[0]?.[0],path));
 assert.equal(resolveFileSuffix.mock.calls.length,0);
});

test('permission failures do not fall back to a different project file', async () => {
 readFileBlob.mockResolvedValue({ok:false,status:403});
 show();
 await waitFor(()=>assert.match(screen.getByRole('alert').textContent??'',/403/));
 assert.equal(resolveFileSuffix.mock.calls.length,0);
 assert.equal(preview.mock.calls.length,0);
});

