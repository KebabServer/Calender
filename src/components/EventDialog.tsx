import { addWeeks, format, parseISO } from 'date-fns'
import { useEffect, useState } from 'react'
import { CalendarDays, Link2, Trash2, X } from 'lucide-react'
import { durationMinutes, durationLabel, endTimeForDuration } from '../lib/events'
import type { CalendarEvent, EventInput, Note } from '../types'

type Props = {
  event: CalendarEvent | null; date: string; notes: Note[]; onClose: () => void
  onSave: (input: EventInput, id?: string, copyCount?: number) => Promise<void>
  onDelete: (id: string) => Promise<void>
}
const durations = [15, 30, 45, 60, 90, 120, 180, 240]
const colors = [{ id: 'purple', label: 'Lavender' }, { id: 'mint', label: 'Mint' }, { id: 'peach', label: 'Peach' }, { id: 'blue', label: 'Blue' }]
export function EventDialog({ event, date, notes, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [eventDate, setEventDate] = useState(event?.event_date ?? date)
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [start, setStart] = useState(event?.start_time?.slice(0,5) ?? '09:00')
  const initialDuration = event && !event.all_day ? durationMinutes(event) : 60
  const [duration, setDuration] = useState(initialDuration === null ? 'unknown' : durations.includes(initialDuration) ? String(initialDuration) : 'custom')
  const [customDuration, setCustomDuration] = useState(String(initialDuration ?? 60))
  const [color, setColor] = useState(event?.color ?? 'purple')
  const [noteId, setNoteId] = useState(event?.note_id ?? '')
  const [clone, setClone] = useState(false)
  const [copyCount, setCopyCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const legacySeries = event?.recurrence === 'weekly'
  useEffect(() => {
    const closeOnEscape = (e: KeyboardEvent) => { if (!busy && e.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, busy])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!title.trim()) { setError('Give this event a name.'); return }
    if (clone && (!Number.isInteger(copyCount) || copyCount < 1 || copyCount > 10)) { setError('Choose between 1 and 10 copies.'); return }
    setBusy(true); setError('')
    try {
      const minutes = duration === 'unknown' ? null : Number(duration === 'custom' ? customDuration : duration)
      const end = allDay ? null : endTimeForDuration(start, minutes)
      await onSave({ title: title.trim(), description: description.trim(), event_date: eventDate,
        all_day: allDay, start_time: allDay ? null : start, end_time: allDay ? null : end,
        color, note_id: noteId || null, recurrence: legacySeries && !clone ? 'weekly' : 'none',
        repeat_until: legacySeries && !clone ? event?.repeat_until ?? null : null,
      }, event?.id, clone ? copyCount : 0)
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the event') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!event || busy || !window.confirm(legacySeries ? `Delete every occurrence of “${event.title}”?` : `Delete “${event.title}”?`)) return
    setBusy(true)
    try { await onDelete(event.id); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete the event'); setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (!busy && e.target === e.currentTarget) onClose() }}>
    <div className="event-dialog" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
      <div className="dialog-top"><span className="dialog-top-icon"><CalendarDays size={20}/></span><h2 id="event-dialog-title">{event ? 'Edit event' : 'New event'}</h2><button className="icon-button dialog-close" disabled={busy} onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div>
      <form onSubmit={submit} className="dialog-form">
        <label className="field-label">Event title<input autoFocus required value={title} onChange={e => setTitle(e.target.value)} maxLength={140}/></label>
        <label className="field-label">Date<input type="date" required value={eventDate} onChange={e => setEventDate(e.target.value)}/></label>
        <label className="checkbox-row"><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}/><span>All-day event</span></label>
        {!allDay && <div className="field-two"><label className="field-label">Start time<input type="time" required value={start} onChange={e => setStart(e.target.value)}/></label><label className="field-label">Duration<select aria-label="Duration" value={duration} onChange={e => setDuration(e.target.value)}><option value="unknown">? Unknown</option>{durations.map(minutes => <option key={minutes} value={minutes}>{durationLabel(minutes)}</option>)}<option value="custom">Custom…</option></select></label></div>}
        {!allDay && duration === 'custom' && <label className="field-label">Duration in minutes<input type="number" min={1} max={1440} step={1} required value={customDuration} onChange={e => setCustomDuration(e.target.value)}/></label>}
        {legacySeries && <p className="repeat-summary">This is an older weekly series. It keeps repeating unless you convert it below.</p>}
        <label className="checkbox-row"><input type="checkbox" checked={clone} disabled={busy} onChange={e => setClone(e.target.checked)}/><span>{legacySeries ? 'Convert to independent weekly copies' : 'Clone to future weeks'}</span></label>
        {clone && <>
          <label className="field-label">Future copies<select aria-label="Future copies" value={copyCount} disabled={busy} onChange={e => setCopyCount(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? 'copy' : 'copies'}</option>)}</select></label>
          <p className="repeat-summary">{legacySeries ? 'Replaces the entire series with' : 'Saves'} this event plus {copyCount} independent {copyCount === 1 ? 'copy' : 'copies'}, one per week{eventDate ? ` through ${format(addWeeks(parseISO(eventDate), copyCount), 'MMM d, yyyy')}` : ''}. Each can be edited or deleted separately.</p>
        </>}
        <label className="field-label">Description <span className="field-optional">optional</span><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}/></label>
        <div className="field-label">Event color<div className="color-choices">{colors.map(c => <button type="button" key={c.id} title={c.label} className={`color-choice color-${c.id} ${color === c.id ? 'selected' : ''}`} onClick={() => setColor(c.id)} aria-label={c.label} aria-pressed={color === c.id}>{color === c.id ? '✓' : ''}</button>)}</div></div>
        <label className="field-label">Link a note <span className="field-optional">optional</span><div className="select-wrap"><Link2 size={16}/><select value={noteId} onChange={e => setNoteId(e.target.value)}><option value="">No linked note</option>{notes.map(n => <option key={n.id} value={n.id}>{n.title || 'Untitled note'}</option>)}</select></div></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions">{event && <button type="button" className="button danger-quiet" disabled={busy} onClick={remove}><Trash2 size={17}/>{legacySeries ? 'Delete series' : 'Delete'}</button>}<div className="dialog-action-spacer"/><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={busy}>{busy ? 'Saving...' : clone ? legacySeries ? 'Convert & save' : 'Save & clone' : event ? 'Save changes' : 'Create event'}</button></div>
      </form>
    </div>
  </div>
}
