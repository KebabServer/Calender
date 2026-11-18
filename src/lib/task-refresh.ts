import type { Task } from '../types'

export const TASK_TIMEZONE = 'Europe/Helsinki'
export const refreshDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
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
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(time)) throw new Error('Choose a valid refresh day and time.')
  const local = new Date(wallTime(after)), [hour, minute] = time.split(':').map(Number)
  const delta = (weekday - (local.getUTCDay() || 7) + 7) % 7
  let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + delta, hour, minute)
  let instant = instantForWallTime(target)
  if (instant <= after) { target += 7 * 86400000; instant = instantForWallTime(target) }
  return new Date(instant).toISOString()
}

export function taskRefreshDue(task: Task, now = Date.now()): boolean {
  return task.refresh_weekday !== null && task.refresh_time !== null && task.next_refresh_at !== null && new Date(task.next_refresh_at).getTime() <= now
}
export function refreshDemoTask(task: Task, now = Date.now()): Task {
  return taskRefreshDue(task, now) ? { ...task, completed: false, updated_at: new Date(now).toISOString(), next_refresh_at: nextTaskRefresh(task.refresh_weekday!, task.refresh_time!, now) } : task
}
