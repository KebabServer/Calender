import { expect, test } from '@playwright/test'
import { parseWeather, helsinkiDateKey } from '../src/lib/weather'

const now = new Date('2026-11-17T23:30:00Z') // Already 18 November in Helsinki.
function forecast(temperature = -1.4) {
  return { properties: {
    meta: { updated_at: '2026-11-17T23:00:00Z', units: { air_temperature: 'celsius', wind_speed: 'm/s', precipitation_amount: 'mm', relative_humidity: '%' } },
    timeseries: Array.from({length: 25}, (_, index) => ({
      time: new Date(Date.UTC(2026, 10, 17, 23 + index)).toISOString().replace('.000Z', 'Z'),
      data: {
        instant: { details: { air_temperature: temperature + index / 10, relative_humidity: 84, wind_speed: 3.2 } },
        next_1_hours: { summary: { symbol_code: index % 3 === 0 ? 'snow' : index % 3 === 1 ? 'clearsky_night' : 'partlycloudy_day' }, details: { precipitation_amount: 0.2 } },
      },
    })),
  } }
}
const endpoint = '**/api.met.no/weatherapi/locationforecast/2.0/compact?*'

for (const width of [320, 375, 1440]) {
  test(`Helsinki weather and navigation fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 760 })
    await page.clock.setFixedTime(now)
    let calls = 0
    await page.route(endpoint, route => {
      calls++
      const request = route.request(), url = new URL(request.url())
      expect(url.searchParams.get('lat')).toBe('60.1699')
      expect(url.searchParams.get('lon')).toBe('24.9384')
      expect(request.headers().authorization).toBeUndefined()
      expect(request.headers().cookie).toBeUndefined()
      return route.fulfill({ json: forecast() })
    })
    await page.goto('./', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.calendar-controls h2')).toBeVisible()
    expect(calls).toBe(0)
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    for (const name of ['Calendar', 'Notes', 'To-do', 'Weather']) await expect(nav.getByRole('button', { name, exact: true })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport()
    await nav.getByRole('button', { name: 'Weather', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Weather', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Helsinki', pressed: true })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Otaniemi', pressed: false })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Inkoo', pressed: false })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Refresh weather' })).toBeInViewport({ ratio: 1 })
    const radar = page.getByRole('link', { name: 'Sadetutka (Ilmatieteen laitos)' })
    await expect(radar).toBeInViewport()
    await expect(radar).toHaveAttribute('href', 'https://www.ilmatieteenlaitos.fi/sade-ja-pilvialueet/sadetutka')
    await expect(nav.getByRole('button', { name: 'Weather', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.weather-temperature')).toHaveText('-1°C')
    await expect(page.locator('.weather-metrics')).toContainText('3.2 m/s')
    await expect(page.locator('.weather-metrics')).toContainText('84%')
    await expect(page.locator('.weather-metrics')).toContainText('0.2 mm')
    await expect(page.locator('.weather-forecast tbody tr')).toHaveCount(6)
    await expect(page.locator('.weather-forecast tbody tr').first()).toContainText('02:00')
    await expect(page.locator('.weather-updated')).toContainText('18 Nov, 01:00')
    await expect(page.getByRole('link', { name: 'MET Norway', exact: true })).toHaveAttribute('href', 'https://www.met.no/en')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `test-results/weather-${width}.png` })
    await nav.getByRole('button', { name: 'Calendar', exact: true }).click()
    await nav.getByRole('button', { name: 'Weather', exact: true }).click()
    await expect(page.locator('.weather-temperature')).toHaveText('-1°C')
    expect(calls).toBe(1)
  })
}

test('weather locations load and cache separate forecasts', async ({ page }) => {
  await page.clock.setFixedTime(now)
  let helsinkiCalls = 0, otaniemiCalls = 0, inkooCalls = 0, otaniemiUnavailable = true
  await page.route(endpoint, route => {
    const coordinates = new URL(route.request().url()).searchParams
    if (coordinates.get('lat') === '60.1699') {
      expect(coordinates.get('lon')).toBe('24.9384')
      helsinkiCalls++
      return route.fulfill({ json: forecast() })
    }
    if (coordinates.get('lat') === '60.0459') {
      expect(coordinates.get('lon')).toBe('24.0046')
      inkooCalls++
      return route.fulfill({ json: forecast(7.2) })
    }
    expect(coordinates.get('lat')).toBe('60.1850')
    expect(coordinates.get('lon')).toBe('24.8270')
    otaniemiCalls++
    if (otaniemiUnavailable) return route.fulfill({ status: 503 })
    return route.fulfill({ json: forecast(3.3) })
  })
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  const temperature = page.locator('.weather-temperature')
  const otaniemi = page.getByRole('button', { name: 'Otaniemi', exact: true })
  const inkoo = page.getByRole('button', { name: 'Inkoo', exact: true })
  await nav.getByRole('button', { name: 'Weather', exact: true }).click()
  await expect(temperature).toHaveText('-1°C')

  await otaniemi.click()
  await expect(otaniemi).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('alert')).toContainText('Could not load Otaniemi weather')
  await expect(temperature).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Sadetutka/ })).toBeVisible()

  otaniemiUnavailable = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(temperature).toHaveText('3°C')
  await inkoo.click()
  await expect(temperature).toHaveText('7°C')
  await page.getByRole('button', { name: 'Helsinki', exact: true }).click()
  await expect(temperature).toHaveText('-1°C')
  await otaniemi.click()
  await expect(temperature).toHaveText('3°C')
  await inkoo.click()
  await expect(temperature).toHaveText('7°C')
  await nav.getByRole('button', { name: 'Calendar', exact: true }).click()
  await nav.getByRole('button', { name: 'Weather', exact: true }).click()
  await expect(inkoo).toHaveAttribute('aria-pressed', 'true')
  await expect(temperature).toHaveText('7°C')
  expect(helsinkiCalls).toBe(1)
  expect(otaniemiCalls).toBe(2)
  expect(inkooCalls).toBe(1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await nav.getByRole('button', { name: 'Weather', exact: true }).click()
  await expect(inkoo).toHaveAttribute('aria-pressed', 'true')
  await expect(temperature).toHaveText('7°C')
  expect(helsinkiCalls).toBe(1)
  expect(inkooCalls).toBe(2)
})

test('Helsinki times are independent of the device timezone', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' })
  const page = await context.newPage()
  try {
    await page.clock.setFixedTime(now)
    await page.route(endpoint, route => route.fulfill({json:forecast()}))
    await page.goto('http://127.0.0.1:4173/Calender/', {waitUntil:'domcontentloaded'})
    await page.getByRole('navigation').getByRole('button', {name:'Weather',exact:true}).click()
    await expect(page.locator('.weather-observed')).toContainText('18 Nov, 01:00')
    await expect(page.locator('.weather-forecast tbody tr').first()).toContainText('02:00')
  } finally { await context.close() }
})

test('weather errors are retryable and failed refreshes keep the last forecast', async ({ page }) => {
  await page.clock.setFixedTime(now)
  let fail = true, invalid = false, calls = 0
  await page.route(endpoint, route => {
    calls++
    if (fail) return route.fulfill({status:503,body:'Service temporarily unavailable'})
    const data = forecast()
    if (invalid) data.properties.meta.units.wind_speed = 'km/h'
    return route.fulfill({json:data})
  })
  await page.goto('./', {waitUntil:'domcontentloaded'})
  await page.getByRole('navigation').getByRole('button', {name:'Weather',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Could not load Helsinki weather')
  await expect(page.locator('.weather-temperature')).toHaveCount(0)
  fail = false
  await page.getByRole('button', {name:'Try again',exact:true}).click()
  await expect(page.locator('.weather-temperature')).toHaveText('-1°C')
  invalid = true
  await page.getByRole('button', {name:'Refresh weather',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Showing previously loaded weather')
  await expect(page.locator('.weather-temperature')).toHaveText('-1°C')
  await expect(page.locator('.weather-forecast tbody tr')).toHaveCount(6)
  invalid = false
  await page.getByRole('button', {name:'Try again',exact:true}).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(calls).toBe(4)
})

test('weather refreshes on return when the cached forecast has expired', async ({ page }) => {
  await page.clock.setFixedTime(now)
  let calls = 0
  await page.route(endpoint, route => {calls++;return route.fulfill({json:forecast()})})
  await page.goto('./', {waitUntil:'domcontentloaded'})
  await page.getByRole('navigation').getByRole('button', {name:'Weather',exact:true}).click()
  await expect(page.locator('.weather-temperature')).toHaveText('-1°C')
  await page.clock.setFixedTime(new Date(now.getTime()+16*60*1000))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => calls).toBe(2)
  await expect(page.getByRole('button', {name:'Refresh weather',exact:true})).toBeEnabled()
})

test('a hung weather request times out and leaves navigation usable', async ({ page }) => {
  await page.clock.install({time:now})
  await page.route(endpoint, () => {})
  await page.goto('./', {waitUntil:'domcontentloaded'})
  await page.getByRole('navigation').getByRole('button', {name:'Weather',exact:true}).click()
  await expect(page.getByText('Loading Helsinki weather…', {exact:true})).toBeVisible()
  await page.clock.fastForward(10001)
  await expect(page.getByRole('alert')).toContainText('Could not load Helsinki weather')
  await page.getByRole('navigation').getByRole('button', {name:'Notes',exact:true}).click()
  await expect(page.getByRole('heading', {name:/^Notes/})).toBeVisible()
})

test('task drafts survive visiting weather', async ({ page }) => {
  await page.clock.setFixedTime(now)
  await page.route(endpoint, route => route.fulfill({json:forecast()}))
  await page.goto('./', {waitUntil:'domcontentloaded'})
  const nav = page.getByRole('navigation')
  await nav.getByRole('button', {name:'To-do',exact:true}).click()
  await page.getByLabel('Task title').fill('Keep this draft')
  await page.getByLabel('Description', {exact:true}).fill('Private draft text')
  await page.getByLabel('Due date', {exact:true}).fill('2026-11-20')
  await nav.getByRole('button', {name:'Weather',exact:true}).click()
  await expect(page.locator('.weather-temperature')).toHaveText('-1°C')
  await nav.getByRole('button', {name:'To-do',exact:true}).click()
  await expect(page.getByLabel('Task title')).toHaveValue('Keep this draft')
  await expect(page.getByLabel('Description', {exact:true})).toHaveValue('Private draft text')
  await expect(page.getByLabel('Due date', {exact:true})).toHaveValue('2026-11-20')
})

test('missing measurements stay unavailable; invalid or expired responses are rejected', () => {
  const data = forecast()
  const first = data.properties.timeseries[0]
  // Real APIs may return null or omit a measurement; never coerce it to zero.
  const raw: unknown = {...data, properties:{...data.properties,timeseries:data.properties.timeseries.map((p,i)=>i? p : {...first,data:{instant:{details:{}},next_1_hours:{summary:{symbol_code:'unrecognised'},details:{}}}})}}
  const parsed = parseWeather(raw,now.getTime())
  expect(parsed.current.temperature).toBeNull()
  expect(parsed.current.wind).toBeNull()
  expect(parsed.current.kind).toBe('unknown')
  expect(() => parseWeather({error:true},now.getTime())).toThrow()
  expect(() => parseWeather(data,new Date('2027-01-01T00:00:00Z').getTime())).toThrow('Forecast expired')
  expect(helsinkiDateKey(now.getTime())).toBe('2026-11-18')
})
