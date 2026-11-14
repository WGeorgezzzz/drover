import '@/modules/i18n';
import assert from 'node:assert/strict';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,test,vi } from 'vitest';
import { openLocalFile } from '@/shared/localPath';
import { DesktopUpdateBanner } from '@/shared/ui/DesktopUpdateBanner';
import { api } from '@/shared/api';
const copy=vi.hoisted(()=>vi.fn(async()=>true));
vi.mock('@/shared/utils',async(importOriginal)=>({...await importOriginal<typeof import('@/shared/utils')>(),copyTextToClipboard:copy}));
vi.mock('@/shared/api',()=>({api:{system:{restartDesktop:vi.fn(async()=>({ok:true}))}}}));
const host=window as unknown as {cloudcliDesktopNotifications?:{getCapabilities?:()=>Promise<{localPaths:boolean;updated:boolean;restart:boolean}>;revealLocalPath?:()=>Promise<unknown>}};
afterEach(()=>{cleanup();delete host.cloudcliDesktopNotifications;vi.clearAllMocks();});
test('an old main process yields a friendly restart message and copies the folder',async()=>{
  const reveal=vi.fn(async()=>{throw new Error("No handler registered for cloudcli-desktop:reveal-local-path");});host.cloudcliDesktopNotifications={revealLocalPath:reveal};
  await assert.rejects(openLocalFile('D:/work/report.md',true),/桌面端需重启/);
  assert.equal(copy.mock.calls.length,1);
});
test('missing native capabilities show a restart button without invoking an unknown IPC',async()=>{
  host.cloudcliDesktopNotifications={};render(<DesktopUpdateBanner/>);
  fireEvent.click(await screen.findByRole('button',{name:'Restart desktop'}));
  await waitFor(()=>assert.equal(vi.mocked(api.system.restartDesktop).mock.calls.length,1));
});
