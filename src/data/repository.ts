import { format, addDays, subDays, addHours } from 'date-fns'
import type { CalendarEvent, EventInput, Note } from '../types'
import { supabase } from '../lib/supabase'

export interface Repository {
  getNotes(): Promise<Note[]>
  getEvents(): Promise<CalendarEvent[]>
  createNote(): Promise<Note>
  saveNote(id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'pinned'>>): Promise<void>
  removeNote(id: string): Promise<void>
  createEvent(input: EventInput): Promise<CalendarEvent>
  saveEvent(id: string, updates: EventInput): Promise<void>
  removeEvent(id: string): Promise<void>
}

function demoSeed(): { notes: Note[]; events: CalendarEvent[] } {
  const now = new Date()
  const stamp = now.toISOString()
  const d = (offset: number) => format(addDays(now, offset), 'yyyy-MM-dd')
  const time = (hours: number) => format(addHours(now, hours), 'HH:mm')
  return {
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
    if (raw) return JSON.parse(raw) as ReturnType<typeof demoSeed>
  } catch { /* If storage is unavailable, seed fresh data */ }
  const value = demoSeed()
  writeDemo(value)
  return value
}
function writeDemo(value: ReturnType<typeof demoSeed>) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(value))
}

export const demoRepository: Repository = {
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
  async saveEvent(id, updates) {
    const state = readDemo()
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
  return {
    async getNotes() {
      const { data, error } = await client.from('notes').select('id,title,content,pinned,created_at,updated_at').eq('user_id', userId).order('updated_at', { ascending: false })
      assertNoError(error)
      return (data || []) as Note[]
    },
    async getEvents() {
      const { data, error } = await client.from('events').select('id,title,description,event_date,start_time,end_time,all_day,color,note_id,created_at,updated_at').eq('user_id', userId).order('event_date')
      assertNoError(error)
      return (data || []) as CalendarEvent[]
    },
    async createNote() {
      const { data, error } = await client.from('notes').insert({ user_id: userId, title: '', content: '', pinned: false }).select('id,title,content,pinned,created_at,updated_at').single()
      assertNoError(error)
      return data as Note
    },
    async saveNote(id, updates) {
      const { error } = await client.from('notes').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
      assertNoError(error)
    },
    async removeNote(id) {
      const { error } = await client.from('notes').delete().eq('id', id).eq('user_id', userId)
      assertNoError(error)
    },
    async createEvent(input) {
      const { data, error } = await client.from('events').insert({ ...input, user_id: userId }).select('id,title,description,event_date,start_time,end_time,all_day,color,note_id,created_at,updated_at').single()
      assertNoError(error)
      return data as CalendarEvent
    },
    async saveEvent(id, updates) {
      const { error } = await client.from('events').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
      assertNoError(error)
    },
    async removeEvent(id) {
      const { error } = await client.from('events').delete().eq('id', id).eq('user_id', userId)
      assertNoError(error)
    },
  }
}
