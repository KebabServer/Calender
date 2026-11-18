export const WEATHER_REFRESH_MS = 15 * 60 * 1000
export const HELSINKI_TIMEZONE = 'Europe/Helsinki'
export const WEATHER_COORDINATES = {
  Helsinki: 'lat=60.1699&lon=24.9384',
  Otaniemi: 'lat=60.1850&lon=24.8270',
} as const

export type WeatherLocation = keyof typeof WEATHER_COORDINATES

export type WeatherKind = 'clear' | 'fair' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'heavy-rain' | 'rain-showers' | 'snow' | 'heavy-snow' | 'snow-showers' | 'sleet' | 'storm' | 'unknown'
export type WeatherPeriod = {
  time: string; temperature: number | null; humidity: number | null; wind: number | null
  precipitation: number | null; precipitationHours: number | null; kind: WeatherKind; isDay: boolean
}
export type WeatherForecast = { receivedAt: number; issuedAt: string; current: WeatherPeriod; forecast: WeatherPeriod[] }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid weather response')
  return value as Record<string, unknown>
}
function number(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
    && Number.isFinite(new Date(value).getTime()) && new Date(value).toISOString() === value.replace('Z', '.000Z')
}
function kind(symbol: unknown): WeatherKind {
  if (typeof symbol !== 'string') return 'unknown'
  const name = symbol.replace(/_(day|night|polartwilight)$/, '')
  if (name.includes('thunder')) return 'storm'
  if (name.includes('sleet')) return 'sleet'
  if (name.includes('snow')) return name.includes('showers') ? 'snow-showers' : name.includes('heavy') ? 'heavy-snow' : 'snow'
  if (name.includes('rain')) return name.includes('showers') ? 'rain-showers' : name.includes('heavy') ? 'heavy-rain' : 'rain'
  if (name === 'clearsky') return 'clear'
  if (name === 'fair') return 'fair'
  if (name === 'partlycloudy') return 'partly-cloudy'
  if (name === 'cloudy') return 'cloudy'
  if (name === 'fog') return 'fog'
  return 'unknown'
}

export function parseWeather(value: unknown, receivedAt = Date.now()): WeatherForecast {
  const data = object(value), properties = object(data.properties), meta = object(properties.meta), units = object(meta.units)
  if (units.air_temperature !== 'celsius' || units.wind_speed !== 'm/s' || units.precipitation_amount !== 'mm'
    || units.relative_humidity !== '%' || !timestamp(meta.updated_at)) throw new Error('Unexpected weather units or timestamp')
  if (!Array.isArray(properties.timeseries) || properties.timeseries.length < 2) throw new Error('Missing forecast')
  const points: WeatherPeriod[] = properties.timeseries.map(value => {
    const point = object(value), data = object(point.data), instant = object(object(data.instant).details)
    if (!timestamp(point.time)) throw new Error('Invalid forecast time')
    const hours = data.next_1_hours ? 1 : data.next_6_hours ? 6 : null
    const period = hours ? object(data[`next_${hours}_hours`]) : null
    const details = period?.details ? object(period.details) : null
    const symbol = period?.summary ? object(period.summary).symbol_code : null
    return { time: point.time, temperature: number(instant.air_temperature, -100, 70), humidity: number(instant.relative_humidity, 0, 100),
      wind: number(instant.wind_speed, 0, 150), precipitation: number(details?.precipitation_amount, 0, 1000), precipitationHours: hours,
      kind: kind(symbol), isDay: typeof symbol !== 'string' || !symbol.endsWith('_night') }
  })
  if (points.some((point, index) => index > 0 && point.time <= points[index - 1].time)) throw new Error('Unordered forecast')
  const next = points.findIndex(point => new Date(point.time).getTime() > receivedAt)
  const current = points[next === -1 ? points.length - 1 : Math.max(0, next - 1)]
  const forecast = points.filter(point => {
    const time = new Date(point.time).getTime()
    return time > receivedAt && time <= receivedAt + 12 * 60 * 60 * 1000
  }).filter((_, index) => index % 2 === 0).slice(0, 6)
  if (!forecast.length) throw new Error('Forecast expired')
  return { receivedAt, issuedAt: meta.updated_at, current, forecast }
}

export async function fetchWeather(location: WeatherLocation, signal: AbortSignal): Promise<WeatherForecast> {
  // A simple CORS request identifies the public site via Origin. Never send account credentials.
  // Default HTTP caching respects MET Norway's Expires/Last-Modified response headers.
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?${WEATHER_COORDINATES[location]}`
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'default' })
  if (!response.ok) throw new Error('Weather service unavailable')
  return parseWeather(await response.json())
}

export function degrees(value: number | null, unit = false): string {
  return value === null ? '—' : `${Math.round(value) || 0}°${unit ? 'C' : ''}`
}
export function formatWeatherTime(time: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: HELSINKI_TIMEZONE }).format(new Date(time))
}
export function helsinkiDateKey(timestamp = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: HELSINKI_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp)
  const part = (type: string) => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
