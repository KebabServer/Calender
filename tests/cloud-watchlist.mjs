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
  const note = 'Private watchlist note'
  await page.route(`https://${project}.supabase.co/**`, route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname !== '/rest/v1/watchlist') return route.fulfill({ json: [] })
    const method = request.method()
    if (method === 'POST') {
      const input = request.postDataJSON()
      assert.equal(input.user_id, userId)
      assert.equal(input.description, note)
      assert.equal(input.season, 2)
      assert.equal(input.episode, 5)
      if (failWrite) return route.fulfill({ status: 503, json: { message: 'Could not save title. Try again.' } })
      const entry = { ...input, id: 'mock-watch-item', started: false, currently_watching: false, watched_on: null, created_at: new Date().toISOString() }
      entries.push(entry)
      return route.fulfill({ json: entry })
    }
    assert.equal(url.searchParams.get('user_id'), `eq.${userId}`)
    if (method === 'GET') {
      assert.ok(url.searchParams.get('select')?.split(',').includes('started'))
      assert.ok(url.searchParams.get('select')?.split(',').includes('description'))
      assert.ok(url.searchParams.get('select')?.split(',').includes('currently_watching'))
      assert.ok(url.searchParams.get('select')?.split(',').includes('season'))
      assert.ok(url.searchParams.get('select')?.split(',').includes('episode'))
      if (failRead) return route.fulfill({ status: 403, json: { message: 'Watchlist unavailable' } })
      return route.fulfill({ json: entries })
    }
    assert.equal(url.searchParams.get('id'), 'eq.mock-watch-item')
    if (method === 'PATCH') {
      const changes = request.postDataJSON()
      if ('episode' in changes) {
        assert.equal(url.searchParams.get('kind'), 'eq.show')
        assert.equal(url.searchParams.get('season'), 'eq.2')
        const expectedEpisode = Number(url.searchParams.get('episode')?.slice(3))
        assert.deepEqual(changes, { episode: expectedEpisode + 1 })
        if (entries[0].episode !== expectedEpisode) return route.fulfill({ json: [] })
        Object.assign(entries[0], changes)
        return route.fulfill({ json: entries })
      }
      assert.equal(typeof changes.currently_watching, 'boolean')
      if (changes.watched_on === null) assert.deepEqual(changes, { started: true, currently_watching: changes.currently_watching, watched_on: null })
      else {
        assert.deepEqual(changes, { currently_watching: false, watched_on: changes.watched_on })
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
  await page.getByRole('button', { name: 'Description', exact: true }).click()
  const description = page.getByRole('textbox', { name: 'Description', exact: true })
  await description.fill(note)
  await page.getByRole('spinbutton', { name: 'Season' }).fill('2')
  const episode = page.getByRole('spinbutton', { name: 'Episode' })
  await episode.fill('5')
  const add = page.getByRole('button', { name: 'Add title' })
  await add.click()
  await expect(page.getByRole('alert')).toContainText('Could not save title')
  await expect(title).toHaveValue('Example show')
  await expect(description).toHaveValue(note)
  await expect(episode).toHaveValue('5')
  failWrite = false
  await add.click()
  const status = page.getByRole('combobox', { name: 'Status for Example show' })
  await status.selectOption({ label: 'In progress' })
  await expect(status).toHaveValue('in_progress')
  await expect(page.getByRole('list', { name: 'In progress', exact: true }).getByText('Example show', { exact: true })).toBeVisible()
  const advance = page.getByRole('button', { name: 'Advance episode for Example show' })
  await expect(page.locator('.watchlist-episode')).toContainText('S02 E05')
  await advance.click()
  await expect(page.locator('.watchlist-episode')).toContainText('S02 E06')
  entries[0].episode = 9
  await advance.click()
  await expect(page.getByRole('alert')).toContainText('Episode progress changed')
  await expect(page.locator('.watchlist-episode')).toContainText('S02 E09')
  await advance.click()
  await expect(page.locator('.watchlist-episode')).toContainText('S02 E10')
  await expect(status).toHaveValue('in_progress')
  assert.equal(entries[0].currently_watching, false)
  await status.selectOption({ label: 'Watching' })
  await expect(status).toHaveValue('watching')
  await expect(page.getByRole('list', { name: 'Currently watching', exact: true }).locator('.watchlist-watching')).toHaveText('Watching')
  await page.getByRole('button', { name: 'Currently watching', exact: true }).click()
  await expect(status).toBeVisible()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  assert.equal(entries[0].started, true)
  assert.equal(entries[0].currently_watching, true)
  assert.equal(entries[0].watched_on, null)
  await status.selectOption({ label: 'Finished' })
  await expect(status).toHaveValue('finished')
  assert.match(entries[0].watched_on, /^\d{4}-\d{2}-\d{2}$/)

  entries[0].title = 'Renamed on another device'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('combobox', { name: 'Status for Renamed on another device' })).toHaveValue('finished')
  await expect(page.locator('.watchlist-description')).toHaveText(note)
  const search = page.getByRole('searchbox', { name: 'Search watchlist' })
  await search.fill('unmatched query')
  await expect(page.getByText('No matching titles.')).toBeVisible()
  await search.fill(note)
  await expect(page.getByRole('combobox', { name: 'Status for Renamed on another device' })).toBeVisible()
  await search.fill('')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Remove Renamed on another device' }).click()
  await expect(page.getByText('No titles yet.')).toBeVisible()
  assert.equal(entries.length, 0)
  console.log('PASS: owner-scoped watchlist CRUD, episode progress, recovery from stale episode saves, retained drafts, and refresh on return')
} finally {
  await browser.close()
}
