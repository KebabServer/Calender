import { loadDailyMenus, menuDate, menuWeekDates, type DailyMenus } from './menus.ts'

const publishableKeys = Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
let cacheDay: string | undefined
const cached = new Map<string, { expiresAt: number; menus: Promise<DailyMenus> }>()

function dailyMenus(date: string, today: string): Promise<DailyMenus> {
  if (cacheDay !== today) {
    cached.clear()
    cacheDay = today
  }
  const previous = cached.get(date)
  if (previous && previous.expiresAt > Date.now()) return previous.menus
  const entry = { expiresAt: Date.now() + 15_000, menus: loadDailyMenus(date) }
  cached.set(date, entry)
  void entry.menus.then(result => {
    entry.expiresAt = Date.now() + (Object.values(result.menus).some(menu => menu === null) ? 30_000 : 300_000)
  })
  return entry.menus
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin')
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' })
  if (origin) {
    if (origin !== 'https://kebabserver.github.io' && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return new Response(null, { status: 403, headers })
    }
    headers.set('Access-Control-Allow-Origin', origin)
  }

  if (request.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'apikey')
    return new Response(null, { status: 204, headers })
  }
  if (request.method !== 'GET') {
    headers.set('Allow', 'GET, OPTIONS')
    return new Response(null, { status: 405, headers })
  }

  // This public data endpoint uses the project's browser key and never receives a user token.
  const key = request.headers.get('apikey')
  if (!key || (key !== anonKey && !publishableKeys.includes(key))) {
    return Response.json({ error: 'A project publishable key is required.' }, { status: 401, headers })
  }

  const today = menuDate()
  const date = new URL(request.url).searchParams.get('date') ?? today
  if (!menuWeekDates(today).includes(date)) {
    return Response.json({ error: 'Choose a date from today through Sunday.' }, { status: 400, headers })
  }
  return Response.json(await dailyMenus(date, today), { headers })
})
