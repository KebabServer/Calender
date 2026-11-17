import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }]) {
  test(`compact event editor at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByLabel('Duration', { exact: true })).toHaveValue('60')
    await expect(page.getByRole('group', { name: 'Event priority' }).getByRole('button').first()).toHaveAccessibleName('High priority')
    const time = (await page.getByLabel('Start time').boundingBox())!
    const duration = (await page.getByLabel('Duration', { exact: true }).boundingBox())!
    expect(Math.abs(time.y - duration.y)).toBeLessThan(2)
    expect(Math.abs(time.height - duration.height)).toBeLessThan(2)
    expect(time.x + time.width).toBeLessThanOrEqual(duration.x)
    const form = page.locator('.dialog-form')
    expect(await form.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight + 1)).toBeTruthy()
    await expect(page.getByRole('button', { name: 'Create event', exact: true })).toBeInViewport()
    await page.getByLabel('Event title').fill('Compact priority event')
    await page.getByRole('button', { name: 'High priority', exact: true }).click()
    await page.getByText('More details', { exact: true }).click()
    await page.getByLabel('Description').fill('Keep this description')
    await page.getByLabel('Link a note').selectOption('demo-note-3')
    await page.getByRole('button', { name: 'Create event', exact: true }).click()
    await page.locator('.day-event-main').filter({ hasText: 'Compact priority event' }).click()
    await expect(page.getByRole('button', { name: 'High priority', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.event-extra-details')).not.toHaveAttribute('open', '')
    expect(await form.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBeTruthy()
    await page.screenshot({ path: `test-results/event-editor-${viewport.width}.png` })
    await page.getByText('More details', { exact: true }).click()
    await expect(page.getByLabel('Description')).toHaveValue('Keep this description')
    await expect(page.getByLabel('Link a note')).toHaveValue('demo-note-3')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeInViewport()
  })
}
