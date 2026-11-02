import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';

import { GlobalTasksPage } from '@/modules/task-master/GlobalTasksPage';

const calls=vi.hoisted(()=>({legacy:vi.fn(),models:vi.fn(),views:vi.fn()}));
vi.mock('@/shared/api',()=>({authenticatedFetch:async()=>new Response(JSON.stringify({settings:{enabled:false}})),inboxTasksApi:{list:calls.legacy,views:calls.views},api:{providers:{models:calls.models}}}));
vi.mock('@/modules/task-master/IntelligentTasksPanel',()=>({IntelligentTasksPanel:({projectId}:{projectId?:string})=><div>Smart tasks {projectId}</div>}));
afterEach(()=>{cleanup();vi.clearAllMocks();});

test('the semantic task route does not mount the legacy task loader or eagerly request models',async()=>{
  render(<MemoryRouter initialEntries={['/tasks?project=alpha']}><GlobalTasksPage onMenuClick={()=>{}}/></MemoryRouter>);
  await screen.findByText('Smart tasks alpha');
  expect(calls.legacy).not.toHaveBeenCalled();
  expect(calls.views).not.toHaveBeenCalled();
  expect(calls.models).not.toHaveBeenCalled();
});
