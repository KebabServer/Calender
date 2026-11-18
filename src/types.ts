export type Note = {
  id: string
  title: string
  content: string
  pinned: boolean
  created_at: string
  updated_at: string
}

export type CalendarEvent = {
  id: string
  title: string
  description: string
  event_date: string // YYYY-MM-DD, independent of device timezone
  start_time: string | null // local wall-clock time, HH:mm
  end_time: string | null // null on a timed event means unknown duration
  all_day: boolean
  color: string
  recurrence?: 'none' | 'weekly' // Missing on older browser demo records.
  repeat_until?: string | null // Inclusive final date; null means no end.
  note_id: string | null
  created_at: string
  updated_at: string
}

export type Task = {
  id: string
  title: string
  description: string
  due_date: string | null // Calendar date, YYYY-MM-DD; no timezone conversion.
  completed: boolean
  created_at: string
  updated_at: string
}

export type TaskInput = Pick<Task, 'title' | 'description' | 'due_date'>
export type TaskUpdates = Partial<TaskInput & Pick<Task, 'completed'>>

export type View = 'notes' | 'calendar' | 'tasks' | 'weather'
export type NoteFilter = 'all' | 'pinned'
export type EventInput = Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>
