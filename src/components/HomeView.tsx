import { ArrowRight, ArrowUpRight, CalendarDays, ChevronRight, Clock3, FileText, Plus, Sparkles } from 'lucide-react'
import { addDays, format, isBefore, parseISO, startOfDay } from 'date-fns'
import type { CalendarEvent, Note, View } from '../types'

const eventColors: Record<string, string> = { purple: 'purple', mint: 'mint', peach: 'peach', blue: 'blue' }
function eventShortTime(event: CalendarEvent) {
  return event.all_day ? 'All day' : (event.start_time || '').slice(0, 5)
}

type Props = { notes: Note[]; events: CalendarEvent[]; onNavigate: (view: View) => void; onNewNote: () => void; onNewEvent: () => void; onOpenNote: (id: string) => void; onOpenDate: (date: Date) => void }
export function HomeView({ notes, events, onNavigate, onNewNote, onNewEvent, onOpenNote, onOpenDate }: Props) {
  const today = startOfDay(new Date())
  const todayString = format(today, 'yyyy-MM-dd')
  const todayEvents = events.filter(e => e.event_date === todayString).sort((a,b) => (a.start_time || '').localeCompare(b.start_time || ''))
  const upcomingAll = events.filter(e => !isBefore(parseISO(e.event_date), today) && isBefore(parseISO(e.event_date), addDays(today, 15)))
    .sort((a,b) => a.event_date.localeCompare(b.event_date) || (a.start_time || '').localeCompare(b.start_time || ''))
  const upcoming = upcomingAll.slice(0, 4)
  const recent = [...notes].sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3)
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  return <div className="page home-view">
    <div className="top-eyebrow"><span className="eyebrow-sparkle"><Sparkles size={13}/></span> YOUR PERSONAL SPACE</div>
    <div className="home-welcome-row">
      <div><h1>{greeting}<span className="heading-spark">✳</span></h1><p className="page-subtitle">Here's your little corner of calm for {format(today, 'EEEE, MMMM d')}.</p></div>
      <button className="button primary desktop-only" onClick={onNewNote}><Plus size={17}/> Quick note</button>
    </div>
    <div className="welcome-banner">
      <div className="banner-copy"><span className="banner-kicker"><span className="tiny-star">✦</span> A THOUGHT FOR TODAY</span><h2>Make room for what<br/><em>matters most.</em></h2><p>One thought, one plan, one day at a time.</p><button className="banner-link" onClick={onNewNote}>Capture a thought <ArrowUpRight size={16}/></button></div>
      <div className="banner-art" aria-hidden="true"><div className="art-orbit art-orbit-1"/><div className="art-orbit art-orbit-2"/><div className="art-moon"/><div className="art-star star-a">✦</div><div className="art-star star-b">✧</div><div className="art-star star-c">✳</div></div>
    </div>
    <div className="stats-grid">
      <button className="stat-card" onClick={() => onNavigate('notes')}><span className="stat-card-icon icon-purple"><FileText size={19}/></span><span className="stat-card-body"><strong>{notes.length.toString().padStart(2,'0')}</strong><span>Notes collected</span></span><ArrowUpRight size={17} className="stat-arrow"/></button>
      <button className="stat-card" onClick={() => onNavigate('calendar')}><span className="stat-card-icon icon-mint"><CalendarDays size={19}/></span><span className="stat-card-body"><strong>{upcomingAll.length.toString().padStart(2,'0')}</strong><span>Upcoming events <small>(next 2 weeks)</small></span></span><ArrowUpRight size={17} className="stat-arrow"/></button>
      <button className="stat-card" onClick={() => onOpenDate(today)}><span className="stat-card-icon icon-peach"><Clock3 size={19}/></span><span className="stat-card-body"><strong>{todayEvents.length.toString().padStart(2,'0')}</strong><span>On today's agenda</span></span><ArrowUpRight size={17} className="stat-arrow"/></button>
    </div>
    <div className="home-panels">
      <section className="panel home-panel">
        <div className="panel-header"><div><span className="panel-kicker">A LITTLE AT A TIME</span><h3>Recent notes</h3></div><button className="text-action" onClick={() => onNavigate('notes')}>View all <ArrowRight size={15}/></button></div>
        {recent.length ? <div className="recent-notes">{recent.map((note, i) => <button className="recent-note" key={note.id} onClick={() => onOpenNote(note.id)}><span className={`recent-note-mark note-mark-${i%3}`}><FileText size={18}/></span><span className="recent-note-copy"><strong>{note.title || 'Untitled note'}</strong><small>{note.content.replace(/[#*`>\-[\]]/g,'').replace(/\s+/g,' ').trim().slice(0, 90) || 'A new thought, ready to grow...'}</small></span><ChevronRight size={17}/></button>)}</div> : <div className="empty-small">Your notes will appear here. <button onClick={onNewNote}>Write one now.</button></div>}
      </section>
      <section className="panel home-panel">
        <div className="panel-header"><div><span className="panel-kicker">LOOKING AHEAD</span><h3>Coming up</h3></div><button className="text-action" onClick={() => onNavigate('calendar')}>Calendar <ArrowRight size={15}/></button></div>
        {upcoming.length ? <div className="upcoming-events">{upcoming.map(event => <button key={event.id} className="upcoming-event" onClick={() => onOpenDate(parseISO(event.event_date))}><span className="event-date-stack"><strong>{format(parseISO(event.event_date), 'd')}</strong><small>{format(parseISO(event.event_date), 'MMM')}</small></span><span className={`event-color-line color-${eventColors[event.color] || 'purple'}`}/><span className="upcoming-copy"><strong>{event.title}</strong><small>{format(parseISO(event.event_date), 'EEEE')} · {eventShortTime(event)}</small></span><ChevronRight size={17}/></button>)}</div> : <div className="empty-small">Nothing coming up just yet. <button onClick={onNewEvent}>Add an event.</button></div>}
      </section>
    </div>
    <div className="home-footer-note">Made for quiet moments and clear minds. <span>✳</span></div>
  </div>
}
