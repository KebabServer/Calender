import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { AlertCircle, ArrowUpRight, Cloud, CloudOff, Download, LoaderCircle, LogOut, Moon, X } from 'lucide-react'
import { AuthScreen } from './components/AuthScreen'
import { CalendarView } from './components/CalendarView'
import { EventDialog } from './components/EventDialog'
import { NotesView } from './components/NotesView'
import { UpdateNotice } from './components/UpdateNotice'
import { updateUrl, useAppUpdate } from './lib/app-updates'
import { Sidebar } from './components/Sidebar'
import { createCloudRepository, demoRepository } from './data/repository'
import { occursOn } from './lib/events'
import { cloudEnabled, supabase } from './lib/supabase'
import type { CalendarEvent, EventInput, Note, NoteFilter, View } from './types'

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
  const [notes, setNotes] = useState<Note[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string|null>(null)
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all')
  const [month, setMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dialog, setDialog] = useState<{date: string; event: CalendarEvent | null}|null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState<'dark'|'light'>(() => localStorage.getItem('daymark_theme') === 'light' ? 'light' : 'dark')
  const [updating, setUpdating] = useState(false)
  const dirtyNoteIds = useRef(new Set<string>())
  const pendingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingPatches = useRef(new Map<string, Partial<Pick<Note,'title'|'content'|'pinned'>>>())
  const inFlightSaves = useRef(new Map<string, Promise<void>>())
  const activeUserId = session?.user.id
  const repository = useMemo(() => activeUserId && supabase ? createCloudRepository(activeUserId) : demoRepository, [activeUserId])

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('daymark_theme', theme) }, [theme])
  useEffect(() => () => {
    for (const timer of pendingTimers.current.values()) clearTimeout(timer)
    pendingTimers.current.clear()
    pendingPatches.current.clear()
  }, [])

  const refresh = useCallback(async () => {
    const [nextNotes, nextEvents] = await Promise.all([repository.getNotes(), repository.getEvents()])
    setNotes(current => nextNotes.map(n => (pendingPatches.current.has(n.id) || inFlightSaves.current.has(n.id) || dirtyNoteIds.current.has(n.id)) ? current.find(c => c.id === n.id) || n : n))
    setEvents(nextEvents)
  }, [repository])

  useEffect(() => {
    if (!authReady || (cloudEnabled && !activeUserId)) { setLoading(false); setNotes([]); setEvents([]); return }
    let cancelled = false
    setLoading(true)
    Promise.all([repository.getNotes(), repository.getEvents()]).then(([loadedNotes, loadedEvents]) => { if (!cancelled) { setNotes(loadedNotes); setEvents(loadedEvents); setLoading(false) } }).catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) } })
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | undefined
    if (supabase && activeUserId) {
      channel = supabase.channel(`daymark-data-${activeUserId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${activeUserId}` }, () => { void refresh().catch(e => setError(String(e))) })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `user_id=eq.${activeUserId}` }, () => { void refresh().catch(e => setError(String(e))) })
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

  function enqueueSave(id: string, patch: Partial<Pick<Note,'title'|'content'|'pinned'>>) {
    // Serialize saves per note so slower requests cannot overwrite newer text.
    const previous = inFlightSaves.current.get(id) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(() => repository.saveNote(id, patch))
    inFlightSaves.current.set(id, next)
    void next.then(() => {
      if (inFlightSaves.current.get(id) === next && !pendingPatches.current.has(id)) dirtyNoteIds.current.delete(id)
    }).catch(e => setError(`Could not save note: ${e instanceof Error ? e.message : String(e)}`)).finally(() => {
      if (inFlightSaves.current.get(id) === next) inFlightSaves.current.delete(id)
      setSaving(pendingTimers.current.size > 0 || inFlightSaves.current.size > 0)
    })
    return next
  }
  async function createNote() {
    try { const note = await repository.createNote(); setNotes(old => [note, ...old]); setSelectedNoteId(note.id); setNoteFilter('all'); setActiveView('notes') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  function editNote(id: string, changes: Partial<Pick<Note,'title'|'content'|'pinned'>>) {
    setNotes(old => old.map(n => n.id === id ? { ...n, ...changes, updated_at: new Date().toISOString() } : n))
    dirtyNoteIds.current.add(id)
    const current = notes.find(n => n.id === id)
    pendingPatches.current.set(id, { ...(current ? { title: current.title, content: current.content, pinned: current.pinned } : {}), ...pendingPatches.current.get(id), ...changes })
    const timer = pendingTimers.current.get(id)
    if (timer) clearTimeout(timer)
    setSaving(true)
    pendingTimers.current.set(id, setTimeout(() => {
      const patch = pendingPatches.current.get(id)
      pendingPatches.current.delete(id)
      pendingTimers.current.delete(id)
      if (patch) void enqueueSave(id, patch)
    }, 650))
  }
  async function deleteNote(id: string) {
    if (!window.confirm('Delete this note? This cannot be undone.')) return
    if (pendingTimers.current.get(id)) clearTimeout(pendingTimers.current.get(id))
    pendingTimers.current.delete(id); pendingPatches.current.delete(id)
    try { await inFlightSaves.current.get(id)?.catch(() => {}); await repository.removeNote(id); dirtyNoteIds.current.delete(id); setNotes(old => old.filter(n => n.id !== id)); setEvents(old => old.map(e => e.note_id === id ? { ...e, note_id: null } : e)); setSelectedNoteId(null) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  async function saveEvent(input: EventInput, id?: string, copyCount = 0) {
    if (copyCount > 0) {
      const saved = await repository.saveEventWithCopies(input, id, copyCount)
      setEvents(old => [...new Map([...old, ...saved].map(e => [e.id, e])).values()])
    }
    else if (id) { await repository.saveEvent(id, input); setEvents(old => old.map(e => e.id === id ? { ...e, ...input, updated_at: new Date().toISOString() } : e)) }
    else { const created = await repository.createEvent(input); setEvents(old => [...old.filter(e => e.id !== created.id), created]) }
    const nextDate = id && occursOn({ ...input, id, created_at: '', updated_at: '' }, selectedDate) ? selectedDate : new Date(`${input.event_date}T12:00:00`)
    setMonth(nextDate); setSelectedDate(nextDate)
  }
  async function deleteEvent(id: string) { await repository.removeEvent(id); setEvents(old => old.filter(e => e.id !== id)) }
  function openNote(id: string) { setActiveView('notes'); setSelectedNoteId(id); setNoteFilter('all') }
  function exportData() {
    const data = JSON.stringify({ exported_at: new Date().toISOString(), notes, events }, null, 2)
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `daymark-backup-${formatDay(new Date())}.json`; link.click(); URL.revokeObjectURL(url)
  }
  async function signOut() {
    for (const timer of pendingTimers.current.values()) clearTimeout(timer)
    pendingTimers.current.clear()
    try {
      await Promise.all([...pendingPatches.current].map(([id, patch]) => enqueueSave(id, patch)))
      await Promise.all([...inFlightSaves.current.values()])
    } catch (e) { setError(`Save failed; could not sign out safely: ${String(e)}`); return }
    pendingPatches.current.clear()
    setSettingsOpen(false)
    const { error } = await supabase!.auth.signOut()
    if (error) setError(error.message)
  }

  async function applyUpdate() {
    if (!update || dialog || updating) return
    if (!navigator.onLine) { setError('Connect to the internet before updating. Your changes are still here.'); return }
    setUpdating(true)
    try {
      for (const timer of pendingTimers.current.values()) clearTimeout(timer)
      pendingTimers.current.clear()
      await Promise.allSettled([...inFlightSaves.current.values()])
      const patches = new Map(pendingPatches.current)
      pendingPatches.current.clear()
      // Include failed earlier saves; the latest in-memory note is the source of truth.
      for (const id of dirtyNoteIds.current) {
        const note = notes.find(n => n.id === id)
        if (note) patches.set(id, { title: note.title, content: note.content, pinned: note.pinned })
      }
      await Promise.all([...patches].map(([id, patch]) => enqueueSave(id, patch)))
      window.location.replace(updateUrl(update))
    } catch {
      setUpdating(false)
      setError('Could not save your notes. The update is paused; your text is still here. Try again when connected.')
    }
  }

  useEffect(() => {
    if (update && navigator.onLine && !updating && !loading && !saving && !dialog && !settingsOpen && activeView === 'calendar'
      && dirtyNoteIds.current.size === 0 && !inFlightSaves.current.size && !pendingPatches.current.size
      && new URL(window.location.href).searchParams.get('daymark_release') !== update) {
      window.location.replace(updateUrl(update))
    }
  }, [update, updating, loading, saving, dialog, settingsOpen, activeView])

  if (updating) return <div className="app-loading" role="status">Saving changes and updating…</div>
  if (!authReady) return <div className="app-loading"><LoaderCircle className="spin" size={30}/><span>Opening Daymark...</span></div>
  if (cloudEnabled && !session) return <><AuthScreen/>{error && <div className="toast-error"><AlertCircle size={17}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button></div>}</>
  return <div className="app-shell">
    {update && <UpdateNotice disabled={Boolean(dialog)} onUpdate={() => void applyUpdate()}/>}
    <Sidebar active={activeView} onNavigate={setActiveView} onOpenSettings={() => setSettingsOpen(true)}/>
    <main className="app-main">
      {loading ? <div className="content-loading"><LoaderCircle size={27} className="spin"/><span>Loading...</span></div> : activeView === 'notes' ? <NotesView notes={notes} selectedId={selectedNoteId} onSelect={setSelectedNoteId} onCreate={() => void createNote()} onEdit={editNote} onDelete={id => void deleteNote(id)} filter={noteFilter} onFilter={setNoteFilter} saving={saving}/> : <CalendarView month={month} onMonth={setMonth} selectedDate={selectedDate} onSelectDate={setSelectedDate} events={events} notes={notes} onCreate={() => setDialog({ date: formatDay(selectedDate), event: null })} onOpenEvent={e => setDialog({ date: e.event_date, event: e })} onOpenNote={openNote}/>}
    </main>
    {dialog && <EventDialog key={dialog.event?.id || `new-${dialog.date}`} event={dialog.event} date={dialog.date} notes={notes} onClose={() => setDialog(null)} onSave={saveEvent} onDelete={deleteEvent}/>}
    {settingsOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="settings-header"><div><h2 id="settings-title">Settings</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={20}/></button></div><div className="settings-status"><div className="settings-status-icon">{cloudEnabled ? <Cloud size={24}/> : <CloudOff size={24}/>}</div><div><strong>{cloudEnabled ? 'Cloud sync enabled' : 'Local demo mode'}</strong><p>{cloudEnabled ? `Signed in as ${session?.user.email}. Your content is stored privately in Supabase.` : 'Notes and events are stored in this browser only. They will NOT sync between devices until you configure Supabase.'}</p></div></div><button className="settings-row" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Moon size={19}/><span>Appearance <small>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</small></span><ArrowUpRight size={17}/></button><button className="settings-row" onClick={exportData}><Download size={19}/><span>Export your data <small>Download notes and events as JSON</small></span><ArrowUpRight size={17}/></button>{!cloudEnabled && <div className="settings-hint">To enable cross-device login, follow the <strong>README.md</strong>, set up Supabase, and redeploy. Demo data won't automatically migrate to your new account.</div>}{cloudEnabled && <button className="settings-row signout" onClick={() => void signOut()}><LogOut size={19}/><span>Sign out <small>End your session on this device</small></span><ArrowUpRight size={17}/></button>}</section></div>}
    {error && <div className={`toast-error ${update ? 'above-update' : ''}`} role="alert"><AlertCircle size={17}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
  </div>
}
export default App
