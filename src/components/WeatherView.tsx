import { useEffect, useState } from 'react'
import { Cloud, CloudFog, CloudLightning, CloudMoon, CloudOff, CloudRain, CloudSnow, CloudSun, Droplets, LoaderCircle, Moon, RefreshCw, Sun, Wind } from 'lucide-react'
import { degrees, fetchHelsinkiWeather, formatWeatherTime, helsinkiDateKey, WEATHER_REFRESH_MS } from '../lib/weather'
import type { HelsinkiWeather, WeatherKind } from '../lib/weather'

let cachedWeather: HelsinkiWeather | null = null

function conditions(kind: WeatherKind, isDay = true) {
  switch (kind) {
    case 'clear': return { label: isDay ? 'Clear sky' : 'Clear night', Icon: isDay ? Sun : Moon }
    case 'fair': return { label: 'Mostly clear', Icon: isDay ? Sun : Moon }
    case 'partly-cloudy': return { label: 'Partly cloudy', Icon: isDay ? CloudSun : CloudMoon }
    case 'cloudy': return { label: 'Overcast', Icon: Cloud }
    case 'fog': return { label: 'Foggy', Icon: CloudFog }
    case 'rain': return { label: 'Rain', Icon: CloudRain }
    case 'heavy-rain': return { label: 'Heavy rain', Icon: CloudRain }
    case 'rain-showers': return { label: 'Rain showers', Icon: CloudRain }
    case 'snow': return { label: 'Snow', Icon: CloudSnow }
    case 'heavy-snow': return { label: 'Heavy snow', Icon: CloudSnow }
    case 'snow-showers': return { label: 'Snow showers', Icon: CloudSnow }
    case 'sleet': return { label: 'Sleet', Icon: CloudSnow }
    case 'storm': return { label: 'Thunderstorms', Icon: CloudLightning }
    default: return { label: 'Unavailable', Icon: CloudOff }
  }
}

export function WeatherView() {
  const [weather, setWeather] = useState(cachedWeather)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (refreshKey === 0 && cachedWeather && Date.now() - cachedWeather.receivedAt < WEATHER_REFRESH_MS) return
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    setLoading(true); setError(false)
    void fetchHelsinkiWeather(controller.signal).then(data => {
      if (active) { cachedWeather = data; setWeather(data) }
    }).catch(() => { if (active) setError(true) }).finally(() => {
      window.clearTimeout(timeout)
      if (active) setLoading(false)
    })
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [refreshKey])

  useEffect(() => {
    const check = () => {
      if (!document.hidden && (!cachedWeather || Date.now() - cachedWeather.receivedAt >= WEATHER_REFRESH_MS)) setRefreshKey(key => key + 1)
    }
    const online = () => { if (!document.hidden) setRefreshKey(key => key + 1) }
    window.addEventListener('focus', check)
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', check)
    const interval = window.setInterval(check, WEATHER_REFRESH_MS)
    return () => {
      window.removeEventListener('focus', check); window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', check); window.clearInterval(interval)
    }
  }, [])

  const current = weather && conditions(weather.current.kind, weather.current.isDay)
  const today = helsinkiDateKey()
  return <section className="weather-view" aria-labelledby="weather-title">
    <div className="weather-heading"><div><h1 id="weather-title">Helsinki</h1><p>Weather</p></div><button className="icon-button" aria-label="Refresh weather" disabled={loading} onClick={() => setRefreshKey(key => key + 1)}><RefreshCw size={19} className={loading ? 'spin' : ''}/></button></div>
    {loading && !weather && <div className="weather-loading" role="status"><LoaderCircle size={22} className="spin"/>Loading Helsinki weather…</div>}
    {error && <div className="weather-error" role="alert"><p>{weather ? 'Could not refresh. Showing previously loaded weather.' : 'Could not load Helsinki weather. Please try again.'}</p><button className="button secondary" disabled={loading} onClick={() => setRefreshKey(key => key + 1)}>Try again</button></div>}
    {weather && current && <>
      <div className="weather-current panel"><div className="weather-now"><div><strong className="weather-temperature">{degrees(weather.current.temperature, true)}</strong><p>{current.label}</p></div><current.Icon size={58} strokeWidth={1.5} aria-hidden="true"/></div>
        <dl className="weather-metrics"><div><dt><Wind size={13}/>Wind</dt><dd>{weather.current.wind === null ? '—' : `${weather.current.wind.toFixed(1)} m/s`}</dd></div><div><dt><Droplets size={13}/>Humidity</dt><dd>{weather.current.humidity === null ? '—' : `${Math.round(weather.current.humidity)}%`}</dd></div><div><dt><CloudRain size={13}/>Rain/snow</dt><dd>{weather.current.precipitation === null ? '—' : `${weather.current.precipitation.toFixed(1)} mm`}</dd>{weather.current.precipitation !== null && <small>Next {weather.current.precipitationHours}h</small>}</div></dl>
        <p className="weather-observed">Forecast for {formatWeatherTime(weather.current.time, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} · Helsinki time</p>
      </div>
      <div className="weather-forecast panel"><h2>Next 12 hours</h2><table><thead><tr><th scope="col">Time</th><th scope="col">Conditions</th><th scope="col">Temp</th><th scope="col">Rain/snow</th></tr></thead><tbody>{weather.forecast.map(point => { const condition = conditions(point.kind, point.isDay); return <tr key={point.time}>
        <th scope="row"><time dateTime={point.time}>{formatWeatherTime(point.time, { hour: '2-digit', minute: '2-digit', hour12: false })}{helsinkiDateKey(new Date(point.time).getTime()) !== today && <small>{formatWeatherTime(point.time, { day: 'numeric', month: 'short' })}</small>}</time></th>
        <td><span className="weather-condition"><condition.Icon size={17} aria-hidden="true"/><span>{condition.label}</span></span></td>
        <td className="weather-range"><strong>{degrees(point.temperature, true)}</strong></td>
        <td className="weather-rain">{point.precipitation === null ? '—' : `${point.precipitation.toFixed(1)} mm`}{point.precipitation !== null && <small>Next {point.precipitationHours}h</small>}</td>
      </tr> })}</tbody></table></div>
      <p className="weather-updated" role="status">{loading ? 'Updating… · ' : ''}Updated {formatWeatherTime(weather.issuedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} · Helsinki time</p>
    </>}
    <p className="weather-credit">Weather data by <a href="https://www.met.no/en" target="_blank" rel="noopener noreferrer">MET Norway</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>
  </section>
}
