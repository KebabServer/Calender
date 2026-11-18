import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { expect } from '@playwright/test'

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
try {
  const page = await browser.newPage()
  const project = 'tktgencmwtanxjfkiadc'
  const userId = '67180306-af36-4f9e-96ac-f37c04eda4d0'
  const expires = Math.floor(Date.now() / 1000) + 3600
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: expires })}.mock`
  await page.addInitScript(({ project, session }) => {
    localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session))
  }, { project, session: { access_token: token, refresh_token: 'mock', expires_at: expires, expires_in: 3600, token_type: 'bearer', user: { id: userId, aud: 'authenticated', email: 'watchlist@example.test' } } })
  await page.routeWebSocket(`wss://${project}.supabase.co/**`, socket => socket.close())

  let failRead = true, failWrite = true
  let entries = []
  await page.route(`https://${project}.supabase.co/**`, route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname !== '/rest/v1/watchlist') return route.fulfill({ json: [] })
    const method = request.method()
    if (method === 'POST') {
      const input = request.postDataJSON()
      assert.equal(input.user_id, userId)
      if (failWrite) return route.fulfill({ status: 503, json: { message: 'Could not save title. Try again.' } })
      const entry = { ...input, id: 'mock-watch-item', started: false, watched_on: null, created_at: new Date().toISOString() }
      entries.push(entry)
      return route.fulfill({ json: entry })
    }
    assert.equal(url.searchParams.get('user_id'), `eq.${userId}`)
    if (method === 'GET') {
      assert.ok(url.searchParams.get('select')?.split(',').includes('started'))
      if (failRead) return route.fulfill({ status: 403, json: { message: 'Watchlist unavailable' } })
      return route.fulfill({ json: entries })
    }
    assert.equal(url.searchParams.get('id'), 'eq.mock-watch-item')
    if (method === 'PATCH') {
      const changes = request.postDataJSON()
      if (changes.watched_on === null) assert.deepEqual(changes, { started: true, watched_on: null })
      else {
        assert.deepEqual(Object.keys(changes), ['watched_on'])
        assert.match(changes.watched_on, /^\d{4}-\d{2}-\d{2}$/)
      }
      Object.assign(entries[0], changes)
      return route.fulfill({ json: entries })
    }
    assert.equal(method, 'DELETE')
    entries = []
    return route.fulfill({ status: 204, body: '' })
  })

  await page.goto(process.env.DAYMARK_BASE_URL || 'http://127.0.0.1:4173/Calender/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.calendar-controls h2')).toBeVisible()
  const nav = page.getByRole('navigation')
  await nav.getByRole('button', { name: 'Watchlist', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not load your watchlist')
  failRead = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await title.fill('Example show')
  await page.getByRole('combobox', { name: 'Type' }).selectOption('show')
  const add = page.getByRole('button', { name: 'Add title' })
  await add.click()
  await expect(page.getByRole('alert')).toContainText('Could not save title')
  await expect(title).toHaveValue('Example show')
  failWrite = false
  await add.click()
  const status = page.getByRole('combobox', { name: 'Status for Example show' })
  await status.selectOption({ label: 'In progress' })
  await expect(status).toHaveValue('in_progress')
  assert.equal(entries[0].started, true)
  assert.equal(entries[0].watched_on, null)
  await status.selectOption({ label: 'Finished' })
  await expect(status).toHaveValue('finished')
  assert.match(entries[0].watched_on, /^\d{4}-\d{2}-\d{2}$/)

  entries[0].title = 'Renamed on another device'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('combobox', { name: 'Status for Renamed on another device' })).toHaveValue('finished')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Remove Renamed on another device' }).click()
  await expect(page.getByText('No titles yet.')).toBeVisible()
  assert.equal(entries.length, 0)
  console.log('PASS: owner-scoped watchlist CRUD, draft retained after failed save, and refresh on return')
} finally {
  await browser.close()
}
