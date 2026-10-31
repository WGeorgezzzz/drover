import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import DownloadButton from '@/shared/ui/DownloadButton';
const downloadFile=vi.hoisted(()=>vi.fn().mockResolvedValue(undefined));
vi.mock('@/shared/download',()=>({downloadFile}));
afterEach(cleanup);
it('preview download remains a visible button and reports errors',async()=>{
 downloadFile.mockResolvedValue(undefined);
 render(<DownloadButton projectId="p" path="D:/中文.txt"/>);
 fireEvent.click(screen.getByRole('button',{name:'下载'}));
 await waitFor(()=>expect(downloadFile).toHaveBeenCalledWith('p','D:/中文.txt'));
 downloadFile.mockRejectedValueOnce(new Error('denied'));
 fireEvent.click(screen.getByRole('button',{name:'下载'}));
 expect((await screen.findByRole('alert')).textContent).toContain('denied');
});
