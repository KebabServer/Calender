import { useEffect, useRef, useState } from 'react'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, List, Plus, Search } from 'lucide-react'
import { eventSearchDate, eventTimeLabel, occursOn } from '../lib/events'
import { LinkedText } from './TextLinks'
import type { CalendarEvent, Note } from '../types'

type Props = {
  month: Date
  onMonth: (day: Date) => void
  selectedDate: Date
  onSelectDate: (day: Date) => void
  events: CalendarEvent[]
  notes: Note[]
  agendaEnabled: boolean
  onCreate: (day: Date) => void
  onOpenEvent: (event: CalendarEvent) => void
  onOpenNote: (id: string) => void
}

const weekLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function EventList({ events, notes, onOpenEvent, onOpenNote }: Pick<Props, 'events' | 'notes' | 'onOpenEvent' | 'onOpenNote'>) {
  return <div className="day-event-list">
    {events.map(event => <div key={event.id} className={`day-event-item day-event-${event.color}`}>
      <span className={`event-color-line color-${event.color}`}/>
      <div className="day-event-content">
        <button className="day-event-main" onClick={() => onOpenEvent(event)}>
          <strong>{event.title}</strong>
          <span><Clock3 size={13}/> {eventTimeLabel(event)}{event.recurrence === 'weekly' ? ' · Weekly' : ''}</span>
        </button>
        {event.description && <p className="day-event-description"><LinkedText text={event.description}/></p>}
      </div>
      {event.note_id && notes.some(note => note.id === event.note_id) && (
        <button className="day-event-link" title="Open linked note" aria-label={`Open note linked to ${event.title}`} onClick={() => onOpenNote(event.note_id!)}>
          <FileText size={15}/>
        </button>
      )}
    </div>)}
  </div>
}

export function CalendarView({ month, onMonth, selectedDate, onSelectDate, events, notes, agendaEnabled, onCreate, onOpenEvent, onOpenNote }: Props) {
  const [showAgenda, setShowAgenda] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focusSchedule, setFocusSchedule] = useState(false)
  const searchButton = useRef<HTMLButtonElement>(null)
  const scheduleHeading = useRef<HTMLDivElement>(null)
  const agenda = agendaEnabled && showAgenda
  const today = startOfDay(new Date())
  const agendaEnd = addDays(today, 6)

  function dayEvents(day: Date) {
    return events.filter(event => occursOn(event, day)).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
  }

  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days = agenda ? [] : eachDayOfInterval({ start, end })
  const selectedEvents = agenda ? [] : dayEvents(selectedDate)
  const upcoming = agenda ? eachDayOfInterval({ start: today, end: agendaEnd })
    .map(day => ({ day, events: dayEvents(day) })).filter(group => group.events.length) : []

  const query = search.trim().toLowerCase()
  const matches = searchOpen && query ? events
    .filter(event => event.title.toLowerCase().includes(query) || event.description?.toLowerCase().includes(query))
    .map(event => ({ event, day: eventSearchDate(event, today) }))
    .sort((a, b) => {
      const aPast = a.day < today
      const bPast = b.day < today
      return Number(aPast) - Number(bPast) || (aPast ? b.day.getTime() - a.day.getTime() : a.day.getTime() - b.day.getTime())
        || (a.event.start_time || '').localeCompare(b.event.start_time || '')
    }) : []

  useEffect(() => {
    if (!focusSchedule) return
    scheduleHeading.current?.focus()
    setFocusSchedule(false)
  }, [focusSchedule])

  function changeMonth(next: Date) {
    onMonth(next)
    onSelectDate(startOfMonth(next))
  }

  function selectDay(day: Date) {
    onSelectDate(day)
    if (!isSameMonth(day, month)) onMonth(day)
  }

  function closeSearch() {
    setSearchOpen(false)
    setSearch('')
  }

  function jumpToDay(day: Date) {
    selectDay(day)
    setShowAgenda(false)
    closeSearch()
    setFocusSchedule(true)
  }

  return <div className="page calendar-view">
    <div className={`calendar-workspace${agenda ? ' calendar-workspace-agenda' : ''}`}>
      <div className="calendar-main panel">
        <div className="calendar-controls">
          <div className="calendar-month-heading">
            <button className="button primary calendar-add-event" onClick={() => onCreate(agenda ? today : selectedDate)} aria-label="Add event" title="Add event"><Plus size={17}/></button>
            <h2 title={agenda ? undefined : format(month, 'MMMM yyyy')}>{agenda ? 'Next 7 days' : format(month, 'MMM yyyy')}</h2>
          </div>
          <div className="calendar-control-buttons">
            <button ref={searchButton} className="icon-button calendar-tool" aria-label="Search calendar" title="Search calendar" aria-expanded={searchOpen} aria-controls={searchOpen ? 'calendar-search' : undefined} onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}><Search size={17}/></button>
            {agendaEnabled && <button className="icon-button calendar-tool" aria-label="Next 7 days" aria-pressed={agenda} title={agenda ? 'Show month' : 'Next 7 days'} onClick={() => setShowAgenda(current => !current)}>{agenda ? <CalendarDays size={17}/> : <List size={17}/>}</button>}
            {!agenda && <>
              <button className="today-button" onClick={() => { onMonth(today); onSelectDate(today) }}>Today</button>
              <button className="icon-button" onClick={() => changeMonth(subMonths(month, 1))} aria-label="Previous month"><ChevronLeft size={19}/></button>
              <button className="icon-button" onClick={() => changeMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight size={19}/></button>
            </>}
          </div>
        </div>
        {searchOpen && <div id="calendar-search" className="calendar-search" onKeyDown={event => {
          if (event.key === 'Escape') { closeSearch(); searchButton.current?.focus() }
        }}>
          <label className="search-input">
            <Search size={16} aria-hidden="true"/>
            <input type="search" autoFocus aria-label="Search events" placeholder="Search events…" value={search} onChange={event => setSearch(event.target.value)}/>
          </label>
          {query && (matches.length ? (
            <ul className="calendar-search-results" aria-label="Matching events">
              {matches.map(({ event, day }) => <li key={event.id}>
                <button onClick={() => jumpToDay(day)}>
                  <strong>{event.title}</strong><span>{format(day, 'MMM d, yyyy')} · {eventTimeLabel(event)}</span>
                </button>
              </li>)}
            </ul>
          ) : <p role="status">No matching events.</p>)}
        </div>}
        {agenda ? <div className="calendar-upcoming">
          <p className="calendar-upcoming-range">{format(today, 'MMM d')} – {format(agendaEnd, 'MMM d')}</p>
          {upcoming.length ? upcoming.map(group => <section key={group.day.toISOString()} className="calendar-upcoming-day">
            <h3><button onClick={() => jumpToDay(group.day)} title="Show day in calendar">{format(group.day, 'EEE, MMM d')}</button></h3>
            <EventList events={group.events} notes={notes} onOpenEvent={onOpenEvent} onOpenNote={onOpenNote}/>
          </section>) : <div className="day-empty"><p>No events in the next 7 days.</p></div>}
        </div> : <div className="calendar-grid">
          {weekLabels.map(day => <div className="cal-week-label" key={day}>{day}</div>)}
          {days.map(day => {
            const dayItems = dayEvents(day)
            return <button key={day.toISOString()} className={`calendar-day ${!isSameMonth(day, month) ? 'outside-month' : ''} ${isSameDay(day, selectedDate) ? 'selected-day' : ''}`} onClick={() => selectDay(day)} aria-pressed={isSameDay(day, selectedDate)} aria-label={`${format(day, 'EEEE, MMMM d, yyyy')}: ${dayItems.length} events`}>
              <span className={`calendar-date-number ${isToday(day) ? 'today-date' : ''}`}>{format(day, 'd')}</span>
              <div className="calendar-day-events">
                {dayItems.slice(0, 3).map(event => <span key={event.id} className={`calendar-event-pill color-${event.color}`} title={`${event.title} · ${eventTimeLabel(event)}${event.recurrence === 'weekly' ? ' · Weekly' : ''}`}>
                  <span className="pill-dot"/>
                  <span className="calendar-event-copy"><span className="calendar-event-title">{event.title}</span><span className="calendar-event-time">{eventTimeLabel(event)}</span></span>
                </span>)}
                {dayItems.length > 3 && <span className="calendar-more">+{dayItems.length - 3} more</span>}
              </div>
            </button>
          })}
        </div>}
      </div>
      {!agenda && <aside className="calendar-day-panel panel">
        <div className="day-panel-header"><div className="day-title"><strong title={format(selectedDate, 'EEEE')}>{format(selectedDate, 'EEE')}</strong><span>{format(selectedDate, 'MMM d, yyyy')}</span></div></div>
        <div className="day-agenda-heading" tabIndex={-1} ref={scheduleHeading}><strong>Schedule</strong><span>{selectedEvents.length} {selectedEvents.length === 1 ? 'event' : 'events'}</span></div>
        {selectedEvents.length ? <EventList events={selectedEvents} notes={notes} onOpenEvent={onOpenEvent} onOpenNote={onOpenNote}/> : <div className="day-empty"><p>No events</p></div>}
        <button className="day-add-button" onClick={() => onCreate(selectedDate)}><Plus size={17}/> Add an event</button>
      </aside>}
    </div>
  </div>
}
