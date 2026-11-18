import { expect, test } from '@playwright/test'

test('seven-day agenda and event search work across months on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.clock.setFixedTime(new Date('2026-11-30T12:00:00Z'))
  await page.addInitScript(() => {
    const key = 'daymark_demo_v1'
    if (localStorage.getItem(key)) return
    const event = (id: string, title: string, event_date: string, description = '') => ({
      id, title, event_date, description, all_day: false, start_time: '09:00', end_time: '10:00',
      color: 'purple', note_id: null, created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z',
    })
    localStorage.setItem(key, JSON.stringify({ notes: [], tasks: [], watchlist: [], events: [
      event('past', 'Yesterday only', '2026-11-29'),
      event('today', 'Today first', '2026-11-30'),
      event('tomorrow', 'December meeting', '2026-12-01'),
      event('end', 'End of agenda', '2026-12-06'),
      event('outside', 'Outside agenda', '2026-12-07'),
      event('future', 'Summer outing', '2027-06-20', 'Pack a waterproof jacket.'),
      { ...event('recurring', 'Weekly check-in', '2026-11-23'), recurrence: 'weekly', repeat_until: '2026-12-15' },
    ] }))
  })
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.calendar-controls h2')).toHaveText('Nov 2026')
  const agenda = page.getByRole('button', { name: 'Next 7 days', exact: true })
  const search = page.getByRole('button', { name: 'Search calendar', exact: true })
  await expect(agenda).toBeInViewport({ ratio: 1 })
  await expect(search).toBeInViewport({ ratio: 1 })
  await agenda.click()
  await expect(page.getByRole('heading', { name: 'Next 7 days' })).toBeVisible()
  await expect(page.locator('.calendar-grid')).toHaveCount(0)
  const upcoming = page.locator('.calendar-upcoming')
  await expect(upcoming.getByRole('button', { name: /Today first/ })).toBeVisible()
  await expect(upcoming.getByRole('button', { name: /Weekly check-in/ })).toBeVisible()
  await expect(upcoming.getByRole('button', { name: /December meeting/ })).toBeVisible()
  await expect(upcoming.getByRole('button', { name: /End of agenda/ })).toBeVisible()
  await expect(upcoming).not.toContainText(/Yesterday only|Outside agenda/)

  await search.click()
  const input = page.getByRole('searchbox', { name: 'Search events' })
  const matches = page.getByRole('list', { name: 'Matching events' })
  await expect(input).toBeFocused()
  await input.fill('not a matching phrase')
  await expect(page.getByText('No matching events.')).toBeVisible()
  await input.fill('WEEKLY CHECK')
  await expect(matches.getByRole('button', { name: /Weekly check-in/ })).toContainText('Nov 30, 2026')
  await input.fill('WATERPROOF')
  await matches.getByRole('button', { name: /Summer outing/ }).click()
  await expect(page.locator('.calendar-controls h2')).toHaveText('Jun 2027')
  await expect(page.locator('.calendar-day.selected-day')).toHaveAccessibleName(/June 20, 2027/)
  await expect(page.locator('.day-agenda-heading')).toBeFocused()
  await expect(page.locator('.calendar-day-panel')).toContainText('Summer outing')
  await expect(input).toHaveCount(0)

  await agenda.click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const setting = page.getByRole('checkbox', { name: 'Next 7 days agenda' })
  await setting.uncheck()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(agenda).toHaveCount(0)
  await expect(page.locator('.calendar-grid')).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.calendar-grid')).toBeVisible()
  await expect(agenda).toHaveCount(0)
  await expect(search).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(setting).not.toBeChecked()
  await setting.check()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(agenda).toBeVisible()
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy()
})
