export type Dish = { name: string; category: string | null }
export type DailyMenus = {
  date: string
  menus: Record<'taffa' | 'abloc' | 'meilahti' | 'kaivopiha', Dish[] | null>
}

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a menu object')
  return value as RecordValue
}

function records(value: unknown): RecordValue[] {
  if (!Array.isArray(value)) throw new Error('Expected a menu list')
  return value.map(record)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function unique(dishes: Dish[]): Dish[] {
  return [...new Map(dishes.filter(dish => dish.name).map(dish => [JSON.stringify(dish), dish])).values()]
}

export function readTaffa(payload: unknown, date: string): Dish[] {
  const day = records(payload).find(entry => entry.day === date)
  if (!day) return []
  return unique(Object.entries(day).filter(([key]) => key !== 'day' && key !== 'dayName')
    .map(([category, value]) => ({ category, name: text(value) })))
}

export function readABloc(payload: unknown, date: string): Dish[] {
  if (payload === null) return []
  const day = record(payload)
  if (typeof day.date !== 'string' || day.date.slice(0, 10) !== date) throw new Error('Unexpected Compass menu date')
  return unique(records(day.menuPackages).flatMap(group => {
    const category = text(group.name) || null
    const meals = records(group.meals)
    const bundledMeals = records(group.bundles ?? []).flatMap(bundle => records(bundle.meals))
    return [...meals, ...bundledMeals].map(meal => ({ category, name: text(meal.name) }))
  }))
}

export function readUniCafe(payload: unknown, slug: 'meilahti' | 'kaivopiha', date: string): Dish[] {
  const restaurant = records(payload).find(entry => entry.slug === slug)
  if (!restaurant) throw new Error('UniCafe restaurant missing')
  // This feed labels days in Finnish without a year and covers the current and following week.
  const [, month, day] = date.split('-')
  const weekday = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'][new Date(`${date}T12:00:00Z`).getUTCDay()]
  const label = `${weekday} ${Number(day)}.${Number(month)}.`
  const menu = records(record(restaurant.menuData).menus).find(entry => text(entry.date) === label)
  if (!menu) return []
  return unique(records(menu.data).map(meal => ({
    name: text(meal.name),
    category: meal.price ? text(record(meal.price).name) || null : null,
  })))
}

export function menuDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function menuWeekDates(today: string): string[] {
  const day = new Date(`${today}T12:00:00Z`)
  const count = 1 + (7 - day.getUTCDay()) % 7
  return Array.from({ length: count }, () => {
    const date = day.toISOString().slice(0, 10)
    day.setUTCDate(day.getUTCDate() + 1)
    return date
  })
}

async function getJSON(url: string, request: typeof fetch): Promise<unknown> {
  const response = await request(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`Menu provider returned HTTP ${response.status}`)
  return response.status === 204 ? null : response.json()
}

async function readMenu(read: () => Promise<Dish[]>): Promise<Dish[] | null> {
  try { return await read() }
  catch { return null }
}

export async function loadDailyMenus(date: string, request: typeof fetch = fetch): Promise<DailyMenus> {
  const unicafe = getJSON('https://unicafe.fi/wp-json/swiss/v1/restaurants', request)
  const [taffa, abloc, meilahti, kaivopiha] = await Promise.all([
    readMenu(async () => readTaffa(await getJSON('https://newapi.tf.fi/taffa/fi/json/week/', request), date)),
    readMenu(async () => readABloc(await getJSON(`https://www.compass-group.fi/menuapi/day-menus?costCenter=3087&date=${date}&language=fi`, request), date)),
    readMenu(async () => readUniCafe(await unicafe, 'meilahti', date)),
    readMenu(async () => readUniCafe(await unicafe, 'kaivopiha', date)),
  ])
  return { date, menus: { taffa, abloc, meilahti, kaivopiha } }
}
