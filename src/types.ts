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
  end_time: string | null
  all_day: boolean
  color: string
  note_id: string | null
  created_at: string
  updated_at: string
}

export type View = 'notes' | 'calendar'
export type NoteFilter = 'all' | 'pinned'
export type EventInput = Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>
