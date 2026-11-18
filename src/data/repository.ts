import { format, addDays, subDays, addHours } from 'date-fns'
import type { CalendarEvent, EventInput, Note, Task, TaskInput, TaskUpdates } from '../types'
import { weeklyCopies } from '../lib/events'
import { supabase } from '../lib/supabase'

export interface Repository {
  getTasks(): Promise<Task[]>
  createTask(input: TaskInput): Promise<Task>
  saveTask(id: string, updates: TaskUpdates): Promise<Task>
  removeTask(id: string): Promise<void>
  restoreTask(task: Task): Promise<Task>
  getNotes(): Promise<Note[]>
  getEvents(): Promise<CalendarEvent[]>
  createNote(): Promise<Note>
  saveNote(id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'pinned'>>): Promise<void>
  removeNote(id: string): Promise<void>
  createEvent(input: EventInput): Promise<CalendarEvent>
  saveEvent(id: string, updates: EventInput): Promise<void>
  saveEventWithCopies(input: EventInput, id: string | undefined, count: number): Promise<CalendarEvent[]>
  removeEvent(id: string): Promise<void>
}

function demoSeed(): { notes: Note[]; events: CalendarEvent[]; tasks: Task[] } {
  const now = new Date()
  const stamp = now.toISOString()
  const d = (offset: number) => format(addDays(now, offset), 'yyyy-MM-dd')
  const time = (hours: number) => format(addHours(now, hours), 'HH:mm')
  return {
    tasks: [],
    notes: [
      { id: 'demo-note-1', title: 'A little space to think', content: '## Welcome to Daymark ✨\n\nYour thoughts deserve a calm place to land. Capture ideas, keep plans close, and make space for the important things.\n\n- [x] Explore your notes\n- [ ] Add a new note\n- [ ] Plan something on your calendar\n\n**Tip:** Your demo notes live in this browser. Connect Supabase when you are ready to sync devices.', pinned: true, created_at: stamp, updated_at: stamp },
      { id: 'demo-note-2', title: 'Ideas worth keeping', content: '## Small sparks\n\n- A weekend photo walk\n- Build a morning reading habit\n- Try a new recipe on Sunday\n\n> Good ideas grow when you write them down.', pinned: false, created_at: subDays(now, 2).toISOString(), updated_at: subDays(now, 1).toISOString() },
      { id: 'demo-note-3', title: 'Weekly reset', content: '## This week\n\n- [ ] Clear the inbox\n- [ ] Plan the week ahead\n- [ ] Make time for something creative\n\nA little bit of planning goes a long way.', pinned: false, created_at: subDays(now, 5).toISOString(), updated_at: subDays(now, 3).toISOString() },
    ],
    events: [
      { id: 'demo-event-1', title: 'Weekly planning', description: 'Look over the coming days and set priorities.', event_date: d(0), start_time: time(2), end_time: time(3), all_day: false, color: 'purple', note_id: 'demo-note-3', created_at: stamp, updated_at: stamp },
      { id: 'demo-event-2', title: 'Creative hour', description: 'Time for something new.', event_date: d(2), start_time: '16:00', end_time: '17:00', all_day: false, color: 'mint', note_id: null, created_at: stamp, updated_at: stamp },
      { id: 'demo-event-3', title: 'Slow Sunday', description: 'Keep it easy.', event_date: d(5), start_time: null, end_time: null, all_day: true, color: 'peach', note_id: null, created_at: stamp, updated_at: stamp },
    ],
  }
}

const DEMO_KEY = 'daymark_demo_v1'
function readDemo() {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (raw) {
      const value = JSON.parse(raw) as ReturnType<typeof demoSeed>
      return { ...value, tasks: (value.tasks ?? []).map(task => ({ ...task, description: task.description ?? '', due_date: task.due_date ?? null })) }
    }
  } catch { /* If storage is unavailable, seed fresh data */ }
  const value = demoSeed()
  writeDemo(value)
  return value
}
function writeDemo(value: ReturnType<typeof demoSeed>) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(value))
}

export const demoRepository: Repository = {
  async getTasks() { return readDemo().tasks },
  async createTask(input) {
    const state = readDemo()
    const now = new Date().toISOString()
    const task: Task = { ...input, id: crypto.randomUUID(), completed: false, created_at: now, updated_at: now }
    state.tasks.unshift(task); writeDemo(state); return task
  },
  async saveTask(id, updates) {
    const state = readDemo()
    const current = state.tasks.find(t => t.id === id)
    if (!current) throw new Error('Task not found')
    const saved = { ...current, ...updates, updated_at: new Date().toISOString() }
    state.tasks = state.tasks.map(t => t.id === id ? saved : t)
    writeDemo(state); return saved
  },
  async restoreTask(task) {
    const state = readDemo()
    const existing = state.tasks.find(t => t.id === task.id)
    if (existing) return existing
    state.tasks.push(task); writeDemo(state); return task
  },
  async removeTask(id) {
    const state = readDemo(); state.tasks = state.tasks.filter(t => t.id !== id); writeDemo(state)
  },
  async getNotes() { return readDemo().notes },
  async getEvents() { return readDemo().events },
  async createNote() {
    const state = readDemo()
    const now = new Date().toISOString()
    const note: Note = { id: crypto.randomUUID(), title: '', content: '', pinned: false, created_at: now, updated_at: now }
    state.notes.unshift(note)
    writeDemo(state)
    return note
  },
  async saveNote(id, updates) {
    const state = readDemo()
    if (!state.notes.some(note => note.id === id)) throw new Error('This note was deleted. Your draft is still here; copy it into a new note or export your data.')
    state.notes = state.notes.map(n => n.id === id ? { ...n, ...updates, updated_at: new Date().toISOString() } : n)
    writeDemo(state)
  },
  async removeNote(id) {
    const state = readDemo()
    state.notes = state.notes.filter(n => n.id !== id)
    state.events = state.events.map(e => e.note_id === id ? { ...e, note_id: null } : e)
    writeDemo(state)
  },
  async createEvent(input) {
    const state = readDemo()
    const now = new Date().toISOString()
    const event: CalendarEvent = { ...input, id: crypto.randomUUID(), created_at: now, updated_at: now }
    state.events.push(event)
    writeDemo(state)
    return event
  },
  async saveEventWithCopies(input, id, count) {
    const copies = weeklyCopies(input, count)
    const state = readDemo()
    const original = id ? state.events.find(e => e.id === id) : undefined
    if (id && !original) throw new Error('Event not found')
    const now = new Date().toISOString()
    const source: CalendarEvent = { ...input, recurrence: 'none', repeat_until: null, id: id ?? crypto.randomUUID(), created_at: original?.created_at ?? now, updated_at: now }
    const created: CalendarEvent[] = copies.map(copy => ({ ...copy, id: crypto.randomUUID(), created_at: now, updated_at: now }))
    state.events = [...state.events.filter(e => e.id !== source.id), source, ...created]
    writeDemo(state)
    return [source, ...created]
  },
  async saveEvent(id, updates) {
    const state = readDemo()
    if (!state.events.some(event => event.id === id)) throw new Error('This event was deleted. Your changes have not been saved.')
    state.events = state.events.map(e => e.id === id ? { ...e, ...updates, updated_at: new Date().toISOString() } : e)
    writeDemo(state)
  },
  async removeEvent(id) {
    const state = readDemo()
    state.events = state.events.filter(e => e.id !== id)
    writeDemo(state)
  },
}

function assertNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export function createCloudRepository(userId: string): Repository {
  if (!supabase) throw new Error('Cloud is not configured')
  const client = supabase
  const taskColumns = 'id,title,description,due_date,completed,created_at,updated_at'
  return {
    async getTasks() {
      const { data, error } = await client.from('tasks').select(taskColumns).eq('user_id', userId).order('created_at', { ascending: false })
      assertNoError(error); return (data || []) as Task[]
    },
    async createTask(input) {
      const { data, error } = await client.from('tasks').insert({ ...input, user_id: userId, completed: false }).select(taskColumns).single()
      assertNoError(error); return data as Task
    },
    async saveTask(id, updates) {
      const { data, error } = await client.from('tasks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select(taskColumns).single()
      assertNoError(error); return data as Task
    },
    async restoreTask(task) {
      // Ignore an existing ID: another device may have already restored/edited it.
      const { data, error } = await client.from('tasks').upsert({ id: task.id, user_id: userId, title: task.title, description: task.description, due_date: task.due_date, completed: task.completed, created_at: task.created_at, updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: true }).select(taskColumns)
      assertNoError(error)
      if (data?.[0]) return data[0] as Task
      const { data: existing, error: readError } = await client.from('tasks').select(taskColumns).eq('id', task.id).eq('user_id', userId).single()
      assertNoError(readError); return existing as Task
    },
    async removeTask(id) {
      const { error } = await client.from('tasks').delete().eq('id', id).eq('user_id', userId)
      assertNoError(error)
    },
    async getNotes() {
      const { data, error } = await client.from('notes').select('id,title,content,pinned,created_at,updated_at').eq('user_id', userId).order('updated_at', { ascending: false })
      assertNoError(error)
      return (data || []) as Note[]
    },
    async getEvents() {
      const { data, error } = await client.from('events').select('id,title,description,event_date,start_time,end_time,all_day,color,note_id,recurrence,repeat_until,created_at,updated_at').eq('user_id', userId).order('event_date')
      assertNoError(error)
      return (data || []) as CalendarEvent[]
    },
    async createNote() {
      const { data, error } = await client.from('notes').insert({ user_id: userId, title: '', content: '', pinned: false }).select('id,title,content,pinned,created_at,updated_at').single()
      assertNoError(error)
      return data as Note
    },
    async saveNote(id, updates) {
      const { data, error } = await client.from('notes').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select('id').maybeSingle()
      assertNoError(error)
      if (!data) throw new Error('This note was deleted on another device. Your draft is still here; copy it into a new note or export your data.')
    },
    async removeNote(id) {
      const { error } = await client.from('notes').delete().eq('id', id).eq('user_id', userId)
      assertNoError(error)
    },
    async createEvent(input) {
      const { data, error } = await client.from('events').insert({ ...input, user_id: userId }).select('id,title,description,event_date,start_time,end_time,all_day,color,note_id,recurrence,repeat_until,created_at,updated_at').single()
      assertNoError(error)
      return data as CalendarEvent
    },
    async saveEventWithCopies(input, id, count) {
      weeklyCopies(input, count) // Validate the same bounds as demo mode before sending.
      const { data, error } = await client.rpc('save_event_with_copies', { p_event_id: id ?? null, p_input: input, p_copy_count: count })
      assertNoError(error)
      return data as CalendarEvent[]
    },
    async saveEvent(id, updates) {
      const { data, error } = await client.from('events').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select('id').maybeSingle()
      assertNoError(error)
      if (!data) throw new Error('This event was deleted on another device. Your changes have not been saved.')
    },
    async removeEvent(id) {
      const { error } = await client.from('events').delete().eq('id', id).eq('user_id', userId)
      assertNoError(error)
    },
  }
}
