import { afterEach, expect, test, vi } from 'vitest';

import { inboxTasksApi } from '@/shared/api';
vi.mock('@/shared/authToken',()=>({getStoredAuthToken:()=>localStorage.getItem('auth-token'),storeAuthToken:vi.fn(),expireAuthSession:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});

test('concurrent task snapshots share transport and retain independently readable bodies',async()=>{
  let resolve!:(response:Response)=>void;
  const fetcher=vi.fn(()=>new Promise<Response>(done=>{resolve=done;}));vi.stubGlobal('fetch',fetcher);
  localStorage.setItem('auth-token','user-a');
  const first=inboxTasksApi.intelligence(),second=inboxTasksApi.intelligence();
  resolve(new Response(JSON.stringify({tasks:[{id:'one'}]})));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await (await first).json()).toEqual(await (await second).json());
});

test('finished snapshots and different identities never reuse a prior response',async()=>{
  const fetcher=vi.fn(async()=>new Response('{}'));vi.stubGlobal('fetch',fetcher);
  localStorage.setItem('auth-token','user-a');const first=inboxTasksApi.intelligence();
  localStorage.setItem('auth-token','user-b');const second=inboxTasksApi.intelligence();
  await Promise.all([first,second]);await inboxTasksApi.intelligence();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test('failed requests release the pending entry for retry',async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response('{}'));vi.stubGlobal('fetch',fetcher);
  await expect(inboxTasksApi.intelligence()).rejects.toThrow('offline');
  expect((await inboxTasksApi.intelligence()).ok).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
});


test('a completed mutation forces a fresh snapshot even while an earlier read is pending',async()=>{
  let resolveOld!:(response:Response)=>void;
  const fetcher=vi.fn()
    .mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveOld=resolve;}))
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(new Response(JSON.stringify({tasks:[{id:'updated'}]})));
  vi.stubGlobal('fetch',fetcher);
  const old=inboxTasksApi.intelligence();
  await inboxTasksApi.action('project','one','done');
  const fresh=inboxTasksApi.intelligence();
  resolveOld(new Response(JSON.stringify({tasks:[{id:'old'}]})));
  expect(await (await fresh).json()).toEqual({tasks:[{id:'updated'}]});
  await old;
  expect(fetcher).toHaveBeenCalledTimes(3);
});
