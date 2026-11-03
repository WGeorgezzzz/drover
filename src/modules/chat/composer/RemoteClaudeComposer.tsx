import { useUiPreferences } from '@/shared/context/UiPreferencesContext';
import type { RemoteClaudeOptions } from '@/shared/types';
import ComposerModelMenu from '@/modules/chat/composer/ComposerModelMenu';
import ComposerPermissionMenu from '@/modules/chat/composer/ComposerPermissionMenu';
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from '@/modules/chat/composer/PromptInput';

type Props = {
  input:string; setInput:(value:string)=>void; disabled:boolean; onSend:()=>void;
  options:RemoteClaudeOptions; models:string[]; onOptions:(options:RemoteClaudeOptions)=>void;
};

/** Remote conversations use the same prompt controls and keyboard preference as local Claude chats. */
export function RemoteClaudeComposer({input,setInput,disabled,onSend,options,models,onOptions}:Props) {
  const {sendByCtrlEnter}=useUiPreferences();
  return <div>
    <PromptInput onSubmit={e=>{e.preventDefault();if(!disabled)onSend()}}>
      <PromptInputTextarea aria-label="远程会话消息" rows={3} value={input} onChange={e=>setInput(e.target.value)}
        placeholder="发给这个会话的 Claude…" onKeyDown={e=>{
          if(e.key!=='Enter' || e.nativeEvent.isComposing || e.keyCode===229 || e.shiftKey)return;
          if(sendByCtrlEnter && !e.ctrlKey && !e.metaKey)return;
          e.preventDefault();if(!disabled)onSend();
        }}/>
      <PromptInputFooter>
        <ComposerModelMenu provider="claude" providerLabel="Claude" model={options.model}
          modelOptions={models.map(value=>({value,label:value}))} modelsLoading={!models.length}
          onSelectModel={model=>onOptions({...options,model})} effort={options.effort}
          effortOptions={['low','medium','high','max'].map(value=>({value}))}
          onSelectEffort={effort=>onOptions({...options,effort})}/>
        <PromptInputSubmit disabled={disabled} aria-label="发送"/>
      </PromptInputFooter>
    </PromptInput>
    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
      <ComposerPermissionMenu providerLabel="Claude" permissionMode={options.permission}
        permissionModes={['acceptEdits','plan','dontAsk','bypassPermissions']}
        onSelectPermissionMode={permission=>onOptions({...options,permission})}/>
      <span>{sendByCtrlEnter?'Ctrl+Enter':'Enter'} 发送 · Shift+Enter 换行</span>
    </div>
  </div>;
}
