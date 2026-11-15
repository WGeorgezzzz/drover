import assert from 'node:assert/strict';

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { test, vi } from 'vitest';

import '@/modules/i18n';
import WorkspaceMain from '@/modules/project-workspace/WorkspaceMain';

vi.mock('@/modules/chat',()=>({ChatInterface:()=> <div>Chat content</div>}));
vi.mock('@/modules/git-panel',()=>({GitPanel:()=>null}));
vi.mock('@/modules/file-tree',()=>({FileTree:()=>null}));
vi.mock('@/modules/plugins',()=>({PluginTabContent:()=>null}));
vi.mock('@/modules/browser-use',()=>({useBrowserUseEnabled:()=>false,BrowserUsePanel:()=>null}));
vi.mock('@/modules/task-master',()=>({useTasksSettings:()=>({tasksEnabled:false,isTaskMasterInstalled:false}),useTaskMasterProjectSync:()=>{},TaskMasterPanel:()=>null}));
vi.mock('@/modules/standalone-shell',()=>({StandaloneShell:()=>null}));
vi.mock('@/modules/command-palette',()=>({usePaletteOpsRegister:()=>{},usePaletteOps:()=>({insertComposerText:()=>{}})}));
vi.mock('@/shared/context/UiPreferencesContext',()=>({useUiPreferences:()=>({showThinking:true,showRawParameters:false,sendByCtrlEnter:false}),useSetUiPreference:()=>()=>{}}));
vi.mock('@/shared/hooks/useSelectedProvider',()=>({useSelectedProvider:()=> 'claude'}));
// Render the slots the real header receives so the test sees where the panel is mounted.
vi.mock('@/modules/project-workspace/WorkspaceHeader',()=>({default:({displayOptions,displayOptionsPanel}:{displayOptions?:React.ReactNode;displayOptionsPanel?:React.ReactNode})=>
  <header data-testid="workspace-header">{displayOptions}{displayOptionsPanel}</header>}));
vi.mock('@/modules/project-workspace/hooks/useFileOpenResolver',()=>({useFileOpenResolver:()=>()=>{}}));
vi.mock('@/modules/code-editor',()=>({EditorSidebar:()=>null,useEditorSidebar:()=>({editingFile:null,editorExpanded:false,handleFileOpen:()=>true,handleCloseEditor:()=>{}})}));

const base: React.ComponentProps<typeof WorkspaceMain> = {
  selectedProject:{projectId:'p1',displayName:'Test',fullPath:'/test'},
  selectedSession:{id:'s1',__provider:'claude'},activeTab:'chat',setActiveTab:()=>{},ws:null,sendMessage:()=>{},
  isMobile:false,onMenuClick:()=>{},isLoading:false,onNavigateToSession:()=>{},onSessionEstablished:()=>{},
  onShowSettings:()=>{},externalMessageUpdate:0,newSessionTrigger:0,onProjectSelect:()=>{},onProjectsRefresh:()=>{},onRenameSession:async()=>true,
};

test('display options float outside the header so opening them never moves the conversation',()=>{
  const view=render(<WorkspaceMain {...base}/>);
  const header=view.getByTestId('workspace-header');
  const trigger=view.getByRole('button',{expanded:false});
  fireEvent.click(trigger);
  const panel=view.getByTestId('claude-workspace-controls');
  assert.equal(header.contains(panel),false);
  assert.equal(panel.parentElement,document.body);
  assert.ok(panel.classList.contains('fixed'));
  assert.ok(panel.style.top!=='' && panel.style.right!=='');
  fireEvent.keyDown(window,{key:'Escape'});
  assert.equal(view.queryByTestId('claude-workspace-controls'),null);
});
