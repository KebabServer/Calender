import { expect, test } from '@playwright/test'

test('watchlist tracks titles, descriptions and IMDb links at 320px', async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.clock.setFixedTime(new Date('2026-11-18T12:00:00Z'))
  let imdbRequests = 0
  await context.route('https://www.imdb.com/**', route => {
    imdbRequests++
    return route.fulfill({ body: 'IMDb search' })
  })
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.calendar-controls h2')).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  for (const name of ['Calendar', 'Notes', 'To-do', 'Weather', 'Watchlist']) {
    await expect(nav.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 })
  }
  const settings = page.getByRole('button', { name: 'Settings', exact: true })
  await expect(settings).toBeInViewport({ ratio: 1 })
  await nav.getByRole('button', { name: 'Watchlist' }).click()
  await expect(page.getByRole('heading', { name: 'Watchlist' })).toBeVisible()
  await expect(page.getByText('No titles yet.')).toBeVisible()
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  const type = page.getByRole('combobox', { name: 'Type', exact: true })
  const description = page.getByRole('textbox', { name: 'Description', exact: true })
  const draftDescription = 'Season one with friends.\nSee https://example.com/recap.'
  await expect(description).toBeHidden()
  await title.fill('Arrival')
  await page.getByRole('button', { name: 'Add title' }).click()
  await title.fill('Severance')
  await type.selectOption('show')
  await page.getByRole('button', { name: 'Description', exact: true }).click()
  await description.fill(draftDescription)
  await nav.getByRole('button', { name: 'Calendar' }).click()
  await nav.getByRole('button', { name: 'Watchlist' }).click()
  await expect(title).toHaveValue('Severance')
  await expect(type).toHaveValue('show')
  await expect(description).toHaveValue(draftDescription)
  await page.getByRole('button', { name: 'Add title' }).click()
  const movie = page.getByRole('listitem').filter({ hasText: 'Arrival' })
  const show = page.getByRole('listitem').filter({ hasText: 'Severance' })
  await expect(movie).toContainText('Movie')
  await expect(show).toContainText('TV show')
  await expect(show.locator('.watchlist-description')).toHaveText(draftDescription)
  await expect(show.getByRole('link', { name: 'https://example.com/recap' })).toHaveAttribute('href', 'https://example.com/recap')
  const movieStatus = movie.getByRole('combobox', { name: /Status for/ })
  const showStatus = show.getByRole('combobox', { name: /Status for/ })
  await expect(movieStatus).toHaveValue('queued')
  await showStatus.selectOption({ label: 'In progress' })
  await expect(showStatus).toHaveValue('in_progress')
  await expect(show.locator('time')).toHaveCount(0)
  await movieStatus.selectOption({ label: 'Finished' })
  await expect(movie.locator('time')).toHaveAttribute('datetime', '2026-11-18')
  await page.getByRole('button', { name: 'Finished', exact: true }).click()
  await expect(show).toHaveCount(0)
  await expect(movie).toBeVisible()
  await page.getByRole('button', { name: 'Queue', exact: true }).click()
  await expect(page.getByText('Your queue is empty.')).toBeVisible()
  await page.getByRole('button', { name: 'In progress', exact: true }).click()
  await expect(movie).toHaveCount(0)
  await expect(show).toBeVisible()
  await page.getByRole('button', { name: 'Edit Severance' }).click()
  await expect(description).toHaveValue(draftDescription)
  const renamedTitle = 'Severance (2022) & extras'
  const revisedDescription = 'Start season two next.'
  await title.fill(renamedTitle)
  await description.fill(revisedDescription)
  await page.getByRole('button', { name: 'Save title' }).click()
  await expect(show).toContainText(renamedTitle)
  await expect(show.locator('.watchlist-description')).toHaveText(revisedDescription)
  const imdb = show.getByRole('link', { name: `Search IMDb for ${renamedTitle}` })
  await expect(imdb).toHaveAttribute('rel', 'noopener noreferrer')
  expect(imdbRequests).toBe(0)
  const [popup] = await Promise.all([page.waitForEvent('popup'), imdb.click()])
  await expect(popup).toHaveURL(url => url.origin === 'https://www.imdb.com' && url.pathname === '/find/')
  expect(Object.fromEntries(new URL(popup.url()).searchParams)).toEqual({ q: renamedTitle, s: 'tt' })
  expect(imdbRequests).toBe(1)
  await popup.close()
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await settings.click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export your data/ }).click(),
  ])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  expect(backup.watchlist).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: 'Arrival', kind: 'movie', watched_on: '2026-11-18' }),
    expect.objectContaining({ title: renamedTitle, kind: 'show', description: revisedDescription, started: true, watched_on: null }),
  ]))
  await page.getByRole('button', { name: 'Close settings' }).click()
  await nav.getByRole('button', { name: 'Watchlist' }).click()
  await expect(showStatus).toHaveValue('in_progress')
  await expect(show.locator('.watchlist-description')).toHaveText(revisedDescription)
  await show.getByRole('button', { name: `Edit ${renamedTitle}` }).click()
  await description.fill('')
  await page.getByRole('button', { name: 'Save title' }).click()
  await expect(show.locator('.watchlist-description')).toHaveCount(0)
  await expect(movieStatus).toHaveValue('finished')
  await movieStatus.selectOption({ label: 'Queue' })
  await expect(movieStatus).toHaveValue('queued')
  await expect(movie.locator('time')).toHaveCount(0)
  page.once('dialog', dialog => dialog.accept())
  await show.getByRole('button', { name: `Remove ${renamedTitle}` }).click()
  await expect(show).toHaveCount(0)
})

test('older watchlists keep finished dates and send unfinished titles to Queue', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.calendar-controls h2')).toBeVisible()
  await page.evaluate(() => {
    const key = 'daymark_demo_v1'
    const state = JSON.parse(localStorage.getItem(key)!)
    const created_at = '2026-11-01T15:00:00Z'
    state.watchlist = [
      { id: 'finished', title: 'Previously finished', kind: 'movie', watched_on: '2026-11-06', created_at },
      { id: 'queued', title: 'Previously queued', kind: 'show', watched_on: null, created_at },
    ]
    localStorage.setItem(key, JSON.stringify(state))
  })
  await page.getByRole('button', { name: 'Watchlist', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Status for Previously finished' })).toHaveValue('finished')
  await expect(page.getByRole('listitem').filter({ hasText: 'Previously finished' }).locator('time')).toHaveAttribute('datetime', '2026-11-06')
  await expect(page.getByRole('combobox', { name: 'Status for Previously queued' })).toHaveValue('queued')
  await page.getByRole('button', { name: 'Edit Previously queued' }).click()
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('')
})
