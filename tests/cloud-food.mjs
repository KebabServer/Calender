import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, timezoneId: 'America/Los_Angeles' })
  const project = 'tktgencmwtanxjfkiadc'
  const id = '32cb8011-578f-4f21-95ad-1d6318170001'
  const now = new Date('2026-11-17T22:15:00Z')
  const exp = Math.floor(Math.max(Date.now(), now.getTime()) / 1000) + 7 * 86400
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const access_token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', exp })}.mock`
  await page.clock.setFixedTime(now)
  await page.addInitScript(({ project, session }) => {
    localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session))
  }, { project, session: { access_token, refresh_token: 'mock', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', email: 'menu@example.test' } } })
  await page.routeWebSocket(`wss://${project}.supabase.co/**`, socket => socket.close())

  const requests = []
  let recover = false
  await page.route(`https://${project}.supabase.co/**`, async route => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/functions/v1/lunch-menus') return route.fulfill({ json: [] })
    const date = url.searchParams.get('date')
    requests.push(date)
    assert.equal(route.request().method(), 'GET')
    assert.equal(route.request().headers().apikey, 'sb_publishable_mock_for_intercepted_tests')
    assert.equal(route.request().headers().authorization, undefined)
    assert.equal((await route.request().allHeaders()).cookie, undefined)
    const taffa = date === '2026-11-18' ? [{ name: 'Kasvislasagne', category: 'Kasvisruoka' }]
      : date === '2026-11-19' ? [{ name: 'Hernekeitto', category: 'Keitto' }] : []
    return route.fulfill({ json: { date, menus: {
      taffa,
      abloc: [{ name: 'Kalasoppa', category: 'Lounas' }],
      meilahti: recover ? [{ name: 'Linssikeitto', category: 'Lounas' }] : null,
      kaivopiha: [],
    } } })
  })

  await page.goto(process.env.DAYMARK_BASE_URL || 'http://127.0.0.1:4173/Calender/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.calendar-grid')).toBeVisible()
  const food = page.getByRole('button', { name: 'Food', exact: true })
  await expect(food).toBeInViewport({ ratio: 1 })
  assert.deepEqual(requests, [])
  await food.click()
  await expect(food).toHaveAttribute('aria-current', 'page')
  const dates = page.getByRole('group', { name: 'Lunch menu date' })
  const days = dates.getByRole('button')
  const selected = dates.getByRole('button', { pressed: true })
  await expect(days).toHaveCount(5)
  await expect(selected).toHaveAccessibleName('Today, Wednesday 18 November')
  await expect(days.last()).toHaveAccessibleName('Sunday 22 November')
  await expect(page.locator('.food-heading time')).toHaveAttribute('datetime', '2026-11-18')
  await expect(page.getByRole('region', { name: 'Täffä' })).toContainText('Kasvislasagne')
  await expect(page.getByRole('region', { name: 'A Bloc' })).toContainText('Kalasoppa')
  await expect(page.getByRole('region', { name: 'UniCafe Meilahti' })).toContainText('Menu unavailable')
  await expect(page.getByRole('region', { name: 'UniCafe Kaivopiha' })).toContainText('No menu published')
  await expect(page.getByRole('link', { name: 'Täffä' })).toHaveAttribute('href', 'https://lunch.tf.fi/')
  recover = true
  await page.getByRole('button', { name: 'Refresh lunch menus' }).click()
  await expect(page.getByRole('region', { name: 'UniCafe Meilahti' })).toContainText('Linssikeitto')
  await days.getByText('Thu', { exact: true }).click()
  await expect(selected).toHaveAccessibleName('Thursday 19 November')
  await expect(page.getByRole('region', { name: 'Täffä' })).toContainText('Hernekeitto')
  await days.last().click()
  await expect(page.getByRole('region', { name: 'Täffä' })).toContainText('No menu published')
  assert.deepEqual(requests, ['2026-11-18', '2026-11-18', '2026-11-19', '2026-11-22'])

  await page.clock.setFixedTime(new Date('2026-11-22T22:15:00Z'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(selected).toHaveAccessibleName('Today, Monday 23 November')
  await expect(days).toHaveCount(7)
  await expect(days.last()).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('region', { name: 'Täffä' })).toContainText('No menu published')
  assert.equal(requests.at(-1), '2026-11-23')
  assert.ok(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth))
  console.log('PASS: 320px food tab, date selection through Sunday, Helsinki rollover, private session isolation, partial menus, and refresh')
} finally {
  await browser.close()
}
