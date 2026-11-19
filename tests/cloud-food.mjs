import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, timezoneId: 'America/Los_Angeles' })
  const project = 'tktgencmwtanxjfkiadc'
  const id = '32cb8011-578f-4f21-95ad-1d6318170001'
  const now = new Date('2026-11-19T22:15:00Z')
  const exp = Math.floor(Math.max(Date.now(), now.getTime()) / 1000) + 3600
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const access_token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', exp })}.mock`
  await page.clock.setFixedTime(now)
  await page.addInitScript(({ project, session }) => {
    localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session))
  }, { project, session: { access_token, refresh_token: 'mock', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', email: 'menu@example.test' } } })
  await page.routeWebSocket(`wss://${project}.supabase.co/**`, socket => socket.close())

  let requests = 0
  let recover = false
  await page.route(`https://${project}.supabase.co/**`, async route => {
    if (new URL(route.request().url()).pathname !== '/functions/v1/lunch-menus') return route.fulfill({ json: [] })
    requests++
    assert.equal(route.request().method(), 'GET')
    assert.equal(route.request().headers().apikey, 'sb_publishable_mock_for_intercepted_tests')
    assert.equal(route.request().headers().authorization, undefined)
    assert.equal((await route.request().allHeaders()).cookie, undefined)
    return route.fulfill({ json: { date: '2026-11-20', menus: {
      taffa: [{ name: 'Kasvislasagne', category: 'Kasvisruoka' }],
      abloc: [{ name: 'Kalasoppa', category: 'Lounas' }],
      meilahti: recover ? [{ name: 'Linssikeitto', category: 'Lounas' }] : null,
      kaivopiha: [],
    } } })
  })

  await page.goto(process.env.DAYMARK_BASE_URL || 'http://127.0.0.1:4173/Calender/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.calendar-grid')).toBeVisible()
  const food = page.getByRole('button', { name: 'Food', exact: true })
  await expect(food).toBeInViewport({ ratio: 1 })
  assert.equal(requests, 0)
  await food.click()
  await expect(food).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.food-heading time')).toHaveAttribute('datetime', '2026-11-20')
  await expect(page.getByRole('region', { name: 'Täffä' })).toContainText('Kasvislasagne')
  await expect(page.getByRole('region', { name: 'A Bloc' })).toContainText('Kalasoppa')
  await expect(page.getByRole('region', { name: 'UniCafe Meilahti' })).toContainText('Menu unavailable')
  await expect(page.getByRole('region', { name: 'UniCafe Kaivopiha' })).toContainText('No menu published')
  await expect(page.getByRole('link', { name: 'Täffä' })).toHaveAttribute('href', 'https://lunch.tf.fi/')
  recover = true
  await page.getByRole('button', { name: 'Refresh lunch menus' }).click()
  await expect(page.getByRole('region', { name: 'UniCafe Meilahti' })).toContainText('Linssikeitto')
  assert.ok(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth))
  console.log('PASS: 320px food tab, Helsinki date, private session isolation, partial menus, and refresh')
} finally {
  await browser.close()
}
