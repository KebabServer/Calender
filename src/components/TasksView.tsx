import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Task } from '../types'

type Props = {
  tasks: Task[]; busy: boolean; onDraftChange: (dirty: boolean) => void
  onAdd: (title: string) => Promise<void>
  onChange: (id: string, changes: Partial<Pick<Task, 'title' | 'completed'>>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function TasksView({ tasks, busy, onDraftChange, onAdd, onChange, onDelete }: Props) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'all' | 'done'>('all')
  const [error, setError] = useState('')
  useEffect(() => { onDraftChange(Boolean(draft.trim() || editingId)) }, [draft, editingId, onDraftChange])
  const open = tasks.filter(t => !t.completed).length
  const visible = tasks.filter(t => filter === 'all' || (filter === 'done' ? t.completed : !t.completed))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || b.created_at.localeCompare(a.created_at))
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const title = draft.trim()
    if (busy || !title) return
    setError('')
    try {
      if (editingId) await onChange(editingId, { title })
      else { await onAdd(title); setFilter('all') }
      setDraft(''); setEditingId(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save task') }
  }
  async function change(task: Task) {
    setError('')
    try { await onChange(task.id, { completed: !task.completed }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update task') }
  }
  async function remove(task: Task) {
    setError('')
    try {
      await onDelete(task.id)
      if (editingId === task.id) { setEditingId(null); setDraft('') }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete task') }
  }
  return <section className="tasks-view" aria-labelledby="tasks-heading">
    <div className="tasks-heading"><h1 id="tasks-heading">To-do list</h1><span>{open} open</span></div>
    <form className="task-compose" onSubmit={submit}>
      <label className="sr-only" htmlFor="task-title">Task title</label>
      <input id="task-title" value={draft} onChange={e => setDraft(e.target.value)} maxLength={500} placeholder="Add a task…" autoComplete="off" disabled={busy}/>
      <button className="button primary" disabled={busy || !draft.trim()} aria-label={editingId ? 'Save task' : 'Add task'}>{editingId ? <Check size={18}/> : <Plus size={18}/>}</button>
      {(draft || editingId) && <button type="button" className="icon-button" disabled={busy} aria-label="Cancel task edit" onClick={() => { setDraft(''); setEditingId(null) }}><X size={17}/></button>}
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="task-filters" role="group" aria-label="Task filters">
      {(['all', 'open', 'done'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'open' ? 'Open' : value === 'all' ? 'All' : 'Done'}</button>)}
    </div>
    <ul className="task-list">{visible.map(task => <li key={task.id} className={`task-row ${task.completed ? 'task-completed' : ''}`}>
      <input type="checkbox" checked={task.completed} disabled={busy} aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.title}`} onChange={() => void change(task)}/>
      <span className="task-title">{task.title}</span>
      <button className="icon-button" disabled={busy || Boolean(draft || editingId)} aria-label={`Edit ${task.title}`} onClick={() => { setDraft(task.title); setEditingId(task.id); setError('') }}><Pencil size={15}/></button>
      <button className="icon-button" disabled={busy} aria-label={`Delete ${task.title}`} onClick={() => void remove(task)}><Trash2 size={15}/></button>
    </li>)}</ul>
    {!visible.length && <p className="tasks-empty">{tasks.length ? `No ${filter === 'done' ? 'completed' : 'open'} tasks.` : 'No tasks yet.'}</p>}
  </section>
}
