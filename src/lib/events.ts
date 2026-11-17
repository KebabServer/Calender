import { format, parseISO } from 'date-fns'
import type { CalendarEvent } from '../types'

// Match calendar weekdays, not elapsed milliseconds, so DST never shifts a series.
export function occursOn(event: CalendarEvent, day: Date): boolean {
  const date = format(day, 'yyyy-MM-dd')
  if (event.recurrence !== 'weekly') return event.event_date === date
  return date >= event.event_date && (!event.repeat_until || date <= event.repeat_until)
    && parseISO(event.event_date).getDay() === day.getDay()
}

export function eventTimeRange(event: CalendarEvent): string {
  if (event.all_day) return 'All day'
  const start = event.start_time?.slice(0, 5)
  const end = event.end_time?.slice(0, 5)
  return start ? `${start}${end ? `–${end}` : ''}` : 'Time not set'
}
