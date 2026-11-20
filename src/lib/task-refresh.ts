import type { Task } from '../types'

export const TASK_TIMEZONE = 'Europe/Helsinki'
export const MAX_REFRESH_DAYS = 365_000
const dayMilliseconds = 86400000
const refreshTimePattern = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/
const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: TASK_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
function wallTime(instant: number): number {
  const parts = formatter.formatToParts(instant)
  const n = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
}
function instantForWallTime(wall: number): number {
  const offsets = new Set([-36, 0, 36].map(hours => {
    const instant = wall + hours * 3600000
    return wallTime(instant) - instant
  }))
  const candidates = [...offsets].map(offset => wall - offset)
  const exact = candidates.filter(instant => wallTime(instant) === wall)
  // Match Postgres: use the later occurrence in autumn; shift forward through a spring gap.
  return exact.length ? Math.max(...exact) : Math.min(...candidates.filter(instant => wallTime(instant) > wall))
}

export function nextTaskRefresh(weekday: number, time: string, after = Date.now()): string {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !refreshTimePattern.test(time)) throw new Error('Choose a valid refresh day and time.')
  const local = new Date(wallTime(after)), [hour, minute] = time.split(':').map(Number)
  const delta = (weekday - (local.getUTCDay() || 7) + 7) % 7
  let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + delta, hour, minute)
  let instant = instantForWallTime(target)
  if (instant <= after) { target += 7 * 86400000; instant = instantForWallTime(target) }
  return new Date(instant).toISOString()
}

export function nextIntervalTaskRefresh(days: number, time: string, after = Date.now(), previous?: string): string {
  if (!Number.isInteger(days) || days < 1 || days > MAX_REFRESH_DAYS || !refreshTimePattern.test(time)) {
    throw new Error('Choose a positive whole number of days and a valid refresh time.')
  }
  const day = (instant: number) => Math.floor(wallTime(instant) / dayMilliseconds)
  const today = day(after)
  const anchor = previous ? day(Date.parse(previous)) : today + days
  const elapsed = Math.max(0, today - anchor)
  const [hour, minute] = time.split(':').map(Number)
  let target = (anchor + Math.floor(elapsed / days) * days) * dayMilliseconds + (hour * 60 + minute) * 60000
  let instant = instantForWallTime(target)
  if (instant <= after) { target += days * dayMilliseconds; instant = instantForWallTime(target) }
  return new Date(instant).toISOString()
}

export function taskRefreshDays(task: Task): number | null {
  return task.refresh_interval_days ?? (task.refresh_weekday != null ? 7 : null)
}

export function taskRefreshDue(task: Task, now = Date.now()): boolean {
  return task.next_refresh_at != null && new Date(task.next_refresh_at).getTime() <= now
}
export function refreshDemoTask(task: Task, now = Date.now()): Task {
  if (!taskRefreshDue(task, now) || task.refresh_time == null) return task
  const next = task.refresh_interval_days != null
    ? nextIntervalTaskRefresh(task.refresh_interval_days, task.refresh_time, now, task.next_refresh_at!)
    : nextTaskRefresh(task.refresh_weekday!, task.refresh_time, now)
  return { ...task, completed: false, updated_at: new Date(now).toISOString(), next_refresh_at: next }
}
