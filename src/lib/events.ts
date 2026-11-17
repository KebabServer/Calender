import { addWeeks, format, parseISO } from 'date-fns'
import type { CalendarEvent, EventInput } from '../types'

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

// Copies are independent rows. Calendar-week arithmetic preserves local times at DST.
export function weeklyCopies(input: EventInput, count: number): EventInput[] {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('Choose between 1 and 10 copies.')
  return Array.from({ length: count }, (_, i) => ({
    ...input, recurrence: 'none', repeat_until: null,
    event_date: format(addWeeks(parseISO(input.event_date), i + 1), 'yyyy-MM-dd'),
  }))
}
