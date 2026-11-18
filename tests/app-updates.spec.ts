import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const current = JSON.parse(readFileSync('dist/version.json', 'utf8')).version

test('idle calendar resumes into a fresh URL once without clearing browser data', async ({ page }) => {
  let latest = current
  let checks = 0
  await page.clock.setFixedTime(new Date())
  await page.addInitScript(() => localStorage.setItem('sign-in-marker', 'keep-me'))
  await page.route('**/version.json*', route => { checks++; return route.fulfill({ json: { version: latest } }) })
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.calendar-controls h2')).toBeVisible()
  expect(new URL(page.url()).searchParams.has('daymark_release')).toBeFalsy()
  latest = 'new-release-for-resume'
  await page.clock.setFixedTime(new Date(Date.now() + 6000))
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  await expect(page).toHaveURL(/daymark_release=new-release-for-resume/)
  await expect(page.locator('.calendar-controls h2')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('sign-in-marker'))).toBe('keep-me')
  // The fixture still serves the old bundle; the URL guard prevents a reload loop.
  await expect(page.getByRole('button', { name: 'Update now' })).toBeVisible()
  expect(checks).toBeLessThan(5)
})

test('an update waits for event drafts and flushes pending notes before reload', async ({ page }) => {
  let latest = current
  const now = Date.now()
  await page.clock.setFixedTime(new Date(now))
  await page.route('**/version.json*', route => route.fulfill({ json: { version: latest } }))
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Add event', exact: true }).click()
  await page.getByLabel('Event title').fill('Unsubmitted event')
  latest = 'new-release-with-drafts'
  await page.clock.setFixedTime(new Date(now + 6000))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('button', { name: 'Update now' })).toBeDisabled()
  await expect(page.getByLabel('Event title')).toHaveValue('Unsubmitted event')
  // Keep the current release marker so cancelling the event does not auto-navigate.
  await page.evaluate(version => history.replaceState(null, '', `?daymark_release=${version}`), latest)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Create note', exact: true }).click()
  await page.getByLabel('Note title', { exact: true }).fill('Update draft')
  await page.getByLabel('Note content').fill('Text immediately before update')
  await page.getByRole('button', { name: 'Update now' }).click()
  await expect(page.locator('.calendar-controls h2')).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: 'Notes', exact: true }).click()
  await page.locator('.note-list-card').filter({ hasText: 'Update draft' }).click()
  await expect(page.locator('.markdown-preview')).toHaveText('Text immediately before update')
})

test('invalid version responses leave the existing app usable', async ({ page }) => {
  await page.route('**/version.json*', route => route.fulfill({ body: '<html>not a release</html>', contentType: 'text/html' }))
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.calendar-controls h2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update now' })).toHaveCount(0)
})

test('automatic updates wait while a deleted task can still be restored', async ({ page }) => {
  let latest = current
  await page.clock.setFixedTime(new Date())
  await page.route('**/version.json*', route => route.fulfill({ json: { version: latest } }))
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await nav.getByRole('button', { name: 'To-do', exact: true }).click()
  await page.getByLabel('Task title').fill('Keep this task')
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByRole('button', { name: 'Delete Keep this task', exact: true }).click()
  latest = 'release-during-task-undo'
  await page.clock.setFixedTime(new Date(Date.now() + 6000))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await nav.getByRole('button', { name: 'Calendar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update now' })).toHaveCount(0)
  expect(new URL(page.url()).searchParams.has('daymark_release')).toBeFalsy()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page).toHaveURL(/daymark_release=release-during-task-undo/)
  await nav.getByRole('button', { name: 'To-do', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Complete Keep this task', exact: true })).toBeVisible()
})
