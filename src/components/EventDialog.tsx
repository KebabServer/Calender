import { format, parseISO } from 'date-fns'
import { useEffect, useState } from 'react'
import { CalendarDays, Link2, Trash2, X } from 'lucide-react'
import type { CalendarEvent, EventInput, Note } from '../types'

type Props = { event: CalendarEvent | null; date: string; notes: Note[]; onClose: () => void; onSave: (input: EventInput, id?: string) => Promise<void>; onDelete: (id: string) => Promise<void> }
const colors = [{ id: 'purple', label: 'Lavender' }, { id: 'mint', label: 'Mint' }, { id: 'peach', label: 'Peach' }, { id: 'blue', label: 'Blue' }]
export function EventDialog({ event, date, notes, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [eventDate, setEventDate] = useState(event?.event_date ?? date)
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [start, setStart] = useState(event?.start_time?.slice(0,5) ?? '09:00')
  const [end, setEnd] = useState(event?.end_time?.slice(0,5) ?? '10:00')
  const [color, setColor] = useState(event?.color ?? 'purple')
  const [noteId, setNoteId] = useState(event?.note_id ?? '')
  const [recurrence, setRecurrence] = useState<'none' | 'weekly'>(event?.recurrence ?? 'none')
  const [repeatUntil, setRepeatUntil] = useState(event?.repeat_until ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Give this event a name.'); return }
    if (!allDay && end <= start) { setError('End time must be after start time.'); return }
    if (recurrence === 'weekly' && repeatUntil && repeatUntil < eventDate) { setError('Repeat end date must be on or after the start date.'); return }
    setBusy(true); setError('')
    try { await onSave({ title: title.trim(), description: description.trim(), event_date: eventDate, all_day: allDay, start_time: allDay ? null : start, end_time: allDay ? null : end, color, note_id: noteId || null, recurrence, repeat_until: recurrence === 'weekly' ? repeatUntil || null : null }, event?.id); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save the event') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!event || !window.confirm(event.recurrence === 'weekly' ? `Delete every occurrence of “${event.title}”?` : `Delete “${event.title}”?`)) return
    setBusy(true)
    try { await onDelete(event.id); onClose() } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete the event'); setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><div className="event-dialog" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title"><div className="dialog-top"><span className="dialog-top-icon"><CalendarDays size={20}/></span><div><h2 id="event-dialog-title">{event?.recurrence === 'weekly' ? 'Edit weekly series' : event ? 'Edit event' : 'New event'}</h2></div><button className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div><form onSubmit={submit} className="dialog-form"><label className="field-label">Event title<input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" maxLength={140}/></label><label className="field-label">{recurrence === 'weekly' ? 'First date' : 'Date'}<input type="date" required value={eventDate} onChange={e => setEventDate(e.target.value)}/></label><label className="checkbox-row"><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}/><span>All-day event</span></label>{!allDay && <div className="field-two"><label className="field-label">Start time<input type="time" required value={start} onChange={e => setStart(e.target.value)}/></label><label className="field-label">End time<input type="time" required value={end} onChange={e => setEnd(e.target.value)}/></label></div>}<label className="field-label">Repeat<select aria-label="Repeat" value={recurrence} onChange={e => setRecurrence(e.target.value as 'none' | 'weekly')}><option value="none">Does not repeat</option><option value="weekly">Every week</option></select></label>{recurrence === 'weekly' && <><label className="field-label">Repeat until <span className="field-optional">optional</span><input type="date" min={eventDate} value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)}/></label><p className="repeat-summary">Every {eventDate ? format(parseISO(eventDate), 'EEEE') : 'week'}{allDay ? ', all day' : `, ${start}–${end}`}. {repeatUntil ? `Through ${format(parseISO(repeatUntil), 'MMM d, yyyy')}.` : 'No end date.'} {event ? 'Changes apply to the entire series.' : ''}</p></>}{event?.recurrence === 'weekly' && recurrence === 'none' && <p className="repeat-summary">This replaces the whole weekly series with one event on the date above.</p>}<label className="field-label">Description <span className="field-optional">optional</span><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Add some details..."/></label><div className="field-label">Event color<div className="color-choices">{colors.map(c => <button type="button" key={c.id} title={c.label} className={`color-choice color-${c.id} ${color === c.id ? 'selected' : ''}`} onClick={() => setColor(c.id)} aria-label={c.label} aria-pressed={color === c.id}>{color === c.id ? '✓' : ''}</button>)}</div></div><label className="field-label">Link a note <span className="field-optional">optional</span><div className="select-wrap"><Link2 size={16}/><select value={noteId} onChange={e => setNoteId(e.target.value)}><option value="">No linked note</option>{notes.map(n => <option key={n.id} value={n.id}>{n.title || 'Untitled note'}</option>)}</select></div></label>{error && <div className="form-error" role="alert">{error}</div>}<div className="dialog-actions">{event && <button type="button" className="button danger-quiet" disabled={busy} onClick={remove}><Trash2 size={17}/> {event.recurrence === 'weekly' ? 'Delete series' : 'Delete'}</button>}<div className="dialog-action-spacer"/><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={busy}>{busy ? 'Saving...' : event ? 'Save changes' : 'Create event'}</button></div></form></div></div>
}
