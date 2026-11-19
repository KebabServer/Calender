import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { AlertCircle, ArrowUpRight, Cloud, CloudOff, Download, List, LoaderCircle, LogOut, Moon, X } from 'lucide-react'
import { AuthScreen } from './components/AuthScreen'
import { CalendarView } from './components/CalendarView'
import { EventDialog } from './components/EventDialog'
import { TasksView } from './components/TasksView'
import { WeatherView } from './components/WeatherView'
import { FoodView } from './components/FoodView'
import { WatchlistView } from './components/WatchlistView'
import { NotesView } from './components/NotesView'
import { UpdateNotice } from './components/UpdateNotice'
import { updateUrl, useAppUpdate } from './lib/app-updates'
import { Sidebar } from './components/Sidebar'
import { createCloudRepository, demoRepository } from './data/repository'
import { occursOn } from './lib/events'
import { useNoteAutosave } from './lib/use-note-autosave'
import { cloudEnabled, supabase } from './lib/supabase'
import { WEATHER_COORDINATES, type WeatherLocation } from './lib/weather'
import type { CalendarEvent, EventInput, NoteFilter, View, Task, TaskInput, TaskUpdates, WatchItem } from './types'

const formatDay = (date: Date) => format(date, 'yyyy-MM-dd')
function App() {
  const update = useAppUpdate()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!cloudEnabled)
  const [authError, setAuthError] = useState('')
  useEffect(() => {
    if (!supabase) return
    let active = true
    let authEventReceived = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true
      if (active) { setSession(next); setReady(true) }
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return
      if (error) setAuthError(error.message)
      setSession(data.session); setReady(true)
    }).catch(() => { if (active) { setAuthError('Could not restore your session. Please sign in again.'); setReady(true) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  if (!ready) return <div className="app-loading">Loading...</div>
  if (cloudEnabled && !session) return <>{update && <UpdateNotice onUpdate={() => window.location.replace(updateUrl(update))}/>}<AuthScreen/>{authError && <div role="alert">{authError}</div>}</>
  // Remount all data, dialogs and save queues when the account changes.
  return <Workspace key={session?.user.id ?? 'demo'} session={session} update={update}/>
}

function Workspace({ session, update }: { session: Session | null; update: string | null }) {
  const authReady = true
  const [activeView, setActiveView] = useState<View>('calendar')
  const [weatherLocation, setWeatherLocation] = useState<WeatherLocation>(() => {
    const saved = localStorage.getItem('daymark_weather_location') as WeatherLocation | null
    return saved && Object.hasOwn(WEATHER_COORDINATES, saved) ? saved : 'Helsinki'
  })
  const [agendaEnabled, setAgendaEnabled] = useState(() => localStorage.getItem('daymark_calendar_agenda') !== 'off')
  const [tasks, setTasks] = useState<Task[]>([])
  const [undoTasks, setUndoTasks] = useState<Task[]>([])
  const [taskBusy, setTaskBusy] = useState(false)
  const [taskDraftDirty, setTaskDraftDirty] = useState(false)
  const [watchlistPending, setWatchlistPending] = useState(false)
  const taskRevision = useRef(0)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [noteSelection, setNoteSelection] = useState<{ id: string; preview: boolean } | null>(null)
  const selectedNoteId = noteSelection?.id ?? null
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all')
  const [month, setMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dialog, setDialog] = useState<{date: string; event: CalendarEvent | null}|null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState<'dark'|'light'>(() => localStorage.getItem('daymark_theme') === 'light' ? 'light' : 'dark')
  const [updating, setUpdating] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const eventRevision = useRef(0)
  const eventOperations = useRef(0)
  const refreshSequence = useRef(0)
  const backupRequest = useRef<AbortController | null>(null)
  const activeUserId = session?.user.id
  const repository = useMemo(() => activeUserId && supabase ? createCloudRepository(activeUserId) : demoRepository, [activeUserId])

  useEffect(() => { localStorage.setItem('daymark_weather_location', weatherLocation) }, [weatherLocation])
  useEffect(() => { localStorage.setItem('daymark_calendar_agenda', agendaEnabled ? 'on' : 'off') }, [agendaEnabled])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('daymark_theme', theme) }, [theme])
  useEffect(() => () => {
    backupRequest.current?.abort()
    backupRequest.current = null
  }, [])
  const { notes, revision: noteRevision, mergeRemote: mergeNotes, edit: editNote, create: newNote, remove: removeNote,
    flush: flushNotes, status: noteStatus, saving, hasUnsaved } = useNoteAutosave(repository, setError)

  const refresh = useCallback(async () => {
    const request = ++refreshSequence.current
    const revisions = { notes: noteRevision.current, events: eventRevision.current, tasks: taskRevision.current }
    const [nextNotes, nextEvents, nextTasks] = await Promise.all([repository.getNotes(), repository.getEvents(), repository.getTasks()])
    if (request !== refreshSequence.current) return
    mergeNotes(nextNotes, revisions.notes)
    if (!eventOperations.current && revisions.events === eventRevision.current) setEvents(nextEvents)
    if (revisions.tasks === taskRevision.current) setTasks(nextTasks)
  }, [repository, mergeNotes, noteRevision])

  useEffect(() => {
    if (!authReady || (cloudEnabled && !activeUserId)) { setLoading(false); setEvents([]); setTasks([]); return }
    let cancelled = false
    setLoading(true)
    void refresh().then(() => { if (!cancelled) setLoading(false) }).catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) } })
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | undefined
    if (supabase && activeUserId) {
      channel = supabase.channel(`daymark-data-${activeUserId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${activeUserId}` }, () => { void refresh().catch(e => setError(String(e))) })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `user_id=eq.${activeUserId}` }, () => { void refresh().catch(e => setError(String(e))) })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${activeUserId}` }, () => { void refresh().catch(e => setError(String(e))) })
        .subscribe()
    }
    return () => { cancelled = true; if (channel && supabase) void supabase.removeChannel(channel) }
  }, [authReady, activeUserId, repository, refresh])

  useEffect(() => {
    if (!authReady || (cloudEnabled && !activeUserId)) return
    const syncOnReturn = () => { if (!document.hidden) void refresh().catch(e => setError(String(e))) }
    window.addEventListener('focus', syncOnReturn)
    window.addEventListener('online', syncOnReturn)
    document.addEventListener('visibilitychange', syncOnReturn)
    return () => { window.removeEventListener('focus', syncOnReturn); window.removeEventListener('online', syncOnReturn); document.removeEventListener('visibilitychange', syncOnReturn) }
  }, [authReady, activeUserId, refresh])

  useEffect(() => {
    if (taskBusy) return
    const deadlines = tasks.filter(task => task.next_refresh_at && task.refresh_weekday != null).map(task => new Date(task.next_refresh_at!).getTime()).filter(Number.isFinite)
    if (!deadlines.length) return
    const remaining = Math.min(...deadlines) - Date.now()
    const timer = window.setTimeout(() => { if (!document.hidden) void refresh().catch(e => setError(String(e))) }, remaining > 0 ? Math.min(remaining + 250, 2147483647) : 30000)
    return () => window.clearTimeout(timer)
  }, [tasks, taskBusy, refresh])

  async function createNote() {
    try { const note = await newNote(); setNoteSelection({ id: note.id, preview: false }); setNoteFilter('all'); setActiveView('notes') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  function selectNote(id: string | null) {
    setNoteSelection(id ? { id, preview: true } : null)
  }
  function setNotePreview(preview: boolean) {
    setNoteSelection(current => current ? { ...current, preview } : null)
  }
  function navigate(view: View) {
    if (view === 'notes' && activeView !== 'notes') setNotePreview(true)
    setActiveView(view)
  }
  async function deleteNote(id: string) {
    if (!window.confirm('Delete this note? This cannot be undone.')) return
    eventRevision.current++; eventOperations.current++
    try { await removeNote(id); setEvents(old => old.map(e => e.note_id === id ? { ...e, note_id: null } : e)); setNoteSelection(null) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { eventRevision.current++; eventOperations.current-- }
  }
  async function saveEvent(input: EventInput, id?: string, copyCount = 0) {
    eventRevision.current++; eventOperations.current++
    try {
      if (copyCount > 0) {
        const saved = await repository.saveEventWithCopies(input, id, copyCount)
        setEvents(old => [...new Map([...old, ...saved].map(e => [e.id, e])).values()])
      }
      else if (id) { await repository.saveEvent(id, input); setEvents(old => old.map(e => e.id === id ? { ...e, ...input, updated_at: new Date().toISOString() } : e)) }
      else { const created = await repository.createEvent(input); setEvents(old => [...old.filter(e => e.id !== created.id), created]) }
      const nextDate = id && occursOn({ ...input, id, created_at: '', updated_at: '' }, selectedDate) ? selectedDate : new Date(`${input.event_date}T12:00:00`)
      setMonth(nextDate); setSelectedDate(nextDate)
    } finally { eventRevision.current++; eventOperations.current-- }
  }
  async function deleteEvent(id: string) {
    eventRevision.current++; eventOperations.current++
    try { await repository.removeEvent(id); setEvents(old => old.filter(e => e.id !== id)) }
    finally { eventRevision.current++; eventOperations.current-- }
  }
  function openNote(id: string) { setActiveView('notes'); selectNote(id); setNoteFilter('all') }
  async function addTask(input: TaskInput) {
    setTaskBusy(true); taskRevision.current++
    try {
      const saved = await repository.createTask(input)
      setTasks(old => [saved, ...old.filter(t => t.id !== saved.id)])
    } finally { taskRevision.current++; setTaskBusy(false) }
  }
  async function changeTask(id: string, changes: TaskUpdates) {
    setTaskBusy(true); taskRevision.current++
    try {
      const saved = await repository.saveTask(id, changes)
      setTasks(old => old.map(t => t.id === id ? saved : t))
    } finally { taskRevision.current++; setTaskBusy(false) }
  }
  async function deleteTask(id: string) {
    const deleted = tasks.find(t => t.id === id)
    setTaskBusy(true); taskRevision.current++
    try { await repository.removeTask(id); setTasks(old => old.filter(t => t.id !== id)); if (deleted) setUndoTasks(old => [...old, deleted]) }
    finally { taskRevision.current++; setTaskBusy(false) }
  }
  useEffect(() => {
    if (!undoTasks.length || taskBusy) return
    const timer = window.setTimeout(() => setUndoTasks([]), 10000)
    return () => window.clearTimeout(timer)
  }, [undoTasks, taskBusy])

  async function undoTaskDeletion() {
    const deleted = undoTasks[undoTasks.length - 1]
    if (!deleted || taskBusy) return
    setError('')
    setTaskBusy(true); taskRevision.current++
    try {
      const restored = await repository.restoreTask(deleted)
      setTasks(old => [...old.filter(t => t.id !== restored.id), restored])
      setUndoTasks(old => old.filter(t => t.id !== deleted.id))
    } catch (e) { setError(`Could not restore task: ${e instanceof Error ? e.message : String(e)}`) }
    finally { taskRevision.current++; setTaskBusy(false) }
  }
  async function exportData() {
    backupRequest.current?.abort()
    const request = new AbortController()
    backupRequest.current = request
    const timeout = window.setTimeout(() => request.abort(), 5000)
    let watchlist: WatchItem[] | undefined
    try { watchlist = await repository.getWatchlist(request.signal) }
    catch { /* Still export local notes, events and tasks. */ }
    finally { window.clearTimeout(timeout) }
    if (backupRequest.current !== request) return
    backupRequest.current = null
    if (!watchlist) setError('Your backup was created without the watchlist. Check your connection and export again to include it.')
    const data = JSON.stringify({ exported_at: new Date().toISOString(), notes, events, tasks, watchlist }, null, 2)
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `daymark-backup-${formatDay(new Date())}.json`; link.click(); URL.revokeObjectURL(url)
  }
  async function signOut() {
    if (updating || signingOut) return
    if (taskBusy || taskDraftDirty || watchlistPending || dialog) { setError('Finish or cancel your edit before signing out.'); return }
    setSigningOut(true)
    try {
      await flushNotes()
      const { error } = await supabase!.auth.signOut()
      if (error) throw error
    } catch (e) { setError(`Could not sign out safely: ${e instanceof Error ? e.message : String(e)}. Your unsaved notes are still here.`) }
    finally { setSigningOut(false) }
  }

  async function applyUpdate() {
    if (!update || dialog || updating || signingOut || taskBusy || taskDraftDirty || watchlistPending || undoTasks.length) return
    if (!navigator.onLine) { setError('Connect to the internet before updating. Your changes are still here.'); return }
    setUpdating(true)
    try {
      await flushNotes()
      window.location.replace(updateUrl(update))
    } catch {
      setUpdating(false)
      setError('Could not save your notes. The update is paused; your text is still here. Try again when connected.')
    }
  }

  useEffect(() => {
    if (update && navigator.onLine && !updating && !signingOut && !undoTasks.length && !loading && !saving && !taskBusy && !taskDraftDirty && !watchlistPending && !dialog && !settingsOpen && (activeView === 'calendar' || activeView === 'weather' || activeView === 'food')
      && !hasUnsaved
      && new URL(window.location.href).searchParams.get('daymark_release') !== update) {
      window.location.replace(updateUrl(update))
    }
  }, [update, updating, signingOut, hasUnsaved, undoTasks.length, loading, saving, taskBusy, taskDraftDirty, watchlistPending, dialog, settingsOpen, activeView])

  if (signingOut) return <div className="app-loading" role="status">Saving changes and signing out…</div>
  if (updating) return <div className="app-loading" role="status">Saving changes and updating…</div>
  if (!authReady) return <div className="app-loading"><LoaderCircle className="spin" size={30}/><span>Opening Daymark...</span></div>
  if (cloudEnabled && !session) return <><AuthScreen/>{error && <div className="toast-error"><AlertCircle size={17}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button></div>}</>
  const errorNotice = error && <div className={`toast-error ${settingsOpen ? 'settings-error' : update || undoTasks.length ? 'above-update' : ''}`} role="alert">
    <AlertCircle size={17}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button>
  </div>
  return <div className="app-shell">
    {update && !undoTasks.length && <UpdateNotice disabled={Boolean(dialog) || taskBusy || taskDraftDirty || watchlistPending} onUpdate={() => void applyUpdate()}/>}
    {undoTasks.length > 0 && <div className="undo-notice" role="status"><span>{undoTasks.length === 1 ? 'Task deleted.' : `${undoTasks.length} tasks deleted.`}</span><button className="button primary" disabled={taskBusy} onClick={() => void undoTaskDeletion()}>Undo</button><button className="icon-button" disabled={taskBusy} aria-label="Dismiss undo" onClick={() => setUndoTasks([])}><X size={16}/></button></div>}
    <Sidebar active={activeView} onNavigate={navigate} onOpenSettings={() => setSettingsOpen(true)}/>
    <main className="app-main">
      {loading ? <div className="content-loading"><LoaderCircle size={27} className="spin"/><span>Loading...</span></div> : <><WatchlistView active={activeView === 'watchlist'} repository={repository} onPendingChange={setWatchlistPending}/><TasksView active={activeView === 'tasks'} tasks={tasks} busy={taskBusy} onDraftChange={setTaskDraftDirty} onAdd={addTask} onChange={changeTask} onDelete={deleteTask}/>{activeView === 'notes' ? <NotesView notes={notes} selectedId={selectedNoteId} onSelect={selectNote} preview={noteSelection?.preview ?? true} onPreviewChange={setNotePreview} onCreate={() => void createNote()} onEdit={editNote} onDelete={id => void deleteNote(id)} filter={noteFilter} onFilter={setNoteFilter} saveStatus={selectedNoteId ? noteStatus(selectedNoteId) : 'saved'} onRetrySave={() => { setError(''); void flushNotes().catch(() => {}) }}/> : activeView === 'calendar' ? <CalendarView month={month} onMonth={setMonth} selectedDate={selectedDate} onSelectDate={setSelectedDate} events={events} notes={notes} agendaEnabled={agendaEnabled} onCreate={day => setDialog({ date: formatDay(day), event: null })} onOpenEvent={e => setDialog({ date: e.event_date, event: e })} onOpenNote={openNote}/> : activeView === 'weather' ? <WeatherView location={weatherLocation} onLocationChange={setWeatherLocation}/> : activeView === 'food' ? <FoodView/> : null}</>}
    </main>
    {dialog && <EventDialog key={dialog.event?.id || `new-${dialog.date}`} event={dialog.event} date={dialog.date} notes={notes} onClose={() => setDialog(null)} onSave={saveEvent} onDelete={deleteEvent}/>}
    {settingsOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="settings-header">
          <div><h2 id="settings-title">Settings</h2></div>
          <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={20}/></button>
        </div>
        {errorNotice}
        <div className="settings-status">
          <div className="settings-status-icon">{cloudEnabled ? <Cloud size={24}/> : <CloudOff size={24}/>}</div>
          <div><strong>{cloudEnabled ? 'Cloud sync enabled' : 'Local demo mode'}</strong><p>{cloudEnabled ? `Signed in as ${session?.user.email}. Your content is stored privately in Supabase.` : 'Your content is stored in this browser only. They will NOT sync between devices until you configure Supabase.'}</p></div>
        </div>
        <button className="settings-row" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Moon size={19}/><span>Appearance <small>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</small></span><ArrowUpRight size={17}/></button>
        <label className="settings-row settings-toggle">
          <List size={19}/><span>Next 7 days agenda</span>
          <input type="checkbox" checked={agendaEnabled} onChange={event => setAgendaEnabled(event.target.checked)}/>
        </label>
        <button className="settings-row" onClick={() => void exportData()}><Download size={19}/><span>Export your data <small>Download your Daymark data as JSON</small></span><ArrowUpRight size={17}/></button>
        {!cloudEnabled && <div className="settings-hint">To enable cross-device login, follow the <strong>README.md</strong>, set up Supabase, and redeploy. Demo data won't automatically migrate to your new account.</div>}
        {cloudEnabled && <button className="settings-row signout" onClick={() => void signOut()}><LogOut size={19}/><span>Sign out <small>End your session on this device</small></span><ArrowUpRight size={17}/></button>}
      </section>
    </div>}
    {!settingsOpen && errorNotice}
  </div>
}
export default App
