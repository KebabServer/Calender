import { CalendarDays, NotebookPen, Settings2 } from 'lucide-react'
import type { View } from '../types'

type Props = {
  active: View
  onNavigate: (view: View) => void
  onOpenSettings: () => void
}

export function Sidebar({ active, onNavigate, onOpenSettings }: Props) {
  return <header className="workspace-header">
    <button className="workspace-brand" onClick={() => onNavigate('calendar')} aria-label="Daymark calendar">Daymark</button>
    <nav className="workspace-tabs" aria-label="Main navigation">
      <button aria-current={active === 'calendar' ? 'page' : undefined} onClick={() => onNavigate('calendar')}><CalendarDays size={17}/>Calendar</button>
      <button aria-current={active === 'notes' ? 'page' : undefined} onClick={() => onNavigate('notes')}><NotebookPen size={17}/>Notes</button>
    </nav>
    <button className="icon-button" aria-label="Settings" onClick={onOpenSettings}><Settings2 size={20}/></button>
  </header>
}
