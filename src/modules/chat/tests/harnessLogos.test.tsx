import { afterEach, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import assert from 'node:assert/strict';
import ComposerModelMenu from '@/modules/chat/composer/ComposerModelMenu';

vi.mock('react-i18next',()=>({useTranslation:()=>({t:(_key:string,options?:{defaultValue?:string})=>options?.defaultValue || _key})}));
afterEach(cleanup);

test('Antigravity offers one model entry and independent reasoning choices', () => {
  const onSelectModel = vi.fn();
  const onSelectEffort = vi.fn();
  const props = { provider: 'gemini' as const, providerLabel: 'Antigravity', model: 'gemini-4-hydrogen',
    modelOptions: [{ value: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen' }], effort: 'low',
    effortOptions: ['low', 'high', 'xhigh'].map(value => ({ value })), onSelectModel, onSelectEffort, modelsLoading: false };
  render(<ComposerModelMenu {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Select model and reasoning effort' }));
  assert.equal(screen.getAllByRole('menuitemradio', { name: /Gemini 4 Hydrogen/ }).length, 1);
  assert.equal(screen.queryByText('Gemini 4 Hydrogen (Low)'), null);
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'xhigh' }));
  assert.deepEqual(onSelectEffort.mock.calls, [['xhigh']]);
  assert.equal(onSelectModel.mock.calls.length, 0);
  fireEvent.click(screen.getByRole('button', { name: 'Select model and reasoning effort' }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Gemini 4 Hydrogen/ }));
  assert.deepEqual(onSelectModel.mock.calls, [['gemini-4-hydrogen']]);
});

test('Claude composer always shows its harness logo, even for a gateway GPT model', () => {
  render(<ComposerModelMenu provider="claude" providerLabel="Claude" model="gpt-custom" modelOptions={[{value:'gpt-custom',label:'GPT Custom'}]} effort="default" effortOptions={[]} onSelectEffort={()=>{}} onSelectModel={()=>{}} modelsLoading={false}/>);
  const trigger=screen.getByRole('button',{name:'Select model and reasoning effort'});
  assert(within(trigger).getByRole('img',{name:'Claude'}));
  assert(!within(trigger).queryByRole('img',{name:'Codex'}));
  fireEvent.click(trigger);
  const model=screen.getByRole('menuitemradio',{name:/GPT Custom/});
  assert(within(model).getByRole('img',{name:'Claude'}));
});

test('WorkBuddy model entries show WorkBuddy, not the model vendor', () => {
  render(<ComposerModelMenu provider="workbuddy" providerLabel="WorkBuddy" model="deepseek-v4" modelOptions={[{value:'deepseek-v4',label:'DeepSeek V4'}]} effort="default" effortOptions={[]} onSelectEffort={()=>{}} onSelectModel={()=>{}} modelsLoading={false}/>);
  fireEvent.click(screen.getByRole('button',{name:'Select model and reasoning effort'}));
  assert(within(screen.getByRole('menuitemradio',{name:/DeepSeek V4/})).getByRole('img',{name:'WorkBuddy'}));
});
