import { Dialog as UnifiedDialog, DialogContent as UnifiedDialogContent } from '@/shared/ui/Dialog';
import { Input as UnifiedInput } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { useState } from 'react';
import { X } from '@/shared/icons';
import { api } from '@/shared/api';
import { useTaskMaster } from '@/modules/task-master/context/TaskMasterContext';

type Props = { isOpen: boolean; onClose: () => void };
/** TaskBoard creates a task with a normal form and native backend write. */
export default function CreateTaskModal({ isOpen, onClose }: Props) {
  const { currentProject, refreshTasks } = useTaskMaster();
  // Unsaved task fields remain local until creation succeeds.
  const [title, setTitle] = useState('');
  // Description is user-authored task content rather than a shell instruction.
  const [description, setDescription] = useState('');
  // Submission state prevents duplicate writes from repeated clicks.
  const [busy, setBusy] = useState(false);
  // Failed writes leave the editable form available for retry.
  const [error, setError] = useState('');
  if (!isOpen) return null;
  return <UnifiedDialog open onOpenChange={(open) => { if (!open) { if (!busy) onClose(); } }}><UnifiedDialogContent wrapperClassName="z-50"  className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6"><form onSubmit={async e => {
    e.preventDefault(); if (!currentProject) return; setBusy(true); setError('');
    try { const r = await api.taskmaster.addTask(currentProject.projectId, { title, description }); const data = await r.json(); if (!r.ok) throw new Error(data.message || data.error?.message || '创建失败'); await refreshTasks(); setTitle(''); setDescription(''); onClose(); }
    catch (caught) { setError(String(caught)); } finally { setBusy(false); }
  }} className="contents"><div className="flex justify-between"><h2 className="font-semibold">创建任务</h2><Button variant="ghost" size="compact" type="button" onClick={onClose} aria-label="关闭"><X/></Button></div>
    <label className="block text-sm">任务标题<UnifiedInput required maxLength={300} value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="block text-sm">任务说明<textarea value={description} onChange={e => setDescription(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <p className="text-xs text-muted-foreground">也可以正常聊天，然后在“本对话的任务”中整理待办。</p>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <Button variant="ghost" size="compact" disabled={busy} className="rounded bg-primary px-4 py-2 text-primary-foreground">{busy ? '正在创建…' : '创建任务'}</Button>
  </form></UnifiedDialogContent></UnifiedDialog>;
}
