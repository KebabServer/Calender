import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Repository } from '../data/repository'
import type { WatchItem } from '../types'
import { LinkedText, WebLink } from './TextLinks'

type Props = {
  active: boolean
  repository: Repository
  onPendingChange: (pending: boolean) => void
}

const kinds = { movie: 'Movie', show: 'TV show' } as const
const maxSeason = 999
const maxEpisode = 9999
const statuses = { queued: 'Queue', watching: 'Currently watching', in_progress: 'In progress', finished: 'Finished' } as const
const statusOptions = { ...statuses, watching: 'Watching' } as const
const filters = { all: 'All', ...statuses } as const
const emptyMessages = {
  all: 'No titles yet.',
  queued: 'Your queue is empty.',
  watching: 'No titles currently being watched.',
  in_progress: 'No titles in progress.',
  finished: 'No finished titles yet.',
}
type Status = keyof typeof statuses

function statusOf(item: WatchItem): Status {
  if (item.watched_on) return 'finished'
  if (!item.started) return 'queued'
  return item.currently_watching ? 'watching' : 'in_progress'
}

export function WatchlistView({ active, repository, onPendingChange }: Props) {
  const [items, setItems] = useState<WatchItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<WatchItem['kind']>('movie')
  const [description, setDescription] = useState('')
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [season, setSeason] = useState('')
  const [episode, setEpisode] = useState('')
  const [editingItem, setEditingItem] = useState<WatchItem | null>(null)
  const [filter, setFilter] = useState<keyof typeof filters>('all')
  const [search, setSearch] = useState('')
  const request = useRef(0)
  const writing = useRef(false)
  const hasDraft = Boolean(title.trim() || description.trim() || editingItem || kind !== 'movie')

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
    setDescription('')
    setDescriptionOpen(false)
    setSeason('')
    setEpisode('')
    setEditingItem(null)
    setError('')
  }

  function edit(item: WatchItem) {
    setTitle(item.title)
    setKind(item.kind)
    setDescription(item.description)
    setDescriptionOpen(true)
    setSeason(item.season == null ? '' : String(item.season))
    setEpisode(item.episode == null ? '' : String(item.episode))
    setEditingItem(item)
    setError('')
  }

  function replace(item: WatchItem) {
    setItems(current => current?.map(existing => existing.id === item.id ? item : existing) ?? [item])
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const input = { title: title.trim(), kind, description: description.trim() }
    if (!input.title) return
    const progress = {
      season: kind === 'show' && season !== '' ? Number(season) : null,
      episode: kind === 'show' && episode !== '' ? Number(episode) : null,
    }
    if ((progress.season === null) !== (progress.episode === null)) {
      setError('Enter both season and episode, or leave both blank.')
      return
    }
    void change(async () => {
      if (editingItem) {
        const changedProgress = editingItem.kind !== kind || (editingItem.season ?? null) !== progress.season || (editingItem.episode ?? null) !== progress.episode
        replace(await repository.saveWatchItem(editingItem.id, changedProgress ? { ...input, ...progress } : input))
      } else {
        const added = await repository.createWatchItem({ ...input, ...progress })
        setItems(current => [added, ...(current ?? [])])
        if (filter !== 'queued') setFilter('all')
      }
      reset()
    })
  }

  function changeStatus(item: WatchItem, status: Status) {
    if (statusOf(item) === status) return
    const updates = status === 'finished'
      ? { currently_watching: false, watched_on: format(new Date(), 'yyyy-MM-dd') }
      : { started: status !== 'queued', currently_watching: status === 'watching', watched_on: null }
    void change(async () => replace(await repository.saveWatchItem(item.id, updates)))
  }

  function advanceEpisode(item: WatchItem) {
    const { season, episode } = item
    if (season == null || episode == null || episode >= maxEpisode) return
    void change(async () => {
      try {
        replace(await repository.saveWatchItem(item.id, { episode: episode + 1 }, { season, episode }))
      } catch (error) {
        const latest = await repository.getWatchlist().catch(() => null)
        if (latest) setItems(latest)
        throw error
      }
    })
  }

  function remove(item: WatchItem) {
    if (!window.confirm(`Remove “${item.title}” from your watchlist?`)) return
    void change(async () => {
      await repository.removeWatchItem(item.id)
      setItems(current => current?.filter(existing => existing.id !== item.id) ?? [])
      if (editingItem?.id === item.id) reset()
    })
  }

  if (!active) return null
  const query = search.trim().toLowerCase()
  const visible = (items ?? [])
    .map(item => ({ item, status: statusOf(item) }))
    .filter(({ item, status }) => (filter === 'all' || status === filter)
      && (!query || item.title.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)))
  const watching = filter === 'all' ? visible.filter(({ status }) => status === 'watching') : []
  const inProgress = filter === 'all' ? visible.filter(({ status }) => status === 'in_progress') : []
  const groups = watching.length || inProgress.length ? [
    { id: 'currently-watching', label: statuses.watching, entries: watching },
    { id: 'in-progress', label: statuses.in_progress, entries: inProgress },
    { id: 'other-titles', label: 'Other titles', entries: visible.filter(({ status }) => status === 'queued' || status === 'finished') },
  ] : [{ id: 'other-titles', label: null, entries: visible }]

  return <section className="watchlist-view" aria-labelledby="watchlist-title">
    <h1 id="watchlist-title">Watchlist</h1>
    <form className="watchlist-compose" onSubmit={submit}>
      <div className="watchlist-compose-main">
        <label className="sr-only" htmlFor="watchlist-title-input">Title</label>
        <input id="watchlist-title-input" placeholder="Add a title…" value={title} maxLength={200} disabled={busy || !items} onChange={event => setTitle(event.target.value)}/>
        <label className="sr-only" htmlFor="watchlist-kind">Type</label>
        <select id="watchlist-kind" value={kind} disabled={busy || !items} onChange={event => setKind(event.target.value === 'show' ? 'show' : 'movie')}>
          <option value="movie">Movie</option>
          <option value="show">TV show</option>
        </select>
        <button className="button primary" disabled={!title.trim() || busy || !items} aria-label={editingItem ? 'Save title' : 'Add title'}>{editingItem ? <Check size={18}/> : <Plus size={18}/>}</button>
        {hasDraft && <button className="icon-button" type="button" disabled={busy} aria-label="Cancel watchlist edit" onClick={reset}><X size={17}/></button>}
      </div>
      <button className="watchlist-description-toggle" type="button" aria-expanded={descriptionOpen} aria-controls="watchlist-description-input" disabled={busy || !items} onClick={() => setDescriptionOpen(current => !current)}>
        <ChevronDown size={14} aria-hidden="true"/> Description
      </button>
      <textarea id="watchlist-description-input" aria-label="Description" className="watchlist-description-input" hidden={!descriptionOpen} rows={2} maxLength={5000} value={description} disabled={busy || !items} onChange={event => setDescription(event.target.value)}/>
      {kind === 'show' && <fieldset className="watchlist-episode-fields">
        <legend>Last watched <small>(optional)</small></legend>
        <label>Season<input type="number" inputMode="numeric" min={0} max={maxSeason} step={1} value={season} disabled={busy || !items} onChange={event => setSeason(event.target.value)}/></label>
        <label>Episode<input type="number" inputMode="numeric" min={1} max={maxEpisode} step={1} value={episode} disabled={busy || !items} onChange={event => setEpisode(event.target.value)}/></label>
      </fieldset>}
    </form>
    {loadError && <p className="form-error" role="alert">Could not load your watchlist. <button className="watchlist-retry" onClick={() => void load()}>Retry</button></p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!items && !loadError && <p className="watchlist-empty" role="status">Loading watchlist…</p>}
    {items && <>
      <label className="search-input watchlist-search">
        <Search size={16} aria-hidden="true"/>
        <input type="search" aria-label="Search watchlist" placeholder="Search watchlist…" value={search} onChange={event => setSearch(event.target.value)}/>
      </label>
      <div className="watchlist-filters" role="group" aria-label="Watchlist filters">
        {(Object.keys(filters) as (keyof typeof filters)[]).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{filters[value]}</button>)}
      </div>
      {groups.filter(group => group.entries.length > 0).map(({ id, label, entries }) => <div className="watchlist-group" key={id}>
        {label && <h2 id={id}>{label}</h2>}
        <ul className="watchlist-items" aria-labelledby={label ? id : undefined}>
          {entries.map(({ item, status }) => <li className="watchlist-row" key={item.id}>
            <div className="watchlist-entry">
              <div className="watchlist-entry-title">
                <strong>{item.title}</strong>
                {status === 'watching' && <span className="watchlist-watching">Watching</span>}
              </div>
              <span>{kinds[item.kind]} · <WebLink className="watchlist-imdb" href={`https://www.imdb.com/find/?${new URLSearchParams({ q: item.title, s: 'tt' })}`} aria-label={`Search IMDb for ${item.title}`}>
                IMDb <ArrowUpRight size={12} aria-hidden="true"/>
              </WebLink>{item.watched_on && <> · <time dateTime={item.watched_on}>{format(parseISO(item.watched_on), 'd MMM yyyy')}</time></>}</span>
            </div>
            <select className="watchlist-status" value={status} disabled={busy} aria-label={`Status for ${item.title}`} onChange={event => changeStatus(item, event.target.value as Status)}>
              {Object.entries(statusOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="icon-button" disabled={busy || hasDraft} aria-label={`Edit ${item.title}`} onClick={() => edit(item)}><Pencil size={15}/></button>
            <button className="icon-button" disabled={busy} aria-label={`Remove ${item.title}`} onClick={() => remove(item)}><Trash2 size={15}/></button>
            {item.kind === 'show' && item.season != null && item.episode != null && <div className="watchlist-episode">
              <span>Last watched <strong>S{String(item.season).padStart(2, '0')} E{String(item.episode).padStart(2, '0')}</strong></span>
              <button type="button" disabled={busy || hasDraft || item.episode >= maxEpisode} aria-label={`Advance episode for ${item.title}`} onClick={() => advanceEpisode(item)}>+1 episode</button>
            </div>}
            {item.description && <p className="watchlist-description"><LinkedText text={item.description}/></p>}
          </li>)}
        </ul>
      </div>)}
      {!visible.length && <p className="watchlist-empty" role="status">{query ? 'No matching titles.' : emptyMessages[filter]}</p>}
    </>}
  </section>
}
