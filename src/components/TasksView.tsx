import { useEffect, useState } from 'react'
import { CalendarDays, Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { format, isValid, parseISO } from 'date-fns'
import type { Task, TaskInput, TaskUpdates } from '../types'
import { MAX_REFRESH_DAYS, nextIntervalTaskRefresh, taskRefreshDays, TASK_TIMEZONE } from '../lib/task-refresh'
import { LinkedText } from './TextLinks'

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
  const [refresh, setRefresh] = useState(false)
  const [interval, setInterval] = useState('7')
  const [refreshTime, setRefreshTime] = useState('17:45')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [filter, setFilter] = useState<'open' | 'all' | 'done'>('all')
  const [error, setError] = useState('')
  const dirty = Boolean(draft.trim() || description.trim() || dueDate || refresh || editingTask)
  useEffect(() => { onDraftChange(dirty) }, [dirty, onDraftChange])
  const hasDraft = Boolean(draft || description || dueDate || refresh || editingTask)
  const today = format(new Date(), 'yyyy-MM-dd')
  const open = tasks.filter(t => !t.completed).length
  const visible = tasks.filter(t => filter === 'all' || (filter === 'done' ? t.completed : !t.completed))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || b.created_at.localeCompare(a.created_at))
  function reset() { setDraft(''); setDescription(''); setDueDate(''); setRefresh(false); setInterval('7'); setRefreshTime('17:45'); setEditingTask(null); setError('') }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const title = draft.trim()
    if (busy || !title) return
    if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !isValid(parseISO(dueDate)))) { setError('Choose a valid due date.'); return }
    setError('')
    try {
      const details = { title, description: description.trim(), due_date: dueDate || null }
      const days = refresh ? Number(interval) : null
      if (days !== null) nextIntervalTaskRefresh(days, refreshTime)
      const input: TaskInput = { ...details, refresh_weekday: null, refresh_interval_days: days,
        refresh_time: refresh ? refreshTime : null, refresh_timezone: TASK_TIMEZONE }
      if (editingTask) {
        const changedSchedule = days !== taskRefreshDays(editingTask)
          || input.refresh_time !== (editingTask.refresh_time?.slice(0, 5) ?? null)
        await onChange(editingTask.id, changedSchedule ? input : details)
      } else { await onAdd(input); setFilter('all') }
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
      if (editingTask?.id === task.id) reset()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete task') }
  }
  return active ? <section className="tasks-view" aria-labelledby="tasks-heading">
    <div className="tasks-heading"><h1 id="tasks-heading">To-do list</h1><span>{open} open</span></div>
    <form className="task-compose" onSubmit={submit}>
      <div className="task-compose-main">
        <label className="sr-only" htmlFor="task-title">Task title</label>
        <input id="task-title" value={draft} onChange={e => setDraft(e.target.value)} maxLength={500} placeholder="Add a task…" autoComplete="off" disabled={busy}/>
        <button className="button primary" disabled={busy || !draft.trim()} aria-label={editingTask ? 'Save task' : 'Add task'}>{editingTask ? <Check size={18}/> : <Plus size={18}/>}</button>
        {hasDraft && <button type="button" className="icon-button" disabled={busy} aria-label="Cancel task edit" onClick={reset}><X size={17}/></button>}
      </div>
      <div className="task-compose-details">
        <div className="task-field"><label htmlFor="task-description">Description</label><textarea id="task-description" rows={2} maxLength={5000} placeholder="Optional" value={description} onChange={e => setDescription(e.target.value)} disabled={busy}/></div>
        <div className="task-field"><div className="task-field-heading"><label htmlFor="task-due-date">Due date</label>{dueDate && <button type="button" className="task-clear-date" aria-label="Clear due date" disabled={busy} onClick={() => setDueDate('')}><X size={14}/></button>}</div><input id="task-due-date" type="date" min="0001-01-01" max="9999-12-31" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={busy}/></div>
      </div>
      <label className="task-refresh-toggle"><input type="checkbox" checked={refresh} disabled={busy} onChange={e => setRefresh(e.target.checked)}/>Refresh</label>
      {refresh && <div className="task-refresh-fields">
        <div className="task-field">
          <label htmlFor="task-refresh-days">Every (days)</label>
          <input id="task-refresh-days" type="number" inputMode="numeric" required min={1} max={MAX_REFRESH_DAYS} step={1} disabled={busy} value={interval} onChange={e => setInterval(e.target.value)}/>
        </div>
        <div className="task-field">
          <label htmlFor="task-refresh-time">Time (Helsinki)</label>
          <input id="task-refresh-time" type="time" required step={60} min="00:00" max="23:59" disabled={busy} value={refreshTime} onChange={e => setRefreshTime(e.target.value)}/>
        </div>
        {!editingTask && <p>The first refresh is after this many days.</p>}
      </div>}
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="task-filters" role="group" aria-label="Task filters">
      {(['all', 'open', 'done'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'open' ? 'Open' : value === 'all' ? 'All' : 'Done'}</button>)}
    </div>
    <ul className="task-list">{visible.map(task => {
      const days = taskRefreshDays(task)
      return <li key={task.id} className={`task-row ${task.completed ? 'task-completed' : ''}`}>
        <input type="checkbox" checked={task.completed} disabled={busy} aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.title}`} onChange={() => void change(task)}/>
        <div className="task-content"><span className="task-title">{task.title}</span>{task.description && <p className="task-description"><LinkedText text={task.description}/></p>}{task.due_date && <time className={`task-due ${!task.completed && task.due_date < today ? 'task-overdue' : ''}`} dateTime={task.due_date}><CalendarDays size={12}/>{!task.completed && task.due_date < today ? 'Overdue · ' : 'Due '}{format(parseISO(task.due_date), 'd MMM yyyy')}</time>}{days !== null && task.refresh_time && <span className="task-refresh"><RefreshCw size={12}/>{days === 1 ? 'Every day' : `Every ${days} days`} · {task.refresh_time.slice(0, 5)} Helsinki</span>}</div>
        <button className="icon-button" disabled={busy || hasDraft} aria-label={`Edit ${task.title}`} onClick={() => { setDraft(task.title); setDescription(task.description ?? ''); setDueDate(task.due_date ?? ''); setRefresh(days !== null); setInterval(String(days ?? 7)); setRefreshTime(task.refresh_time?.slice(0, 5) ?? '17:45'); setEditingTask(task); setError('') }}><Pencil size={15}/></button>
        <button className="icon-button" disabled={busy} aria-label={`Delete ${task.title}`} onClick={() => void remove(task)}><Trash2 size={15}/></button>
      </li>
    })}</ul>
    {!visible.length && <p className="tasks-empty">{tasks.length ? `No ${filter === 'done' ? 'completed' : 'open'} tasks.` : 'No tasks yet.'}</p>}
  </section> : null
}
