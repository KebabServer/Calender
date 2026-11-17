import { expect, test } from '@playwright/test'
import { occursOn, eventTimeRange } from '../src/lib/events'
import type { CalendarEvent } from '../src/types'

const series: CalendarEvent = { id: 'series', title: 'Weekly class', description: '', event_date: '2026-03-22', start_time: '18:00:00', end_time: '19:30:00', all_day: false, color: 'mint', note_id: null, recurrence: 'weekly', repeat_until: '2026-04-05', created_at: '', updated_at: '' }
const day = (value: string) => new Date(`${value}T12:00:00`)

test('weekly date matching respects start, weekday, and inclusive end', () => {
  for (const date of ['2026-03-22', '2026-03-29', '2026-04-05']) expect(occursOn(series, day(date))).toBeTruthy()
  for (const date of ['2026-03-15', '2026-03-23', '2026-04-12']) expect(occursOn(series, day(date))).toBeFalsy()
  expect(occursOn({ ...series, repeat_until: null }, day('2030-03-24'))).toBeTruthy()
  expect(occursOn({ ...series, recurrence: undefined }, day('2026-03-29'))).toBeFalsy()
  expect(eventTimeRange(series)).toBe('18:00–19:30')
  expect(eventTimeRange({ ...series, all_day: true })).toBe('All day')
})

test.describe('weekly event editing on a phone', () => {
  test.use({ viewport: { width: 375, height: 667 }, timezoneId: 'Europe/Helsinki' })
  test('create, persist, edit and delete a weekly series across DST and months', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-03-22T10:00:00Z'))
    await page.goto('./', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Add event', exact: true }).click()
    await page.getByLabel('Event title').fill('Weekly class')
    await page.getByLabel('Start time').fill('18:00')
    await page.getByLabel('End time').fill('17:00')
    await page.getByRole('button', { name: 'Create event', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('End time must be after start time')
    await page.getByLabel('End time').fill('19:30')
    await page.getByLabel('Repeat', { exact: true }).selectOption('weekly')
    await page.getByLabel('Repeat until').fill('2026-04-05')
    await expect(page.locator('.repeat-summary')).toContainText('Every Sunday, 18:00–19:30')
    await page.getByRole('button', { name: 'Create event', exact: true }).click()
    await expect(page.locator('.selected-day .calendar-event-time').filter({ hasText: '18:00–19:30' })).toBeVisible()
    await page.getByRole('button', { name: /^Sunday, March 29, 2026:/ }).click()
    await page.locator('.day-event-main').filter({ hasText: 'Weekly class' }).click()
    await expect(page.getByRole('heading', { name: 'Edit weekly series' })).toBeVisible()
    await expect(page.locator('.repeat-summary')).toContainText('entire series')
    await page.getByLabel('Start time').fill('18:30')
    await page.getByLabel('End time').fill('20:00')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.locator('.day-title')).toContainText('Mar 29, 2026')
    await expect(page.locator('.selected-day .calendar-event-time')).toContainText('18:30–20:00')
    await page.getByRole('button', { name: 'Next month' }).click()
    await page.getByRole('button', { name: /^Sunday, April 5, 2026:/ }).click()
    await expect(page.locator('.selected-day .calendar-event-time')).toContainText('18:30–20:00')
    await page.getByRole('button', { name: /^Sunday, April 12, 2026:/ }).click()
    await expect(page.locator('.day-event-main').filter({ hasText: 'Weekly class' })).toHaveCount(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.selected-day .calendar-event-title').filter({ hasText: 'Weekly class' })).toBeVisible()
    await page.locator('.day-event-main').filter({ hasText: 'Weekly class' }).click()
    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Delete series', exact: true }).click()
    await page.getByRole('button', { name: /^Sunday, March 29, 2026:/ }).click()
    await expect(page.locator('.day-event-main').filter({ hasText: 'Weekly class' })).toHaveCount(0)
  })

  test('two timed labels and overflow count fit compact cells', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-03-22T10:00:00Z'))
    await page.addInitScript(events => localStorage.setItem('daymark_demo_v1', JSON.stringify({ notes: [], events })), [series, { ...series, id: 'second', title: 'Second' }, { ...series, id: 'third', title: 'Third' }])
    await page.goto('./', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.selected-day .calendar-event-time')).toHaveCount(2)
    await expect(page.locator('.selected-day .calendar-more')).toHaveText('+1 more')
    expect(await page.locator('.selected-day').evaluate(el => {
      const last = el.querySelector('.calendar-more')!.getBoundingClientRect()
      return last.bottom <= el.getBoundingClientRect().bottom
    })).toBeTruthy()
    await page.screenshot({ path: 'test-results/weekly-times-mobile.png' })
  })
})
