import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Repository } from '../data/repository'
import type { WatchItem } from '../types'

type Props = {
  active: boolean
  repository: Repository
  onPendingChange: (pending: boolean) => void
}

const kinds = { movie: 'Movie', show: 'TV show' } as const
const filters = { all: 'All', planned: 'To watch', watched: 'Watched' } as const

export function WatchlistView({ active, repository, onPendingChange }: Props) {
  const [items, setItems] = useState<WatchItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<WatchItem['kind']>('movie')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<keyof typeof filters>('all')
  const request = useRef(0)
  const writing = useRef(false)
  const hasDraft = Boolean(title.trim() || editingId || kind !== 'movie')

  useEffect(() => onPendingChange(hasDraft || busy), [hasDraft, busy, onPendingChange])

  const load = useCallback(async () => {
    if (writing.current || document.hidden) return
    const current = ++request.current
    try {
      const latest = await repository.getWatchlist()
      if (current !== request.current) return
      setItems(latest)
      setLoadError(false)
    } catch {
      if (current === request.current) setLoadError(true)
    }
  }, [repository])

  useEffect(() => {
    if (!active) return
    void load()
    window.addEventListener('focus', load)
    window.addEventListener('online', load)
    document.addEventListener('visibilitychange', load)
    return () => {
      request.current++
      window.removeEventListener('focus', load)
      window.removeEventListener('online', load)
      document.removeEventListener('visibilitychange', load)
    }
  }, [active, load])

  async function change(action: () => Promise<void>) {
    if (writing.current) return
    writing.current = true
    request.current++
    setBusy(true)
    setError('')
    try { await action() }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save the change.') }
    finally { writing.current = false; setBusy(false) }
  }

  function reset() {
    setTitle('')
    setKind('movie')
    setEditingId(null)
    setError('')
  }

  function replace(item: WatchItem) {
    setItems(current => current?.map(existing => existing.id === item.id ? item : existing) ?? [item])
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const input = { title: title.trim(), kind }
    if (!input.title) return
    void change(async () => {
      if (editingId) replace(await repository.saveWatchItem(editingId, input))
      else {
        const added = await repository.createWatchItem(input)
        setItems(current => [added, ...(current ?? [])])
        if (filter === 'watched') setFilter('all')
      }
      reset()
    })
  }

  function toggle(item: WatchItem) {
    const watched_on = item.watched_on ? null : format(new Date(), 'yyyy-MM-dd')
    void change(async () => replace(await repository.saveWatchItem(item.id, { watched_on })))
  }

  function remove(item: WatchItem) {
    if (!window.confirm(`Remove “${item.title}” from your watchlist?`)) return
    void change(async () => {
      await repository.removeWatchItem(item.id)
      setItems(current => current?.filter(existing => existing.id !== item.id) ?? [])
      if (editingId === item.id) reset()
    })
  }

  if (!active) return null
  const visible = items?.filter(item => filter === 'all' || Boolean(item.watched_on) === (filter === 'watched')) ?? []

  return <section className="watchlist-view" aria-labelledby="watchlist-title">
    <h1 id="watchlist-title">Watchlist</h1>
    <form className="watchlist-compose" onSubmit={submit}>
      <label className="sr-only" htmlFor="watchlist-title-input">Title</label>
      <input id="watchlist-title-input" placeholder="Add a title…" value={title} maxLength={200} disabled={busy || !items} onChange={event => setTitle(event.target.value)}/>
      <label className="sr-only" htmlFor="watchlist-kind">Type</label>
      <select id="watchlist-kind" value={kind} disabled={busy || !items} onChange={event => setKind(event.target.value === 'show' ? 'show' : 'movie')}>
        <option value="movie">Movie</option>
        <option value="show">TV show</option>
      </select>
      <button className="button primary" disabled={!title.trim() || busy || !items} aria-label={editingId ? 'Save title' : 'Add title'}>{editingId ? <Check size={18}/> : <Plus size={18}/>}</button>
      {hasDraft && <button className="icon-button" type="button" disabled={busy} aria-label="Cancel watchlist edit" onClick={reset}><X size={17}/></button>}
    </form>
    {loadError && <p className="form-error" role="alert">Could not load your watchlist. <button className="watchlist-retry" onClick={() => void load()}>Retry</button></p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!items && !loadError && <p className="watchlist-empty" role="status">Loading watchlist…</p>}
    {items && <>
      <div className="watchlist-filters" role="group" aria-label="Watchlist filters">
        {(Object.keys(filters) as (keyof typeof filters)[]).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{filters[value]}</button>)}
      </div>
      <ul className="watchlist-items">{visible.map(item => <li className="watchlist-row" key={item.id}>
        <input type="checkbox" checked={Boolean(item.watched_on)} disabled={busy} aria-label={`Mark ${item.title} ${item.watched_on ? 'unwatched' : 'watched'}`} onChange={() => toggle(item)}/>
        <div className="watchlist-entry">
          <strong>{item.title}</strong>
          <span>{kinds[item.kind]}{item.watched_on && <> · Watched <time dateTime={item.watched_on}>{format(parseISO(item.watched_on), 'd MMM yyyy')}</time></>}</span>
        </div>
        <button className="icon-button" disabled={busy || hasDraft} aria-label={`Edit ${item.title}`} onClick={() => { setTitle(item.title); setKind(item.kind); setEditingId(item.id); setError('') }}><Pencil size={15}/></button>
        <button className="icon-button" disabled={busy} aria-label={`Remove ${item.title}`} onClick={() => remove(item)}><Trash2 size={15}/></button>
      </li>)}</ul>
      {!visible.length && <p className="watchlist-empty">{filter === 'all' ? 'No titles yet.' : filter === 'watched' ? 'Nothing watched yet.' : 'Nothing to watch yet.'}</p>}
    </>}
  </section>
}
