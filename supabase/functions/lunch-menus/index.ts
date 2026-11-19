import { loadDailyMenus, menuDate, type DailyMenus } from './menus.ts'

const publishableKeys = Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
let cached: { date: string; expiresAt: number; menus: Promise<DailyMenus> } | undefined

function dailyMenus(date: string): Promise<DailyMenus> {
  if (cached?.date === date && cached.expiresAt > Date.now()) return cached.menus
  const entry = { date, expiresAt: Date.now() + 15_000, menus: loadDailyMenus(date) }
  cached = entry
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

  return Response.json(await dailyMenus(menuDate()), { headers })
})
