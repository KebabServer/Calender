import { useEffect, useState } from 'react'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { fetchLunchMenus, foodConfigured, menuWeekDates, restaurants, type DailyMenus } from '../lib/food'
import { formatWeatherTime, helsinkiDateKey } from '../lib/weather'
import { WebLink } from './TextLinks'

export function FoodView() {
  const [today, setToday] = useState(helsinkiDateKey)
  const [selectedDate, setSelectedDate] = useState('')
  const dates = menuWeekDates(today)
  const date = dates.includes(selectedDate) ? selectedDate : today
  const [result, setResult] = useState<DailyMenus>()
  const [loading, setLoading] = useState(foodConfigured)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const current = result?.date === date ? result : undefined

  useEffect(() => {
    const updateDate = () => setToday(helsinkiDateKey())
    const timer = window.setInterval(updateDate, 60_000)
    window.addEventListener('focus', updateDate)
    document.addEventListener('visibilitychange', updateDate)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', updateDate)
      document.removeEventListener('visibilitychange', updateDate)
    }
  }, [])

  useEffect(() => {
    if (!foodConfigured) return
    let active = true
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 12_000)
    setLoading(true)
    setError(false)
    void fetchLunchMenus(date, controller.signal)
      .then(menus => { if (active) setResult(menus) })
      .catch(() => { if (active) setError(true) })
      .finally(() => {
        window.clearTimeout(timer)
        if (active) setLoading(false)
      })
    return () => {
      active = false
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [date, refresh])

  return <section className="food-view" aria-labelledby="food-title">
    <div className="food-heading">
      <h1 id="food-title">Food</h1>
      <time dateTime={date}>{formatWeatherTime(`${date}T12:00:00Z`, { weekday: 'short', day: 'numeric', month: 'short' })}</time>
      {foodConfigured && <button className="icon-button" aria-label="Refresh lunch menus" disabled={loading} onClick={() => setRefresh(count => count + 1)}>
        <RefreshCw size={18} className={loading ? 'spin' : undefined}/>
      </button>}
    </div>
    <div className="food-dates" role="group" aria-label="Lunch menu date">
      {dates.map(day => {
        const timestamp = `${day}T12:00:00Z`
        const label = formatWeatherTime(timestamp, { weekday: 'long', day: 'numeric', month: 'long' })
        return <button key={day} type="button" aria-pressed={day === date} aria-label={day === today ? `Today, ${label}` : label} onClick={() => setSelectedDate(day)}>
          <span>{day === today ? 'Today' : formatWeatherTime(timestamp, { weekday: 'short' })}</span>
          <time dateTime={day}>{Number(day.slice(-2))}</time>
        </button>
      })}
    </div>
    {!foodConfigured && <p className="food-notice">Open a restaurant’s site for its menu.</p>}
    {loading && !current && <p className="food-notice" role="status">Loading lunch menus…</p>}
    {error && <p className="food-notice" role="status">{current ? 'Could not refresh the menus. Showing the last loaded menus.' : 'Could not load menus for this day.'}</p>}
    <div className="food-grid">
      {restaurants.map(({ id, name, url }) => {
        const dishes = current?.menus[id]
        return <section className="panel food-card" key={id} aria-labelledby={`food-${id}`}>
          <h2 id={`food-${id}`}><WebLink href={url}>{name}<ArrowUpRight size={14} aria-hidden="true"/></WebLink></h2>
          {dishes && (dishes.length ? <ul>
            {dishes.map(dish => <li key={JSON.stringify(dish)}>
              <span>{dish.name}</span>
              {dish.category && <small>{dish.category}</small>}
            </li>)}
          </ul> : <p>No menu published for this day.</p>)}
          {current && dishes == null && <p>Menu unavailable.</p>}
        </section>
      })}
    </div>
  </section>
}
