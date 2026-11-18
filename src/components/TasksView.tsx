import { useEffect, useState } from 'react'
import { CalendarDays, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { format, isValid, parseISO } from 'date-fns'
import type { Task, TaskInput, TaskUpdates } from '../types'

type Props = {
  active: boolean
  tasks: Task[]; busy: boolean; onDraftChange: (dirty: boolean) => void
  onAdd: (input: TaskInput) => Promise<void>
  onChange: (id: string, changes: TaskUpdates) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function TasksView({ active, tasks, busy, onDraftChange, onAdd, onChange, onDelete }: Props) {
  const [draft, setDraft] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'all' | 'done'>('all')
  const [error, setError] = useState('')
  const dirty = Boolean(draft.trim() || description.trim() || dueDate || editingId)
  useEffect(() => { onDraftChange(dirty) }, [dirty, onDraftChange])
  const hasDraft = Boolean(draft || description || dueDate || editingId)
  const today = format(new Date(), 'yyyy-MM-dd')
  const open = tasks.filter(t => !t.completed).length
  const visible = tasks.filter(t => filter === 'all' || (filter === 'done' ? t.completed : !t.completed))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || b.created_at.localeCompare(a.created_at))
  function reset() { setDraft(''); setDescription(''); setDueDate(''); setEditingId(null); setError('') }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const title = draft.trim()
    if (busy || !title) return
    if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !isValid(parseISO(dueDate)))) { setError('Choose a valid due date.'); return }
    setError('')
    const input: TaskInput = { title, description: description.trim(), due_date: dueDate || null }
    try {
      if (editingId) await onChange(editingId, input)
      else { await onAdd(input); setFilter('all') }
      reset()
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
      if (editingId === task.id) reset()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete task') }
  }
  return active ? <section className="tasks-view" aria-labelledby="tasks-heading">
    <div className="tasks-heading"><h1 id="tasks-heading">To-do list</h1><span>{open} open</span></div>
    <form className="task-compose" onSubmit={submit}>
      <div className="task-compose-main">
        <label className="sr-only" htmlFor="task-title">Task title</label>
        <input id="task-title" value={draft} onChange={e => setDraft(e.target.value)} maxLength={500} placeholder="Add a task…" autoComplete="off" disabled={busy}/>
        <button className="button primary" disabled={busy || !draft.trim()} aria-label={editingId ? 'Save task' : 'Add task'}>{editingId ? <Check size={18}/> : <Plus size={18}/>}</button>
        {hasDraft && <button type="button" className="icon-button" disabled={busy} aria-label="Cancel task edit" onClick={reset}><X size={17}/></button>}
      </div>
      <div className="task-compose-details">
        <div className="task-field"><label htmlFor="task-description">Description</label><textarea id="task-description" rows={2} maxLength={5000} placeholder="Optional" value={description} onChange={e => setDescription(e.target.value)} disabled={busy}/></div>
        <div className="task-field"><div className="task-field-heading"><label htmlFor="task-due-date">Due date</label>{dueDate && <button type="button" className="task-clear-date" aria-label="Clear due date" disabled={busy} onClick={() => setDueDate('')}><X size={14}/></button>}</div><input id="task-due-date" type="date" min="0001-01-01" max="9999-12-31" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={busy}/></div>
      </div>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="task-filters" role="group" aria-label="Task filters">
      {(['all', 'open', 'done'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'open' ? 'Open' : value === 'all' ? 'All' : 'Done'}</button>)}
    </div>
    <ul className="task-list">{visible.map(task => <li key={task.id} className={`task-row ${task.completed ? 'task-completed' : ''}`}>
      <input type="checkbox" checked={task.completed} disabled={busy} aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.title}`} onChange={() => void change(task)}/>
      <div className="task-content"><span className="task-title">{task.title}</span>{task.description && <p className="task-description">{task.description}</p>}{task.due_date && <time className={`task-due ${!task.completed && task.due_date < today ? 'task-overdue' : ''}`} dateTime={task.due_date}><CalendarDays size={12}/>{!task.completed && task.due_date < today ? 'Overdue · ' : 'Due '}{format(parseISO(task.due_date), 'd MMM yyyy')}</time>}</div>
      <button className="icon-button" disabled={busy || hasDraft} aria-label={`Edit ${task.title}`} onClick={() => { setDraft(task.title); setDescription(task.description ?? ''); setDueDate(task.due_date ?? ''); setEditingId(task.id); setError('') }}><Pencil size={15}/></button>
      <button className="icon-button" disabled={busy} aria-label={`Delete ${task.title}`} onClick={() => void remove(task)}><Trash2 size={15}/></button>
    </li>)}</ul>
    {!visible.length && <p className="tasks-empty">{tasks.length ? `No ${filter === 'done' ? 'completed' : 'open'} tasks.` : 'No tasks yet.'}</p>}
  </section> : null
}
