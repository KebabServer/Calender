import { addWeeks, format, parseISO } from 'date-fns'
import type { CalendarEvent, EventInput } from '../types'

// Match calendar weekdays, not elapsed milliseconds, so DST never shifts a series.
export function occursOn(event: CalendarEvent, day: Date): boolean {
  const date = format(day, 'yyyy-MM-dd')
  if (event.recurrence !== 'weekly') return event.event_date === date
  return date >= event.event_date && (!event.repeat_until || date <= event.repeat_until)
    && parseISO(event.event_date).getDay() === day.getDay()
}

export function durationMinutes(event: Pick<CalendarEvent, 'start_time' | 'end_time'>): number | null {
  if (!event.start_time || !event.end_time) return null
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  return minutes(event.end_time) - minutes(event.start_time)
}

export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours ? `${hours}h` : '', rest ? `${rest}m` : ''].filter(Boolean).join(' ')
}

export function endTimeForDuration(start: string, minutes: number | null): string | null {
  if (minutes === null) return null
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('Enter a duration of at least 1 minute.')
  const total = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes
  if (total > 1440) throw new Error('This duration extends past midnight. Choose a shorter duration or ? Unknown.')
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function eventTimeLabel(event: CalendarEvent): string {
  if (event.all_day) return 'All day'
  const start = event.start_time?.slice(0, 5)
  const duration = durationMinutes(event)
  return start ? `${start} · ${duration === null ? '?' : durationLabel(duration)}` : 'Time not set'
}

// Copies are independent rows. Calendar-week arithmetic preserves local times at DST.
export function weeklyCopies(input: EventInput, count: number): EventInput[] {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('Choose between 1 and 10 copies.')
  return Array.from({ length: count }, (_, i) => ({
    ...input, recurrence: 'none', repeat_until: null,
    event_date: format(addWeeks(parseISO(input.event_date), i + 1), 'yyyy-MM-dd'),
  }))
}
