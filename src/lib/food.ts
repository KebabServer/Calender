import type { DailyMenus } from '../../supabase/functions/lunch-menus/menus'
export { menuWeekDates } from '../../supabase/functions/lunch-menus/menus'

export const restaurants = [
  { id: 'taffa', name: 'Täffä', url: 'https://lunch.tf.fi/' },
  { id: 'abloc', name: 'A Bloc', url: 'https://www.compass-group.fi/abloc' },
  { id: 'meilahti', name: 'UniCafe Meilahti', url: 'https://menu.unicafe.fi/' },
  { id: 'kaivopiha', name: 'UniCafe Kaivopiha', url: 'https://menu.unicafe.fi/' },
] as const

const projectUrl = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
export const foodConfigured = Boolean(projectUrl && key)

export async function fetchLunchMenus(date: string, signal: AbortSignal): Promise<DailyMenus> {
  const url = new URL('/functions/v1/lunch-menus', projectUrl)
  url.searchParams.set('date', date)
  const response = await fetch(url, {
    headers: { apikey: key },
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) throw new Error('Menu service unavailable')
  const result: DailyMenus = await response.json()
  if (result?.date !== date || !result.menus) throw new Error('Menus are for a different date')
  return result
}

export type { DailyMenus }
